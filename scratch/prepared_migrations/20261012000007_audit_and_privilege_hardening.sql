-- ============================================================================
-- Migration: 20261012000007_audit_and_privilege_hardening.sql
-- Description:
--   1. AUDIT ORACLE: Revokes hash_audit_identifier from authenticated, drops direct
--      INSERT policy on audit_logs, routes all audit writes through hardened log_audit_event().
--   2. DEFAULT PRIVILEGES: Removes global PUBLIC and anon execution defaults.
--   3. CLINICAL PHI ISOLATION: Super admin denied SELECT on medical_reports, biomarkers,
--      ai_summaries, doctor_briefs, prescriptions, messages.
--   4. SEEDS: Hospital 2, unassigned records, and real storage documents for testing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUDIT ORACLE HARDENING & IMPERSONATION PREVENTION
-- ----------------------------------------------------------------------------
-- Revoke hash_audit_identifier from all client roles
REVOKE EXECUTE ON FUNCTION public.hash_audit_identifier(TEXT) FROM authenticated, PUBLIC, anon;

-- Drop direct client INSERT policy on audit_logs (Strictly DENIES direct client INSERT)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs';
END $$;

-- Hardened audit logging function with action allowlist, payload size caps, and PHI filters
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
    v_allowed_actions TEXT[] := ARRAY[
        'LOGIN', 'LOGOUT', 'AUTH_REFRESH',
        'REPORT_UPLOAD', 'REPORT_VIEW', 'REPORT_DELETE',
        'SUMMARY_GENERATE', 'SUMMARY_VIEW', 'SUMMARY_APPROVE', 'SUMMARY_REJECT', 'SUMMARY_EDIT',
        'CONSENT_GRANT', 'CONSENT_REVOKE',
        'APPOINTMENT_BOOK', 'APPOINTMENT_CANCEL', 'APPOINTMENT_RESCHEDULE',
        'PRESCRIPTION_CREATE', 'PRESCRIPTION_VIEW',
        'BILL_VIEW', 'BILL_FLAG', 'RECORD_ACCESSED', 'TEST_ACTION'
    ];
    v_prohibited_phi_keys TEXT[] := ARRAY[
        'patient_name', 'name', 'phone', 'email', 'abha_id', 'aadhaar', 
        'diagnosis', 'biomarker_value', 'raw_value', 'clinical_note', 'prescription'
    ];
    k TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Unauthenticated audit log creation rejected.';
    END IF;

    -- Validate action against strict allowlist
    IF NOT (p_action = ANY(v_allowed_actions)) THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Invalid or unapproved audit action "%"', p_action;
    END IF;

    -- Validate metadata payload size (max 4096 bytes)
    IF octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 4096 THEN
        RAISE EXCEPTION 'SECURITY ERROR: Audit metadata payload exceeds 4096 byte maximum.';
    END IF;

    -- Check for prohibited PHI fields in metadata
    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        FOREACH k IN ARRAY v_prohibited_phi_keys LOOP
            IF p_metadata ? k THEN
                RAISE EXCEPTION 'PRIVACY VIOLATION: PHI attribute "%" is strictly prohibited in audit metadata logs.', k;
            END IF;
        END LOOP;
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
        COALESCE(p_status, 'SUCCESS'),
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 2. GLOBAL DEFAULT PRIVILEGES HARDENING
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- 3. CLINICAL PHI EXCLUSION FOR SUPER ADMIN (DE-IDENTIFIED AUDIT ONLY)
-- ----------------------------------------------------------------------------

-- MEDICAL REPORTS: Super admin excluded from raw reports
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "reports_select_patient_or_consented_doctor" ON public.medical_reports';
END $$;

CREATE POLICY "reports_select_patient_or_consented_doctor"
    ON public.medical_reports FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'reports', report_date::timestamptz)
        )
    );

-- BIOMARKERS: Super admin excluded from raw biomarkers
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "biomarkers_select_patient_or_consented_doctor" ON public.biomarkers';
END $$;

CREATE POLICY "biomarkers_select_patient_or_consented_doctor"
    ON public.biomarkers FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'reports', NULL)
        )
    );

-- AI SUMMARIES: Super admin excluded from raw AI summaries
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "ai_summaries_select_patient_or_consented_doctor" ON public.ai_summaries';
END $$;

