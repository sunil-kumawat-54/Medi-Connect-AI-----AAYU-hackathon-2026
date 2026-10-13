-- ============================================================================
-- Migration: 20261012000009_doctor_approval_and_write_abuse_tests.sql
-- Description:
--   1. Moves doctor review/sign-off into a hardened SECURITY DEFINER database function
--      public.approve_ai_summary(), verifying active consent with 'ai_summary' scope,
--      refusing approval while red-flag biomarkers remain unverified, and writing audit logs server-side.
--   2. Revokes direct UPDATE on public.ai_summaries from client roles (RLS & Grants).
--   3. Implements k-anonymity aggregate query function public.get_deidentified_cohort_stats().
--   4. Adds write-path abuse assertions to tests.run_rls_test_suite() (Tests 19 to 28).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REVOKE DIRECT CLIENT UPDATE ON AI_SUMMARIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ai_summaries_doctor_update_review" ON public.ai_summaries;
REVOKE UPDATE ON public.ai_summaries FROM authenticated, anon, PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. HARDENED DOCTOR APPROVAL FUNCTION (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_ai_summary(
    p_summary_id UUID,
    p_decision public.summary_review_status,
    p_doctor_notes TEXT DEFAULT NULL,
    p_confirm_red_flags_verified BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_doctor_id UUID;
    v_summary RECORD;
    v_has_red_flags BOOLEAN := FALSE;
    v_review_id UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    -- Verify caller is an authorized doctor
    SELECT d.id INTO v_doctor_id
    FROM public.doctors d
    JOIN public.profiles p ON p.id = d.profile_id
    WHERE d.profile_id = v_uid AND p.role = 'doctor'::public.user_role;

    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Caller is not an authorized physician.';
    END IF;

    -- Look up target AI summary
    SELECT * INTO v_summary FROM public.ai_summaries WHERE id = p_summary_id;
    IF v_summary.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: AI summary does not exist.';
    END IF;

    -- Verify active patient consent with 'ai_summary' scope
    IF NOT public.doctor_has_active_consent(v_summary.patient_id, 'ai_summary', v_summary.created_at) THEN
        RAISE EXCEPTION 'CONSENT DENIED: Doctor does not hold active consent with ai_summary scope.';
    END IF;

    -- Enforce spec rule: Approval is refused while red-flag biomarkers remain unverified
    IF p_decision = 'APPROVED'::public.summary_review_status THEN
        SELECT EXISTS (
            SELECT 1 FROM public.biomarkers 
            WHERE report_id = v_summary.report_id AND severity = 'CRITICAL'::public.biomarker_severity
        ) OR (jsonb_array_length(COALESCE(v_summary.red_flags_json, '[]'::jsonb)) > 0)
        INTO v_has_red_flags;

        IF v_has_red_flags AND NOT p_confirm_red_flags_verified THEN
            RAISE EXCEPTION 'APPROVAL REFUSED: Critical red-flag biomarkers remain unverified. Verification confirmation required.';
        END IF;
    END IF;

    -- Insert into doctor_reviews table
    INSERT INTO public.doctor_reviews (
        summary_id,
        doctor_id,
        decision,
        clinical_notes,
        signed_at
    ) VALUES (
        p_summary_id,
        v_doctor_id,
        p_decision,
        p_doctor_notes,
        NOW()
    ) RETURNING id INTO v_review_id;

    -- Update summary record directly inside SECURITY DEFINER
    UPDATE public.ai_summaries
    SET review_status = p_decision,
        reviewed_by_doctor_id = v_doctor_id,
        doctor_notes = p_doctor_notes,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_summary_id;

    -- Write audit event server-side
    INSERT INTO public.audit_logs (
        user_hash,
        role,
        action,
        resource_type,
        resource_hash,
        status,
        metadata
    ) VALUES (
        public.hash_audit_identifier(v_uid::text),
        'doctor'::public.user_role,
        CASE 
            WHEN p_decision = 'APPROVED' THEN 'SUMMARY_APPROVE'
            WHEN p_decision = 'REJECTED' THEN 'SUMMARY_REJECT'
            ELSE 'SUMMARY_EDIT'
        END,
        'ai_summaries',
        public.hash_audit_identifier(p_summary_id::text),
        'SUCCESS',
        jsonb_build_object(
            'client_version', 'v1.0-secure',
            'session_id', v_review_id::text
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'decision', p_decision::text,
        'summary_id', p_summary_id,
        'review_id', v_review_id,
        'reviewed_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_ai_summary(UUID, public.summary_review_status, TEXT, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_ai_summary(UUID, public.summary_review_status, TEXT, BOOLEAN) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 3. K-ANONYMITY ENFORCEMENT FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_deidentified_cohort_stats(p_category TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_count INT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
    IF v_role != 'super_admin'::public.user_role THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Strictly accessible by super_admin role.';
    END IF;

    IF p_category IS NULL THEN
        SELECT COUNT(*) INTO v_count FROM public.medical_reports;
    ELSE
        SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE category = p_category;
    END IF;

    -- Enforce k-anonymity threshold (cohort < 10 suppressed)
    IF v_count < 10 THEN
        RETURN jsonb_build_object(
            'status', 'SUPPRESSED',
            'k_anonymity_threshold', 10,
            'count', NULL,
            'message', 'Cohort sample size is under 10; suppressed to guarantee patient anonymity under DPDPA.'
        );
    ELSE
        RETURN jsonb_build_object(
            'status', 'PERMITTED',
            'k_anonymity_threshold', 10,
            'count', v_count,
            'message', 'Cohort meets k-anonymity compliance threshold.'
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deidentified_cohort_stats(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_deidentified_cohort_stats(TEXT) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 4. HARDEN WRITE PATH RLS POLICIES FOR DOSES, CONSENTS, AND APPOINTMENTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "dose_logs_all_patient" ON public.medication_dose_logs;
CREATE POLICY "dose_logs_all_patient"
ON public.medication_dose_logs FOR ALL TO authenticated
USING (patient_id = (SELECT auth.uid()))
WITH CHECK (patient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "consents_update_patient" ON public.patient_consents;
CREATE POLICY "consents_update_patient"
ON public.patient_consents FOR UPDATE TO authenticated
USING (patient_id = (SELECT auth.uid()))
WITH CHECK (patient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "consents_insert_patient" ON public.patient_consents;
CREATE POLICY "consents_insert_patient"
ON public.patient_consents FOR INSERT TO authenticated
WITH CHECK (patient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "appointments_insert_patient" ON public.appointments;
CREATE POLICY "appointments_insert_patient"
ON public.appointments FOR INSERT TO authenticated
WITH CHECK (patient_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. COMPREHENSIVE RLS & WRITE-PATH ABUSE TEST SUITE (28 ASSERTIONS)
-- ----------------------------------------------------------------------------
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
    v_json_res JSONB;
BEGIN
    -- Ensure Patient B has a report
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

    -- 11. Test 11: Direct audit_logs INSERT blocked for client roles
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.audit_logs (user_hash, role, action, resource_type, status)
        VALUES (
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'patient',
            'SPOOFED_ACTION',
            'medical_reports',
            'SUCCESS'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 11; test_name := 'Direct audit_logs INSERT blocked for client roles'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 12. Test 12: Doctor write-block on patient medical_reports
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.medical_reports (
            patient_id, title, lab_name, report_date, category, file_path, file_type, file_size_bytes
        ) VALUES (
            'a0000000-0000-0000-0000-000000000001', 'Doctor Forged Report', 'Fake Lab', CURRENT_DATE, 'Pathology', 'p/f.pdf', 'pdf', 100
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 12; test_name := 'Doctor write-block on patient medical_reports'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor INSERT blocked by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 13. Test 13: Hospital staff cross-hospital appointment isolation
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.appointments WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    test_num := 13; test_name := 'Hospital staff cross-hospital appointment isolation'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Staff 1 denied reading Hospital 2 appointments (%s rows returned)', v_count);
    RETURN NEXT;

    -- 14. Test 14: Hospital staff cross-hospital bills isolation
    SELECT COUNT(*) INTO v_count FROM public.bills WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    test_num := 14; test_name := 'Hospital staff cross-hospital bills isolation'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Staff 1 denied reading Hospital 2 bills (%s rows returned)', v_count);
    RETURN NEXT;

    -- 15. Test 15: Anon role denied across all public tables
    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM public.medical_reports;
    test_num := 15; test_name := 'Anon role denied reading public medical_reports'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Anon access denied (%s rows returned)', v_count);
    RETURN NEXT;

    -- 16. Test 16: Anon role denied reading storage objects
    SELECT COUNT(*) INTO v_count FROM storage.objects;
    test_num := 16; test_name := 'Anon role denied reading storage objects'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Anon storage read denied (%s rows returned)', v_count);
    RETURN NEXT;

    -- 17. Test 17: Super admin excluded from raw clinical reports (SELECT denied)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports;
    test_num := 17; test_name := 'Super admin excluded from raw clinical reports (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading medical_reports (%s rows returned)', v_count);
    RETURN NEXT;

    -- 18. Test 18: Super admin excluded from raw biomarkers (SELECT denied)
    SELECT COUNT(*) INTO v_count FROM public.biomarkers;
    test_num := 18; test_name := 'Super admin excluded from raw biomarkers (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading biomarkers (%s rows returned)', v_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- NEW WRITE-PATH ABUSE & APPROVAL TESTS (TESTS 19 TO 28)
    -- ------------------------------------------------------------------------

    -- 19. Test 19: Patient cannot set own summary to approved (direct UPDATE denied by RLS/Grants)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.ai_summaries 
        SET review_status = 'APPROVED'::public.summary_review_status 
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
            v_err_caught := FALSE;
        ELSE
            -- 0 rows updated means denied by RLS
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct UPDATE on ai_summaries (0 rows updated)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 19; test_name := 'Patient cannot set own summary to approved via direct UPDATE'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct UPDATE blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 20. Test 20: Patient calling approve_ai_summary is denied (Caller not doctor)
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000001',
            'APPROVED'::public.summary_review_status,
            'Patient self-approval spoof'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 20; test_name := 'Patient calling approve_ai_summary RPC is denied'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('RPC access rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 21. Test 21: Doctor without consent cannot approve summary
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    -- Summary on Patient B has NO consent for Doctor Alex
    -- Ensure Patient B summary exists
    RESET ROLE;
    INSERT INTO public.ai_summaries (
        id, report_id, patient_id, version, summary_type, content_markdown, review_status
    ) VALUES (
        'f2000000-0000-0000-0000-000000000002',
        'f0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000002',
        1, 'PATIENT_PLAIN_LANGUAGE', 'Unconsented Patient B Summary', 'DRAFT'
    ) ON CONFLICT (id) DO NOTHING;

    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000002',
            'APPROVED'::public.summary_review_status,
            'Doctor approving without consent'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 21; test_name := 'Doctor without consent cannot approve summary'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Unconsented approval rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 22. Test 22: Doctor with revoked/expired consent cannot approve summary
    RESET ROLE;
    UPDATE public.patient_consents SET status = 'REVOKED', revoked_at = NOW() WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000001',
            'APPROVED'::public.summary_review_status,
            'Doctor approving after revocation'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 22; test_name := 'Doctor with revoked consent cannot approve summary'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Revoked approval rejected: %s', v_err_msg);
    RETURN NEXT;

    RESET ROLE;
    UPDATE public.patient_consents SET status = 'ACTIVE', revoked_at = NULL WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- 23. Test 23: Patient A cannot log doses for Patient B medications
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    -- Create medication for Patient B
    RESET ROLE;
    INSERT INTO public.medications (id, patient_id, name, dosage, frequency, food_timing, start_date)
    VALUES ('f8000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Insulin', '10U', 'Daily', 'BEFORE_FOOD', CURRENT_DATE)
    ON CONFLICT (id) DO NOTHING;

    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.medication_dose_logs (medication_id, patient_id, scheduled_at, status)
        VALUES ('f8000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', NOW(), 'TAKEN');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 23; test_name := 'Patient A cannot log doses for Patient B medications'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient dose logging blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 24. Test 24: Patient A cannot revoke Patient B consent
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.patient_consents 
        SET status = 'REVOKED', revoked_at = NOW()
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
            v_err_caught := FALSE;
        ELSE
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied cross-patient consent update (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 24; test_name := 'Patient A cannot revoke Patient B consent'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient consent mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 25. Test 25: Patient A cannot create appointment for Patient B
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, start_time, status)
        VALUES ('a0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE + 2, '11:00:00', 'REQUESTED');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 25; test_name := 'Patient A cannot create appointment for Patient B'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient appointment creation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 26. Test 26: k-Anonymity enforcement: Cohort under 10 is suppressed
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    -- Query stats for 'Biochemistry' (which has 2 rows in seed, < 10 threshold)
    SELECT public.get_deidentified_cohort_stats('Biochemistry') INTO v_json_res;
    test_num := 26; test_name := 'k-Anonymity enforcement: Cohort under 10 is suppressed'; acting_role := current_user;
    status := CASE WHEN (v_json_res->>'status') = 'SUPPRESSED' AND (v_json_res->>'count') IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cohort size < 10 suppressed: status=%s, detail=%s', v_json_res->>'status', v_json_res->>'message');
    RETURN NEXT;

    -- 27. Test 27: Spec Rule: Doctor approval refused while red-flag biomarkers remain unverified
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000001',
            'APPROVED'::public.summary_review_status,
            'Approving without verifying red flags',
            FALSE -- p_confirm_red_flags_verified is FALSE
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 27; test_name := 'Spec Rule: Doctor approval refused while red-flag biomarkers unverified'; acting_role := current_user;
    status := CASE WHEN v_err_caught AND v_err_msg LIKE '%APPROVAL REFUSED%' THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Refusal enforced: %s', v_err_msg);
    RETURN NEXT;

    -- 28. Test 28: Positive Control: Doctor approval succeeds when red-flag biomarkers are verified
    v_err_caught := FALSE;
    BEGIN
        SELECT public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000001',
            'APPROVED'::public.summary_review_status,
            'Verified red-flag biomarkers and discussed Metformin titration with patient.',
            TRUE -- p_confirm_red_flags_verified is TRUE
        ) INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 28; test_name := 'Positive Control: Doctor approval succeeds with verification confirmation'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'success')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Approval accepted: decision=%s, review_id=%s', v_json_res->>'decision', v_json_res->>'review_id');
    RETURN NEXT;

    RESET ROLE;
END;
$$;
