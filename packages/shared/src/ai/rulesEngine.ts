import { ExtractedBiomarker } from './types.js';
import { evaluateBiomarkerRange, UNIT_CONVERSIONS } from '../rules.js';

export interface StandardPanelRule {
  panelName: string;
  category: string;
  requiredBiomarkers: string[];
  recommendedFollowUps: string[];
}

export const STANDARD_PANEL_RULES: StandardPanelRule[] = [
  {
    panelName: 'Comprehensive Lipid Profile',
    category: 'Biochemistry / Cardiology',
    requiredBiomarkers: ['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides'],
    recommendedFollowUps: ['hs-CRP cardiovascular inflammatory marker', 'Apolipoprotein B'],
  },
  {
    panelName: 'Thyroid Function Panel',
    category: 'Endocrinology',
    requiredBiomarkers: ['TSH', 'Free T4'],
    recommendedFollowUps: ['Anti-TPO Antibody test to evaluate Hashimoto thyroiditis', 'Free T3'],
  },
  {
    panelName: 'Metabolic & Glycemic Profile',
    category: 'Metabolic Health',
    requiredBiomarkers: ['Fasting Blood Glucose', 'HbA1c Glycated Hgb'],
    recommendedFollowUps: ['Urine Microalbuminuria annual screening', 'eGFR Renal Function'],
  },
  {
    panelName: 'Complete Blood Count (CBC)',
    category: 'Hematology',
    requiredBiomarkers: ['Hemoglobin', 'Total Leukocyte Count', 'Platelet Count'],
    recommendedFollowUps: ['Serum Ferritin & Iron studies if hemoglobin is low', 'Peripheral Blood Smear'],
  },
  {
    panelName: 'Renal Function Test (KFT)',
    category: 'Nephrology',
    requiredBiomarkers: ['Serum Creatinine', 'Blood Urea Nitrogen', 'eGFR'],
    recommendedFollowUps: ['Serum Electrolytes (Sodium, Potassium)', 'Spot Urine Protein/Creatinine Ratio'],
  },
];

/**
 * Deterministically checks for clinical gaps in the current extraction against standard clinical panels.
 */
export function detectClinicalGaps(
  biomarkers: ExtractedBiomarker[],
  categoryOrTitle: string
): string[] {
  const gaps: string[] = [];
  const biomarkerNames = biomarkers.map((b) => b.name.toLowerCase());

  for (const panel of STANDARD_PANEL_RULES) {
    const isRelevant =
      categoryOrTitle.toLowerCase().includes(panel.panelName.toLowerCase().split(' ')[0]) ||
      categoryOrTitle.toLowerCase().includes(panel.category.toLowerCase().split(' ')[0]) ||
      panel.requiredBiomarkers.some((req) => biomarkerNames.some((n) => n.includes(req.toLowerCase().split(' ')[0])));

    if (isRelevant) {
      // Check required biomarkers
      for (const req of panel.requiredBiomarkers) {
        const found = biomarkerNames.some((n) => n.includes(req.toLowerCase().split(' ')[0]));
        if (!found) {
          gaps.push(`Missing standard ${panel.panelName} parameter: ${req}`);
        }
      }

      // Check recommended follow-ups if any biomarker is abnormal
      const hasAbnormal = biomarkers.some((b) => b.severity !== 'NORMAL');
      if (hasAbnormal && panel.recommendedFollowUps.length > 0) {
        for (const rec of panel.recommendedFollowUps) {
          gaps.push(`Clinical surveillance consideration: ${rec}`);
        }
      }
    }
  }

  return Array.from(new Set(gaps));
}

/**
 * Checks for longitudinal contradictions or physiologically implausible shifts between two reports.
 */
export function detectLongitudinalContradictions(
  currentBiomarkers: ExtractedBiomarker[],
  currentDate: string,
  historicalBiomarkers: Array<{
    name: string;
    numericValue: number | null;
    unit: string;
    reportDate: string;
  }>
): string[] {
  const contradictions: string[] = [];
  const currDateObj = new Date(currentDate);

  for (const curr of currentBiomarkers) {
    if (curr.numericValue == null) continue;

    const previousMatches = historicalBiomarkers.filter(
      (h) =>
        h.name.toLowerCase().includes(curr.name.toLowerCase().split(' ')[0]) &&
        h.numericValue != null
    );

    for (const prev of previousMatches) {
      const prevDateObj = new Date(prev.reportDate);
      const diffDays = Math.abs(currDateObj.getTime() - prevDateObj.getTime()) / (1000 * 60 * 60 * 24);

      // Check unit shift
      if (curr.unit.toLowerCase() !== prev.unit.toLowerCase()) {
        contradictions.push(
          `Unit discrepancy detected for ${curr.name}: measured in ${curr.unit} on ${currentDate} vs ${prev.unit} on ${prev.reportDate}. Values normalized for comparison.`
        );
      }

      // Implausible shift check (e.g. HbA1c changing by > 2.0% in under 14 days, since RBC half-life is ~90-120 days)
      if (curr.name.toLowerCase().includes('hba1c') && prev.numericValue != null) {
        const delta = Math.abs(curr.numericValue - prev.numericValue);
        if (diffDays < 14 && delta >= 2.0) {
          contradictions.push(
            `Physiologically improbable HbA1c shift of ${delta.toFixed(1)}% in ${Math.round(diffDays)} days. HbA1c reflects ~90-day glycemic mean; verify possible lab assay discrepancy.`
          );
        }
      }

      // Fasting Glucose extreme jump within 24h
      if (curr.name.toLowerCase().includes('glucose') && prev.numericValue != null) {
        const ratio = curr.numericValue / prev.numericValue;
        if (diffDays <= 1 && (ratio > 2.5 || ratio < 0.4)) {
          contradictions.push(
            `Rapid glycemic volatility: Fasting Glucose moved from ${prev.numericValue} to ${curr.numericValue} ${curr.unit} within ${Math.round(diffDays)} day. Recheck patient fasting status.`
          );
        }
      }
    }
  }

  return contradictions;
}
