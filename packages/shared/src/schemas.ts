/**
 * Medi Connect AI — Zod Validation Schemas
 * Type-safe form and API request validators for Web and Mobile
 */

import { z } from 'zod';

export const UserRoleSchema = z.enum(['patient', 'doctor', 'hospital_staff', 'super_admin']);

export const PasswordPolicySchema = z.string()
  .min(10, 'Password must be at least 10 characters long')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
  .refine((val) => !['password123', 'admin12345', 'qwerty1234', '1234567890'].includes(val.toLowerCase()), {
    message: 'Common breached passwords are not allowed',
  });

/**
 * Public sign-up schema: Strictly creates 'patient' accounts.
 * Privileged roles (doctor, hospital_staff, super_admin) are provisioned server-side only.
 */
export const SignUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: PasswordPolicySchema,
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number').optional().or(z.literal('')),
  terms_accepted: z.boolean().refine((val) => val === true, 'You must accept the terms of clinical safety'),
});

export const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Mock Aadhaar / ABHA ID verification schema (Sandbox Only)
 */
export const MockAadhaarAuthSchema = z.object({
  aadhaar_or_abha: z.string().regex(/^\d{12}$|^[a-zA-Z0-9._-]{4,}@abdm$/, 'Enter a valid 12-digit mock Aadhaar or ABHA address'),
});

export const MockOtpVerifySchema = z.object({
  phone_or_id: z.string(),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const ReportUploadSchema = z.object({
  title: z.string().min(2, 'Report title is required'),
  lab_name: z.string().min(2, 'Diagnostic laboratory name is required'),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  category: z.string().min(2, 'Category is required (e.g., Biochemistry, Pathology)'),
});

export const DoctorConsentGrantSchema = z.object({
  doctor_id: z.string().uuid().optional().nullable(),
  hospital_id: z.string().uuid().optional().nullable(),
  scope_reports_12m: z.boolean().default(true),
  scope_timeline: z.boolean().default(true),
  scope_ai_summary: z.boolean().default(true),
  duration_days: z.number().int().min(1).max(90).default(7),
}).refine(
  (data) => !!data.doctor_id || !!data.hospital_id,
  { message: 'Either doctor_id or hospital_id must be specified for consent grant' }
);

export const AppointmentBookingSchema = z.object({
  doctor_id: z.string().uuid('Invalid doctor ID'),
  hospital_id: z.string().uuid().optional().nullable(),
  slot_id: z.string().uuid().optional().nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time required (HH:MM)'),
  chief_complaint: z.string().min(5, 'Please provide a brief description of symptoms (min 5 characters)'),
  consent_granted: z.boolean().refine((val) => val === true, 'Patient consent to share medical history is required'),
});

export const DoctorBriefActionSchema = z.object({
  summary_id: z.string().uuid(),
  action: z.enum(['APPROVE', 'EDIT', 'REJECT']),
  doctor_notes: z.string().optional().nullable(),
  prescriptions: z.array(z.object({
    medication_name: z.string().min(1),
    dosage: z.string().min(1),
    frequency: z.string().min(1),
    duration_days: z.number().int().positive(),
    food_timing: z.enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD']),
    instructions: z.string().optional().nullable(),
  })).optional(),
});

export const BillAuditUploadSchema = z.object({
  hospital_id: z.string().uuid().optional().nullable(),
  invoice_number: z.string().min(1, 'Invoice number is required'),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)'),
  total_amount: z.number().positive('Total billed amount must be positive'),
});

export type SignUpInput = z.infer<typeof SignUpSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ReportUploadInput = z.infer<typeof ReportUploadSchema>;
export type DoctorConsentGrantInput = z.infer<typeof DoctorConsentGrantSchema>;
export type AppointmentBookingInput = z.infer<typeof AppointmentBookingSchema>;
export type DoctorBriefActionInput = z.infer<typeof DoctorBriefActionSchema>;
