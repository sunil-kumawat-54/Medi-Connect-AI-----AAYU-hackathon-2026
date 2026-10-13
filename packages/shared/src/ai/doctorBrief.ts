import { ExtractedBiomarker, DoctorBriefPayload } from './types.js';
import { detectClinicalGaps, detectLongitudinalContradictions } from './rulesEngine.js';

/**
 * Assembles a structured 60-Second Doctor Brief for clinical outpatient review.
 * "Doctor-in-control": Highlights key abnormalities, flags gaps, and requires doctor sign-off.
 */
export function generateDoctorBrief(params: {
  patientId: string;
  patientName: string;
  chiefComplaint?: string;
  biomarkers: ExtractedBiomarker[];
  historicalBiomarkers?: Array<{
    name: string;
    numericValue: number | null;
    unit: string;
    reportDate: string;
  }>;
  reportDate?: string;
  category?: string;
}): DoctorBriefPayload {
  const {
    patientId,
    patientName,
    chiefComplaint = 'Routine follow-up and diagnostic evaluation',
    biomarkers,
    historicalBiomarkers = [],
    reportDate = new Date().toISOString().split('T')[0],
    category = 'General Diagnostic Panel',
  } = params;

  // 1. Triage Priority Assessment
  const hasCritical = biomarkers.some((b) => b.severity === 'CRITICAL');
  const hasElevated = biomarkers.some((b) => b.severity === 'ELEVATED' || b.severity === 'LOW');

  let triageLevel: DoctorBriefPayload['triageLevel'] = 'ROUTINE';
  if (hasCritical) {
    triageLevel = 'CRITICAL PRIORITY';
  } else if (hasElevated) {
    triageLevel = 'MODERATE PRIORITY';
  }

  // 2. Critical & Red-Flag Biomarkers
  const criticalBiomarkers = biomarkers
    .filter((b) => b.severity === 'CRITICAL' || b.severity === 'ELEVATED')
    .map((b) => ({
      id: b.id,
      name: b.name,
      value: `${b.rawValue || b.numericValue} ${b.unit}`,
      unit: b.unit,
      severity: b.severity,
      isVerified: false,
    }));

  // 3. Clinical Gaps Detection
  const gapsDetected = detectClinicalGaps(biomarkers, category);

  // 4. Longitudinal Trends & Contradictions
  const contradictions = detectLongitudinalContradictions(
    biomarkers,
    reportDate,
    historicalBiomarkers
  );

  const longitudinalTrends: string[] = [...contradictions];

  // Compare values with previous records
  for (const curr of biomarkers) {
    if (curr.numericValue == null) continue;
    const prev = historicalBiomarkers.find((h) =>
      h.name.toLowerCase().includes(curr.name.toLowerCase().split(' ')[0])
    );
    if (prev && prev.numericValue != null) {
      const delta = curr.numericValue - prev.numericValue;
      const pct = Math.round((delta / prev.numericValue) * 100);
      const direction = delta > 0 ? 'increased' : 'decreased';
      longitudinalTrends.push(
        `${curr.name}: ${direction} by ${Math.abs(pct)}% (from ${prev.numericValue} to ${curr.numericValue} ${curr.unit}) since ${prev.reportDate}.`
      );
    }
  }

  if (longitudinalTrends.length === 0) {
    longitudinalTrends.push('Baseline diagnostic reading; longitudinal trend will track upon subsequent uploads.');
  }

  // 5. Brief Markdown
  let md = `## 60-Second Patient Clinical Brief (SCR-11)\n\n`;
  md += `**Patient**: ${patientName} • **Triage Level**: [${triageLevel}]\n`;
  md += `**Chief Complaint**: ${chiefComplaint}\n\n`;

  md += `### 1. Key Abnormalities & Red Flags\n`;
  if (criticalBiomarkers.length === 0) {
    md += `• No critical or elevated biomarker abnormalities detected in current panel.\n`;
  } else {
    for (const b of criticalBiomarkers) {
      md += `• **${b.name}**: ${b.value} (${b.severity}) — *[NEEDS DOCTOR VERIFICATION]*\n`;
    }
  }

  md += `\n### 2. Longitudinal Trajectory\n`;
  for (const t of longitudinalTrends) {
    md += `• ${t}\n`;
  }

  md += `\n### 3. Detected Gaps & Follow-up Considerations\n`;
  if (gapsDetected.length === 0) {
    md += `• Standard panel parameters complete.\n`;
  } else {
    for (const g of gapsDetected) {
      md += `• ${g}\n`;
    }
  }

  md += `\n---\n*Clinical Safety Protocol: AI provides synthesized extraction; attending physician must review and certify before final consultation sign-off.*`;

  return {
    patientId,
    patientName,
    chiefComplaint,
    triageLevel,
    criticalBiomarkers,
    longitudinalTrends,
    gapsDetected,
    briefMarkdown: md,
  };
}
