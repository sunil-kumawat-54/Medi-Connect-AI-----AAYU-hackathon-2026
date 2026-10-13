# Medi Connect AI — Phase 4 AI Pipeline & Safety Architecture Specification

> **Document Classification**: Core Engineering & Clinical Safety Contract  
> **Milestone**: Phase 4 (Real AI Engine, Grounded Extraction, Clinical Safety, Billing Auditor)  
> **Core Principle**: **Rules before reasoning, source-linked outputs, doctor-in-control, AI never diagnoses or prescribes.**

---

## 1. Executive Summary & Design Tenets

Phase 4 transitions Medi Connect AI from UI prototype mocks to an operational clinical intelligence pipeline. The system processes diagnostic reports (PDFs, scans, camera captures) and itemized hospital bills through a deterministic safety pipeline before generating patient explanations and physician briefs.

### 4 Pillars of Medical Safety:
1. **Deterministic Rule Supremacy**: Numeric interval checks, unit conversions, and trend evaluations are executed exclusively by verified TypeScript/PostgreSQL algorithms. The LLM is never permitted to calculate numerical differences, determine clinical normal ranges, or guess missing units.
2. **Strict Sentence-Level Grounding**: Every sentence in an AI explanation must be cryptographically or structurally linked to a validated source extraction with bounding coordinates or citation tokens. Hallucinations of absent lab values are caught and rejected by automated verification gates.
3. **Doctor-in-the-Loop Governance**: AI outputs remain in `needs_review` or `draft` status until explicitly certified by the attending physician via a `SECURITY DEFINER` database RPC. The doctor retains complete authority to approve, edit, or reject all summaries.
4. **Non-Diagnostic, Urgent-Care Escalation**: Phrasing is strictly descriptive (*"associated with"*, *"exceeds the reference interval"*). Direct diagnoses (*"You have Diabetes"*) or drug prescriptions are hard-blocked by output filters. Any life-critical value immediately attaches prominent emergency escalation advisories (112/108).

---

## 2. Multi-Stage Pipeline Architecture

```text
[Input Document] (PDF / JPG / PNG, Max 15MB)
       │
       ▼
[Stage 1: File Validation & Ingestion] ────> Rejection (Oversized, Malformed, Unsupported)
       │
       ▼
[Stage 2: Hybrid Text Extraction]
       ├─ Embedded PDF Parser (Digital vector text)
       └─ Multimodal Vision OCR (Scanned images / camera photos)
       │
       ▼
[Stage 3: Structured Field Extraction] (JSON Schema: Test, Value, Unit, Interval, Date, Box)
       │
       ▼
[Stage 4: Deterministic Validation & Normalization]
       ├─ Unit Standardization (e.g. mmol/L -> mg/dL)
       ├─ Reference Interval Check (Against lab-printed normal limits)
       ├─ Severity Classifier (NORMAL, LOW, ELEVATED, CRITICAL)
       └─ Gap & Longitudinal Contradiction Detector
       │
       ▼
[Stage 5: Grounded Explanation & Doctor Brief Synthesis]
       ├─ Sentence-Level Source Anchoring (Field IDs & Coordinates)
       ├─ Clinical Safety System Guardrails (Anti-Diagnosis Refusal)
       └─ Multilingual Translator (Hindi machine-translated mirror)
       │
       ▼
[Stage 6: Persistence & Doctor Review State Machine]
       └─ Stored in Supabase (ai_summaries, biomarkers, doctor_briefs)
```

---

## 3. Data Schemas & Contracts

### 3.1 Extracted Biomarker Schema
```typescript
interface ExtractedBiomarker {
  id: string; // Deterministic hash of report_id + test_name
  name: string;
  rawValue: string;
  numericValue: number | null;
  unit: string;
  normalizedUnit: string;
  referenceIntervalRaw: string | null;
  intervalLow: number | null;
  intervalHigh: number | null;
  severity: 'NORMAL' | 'LOW' | 'ELEVATED' | 'CRITICAL';
  boundingBox: {
    page: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  } | null;
  ocrConfidence: number; // 0 - 100
}
```

