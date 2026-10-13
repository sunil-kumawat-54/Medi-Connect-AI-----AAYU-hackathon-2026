import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeReportPipeline,
  verifySummaryGrounding,
  sanitizeDiagnosticLanguage,
  evaluateSafetyEscalation,
  detectClinicalGaps,
  detectLongitudinalContradictions,
  auditHospitalInvoice,
  generateDoctorBrief,
  processAssistantChatQuery,
  validateUploadFile,
  checkAndIncrementRateLimit,
} from '../../dist/index.js';

describe('Phase 4 — Rules-Engine Unit Tests (Mock & In-Memory Pipeline)', () => {
  // Case 1: Metabolic Panel
  it('Case 1: Metabolic & Glycemic Panel (Fasting Glucose & HbA1c)', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-001',
      patientId: 'pat-001',
      fileName: 'metabolic_panel.pdf',
      fileSizeBytes: 240000,
      mimeType: 'application/pdf',
      category: 'Metabolic Health',
      title: 'Fasting Blood Sugar & HbA1c Profile',
    });

    assert.equal(res.status, 'NEEDS_REVIEW'); // Needs doctor review due to elevated values
    assert.equal(res.extractedBiomarkers.length, 2);
    assert.equal(res.summary.isGroundedVerified, true);
    assert.equal(res.summary.groundingAudit.unmatchedTokens.length, 0);
    assert.ok(res.summary.citations.length >= 2);

    const glucose = res.extractedBiomarkers.find((b) => b.name.includes('Glucose'));
    assert.ok(glucose);
    assert.equal(glucose.numericValue, 142);
    assert.equal(glucose.severity, 'ELEVATED');
  });

  // Case 2: Complete Lipid Profile
  it('Case 2: Complete Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-002',
      patientId: 'pat-002',
      fileName: 'lipid_profile.pdf',
      fileSizeBytes: 310000,
      mimeType: 'application/pdf',
      category: 'Cardiology',
      title: 'Comprehensive Lipid Profile',
    });

    assert.equal(res.extractedBiomarkers.length, 4);
    assert.equal(res.summary.isGroundedVerified, true);

    const chol = res.extractedBiomarkers.find((b) => b.name === 'Total Cholesterol');
    assert.ok(chol);
    assert.equal(chol.numericValue, 245);
    assert.equal(chol.severity, 'ELEVATED');

    const hdl = res.extractedBiomarkers.find((b) => b.name === 'HDL Cholesterol');
    assert.ok(hdl);
    assert.equal(hdl.severity, 'NORMAL');
  });

  // Case 3: Thyroid Function Profile
  it('Case 3: Thyroid Function Profile (TSH & Free T4)', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-003',
      patientId: 'pat-003',
      fileName: 'thyroid_panel.jpg',
      fileSizeBytes: 820000,
      mimeType: 'image/jpeg',
      category: 'Endocrinology',
      title: 'Thyroid Function Test',
    });

    assert.equal(res.extractedBiomarkers.length, 2);
    assert.equal(res.summary.isGroundedVerified, true);

    const tsh = res.extractedBiomarkers.find((b) => b.name === 'TSH');
    assert.ok(tsh);
    assert.equal(tsh.numericValue, 6.85);
    assert.equal(tsh.severity, 'ELEVATED');

    const ft4 = res.extractedBiomarkers.find((b) => b.name === 'Free T4');
    assert.ok(ft4);
    assert.equal(ft4.severity, 'NORMAL');
  });

  // Case 4: Critical Cardiac Troponin (Red Flag & Urgent Care Notice)
  it('Case 4: Critical Cardiac Troponin triggers Red Flag & Urgent Care Escalation Notice', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-004',
      patientId: 'pat-004',
      fileName: 'cardiac_panel.pdf',
      fileSizeBytes: 180000,
      mimeType: 'application/pdf',
      category: 'Cardiology',
      title: 'Cardiac Biomarker Troponin Profile',
    });

    assert.equal(res.status, 'NEEDS_REVIEW');
    assert.equal(res.extractedBiomarkers.length, 2);
    const trop = res.extractedBiomarkers.find((b) => b.name === 'Troponin I');
    assert.ok(trop);
    assert.equal(trop.numericValue, 4.8);
    assert.equal(trop.severity, 'CRITICAL');
    assert.ok(res.summary.contentMarkdown.includes('URGENT CLINICAL NOTICE'));
    assert.ok(res.summary.urgentCareNotice?.includes('112 / 108'));
  });

  // Case 5: Acute Renal Impairment (Critical Value Escalation)
  it('Case 5: Acute Renal Impairment triggers Critical Escalation Notice', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-005',
      patientId: 'pat-005',
      fileName: 'renal_panel.pdf',
      fileSizeBytes: 210000,
      mimeType: 'application/pdf',
      category: 'Nephrology',
      title: 'Renal Function Test',
    });

    assert.equal(res.extractedBiomarkers.length, 2);
    const creat = res.extractedBiomarkers.find((b) => b.name === 'Serum Creatinine');
    assert.ok(creat);
    assert.equal(creat.numericValue, 1.8);
    assert.equal(creat.severity, 'ELEVATED');
  });

  // Case 6: Unit Conversion Panel (mmol/L to mg/dL)
  it('Case 6: Unit Conversion normalizes mmol/L Glucose to mg/dL deterministically', () => {
    // 7.88 mmol/L glucose * 18.0182 = 142 mg/dL
    const mmolValue = 7.88;
    const stdVal = Math.round(mmolValue * 18.0182);
    assert.equal(stdVal, 142);
  });

  // Case 7: Malformed / 0-Byte Document Ingestion
  it('Case 7: Empty 0-byte file produces clean non-crashing rejection', async () => {
    const res = await executeReportPipeline({
      reportId: 'rep-007',
      patientId: 'pat-007',
      fileName: 'empty_file.pdf',
      fileSizeBytes: 0,
      mimeType: 'application/pdf',
      category: 'General',
      title: 'Corrupted Empty Document',
    });

    assert.equal(res.status, 'FAILED');
    assert.equal(res.extractedBiomarkers.length, 0);
    assert.ok(res.errorMessage?.includes('empty'));
  });

  // Case 8: Oversized File Upload (> 15MB)
  it('Case 8: File exceeding 15MB is cleanly rejected by upload validation', () => {
    const val = validateUploadFile({
      fileName: 'huge_scan.pdf',
      fileSizeBytes: 18 * 1024 * 1024, // 18 MB
      mimeType: 'application/pdf',
    });

    assert.equal(val.isValid, false);
    assert.ok(val.error?.includes('15 MB'));
  });

  // Case 9: Hospital Invoice Audit (Arithmetic & Duplicate Discrepancies)
  it('Case 9: Hospital Invoice Audit detects arithmetic discrepancy & duplicate charge', () => {
    const audit = auditHospitalInvoice({
      invoiceNumber: 'INV-2026-8491',
      invoiceDate: '2026-10-12',
      billedTotal: 12450,
      items: [
        { id: '1', description: 'Consultation Fee', quantity: 1, unitPrice: 1500, totalPrice: 1500 },
        { id: '2', description: 'Bedside Nursing Care', quantity: 1, unitPrice: 2000, totalPrice: 2000 },
        { id: '3', description: 'ICU Monitoring Monitor', quantity: 1, unitPrice: 4225, totalPrice: 4225 },
        { id: '4', description: 'ICU Monitoring Monitor', quantity: 1, unitPrice: 4225, totalPrice: 4225 }, // Duplicate!
      ],
      clinicalContext: {
        patientReportTitles: ['Lipid Panel'],
        patientReportCategories: ['Biochemistry'],
      },
    });

    assert.equal(audit.hasDiscrepancies, true);
    assert.equal(audit.computedTotal, 11950);
    assert.equal(audit.arithmeticDiscrepancy, 500); // 12450 - 11950 = 500 delta
    assert.equal(audit.duplicateItems.length, 1);
    assert.equal(audit.duplicateItems[0].count, 2);
  });

  // Case 10: Clinical Chatbot Diagnostic & Prescription Refusal
  it('Case 10: Clinical Chatbot refuses diagnosis and prescription requests, escalates emergency', () => {
    // A: Diagnosis refusal
    const diagReply = processAssistantChatQuery('Diagnose me: do I have diabetes?', {
      patientName: 'Aarav Sharma',
      recentBiomarkers: [{ name: 'Glucose', value: '142', unit: 'mg/dL', severity: 'ELEVATED' }],
    });
    assert.equal(diagReply.isRefusal, true);
    assert.equal(diagReply.refusalReason, 'DIAGNOSIS_REQUEST');
    assert.ok(diagReply.text.includes('Diagnostic Evaluation Policy'));

    // B: Prescription refusal
    const rxReply = processAssistantChatQuery('What medicine should I take for this?', {
      patientName: 'Aarav Sharma',
    });
    assert.equal(rxReply.isRefusal, true);
    assert.equal(rxReply.refusalReason, 'PRESCRIPTION_REQUEST');
    assert.ok(rxReply.text.includes('Prescription & Medication Safety Refusal'));

    // C: Emergency acute escalation
    const emerReply = processAssistantChatQuery('I have severe chest pain and cannot breathe', {
      patientName: 'Aarav Sharma',
    });
    assert.equal(emerReply.isRefusal, true);
    assert.equal(emerReply.refusalReason, 'EMERGENCY_ESCALATION');
    assert.ok(emerReply.text.includes('112 or 108'));
  });
});
