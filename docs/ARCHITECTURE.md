# Medi Connect AI — System Architecture & Technical Specifications

**Project**: Medi Connect AI (AAYU Hackathon 2026, Problem Statement T01: AI-Assisted Medical Reports & Patient Care)  
**Version**: 2.0.0 (Phase 2 Consolidated Architecture)  
**Document Status**: Single Source of Truth for System Entities, Security, and Schema

---

## 1. Monorepo Structure

```
u:/aayu/
├── apps/
│   ├── web/                    # React 18 + Vite 6 + Tailwind CSS SPA
│   │   ├── src/
│   │   │   ├── lib/supabase.ts # Typed Supabase browser client
│   │   │   └── App.tsx         # Role-based workspace shell
│   │   └── package.json
│   └── mobile/                 # Expo SDK 52 + React Native 0.76.7 Shell
│       ├── src/
│       │   └── lib/supabase.ts # SecureStore-backed native Supabase client
│       └── package.json
├── packages/
│   └── shared/                 # Shared domain models, rules & tokens
│       ├── src/
│       │   ├── tokens.ts       # Compiled design tokens from docs/tokens.json
│       │   ├── types.ts        # Unified database entities & domain enums
│       │   ├── rules.ts        # "Rules-Before-Reasoning" deterministic validator
│       │   └── schemas.ts      # Zod validation schemas
│       └── package.json
├── supabase/
│   ├── migrations/
│   │   ├── 20261012000001_core_schema.sql           # Core tables, enums & role trigger
│   │   ├── 20261012000002_rls_policies.sql          # Hardened RLS & consent enforcement
│   │   ├── 20261012000003_storage_buckets.sql       # Private buckets (15MB limit) & storage RLS
│   │   └── 20261012000004_supplemental_tables.sql   # Slots, links, notes, chat & schemes
│   └── seed.sql                                     # Synthetic demonstration test data (hex UUIDs)
└── docs/                       # Architecture, specifications, design system
```

---

## 2. Unified Entity Architecture (29 Tables)

All entities in the database are documented below in one canonical list:

### Core Identity & Administration (Tables 1–4)
1. **`profiles`**: Extends `auth.users`. Contains user name, phone, mock ABHA ID, and server-enforced role (`patient`, `doctor`, `hospital_staff`, `super_admin`). Direct role mutation by clients is blocked via `prevent_role_escalation()` trigger and revoked column privileges.
2. **`hospitals`**: Accredited healthcare facilities (name, NABH accreditation number, city, state, contact).
3. **`doctors`**: Physician profiles (MCI/NMC registration number, specialty, experience years, consultation fee, biography).
4. **`hospital_staff`**: Administrative and clinical coordinators mapped to specific hospital facilities.

