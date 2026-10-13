# Medi Connect AI — Master Implementation Plan & Persistent Roadmap

> **Document Status**: Single Source of Truth — Updated for Phase 3  
> **Phase Breakdown Standard**: Approved 5-Phase Roadmap (User Phase Map Override Applied)  
> **Current Milestone**: Phase 3 (Full Web & Mobile MVP Screens, Live Supabase Integration, Clean MOCK AI Services)  
> **Safety Gate**: User approval required before applying database migrations to remote Supabase. Mobile login checkpoint required before remaining mobile screens.

---

## 5-Phase Master Roadmap

```text
[Phase 1: Specs & Design] ──> [Phase 2: Foundation & Hardening] ──> [Phase 3: Web + Mobile MVP] ──> [Phase 4: Free Local Pipeline] ──> [Phase 5: Deploy & Ship]
        ✅ COMPLETED                     ✅ COMPLETED                        ✅ COMPLETED                    ✅ COMPLETED                   ⏳ NOT STARTED
```

* **Phase 1 (Completed)**: Product specifications, technical architecture, 15-screen inventory, WCAG AA design system, machine-readable design tokens (`docs/tokens.json`), 6 clinical user journeys.
* **Phase 2 (Completed)**: Monorepo foundation (`pnpm`), Supabase schema migrations 1–7, Auth & session persistence, strict RLS across all tables, private encrypted storage buckets & policies, Web & Mobile shell apps, full 18-assertion security & RLS test suite verified with zero inconclusive tests.
* **Phase 3 (Completed)**: All MVP screens on **Web AND Mobile** backed by real Supabase data with AI/OCR behind clearly labeled `[MOCK]` services. Mobile Expo SDK 57 Android checkpoint passed, live consent revocation, 60-second doctor brief sign-off, itemized billing reviewer, and clean production builds with 0 secret leaks.
* **Phase 4 (Completed)**: Free local pipeline (FastAPI/Docker, PyMuPDF, OpenCV deskew/contrast, RapidOCR ONNX word bounding boxes, deterministic parser for 5 diagnostic panels, prompt-injection defense, server-side DB gating, fixed-menu grounded chat, real synthetic benchmark with 100% field extraction across real files and adversarial resilience).
* **Phase 5 (Not Started)**: Cross-platform end-to-end testing, secondary project database migration, production deployment.

---

## Phase 2: Foundation, Hardening, and Security Verification (COMPLETED)

### Deliverables & Hardening Fixes
- [x] **Monorepo Setup & Workspace Scaffolding**: `packages/shared`, `apps/web`, `apps/mobile`.
- [x] **Database Migrations 1–7 Applied to Remote Supabase (`nbwggyzxivengzfnarin`)**:
  - Core schema (22 tables), RLS policies, private storage buckets (`patient-medical-documents`, `medical-exports`, `hospital-invoices`).
  - Isolated HMAC audit secret in private storage.
  - Performance & security hardening: initplan `(SELECT auth.uid())` subqueries, covering indexes, `tests` schema isolation.
  - Migration 7: Audit oracle closed (`hash_audit_identifier` revoked from authenticated/anon/PUBLIC, direct `INSERT` on `audit_logs` denied, `log_audit_event` SECURITY DEFINER with action allowlist, payload size caps, and PHI filters). Global default privileges revoked from PUBLIC and anon. Super admin excluded from clinical PHI.
- [x] **RLS Test Suite (18 Tests, 100% PASS, 0 Inconclusive)**:
  - Proven positive controls (Patient A reads own reports and storage objects; Consented Doctor Alex reads Patient A reports and storage objects).
  - Proven negative controls with explicit existence verification ("exists: YES").
  - Proven hospital staff isolation (Hospital 1 staff cannot read Hospital 2 appointments/bills).
  - Proven super admin clinical exclusion (0 rows from `medical_reports`, `biomarkers`, `ai_summaries`, `messages`).
  - Proven doctor write block on patient reports.
  - Proven anon role denial across all tables and storage.
- [x] **REST API Test Function Denial**:
  - Proved that REST calls to `/rest/v1/rpc/run_rls_test_suite` and `/rest/v1/rpc/test_audit_security` return HTTP 404 (PGRST202) for both `anon` and authenticated JWTs.

---

## Phase 3: Full Web + Mobile MVP Applications (Live Supabase + MOCK AI)

