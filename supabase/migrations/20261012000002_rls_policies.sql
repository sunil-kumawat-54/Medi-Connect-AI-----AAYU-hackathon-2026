-- ============================================================================
-- Medi Connect AI — Row Level Security (RLS) & Access Policies
-- Migration: 20261012000002_rls_policies.sql
-- Description: Enables RLS on ALL core tables with hardened, consent-bound policies
-- ============================================================================

-- 1. Enable RLS on all core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biomarkers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summary_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_dose_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. HARDENED SECURITY DEFINER HELPER FUNCTIONS (SET search_path = '')
-- ----------------------------------------------------------------------------

-- Current authenticated user role helper
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Hardened Doctor Consent Verifier
-- Verifies: Caller is verified doctor, consent is ACTIVE, unrevoked, unexpired,
-- matches required scope, and matches lookback window.
CREATE OR REPLACE FUNCTION public.doctor_has_active_consent(
    p_patient_id UUID,
    p_required_scope TEXT,
    p_record_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_is_doctor BOOLEAN;
    v_has_consent BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Strictly verify the caller is actually a doctor in public.profiles
    SELECT (role = 'doctor') INTO v_is_doctor
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_is_doctor IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 2. Check for an ACTIVE, unrevoked, unexpired consent grant matching required scope
    SELECT EXISTS (
        SELECT 1
        FROM public.patient_consents pc
        JOIN public.doctors d ON d.id = pc.doctor_id
        WHERE pc.patient_id = p_patient_id
          AND d.profile_id = v_caller_id
          AND pc.status = 'ACTIVE'
          AND pc.revoked_at IS NULL
          AND NOW() >= pc.valid_from
          AND NOW() <= pc.valid_until
          AND p_required_scope = ANY(pc.scopes)
          AND (
              p_record_date IS NULL
              OR pc.lookback_months IS NULL
              OR p_record_date >= (NOW() - (pc.lookback_months || ' months')::interval)
          )
    ) INTO v_has_consent;

    RETURN COALESCE(v_has_consent, FALSE);
END;
$$;

-- Hospital staff membership verifier
CREATE OR REPLACE FUNCTION public.is_staff_at_hospital(p_hospital_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.hospital_staff
        WHERE hospital_id = p_hospital_id AND profile_id = auth.uid()
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. PROFILES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_or_consented_doctor"
ON public.profiles FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR public.doctor_has_active_consent(id, 'reports')
);

CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. HOSPITALS & DIRECTORIES
-- ----------------------------------------------------------------------------
CREATE POLICY "hospitals_select_all"
ON public.hospitals FOR SELECT TO authenticated
USING (true);

CREATE POLICY "hospitals_update_staff"
ON public.hospitals FOR UPDATE TO authenticated
USING (public.is_staff_at_hospital(id));

CREATE POLICY "doctors_select_all"
ON public.doctors FOR SELECT TO authenticated
USING (true);

CREATE POLICY "doctors_update_own"
ON public.doctors FOR UPDATE TO authenticated
USING (profile_id = auth.uid());

CREATE POLICY "hospital_staff_select"
ON public.hospital_staff FOR SELECT TO authenticated
USING (profile_id = auth.uid() OR public.is_staff_at_hospital(hospital_id));

-- ----------------------------------------------------------------------------
-- 5. PATIENT CONSENTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "consents_select_parties"
ON public.patient_consents FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
);

CREATE POLICY "consents_insert_patient"
ON public.patient_consents FOR INSERT TO authenticated
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "consents_update_patient"
ON public.patient_consents FOR UPDATE TO authenticated
USING (patient_id = auth.uid())
WITH CHECK (patient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. MEDICAL REPORTS & PAGES POLICIES (Enforces 'reports' Scope & Lookback)
-- ----------------------------------------------------------------------------
CREATE POLICY "reports_select_patient_or_consented_doctor"
ON public.medical_reports FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'reports', report_date::timestamptz)
);

CREATE POLICY "reports_insert_patient"
ON public.medical_reports FOR INSERT TO authenticated
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "reports_update_patient"
ON public.medical_reports FOR UPDATE TO authenticated
USING (patient_id = auth.uid());

CREATE POLICY "reports_delete_patient"
ON public.medical_reports FOR DELETE TO authenticated
USING (patient_id = auth.uid());

CREATE POLICY "report_pages_select"
ON public.report_pages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.medical_reports r
        WHERE r.id = report_id
          AND (
              r.patient_id = auth.uid()
              OR public.doctor_has_active_consent(r.patient_id, 'reports', r.report_date::timestamptz)
          )
    )
);

-- ----------------------------------------------------------------------------
-- 7. BIOMARKERS POLICIES (Enforces 'reports' Scope)
-- ----------------------------------------------------------------------------
CREATE POLICY "biomarkers_select_patient_or_consented_doctor"
ON public.biomarkers FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'reports', created_at)
);