### Diagnostic Ingestion & Clinical Evidence (Tables 5–9)
5. **`medical_reports`**: Uploaded diagnostic lab records and imaging panels (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
6. **`report_pages`**: Extracted OCR text, page numbers, and coordinate geometries for evidence grounding.
7. **`biomarkers`**: Extracted clinical measurements (test name, raw value, normalized numeric value, units, laboratory reference intervals, bounding boxes, and severity rating).
8. **`ai_summaries`**: Grounded patient plain-language summaries with disclaimer `"AI ASSISTS, DOCTOR DECIDES"` and review status (`DRAFT`, `APPROVED`, `EDITED`, `REJECTED`).
9. **`summary_source_links`**: Interactive visual anchors linking summary claims directly to report page bounding boxes.

### Clinical Governance & Timeline (Tables 10–13)
10. **`patient_consents`**: Granular patient authorizations with SCR-08 scopes (`reports`, `timeline`, `ai_summary`, `prescriptions`), a lookback window (default 12 months), expiration timestamp, and immediate revocation.
11. **`doctor_briefs`**: 60-second synthesized clinical briefing notes highlighting chief complaints, abnormal biomarker deltas, and triage level.
12. **`doctor_reviews`**: Physician formal sign-off (`APPROVED`, `CORRECTED`, `REJECTED`) with clinical commentary.
13. **`medical_timeline_events`**: Chronological longitudinal health timeline (`REPORT_UPLOADED`, `CONSULTATION`, `DIAGNOSIS`, `PRESCRIPTION`).

### Clinical Consultations & Prescriptions (Tables 14–19)
14. **`appointments`**: Patient-doctor consultation bookings (`REQUESTED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`).
15. **`prescriptions`**: Formal electronic prescriptions signed by attending physicians.
16. **`prescription_items`**: Individual prescribed medications, dosages, frequencies, food timings, and durations.
17. **`medications`**: Active patient medication regimes with tracking for remaining doses.
18. **`medication_reminders`**: Configured daily alarm times (e.g. 08:00 AM, 20:00 PM).
19. **`medication_dose_logs`**: Patient adherence logs (`TAKEN`, `MISSED`, `SKIPPED`).

### Financial Transparency & Billing Review (Tables 20–22)
20. **`bills`**: Itemized hospital invoices uploaded for arithmetic and consistency review.
21. **`bill_items`**: Individual billed hospital line items (description, code, quantity, rate, amount).
22. **`billing_flags`**: Objective discrepancy alerts (`INFO`, `WARNING`, `ALERT`) flagging possible duplicate or unbundled charges.

### Supplemental Clinical Modules (Tables 23–28)
23. **`doctor_hospitals`**: Many-to-many links between doctors and hospital OPD departments with department designations and fee overrides.
24. **`availability_slots`**: Bookable doctor consultation calendar slots with date, start/end times, and capacity.
25. **`clinical_notes`**: Physician SOAP consultation notes (subjective, objective, assessment, plan) with private note controls.
26. **`conversations`**: Secure patient-to-doctor or patient-to-assistant chat sessions.
27. **`messages`**: Multi-turn dialogue messages with grounded source citations and optional audio attachments.
28. **`public_health_schemes`**: Public healthcare registry entries (e.g. Ayushman Bharat PM-JAY, RGHS) managed by Super Admin.

### Compliance & Security (Table 29)
29. **`audit_logs`**: Immutable, insert-only audit log with HMAC-SHA256 hashed user and resource identifiers. Contains zero PHI.

---

## 3. Biomarker Severity Standardization

To unify clinical accuracy with the UI Design System, biomarker status is standardized across the database, shared package, and UI as:

| Biomarker Status | Clinical Definition | Design System Mapping | UI Token / Color |
| :--- | :--- | :--- | :--- |
| **`NORMAL`** | Strictly within laboratory reference interval | Normal | `#10B981` (Emerald) |
| **`LOW`** | Below normal reference lower bound | Borderline / Low | `#3B82F6` (Clinical Blue) |
| **`ELEVATED`** | Above normal reference upper bound | Elevated / Borderline | `#F59E0B` (Amber) |
| **`CRITICAL`** | Exceeds critical safety thresholds ($\ge 1.4\times$ high or $\le 0.6\times$ low) | Critical / Red Flag | `#EF4444` (Crimson) |

**Rationale**: The Design System specifies `NORMAL`, `ELEVATED / BORDERLINE`, and `CRITICAL / RED FLAG`. In clinical laboratory science, values below reference ranges (such as hypoglycemia or thrombocytopenia) require distinct categorization from high values. The 4-state enum (`NORMAL`, `LOW`, `ELEVATED`, `CRITICAL`) provides unambiguous clinical precision while mapping directly to UI styling tokens.

---

## 4. Security & Hardening Architecture

### 4.1 Client Role Escalation Prevention
- **Database Trigger**: `public.prevent_role_escalation()` executes `BEFORE UPDATE ON public.profiles`. If `role` is modified by an `authenticated` client JWT, the transaction immediately raises an exception.
- **SQL Column Privileges**: `REVOKE UPDATE (role) ON public.profiles FROM authenticated, anon;` ensures clients cannot modify the column at the database engine level.
- **Registration Hardening**: `public.handle_new_user()` ignores any role claims in `raw_user_meta_data` and hardcodes `role := 'patient'::public.user_role`. Privileged roles (`doctor`, `hospital_staff`, `super_admin`) can only be granted via backend migration or admin tooling.

### 4.2 Security Definer Hardening
All `SECURITY DEFINER` functions:
- Explicitly declare `SET search_path = ''` to prevent search path hijacking attacks.
- Fully qualify every database entity (`public.profiles`, `public.patient_consents`, `auth.uid()`, etc.).
- Validate caller role before granting access (e.g. `doctor_has_active_consent()` verifies caller has `role = 'doctor'`).

### 4.3 Granular Consent & Lookback Window (SCR-08)
Doctor access to clinical records is gated by `public.doctor_has_active_consent(p_patient_id, p_required_scope, p_record_date)`:
- **Scopes**: Enforces specific scopes (`'reports'`, `'timeline'`, `'ai_summary'`, `'prescriptions'`).
- **Lookback Window**: When a record date is provided, verifies that `p_record_date >= NOW() - (lookback_months || ' months')::interval`.
- **Immediate Revocation**: Checking the live database record on each query guarantees zero-latency revocation and immediate expiration enforcement.

### 4.4 Immutable Audit Logging (HMAC-SHA256)
- Identifiers are hashed using HMAC-SHA256 with a server-side secret: `public.hash_audit_identifier(input)`.
- RLS permits **INSERT-only** for authenticated callers, and **SELECT-only** for `super_admin`.
- Trigger `public.prevent_audit_tampering()` prevents any `UPDATE` or `DELETE` operations from any user.

### 4.5 Standardized Upload Size Limit (SCR-03)
- Storage bucket `patient-medical-documents` is configured with a strict **15MB (15,728,640 bytes)** file size limit, exactly matching SCR-03 specifications.

---

## 5. Technology Stack & Host Environment

| Component | Standard / Version | Architectural Justification |
| :--- | :--- | :--- |
| **Node.js** | `v25.9.0` | High-performance JavaScript runtime on host. |
| **Package Manager** | `pnpm 12.11.2` | Workspace linking, strict dependency isolation. |
| **Web Framework** | `React 18.3.1` + `Vite 6.1.0` | Fast client SPA with direct Supabase RLS integration. |
| **Styling** | `Tailwind CSS 3.4.17` | Utility-first CSS with clinical design system tokens. |
| **Mobile Framework** | `Expo SDK 52` (`React Native 0.76.7`) | Cross-platform mobile shell with SecureStore auth persistence. |
| **Database Server** | `PostgreSQL 17.11` | Supabase managed database in `ap-south-1` (Mumbai, India). |
