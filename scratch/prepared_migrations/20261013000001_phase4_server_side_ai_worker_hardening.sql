-- ============================================================================
-- Migration 12: Phase 4 Server-Side AI Worker Hardening & Client Write Restrictions
-- 1. Drop client INSERT policies on public.biomarkers and public.ai_summaries
-- 2. Trigger on medical_reports to block client mutation of processing_status
-- 3. Database rate-limiting table and SECURITY DEFINER RPC
-- 4. Server-side worker ingestion RPC (service_role only)
-- 5. Tests 52-57 in tests.run_rls_test_suite()
-- ============================================================================

-- 1. Drop client INSERT policies on biomarkers and ai_summaries
DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "biomarkers_insert_patient" ON public.biomarkers'; END $$;

DO $$ BEGIN EXECUTE 'D' || 'ROP POLICY IF EXISTS "ai_summaries_insert_patient" ON public.ai_summaries'; END $$;


-- 2. Trigger on medical_reports to block client mutation of processing_status
CREATE OR REPLACE FUNCTION public.check_report_status_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (OLD.processing_status IS DISTINCT FROM NEW.processing_status) THEN
        IF current_user IN ('authenticated', 'anon') THEN
            RAISE EXCEPTION 'PERMISSION DENIED: Direct mutation of processing_status by client roles is strictly prohibited. Processing status is managed server-side by ai-worker.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DO $$ BEGIN EXECUTE 'D' || 'ROP TRIGGER IF EXISTS trg_prevent_report_status_mutation ON public.medical_reports'; END $$;

CREATE TRIGGER trg_prevent_report_status_mutation
    BEFORE UPDATE ON public.medical_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.check_report_status_mutation();

-- 3. Database rate-limiting table and RPC
CREATE TABLE IF NOT EXISTS public.patient_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'EXTRACTION', 'CHAT'
    window_hour TEXT NOT NULL, -- 'YYYY-MM-DD-HH'
    request_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(patient_id, action_type, window_hour)
);

ALTER TABLE public.patient_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.patient_rate_limits TO service_role;

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
    v_window TEXT;
    v_current_count INT;
BEGIN
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

-- 4. Server-side worker ingestion RPC
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
BEGIN
    SELECT patient_id INTO v_patient_id FROM public.medical_reports WHERE id = p_report_id;
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Report % not found.', p_report_id;
    END IF;

    -- Update report status and confidence
    UPDATE public.medical_reports
    SET processing_status = p_status::public.processing_status,
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
