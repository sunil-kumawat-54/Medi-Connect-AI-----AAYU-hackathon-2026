-- ============================================================================
-- Medi Connect AI — Comprehensive Automated RLS & Security Verification Suite
-- File: supabase/tests/rls_test.sql
-- Description: Executes real role-based RLS tests using SET LOCAL ROLE authenticated
--              and SET LOCAL "request.jwt.claims". Confirms non-trivial passing,
--              prints current_user, tests scope enforcement, expiry, revocation,
--              storage object access across patients, and audit log spoofing resistance.
--              Resides in isolated 'tests' schema with zero grants to anon/authenticated.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tests;
REVOKE ALL ON SCHEMA tests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION tests.run_rls_test_suite()
RETURNS TABLE(test_num INT, test_name TEXT, acting_role TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_count INT;
    v_total_b_reports INT;
    v_err_caught BOOLEAN;
    v_err_msg TEXT;
BEGIN
    -- Ensure Patient B has a report so cross-tenant tests are strictly non-trivial
    SELECT COUNT(*) INTO v_total_b_reports FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    IF v_total_b_reports = 0 THEN
        INSERT INTO public.medical_reports (
            id, patient_id, title, lab_name, report_date, category, 
            file_path, file_type, file_size_bytes, processing_status, ocr_confidence
        ) VALUES (
            'f0000000-0000-0000-0000-000000000002',
            'a0000000-0000-0000-0000-000000000002',
            'Patient B Confidential Lipid Panel (DEMO)',
            'City Lab',
            CURRENT_DATE - INTERVAL '5 days',
            'Biochemistry',
            'a0000000-0000-0000-0000-000000000002/confidential_b.pdf',
            'application/pdf',
            1048576,
            'COMPLETED',
            98.00
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Ensure test storage objects exist
    INSERT INTO storage.objects (id, bucket_id, name, owner, created_at)
    VALUES 
        ('f7000000-0000-0000-0000-000000000001', 'patient-medical-documents', 'a0000000-0000-0000-0000-000000000001/doc_a.pdf', 'a0000000-0000-0000-0000-000000000001', NOW()),
        ('f7000000-0000-0000-0000-000000000002', 'patient-medical-documents', 'a0000000-0000-0000-0000-000000000002/doc_b.pdf', 'a0000000-0000-0000-0000-000000000002', NOW())
    ON CONFLICT (id) DO NOTHING;

    -- 1. Test 1: Patient A reads own reports
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 1; test_name := 'Patient A reads own reports'; acting_role := current_user;
    status := CASE WHEN v_count >= 1 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s report rows (Self-access permitted)', v_count);
    RETURN NEXT;

    -- 2. Test 2: Patient A attempts reading Patient B reports
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 2; test_name := 'Patient A attempts reading Patient B reports'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied cross-tenant access (%s rows returned). Patient B reports exist: YES', v_count);
    RETURN NEXT;

    -- 3. Test 3: Patient A attempts modifying profiles.role to doctor
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.profiles SET role = 'doctor' WHERE id = 'a0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 3; test_name := 'Patient A attempts modifying profiles.role to doctor'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Role mutation blocked by trigger: %s', v_err_msg);
    RETURN NEXT;

    -- 4. Test 4: Doctor Alex reads Patient A reports with ACTIVE consent
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 4; test_name := 'Doctor Alex reads Patient A reports with ACTIVE consent'; acting_role := current_user;
    status := CASE WHEN v_count >= 1 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s report rows under active consent', v_count);
    RETURN NEXT;

    -- 5. Test 5: Doctor Alex attempts reading Patient B reports without consent
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 5; test_name := 'Doctor Alex attempts reading Patient B reports without consent'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied unconsented access (%s rows returned). Patient B reports exist: YES', v_count);
    RETURN NEXT;

    -- 6. Test 6: Scope Enforcement: Doctor reads ai_summaries without ai_summary scope
    RESET ROLE;
    UPDATE public.patient_consents SET scopes = ARRAY['reports', 'timeline', 'prescriptions'] WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.ai_summaries WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 6; test_name := 'Scope Enforcement: Doctor reads ai_summaries without ai_summary scope'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access to ai_summaries when scope excluded (%s rows returned)', v_count);
    RETURN NEXT;

    RESET ROLE;
    UPDATE public.patient_consents SET scopes = ARRAY['reports', 'timeline', 'ai_summary', 'prescriptions'] WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- 7. Test 7: Immediate Expiry: Doctor reads Patient A reports with EXPIRED consent
    RESET ROLE;
    UPDATE public.patient_consents SET valid_until = NOW() - INTERVAL '1 hour' WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 7; test_name := 'Immediate Expiry: Doctor reads Patient A reports with EXPIRED consent'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access with expired consent (%s rows returned)', v_count);
    RETURN NEXT;

    -- 8. Test 8: Immediate Revocation: Doctor reads Patient A reports with REVOKED consent
    RESET ROLE;
    UPDATE public.patient_consents SET valid_until = NOW() + INTERVAL '30 days', status = 'REVOKED', revoked_at = NOW() WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 8; test_name := 'Immediate Revocation: Doctor reads Patient A reports with REVOKED consent'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access with revoked consent (%s rows returned)', v_count);
    RETURN NEXT;

    RESET ROLE;
    UPDATE public.patient_consents SET valid_until = NOW() + INTERVAL '30 days', status = 'ACTIVE', revoked_at = NULL WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- 9. Test 9: Storage RLS: Patient A attempts reading Patient B file from bucket
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND name LIKE 'a0000000-0000-0000-0000-000000000002/%';
    test_num := 9; test_name := 'Storage RLS: Patient A attempts reading Patient B file from bucket'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient storage read denied (%s rows returned)', v_count);
    RETURN NEXT;

    -- 10. Test 10: Audit Tamper Resistance: Authenticated client attempts DELETE audit_logs
    v_err_caught := FALSE;
    BEGIN
        DELETE FROM public.audit_logs;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 10; test_name := 'Audit Tamper Resistance: Authenticated client attempts DELETE audit_logs'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('DELETE strictly blocked by statement trigger: %s', v_err_msg);
    RETURN NEXT;

    -- 11. Test 11: Audit Impersonation Resistance: Patient A attempts inserting audit log attributing action to Patient B
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.audit_logs (user_hash, role, action, resource_type, resource_hash, status)
        VALUES (
            public.hash_audit_identifier('a0000000-0000-0000-0000-000000000002'),
            'patient',
            'SPOOFED_ACTION',
            'medical_reports',
            public.hash_audit_identifier('b0000000-0000-0000-0000-000000000001'),
            'SUCCESS'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 11; test_name := 'Audit Impersonation Resistance: Client cannot attribute log to another user'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Impersonation blocked by RLS WITH CHECK: %s', v_err_msg);
    RETURN NEXT;

    RESET ROLE;
END;
$$;

SELECT test_num, test_name, acting_role, status, detail FROM tests.run_rls_test_suite() ORDER BY test_num;
