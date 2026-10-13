import { z } from 'zod';
import { BiomarkerSeverity, BoundingBox } from '../types.js';

export const ExtractedBiomarkerSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Biomarker name cannot be empty'),
  rawValue: z.string(),
  numericValue: z.number().nullable(),
  unit: z.string(),
  normalizedUnit: z.string().nullable(),
  referenceIntervalRaw: z.string().nullable(),
  intervalLow: z.number().nullable(),
  intervalHigh: z.number().nullable(),
  severity: z.enum(['NORMAL', 'LOW', 'ELEVATED', 'CRITICAL']),
  boundingBox: z.object({
    page: z.number(),
    x_min: z.number(),
    y_min: z.number(),
    x_max: z.number(),
    y_max: z.number(),
  }).nullable(),
  ocrConfidence: z.number().min(0).max(100),
  confidenceWarning: z.string().nullable().optional(),
});

export type ExtractedBiomarker = z.infer<typeof ExtractedBiomarkerSchema>;

export const GroundedCitationSchema = z.object({
  claim: z.string(),
  sourceBiomarkerId: z.string(),
  biomarkerName: z.string(),
  observedValue: stringOrNumber(),
  referenceInterval: z.string().nullable().optional(),
  page: z.number().default(1),
  box: z.array(z.number()).length(4).nullable().optional(),
});

function stringOrNumber() {
  return z.union([z.string(), z.number()]).transform((val) => String(val));
}

export type GroundedCitation = z.infer<typeof GroundedCitationSchema>;

export const GroundedSummarySchema = z.object({
  contentMarkdown: z.string(),
  contentHindiMarkdown: z.string().optional(),
  citations: z.array(GroundedCitationSchema),
  redFlags: z.array(z.string()),
  gaps: z.array(z.string()),
  urgentCareNotice: z.string().nullable(),
  disclaimer: z.string(),
  isGroundedVerified: z.boolean(),
  groundingAudit: z.object({
    extractedNumbersCount: z.number(),
    matchedNumbersCount: z.number(),
    unmatchedTokens: z.array(z.string()),
  }),
});

export type GroundedSummary = z.infer<typeof GroundedSummarySchema>;

export interface ReportProcessingResult {
  reportId: string;
  status: 'READY' | 'NEEDS_REVIEW' | 'FAILED';
  ocrConfidence: number;
  extractedBiomarkers: ExtractedBiomarker[];
  summary: GroundedSummary;
  rawTextExcerpt: string;
  processingTimeMs: number;
  errorMessage?: string;
  tokensConsumed?: number;
}

export interface DoctorBriefPayload {
  patientId: string;
  patientName: string;
  chiefComplaint: string;
  triageLevel: 'CRITICAL PRIORITY' | 'MODERATE PRIORITY' | 'ROUTINE';
  criticalBiomarkers: Array<{
    id: string;
    name: string;
    value: string;
    unit: string;
    severity: BiomarkerSeverity;
    isVerified: boolean;
  }>;
  longitudinalTrends: string[];
  gapsDetected: string[];
  briefMarkdown: string;
  briefHindiMarkdown?: string;
}

export interface BillingLineItem {
  id: string;
  code?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  date?: string;
}

export interface BillingAuditReport {
  invoiceNumber: string;
  invoiceDate: string;
  billedTotal: number;
  computedTotal: number;
  hasDiscrepancies: boolean;
  arithmeticDiscrepancy: number | null;
  duplicateItems: Array<{
    description: string;
    count: number;
    totalImpact: number;
  }>;
  unreconciledClinicalItems: Array<{
    description: string;
    amount: number;
    reason: string;
  }>;
  flags: Array<{
    type: 'ARITHMETIC_ERROR' | 'DUPLICATE_CHARGE' | 'MISSING_CLINICAL_RECORD';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
  summaryText: string;
}
