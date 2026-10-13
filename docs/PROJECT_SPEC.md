# Medi Connect AI — Project Specification & Product Requirements Document

> **Document Status**: Approved (Phase 1 Baseline)  
> **Hackathon Edition**: AAYU 2026 — Track T01: *AI-Assisted Medical Reports and Patient Care*  
> **Role & Authority**: Lead Healthcare Systems Architect & Clinical Product Strategist  
> **Repository Root**: `u:/aayu`  
> **Target Delivery**: Multi-Platform Prototype (Web + Mobile) with Privileged Verification Pipeline

---

## 1. Executive Summary & Problem Space

### 1.1 The Clinical & Patient Challenge
Medical documents in India and globally remain fragmented across disparate diagnostic laboratories, private clinical clinics, hospital health records, and physical paper folders. This fragmentation leads to acute clinical failures:
1. **Patient Comprehension Gap**: Patients receive technical laboratory sheets containing esoteric abbreviations, biochemical units, and reference ranges without contextual explanation, driving anxiety or unguided self-treatment.
2. **Clinical Review Bottleneck**: Physicians in outpatient departments (OPDs) see 40–80 patients daily, having an average of 3 to 5 minutes per consultation. They cannot realistically cross-examine 5 years of disorganized paper files across multiple visits.
3. **Medical Hallucination Risk**: Commercial consumer generative AI models routinely hallucinate reference ranges, misread non-standard Indian laboratory units (e.g., converting $\text{mg/dL}$ to $\text{mmol/L}$ erroneously), or provide unqualified diagnostic assertions that trigger clinical liability.
4. **Billing & Treatment Opaque Chains**: Patients and administrators struggle with itemized medical invoices that suffer from duplicate line items, unbundled procedure charges, and non-transparent arithmetic discrepancies.

### 1.2 The Medi Connect AI Solution
**Medi Connect AI** is a multi-platform clinical intelligence engine designed with a strict **"Rules-Before-Reasoning"** and **"Doctor-in-Control"** architecture:
* **Upload & Ingestion**: Patients securely upload diagnostic reports (PDFs, lab scans, mobile camera captures).
* **Deterministic Verification**: OCR extracts biomarker names, values, units, and ranges. Hardcoded algorithmic validators cross-check values against certified medical intervals before any AI prompt ingestion.
* **Source-Linked Grounded Explanations**: Patients receive plain-language explanations where every sentence is explicitly linked to the underlying document bounding box and timestamp.
* **60-Second Doctor Brief**: Authorized clinicians review a high-density, chronological medical timeline with instant red-flag alerts, contradictory findings, and gap analysis.
* **Clinical Gatekeeping**: No AI summary is finalized into the patient's legal electronic record without explicit physician review (Approve, Edit/Correct, or Reject).

---

## 2. Core Architectural Differentiators

| Differentiator | Clinical & Engineering Standard | What We Strictly DO NOT Do |
| :--- | :--- | :--- |
| **Source-Linked AI Evidence** | Every summarized insight, biomarker evaluation, or summary bullet links to exact document coordinates (page, coordinate box, original scanned text). | Never display free-form LLM summaries without direct interactive visual proof to the source document. |
| **Rules-Before-Reasoning** | Range classification (Normal, Elevated, Critical) is evaluated by deterministic code rules (`evaluator.ts`) against laboratory-printed reference ranges. | Never let the LLM evaluate whether a numeric biomarker is high or low via probabilistic tokens alone. |
| **Doctor-in-Control** | The physician is the clinical authority. Every AI-assisted clinical brief contains explicit action controls: **[Approve]**, **[Edit / Correct]**, **[Reject]**. | Never allow AI to automatically issue formal diagnoses, sign prescriptions, or alter permanent clinical records autonomously. |
| **Gaps, Contradictions & Red Flags** | Algorithmic detection of missing routine monitoring (e.g. Diabetics missing Creatinine/eGFR for >12 months) and conflicting biomarker trajectories across visit dates. | Never present a single report in isolation without cross-referencing longitudinal historical records. |
| **60-Second Doctor Brief** | Standardized 1-page structured brief highlighting chief complaints, abnormal biomarker deltas, medication timeline, and triage level. | Never force a physician to wade through verbose conversational chat logs. |
| **Billing Discrepancy Auditing** | Rule-based parser checks line-item arithmetic sums, flags repeated test entries on same date, and identifies unbundled codes. | Never accuse or allege "fraud" or "corruption"; all findings are classified as *"Possible Discrepancy Flagged for Human Review"*. |

---

## 3. User Personas & Ecosystem Actors

### 3.1 Patient ("Aarav / Sunita Sharma")
* **Profile**: 44-year-old managing Type 2 Diabetes and Hypertension; visits local labs and consulting physicians across clinics.
* **Goals**: Safely store historical family reports; understand what HbA1c 8.4% means in plain vernacular Hindi/English; prepare for upcoming doctor appointments; receive timely medicine schedule reminders.
* **Frustrations**: Losing past paper slips; confusing medical terminology; anxiety from searching medical symptoms online.

### 3.2 Consulting Doctor ("Dr. Alex Morgan, MD")
* **Profile**: Busy consultant cardiologist / general physician handling high outpatient volumes.
* **Goals**: Review the complete chronological clinical trajectory in 60 seconds prior to patient entry; identify red flags immediately; verify source report legitimacy without re-typing prescriptions manually.
* **Frustrations**: Unorganized plastic bags filled with wrinkled reports; having to repeat routine lab tests because past reports cannot be located; fear of AI hallucinations compromising patient safety.