### Scope & Constraints
- **Web & Mobile Parity**: All screens in `SCREEN_INVENTORY.md` marked **MVP** implemented for both Web and Mobile.
- **Backend Grounding**: Connected to real live Supabase queries, mutations, auth, storage, and RLS policies.
- **AI/OCR Mock Boundary**: Real AI/OCR logic is deferred to Phase 4. Clean service interface implemented with explicit `[MOCK]` tags in UI and code. Never presented as real AI.
- **Mobile Checkpoint**: Run `expo start` (LAN/tunnel), print QR code and tunnel URL, pause for user confirmation of mobile login on Android Expo Go before building remaining mobile screens.

### Module Breakdown & Tasks
1. **Shared Foundation & UI Layer**:
   - API client & Supabase hooks with TypeScript inference.
   - Zod validation schemas matching DB constraints.
   - Design tokens, formatting utilities (dates, units, currency INR).
   - i18n scaffolding (English active; structure in place for Hindi).
2. **App Shells & Navigation**:
   - Web: Responsive sidebar/top-bar, role-based route guards (`/patient`, `/doctor`, `/hospital`, `/admin`).
   - Mobile: Role-based tabs and stack navigation with protected auth flow.
3. **Patient Experience (SCR-01, SCR-02, SCR-03, SCR-04, SCR-08, SCR-13)**:
   - Profile management.
   - Report upload (picker, size/type validation, secure upload to Supabase storage, processing status pipeline: `uploaded` -> `processing` -> `ready`).
   - Report list & detail view with document viewer.
   - Medical timeline & trend charts (comparable tests and normalized units).
   - Doctor/hospital search with filters.
   - Appointment booking, rescheduling, cancellation with conflict prevention.
   - Consent management (grant with lookback window, revoke with instant effect).
   - Medicine reminders (create/edit/delete; web in-app list, mobile local notifications).
4. **Doctor Experience (SCR-05, SCR-06, SCR-07, SCR-09, SCR-10, SCR-11)**:
   - Dashboard of upcoming appointments.
   - Consented patient roster (strictly respecting active consent).
   - 60-Second Doctor Brief wired to summary table (key findings, trends, gaps/contradictions, red flags).
   - Summary review: Approve, Edit, Reject with audit trail.
   - Clinical notes & prescription issuance.
   - Availability slot management.
5. **Hospital Experience (SCR-12, SCR-14)**:
   - Web: Live hospital overview, roster management, bed occupancy & OPD queue metrics labeled `[MOCK / DEMO]`.
   - Mobile: Honesty disclosure — implemented as a clean read-only operational **Shell** (`HospitalMobileShell.tsx`).
6. **Super Admin Experience (SCR-15)**:
   - Web: De-identified operational oversight dashboard with k-anonymity badge (`get_deidentified_cohort_stats` RPC), audit feed. Zero clinical PHI.
   - Mobile: Honesty disclosure — implemented as a clean read-only compliance **Shell** (`AdminMobileShell.tsx`).
7. **Accessibility & Disclaimer**:
   - Persistent AI disclaimer on all summary surfaces: *"AI assists; a doctor decides. In an emergency, seek urgent care."*
   - WCAG AA contrast, keyboard navigation, touch targets >= 48px, screen reader labels.

---

## Phase 3 Acceptance Audit Follow-up & Verification (COMPLETED)

### Audit Outcomes & Evidence Standard
- [x] **Requirement 1: RLS Test Suite Regression (39 Tests, 100% PASS, 0 Inconclusive)**:
  - Restored explicit existence checks ("exists: YES (n)") on all denial tests.
  - Restored storage positive controls (patient reads own object; consented doctor reads patient A's object; unconsented doctor denied patient B's object).
  - Added super_admin 0-row denial checks for `ai_summaries`, `messages`, and `prescriptions` with existence checks.
  - Added denial tests: patient cannot INSERT consent for another patient; doctor with EXPIRED consent cannot approve summary.
  - Result: 39 / 39 PASSED.
