import { ExtractedBiomarker, GroundedSummary } from './types.js';

export const MANDATORY_CLINICAL_DISCLAIMER =
  'AI assists; a doctor decides. In an emergency, seek urgent care or call 112 / 108.';

export const URGENT_CARE_NOTICE =
  '⚠️ URGENT CLINICAL NOTICE: One or more life-critical abnormal biomarker values were detected. This requires prompt medical evaluation by a licensed physician. If you are experiencing acute chest pain, shortness of breath, severe dizziness, or loss of consciousness, seek immediate emergency care or call 112 / 108 without delay.';

/**
 * Validates that all numeric tokens in the generated summary are grounded in extracted biomarkers.
 * "Rules-before-reasoning": An LLM must never invent a numeric test value.
 */
export function verifySummaryGrounding(
  markdownText: string,
  biomarkers: ExtractedBiomarker[]
): {
  isGrounded: boolean;
  extractedNumbersCount: number;
  matchedNumbersCount: number;
  unmatchedTokens: string[];
} {
  // Collect all valid numbers from the extracted biomarkers
  const validNumbers = new Set<string>();

  for (const b of biomarkers) {
    if (b.numericValue != null) {
      validNumbers.add(String(b.numericValue));
      validNumbers.add(b.numericValue.toFixed(1));
      validNumbers.add(b.numericValue.toFixed(2));
      validNumbers.add(String(Math.round(b.numericValue)));
    }
    if (b.rawValue) {
      // Extract numbers from raw value
      const rawMatches = b.rawValue.match(/\b\d+(\.\d+)?\b/g);
      if (rawMatches) {
        for (const num of rawMatches) {
          validNumbers.add(num);
        }
      }
    }
    if (b.referenceIntervalRaw) {
      const intervalMatches = b.referenceIntervalRaw.match(/\b\d+(\.\d+)?\b/g);
      if (intervalMatches) {
        for (const num of intervalMatches) {
          validNumbers.add(num);
          validNumbers.add(String(parseFloat(num)));
          validNumbers.add(parseFloat(num).toFixed(1));
          validNumbers.add(parseFloat(num).toFixed(2));
        }
      }
    }
    if (b.intervalLow != null) {
      validNumbers.add(String(b.intervalLow));
      validNumbers.add(b.intervalLow.toFixed(1));
      validNumbers.add(b.intervalLow.toFixed(2));
    }
    if (b.intervalHigh != null) {
      validNumbers.add(String(b.intervalHigh));
      validNumbers.add(b.intervalHigh.toFixed(1));
      validNumbers.add(b.intervalHigh.toFixed(2));
    }
  }

  // Common non-clinical numbers that are permitted in boilerplate (e.g. 112, 108 emergency, dates, 60-second)
  const whitelistNumbers = new Set(['112', '108', '60', '1', '2', '3', '4', '5', '12', '24', '48', '90', '100']);

  // Extract all numeric tokens from the summary markdown
  const foundNumbers = markdownText.match(/\b\d+(\.\d+)?\b/g) || [];
  const unmatchedTokens: string[] = [];
  let matchedCount = 0;

  for (const num of foundNumbers) {
    if (validNumbers.has(num) || whitelistNumbers.has(num)) {
      matchedCount++;
    } else {
      unmatchedTokens.push(num);
    }
  }

  const isGrounded = unmatchedTokens.length === 0;

  return {
    isGrounded,
    extractedNumbersCount: foundNumbers.length,
    matchedNumbersCount: matchedCount,
    unmatchedTokens,
  };
}

/**
 * Scans generated text for forbidden diagnostic language and converts to educational phrasing.
 */
export function sanitizeDiagnosticLanguage(text: string): {
  sanitizedText: string;
  hadDiagnosticClaims: boolean;
  replacedPhrases: string[];
} {
  const diagnosticPatterns: Array<{ regex: RegExp; replacement: string; phrase: string }> = [
    {
      regex: /\byou have (type [12] )?diabetes\b/gi,
      replacement: 'your glycemic markers are elevated, which is commonly associated with diabetes mellitus',
      phrase: 'you have diabetes',
    },
    {
      regex: /\byou are diagnosed with ([a-zA-Z\s]+)\b/gi,
      replacement: 'the laboratory markers suggest potential indications of $1',
      phrase: 'you are diagnosed with',
    },
    {
      regex: /\byou have hypothyroidism\b/gi,
      replacement: 'your thyroid stimulating hormone is elevated, which can indicate reduced thyroid activity',
      phrase: 'you have hypothyroidism',
    },
    {
      regex: /\byou must take ([a-zA-Z\s]+)\b/gi,
      replacement: 'your doctor may evaluate medications such as $1',
      phrase: 'you must take',
    },
  ];

  let sanitized = text;
  let hadDiagnosticClaims = false;
  const replacedPhrases: string[] = [];

  for (const item of diagnosticPatterns) {
    if (item.regex.test(sanitized)) {
      hadDiagnosticClaims = true;
      replacedPhrases.push(item.phrase);
      sanitized = sanitized.replace(item.regex, item.replacement);
    }
  }

  return {
    sanitizedText: sanitized,
    hadDiagnosticClaims,
    replacedPhrases,
  };
}

/**
 * Checks for any CRITICAL severity biomarkers and attaches emergency guidance.
 */
export function evaluateSafetyEscalation(biomarkers: ExtractedBiomarker[]): {
  hasCriticalValues: boolean;
  criticalBiomarkers: ExtractedBiomarker[];
  urgentCareNotice: string | null;
} {
  const criticals = biomarkers.filter((b) => b.severity === 'CRITICAL');
  const hasCriticalValues = criticals.length > 0;

  return {
    hasCriticalValues,
    criticalBiomarkers: criticals,
    urgentCareNotice: hasCriticalValues ? URGENT_CARE_NOTICE : null,
  };
}