### 3.2 Grounded Summary Citation Schema
```typescript
interface GroundedCitation {
  claim: string;
  sourceBiomarkerId: string;
  biomarkerName: string;
  observedValue: string;
  referenceInterval: string;
  page: number;
  box: [number, number, number, number] | null;
}
```

---

## 4. Safety Guardrails & Prohibited Language

### 4.1 Strict LLM System Prompt Directive
```text
YOU ARE A HEALTHCARE-SAFETY-MINDED CLINICAL SYNTHESIS ENGINE FOR MEDI CONNECT AI.
YOUR ROLE IS TO PROVIDE EDUCATIONAL, PLAIN-LANGUAGE EXPLANATIONS OF EXTRACTED LAB VALUES.

STRICT SAFETY CONSTRAINTS:
1. NEVER PROVIDE A DEFINITIVE MEDICAL DIAGNOSIS. DO NOT WRITE: "You have Diabetes", "You have Hypothyroidism".
   INSTEAD WRITE: "The test indicates an elevated value, which is commonly associated with glycemic changes. Please consult your physician for clinical diagnosis."
2. NEVER PRESCRIBE, RECOMMEND DOSAGES, OR INSTRUCT MEDICATION CHANGES.
3. NEVER INVENT LAB VALUES. IF A TEST IS NOT FOUND IN THE EXTRACTED FIELDS, EXPLICITLY STATE "Not found in report".
4. EVERY SENTENCE EXPLAINING A TEST MUST CITE THE TEST NAME AND PRINTED VALUE.
5. IF CRITICAL VALUES ARE DETECTED, PROMINENTLY ADVISE SEEKING IMMEDIATE MEDICAL CARE OR CALLING EMERGENCY SERVICES (112 / 108).
```

### 4.2 Automated Hallucination & Grounding Gate
Before any generated explanation markdown is saved to `public.ai_summaries`:
1. The text is scanned for all numeric tokens (regex: `\b\d+(\.\d+)?\b`).
2. Every numeric token representing a clinical measurement must match an entry in the validated `ExtractedBiomarker` set.
3. If an ungrounded number is identified, the synthesis is flagged as `UNGROUNDED_REJECTED` and diverted to physician manual review.

---

## 5. Billing Discrepancy Engine

The billing audit engine inspects itemized invoices using three deterministic checks:
1. **Arithmetic Integrity**: $\sum(\text{Line Items}) = \text{Invoice Total Amount}$. Any discrepancy $> ₹1.00$ triggers an arithmetic discrepancy flag.
2. **Duplicate Line Item Check**: Identifies identical item codes or identical descriptions billed within 24 hours of each other.
3. **Clinical Reconciliation**: Cross-checks billed high-cost diagnostics (e.g. MRI Brain, CT Abdomen) against patient diagnostic report records. If no matching report exists within $\pm 30$ days of the hospital admission, a note is logged: *"Item billed without corresponding diagnostic documentation in patient records."*
4. **Tone & Phrasing Rule**: Language is strictly objective (*"Possible discrepancy requiring hospital billing desk clarification"*), preventing adversarial accusations.

---

## 6. Rate Limiting, Cost Caps & Privacy Safeguards

1. **Per-User Quotas**: Patients are restricted to a maximum of **5 report extractions per 24 hours** and **30 AI chat messages per hour**.
2. **Image Downscaling**: Images exceeding 1568px along the longest dimension are proportionally scaled down before multimodal dispatch to minimize token consumption while maintaining OCR fidelity.
3. **Zero PHI Logging**: System logs record only `report_id` UUIDs, processing durations, and status codes. Patient names, mobile numbers, and raw identity values are excluded from server stdout/stderr.
4. **Audit Trail**: Every extraction, summary generation, doctor review, and billing audit is logged into PostgreSQL `public.audit_logs` using HMAC-SHA256 salted hashes.