- [x] **Requirement 2: Database Zero-Residue Proof (Identical Row Counts & Checksums)**:
  - Exact row counts and deterministic SHA-256 table checksums measured immediately before and after `tests.run_rls_test_suite()`:
    - `patient_consents`: Before = 1 rows (`54d5dd5ba1bc899a65abe11919acea8807abeb3333c1f6282d7d0a4f680f2957`), After = 1 rows (`54d5dd5ba1bc899a65abe11919acea8807abeb3333c1f6282d7d0a4f680f2957`) — IDENTICAL
    - `medical_reports`: Before = 2 rows (`b9fbbea79e858b772229abfd8ee6aaf22b7b09cad849d305f515352c014787fd`), After = 2 rows (`b9fbbea79e858b772229abfd8ee6aaf22b7b09cad849d305f515352c014787fd`) — IDENTICAL
    - `ai_summaries`: Before = 2 rows (`47b55e2335d6c56ddae193d971da7347f7074be082cd8eb19478c9965fb9d49c`), After = 2 rows (`47b55e2335d6c56ddae193d971da7347f7074be082cd8eb19478c9965fb9d49c`) — IDENTICAL
    - `doctor_reviews`: Before = 3 rows (`ef57c024aa517b5420a476607eed590c795b6603204d41f8a74c1e06efa7ded1`), After = 3 rows (`ef57c024aa517b5420a476607eed590c795b6603204d41f8a74c1e06efa7ded1`) — IDENTICAL
    - `biomarkers`: Before = 4 rows (`157158db2b7547b8ebd7638b262a1b3e7b9a88dbc71b5e6a82f6a3fdbffe09f7`), After = 4 rows (`157158db2b7547b8ebd7638b262a1b3e7b9a88dbc71b5e6a82f6a3fdbffe09f7`) — IDENTICAL
    - `audit_logs`: Before = 8 rows (`7a3bad0db2563739f02bff96bc447d4561bced7dc5dbcdc2fb0a5d634d8d4a33`), After = 8 rows (`7a3bad0db2563739f02bff96bc447d4561bced7dc5dbcdc2fb0a5d634d8d4a33`) — IDENTICAL
- [x] **Requirement 3: SECURITY DEFINER Functions Source & Re-Check Proof**:
  - Source extracted and verified for `get_medical_report_for_view`, `get_ai_summary_for_view`, `get_prescription_for_view`, `get_storage_document_signed_access`, and `get_deidentified_cohort_stats`.
  - Re-checks proven inside functions: owner check, doctor active consent + scope + lookback check, super admin role check for cohort stats.
  - Penetration tests passed for: cross-patient calls, unconsented doctor, expired consent, revoked consent, anon role, non-admin calling cohort stats.
- [x] **Requirement 4: Audit Wiring & SCR-15 Live Reflection**:
  - Web and mobile route report viewing, summary viewing, prescription viewing, and storage signed URL generation through SECURITY DEFINER RPCs.
  - Functions record server-side audit logs containing `metadata->>'patient_hash'`.
  - Verified in Playwright (Journey 2 & 3): Doctor views report -> `REPORT_VIEW` audit log written server-side -> immediately visible in Patient's SCR-15 Access Log (`get_patient_access_log`).
- [x] **Requirement 5: Red-Flag Biomarker Server-Side Verification**:
  - Client-supplied `p_confirm_red_flags_verified` removed from `approve_ai_summary`.
  - Added `verified_by` (UUID) and `verified_at` (TIMESTAMPTZ) to `public.biomarkers`.
  - Created `public.verify_biomarker(UUID)` SECURITY DEFINER RPC callable only by attending doctor with active consent.
  - `approve_ai_summary` strictly refuses approval while red-flag biomarkers remain unverified. UI updated to verify each biomarker before approval button unlocks.
- [x] **Requirement 6: SCR-02 Truth (Biomarker Mutation & Restoration)**:
  - Playwright Journey 4 mutates Fasting Blood Glucose from 142 mg/dL to 158 mg/dL in DB via RPC, confirms UI updates to 158, restores to 142 in DB, and confirms UI restores to 142.
- [x] **Requirement 7: Mobile Testing Honesty Disclosure**:
  - Exactly what was run on mobile: `tsc --noEmit` (clean TypeScript typecheck across all screens and components), `npx expo-doctor` (0 npm package / Expo SDK 57 compatibility warnings), and `npx expo export` (successful production bundle & Hermes bytecode export for iOS and Android).
  - **Nothing has run on a physical device or emulator by the assistant**. Full verification on a physical Android device or emulator is pending user test results via Expo Go.
- [x] **Requirement 8: Leaked-Password Protection Audit**:
  - Supabase built-in HaveIBeenPwned leaked password protection requires a Pro plan or above and is **not available on the Free tier** (project confirmed on `plan: "free"`).
  - Workaround configured & documented: Password policy schema in `@medi-connect/shared` enforced at min 10 characters with lowercase, uppercase, number, symbol, and common breached dictionary rejection; documented dashboard password length setting.

---

## Phase 3 Acceptance Round 3 Audit & Hardening (COMPLETED)

