/**
 * Medi Connect AI — Mock Clinical Intelligence Service (Phase 3 MVP)
 *
 * NOTE FOR CLINICAL REVIEW:
 * This service contains explicitly simulated Mock AI algorithms for Phase 3 prototype evaluation.
 * Real OCR (Tesseract / PaddleOCR) and LLM inference microservices are integrated in Phase 4.
 * All outputs generated here are strictly watermarked with [MOCK AI] markers.
 */

import type {
  Biomarker,
  BiomarkerSeverity,
  BoundingBox,
  AISummary,
  DoctorBrief,
  BillingFlag,
} from './types';

export interface MockExtractionResult {
  reportId: string;
  extractedText: string;
  ocrConfidence: number;
  biomarkers: Array<{
    name: string;
    rawValue: string;
    numericValue: number;
    unit: string;
    normalizedUnit: string;
    referenceIntervalRaw: string;
    intervalLow: number;
    intervalHigh: number;
    severity: BiomarkerSeverity;
    boundingBox: BoundingBox;
  }>;
  summary: {
    contentMarkdown: string;
    redFlags: string[];
    gaps: string[];
    citations: Array<{ claim: string; page: number; box: number[] }>;
  };
}

export interface MockChatMessage {
  sender: 'assistant' | 'user';
  text: string;
  citations?: Array<{ label: string; value: string }>;
  timestamp: string;
}

/**
 * Simulate OCR extraction and deterministic clinical parsing for a diagnostic report
 */
