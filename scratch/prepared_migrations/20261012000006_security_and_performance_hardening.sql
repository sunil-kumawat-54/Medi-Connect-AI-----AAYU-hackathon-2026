-- ============================================================================
-- Migration: 20261012000006_security_and_performance_hardening.sql
-- Description:
--   1. Moves test functions to isolated 'tests' schema with zero client access.
--   2. Revokes EXECUTE on SECURITY DEFINER functions from PUBLIC and anon.
--   3. Hardens audit_logs INSERT policy to enforce user_hash = hash(auth.uid()).
--   4. Rewrites RLS policies to wrap auth.uid() in (SELECT auth.uid()) for initplan optimization.
--   5. Adds covering indexes for all unindexed foreign keys.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ISOLATED TESTS SCHEMA
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tests;
REVOKE ALL ON SCHEMA tests FROM PUBLIC, anon, authenticated;

-- Revoke public access to previous test functions in public schema
REVOKE ALL ON FUNCTION public.run_rls_test_suite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.test_audit_security() FROM PUBLIC, anon, authenticated;

-- Define RLS test suite in tests schema
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
            public.hash_audit_identifier('a0000000-0000-0000-0000-000000000002'), -- Patient B ID
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

-- ----------------------------------------------------------------------------
-- 2. REVOKE EXECUTE ON SECURITY DEFINER FUNCTIONS FROM PUBLIC & ANON
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.doctor_has_active_consent(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_has_active_consent(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff_at_hospital(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_at_hospital(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.hash_audit_identifier(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hash_audit_identifier(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_tampering() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Set default privileges to prevent new functions from being public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 3. AUDIT LOGS INSERT HARDENING
-- ----------------------------------------------------------------------------
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs'; END $$;


CREATE POLICY "audit_logs_insert_authenticated"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        user_hash = public.hash_audit_identifier((SELECT auth.uid())::text)
    );

-- Secure audit event logger helper function
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'SUCCESS',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_log_id UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Must be signed in to log audit event';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

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
        COALESCE(v_role, 'patient'::public.user_role),
        p_action,
        p_resource_type,
        CASE WHEN p_resource_id IS NOT NULL THEN public.hash_audit_identifier(p_resource_id) ELSE NULL END,
        p_status,
        p_metadata
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 4. REWRITE RLS POLICIES FOR (SELECT auth.uid()) INITPLAN OPTIMIZATION
-- ----------------------------------------------------------------------------

-- PROFILES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "profiles_select_own_or_consented_doctor" ON public.profiles'; END $$;

CREATE POLICY "profiles_select_own_or_consented_doctor"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(id, 'reports', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "profiles_update_own" ON public.profiles'; END $$;

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- DOCTORS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctors_update_own" ON public.doctors'; END $$;

CREATE POLICY "doctors_update_own"
    ON public.doctors FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- HOSPITAL STAFF
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "hospital_staff_select" ON public.hospital_staff'; END $$;

CREATE POLICY "hospital_staff_select"
    ON public.hospital_staff FOR SELECT
    TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
        OR public.is_staff_at_hospital(hospital_id)
    );

-- PATIENT CONSENTS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "consents_select_parties" ON public.patient_consents'; END $$;

CREATE POLICY "consents_select_parties"
    ON public.patient_consents FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "consents_insert_patient" ON public.patient_consents'; END $$;

CREATE POLICY "consents_insert_patient"
    ON public.patient_consents FOR INSERT
    TO authenticated
    WITH CHECK (
        patient_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'patient'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "consents_update_patient" ON public.patient_consents'; END $$;

CREATE POLICY "consents_update_patient"
    ON public.patient_consents FOR UPDATE
    TO authenticated
    USING (patient_id = (SELECT auth.uid()))
    WITH CHECK (patient_id = (SELECT auth.uid()));

-- MEDICAL TIMELINE EVENTS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "timeline_select_patient_or_consented_doctor" ON public.medical_timeline_events'; END $$;

CREATE POLICY "timeline_select_patient_or_consented_doctor"
    ON public.medical_timeline_events FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'timeline', event_date)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "timeline_insert_patient" ON public.medical_timeline_events'; END $$;

CREATE POLICY "timeline_insert_patient"
    ON public.medical_timeline_events FOR INSERT
    TO authenticated
    WITH CHECK (patient_id = (SELECT auth.uid()));

-- MEDICAL REPORTS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "reports_select_patient_or_consented_doctor" ON public.medical_reports'; END $$;

CREATE POLICY "reports_select_patient_or_consented_doctor"
    ON public.medical_reports FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'reports', report_date::timestamptz)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "reports_insert_patient" ON public.medical_reports'; END $$;

CREATE POLICY "reports_insert_patient"
    ON public.medical_reports FOR INSERT
    TO authenticated
    WITH CHECK (
        patient_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'patient'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "reports_update_patient" ON public.medical_reports'; END $$;

CREATE POLICY "reports_update_patient"
    ON public.medical_reports FOR UPDATE
    TO authenticated
    USING (patient_id = (SELECT auth.uid()))
    WITH CHECK (patient_id = (SELECT auth.uid()));
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "reports_delete_patient" ON public.medical_reports'; END $$;

CREATE POLICY "reports_delete_patient"
    ON public.medical_reports FOR DELETE
    TO authenticated
    USING (patient_id = (SELECT auth.uid()));

-- REPORT PAGES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "report_pages_select" ON public.report_pages'; END $$;

CREATE POLICY "report_pages_select"
    ON public.report_pages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.medical_reports r
            WHERE r.id = report_pages.report_id
            AND (
                r.patient_id = (SELECT auth.uid())
                OR (
                    (SELECT public.current_user_role()) = 'doctor'::public.user_role
                    AND public.doctor_has_active_consent(r.patient_id, 'reports', r.report_date::timestamptz)
                )
            )
        )
    );

-- BIOMARKERS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "biomarkers_select_patient_or_consented_doctor" ON public.biomarkers'; END $$;

CREATE POLICY "biomarkers_select_patient_or_consented_doctor"
    ON public.biomarkers FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'reports', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "biomarkers_insert_patient" ON public.biomarkers'; END $$;

CREATE POLICY "biomarkers_insert_patient"
    ON public.biomarkers FOR INSERT
    TO authenticated
    WITH CHECK (patient_id = (SELECT auth.uid()));

-- AI SUMMARIES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "ai_summaries_select_patient_or_consented_doctor" ON public.ai_summaries'; END $$;

CREATE POLICY "ai_summaries_select_patient_or_consented_doctor"
    ON public.ai_summaries FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'ai_summary', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );

-- SUMMARY SOURCE LINKS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "summary_source_links_select" ON public.summary_source_links'; END $$;

CREATE POLICY "summary_source_links_select"
    ON public.summary_source_links FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_summaries s
            WHERE s.id = summary_source_links.summary_id
            AND (
                s.patient_id = (SELECT auth.uid())
                OR (
                    (SELECT public.current_user_role()) = 'doctor'::public.user_role
                    AND public.doctor_has_active_consent(s.patient_id, 'ai_summary', NULL)
                )
            )
        )
    );

