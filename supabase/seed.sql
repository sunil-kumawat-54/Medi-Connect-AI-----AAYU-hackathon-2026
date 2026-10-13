-- ============================================================================
-- Medi Connect AI — Synthetic Demo Seed Data
-- STRICT NOTICE: All names, numbers, license IDs, and patient records are 
-- 100% synthetic mock demonstration data for hackathon evaluation only.
-- All identifiers are strictly hex-only RFC 4122 compliant UUIDs.
-- ============================================================================

-- 1. Create Demo Users in auth.users
-- Passwords are read dynamically from database setting app.settings.demo_password if set,
-- or fallback to a standard development demonstration salt. Never commit production passwords.
DO $$
DECLARE
    v_demo_password TEXT;
BEGIN
    v_demo_password := NULLIF(current_setting('app.settings.demo_password', true), '');
    IF v_demo_password IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION ERROR: app.settings.demo_password is not set. Seed data cannot be applied without a configured demo password.';
    END IF;

    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data, created_at, updated_at)
    VALUES 
        -- Patient A (Aarav Sharma - DEMO)
        ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
         'patient.aarav@mediconnect.demo', crypt(v_demo_password, gen_salt('bf')), NOW(), '', '', '', '', '{"full_name": "Aarav Sharma (DEMO)"}'::jsonb, NOW(), NOW()),
        
        -- Patient B (Sunita Verma - DEMO)
        ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
         'patient.sunita@mediconnect.demo', crypt(v_demo_password, gen_salt('bf')), NOW(), '', '', '', '', '{"full_name": "Sunita Verma (DEMO)"}'::jsonb, NOW(), NOW()),

        -- Doctor (Dr. Alex Morgan - DEMO)
        ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
         'doctor.alex@mediconnect.demo', crypt(v_demo_password, gen_salt('bf')), NOW(), '', '', '', '', '{"full_name": "Dr. Alex Morgan (DEMO)"}'::jsonb, NOW(), NOW()),

        -- Hospital Staff (Priya Nair - DEMO) — Using hex-compliant c000...
        ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
         'staff.priya@mediconnect.demo', crypt(v_demo_password, gen_salt('bf')), NOW(), '', '', '', '', '{"full_name": "Priya Nair (DEMO)"}'::jsonb, NOW(), NOW()),

        -- Super Admin (Govt Oversight Officer - DEMO) — Using hex-compliant e000...
        ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
         'admin.officer@mediconnect.demo', crypt(v_demo_password, gen_salt('bf')), NOW(), '', '', '', '', '{"full_name": "Oversight Officer (DEMO)"}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 2. Explicitly provision profiles (Role assignment performed via admin seed)
INSERT INTO public.profiles (id, email, role, full_name, phone, abha_id_mock)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'patient.aarav@mediconnect.demo', 'patient', 'Aarav Sharma (DEMO)', '9876543210', 'aarav@abdm-demo'),
    ('a0000000-0000-0000-0000-000000000002', 'patient.sunita@mediconnect.demo', 'patient', 'Sunita Verma (DEMO)', '9876543211', 'sunita@abdm-demo'),
    ('d0000000-0000-0000-0000-000000000001', 'doctor.alex@mediconnect.demo', 'doctor', 'Dr. Alex Morgan, MD (DEMO)', '9876543212', NULL),
    ('c0000000-0000-0000-0000-000000000001', 'staff.priya@mediconnect.demo', 'hospital_staff', 'Priya Nair (DEMO)', '9876543213', NULL),
    ('e0000000-0000-0000-0000-000000000001', 'admin.officer@mediconnect.demo', 'super_admin', 'Public Health Oversight (DEMO)', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    abha_id_mock = EXCLUDED.abha_id_mock;

-- 3. Synthetic Hospital (Using hex UUID b000...)
INSERT INTO public.hospitals (id, name, accreditation_number, city, state, phone, address)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'City Care Multi-Specialty Hospital (DEMO)',
    'NABH-DEMO-2026-918',
    'Jaipur',
    'Rajasthan',
    '+91-141-2550100',
    'Plot 12, Medical Enclave, JLN Marg, Jaipur'
) ON CONFLICT (id) DO NOTHING;

-- 4. Synthetic Doctor Profile
INSERT INTO public.doctors (id, profile_id, license_number, specialty, experience_years, consultation_fee, bio)
VALUES (
    'd1000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'MCI-DEMO-84920',
    'Cardiology & Metabolic Health',
    14,
    800.00,
    'Consultant Cardiologist specializing in diabetic cardiovascular risk and preventative medicine. (DEMO)'
) ON CONFLICT (id) DO NOTHING;

-- 5. Synthetic Hospital Staff Profile (Using hex UUID c100...)
INSERT INTO public.hospital_staff (id, profile_id, hospital_id, department, role_title)
VALUES (
    'c1000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Patient Administration & Records',
    'Chief Records Officer (DEMO)'
) ON CONFLICT (id) DO NOTHING;

-- 6. Synthetic Doctor-Hospital Affiliation
INSERT INTO public.doctor_hospitals (id, doctor_id, hospital_id, department, consultation_fee, is_primary, is_active)
VALUES (
    'f4000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Cardiology Department',
    800.00,
    true,
    true
) ON CONFLICT (id) DO NOTHING;

