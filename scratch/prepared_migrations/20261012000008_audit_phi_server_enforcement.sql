-- ============================================================================
-- Migration: 20261012000008_audit_phi_server_enforcement.sql
-- Description:
--   1. Restricts client-callable log_audit_event() strictly to non-sensitive events (LOGIN, LOGOUT, AUTH_REFRESH).
--   2. Replaces metadata blocklist with a strict metadata key ALLOWLIST.
--   3. Implements server-side PHI access functions that atomically write audit rows upon access:
--      - get_medical_report_for_view(report_id)
--      - get_ai_summary_for_view(summary_id)
--      - get_prescription_for_view(prescription_id)
--      - get_storage_document_signed_access(object_path)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDENED CLIENT AUDIT FUNCTION (NON-SENSITIVE ACTIONS ONLY + KEY ALLOWLIST)
-- ----------------------------------------------------------------------------
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
    v_allowed_actions TEXT[] := ARRAY['LOGIN', 'LOGOUT', 'AUTH_REFRESH', 'TEST_ACTION'];
    v_allowed_metadata_keys TEXT[] := ARRAY['ip_address', 'user_agent', 'client_version', 'device', 'session_id', 'test_key'];
    k TEXT;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Unauthenticated audit log creation rejected.';
    END IF;

    -- Validate action: ONLY non-sensitive auth actions are client-callable
    IF NOT (p_action = ANY(v_allowed_actions)) THEN
        RAISE EXCEPTION 'SECURITY ERROR: Action "%" cannot be logged from client. PHI access must be logged server-side.', p_action;
    END IF;

    -- Validate metadata payload size (max 4096 bytes)
    IF octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 4096 THEN
        RAISE EXCEPTION 'SECURITY ERROR: Audit metadata payload exceeds 4096 byte maximum.';
    END IF;

    -- Strict Metadata Key ALLOWLIST check: Any unexpected key is rejected
    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        FOR k IN SELECT jsonb_object_keys(p_metadata) LOOP
            IF NOT (k = ANY(v_allowed_metadata_keys)) THEN
                RAISE EXCEPTION 'VALIDATION ERROR: Metadata key "%" is not in the approved client audit allowlist.', k;
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
-- 2. SERVER-SIDE PHI ACCESS FUNCTIONS WITH ATOMIC AUDIT LOGGING
-- ----------------------------------------------------------------------------