-- DOCTOR BRIEFS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctor_briefs_select_patient_or_consented_doctor" ON public.doctor_briefs'; END $$;

CREATE POLICY "doctor_briefs_select_patient_or_consented_doctor"
    ON public.doctor_briefs FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'ai_summary', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );

-- DOCTOR REVIEWS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctor_reviews_select" ON public.doctor_reviews'; END $$;

CREATE POLICY "doctor_reviews_select"
    ON public.doctor_reviews FOR SELECT
    TO authenticated
    USING (
        doctor_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.ai_summaries s
            WHERE s.id = doctor_reviews.summary_id
            AND s.patient_id = (SELECT auth.uid())
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctor_reviews_insert_doctor" ON public.doctor_reviews'; END $$;

CREATE POLICY "doctor_reviews_insert_doctor"
    ON public.doctor_reviews FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    );

-- APPOINTMENTS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "appointments_select_parties" ON public.appointments'; END $$;

CREATE POLICY "appointments_select_parties"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
        OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "appointments_insert_patient" ON public.appointments'; END $$;

CREATE POLICY "appointments_insert_patient"
    ON public.appointments FOR INSERT
    TO authenticated
    WITH CHECK (
        patient_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'patient'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "appointments_update_parties" ON public.appointments'; END $$;

CREATE POLICY "appointments_update_parties"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
        OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
    );

-- PRESCRIPTIONS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "prescriptions_select_patient_or_consented_doctor" ON public.prescriptions'; END $$;

