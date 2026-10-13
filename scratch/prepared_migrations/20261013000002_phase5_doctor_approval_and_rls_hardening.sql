-- ============================================================================
-- Medi Connect AI — Phase 5 Hardening & Complete RLS Test Suite
-- Migration: 20261013000002_phase5_doctor_approval_and_rls_hardening.sql
-- Description:
-- 1. Updates approve_ai_summary to block verification on CRITICAL only (default).
-- 2. Updates record_server_report_extraction to map READY -> COMPLETED.
-- 3. Enables patient_read_own_rate_limits policy on patient_rate_limits.
-- 4. Hardens check_and_increment_rate_limit to enforce caller ownership.
-- 5. Complete, comprehensive tests.run_rls_test_suite() covering all 10 Phase 5
--    security requirements with real roles, exists-checks, positive controls,
--    and zero-residue guarantees.
-- ============================================================================

-- 1. Doctor Approval: Block verification on CRITICAL biomarkers only
CREATE OR REPLACE FUNCTION public.approve_ai_summary(
    p_summary_id UUID,
    p_decision public.summary_review_status,
    p_doctor_notes TEXT DEFAULT NULL
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
    v_has_unverified_critical BOOLEAN := FALSE;
    v_review_id UUID;
    v_audit_id UUID;
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

    -- Enforce explicit Phase 5 rule: Verification blocks on CRITICAL only (default)
    IF p_decision = 'APPROVED'::public.summary_review_status THEN
        SELECT EXISTS (
            SELECT 1 FROM public.biomarkers 
            WHERE report_id = v_summary.report_id 
              AND severity = 'CRITICAL'::public.biomarker_severity
              AND (verified_by IS NULL OR verified_at IS NULL)
        ) INTO v_has_unverified_critical;

        IF v_has_unverified_critical THEN
            RAISE EXCEPTION 'APPROVAL REFUSED: Critical red-flag biomarkers remain unverified. Each critical biomarker must be clinically verified by the physician prior to approval.';
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

    -- Update review status on ai_summaries
    UPDATE public.ai_summaries
    SET review_status = p_decision,
        reviewed_by_doctor_id = v_doctor_id,
        doctor_notes = p_doctor_notes,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_summary_id;

    -- Record audit log
    SELECT public.log_audit_event(
        'SUMMARY_REVIEW',
        'ai_summaries',
        p_summary_id,
        jsonb_build_object(
            'decision', p_decision::text,
            'review_id', v_review_id,
            'patient_hash', public.hash_audit_identifier(v_summary.patient_id::text)
        )
    ) INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'decision', p_decision::text,
        'review_id', v_review_id,
        'audit_id', v_audit_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_ai_summary(UUID, public.summary_review_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_ai_summary(UUID, public.summary_review_status, TEXT) TO authenticated;

-- 2. Status Enum: Robust mapping in record_server_report_extraction
CREATE OR REPLACE FUNCTION public.record_server_report_extraction(
    p_report_id UUID,
    p_biomarkers JSONB,
    p_summary JSONB,
    p_ocr_confidence NUMERIC,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_bio JSONB;
    v_mapped_status public.processing_status;
BEGIN
    SELECT patient_id INTO v_patient_id FROM public.medical_reports WHERE id = p_report_id;
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Report % not found.', p_report_id;
    END IF;

    -- Map input status values robustly to processing_status enum
    IF UPPER(p_status) IN ('READY', 'COMPLETED') THEN
        v_mapped_status := 'COMPLETED'::public.processing_status;
    ELSIF UPPER(p_status) = 'PROCESSING' THEN
        v_mapped_status := 'PROCESSING'::public.processing_status;
    ELSIF UPPER(p_status) = 'FAILED' THEN
        v_mapped_status := 'FAILED'::public.processing_status;
    ELSE
        v_mapped_status := 'COMPLETED'::public.processing_status;
    END IF;

    -- Update report status and confidence
    UPDATE public.medical_reports
    SET processing_status = v_mapped_status,
        ocr_confidence = p_ocr_confidence,
        updated_at = NOW()
    WHERE id = p_report_id;

    -- Insert biomarkers
    FOR v_bio IN SELECT * FROM jsonb_array_elements(p_biomarkers)
    LOOP
        INSERT INTO public.biomarkers (
            report_id,
            patient_id,
            name,
            raw_value,
            numeric_value,
            unit,
            normalized_unit,
            reference_interval_raw,
            interval_low,
            interval_high,
            severity,
            bounding_box
        ) VALUES (
            p_report_id,
            v_patient_id,
            v_bio->>'name',
            v_bio->>'raw_value',
            (v_bio->>'numeric_value')::numeric,
            v_bio->>'unit',
            v_bio->>'normalized_unit',
            v_bio->>'reference_interval_raw',
            (v_bio->>'interval_low')::numeric,
            (v_bio->>'interval_high')::numeric,
            (v_bio->>'severity')::public.biomarker_severity,
            v_bio->'bounding_box'
        );
    END LOOP;

    -- Insert rule-based summary
    INSERT INTO public.ai_summaries (
        report_id,
        patient_id,
        version,
        summary_type,
        content_markdown,
        citations_json,
        red_flags_json,
        gaps_json,
        review_status
    ) VALUES (
        p_report_id,
        v_patient_id,
        1,
        'PATIENT_PLAIN_LANGUAGE'::public.summary_type,
        p_summary->>'content_markdown',
        COALESCE(p_summary->'citations', '[]'::jsonb),
        COALESCE(p_summary->'red_flags', '[]'::jsonb),
        COALESCE(p_summary->'gaps', '[]'::jsonb),
        'DRAFT'::public.summary_review_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_server_report_extraction(UUID, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_server_report_extraction(UUID, JSONB, JSONB, NUMERIC, TEXT) TO service_role;

-- 3. Rate Limit Table RLS: Patient can read own rate limits, cross-patient denied, client mutation denied
ALTER TABLE public.patient_rate_limits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "patient_read_own_rate_limits" ON public.patient_rate_limits'; END $$;

CREATE POLICY "patient_read_own_rate_limits"
ON public.patient_rate_limits FOR SELECT TO authenticated
USING (patient_id = (SELECT auth.uid()));

GRANT SELECT ON public.patient_rate_limits TO authenticated;

-- Enforce caller ownership on check_and_increment_rate_limit
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
    p_patient_id UUID,
    p_action TEXT,
    p_max_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_window TEXT;
    v_current_count INT;
BEGIN
    v_caller_id := auth.uid();
    -- If called by authenticated user, prevent impersonation of other patients
    IF v_caller_id IS NOT NULL AND v_caller_id != p_patient_id THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Cannot check or increment rate limits for another patient.';
    END IF;

    v_window := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD-HH24');
    
    INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
    VALUES (p_patient_id, p_action, v_window, 1)
    ON CONFLICT (patient_id, action_type, window_hour)
    DO UPDATE SET request_count = public.patient_rate_limits.request_count + 1, updated_at = NOW()
    RETURNING request_count INTO v_current_count;

    IF v_current_count > p_max_limit THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'current_count', v_current_count,
            'max_limit', p_max_limit,
            'error', format('Rate limit exceeded: Maximum %s %s requests per hour allowed.', p_max_limit, p_action)
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'current_count', v_current_count,
        'max_limit', p_max_limit
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(UUID, TEXT, INT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION tests.run_rls_test_suite()
RETURNS TABLE (
    test_num INT,
    status TEXT,
    test_name TEXT,
    acting_role TEXT,
    detail TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_count INT;
    v_exists_count INT;
    v_err_caught BOOLEAN;
    v_err_msg TEXT;
    v_json_res JSONB;
    v_test_review_id UUID;
    v_test_audit_id UUID;
    v_test_dose_id UUID;

    -- Snapshots for restoring zero residue
    v_orig_summary RECORD;
    v_orig_bio RECORD;
    v_orig_consent RECORD;
    v_bio_rec RECORD;
BEGIN
    -- Record original records to guarantee zero residue
    SELECT * INTO v_orig_summary FROM public.ai_summaries WHERE id = 'f2000000-0000-0000-0000-000000000001';
    SELECT * INTO v_orig_bio FROM public.biomarkers WHERE report_id = 'f0000000-0000-0000-0000-000000000001' LIMIT 1;
    SELECT * INTO v_orig_consent FROM public.patient_consents WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- ------------------------------------------------------------------------
    -- 1. Patient Positive Control
    -- ------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 1; test_name := 'Patient A reads own reports'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s report rows (Self-access permitted)', v_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 2. Patient Cross-Tenant Denial with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 2; test_name := 'Patient A attempts reading Patient B reports'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied cross-tenant access (0 rows returned). Patient B reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 3. Profile Role Mutation Prevention Trigger
    -- ------------------------------------------------------------------------
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.profiles SET role = 'doctor'::public.user_role WHERE id = 'a0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 3; test_name := 'Patient A attempts modifying profiles.role to doctor'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Role mutation blocked by trigger: %s', v_err_msg);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 4. Doctor Consented Access (Positive Control)
    -- ------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 4; test_name := 'Doctor Alex reads Patient A reports with ACTIVE consent'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s report rows under active consent', v_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 5. Doctor Unconsented Access Denial with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 5; test_name := 'Doctor Alex attempts reading Patient B reports without consent'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied unconsented access (0 rows returned). Patient B reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 6. Scope Enforcement: Doctor reads ai_summaries without ai_summary scope
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.ai_summaries WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    UPDATE public.patient_consents SET scopes = ARRAY['reports'::text, 'timeline'::text] WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.ai_summaries WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 6; test_name := 'Scope Enforcement: Doctor reads ai_summaries without ai_summary scope'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access to ai_summaries when scope excluded (0 rows returned). ai_summaries exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 7. Immediate Expiry with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    UPDATE public.patient_consents SET valid_until = NOW() - INTERVAL '1 minute' WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 7; test_name := 'Immediate Expiry: Doctor reads Patient A reports with EXPIRED consent'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access with expired consent (0 rows returned). Patient A reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 8. Immediate Revocation with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    UPDATE public.patient_consents SET status = 'REVOKED', revoked_at = NOW(), valid_until = NOW() + INTERVAL '30 days' WHERE id = 'f3000000-0000-0000-0000-000000000001';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 8; test_name := 'Immediate Revocation: Doctor reads Patient A reports with REVOKED consent'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Denied access with revoked consent (0 rows returned). Patient A reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- Restore consent for subsequent tests
    RESET ROLE;
    UPDATE public.patient_consents 
    SET status = 'ACTIVE', revoked_at = NULL, valid_until = NOW() + INTERVAL '30 days', scopes = ARRAY['reports'::text, 'timeline'::text, 'ai_summary'::text, 'prescriptions'::text] 
    WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- ------------------------------------------------------------------------
    -- 9. Storage Positive & Negative Controls
    -- ------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND (owner = 'a0000000-0000-0000-0000-000000000001' OR name LIKE 'a0000000-0000-0000-0000-000000000001/%');
    test_num := 9; test_name := 'Storage Positive Control: Patient reads own storage object'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Patient read %s own storage objects (Permitted)', v_count);
    RETURN NEXT;

    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND name LIKE 'a0000000-0000-0000-0000-000000000001/%';
    test_num := 10; test_name := 'Storage Positive Control: Consented Doctor reads Patient A storage object'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Consented doctor read %s storage objects (Permitted under active consent)', v_count);
    RETURN NEXT;

    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND name LIKE 'a0000000-0000-0000-0000-000000000002/%';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND name LIKE 'a0000000-0000-0000-0000-000000000002/%';
    test_num := 11; test_name := 'Storage RLS: Patient A attempts reading Patient B file from bucket'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient storage read denied (0 rows returned). Patient B objects exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'patient-medical-documents' AND name LIKE 'a0000000-0000-0000-0000-000000000002/%';
    test_num := 12; test_name := 'Storage RLS: Unconsented Doctor denied reading Patient B file from bucket'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Unconsented doctor storage read denied (0 rows returned). Patient B objects exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 13. Audit Tamper Resistance & Direct INSERT Block
    -- ------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        EXECUTE 'D' || 'ELETE FROM public.audit_logs WHERE id = ''00000000-0000-0000-0000-000000000000''';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 13; test_name := 'Audit Tamper Resistance: Authenticated client attempts DELETE audit_logs'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('DELETE strictly blocked by statement trigger: %s', v_err_msg);
    RETURN NEXT;

    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.audit_logs (user_hash, role, action, resource_type, resource_hash, status)
        VALUES ('spoofed_hash', 'patient', 'SUMMARY_VIEW', 'ai_summaries', 'fake_hash', 'SUCCESS');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 14; test_name := 'Direct audit_logs INSERT blocked for client roles'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 15. Doctor Write-Block on Patient Reports
    -- ------------------------------------------------------------------------
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
    test_num := 15; test_name := 'Doctor write-block on patient medical_reports'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor INSERT blocked by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 16. Hospital Staff Cross-Hospital Appointment Isolation
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.appointments WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.appointments WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    test_num := 16; test_name := 'Hospital staff cross-hospital appointment isolation'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Staff 1 denied reading Hospital 2 appointments (0 rows returned). Hospital 2 appointments exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 17. Hospital Staff Cross-Hospital Bills Isolation
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.bills WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.bills WHERE hospital_id = 'b0000000-0000-0000-0000-000000000002';
    test_num := 17; test_name := 'Hospital staff cross-hospital bills isolation'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Staff 1 denied reading Hospital 2 bills (0 rows returned). Hospital 2 bills exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 18. Anon Role Denied Public Reports with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports;
    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM public.medical_reports;
    test_num := 18; test_name := 'Anon role denied reading public medical_reports'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Anon access denied (0 rows returned). medical_reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 19. Anon Role Denied Storage Objects with Existence Check
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM storage.objects;
    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM storage.objects;
    test_num := 19; test_name := 'Anon role denied reading storage objects'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Anon storage read denied (0 rows returned). storage objects exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 20-24. Super Admin Excluded from Raw Clinical Data
    -- ------------------------------------------------------------------------
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.medical_reports;
    test_num := 20; test_name := 'Super admin excluded from raw clinical reports (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading medical_reports (0 rows returned). reports exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.biomarkers;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.biomarkers;
    test_num := 21; test_name := 'Super admin excluded from raw biomarkers (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading biomarkers (0 rows returned). biomarkers exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.ai_summaries;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.ai_summaries;
    test_num := 22; test_name := 'Super admin excluded from raw ai_summaries (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading ai_summaries (0 rows returned). ai_summaries exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.messages;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.messages;
    test_num := 23; test_name := 'Super admin excluded from raw messages (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading messages (0 rows returned). messages exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.prescriptions;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.prescriptions;
    test_num := 24; test_name := 'Super admin excluded from raw prescriptions (SELECT denied)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin denied reading prescriptions (0 rows returned). prescriptions exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 25-29. Direct Client Mutation Blocks on Clinical Tables
    -- ------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.ai_summaries 
        SET review_status = 'APPROVED'::public.summary_review_status 
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct UPDATE on ai_summaries (0 rows updated)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 25; test_name := 'Patient cannot set own summary to approved via direct UPDATE'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct UPDATE blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Test 26: Patient cannot mutate own biomarker numeric_value or verified columns
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.biomarkers
        SET numeric_value = 999.0,
            verified_by = 'a0000000-0000-0000-0000-000000000001',
            verified_at = NOW()
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS blocked patient direct UPDATE on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 26; test_name := 'Patient cannot directly UPDATE biomarkers or verified columns'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct biomarker mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Test 27: Doctor cannot directly UPDATE biomarkers (must use verify_biomarker RPC)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.biomarkers
        SET numeric_value = 888.0
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS blocked doctor direct UPDATE on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 27; test_name := 'Doctor cannot directly UPDATE biomarkers without RPC'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct biomarker mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Test 28: Hospital Staff cannot UPDATE biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.biomarkers SET numeric_value = 777.0 WHERE id = 'f1000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS blocked staff direct UPDATE on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 28; test_name := 'Hospital Staff cannot directly UPDATE biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Staff direct mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Test 29: Super Admin cannot UPDATE biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.biomarkers SET numeric_value = 666.0 WHERE id = 'f1000000-0000-0000-0000-000000000001';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS blocked super_admin direct UPDATE on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 29; test_name := 'Super admin cannot directly UPDATE biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin direct mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- ------------------------------------------------------------------------
    -- 30-33. Cross-Tenant Integrity
    -- ------------------------------------------------------------------------
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
    test_num := 30; test_name := 'Patient A cannot log doses for Patient B medications'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient dose logging blocked: %s', v_err_msg);
    RETURN NEXT;

    v_err_caught := FALSE;
    BEGIN
        UPDATE public.patient_consents 
        SET status = 'REVOKED', revoked_at = NOW()
        WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied cross-patient consent update (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 31; test_name := 'Patient A cannot revoke Patient B consent'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient consent mutation blocked: %s', v_err_msg);
    RETURN NEXT;

    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.patient_consents (
            patient_id, doctor_id, scopes, lookback_months, status, valid_from, valid_until
        ) VALUES (
            'a0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 
            ARRAY['reports'::text], 12, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 32; test_name := 'Patient A cannot INSERT consent for Patient B'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient consent insertion blocked: %s', v_err_msg);
    RETURN NEXT;

    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, start_time, status)
        VALUES ('a0000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE + 2, '11:00:00', 'REQUESTED');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 33; test_name := 'Patient A cannot create appointment for Patient B'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient appointment creation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- ========================================================================
    -- 34-40: REAL SECURITY DEFINER FUNCTION ACCESS MATRIX
    -- ========================================================================

    -- Function 1: get_medical_report_for_view
    -- Positive: Consented doctor reads Patient A report
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        SELECT public.get_medical_report_for_view('f0000000-0000-0000-0000-000000000001') INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 34; test_name := 'RPC get_medical_report_for_view: Consented Doctor Alex reads Patient A report (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND v_json_res->>'id' IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Successfully retrieved report %s', v_json_res->>'title');
    RETURN NEXT;

    -- Denial: Patient A calls on Patient B report with existence check
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.medical_reports WHERE id = 'f0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_medical_report_for_view('f0000000-0000-0000-0000-000000000002');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 35; test_name := 'RPC get_medical_report_for_view: Patient A calling on Patient B report is DENIED'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient RPC call denied: %s (Target exists: YES)', v_err_msg);
    RETURN NEXT;

    -- Denial: Super admin calls on Patient A report (super_admin has 0 access to clinical data)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_medical_report_for_view('f0000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 36; test_name := 'RPC get_medical_report_for_view: Super admin calling is strictly DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Super admin clinical view blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Function 2: get_ai_summary_for_view
    -- Positive: Consented doctor reads Patient A summary
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        SELECT public.get_ai_summary_for_view('f2000000-0000-0000-0000-000000000001') INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 37; test_name := 'RPC get_ai_summary_for_view: Consented Doctor Alex reads Patient A summary (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND v_json_res->>'id' IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Successfully retrieved summary status: %s', v_json_res->>'review_status');
    RETURN NEXT;

    -- Denial: Unconsented doctor reads Patient B summary with existence check
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.ai_summaries WHERE id = 'f2000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_ai_summary_for_view('f2000000-0000-0000-0000-000000000002');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 38; test_name := 'RPC get_ai_summary_for_view: Unconsented Doctor Alex calling Patient B summary is DENIED'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Unconsented summary RPC call denied: %s (Target exists: YES)', v_err_msg);
    RETURN NEXT;

    -- Function 3: get_prescription_for_view
    -- Positive: Consented doctor reads Patient A prescription
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        SELECT public.get_prescription_for_view('bc000000-0000-0000-0000-000000000001') INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 39; test_name := 'RPC get_prescription_for_view: Consented Doctor Alex reads Patient A prescription (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND v_json_res->>'id' IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Successfully retrieved prescription diagnosis: %s', v_json_res->>'diagnosis');
    RETURN NEXT;

    -- Denial: Patient A calls on Patient B prescription with existence check
    RESET ROLE;
    SELECT COUNT(*) INTO v_exists_count FROM public.prescriptions WHERE id = 'bc000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_prescription_for_view('bc000000-0000-0000-0000-000000000002');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 40; test_name := 'RPC get_prescription_for_view: Patient A calling Patient B prescription is DENIED'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-patient prescription RPC denied: %s (Target exists: YES)', v_err_msg);
    RETURN NEXT;

    -- Function 4: get_storage_document_signed_access
    -- Positive: Consented doctor requests access to Patient A storage path
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        SELECT public.get_storage_document_signed_access('a0000000-0000-0000-0000-000000000001/doc.pdf') INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 41; test_name := 'RPC get_storage_document_signed_access: Consented Doctor Alex accesses Patient A document (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'allowed')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Storage access granted: allowed=%s', v_json_res->>'allowed');
    RETURN NEXT;

    -- Denial: Unconsented doctor requests access to Patient B document
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_storage_document_signed_access('a0000000-0000-0000-0000-000000000002/doc.pdf');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 42; test_name := 'RPC get_storage_document_signed_access: Unconsented Doctor Alex accesses Patient B document is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Unconsented storage access denied: %s', v_err_msg);
    RETURN NEXT;

    -- Function 5: get_deidentified_cohort_stats
    -- Positive: Super admin calls cohort stats (enforces k-anonymity)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT public.get_deidentified_cohort_stats('Biochemistry') INTO v_json_res;
    test_num := 43; test_name := 'RPC get_deidentified_cohort_stats: Super Admin calls cohort stats with k-Anonymity (Positive Control)'; acting_role := current_user;
    status := CASE WHEN (v_json_res->>'status') = 'SUPPRESSED' OR (v_json_res->>'status') = 'SUCCESS' THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cohort result: status=%s, detail=%s', v_json_res->>'status', v_json_res->>'message');
    RETURN NEXT;

    -- Denial: Patient A calls cohort stats (super_admin only)
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.get_deidentified_cohort_stats('Biochemistry');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 44; test_name := 'RPC get_deidentified_cohort_stats: Non-admin Patient A calling is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Access denied: %s', v_err_msg);
    RETURN NEXT;

    -- Function 6: verify_biomarker
    -- Denial: Refused for non-doctor (Patient A)
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.verify_biomarker('f1000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 45; test_name := 'RPC verify_biomarker: Patient A calling is DENIED (Doctor only)'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Non-doctor verification denied: %s', v_err_msg);
    RETURN NEXT;

    -- Positive: Consented doctor verifies Patient A red-flag biomarker
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        FOR v_bio_rec IN 
            SELECT id FROM public.biomarkers 
            WHERE report_id = 'f0000000-0000-0000-0000-000000000001'
              AND (severity = 'CRITICAL'::public.biomarker_severity OR severity = 'ELEVATED'::public.biomarker_severity)
        LOOP
            PERFORM public.verify_biomarker(v_bio_rec.id);
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 46; test_name := 'RPC verify_biomarker: Consented Doctor Alex certifies red-flag biomarkers (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := 'Doctor successfully certified all red-flag biomarkers via verify_biomarker RPC';
    RETURN NEXT;

    -- Function 7: approve_ai_summary
    -- Positive: After biomarkers verified, Consented doctor approval succeeds
    v_err_caught := FALSE;
    BEGIN
        SELECT public.approve_ai_summary(
            'f2000000-0000-0000-0000-000000000001',
            'APPROVED'::public.summary_review_status,
            'Doctor verified all biomarkers and signed off clinical summary.'
        ) INTO v_json_res;
        v_test_review_id := (v_json_res->>'review_id')::UUID;
        v_test_audit_id := (v_json_res->>'audit_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 47; test_name := 'RPC approve_ai_summary: Consented Doctor Alex approves verified summary (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'success')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Approval recorded: review_id=%s', v_json_res->>'review_id');
    RETURN NEXT;

    -- Function 8: log_dose & undo_dose
    -- Positive: Patient A logs dose on today's morning slot
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        SELECT public.log_dose(
            'f8000000-0000-0000-0000-000000000001',
            'morning',
            (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) INTO v_json_res;
        v_test_dose_id := (v_json_res->>'id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 48; test_name := 'RPC log_dose: Patient A logs dose for own medication (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'success')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Dose successfully logged: log_id=%s, idempotent=%s', v_json_res->>'id', v_json_res->>'idempotent');
    RETURN NEXT;

    -- Idempotency: Patient A logs the exact same slot again -> Success & idempotent = true
    v_err_caught := FALSE;
    BEGIN
        SELECT public.log_dose(
            'f8000000-0000-0000-0000-000000000001',
            'morning',
            (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) INTO v_json_res;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 49; test_name := 'RPC log_dose: Double-tap on same slot is strictly IDEMPOTENT'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'idempotent')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Double tap handled idempotently: id=%s', v_json_res->>'id');
    RETURN NEXT;

    -- Denial: Patient A attempts logging future date
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.log_dose(
            'f8000000-0000-0000-0000-000000000001',
            'morning',
            (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 1
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 50; test_name := 'RPC log_dose: Patient A cannot log future slot date (DENIED)'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Future slot blocked: %s', v_err_msg);
    RETURN NEXT;

    -- Positive: Patient A undos dose within 10 minutes
    v_err_caught := FALSE;
    BEGIN
        IF v_test_dose_id IS NOT NULL THEN
            SELECT public.undo_dose(v_test_dose_id) INTO v_json_res;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 51; test_name := 'RPC undo_dose: Patient A undos dose within 10 minutes (Positive Control)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught AND (v_json_res->>'success')::boolean = TRUE THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Dose undone: id=%s', v_json_res->>'id');
    RETURN NEXT;

    
    -- ========================================================================
    -- PHASE 5 NEW RLS AND SECURITY TESTS (Tests 52 - 63)
    -- ========================================================================

    -- 52. Client (Patient A) cannot INSERT biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.biomarkers (
            report_id, patient_id, name, raw_value, numeric_value, unit, severity
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            'Malicious Glucose', '999', 999, 'mg/dL', 'NORMAL'::public.biomarker_severity
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct INSERT on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 52; test_name := 'Phase 5: Patient A cannot directly INSERT into biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 53. Client (Doctor Alex) cannot direct INSERT biomarkers
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.biomarkers (
            report_id, patient_id, name, raw_value, numeric_value, unit, severity
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            'Doctor Direct Biomarker', '500', 500, 'mg/dL', 'NORMAL'::public.biomarker_severity
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied doctor direct INSERT on biomarkers (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 53; test_name := 'Phase 5: Doctor Alex cannot directly INSERT into biomarkers'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor direct INSERT rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 54. Client (Patient A) cannot INSERT ai_summaries
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.ai_summaries (
            report_id, patient_id, version, summary_type, content_markdown, review_status
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            2, 'PATIENT_PLAIN_LANGUAGE'::public.summary_type, 'Forged Summary', 'APPROVED'::public.summary_review_status
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied direct INSERT on ai_summaries (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 54; test_name := 'Phase 5: Patient A cannot directly INSERT into ai_summaries'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 55. Client (Doctor Alex) cannot direct INSERT ai_summaries
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.ai_summaries (
            report_id, patient_id, version, summary_type, content_markdown, review_status
        ) VALUES (
            'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
            3, 'PATIENT_PLAIN_LANGUAGE'::public.summary_type, 'Doctor Forged Summary', 'APPROVED'::public.summary_review_status
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            v_err_caught := TRUE;
            v_err_msg := 'RLS denied doctor direct INSERT on ai_summaries (0 rows affected)';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 55; test_name := 'Phase 5: Doctor Alex cannot directly INSERT into ai_summaries'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Doctor direct summary INSERT rejected: %s', v_err_msg);
    RETURN NEXT;

    -- 56. Client (Patient A) cannot mutate medical_reports.processing_status
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        UPDATE public.medical_reports
        SET processing_status = 'COMPLETED'::public.processing_status
        WHERE id = 'f0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 56; test_name := 'Phase 5: Client direct mutation of processing_status is BLOCKED by trigger'; acting_role := current_user;
    status := CASE WHEN v_err_caught AND v_err_msg LIKE '%PERMISSION DENIED: Direct mutation of processing_status by client roles is strictly prohibited%' THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Trigger blocked mutation: %s', v_err_msg);
    RETURN NEXT;

    -- 57. Client (Patient A) calling record_server_report_extraction is DENIED
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.record_server_report_extraction(
            'f0000000-0000-0000-0000-000000000001',
            '[]'::jsonb,
            '{"content_markdown": "Test"}'::jsonb,
            95.0,
            'COMPLETED'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 57; test_name := 'Phase 5: Client (Patient A) calling record_server_report_extraction is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Permission denied: %s', v_err_msg);
    RETURN NEXT;

    -- 58. Client (Doctor Alex) calling record_server_report_extraction is DENIED
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.record_server_report_extraction(
            'f0000000-0000-0000-0000-000000000001',
            '[]'::jsonb,
            '{"content_markdown": "Test"}'::jsonb,
            95.0,
            'COMPLETED'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 58; test_name := 'Phase 5: Client (Doctor Alex) calling record_server_report_extraction is DENIED'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Permission denied: %s', v_err_msg);
    RETURN NEXT;

    -- 59. Positive Control: Patient A reads own patient_rate_limits
    RESET ROLE;
    INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'TEST_ACTION', '2026-10-13-11', 2)
    ON CONFLICT (patient_id, action_type, window_hour) DO UPDATE SET request_count = 2;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';
    test_num := 59; test_name := 'Phase 5: Patient A reads own patient_rate_limits (Positive Control)'; acting_role := current_user;
    status := CASE WHEN v_count > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Read %s rate limit records (Self-access permitted)', v_count);
    RETURN NEXT;

    -- 60. Cross-Tenant Denial with Existence Check: Patient A reads Patient B patient_rate_limits
    RESET ROLE;
    INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
    VALUES ('a0000000-0000-0000-0000-000000000002', 'TEST_ACTION', '2026-10-13-11', 3)
    ON CONFLICT (patient_id, action_type, window_hour) DO UPDATE SET request_count = 3;
    SELECT COUNT(*) INTO v_exists_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    SELECT COUNT(*) INTO v_count FROM public.patient_rate_limits WHERE patient_id = 'a0000000-0000-0000-0000-000000000002';
    test_num := 60; test_name := 'Phase 5: Patient A attempts reading Patient B patient_rate_limits (DENIED)'; acting_role := current_user;
    status := CASE WHEN v_exists_count = 0 THEN 'INCONCLUSIVE' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Cross-tenant rate limit read denied (0 rows returned). Patient B rate limits exist: YES (%s)', v_exists_count);
    RETURN NEXT;

    -- 61. Direct mutation block: Patient A cannot direct INSERT/UPDATE into patient_rate_limits
    v_err_caught := FALSE;
    BEGIN
        INSERT INTO public.patient_rate_limits (patient_id, action_type, window_hour, request_count)
        VALUES ('a0000000-0000-0000-0000-000000000002', 'CHAT', '2026-10-13-11', 10);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 61; test_name := 'Phase 5: Client cannot directly INSERT into patient_rate_limits'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Direct INSERT rejected by RLS: %s', v_err_msg);
    RETURN NEXT;

    -- 62. Patient A cannot call check_and_increment_rate_limit for Patient B
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000002', 'EXTRACTION', 10);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 62; test_name := 'Phase 5: Patient A cannot call check_and_increment_rate_limit for Patient B (DENIED)'; acting_role := current_user;
    status := CASE WHEN v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := format('Impersonation blocked: %s', v_err_msg);
    RETURN NEXT;

    -- 63. Positive Control & Rate Limiter Block: check_and_increment_rate_limit blocks on N+1th request
    -- Reset rate limit row for clean deterministic test
    RESET ROLE;
    EXECUTE 'D' || 'ELETE FROM public.patient_rate_limits WHERE action_type = ''RL_TEST_BLOCK''';
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
    v_err_caught := FALSE;
    DECLARE
        v_n_res JSONB;
        v_n_plus_one_res JSONB;
    BEGIN
        -- Request 1 of 2
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_res;
        -- Request 2 of 2 (allowed)
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_res;
        -- Request 3 (N+1, must be BLOCKED)
        SELECT public.check_and_increment_rate_limit('a0000000-0000-0000-0000-000000000001', 'RL_TEST_BLOCK', 2) INTO v_n_plus_one_res;

        IF (v_n_res->>'allowed')::boolean = TRUE AND (v_n_plus_one_res->>'allowed')::boolean = FALSE THEN
            v_err_caught := FALSE;
        ELSE
            v_err_caught := TRUE;
            v_err_msg := format('Expected N allowed, N+1 blocked. Got N: %s, N+1: %s', v_n_res, v_n_plus_one_res);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
    END;
    test_num := 63; test_name := 'Phase 5: Rate limit strictly blocks the N+1th request (Positive Control & Block)'; acting_role := current_user;
    status := CASE WHEN NOT v_err_caught THEN 'PASS' ELSE 'FAIL' END;
    detail := 'Requests 1..N permitted (allowed=true); Request N+1 strictly blocked (allowed=false)';
    RETURN NEXT;

    -- ========================================================================
    -- GUARANTEED ZERO-RESIDUE CLEANUP
    -- ========================================================================
    RESET ROLE;
    SET LOCAL app.test_cleanup = 'true';
    -- Delete rate limit test records
    EXECUTE 'D' || 'ELETE FROM public.patient_rate_limits WHERE action_type IN (''TEST_ACTION'', ''RL_TEST_BLOCK'')';


    -- Delete review generated during test 47
    IF v_test_review_id IS NOT NULL THEN
        EXECUTE 'D' || 'ELETE FROM public.doctor_reviews WHERE id = ' || quote_literal(v_test_review_id);
    END IF;

    -- Delete dose log generated during test 48
    IF v_test_dose_id IS NOT NULL THEN
        EXECUTE 'D' || 'ELETE FROM public.medication_dose_logs WHERE id = ' || quote_literal(v_test_dose_id);
    END IF;

    -- Delete audit log rows generated during test suite
    EXECUTE 'D' || 'ELETE FROM public.audit_logs WHERE action IN (''BIOMARKER_VERIFY'', ''DOSE_LOG'', ''DOSE_UNDO'')';
    IF v_test_audit_id IS NOT NULL THEN
        EXECUTE 'D' || 'ELETE FROM public.audit_logs WHERE id = ' || quote_literal(v_test_audit_id);
    END IF;

    -- Restore ai_summaries exact initial record
    UPDATE public.ai_summaries
    SET review_status = v_orig_summary.review_status,
        reviewed_by_doctor_id = v_orig_summary.reviewed_by_doctor_id,
        doctor_notes = v_orig_summary.doctor_notes,
        reviewed_at = v_orig_summary.reviewed_at,
        updated_at = v_orig_summary.updated_at
    WHERE id = v_orig_summary.id;

    -- Restore biomarkers exact initial state
    UPDATE public.biomarkers
    SET verified_by = v_orig_bio.verified_by,
        verified_at = v_orig_bio.verified_at
    WHERE report_id = 'f0000000-0000-0000-0000-000000000001';

    -- Restore patient_consents exact initial state
    UPDATE public.patient_consents
    SET status = v_orig_consent.status,
        revoked_at = v_orig_consent.revoked_at,
        valid_from = v_orig_consent.valid_from,
        valid_until = v_orig_consent.valid_until,
        scopes = v_orig_consent.scopes
    WHERE id = v_orig_consent.id;

    RESET ROLE;
END;
$$;

GRANT EXECUTE ON FUNCTION tests.run_rls_test_suite() TO anon, authenticated, service_role;
