-- ============================================================================
-- Medi Connect AI — Core Database Schema Migration
-- Migration: 20261012000001_core_schema.sql
-- Description: Establishes core clinical, administrative, billing, and audit tables
-- ============================================================================

-- Enable essential extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Enum Types
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('patient', 'doctor', 'hospital_staff', 'super_admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.processing_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Standardized Biomarker Severity: NORMAL, LOW, ELEVATED, CRITICAL (Aligned with Design System)
DO $$ BEGIN
    CREATE TYPE public.biomarker_severity AS ENUM ('NORMAL', 'LOW', 'ELEVATED', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.summary_review_status AS ENUM ('DRAFT', 'APPROVED', 'EDITED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.consent_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.appointment_status AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.food_timing AS ENUM ('BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.billing_flag_severity AS ENUM ('INFO', 'WARNING', 'ALERT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.dose_status AS ENUM ('TAKEN', 'MISSED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Universal Timestamp Trigger Function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Extends auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role public.user_role NOT NULL DEFAULT 'patient',
    full_name TEXT NOT NULL,
    phone TEXT,
    abha_id_mock TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Hardened Trigger: Prevent role escalation by clients
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        -- Strictly deny if the request is executed by an authenticated client
        IF current_user = 'authenticated' 
           OR current_setting('request.jwt.claim.role', true) = 'authenticated'
           OR (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role') = 'authenticated' THEN
            RAISE EXCEPTION 'PERMISSION DENIED: Client cannot modify account role.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Revoke direct role column updates from authenticated and anon
REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon;

-- Auto-provision profile on auth sign up (Strictly default to 'patient')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Strict Security: Always default to 'patient'. Ignore any client-provided role in raw_user_meta_data.
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Patient User'),
        'patient'::public.user_role
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. HOSPITALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL,
    accreditation_number TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_hospitals_updated_at
BEFORE UPDATE ON public.hospitals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. DOCTORS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctors (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    license_number TEXT NOT NULL UNIQUE,
    specialty TEXT NOT NULL,
    experience_years INT NOT NULL DEFAULT 1,
    consultation_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_doctors_updated_at
BEFORE UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. HOSPITAL STAFF
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hospital_staff (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    role_title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. MEDICAL REPORTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medical_reports (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    lab_name TEXT NOT NULL,
    report_date DATE NOT NULL,
    category TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    processing_status public.processing_status NOT NULL DEFAULT 'PENDING',
    ocr_confidence NUMERIC(5, 2),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_patient ON public.medical_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON public.medical_reports(report_date);

CREATE TRIGGER set_medical_reports_updated_at
BEFORE UPDATE ON public.medical_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6. REPORT PAGES (OCR Page Geometry & Coordinates for Evidence Grounding)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_pages (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES public.medical_reports(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    extracted_text TEXT NOT NULL,
    ocr_confidence NUMERIC(5, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_pages_report ON public.report_pages(report_id, page_number);

-- ----------------------------------------------------------------------------
-- 7. BIOMARKERS (Extracted & Evaluated Metrics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biomarkers (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES public.medical_reports(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    raw_value TEXT NOT NULL,
    numeric_value NUMERIC(12, 4),
    unit TEXT NOT NULL,
    normalized_unit TEXT,
    reference_interval_raw TEXT,
    interval_low NUMERIC(12, 4),
    interval_high NUMERIC(12, 4),
    severity public.biomarker_severity NOT NULL DEFAULT 'NORMAL',
    bounding_box JSONB, -- { page: 1, x_min: 10, y_min: 20, x_max: 100, y_max: 40 }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biomarkers_patient_name ON public.biomarkers(patient_id, name);
CREATE INDEX IF NOT EXISTS idx_biomarkers_report ON public.biomarkers(report_id);

-- ----------------------------------------------------------------------------
-- 8. AI SUMMARIES (Patient Explanations & Citations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_summaries (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES public.medical_reports(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    summary_type TEXT NOT NULL DEFAULT 'PATIENT_PLAIN_LANGUAGE',
    content_markdown TEXT NOT NULL,
    citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    red_flags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    gaps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_status public.summary_review_status NOT NULL DEFAULT 'DRAFT',
    reviewed_by_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    doctor_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_report ON public.ai_summaries(report_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_patient ON public.ai_summaries(patient_id);

CREATE TRIGGER set_ai_summaries_updated_at
BEFORE UPDATE ON public.ai_summaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 9. SUMMARY SOURCE LINKS (Visual Grounding Anchors)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.summary_source_links (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    summary_id UUID NOT NULL REFERENCES public.ai_summaries(id) ON DELETE CASCADE,
    report_page_id UUID NOT NULL REFERENCES public.report_pages(id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    bounding_box JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. PATIENT CONSENTS (Granular Scopes & Lookback Window per SCR-08)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_consents (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['reports', 'timeline', 'ai_summary', 'prescriptions'],
    lookback_months INT NOT NULL DEFAULT 12, -- Lookback window (e.g. past 12 months per SCR-08)
    status public.consent_status NOT NULL DEFAULT 'ACTIVE',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT chk_consent_target CHECK (doctor_id IS NOT NULL OR hospital_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_consents_patient ON public.patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_doctor ON public.patient_consents(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consents_active ON public.patient_consents(patient_id, doctor_id, status, valid_until);

-- ----------------------------------------------------------------------------
-- 11. DOCTOR BRIEFS (60-Second High-Density Cockpit Synthesis)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_briefs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    appointment_id UUID,
    chief_complaint TEXT NOT NULL,
    triage_level TEXT NOT NULL DEFAULT 'ROUTINE',
    brief_markdown TEXT NOT NULL,
    critical_biomarkers JSONB NOT NULL DEFAULT '[]'::jsonb,
    gaps_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_briefs_patient ON public.doctor_briefs(patient_id);

-- ----------------------------------------------------------------------------
-- 12. DOCTOR REVIEWS (Physician Sign-Off: Approve / Correct / Reject)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_reviews (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    summary_id UUID NOT NULL REFERENCES public.ai_summaries(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    decision public.summary_review_status NOT NULL,
    clinical_notes TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 13. MEDICAL TIMELINE EVENTS (Longitudinal History)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medical_timeline_events (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'REPORT_UPLOADED', 'CONSULTATION', 'DIAGNOSIS', 'PRESCRIPTION'
    title TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMPTZ NOT NULL,
    reference_id UUID, -- Links to medical_reports.id, appointments.id, etc.
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_patient_date ON public.medical_timeline_events(patient_id, event_date DESC);

-- ----------------------------------------------------------------------------
-- 14. APPOINTMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    slot_id UUID, -- Links to availability_slots
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    status public.appointment_status NOT NULL DEFAULT 'REQUESTED',
    chief_complaint TEXT,
    symptom_audio_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON public.appointments(doctor_id, appointment_date);

CREATE TRIGGER set_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 15. PRESCRIPTIONS & PRESCRIPTION ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    diagnosis TEXT,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    duration_days INT NOT NULL,
    food_timing public.food_timing NOT NULL DEFAULT 'AFTER_FOOD',
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 16. MEDICATIONS & ADHERENCE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    food_timing public.food_timing NOT NULL DEFAULT 'AFTER_FOOD',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    remaining_doses INT DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medication_reminders (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reminder_time TIME NOT NULL, -- e.g. '08:00:00'
    label TEXT NOT NULL DEFAULT 'Daily Dose',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medication_dose_logs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    taken_at TIMESTAMPTZ,
    status public.dose_status NOT NULL DEFAULT 'TAKEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 17. BILLING REVIEW MODULE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    file_path TEXT NOT NULL,
    has_discrepancies BOOLEAN NOT NULL DEFAULT false,
    audit_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    item_code TEXT,
    description TEXT NOT NULL,
    quantity NUMERIC(8, 2) NOT NULL DEFAULT 1.0,
    rate NUMERIC(10, 2) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    service_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_flags (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    bill_item_id UUID REFERENCES public.bill_items(id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL,
    severity public.billing_flag_severity NOT NULL DEFAULT 'WARNING',
    message TEXT NOT NULL,
    amount_delta NUMERIC(10, 2) DEFAULT 0.00,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 18. AUDIT LOGS (Immutable, Append-Only with Server-Side HMAC)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_hash TEXT NOT NULL,
    role public.user_role NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_hash TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    ip_hash TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);

-- Hardened Server-Side HMAC Hashing Function for Audit Trails
CREATE OR REPLACE FUNCTION public.hash_audit_identifier(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    v_secret := NULLIF(current_setting('app.settings.audit_secret', true), '');
    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION ERROR: app.settings.audit_secret is not set. Audit logging cannot proceed.';
    END IF;
    RETURN encode(
        extensions.hmac(
            p_input::bytea,
            v_secret::bytea,
            'sha256'
        ),
        'hex'
    );
END;
$$;

-- Trigger to guarantee audit_logs is append-only (No UPDATE or DELETE allowed)
CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'TAMPER ATTEMPT DETECTED: Audit logs are strictly immutable and cannot be updated or deleted.';
END;
$$;

CREATE OR REPLACE TRIGGER trg_prevent_audit_delete_stmt
BEFORE DELETE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_audit_tampering();

CREATE OR REPLACE TRIGGER trg_prevent_audit_update_stmt
BEFORE UPDATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_audit_tampering();