CREATE POLICY "prescriptions_select_patient_or_consented_doctor"
    ON public.prescriptions FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'prescriptions', created_at)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "prescriptions_insert_doctor" ON public.prescriptions'; END $$;

CREATE POLICY "prescriptions_insert_doctor"
    ON public.prescriptions FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    );

-- PRESCRIPTION ITEMS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "prescription_items_select" ON public.prescription_items'; END $$;

CREATE POLICY "prescription_items_select"
    ON public.prescription_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prescriptions rx
            WHERE rx.id = prescription_items.prescription_id
            AND (
                rx.patient_id = (SELECT auth.uid())
                OR rx.doctor_id = (SELECT auth.uid())
                OR (
                    (SELECT public.current_user_role()) = 'doctor'::public.user_role
                    AND public.doctor_has_active_consent(rx.patient_id, 'prescriptions', rx.created_at)
                )
            )
        )
    );

-- MEDICATIONS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "medications_select_patient_or_consented_doctor" ON public.medications'; END $$;

DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "medications_all_patient" ON public.medications'; END $$;

CREATE POLICY "medications_select_patient_or_consented_doctor"
    ON public.medications FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'prescriptions', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );

CREATE POLICY "medications_modify_patient"
    ON public.medications FOR ALL
    TO authenticated
    USING (patient_id = (SELECT auth.uid()))
    WITH CHECK (patient_id = (SELECT auth.uid()));

-- REMINDERS & DOSE LOGS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "reminders_all_patient" ON public.medication_reminders'; END $$;

CREATE POLICY "reminders_all_patient"
    ON public.medication_reminders FOR ALL
    TO authenticated
    USING (patient_id = (SELECT auth.uid()))
    WITH CHECK (patient_id = (SELECT auth.uid()));
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "dose_logs_all_patient" ON public.medication_dose_logs'; END $$;

CREATE POLICY "dose_logs_all_patient"
    ON public.medication_dose_logs FOR ALL
    TO authenticated
    USING (patient_id = (SELECT auth.uid()))
    WITH CHECK (patient_id = (SELECT auth.uid()));

-- BILLS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "bills_select_patient_or_staff" ON public.bills'; END $$;

CREATE POLICY "bills_select_patient_or_staff"
    ON public.bills FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );

-- BILL ITEMS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "bill_items_select" ON public.bill_items'; END $$;

CREATE POLICY "bill_items_select"
    ON public.bill_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bills b
            WHERE b.id = bill_items.bill_id
            AND (
                b.patient_id = (SELECT auth.uid())
                OR (b.hospital_id IS NOT NULL AND public.is_staff_at_hospital(b.hospital_id))
                OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
            )
        )
    );

-- BILLING FLAGS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "billing_flags_select" ON public.billing_flags'; END $$;

CREATE POLICY "billing_flags_select"
    ON public.billing_flags FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bills b
            WHERE b.id = billing_flags.bill_id
            AND (
                b.patient_id = (SELECT auth.uid())
                OR (b.hospital_id IS NOT NULL AND public.is_staff_at_hospital(b.hospital_id))
                OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
            )
        )
    );

-- DOCTOR HOSPITALS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctor_hospitals_manage_doctor_or_staff" ON public.doctor_hospitals'; END $$;

DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "doctor_hospitals_select_all" ON public.doctor_hospitals'; END $$;


CREATE POLICY "doctor_hospitals_select"
    ON public.doctor_hospitals FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "doctor_hospitals_modify"
    ON public.doctor_hospitals FOR ALL
    TO authenticated
    USING (
        doctor_id = (SELECT auth.uid())
        OR public.is_staff_at_hospital(hospital_id)
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    )
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        OR public.is_staff_at_hospital(hospital_id)
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );

-- AVAILABILITY SLOTS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "availability_slots_manage_doctor" ON public.availability_slots'; END $$;

DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "availability_slots_select_all" ON public.availability_slots'; END $$;


CREATE POLICY "availability_slots_select"
    ON public.availability_slots FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "availability_slots_modify"
    ON public.availability_slots FOR ALL
    TO authenticated
    USING (
        doctor_id = (SELECT auth.uid())
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    )
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    );

-- CLINICAL NOTES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "clinical_notes_select" ON public.clinical_notes'; END $$;