CREATE POLICY "biomarkers_insert_patient"
ON public.biomarkers FOR INSERT TO authenticated
WITH CHECK (patient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 8. AI SUMMARIES & CITATIONS POLICIES (Enforces 'ai_summary' Scope)
-- ----------------------------------------------------------------------------
CREATE POLICY "ai_summaries_select_patient_or_consented_doctor"
ON public.ai_summaries FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'ai_summary', created_at)
);

CREATE POLICY "ai_summaries_doctor_update_review"
ON public.ai_summaries FOR UPDATE TO authenticated
USING (public.doctor_has_active_consent(patient_id, 'ai_summary'));

CREATE POLICY "summary_source_links_select"
ON public.summary_source_links FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.ai_summaries s
        WHERE s.id = summary_id
          AND (
              s.patient_id = auth.uid()
              OR public.doctor_has_active_consent(s.patient_id, 'ai_summary', s.created_at)
          )
    )
);

-- ----------------------------------------------------------------------------
-- 9. DOCTOR BRIEFS & REVIEWS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "doctor_briefs_select_patient_or_consented_doctor"
ON public.doctor_briefs FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'ai_summary', created_at)
);

CREATE POLICY "doctor_briefs_insert_doctor"
ON public.doctor_briefs FOR INSERT TO authenticated
WITH CHECK (public.doctor_has_active_consent(patient_id, 'ai_summary'));

CREATE POLICY "doctor_reviews_select"
ON public.doctor_reviews FOR SELECT TO authenticated
USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.ai_summaries s
        WHERE s.id = summary_id AND s.patient_id = auth.uid()
    )
);

CREATE POLICY "doctor_reviews_insert_doctor"
ON public.doctor_reviews FOR INSERT TO authenticated
WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 10. MEDICAL TIMELINE POLICIES (Enforces 'timeline' Scope)
-- ----------------------------------------------------------------------------
CREATE POLICY "timeline_select_patient_or_consented_doctor"
ON public.medical_timeline_events FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'timeline', event_date)
);

CREATE POLICY "timeline_insert_patient"
ON public.medical_timeline_events FOR INSERT TO authenticated
WITH CHECK (patient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. APPOINTMENTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "appointments_select_parties"
ON public.appointments FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
);

CREATE POLICY "appointments_insert_patient"
ON public.appointments FOR INSERT TO authenticated
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "appointments_update_parties"
ON public.appointments FOR UPDATE TO authenticated
USING (
    patient_id = auth.uid()
    OR doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
);

-- ----------------------------------------------------------------------------
-- 12. PRESCRIPTIONS & MEDICATIONS (Enforces 'prescriptions' Scope)
-- ----------------------------------------------------------------------------
CREATE POLICY "prescriptions_select_patient_or_consented_doctor"
ON public.prescriptions FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'prescriptions')
);

CREATE POLICY "prescriptions_insert_doctor"
ON public.prescriptions FOR INSERT TO authenticated
WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE profile_id = auth.uid())
    AND public.doctor_has_active_consent(patient_id, 'prescriptions')
);

CREATE POLICY "prescription_items_select"
ON public.prescription_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.prescriptions p
        WHERE p.id = prescription_id
          AND (
              p.patient_id = auth.uid()
              OR public.doctor_has_active_consent(p.patient_id, 'prescriptions')
          )
    )
);

CREATE POLICY "medications_select_patient_or_consented_doctor"
ON public.medications FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR public.doctor_has_active_consent(patient_id, 'prescriptions')
);

CREATE POLICY "medications_all_patient"
ON public.medications FOR ALL TO authenticated
USING (patient_id = auth.uid());

CREATE POLICY "reminders_all_patient"
ON public.medication_reminders FOR ALL TO authenticated
USING (patient_id = auth.uid());

CREATE POLICY "dose_logs_all_patient"
ON public.medication_dose_logs FOR ALL TO authenticated
USING (patient_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 13. BILLING REVIEW MODULE POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "bills_select_patient_or_staff"
ON public.bills FOR SELECT TO authenticated
USING (
    patient_id = auth.uid()
    OR (hospital_id IS NOT NULL AND public.is_staff_at_hospital(hospital_id))
);

CREATE POLICY "bill_items_select"
ON public.bill_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.bills b
        WHERE b.id = bill_id
          AND (
              b.patient_id = auth.uid()
              OR (b.hospital_id IS NOT NULL AND public.is_staff_at_hospital(b.hospital_id))
          )
    )
);

CREATE POLICY "billing_flags_select"
ON public.billing_flags FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.bills b
        WHERE b.id = bill_id
          AND (
              b.patient_id = auth.uid()
              OR (b.hospital_id IS NOT NULL AND public.is_staff_at_hospital(b.hospital_id))
          )
    )
);

-- ----------------------------------------------------------------------------
-- 14. AUDIT LOGS POLICIES (Append-Only, Zero UPDATE/DELETE)
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_logs_insert_authenticated"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.current_user_role() = 'super_admin');

-- Strictly NO UPDATE policy exists on public.audit_logs
-- Strictly NO DELETE policy exists on public.audit_logs
