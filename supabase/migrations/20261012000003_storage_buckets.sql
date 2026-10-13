-- ============================================================================
-- Medi Connect AI — Private Storage Buckets & Storage RLS
-- Migration: 20261012000003_storage_buckets.sql
-- Description: Creates encrypted private buckets with 15MB limit (SCR-03) and consent RLS
-- ============================================================================

-- 1. Create Private Storage Buckets (Standardized 15MB upload limit per SCR-03)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    (
        'patient-medical-documents', 
        'patient-medical-documents', 
        false, 
        15728640, -- Exactly 15MB in bytes (15 * 1024 * 1024) consistent with SCR-03
        ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    ),
    (
        'medical-exports', 
        'medical-exports', 
        false, 
        15728640, -- 15MB
        ARRAY['application/pdf', 'application/json']::text[]
    ),
    (
        'hospital-invoices', 
        'hospital-invoices', 
        false, 
        15728640, -- 15MB
        ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    )
ON CONFLICT (id) DO UPDATE SET 
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. STORAGE RLS POLICIES FOR 'patient-medical-documents'
-- ----------------------------------------------------------------------------

-- Patient Upload: Must upload to their own user folder: <patient_id>/filename.ext
CREATE POLICY "patient_storage_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'patient-medical-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Patient Read: Read own documents
-- Doctor Read: Read patient document IF doctor has active consent with 'reports' scope
CREATE POLICY "patient_storage_select_own_or_consented_doctor"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'patient-medical-documents'
    AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.doctor_has_active_consent(
            ((storage.foldername(name))[1])::uuid, 
            'reports'
        )
    )
);

-- Patient Delete: Delete own documents
CREATE POLICY "patient_storage_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'patient-medical-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ----------------------------------------------------------------------------
-- 3. STORAGE RLS POLICIES FOR 'medical-exports'
-- ----------------------------------------------------------------------------
CREATE POLICY "exports_storage_manage_own"
ON storage.objects FOR ALL TO authenticated
USING (
    bucket_id = 'medical-exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ----------------------------------------------------------------------------
-- 4. STORAGE RLS POLICIES FOR 'hospital-invoices'
-- ----------------------------------------------------------------------------
CREATE POLICY "invoices_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'hospital-invoices'
    AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.current_user_role() = 'hospital_staff'
    )
);

CREATE POLICY "invoices_storage_insert_staff"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'hospital-invoices'
    AND public.current_user_role() = 'hospital_staff'
);