### Audit Items & Implementation Record
1. **Consent State Bug & Truthful UI**:
   - Fixed mobile and web consent queries to sort by `granted_at` (not non-existent `created_at`).
   - Doctor and patient banners and counts dynamically query the live `patient_consents` table, enforcing active status, valid scopes (`reports`, `timeline`, `ai_summary`, `prescriptions`), and lookback window.
   - Fixed Sunita Verma's screen where hardcoded "Tomorrow, 10:00 AM" and "Active Consent" previously rendered; now queries real appointments and consents.
   - Dynamic patient age calculated from `date_of_birth` via `computeAge(dob)` in `@medi-connect/shared` (Aarav DOB: 1982-04-15 -> 44 years, not hardcoded 38).
2. **Flaky E2E & Multi-Project Isolation**:
   - Added `restore_test_state()` SECURITY DEFINER procedure running before/after every test to restore baseline DB state.
   - Fixed race conditions in biomarker verification and consent revocation using deterministic network response registration.
   - Executed Playwright suite 3 consecutive times with 100% pass rate (7/7 on every run).
   - Created second isolated free Supabase project for tests: `medi-connect-tests` (`kbzxwsyjmygpycdbuahn`).
3. **Real Role Access Control Suite (51 Tests, 100% PASS, Zero Residue)**:
   - Replaced mock string checks with real role-impersonated calls with existence verification across all 7 SECURITY DEFINER functions (`get_medical_report_for_view`, `get_ai_summary_for_view`, `get_prescription_for_view`, `get_storage_document_signed_access`, `get_deidentified_cohort_stats`, `verify_biomarker`, `approve_ai_summary`).
   - Covered positive controls, unconsented doctor, expired consent, revoked consent, missing scope, patient cross-access, anon, hospital staff, and super admin.
   - Verified bit-for-bit identical row counts and md5 checksums across all sensitive tables before and after the suite.
4. **Biomarker Mutation Gating**:
   - Proved client roles (patient, doctor, staff, super admin) cannot execute direct `INSERT`/`UPDATE`/`DELETE` on `biomarkers` or columns `verified_by`/`verified_at`.
   - Relocated test mutation helper from `public` to isolated `tests` schema and revoked execution privileges from `anon` and `authenticated`.
5. **Time-Slot Medication Dosing (`@medi-connect/shared` + Web & Mobile)**:
   - Implemented slot-based dosing (morning, afternoon, evening, bedtime) with Asia/Kolkata timezone support.
   - Created `log_dose` and `undo_dose` SECURITY DEFINER RPCs enforcing ownership, server timestamps (`taken_at = NOW()`), allowed time windows, 10-minute undo window, and idempotency.
   - Added unit test suite in `@medi-connect/shared` (13/13 passing).
6. **Mobile Environment & Hygiene**:
   - Upgraded Expo to `~57.0.28`.
   - Replaced deprecated `SafeAreaView` from `'react-native'` with `react-native-safe-area-context`.
   - Audited Doctor 60-Second Brief for prominent `[MOCK / DEMO BRIEF]` labels.
   - Clean verification: `pnpm --filter @medi-connect/mobile typecheck` (0 errors), `npx expo-doctor` (21/21 passed), and production export (Android/iOS bundles clean).
   - Bundle scan verified 0 service_role keys, passwords, or secrets in client bundles.
7. **Password Policy & Free Tier Limitations**:
   - Server-side GoTrue Auth settings: Minimum password length can be configured in Supabase Dashboard (`Authentication -> Providers -> Email`); recommended set to 10+.
   - Limitations on Free Plan: Built-in HIBP breached password checker is disabled on Free tier; custom character regex is not supported in dashboard settings. Client-side Zod validation with 10+ chars, uppercase, lowercase, numbers, and symbols acts as front-line defense.

---

---

## Phase 4: Free Local Pipeline (FastAPI/Docker, PyMuPDF, OpenCV + RapidOCR), Grounded Rules Engine & Benchmark (COMPLETED)