export function simulateReportExtraction(
  reportId: string,
  patientId: string,
  category: string,
  title: string
): MockExtractionResult {
  const isLipidOrMetabolic = /lipid|metabolic|diabetes|glucose|sugar/i.test(title + category);
  const isThyroid = /thyroid|tsh/i.test(title + category);
  const isCbc = /cbc|blood count|hemoglobin/i.test(title + category);

  if (isThyroid) {
    return {
      reportId,
      extractedText: `THYROID FUNCTION PROFILE - TSH: 6.85 uIU/mL (High). Free T4: 1.1 ng/dL (Normal). Free T3: 2.8 pg/mL (Normal).`,
      ocrConfidence: 97.2,
      biomarkers: [
        {
          name: 'TSH (Thyroid Stimulating Hormone)',
          rawValue: '6.85',
          numericValue: 6.85,
          unit: 'uIU/mL',
          normalizedUnit: 'uIU/mL',
          referenceIntervalRaw: '0.40 - 4.20',
          intervalLow: 0.4,
          intervalHigh: 4.2,
          severity: 'ELEVATED',
          boundingBox: { page: 1, x_min: 100, y_min: 200, x_max: 420, y_max: 230 },
        },
        {
          name: 'Free T4 (Thyroxine)',
          rawValue: '1.1',
          numericValue: 1.1,
          unit: 'ng/dL',
          normalizedUnit: 'ng/dL',
          referenceIntervalRaw: '0.8 - 1.8',
          intervalLow: 0.8,
          intervalHigh: 1.8,
          severity: 'NORMAL',
          boundingBox: { page: 1, x_min: 100, y_min: 240, x_max: 420, y_max: 270 },
        },
      ],
      summary: {
        contentMarkdown: `[MOCK AI SUMMARY]\nYour TSH level is 6.85 uIU/mL, which is slightly above the reference range (0.40 - 4.20 uIU/mL). However, your Free T4 remains within normal limits. This pattern is often consistent with mild subclinical hypothyroidism. Please review these values with your consulting physician for clinical correlation.`,
        redFlags: ['TSH > 6.0 uIU/mL with borderline metabolic symptoms'],
        gaps: ['Anti-TPO antibody test not included in current panel'],
        citations: [{ claim: 'TSH is 6.85 uIU/mL', page: 1, box: [100, 200, 420, 230] }],
      },
    };
  }

  if (isCbc) {
    return {
      reportId,
      extractedText: `COMPLETE BLOOD COUNT (CBC) - Hemoglobin: 11.2 g/dL (Mildly Low). Platelets: 210,000 /uL (Normal). WBC: 7,400 /uL (Normal).`,
      ocrConfidence: 98.0,
      biomarkers: [
        {
          name: 'Hemoglobin',
          rawValue: '11.2',
          numericValue: 11.2,
          unit: 'g/dL',
          normalizedUnit: 'g/dL',
          referenceIntervalRaw: '13.0 - 17.0',
          intervalLow: 13.0,
          intervalHigh: 17.0,
          severity: 'LOW',
          boundingBox: { page: 1, x_min: 90, y_min: 190, x_max: 450, y_max: 220 },
        },
        {
          name: 'Total Leucocyte Count (WBC)',
          rawValue: '7,400',
          numericValue: 7400,
          unit: '/uL',
          normalizedUnit: '/uL',
          referenceIntervalRaw: '4,000 - 11,000',
          intervalLow: 4000,
          intervalHigh: 11000,
          severity: 'NORMAL',
          boundingBox: { page: 1, x_min: 90, y_min: 230, x_max: 450, y_max: 260 },
        },
      ],
      summary: {
        contentMarkdown: `[MOCK AI SUMMARY]\nYour Hemoglobin is 11.2 g/dL, which is below the non-anemic adult range (13.0 - 17.0 g/dL). White blood cells and platelet counts are well within normal ranges. Discuss iron intake and potential dietary adjustments with your doctor.`,
        redFlags: ['Hemoglobin < 12.0 g/dL requires evaluation for anemia'],
        gaps: ['Serum Ferritin and Iron saturation indices not reported'],
        citations: [{ claim: 'Hemoglobin is 11.2 g/dL', page: 1, box: [90, 190, 450, 220] }],
      },
    };
  }

  // Default: Metabolic / Comprehensive Lipid & Glycemic Panel
  return {
    reportId,
    extractedText: `APEX DIAGNOSTICS LAB - Fasting Blood Sugar: 142 mg/dL. HbA1c: 7.8 %. Total Cholesterol: 245 mg/dL. Triglycerides: 188 mg/dL.`,
    ocrConfidence: 96.5,
    biomarkers: [
      {
        name: 'HbA1c (Glycated Hemoglobin)',
        rawValue: '7.8',
        numericValue: 7.8,
        unit: '%',
        normalizedUnit: '%',
        referenceIntervalRaw: '4.0 - 5.6',
        intervalLow: 4.0,
        intervalHigh: 5.6,
        severity: 'ELEVATED',
        boundingBox: { page: 1, x_min: 120, y_min: 240, x_max: 480, y_max: 265 },
      },
      {
        name: 'Fasting Blood Glucose',
        rawValue: '142',
        numericValue: 142,
        unit: 'mg/dL',
        normalizedUnit: 'mg/dL',
        referenceIntervalRaw: '70 - 99',
        intervalLow: 70,
        intervalHigh: 99,
        severity: 'ELEVATED',
        boundingBox: { page: 1, x_min: 120, y_min: 280, x_max: 480, y_max: 305 },
      },
      {
        name: 'Total Cholesterol',
        rawValue: '245',
        numericValue: 245,
        unit: 'mg/dL',
        normalizedUnit: 'mg/dL',
        referenceIntervalRaw: '< 200',
        intervalLow: 0,
        intervalHigh: 200,
        severity: 'ELEVATED',
        boundingBox: { page: 1, x_min: 120, y_min: 320, x_max: 480, y_max: 345 },
      },
      {
        name: 'Triglycerides',
        rawValue: '188',
        numericValue: 188,
        unit: 'mg/dL',
        normalizedUnit: 'mg/dL',
        referenceIntervalRaw: '< 150',
        intervalLow: 0,
        intervalHigh: 150,
        severity: 'ELEVATED',
        boundingBox: { page: 1, x_min: 120, y_min: 360, x_max: 480, y_max: 385 },
      },
    ],
    summary: {
      contentMarkdown: `[MOCK AI SUMMARY]\nYour HbA1c is **7.8%**, which is above the standard non-diabetic target range (4.0 - 5.6%). This indicates elevated average blood sugar levels over the past 3 months. Your Fasting Blood Glucose is also elevated at **142 mg/dL**. Total Cholesterol is **245 mg/dL**. Please schedule a consultation with your doctor to review personalized dietary, exercise, or glycemic management plans.`,
      redFlags: ['HbA1c > 7.0% requires structured metabolic review', 'Fasting Blood Sugar > 126 mg/dL in diabetic range'],
      gaps: ['Urine microalbuminuria test missing from annual checkup'],
      citations: [
        { claim: 'HbA1c is 7.8%', page: 1, box: [120, 240, 480, 265] },
        { claim: 'Fasting Blood Glucose is 142 mg/dL', page: 1, box: [120, 280, 480, 305] },
        { claim: 'Total Cholesterol is 245 mg/dL', page: 1, box: [120, 320, 480, 345] },
      ],
    },
  };
}

/**
 * Generate a 60-Second Doctor Patient Brief (Mock Synthesis)
 */
export function generateMock60SecondBrief(
  patientName: string,
  biomarkers: any[] = []
): {
  chiefComplaint: string;
  triageLevel: string;
  briefMarkdown: string;
  criticalBiomarkers: string[];
  gapsDetected: string[];
} {
  return {
    chiefComplaint: 'Follow-up for metabolic assessment, mild fatigue, and glycemic management.',
    triageLevel: 'MODERATE_PRIORITY',
    briefMarkdown: `### [MOCK 60-SECOND CLINICAL BRIEF]
* **Patient**: ${patientName} (Age: 44, Male)
* **Key Findings**: 
  - Glycated Hemoglobin (HbA1c): **7.8%** (Elevated, target < 7.0%)
  - Fasting Plasma Glucose: **142 mg/dL** (Elevated, baseline was 128 mg/dL 6 months ago)
  - Total Serum Cholesterol: **245 mg/dL** (Borderline High)
* **Trend Analysis**: Progressive elevation in HbA1c (+0.4% over 90 days). Fasting glucose has not normalized on current lifestyle regimen.
* **Gaps & Contradictions**:
  - No renal microalbumin/creatinine ratio on record in the last 12 months.
  - Patient reports taking Metformin 500mg twice daily with meals; adherence logged at 85%.
* **Recommended Clinical Action**:
  - Consider titrating Metformin dosage or adding secondary agent (e.g., SGLT2 inhibitor).
  - Order formal lipid fractionation (LDL-C direct) and urine ACR.`,
    criticalBiomarkers: [
      'HbA1c: 7.8% (Target < 7.0%)',
      'Fasting Blood Glucose: 142 mg/dL (Normal < 100 mg/dL)',
    ],
    gapsDetected: [
      'Missing Renal Microalbumin/Creatinine ratio in past 12 months',
      'Missing Direct LDL-C measurement',
    ],
  };
}

