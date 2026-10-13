-- ============================================================================
-- Migration 12: Restore Test State Helper for E2E and Test Idempotency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restore_test_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- 1. Restore Aarav consent
    UPDATE public.patient_consents
    SET status = 'ACTIVE',
        revoked_at = NULL,
        valid_from = NOW() - INTERVAL '1 day',
        valid_until = NOW() + INTERVAL '30 days',
        scopes = ARRAY['reports'::text, 'timeline'::text, 'ai_summary'::text, 'prescriptions'::text],
        lookback_months = 12
    WHERE id = 'f3000000-0000-0000-0000-000000000001';

    -- 2. Restore Aarav unverified biomarkers
    UPDATE public.biomarkers
    SET verified_by = NULL,
        verified_at = NULL
    WHERE report_id = 'f0000000-0000-0000-0000-000000000001';

    -- 3. Restore Aarav AI summary
    UPDATE public.ai_summaries
    SET review_status = 'DRAFT'::public.summary_review_status,
        reviewed_by_doctor_id = NULL,
        doctor_notes = NULL,
        reviewed_at = NULL
    WHERE id = 'f2000000-0000-0000-0000-000000000001';

    -- 4. Delete doctor_reviews on Aarav summary
    DELETE FROM public.doctor_reviews
    WHERE summary_id = 'f2000000-0000-0000-0000-000000000001';

    -- 5. Delete test medication dose logs
    DELETE FROM public.medication_dose_logs
    WHERE patient_id = 'a0000000-0000-0000-0000-000000000001';

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_test_state() TO anon, authenticated;