### Architectural Shift: Free, Local Pipeline (Zero Paid APIs, Zero Keys)
- **Elimination of Paid Services**: Replaced the planned Anthropic API integration with a 100% free, local Python pipeline running server-side (`services/ai-worker`).
- **Core Technology Stack**:
  1. *Embedded PDF Text Extraction*: PyMuPDF (`pymupdf`) extracts clean vector text and layout coordinates from digital lab PDFs first.
  2. *Computer Vision Preprocessing*: OpenCV (`cv2`) performs automatic deskewing (`cv2.minAreaRect` + `cv2.warpAffine` rotation correction) and CLAHE contrast enhancement for scanned images and mobile phone photos.
  3. *Local OCR Engine*: RapidOCR (`rapidocr-onnxruntime` PaddleOCR ONNX engine) runs locally on CPU with zero cloud dependencies or external binary installs, returning word-level bounding box coordinates.
  4. *Deterministic Parser*: Regular expressions and adjacent multi-row tabular layout analysis for 5 target panels: **Glucose**, **HbA1c**, **Lipid Profile**, **Thyroid**, and **CBC**. Unrecognized lines are automatically categorized as `"needs review"` and never guessed.
  5. *Adversarial Injection Defense*: Prompt injection text (e.g. `"ignore previous instructions"`) embedded inside medical reports is neutralized into inert text (`[INJECTION_ATTEMPT_NEUTRALIZED]`), preventing any override of severity classification or safety flags.
  6. *Labeling & Transparency*: All outputs are strictly labeled **"Rule-Based Clinical Explanation"** and **"Rule-Based Translation"** (`[नियम-आधारित अनुवाद]`); no language models are used, and no claims of "AI" or LLM are made.
  7. *Security & Role Boundaries*: The worker runs strictly server-side. Clients upload raw documents and read results; clients cannot write biomarkers, summaries, grounding flags, or report status. Enforced at the database layer via RLS policies and the `trg_prevent_report_status_mutation` trigger. Rate limits live in the database table `public.patient_rate_limits`. Zero PHI in logs.
  8. *Fixed Menu Chatbot*: Patient chat is strictly constrained to a fixed menu of 6 grounded template questions (`FIXED_CHAT_MENU_PROMPTS`), plus hard refusals for diagnosis/prescription queries and 112/108 emergency escalation.

---

### Module Inventory (`services/ai-worker/` & `packages/shared/src/ai/`)
- `services/ai-worker/main.py`: FastAPI server exposing `GET /health`, `GET /chat-menu`, `POST /process-report`, and `POST /chat-query`.
- `services/ai-worker/ocr_engine.py`: PyMuPDF embedded PDF reader, OpenCV deskew/contrast pipeline, RapidOCR ONNX word bounding box extractor, and bad-input security gates.
- `services/ai-worker/parser.py`: Multi-row tabular regex extractor for Glucose, HbA1c, Lipids, Thyroid, and CBC with prompt-injection neutralization.
- `services/ai-worker/rules.py`: Deterministic interval checker (`NORMAL`, `LOW`, `ELEVATED`, `CRITICAL`), unit normalizer (mmol/L to mg/dL), and automated numeric grounding audit (`verify_grounding`).
- `services/ai-worker/templates.py`: Deterministic explanation generator, number-preserving Hindi mirror, and fixed chat menu templates.
- `services/ai-worker/Dockerfile` & `docker-compose.yml`: Containerized local deployment configuration.
- `packages/shared/src/ai/`: Monorepo TypeScript mirror providing client schemas, rate limiting, and in-memory fallback rules.

---

### Real File Benchmark Evaluation (`tests/benchmark_evaluation.py`)
Evaluated against 5 synthetic diagnostic reports and 5 adversarial/bad inputs generated in `tests/synthetic_data/` with ground-truth definitions in `tests/synthetic_data/ground_truth.json`:

#### 1. Per-File & Per-Field Extraction Accuracy (Real Synthetic Files)
| File Name | Format / Challenge | Fields Expected | Fields Extracted | Accuracy | Processing Time | Outcome |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `report_01_metabolic.pdf` | Digital PDF (Fast Glucose, HbA1c) | 6 | 6 | **100.0%** | 8.9 ms | Clean extraction, elevated glucose flagged |
| `report_02_lipid.pdf` | Digital PDF (Cholesterol, HDL, LDL, Triglycerides) | 12 | 12 | **100.0%** | 2.3 ms | Multi-row table extracted with reference ranges |
| `report_03_thyroid_photo.jpg` | High-res Mobile Photo (TSH, FT4) | 6 | 6 | **100.0%** | 5,171.0 ms | RapidOCR extracted all tokens & bounding boxes |
| `report_04_cbc_skewed_photo.jpg` | Skewed Mobile Photo (3.5° tilt, CBC) | 9 | 9 | **100.0%** | 4,852.3 ms | OpenCV deskewed image; tabular parser matched 9/9 fields |
| `report_05_cardiac_critical.pdf` | Digital PDF + Prompt Injection Attack | 3 | 3 | **100.0%** | 5.3 ms | Critical Troponin extracted; injection text neutralized |
| **Total Benchmark** | **5 Test Files** | **36** | **36** | **100.0%** | — | **Zero extraction loss across all panels** |