CREATE POLICY "ai_summaries_select_patient_or_consented_doctor"
    ON public.ai_summaries FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'ai_summary', NULL)
        )
    );

-- DOCTOR BRIEFS: Super admin excluded from raw doctor briefs
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "doctor_briefs_select_patient_or_consented_doctor" ON public.doctor_briefs';
END $$;

CREATE POLICY "doctor_briefs_select_patient_or_consented_doctor"
    ON public.doctor_briefs FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'ai_summary', NULL)
        )
    );

-- PRESCRIPTIONS: Super admin excluded
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "prescriptions_select_patient_or_consented_doctor" ON public.prescriptions';
END $$;

CREATE POLICY "prescriptions_select_patient_or_consented_doctor"
    ON public.prescriptions FOR SELECT
    TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR doctor_id = (SELECT d.id FROM public.doctors d WHERE d.profile_id = auth.uid())
        OR (
            (SELECT public.current_user_role()) = 'doctor'::public.user_role
            AND public.doctor_has_active_consent(patient_id, 'prescriptions', created_at)
        )
    );

-- MESSAGES: Only conversation participants (patient, doctor, assigned staff), super admin excluded
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "messages_select_conversation_parties" ON public.messages';
END $$;

CREATE POLICY "messages_select_conversation_parties"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (
                c.patient_id = (SELECT auth.uid())
                OR c.doctor_id = (SELECT d.id FROM public.doctors d WHERE d.profile_id = auth.uid())
                OR (c.hospital_id IS NOT NULL AND public.is_staff_at_hospital(c.hospital_id))
            )
        )
    );

-- ----------------------------------------------------------------------------
-- 4. HOSPITAL 2 & SYNTHETIC DATA FOR COMPREHENSIVE RLS CONTROLS
-- ----------------------------------------------------------------------------
INSERT INTO public.hospitals (id, name, accreditation_number, address, city, state, phone)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'Apex Metro Care Hospital (DEMO)',
    'NABH-DEMO-2026-999',
    '45 Healthcare Blvd',
    'New Delhi',
    'Delhi',
    '+91-11-23456789'
) ON CONFLICT (id) DO NOTHING;

-- Appointment at Hospital 2
INSERT INTO public.appointments (
    id, patient_id, doctor_id, hospital_id, appointment_date, start_time, status, chief_complaint
) VALUES (
    'ba000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002', -- Patient B
    'd1000000-0000-0000-0000-000000000001', -- Doctor Alex
    'b0000000-0000-0000-0000-000000000002', -- Hospital 2
    CURRENT_DATE + 2,
    '10:30:00',
    'CONFIRMED',
    'Routine Cardiology Followup'
) ON CONFLICT (id) DO NOTHING;

-- Bill at Hospital 2
INSERT INTO public.bills (
    id, patient_id, hospital_id, invoice_number, invoice_date, total_amount, currency, file_path, has_discrepancies, audit_summary
) VALUES (
    'bb000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002', -- Patient B
    'b0000000-0000-0000-0000-000000000002', -- Hospital 2
    'BILL-CC-2026-0002',
    CURRENT_DATE,
    12500.00,
    'INR',
    'bills/BILL-CC-2026-0002.pdf',
    false,
    'Verified routine billing'
) ON CONFLICT (id) DO NOTHING;

-- Patient B prescription
INSERT INTO public.prescriptions (
    id, appointment_id, patient_id, doctor_id, diagnosis, instructions
) VALUES (
    'bc000000-0000-0000-0000-000000000002',
    'ba000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002', -- Patient B
    'd1000000-0000-0000-0000-000000000001', -- Doctor Alex
    'Hyperlipidemia Management',
    'Take statin daily before bedtime'
) ON CONFLICT (id) DO NOTHING;

-- Patient B conversation and message
INSERT INTO public.conversations (
    id, patient_id, doctor_id, hospital_id, title, language, status
) VALUES (
    'bd000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002', -- Patient B
    'd1000000-0000-0000-0000-000000000001', -- Doctor Alex
    'b0000000-0000-0000-0000-000000000002', -- Hospital 2
    'Consultation Query',
    'en',
    'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.messages (
    id, conversation_id, sender_id, sender_type, content, is_read
) VALUES (
    'be000000-0000-0000-0000-000000000002',
    'bd000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'patient',
    'Confidential message from Patient B',
    false
) ON CONFLICT (id) DO NOTHING;
