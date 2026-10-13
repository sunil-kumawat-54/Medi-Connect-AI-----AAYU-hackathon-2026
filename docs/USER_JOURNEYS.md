# Medi Connect AI — End-to-End User Journeys & Clinical Workflows

> **Document Status**: Finalized Baseline (Phase 1)  
> **Traceability**: All 15 Screens in [`SCREEN_INVENTORY.md`](file:///u:/aayu/docs/SCREEN_INVENTORY.md) map 1-to-1 to steps within these journeys.

---

## 1. Journey 1: Patient Report Upload, Rule Validation & Source-Linked Understanding

### 1.1 Actors & Objective
* **Actor**: Patient ("Aarav Sharma")
* **Goal**: Digitally store a recent blood test, extract test values accurately, and understand what the results indicate without clinical confusion or anxiety.

### 1.2 Step-by-Step Flow
1. **Entry**: Patient signs into `Medi Connect AI` via Email/Password or Mock Aadhaar/ABHA SSO on `SCR-01`.
2. **Dashboard Overview**: Lands on `SCR-02` (Patient Dashboard); sees greeting, upcoming schedule, and clicks **[+ Upload New Medical Report]**.
3. **Document Ingestion (`SCR-03`)**:
   * Patient drops a multi-page PDF blood report from Dr Lal PathLabs.
   * Confirms test date (`14-Oct-2025`) and laboratory category (`Biochemistry / Lipid Panel`).
   * Observes 4-stage ingestion stepper: Encrypted Upload -> OCR Extraction -> Rule-based Validation -> Grounded AI Synthesis.
4. **Interactive Source Review (`SCR-04`)**:
   * Ingestion completes; system redirects to `SCR-04` (Report Detail).
   * **Left Pane**: Displays original PDF scan with interactive bounding boxes over `Fasting Blood Glucose: 142 mg/dL` and `HbA1c: 8.4%`.
   * **Right Pane**: Displays structured table:
     * Fasting Blood Sugar: `142 mg/dL` | Normal: `70-99 mg/dL` | Badge: `ELEVATED`
     * HbA1c: `8.4%` | Normal: `4.0-5.6%` | Badge: `CRITICAL`
   * **Grounded Plain-Language Explanation**: Reads plain-language explanation. Taps citation chip `[Page 1: HbA1c]`; the left viewer immediately pans and highlights the test line.
5. **Timeline Update (`SCR-05`)**: Clicks **[View Historical Trend]**; navigates to `SCR-05` to see HbA1c graphed alongside his test from January 2025 (`7.8%`), showing a +0.6% longitudinal delta.

### 1.3 Edge Cases & Error Handling
* *Unreadable Document / Blurry Photo*: OCR confidence drops below 80%. `SCR-03` halts before AI synthesis, alerting the patient: *"Document text is too blurry to extract reliably. Please take a well-lit photo or upload original digital PDF."*
* *Critical Biomarker Detected*: If Fasting Blood Glucose is > 300 mg/dL, `SCR-04` injects the top emergency advisory banner directing the patient to seek clinical consultation promptly.

---

## 2. Journey 2: Patient Symptom Logging, Doctor Discovery & Consent Booking

### 2.1 Actors & Objective
* **Actor**: Patient ("Aarav Sharma")
* **Goal**: Describe new symptoms (dizziness, fatigue), find an affiliated cardiologist, and book an appointment with explicit medical history access consent.

### 2.2 Step-by-Step Flow
1. **Symptom Inquiry (`SCR-06`)**:
   * Patient opens AI Health Assistant on `SCR-06`.
   * Speaks into microphone: *"I have been feeling dizzy after morning walks and my blood sugar report came high"*.
   * Assistant transcribes voice note, confirms receipt, and provides grounded educational guidance: *"Your recent report showed elevated blood glucose (142 mg/dL). Dizziness should be evaluated by a physician. Would you like to find an affiliated doctor?"*
2. **Doctor Discovery (`SCR-07`)**:
   * Patient taps **[Find Doctor]** and lands on `SCR-07`.
   * Filters by specialty: `Cardiology & Metabolic Health`, City: `Jaipur / Jodhpur`.
   * Inspects Dr. Alex Morgan's profile (Credentials, MCI License #MCI-84920, City Care Hospital).
   * Clicks **[Book Consultation]**.
3. **Slot Selection & Granular Consent (`SCR-08`)**:
   * Selects slot: Tomorrow at `10:30 AM`.
   * Attaches pre-visit symptom voice note.
   * **Mandatory Consent Authorization**: Checks boxes to grant Dr. Alex Morgan access to:
     * *Last 12 months laboratory reports*
     * *Longitudinal biomarker trends*
     * *AI-generated 60-second summary brief*
   * Validity duration: `7 Days`.
   * Submits booking; receives instant confirmation card on `SCR-08`.

---

## 3. Journey 3: Doctor 60-Second Clinical Review & Approval Workflow

### 3.1 Actors & Objective
* **Actor**: Consulting Physician ("Dr. Alex Morgan, MD")
* **Goal**: Conduct a high-efficiency pre-visit review in under 60 seconds, verify source laboratory documents, identify clinical red flags, and approve or adjust clinical notes.

### 3.2 Step-by-Step Flow
1. **Clinical Queue Overview (`SCR-10`)**:
   * Dr. Alex signs into Doctor Portal (`SCR-01` -> `SCR-10`).
   * Sees today's schedule: 14 patients.
   * Notice top Red-Flag Ticker: 2 critical biomarker alerts pending review.
   * Locates Aarav Sharma (10:30 AM appointment); sees status: `Active Patient Consent (7 Days remaining)`.
   * Clicks **[Open 60-Second Brief]**.
2. **60-Second Patient Cockpit (`SCR-11`)**:
   * Reads high-density 1-page synthesis:
     * *Triage Level*: Moderate-High Metabolic Risk.
     * *Active Trajectory*: Fasting Glucose climbed from 118 to 142 mg/dL; HbA1c rose from 7.8% to 8.4% over 9 months.
     * *Clinical Gap Alert*: *"Renal monitoring gap: Serum Creatinine / eGFR has not been tested for 14 months."*
     * *Contradiction Alert*: *"None detected between reported symptoms and laboratory findings."*
3. **Interactive Document Cross-Check (`SCR-11`)**:
   * Dr. Alex taps the `HbA1c 8.4%` badge.
   * The right-hand document pane instantly focuses on the exact bounding box of the original Dr Lal PathLabs scanned PDF.
   * Doctor visually verifies the value and laboratory signature in 5 seconds.
4. **Clinical Sign-Off & e-Prescription (`SCR-11`)**:
   * Dr. Alex clicks **[Approve AI Brief]**.
   * Appends clinical notes in editor: *"Initiate Metformin dose titration; order urgent Renal Function Test (RFT) to close 14-month monitoring gap."*
   * Issues e-prescription and sets follow-up interval for 4 weeks.
   * Clicks **[Finalize Consultation & Sign]**. Record status transitions from `Draft` to `Doctor Verified`.

---

## 4. Journey 4: Hospital Staff Scheduling & Billing Discrepancy Check

### 4.1 Actors & Objective
* **Actor**: Hospital Desk Administrator ("Priya Nair") & Patient ("Aarav Sharma")
* **Goal**: Hospital allocates incoming OPD appointment requests to department doctors, and patient/hospital audits itemized medical invoices for objective arithmetic accuracy.

### 4.2 Step-by-Step Flow
1. **Appointment Allocation (`SCR-12`)**:
   * Hospital staff reviews unassigned incoming booking requests on `SCR-12`.
   * Assigns incoming cardiology patients to on-duty specialist Dr. Alex Morgan according to shift roster.
2. **Billing Upload & Verification (`SCR-13`)**:
   * Patient receives an itemized discharge invoice of ₹24,850 and uploads the PDF to `SCR-13`.
   * Rule-based billing audit microservice parses line items:
     * Checks arithmetic sum: Subtotal + Taxes = Total.
     * Cross-references item codes for duplicates on the same date.
3. **Objective Discrepancy Reporting (`SCR-13`)**:
   * Audit displays: *"Audit Complete — 2 Possible Discrepancies Flagged for Human Review"*:
     * *Flag 1: Arithmetic sum of line items is ₹24,400 (Discrepancy of ₹450 vs billed ₹24,850).*
     * *Flag 2: Line item 'Complete Blood Count (CBC)' billed twice on 14-Oct-2025 at 09:15 and 11:30.*
   * Framing: Objective, respectful, zero accusations of fraud.
   * Patient clicks **[Submit for Hospital Review]**; hospital billing desk receives notification to reconcile the invoice.

---

## 5. Journey 5: Super-Admin De-Identified Public Health Oversight & Scheme Broadcast

### 5.1 Actors & Objective
* **Actor**: Super Admin / Government Oversight Officer
* **Goal**: Monitor platform integrity, inspect de-identified population health metrics, and broadcast awareness of public healthcare schemes (e.g. Ayushman Bharat / PM-JAY) without accessing any private clinical records.

### 5.2 Step-by-Step Flow
1. **Administrative Login (`SCR-01` -> `SCR-14`)**:
   * Enters administrative credentials on `SCR-01`.
   * Directed to `SCR-14` in **Strictly Read-Only Mode**.
2. **System Health & Accuracy Inspection (`SCR-14`)**:
   * Inspects aggregate metrics: Total processed reports (4,820), Average OCR confidence (97.8%), Average doctor review time (54 seconds).
   * Verifies platform security audit logs (zero unauthorized access attempts).
3. **De-Identified Epidemiological Heatmap (`SCR-14`)**:
   * Observes anonymized regional prevalence graph: 32% of patients in District A have unmonitored HbA1c > 8.0%.
4. **Public Health Scheme Broadcast (`SCR-14`)**:
   * Drafts public awareness banner: *"Eligible families can claim up to ₹5 Lakh cashless treatment under Ayushman Bharat (PM-JAY). Check your ABHA eligibility."*
   * Publishes announcement; banner is immediately surfaced on `SCR-02` for matching patient demographics.

---

## 6. Journey 6: Patient Medication Schedule & Adherence Tracking

### 6.1 Actors & Objective
* **Actor**: Patient ("Aarav Sharma")
* **Goal**: Follow newly updated doctor prescriptions, receive scheduled reminders, log medicine adherence, and anticipate refills.

### 6.2 Step-by-Step Flow
1. **Prescription Ingestion**:
   * Following Dr. Alex Morgan's consultation finalization in Journey 3, Aarav's medication schedule on `SCR-09` automatically updates with the doctor-approved prescription.
2. **Daily Schedule Review (`SCR-09`)**:
   * Patient opens `SCR-09` (Medication Schedule).
   * Sees time-blocked cards:
     * **Morning (8:00 AM)**: Metformin 500mg — 1 Tablet after breakfast.
     * **Night (9:00 PM)**: Atorvastatin 20mg — 1 Tablet after dinner.
3. **Adherence Logging (`SCR-09`)**:
   * Mobile push notification fires at 8:00 AM: *"Time for your morning Metformin (500mg)"*.
   * Patient taps notification; marks **[Taken]**.
   * Adherence ring updates to `94% Compliant`.
4. **Refill Warning**:
   * As remaining tablet count drops below 5 doses, `SCR-09` displays an amber pill badge: *"Metformin 500mg: 4 days remaining. Contact pharmacy to refill."*

---

## 7. Traceability Matrix: Screen to Journey to Role Mapping

| Screen ID | Screen Name | Mapped Journey | Associated Roles |
| :--- | :--- | :--- | :--- |
| `SCR-01` | Auth & Onboarding | Journeys 1, 2, 3, 4, 5, 6 | Patient, Doctor, Hospital Staff, Super Admin |
| `SCR-02` | Patient Dashboard | Journeys 1, 2, 5, 6 | Patient |
| `SCR-03` | Report Upload & Ingestion Status | Journey 1 | Patient, Hospital Staff |
| `SCR-04` | Report Detail & Source-Linked Explanation | Journey 1 | Patient, Doctor |
| `SCR-05` | Medical Timeline & Trend Charts | Journey 1 | Patient, Doctor |
| `SCR-06` | AI Health Assistant Chat | Journey 2 | Patient |
| `SCR-07` | Doctor & Hospital Directory Search | Journey 2 | Patient, Hospital Staff |
| `SCR-08` | Appointment Booking & Consent Flow | Journey 2 | Patient, Hospital Staff |
| `SCR-09` | Medication Schedule & Reminders | Journey 6 | Patient, Doctor (Read-only) |
| `SCR-10` | Doctor Dashboard | Journey 3 | Doctor |
| `SCR-11` | Doctor 60-Second Patient Brief View | Journey 3 | Doctor |
| `SCR-12` | Hospital Administration Dashboard | Journey 4 | Hospital Staff |
| `SCR-13` | Billing Transparency & Review View | Journey 4 | Patient, Hospital Staff |
| `SCR-14` | Super Admin / Government Oversight | Journey 5 | Super Admin |
| `SCR-15` | Settings, Privacy & Consent Center | Journeys 1, 2, 3 | All Roles |