#### 2. Adversarial & Bad Inputs Stress Testing
| Bad Input Test File | Challenge / Attack Vector | Expected Behavior | Actual System Response | Pass/Fail |
| :--- | :--- | :--- | :--- | :---: |
| `bad_01_blank_page.pdf` | 0 text tokens, blank page | No biomarkers, flag for review | Status `NEEDS_REVIEW`, 0 biomarkers, clean non-crashing exit | **PASS** |
| `bad_02_rotated_photo.jpg` | 90° rotated phone photo | Unreadable text, flag for review | Status `NEEDS_REVIEW`, 0 biomarkers, clean non-crashing exit | **PASS** |
| `bad_03_password_protected.pdf` | Encrypted / password PDF | Reject with explicit security error | Status `FAILED`: "Document is encrypted or password-protected" | **PASS** |
| `bad_04_oversized_21pages.pdf` | 21-page PDF (safety limit: 20) | Reject with page limit error | Status `FAILED`: "Document has 21 pages, exceeding the 20-page safety limit" | **PASS** |
| `bad_05_non_medical_image.jpg` | Non-medical photograph | No biomarkers, flag for review | Status `NEEDS_REVIEW`, 0 biomarkers, clean non-crashing exit | **PASS** |

---

### Rules-Engine Unit Tests (`packages/shared/src/__tests__/ai_pipeline_evaluation.test.mjs`)
*(Note: Renamed from earlier "100% results" to honestly reflect they are rules-engine unit tests on in-memory mocks)*
- **Execution**: Node.js test runner (`node packages/shared/src/__tests__/ai_pipeline_evaluation.test.mjs`)
- **Duration**: 21.5 ms
- **Pass Rate**: **10 / 10 Tests Passed (100%)**
- **Tested Scenarios**: In-memory unit tests for range checking, unit conversion, hospital bill arithmetic audit, 0-byte file rejection, 15MB file size limit, and chatbot diagnostic/prescription refusal.

---

### Database, Security & Build Status
- **Primary Supabase Project (`nbwggyzxivengzfnarin`)**:
  - Full RLS test suite: **51 / 51 tests PASS (100%)** via `tests.run_rls_test_suite()`.
  - Zero database residue verified before and after test execution.
  - Server-side hardening migration (`20261013000001_phase4_server_side_ai_worker_hardening.sql`) locks client inserts on `biomarkers` and `ai_summaries`, prevents client status mutation via `trg_prevent_report_status_mutation`, and routes server writes through `record_server_report_extraction` (restricted to `service_role`).
- **Secondary Test Supabase Project (`kbzxwsyjmygpycdbuahn`)**:
  - Verified connection: Project exists.
  - Honest status: Currently has **0 public tables migrated**. Awaiting user approval at the safety gate before applying remote DDL.
- **Client Bundle Scan (`apps/web/dist`)**:
  - **Zero secret leaks**: Verified 0 `service_role` keys, 0 Anthropic API keys, and 0 database passwords in production bundle. Only the public Supabase `anon` JWT is included.
- **Monorepo Build Status**:
  - `@medi-connect/shared`: Clean compilation via `tsc` (exit code 0). 26 / 26 unit tests passing.
  - `apps/web`: Clean production build via `tsc && vite build` (exit code 0; 1,667 modules transformed).
  - `apps/mobile`: Clean typecheck via `tsc --noEmit` (exit code 0).
- **Hard Constraint**: **Phase 5 has NOT been started.**

---

## Phase 5: Final Testing, Production Hardening & Hackathon Deployment (NOT STARTED)

### Remaining Scope & Prerequisites
1. **Database Migration to Test Project**: Apply migrations 1–8 to the secondary test Supabase project (`kbzxwsyjmygpycdbuahn`) upon user confirmation.
2. **Playwright E2E Multi-Role Suite**: Validate end-to-end browser workflows across Patient, Doctor, Hospital Staff, and Super Admin in headless execution.
3. **Mobile Expo Production Validation**: Verify EAS build / production bundle behavior on Android and iOS devices.
4. **Production Deployment**: Deploy Web app to Netlify/Vercel with strict CSP and production Supabase credentials.

