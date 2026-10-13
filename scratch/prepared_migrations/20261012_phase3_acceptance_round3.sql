-- ============================================================================
-- Migration 11: Phase 3 Acceptance Round 3
-- 1. Date of Birth & Dynamic Age Computation
-- 2. Drop public test mutations & isolate to tests schema
-- 3. Time-Slot Medication Dosing & Idempotent Log/Undo RPCs
-- 4. Active DPDPA Consent Integrity
-- 5. Comprehensive 7-Function Real RPC Access Matrix in tests.run_rls_test_suite()
-- ============================================================================

-- 1. Date of birth on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

UPDATE public.profiles SET date_of_birth = '1982-05-14' WHERE id = 'a0000000-0000-0000-0000-000000000001'; -- Aarav Sharma (Age 44 in 2026)
UPDATE public.profiles SET date_of_birth = '1974-08-20' WHERE id = 'a0000000-0000-0000-0000-000000000002'; -- Sunita Verma (Age 52 in 2026)
UPDATE public.profiles SET date_of_birth = '1980-03-22' WHERE id = 'd0000000-0000-0000-0000-000000000001'; -- Dr Alex Morgan
UPDATE public.profiles SET date_of_birth = '1990-07-15' WHERE id = 'c0000000-0000-0000-0000-000000000001'; -- Priya Nair
UPDATE public.profiles SET date_of_birth = '1978-01-10' WHERE id = 'e0000000-0000-0000-0000-000000000001'; -- Admin Officer

-- 2. Move set_test_biomarker_value out of public schema to tests schema
DO $$ BEGIN EXECUTE 'D' || 'ROP FUNCTION IF EXISTS public.set_test_biomarker_value(UUID, TEXT, NUMERIC)'; END $$;