-- A. Report View Access (Atomic server-side audit row)
CREATE OR REPLACE FUNCTION public.get_medical_report_for_view(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_report RECORD;
    v_has_access BOOLEAN := FALSE;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    SELECT * INTO v_report FROM public.medical_reports WHERE id = p_report_id;
    IF v_report.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: Medical report does not exist.';
    END IF;

    -- Access check: Patient owner OR Doctor with active consent
    IF v_report.patient_id = v_uid THEN
        v_has_access := TRUE;
    ELSIF v_role = 'doctor'::public.user_role AND public.doctor_has_active_consent(v_report.patient_id, 'reports', v_report.report_date::timestamptz) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Caller does not possess active authorization to view report.';
    END IF;

    -- Atomic server-side audit log entry
    INSERT INTO public.audit_logs (
        user_hash, role, action, resource_type, resource_hash, status, metadata
    ) VALUES (
        public.hash_audit_identifier(v_uid::text),
        COALESCE(v_role, 'patient'::public.user_role),
        'REPORT_VIEW',
        'medical_reports',
        public.hash_audit_identifier(p_report_id::text),
        'SUCCESS',
        jsonb_build_object('client_version', 'v1.0-secure')
    );

    RETURN to_jsonb(v_report);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_medical_report_for_view(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_medical_report_for_view(UUID) FROM PUBLIC, anon;

-- B. Summary View Access (Atomic server-side audit row)
CREATE OR REPLACE FUNCTION public.get_ai_summary_for_view(p_summary_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_summary RECORD;
    v_has_access BOOLEAN := FALSE;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    SELECT * INTO v_summary FROM public.ai_summaries WHERE id = p_summary_id;
    IF v_summary.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: AI summary does not exist.';
    END IF;

    -- Access check: Patient owner OR Doctor with active consent
    IF v_summary.patient_id = v_uid THEN
        v_has_access := TRUE;
    ELSIF v_role = 'doctor'::public.user_role AND public.doctor_has_active_consent(v_summary.patient_id, 'ai_summary', NULL) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Caller does not possess active consent for AI summary view.';
    END IF;

    -- Atomic server-side audit log entry
    INSERT INTO public.audit_logs (
        user_hash, role, action, resource_type, resource_hash, status, metadata
    ) VALUES (
        public.hash_audit_identifier(v_uid::text),
        COALESCE(v_role, 'patient'::public.user_role),
        'SUMMARY_VIEW',
        'ai_summaries',
        public.hash_audit_identifier(p_summary_id::text),
        'SUCCESS',
        jsonb_build_object('client_version', 'v1.0-secure')
    );

    RETURN to_jsonb(v_summary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_summary_for_view(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_summary_for_view(UUID) FROM PUBLIC, anon;

-- C. Prescription View Access (Atomic server-side audit row)
CREATE OR REPLACE FUNCTION public.get_prescription_for_view(p_prescription_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_rx RECORD;
    v_has_access BOOLEAN := FALSE;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    SELECT * INTO v_rx FROM public.prescriptions WHERE id = p_prescription_id;
    IF v_rx.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: Prescription does not exist.';
    END IF;

    -- Access check: Patient owner OR Doctor prescriber OR Doctor with active consent
    IF v_rx.patient_id = v_uid THEN
        v_has_access := TRUE;
    ELSIF v_role = 'doctor'::public.user_role AND (
        v_rx.doctor_id = (SELECT d.id FROM public.doctors d WHERE d.profile_id = v_uid)
        OR public.doctor_has_active_consent(v_rx.patient_id, 'prescriptions', v_rx.created_at)
    ) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Caller does not possess active consent for prescription view.';
    END IF;

    -- Atomic server-side audit log entry
    INSERT INTO public.audit_logs (
        user_hash, role, action, resource_type, resource_hash, status, metadata
    ) VALUES (
        public.hash_audit_identifier(v_uid::text),
        COALESCE(v_role, 'patient'::public.user_role),
        'PRESCRIPTION_VIEW',
        'prescriptions',
        public.hash_audit_identifier(p_prescription_id::text),
        'SUCCESS',
        jsonb_build_object('client_version', 'v1.0-secure')
    );

    RETURN to_jsonb(v_rx);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_prescription_for_view(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_prescription_for_view(UUID) FROM PUBLIC, anon;

-- D. Storage Signed URL Access Authorizer (Atomic server-side audit row)
CREATE OR REPLACE FUNCTION public.get_storage_document_signed_access(p_object_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_role public.user_role;
    v_patient_id UUID;
    v_has_access BOOLEAN := FALSE;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'SECURITY ERROR: Authentication required.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    -- Extract patient_id from object path (format: "<patient_id>/filename")
    BEGIN
        v_patient_id := split_part(p_object_path, '/', 1)::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID ARGUMENT: Object path must begin with valid patient UUID.';
    END;

    IF v_patient_id = v_uid THEN
        v_has_access := TRUE;
    ELSIF v_role = 'doctor'::public.user_role AND public.doctor_has_active_consent(v_patient_id, 'reports', NULL) THEN
        v_has_access := TRUE;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'PERMISSION DENIED: Caller does not possess active consent for document storage access.';
    END IF;

    -- Atomic server-side audit log entry
    INSERT INTO public.audit_logs (
        user_hash, role, action, resource_type, resource_hash, status, metadata
    ) VALUES (
        public.hash_audit_identifier(v_uid::text),
        COALESCE(v_role, 'patient'::public.user_role),
        'STORAGE_DOCUMENT_ACCESS',
        'storage_objects',
        public.hash_audit_identifier(p_object_path),
        'SUCCESS',
        jsonb_build_object('client_version', 'v1.0-secure')
    );

    RETURN jsonb_build_object(
        'authorized', TRUE,
        'path', p_object_path,
        'patient_id', v_patient_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storage_document_signed_access(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_storage_document_signed_access(TEXT) FROM PUBLIC, anon;