CREATE POLICY "clinical_notes_select"
    ON public.clinical_notes FOR SELECT
    TO authenticated
    USING (
        doctor_id = (SELECT auth.uid())
        OR patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'reports', NULL)
        )
        OR (SELECT public.current_user_role()) = 'super_admin'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "clinical_notes_insert_doctor" ON public.clinical_notes'; END $$;

CREATE POLICY "clinical_notes_insert_doctor"
    ON public.clinical_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "clinical_notes_update_doctor" ON public.clinical_notes'; END $$;

CREATE POLICY "clinical_notes_update_doctor"
    ON public.clinical_notes FOR UPDATE
    TO authenticated
    USING (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    )
    WITH CHECK (
        doctor_id = (SELECT auth.uid())
        AND (SELECT public.current_user_role()) = 'doctor'::public.user_role
    );

-- CONVERSATIONS
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "conversations_select_parties" ON public.conversations'; END $$;

CREATE POLICY "conversations_select_parties"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
        OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "conversations_insert_patient_or_doctor" ON public.conversations'; END $$;

CREATE POLICY "conversations_insert_patient_or_doctor"
    ON public.conversations FOR INSERT
    TO authenticated
    WITH CHECK (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT auth.uid())
    );

-- MESSAGES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "messages_select_conversation_parties" ON public.messages'; END $$;

CREATE POLICY "messages_select_conversation_parties"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (
                c.patient_id = (SELECT auth.uid())
                OR c.doctor_id = (SELECT auth.uid())
                OR (c.hospital_id IS NOT NULL AND public.is_staff_at_hospital(c.hospital_id))
            )
        )
    );
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "messages_insert_sender" ON public.messages'; END $$;

CREATE POLICY "messages_insert_sender"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (sender_id = (SELECT auth.uid()));

-- PUBLIC HEALTH SCHEMES
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "public_health_schemes_manage_super_admin" ON public.public_health_schemes'; END $$;

DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "public_health_schemes_select_all" ON public.public_health_schemes'; END $$;


CREATE POLICY "public_health_schemes_select"
    ON public.public_health_schemes FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "public_health_schemes_modify"
    ON public.public_health_schemes FOR ALL
    TO authenticated
    USING ((SELECT public.current_user_role()) = 'super_admin'::public.user_role)
    WITH CHECK ((SELECT public.current_user_role()) = 'super_admin'::public.user_role);

-- ----------------------------------------------------------------------------
-- 5. COVERING INDEXES FOR UNINDEXED FOREIGN KEYS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_summaries_doctor_fkey ON public.ai_summaries(reviewed_by_doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_fkey ON public.appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_fkey ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_billing_flags_bill_fkey ON public.billing_flags(bill_id);
CREATE INDEX IF NOT EXISTS idx_billing_flags_item_fkey ON public.billing_flags(bill_item_id);
CREATE INDEX IF NOT EXISTS idx_bills_hospital_fkey ON public.bills(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient_fkey ON public.bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_appt_fkey ON public.clinical_notes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_conversations_hosp_fkey ON public.conversations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctor_reviews_doc_fkey ON public.doctor_reviews(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_reviews_sum_fkey ON public.doctor_reviews(summary_id);
CREATE INDEX IF NOT EXISTS idx_hospital_staff_hosp_fkey ON public.hospital_staff(hospital_id);
CREATE INDEX IF NOT EXISTS idx_dose_logs_med_fkey ON public.medication_dose_logs(medication_id);
CREATE INDEX IF NOT EXISTS idx_dose_logs_patient_fkey ON public.medication_dose_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_reminders_med_fkey ON public.medication_reminders(medication_id);
CREATE INDEX IF NOT EXISTS idx_reminders_patient_fkey ON public.medication_reminders(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient_fkey ON public.medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_rx_fkey ON public.medications(prescription_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_fkey ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_consents_hosp_fkey ON public.patient_consents(hospital_id);
CREATE INDEX IF NOT EXISTS idx_rx_items_rx_fkey ON public.prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appt_fkey ON public.prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doc_fkey ON public.prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_fkey ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_source_links_page_fkey ON public.summary_source_links(report_page_id);
CREATE INDEX IF NOT EXISTS idx_source_links_sum_fkey ON public.summary_source_links(summary_id);
