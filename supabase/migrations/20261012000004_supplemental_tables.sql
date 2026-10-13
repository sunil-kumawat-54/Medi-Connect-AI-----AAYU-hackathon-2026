-- ============================================================================
-- Medi Connect AI — Supplemental Tables & Policies Migration
-- Migration: 20261012000004_supplemental_tables.sql
-- Description: Establishes availability slots, doctor hospital links, clinical notes,
--              conversations, messages, and public health schemes with full RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DOCTOR HOSPITALS (Doctor Affiliations & Links)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_hospitals (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
    department TEXT NOT NULL DEFAULT 'General Medicine',
    consultation_fee NUMERIC(10, 2),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(doctor_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_hospitals_doc ON public.doctor_hospitals(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_hospitals_hosp ON public.doctor_hospitals(hospital_id);

CREATE TRIGGER set_doctor_hospitals_updated_at
BEFORE UPDATE ON public.doctor_hospitals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.doctor_hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_hospitals_select_all"
ON public.doctor_hospitals FOR SELECT TO authenticated
USING (true);

CREATE POLICY "doctor_hospitals_manage_doctor_or_staff"
ON public.doctor_hospitals FOR ALL TO authenticated
USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR public.is_staff_at_hospital(hospital_id)
);

-- ----------------------------------------------------------------------------
-- 2. AVAILABILITY SLOTS (Doctor Appointment Slots)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_slots (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_patients INT NOT NULL DEFAULT 1,
    is_booked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor_date ON public.availability_slots(doctor_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_hospital_date ON public.availability_slots(hospital_id, slot_date);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "availability_slots_select_all"
ON public.availability_slots FOR SELECT TO authenticated
USING (true);

CREATE POLICY "availability_slots_manage_doctor"
ON public.availability_slots FOR ALL TO authenticated
USING (doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. CLINICAL NOTES (SOAP Clinical Records)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinical_notes (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    subjective TEXT,
    objective TEXT,
    assessment TEXT NOT NULL,
    plan TEXT NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false, -- Private doctor-only annotations
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON public.clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_doctor ON public.clinical_notes(doctor_id);

CREATE TRIGGER set_clinical_notes_updated_at
BEFORE UPDATE ON public.clinical_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_notes_select"
ON public.clinical_notes FOR SELECT TO authenticated
USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR (patient_id = auth.uid() AND is_private = false)
    OR (
        public.doctor_has_active_consent(patient_id, 'reports', created_at)
        AND is_private = false
    )
);

CREATE POLICY "clinical_notes_insert_doctor"
ON public.clinical_notes FOR INSERT TO authenticated
WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
);

CREATE POLICY "clinical_notes_update_doctor"
ON public.clinical_notes FOR UPDATE TO authenticated
USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 4. CONVERSATIONS & MESSAGES (Secure Patient-Doctor Communication)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Consultation Query',
    language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_patient ON public.conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_doctor ON public.conversations(doctor_id);

CREATE TRIGGER set_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_parties"
ON public.conversations FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
);

CREATE POLICY "conversations_insert_patient_or_doctor"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (
    patient_id = auth.uid()
    OR doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('patient', 'doctor', 'staff', 'assistant', 'system')),
    content TEXT NOT NULL,
    audio_url TEXT,
    citations_json JSONB DEFAULT '[]'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_conversation_parties"
ON public.messages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND (
              c.patient_id = auth.uid()
              OR c.doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
              OR (c.hospital_id IS NOT NULL AND public.is_staff_at_hospital(c.hospital_id))
          )
    )
);

CREATE POLICY "messages_insert_sender"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND (
              c.patient_id = auth.uid()
              OR c.doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
              OR (c.hospital_id IS NOT NULL AND public.is_staff_at_hospital(c.hospital_id))
          )
    )
);

-- ----------------------------------------------------------------------------
-- 5. PUBLIC HEALTH SCHEMES (Government & State Health Initiatives)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_health_schemes (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    scheme_code TEXT NOT NULL UNIQUE,
    scheme_name TEXT NOT NULL,
    description TEXT NOT NULL,
    eligibility_criteria TEXT NOT NULL,
    coverage_details TEXT,
    helpline_number TEXT,
    official_portal_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_public_health_schemes_updated_at
BEFORE UPDATE ON public.public_health_schemes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.public_health_schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_health_schemes_select_all"
ON public.public_health_schemes FOR SELECT TO authenticated
USING (is_active = true OR public.current_user_role() = 'super_admin');

CREATE POLICY "public_health_schemes_manage_super_admin"
ON public.public_health_schemes FOR ALL TO authenticated
USING (public.current_user_role() = 'super_admin');