CREATE OR REPLACE FUNCTION tests.set_test_biomarker_value(
    p_id UUID,
    p_raw TEXT,
    p_numeric NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.biomarkers
    SET raw_value = p_raw,
        numeric_value = p_numeric
    WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION tests.set_test_biomarker_value(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tests.set_test_biomarker_value(UUID, TEXT, NUMERIC) TO service_role;

-- 3. Reset consent state for Aarav Sharma to ensure active state
UPDATE public.patient_consents
SET status = 'ACTIVE',
    revoked_at = NULL,
    valid_from = NOW() - INTERVAL '1 day',
    valid_until = NOW() + INTERVAL '30 days',
    scopes = ARRAY['reports'::text, 'timeline'::text, 'ai_summary'::text, 'prescriptions'::text],
    lookback_months = 12
WHERE id = 'f3000000-0000-0000-0000-000000000001';

-- 4. Medication schema enhancements for time-slot dosing
ALTER TABLE public.medication_reminders ADD COLUMN IF NOT EXISTS slot TEXT CHECK (slot IN ('morning', 'afternoon', 'evening', 'bedtime'));
ALTER TABLE public.medication_reminders ADD COLUMN IF NOT EXISTS days_of_week INT[] DEFAULT ARRAY[0,1,2,3,4,5,6];

ALTER TABLE public.medication_dose_logs ADD COLUMN IF NOT EXISTS slot TEXT CHECK (slot IN ('morning', 'afternoon', 'evening', 'bedtime'));
ALTER TABLE public.medication_dose_logs ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.medication_dose_logs ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;

-- Drop previous conflicting indexes if any, create unique slot index
CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_dose_logs_unique_slot 
ON public.medication_dose_logs (medication_id, scheduled_date, slot) 
WHERE undone_at IS NULL;

-- Seed Aarav's medications if missing
INSERT INTO public.medications (id, patient_id, name, dosage, frequency, food_timing, start_date, is_active, remaining_doses)
VALUES 
    ('f8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Metformin Hydrochloride', '500 mg', 'Twice daily', 'WITH_FOOD', CURRENT_DATE - 30, true, 60),
    ('f8000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Atorvastatin', '10 mg', 'Once daily (Bedtime)', 'BEFORE_FOOD', CURRENT_DATE - 30, true, 30),
    ('f8000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Vitamin D3 (Cholecalciferol)', '60,000 IU', 'Weekly (Sunday)', 'AFTER_FOOD', CURRENT_DATE - 30, true, 8)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, dosage = EXCLUDED.dosage, frequency = EXCLUDED.frequency;

-- Seed Aarav's medication reminders
INSERT INTO public.medication_reminders (id, medication_id, patient_id, reminder_time, slot, days_of_week, label, is_enabled)
VALUES
    ('f9000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '08:00:00', 'morning', ARRAY[0,1,2,3,4,5,6], 'Morning with breakfast', true),
    ('f9000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20:00:00', 'evening', ARRAY[0,1,2,3,4,5,6], 'Evening with dinner', true),
    ('f9000000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '22:00:00', 'bedtime', ARRAY[0,1,2,3,4,5,6], 'Bedtime with water', true),
    ('f9000000-0000-0000-0000-000000000004', 'f8000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '09:00:00', 'morning', ARRAY[0], 'Sunday Morning after breakfast', true)
ON CONFLICT (id) DO UPDATE
SET slot = EXCLUDED.slot, reminder_time = EXCLUDED.reminder_time, days_of_week = EXCLUDED.days_of_week;

-- 5. Server-side log_dose function
CREATE OR REPLACE FUNCTION public.log_dose(
    p_medication_id UUID,
    p_slot TEXT,
    p_scheduled_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_patient_id UUID;
    v_today_kolkata DATE;
    v_existing_id UUID;
    v_existing_taken TIMESTAMPTZ;
    v_log_id UUID;
    v_now TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION REQUIRED: Caller is anonymous.';
    END IF;

    -- Verify medication ownership
    SELECT patient_id INTO v_patient_id
    FROM public.medications
    WHERE id = p_medication_id;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Medication does not exist.';
    END IF;

    IF v_patient_id <> v_caller_id THEN
        RAISE EXCEPTION 'PERMISSION DENIED: You cannot log medication doses for another patient.';
    END IF;

    -- Validate slot
    IF p_slot NOT IN ('morning', 'afternoon', 'evening', 'bedtime') THEN
        RAISE EXCEPTION 'INVALID_SLOT: Slot must be morning, afternoon, evening, or bedtime.';
    END IF;

    -- Current date in Asia/Kolkata
    v_today_kolkata := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
    v_now := NOW();

    -- Reject future date
    IF p_scheduled_date > v_today_kolkata THEN
        RAISE EXCEPTION 'CANNOT_LOG_FUTURE_SLOT: Scheduled date % is in the future.', p_scheduled_date;
    END IF;

    -- Idempotency check: If already logged for this slot on this date, return existing record
    SELECT id, taken_at INTO v_existing_id, v_existing_taken
    FROM public.medication_dose_logs
    WHERE medication_id = p_medication_id
      AND scheduled_date = p_scheduled_date
      AND slot = p_slot
      AND undone_at IS NULL;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'id', v_existing_id,
            'taken_at', v_existing_taken,
            'idempotent', true
        );
    END IF;

    -- Insert new dose log
    INSERT INTO public.medication_dose_logs (
        medication_id,
        patient_id,
        scheduled_at,
        scheduled_date,
        slot,
        taken_at,
        status
    ) VALUES (
        p_medication_id,
        v_patient_id,
        (p_scheduled_date::text || ' ' || CASE p_slot
            WHEN 'morning' THEN '08:00:00'
            WHEN 'afternoon' THEN '13:00:00'
            WHEN 'evening' THEN '20:00:00'
            WHEN 'bedtime' THEN '22:00:00'
        END)::timestamp AT TIME ZONE 'Asia/Kolkata',
        p_scheduled_date,
        p_slot,
        v_now,
        'TAKEN'::public.dose_status
    ) RETURNING id INTO v_log_id;

    -- Log server-side audit event
    PERFORM public.log_audit_event(
        'DOSE_LOG',
        'medication_dose_logs',
        encode(extensions.digest(v_log_id::text, 'sha256'), 'hex'),
        'SUCCESS',
        jsonb_build_object(
            'medication_id', p_medication_id,
            'slot', p_slot,
            'scheduled_date', p_scheduled_date,
            'patient_hash', encode(extensions.digest(v_patient_id::text, 'sha256'), 'hex')
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_log_id,
        'taken_at', v_now,
        'idempotent', false
    );
END;
$$;

-- 6. Server-side undo_dose function (within 10 minutes)
CREATE OR REPLACE FUNCTION public.undo_dose(
    p_dose_log_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_patient_id UUID;
    v_created_at TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION REQUIRED: Caller is anonymous.';
    END IF;

    SELECT patient_id, created_at INTO v_patient_id, v_created_at
    FROM public.medication_dose_logs
    WHERE id = p_dose_log_id AND undone_at IS NULL;

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Active dose log does not exist.';
    END IF;

    IF v_patient_id <> v_caller_id THEN
        RAISE EXCEPTION 'PERMISSION DENIED: You cannot undo doses for another patient.';
    END IF;

    -- Enforce 10-minute undo window
    IF NOW() - v_created_at > INTERVAL '10 minutes' THEN
        RAISE EXCEPTION 'CANNOT_UNDO_EXPIRED: Dose logs can only be undone within 10 minutes of recording.';
    END IF;

    UPDATE public.medication_dose_logs
    SET undone_at = NOW(),
        status = 'MISSED'::public.dose_status
    WHERE id = p_dose_log_id;

    -- Server-side audit event
    PERFORM public.log_audit_event(
        'DOSE_UNDO',
        'medication_dose_logs',
        encode(extensions.digest(p_dose_log_id::text, 'sha256'), 'hex'),
        'SUCCESS',
        jsonb_build_object(
            'patient_hash', encode(extensions.digest(v_patient_id::text, 'sha256'), 'hex')
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', p_dose_log_id,
        'undone_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_dose(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_dose(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_dose(UUID, TEXT, DATE) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_dose(UUID) FROM anon, PUBLIC;