### 3.3 Hospital Administrator & Staff ("Priya Nair")
* **Profile**: OPD coordination and hospital administrative desk manager.
* **Goals**: Efficiently allocate patient appointment slots based on doctor availability; organize department schedules; audit itemized treatment bills to resolve billing discrepancies before patient discharge.
* **Frustrations**: Double-booking errors; patient wait-time complaints; manual invoice reconciliation disputes.

### 3.4 Super Administrator / Public Health Oversight Officer ("Govt / Scheme Officer")
* **Profile**: Administrative oversight officer monitoring healthcare accessibility and system integrity.
* **Goals**: Review anonymized, aggregate public health trends (e.g. seasonal dengue or diabetic prevalence by region); monitor platform security logs; broadcast public healthcare schemes (e.g. Ayushman Bharat / PM-JAY) to eligible patients.
* **Access Boundary**: **Strictly Read-Only and De-Identified**. Zero access to individual Protected Health Information (PHI) or identifiable clinical dossiers.

---

## 4. Scope & Feature Classification Matrix

### 4.1 Minimum Viable Product (MVP — Phases 1 to 3)
* **Secure Authentication & Role RBAC**: Patient, Doctor, Hospital Staff, and Super Admin personas with role-based dashboard redirection. Mock Aadhaar / ABHA ID integration.
* **Report Upload & Ingestion Pipeline**: Support for PDF and common image formats (JPEG, PNG). Real-time processing status indicator.
* **Deterministic Extraction & Validation**: Field parsing (Biomarker, Value, Unit, Reference Range) with rule-based severity rating (Normal, Elevated, Critical).
* **Source-Linked Patient Report View**: Interactive dual-pane interface displaying the original document with bounding boxes alongside grounded plain-language explanations.
* **Medical Timeline & Longitudinal Trend Charts**: Chronological history tracking key biomarkers over time (e.g., Fasting Glucose, HbA1c, Cholesterol) with normal range bands.
* **Doctor Dashboard & 60-Second Brief View**: Review queue showing patient history, prioritized red flags, rule-checked biomarkers, and **[Approve / Correct / Reject]** decision controls.
* **Consent-Grounded Doctor Access**: Explicit patient-driven consent granting report access only to authorized physicians.

### 4.2 Stretch Features (Phase 4)
* **Doctor & Hospital Search Directory**: Search doctors by specialty, distance/location, and consultation availability.
* **Appointment Booking & Slot Management**: Complete scheduling lifecycle (Book, Reschedule, Cancel) with consent prompt.
* **Conversational AI Health Assistant**: Context-aware clinical assistant for questions grounded in uploaded patient reports with persistent safety disclaimers.
* **Voice & Vernacular Symptom Input**: Audio recording and transcription for patient symptom entry; toggle for Hindi / English plain-language explanations.
* **Medication Schedule & Timetable Reminders**: Time-based medicine reminders with dosage, timing (Before/After Food), and adherence tracking.

### 4.3 Future Production Roadmap (Phase 5+)
* **Government ABDM / M1-M3 Integration**: Full Ayushman Bharat Digital Mission (ABDM) compliance with real ABHA Health ID authentication and HIU/HIP data exchange.
* **Automated EMR / HL7 FHIR Interoperability**: Bi-directional clinical data exchange with hospital EPIC/Cerner/Cerner-compatible hospital information management systems.
* **Live Insurance TPA Claim Gateway**: Direct submission of verified itemized bills to third-party insurance administrators.
* **Edge-Device On-Premises OCR**: Deployment of high-throughput PaddleOCR/Tesseract on local hospital edge appliances for strict offline data sovereignty.

---

## 5. Healthcare Safety & Regulatory Guardrails

1. **Mandatory Persistent Disclaimer**:  
   Every screen presenting AI-assisted insights must display the high-contrast banner:  
   `"AI ASSISTS, DOCTOR DECIDES. This platform does not provide automated diagnosis or treatment prescriptions."`
2. **Emergency Triage Redirection**:  
   If parsed biomarkers or user symptoms indicate immediate life-threatening events (e.g., severe chest pain, Troponin I elevation, systolic BP > 180 mmHg, acute hypoglycemia < 50 mg/dL), the interface must render a high-priority red alert instructing the patient to immediately call local emergency services (e.g., `112` or `108` in India).
3. **No Definitive Diagnostic Language**:  
   AI models are forbidden in system prompts from generating phrasing such as *"You have Type 2 Diabetes"*. System prompts mandate phrasing such as:  
   `"The uploaded report indicates an HbA1c of 8.4%, which is above the laboratory standard interval of 4.0%–5.6%. This is frequently associated with elevated blood sugar levels. Please consult your physician for clinical diagnosis."`
4. **Uncertainty & Confidence Ratings**:  
   Whenever OCR extraction or document readability confidence is below 85%, the field is visually badged with a warning: *"Low Confidence Extraction — Please Verify Manually"*.
5. **Billing Review Transparency**:  
   All potential discrepancies in hospital invoices are flagged using objective terminology (*"Repeated item code detected"*, *"Arithmetic sum discrepancy of ₹450"*), explicitly avoiding contentious allegations.
