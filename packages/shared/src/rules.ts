/**
 * Medi Connect AI — Deterministic Medical Validation & Range Evaluator
 * "Rules-Before-Reasoning": Code evaluates numeric biomarkers, never the LLM alone.
 */

import { BiomarkerSeverity } from './types';

export interface RangeValidationResult {
  severity: BiomarkerSeverity;
  isNormal: boolean;
  isCritical: boolean;
  deviationPercent?: number;
  message: string;
}

/**
 * Standard unit normalization dictionary for common Indian diagnostic panels
 */
export const UNIT_CONVERSIONS: Record<string, { toStandard: (val: number) => number; standardUnit: string }> = {
  // Blood Glucose (mmol/L to mg/dL)
  'mmol/L_glucose': {
    toStandard: (val: number) => val * 18.0182,
    standardUnit: 'mg/dL',
  },
  // Total Cholesterol (mmol/L to mg/dL)
  'mmol/L_cholesterol': {
    toStandard: (val: number) => val * 38.67,
    standardUnit: 'mg/dL',
  },
  // HbA1c (mmol/mol to %)
  'mmol/mol_hba1c': {
    toStandard: (val: number) => (val * 0.09148) + 2.152,
    standardUnit: '%',
  },
};

/**
 * Deterministically evaluates a biomarker numeric value against standard reference intervals
 */
export function evaluateBiomarkerRange(
  value: number,
  intervalLow: number | null | undefined,
  intervalHigh: number | null | undefined,
  criticalLowMultiplier = 0.5,
  criticalHighMultiplier = 1.75
): RangeValidationResult {
  // If no interval provided, return NORMAL default with warning message
  if (intervalLow == null && intervalHigh == null) {
    return {
      severity: 'NORMAL',
      isNormal: true,
      isCritical: false,
      message: 'No laboratory reference interval specified',
    };
  }

  // Upper bound check only
  if (intervalLow == null && intervalHigh != null) {
    if (value <= intervalHigh) {
      return { severity: 'NORMAL', isNormal: true, isCritical: false, message: 'Within reference interval' };
    }
    const isCritical = value >= intervalHigh * criticalHighMultiplier;
    return {
      severity: isCritical ? 'CRITICAL' : 'ELEVATED',
      isNormal: false,
      isCritical,
      deviationPercent: ((value - intervalHigh) / intervalHigh) * 100,
      message: isCritical ? 'Critically above reference limit' : 'Elevated above reference limit',
    };
  }

  // Lower bound check only
  if (intervalLow != null && intervalHigh == null) {
    if (value >= intervalLow) {
      return { severity: 'NORMAL', isNormal: true, isCritical: false, message: 'Within reference interval' };
    }
    const isCritical = value <= intervalLow * criticalLowMultiplier;
    return {
      severity: isCritical ? 'CRITICAL' : 'LOW',
      isNormal: false,
      isCritical,
      deviationPercent: ((intervalLow - value) / intervalLow) * 100,
      message: isCritical ? 'Critically below reference limit' : 'Below reference limit',
    };
  }

  // Both bounds present
  if (intervalLow != null && intervalHigh != null) {
    if (value >= intervalLow && value <= intervalHigh) {
      return {
        severity: 'NORMAL',
        isNormal: true,
        isCritical: false,
        message: 'Within normal laboratory interval',
      };
    }

    if (value > intervalHigh) {
      const isCritical = value >= intervalHigh * criticalHighMultiplier;
      return {
        severity: isCritical ? 'CRITICAL' : 'ELEVATED',
        isNormal: false,
        isCritical,
        deviationPercent: ((value - intervalHigh) / intervalHigh) * 100,
        message: isCritical ? 'Critically elevated' : 'Elevated',
      };
    }

    if (value < intervalLow) {
      const isCritical = value <= intervalLow * criticalLowMultiplier;
      return {
        severity: isCritical ? 'CRITICAL' : 'LOW',
        isNormal: false,
        isCritical,
        deviationPercent: ((intervalLow - value) / intervalLow) * 100,
        message: isCritical ? 'Critically low' : 'Below normal interval',
      };
    }
  }

  return {
    severity: 'NORMAL',
    isNormal: true,
    isCritical: false,
    message: 'Evaluated normal',
  };
}
