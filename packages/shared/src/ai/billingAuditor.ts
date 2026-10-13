import { BillingLineItem, BillingAuditReport } from './types.js';

export interface ClinicalCrossCheckItem {
  patientReportTitles: string[];
  patientReportCategories: string[];
}

/**
 * Deterministically audits an itemized hospital bill for arithmetic errors, duplicate charges,
 * and unreconciled diagnostic items.
 */
export function auditHospitalInvoice(params: {
  invoiceNumber: string;
  invoiceDate: string;
  billedTotal: number;
  items: BillingLineItem[];
  clinicalContext?: ClinicalCrossCheckItem;
}): BillingAuditReport {
  const { invoiceNumber, invoiceDate, billedTotal, items, clinicalContext } = params;

  // 1. Arithmetic Check
  let computedTotal = 0;
  for (const item of items) {
    const itemTotal = item.quantity * item.unitPrice;
    computedTotal += itemTotal;
  }
  // Round to 2 decimal places to avoid IEEE float errors
  computedTotal = Math.round(computedTotal * 100) / 100;
  const delta = Math.round((billedTotal - computedTotal) * 100) / 100;
  const hasArithmeticDiscrepancy = Math.abs(delta) >= 1.0;

  // 2. Duplicate Items Check
  const duplicatesMap = new Map<string, { count: number; unitPrice: number; totalImpact: number }>();
  for (const item of items) {
    const normalizedKey = (item.code ? item.code.trim() : item.description.trim()).toLowerCase();
    const existing = duplicatesMap.get(normalizedKey);
    if (existing) {
      existing.count += 1;
      existing.totalImpact += item.totalPrice;
    } else {
      duplicatesMap.set(normalizedKey, {
        count: 1,
        unitPrice: item.unitPrice,
        totalImpact: item.totalPrice,
      });
    }
  }

  const duplicateItems: Array<{ description: string; count: number; totalImpact: number }> = [];
  for (const [key, data] of duplicatesMap.entries()) {
    if (data.count > 1) {
      // Find original descriptive name
      const original = items.find(
        (i) => (i.code ? i.code.trim() : i.description.trim()).toLowerCase() === key
      );
      duplicateItems.push({
        description: original?.description || key,
        count: data.count,
        totalImpact: (data.count - 1) * data.unitPrice,
      });
    }
  }

  // 3. Clinical Cross-Check (e.g. Diagnostic scans billed without documented reports)
  const unreconciledItems: Array<{ description: string; amount: number; reason: string }> = [];
  if (clinicalContext && clinicalContext.patientReportTitles.length > 0) {
    const diagnosticKeywords = ['mri', 'ct scan', 'ultrasound', 'echocardiogram', 'x-ray', 'biopsy'];
    const titlesLower = clinicalContext.patientReportTitles.map((t) => t.toLowerCase());

    for (const item of items) {
      const descLower = item.description.toLowerCase();
      const isDiagnosticCharge = diagnosticKeywords.some((kw) => descLower.includes(kw));

      if (isDiagnosticCharge) {
        const matchesExistingReport = titlesLower.some((title) =>
          diagnosticKeywords.some((kw) => descLower.includes(kw) && title.includes(kw))
        );

        if (!matchesExistingReport) {
          unreconciledItems.push({
            description: item.description,
            amount: item.totalPrice,
            reason: 'Charge for diagnostic scan without corresponding diagnostic report found in patient health chart.',
          });
        }
      }
    }
  }

  // 4. Flags aggregation
  const flags: BillingAuditReport['flags'] = [];

  if (hasArithmeticDiscrepancy) {
    flags.push({
      type: 'ARITHMETIC_ERROR',
      severity: Math.abs(delta) > 500 ? 'HIGH' : 'MEDIUM',
      message: `Possible arithmetic discrepancy: Invoice total (₹${billedTotal.toLocaleString('en-IN')}) differs from line item sum (₹${computedTotal.toLocaleString('en-IN')}) by ₹${Math.abs(delta).toLocaleString('en-IN')}. Requires human review with billing desk.`,
    });
  }

  for (const dup of duplicateItems) {
    flags.push({
      type: 'DUPLICATE_CHARGE',
      severity: dup.totalImpact > 1000 ? 'HIGH' : 'MEDIUM',
      message: `Possible duplicate charge: "${dup.description}" appears ${dup.count} times for ₹${dup.totalImpact.toLocaleString('en-IN')} potential excess. Requires verification.`,
    });
  }

  for (const unrec of unreconciledItems) {
    flags.push({
      type: 'MISSING_CLINICAL_RECORD',
      severity: 'LOW',
      message: `Unreconciled clinical record: "${unrec.description}" (₹${unrec.amount.toLocaleString('en-IN')}). ${unrec.reason}`,
    });
  }

  const hasDiscrepancies = flags.length > 0;

  // 5. Summary Text
  let summaryText = `Billing Audit for Invoice #${invoiceNumber} dated ${invoiceDate}:\n`;
  if (!hasDiscrepancies) {
    summaryText += `✓ All line items sum exactly to ₹${billedTotal.toLocaleString('en-IN')}. No duplicate charges or unreconciled diagnostic items detected.`;
  } else {
    summaryText += `Found ${flags.length} item(s) flagged for human verification:\n`;
    for (const f of flags) {
      summaryText += `• [${f.severity}] ${f.message}\n`;
    }
    summaryText += `\nDisclaimer: Automated audit highlights potential discrepancies for administrative review. Final adjudication rests with hospital administration and the patient.`;
  }

  return {
    invoiceNumber,
    invoiceDate,
    billedTotal,
    computedTotal,
    hasDiscrepancies,
    arithmeticDiscrepancy: hasArithmeticDiscrepancy ? delta : null,
    duplicateItems,
    unreconciledClinicalItems: unreconciledItems,
    flags,
    summaryText,
  };
}