/**
 * Generate Mock Health Assistant conversational response with clinical safety guardrails
 */
export function generateMockAssistantReply(
  userQuery: string,
  context: { patientName: string; latestHbA1c?: string; latestGlucose?: string }
): MockChatMessage {
  const q = userQuery.toLowerCase();

  // Safety directive for emergency queries
  if (q.includes('chest pain') || q.includes('heart attack') || q.includes('breath') || q.includes('emergency')) {
    return {
      sender: 'assistant',
      text: `🚨 **EMERGENCY WARNING**: If you or someone you are with is experiencing severe chest pain, shortness of breath, sudden numbness, or dizziness, please seek emergency medical attention immediately or call **112 / 108**. This platform does not provide emergency triage.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  // Question about HbA1c / Sugar
  if (q.includes('hba1c') || q.includes('sugar') || q.includes('glucose') || q.includes('diabetes')) {
    return {
      sender: 'assistant',
      text: `[MOCK AI ASSISTANT]\nBased on your latest diagnostic report from Apex Labs, your **HbA1c is 7.8%** and your **Fasting Blood Glucose is 142 mg/dL**.\n\nHbA1c reflects your average blood sugar over the last 2 to 3 months. A reading of 7.8% is above the normal non-diabetic range (4.0 - 5.6%) and indicates mild hyperglycemia. Dr. Alex Morgan has access to this report under your active consent.\n\n*Reminder: AI assists, doctor decides. Do not alter your prescribed medication without speaking with your doctor.*`,
      citations: [
        { label: 'HbA1c', value: '7.8% (Apex Labs)' },
        { label: 'Fasting Glucose', value: '142 mg/dL (Apex Labs)' },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  // Question about medications / reminders
  if (q.includes('medicine') || q.includes('medication') || q.includes('metformin') || q.includes('dose')) {
    return {
      sender: 'assistant',
      text: `[MOCK AI ASSISTANT]\nYou currently have active reminders scheduled for **Metformin 500mg** (taken twice daily after meals) and **Atorvastatin 10mg** (taken once daily at bedtime). You can mark each dose as taken in the **Medications** tab.\n\nIf you are experiencing any side effects or missed multiple doses, please inform Dr. Alex during your upcoming consultation.`,
      citations: [{ label: 'Active Regimen', value: 'Metformin 500mg, Atorvastatin 10mg' }],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  // Question about appointment / doctor
  if (q.includes('doctor') || q.includes('appointment') || q.includes('alex') || q.includes('consult')) {
    return {
      sender: 'assistant',
      text: `[MOCK AI ASSISTANT]\nYou have a confirmed consultation scheduled with **Dr. Alex Morgan, MD (Cardiology & Metabolic Health)** for tomorrow at **10:00 AM** at City Care Hospital.\n\nYour active consent allows Dr. Alex to view your diagnostic reports and 60-second summary brief before your visit. You can modify your consent settings anytime in the Privacy Center.`,
      citations: [{ label: 'Consultation', value: 'Dr. Alex Morgan • Tomorrow 10:00 AM' }],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  // Generic clinical query fallback
  return {
    sender: 'assistant',
    text: `[MOCK AI ASSISTANT]\nThank you for your question. As your clinical intelligence assistant, I can explain medical terms, summarize your uploaded lab tests, and track your health timeline.\n\nRegarding "${userQuery}": For specific diagnosis, drug adjustments, or treatment advice, your consulting doctor (Dr. Alex Morgan) has full clinical authority. Would you like me to highlight this topic for discussion in your upcoming appointment brief?`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Mock Billing Discrepancy Auditor for hospital bills
 */
export function analyzeMockBillDiscrepancies(billNumber: string, totalAmount: number): Array<{
  item: string;
  severity: 'INFO' | 'WARNING' | 'ALERT';
  message: string;
  amountDelta: number;
}> {
  return [
    {
      item: 'Disposable Syringe & Infusion Set 20ml',
      severity: 'WARNING',
      message: 'Possible discrepancy, requires review: Item billed 4x during outpatient consultation (Hospital clinical standard: max 1x).',
      amountDelta: 350,
    },
    {
      item: 'Administrative Processing & Records Archival',
      severity: 'INFO',
      message: 'Possible discrepancy, requires review: Routine administrative fee exceeds recommended standard NABH cap by ₹120.',
      amountDelta: 120,
    },
  ];
}