-- 7. Synthetic Availability Slot
INSERT INTO public.availability_slots (id, doctor_id, hospital_id, slot_date, start_time, end_time, max_patients, is_booked)
VALUES (
    'f5000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    CURRENT_DATE + INTERVAL '1 day',
    '10:00:00',
    '10:30:00',
    1,
    false
) ON CONFLICT (id) DO NOTHING;

-- 8. Synthetic Patient Report for Patient A
INSERT INTO public.medical_reports (
    id, patient_id, title, lab_name, report_date, category, 
    file_path, file_type, file_size_bytes, processing_status, ocr_confidence
) VALUES (
    'f0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Comprehensive Metabolic & Lipid Panel (DEMO)',
    'Apex Diagnostics & Clinical Labs (DEMO)',
    CURRENT_DATE - INTERVAL '14 days',
    'Biochemistry',
    'a0000000-0000-0000-0000-000000000001/demo_lab_report_01.pdf',
    'application/pdf',
    1428570,
    'COMPLETED',
    96.50
) ON CONFLICT (id) DO NOTHING;

-- 9. Synthetic Report Page
INSERT INTO public.report_pages (id, report_id, page_number, extracted_text, ocr_confidence)
VALUES (
    'f0100000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    1,
    'APEX DIAGNOSTICS LAB - PATIENT: Aarav Sharma. Fasting Blood Sugar: 142 mg/dL. HbA1c: 7.8 %. Serum Cholesterol: 245 mg/dL.',
    96.50
) ON CONFLICT (id) DO NOTHING;

-- 10. Synthetic Biomarkers (Standardized: NORMAL, LOW, ELEVATED, CRITICAL)
INSERT INTO public.biomarkers (
    id, report_id, patient_id, name, raw_value, numeric_value, unit, 
    normalized_unit, reference_interval_raw, interval_low, interval_high, severity, bounding_box
) VALUES 
    (
        'f1000000-0000-0000-0000-000000000001',
        'f0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'HbA1c (Glycated Hemoglobin)',
        '7.8',
        7.8000,
        '%',
        '%',
        '4.0 - 5.6',
        4.0000,
        5.6000,
        'ELEVATED',
        '{"page": 1, "x_min": 120, "y_min": 240, "x_max": 480, "y_max": 265}'::jsonb
    ),
    (
        'f1000000-0000-0000-0000-000000000002',
        'f0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'Fasting Blood Glucose',
        '142',
        142.0000,
        'mg/dL',
        'mg/dL',
        '70 - 99',
        70.0000,
        99.0000,
        'ELEVATED',
        '{"page": 1, "x_min": 120, "y_min": 280, "x_max": 480, "y_max": 305}'::jsonb
    ),
    (
        'f1000000-0000-0000-0000-000000000003',
        'f0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'Total Cholesterol',
        '245',
        245.0000,
        'mg/dL',
        'mg/dL',
        '< 200',
        0.0000,
        200.0000,
        'ELEVATED',
        '{"page": 1, "x_min": 120, "y_min": 320, "x_max": 480, "y_max": 345}'::jsonb
    )
ON CONFLICT (id) DO NOTHING;

-- 11. Synthetic AI Summary
INSERT INTO public.ai_summaries (
    id, report_id, patient_id, version, summary_type, content_markdown,
    citations_json, red_flags_json, gaps_json, review_status
) VALUES (
    'f2000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    1,
    'PATIENT_PLAIN_LANGUAGE',
    'Your HbA1c is 7.8%, which is above the standard non-diabetic range of 4.0-5.6%. This indicates elevated average blood sugar levels over the past 3 months. Your Fasting Blood Glucose is also elevated at 142 mg/dL. Discuss these values with Dr. Alex Morgan to evaluate metabolic management.',
    '[{"claim": "HbA1c is 7.8%", "page": 1, "box": [120, 240, 480, 265]}]'::jsonb,
    '["HbA1c > 7.0% requires clinical follow-up"]'::jsonb,
    '["Lipid panel lacks HDL/LDL fractionation"]'::jsonb,
    'DRAFT'
) ON CONFLICT (id) DO NOTHING;

-- 12. Synthetic Patient Consent (Patient A grants active consent to Dr. Alex Morgan)
-- Matches SCR-08 granular scopes: reports, timeline, ai_summary, prescriptions with 12m lookback
INSERT INTO public.patient_consents (
    id, patient_id, doctor_id, scopes, lookback_months, status, valid_from, valid_until
) VALUES (
    'f3000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    ARRAY['reports', 'timeline', 'ai_summary', 'prescriptions'],
    12,
    'ACTIVE',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '30 days'
) ON CONFLICT (id) DO NOTHING;

-- 13. Synthetic Public Health Scheme
INSERT INTO public.public_health_schemes (
    id, scheme_code, scheme_name, description, eligibility_criteria, coverage_details, helpline_number, official_portal_url
) VALUES (
    'f6000000-0000-0000-0000-000000000001',
    'PMJAY-DEMO',
    'Ayushman Bharat Pradhan Mantri Jan Arogya Yojana (PM-JAY) (DEMO)',
    'Government health protection scheme providing secondary and tertiary care hospitalization coverage. (DEMO)',
    'Families identified under SECC database and rural/urban deprivations. (DEMO)',
    'Up to ₹5,00,000 per family per year across empaneled public and private hospitals nationwide. (DEMO)',
    '14555',
    'https://pmjay.gov.in'
) ON CONFLICT (id) DO NOTHING;
