/**
 * Medi Connect AI — Core TypeScript Domain Models & Database Types
 */

export type UserRole = 'patient' | 'doctor' | 'hospital_staff' | 'super_admin';

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type BiomarkerSeverity = 'NORMAL' | 'LOW' | 'ELEVATED' | 'CRITICAL';
export type SummaryReviewStatus = 'DRAFT' | 'APPROVED' | 'EDITED' | 'REJECTED';
export type ConsentStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type ConsentScope = 'reports' | 'timeline' | 'ai_summary' | 'prescriptions';
export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
export type FoodTiming = 'BEFORE_FOOD' | 'AFTER_FOOD' | 'WITH_FOOD';
export type BillingFlagSeverity = 'INFO' | 'WARNING' | 'ALERT';
export type DoseStatus = 'TAKEN' | 'MISSED' | 'SKIPPED';

export interface BoundingBox {
  page: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface Profile {
  id: string; // matches auth.users.id
  email: string;
  role: UserRole;
  full_name: string;
  phone?: string | null;
  abha_id_mock?: string | null;
  date_of_birth?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Hospital {
  id: string;
  name: string;
  accreditation_number: string;
  city: string;
  state: string;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  profile_id: string;
  license_number: string;
  specialty: string;
  experience_years: number;
  consultation_fee: number;
  bio?: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface HospitalStaff {
  id: string;
  profile_id: string;
  hospital_id: string;
  department: string;
  role_title: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  hospital?: Hospital;
}

export interface DoctorHospital {
  id: string;
  doctor_id: string;
  hospital_id: string;
  department: string;
  consultation_fee?: number | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  id: string;
  doctor_id: string;
  hospital_id?: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  max_patients: number;
  is_booked: boolean;
  created_at: string;
}

export interface MedicalReport {
  id: string;
  patient_id: string;
  title: string;
  lab_name: string;
  report_date: string;
  category: string;
  file_path: string;
  file_type: string;
  file_size_bytes: number;
  processing_status: ProcessingStatus;
  ocr_confidence?: number | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportPage {
  id: string;
  report_id: string;
  page_number: number;
  extracted_text: string;
  ocr_confidence?: number | null;
  created_at: string;
}

export interface Biomarker {
  id: string;
  report_id: string;
  patient_id: string;
  name: string;
  raw_value: string;
  numeric_value?: number | null;
  unit: string;
  normalized_unit?: string | null;
  reference_interval_raw?: string | null;
  interval_low?: number | null;
  interval_high?: number | null;
  severity: BiomarkerSeverity;
  bounding_box?: BoundingBox | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export interface AISummary {
  id: string;
  report_id: string;
  patient_id: string;
  version: number;
  summary_type: string;
  content_markdown: string;
  citations_json: Array<{ claim: string; page: number; box: number[] }>;
  red_flags_json: string[];
  gaps_json: string[];
  review_status: SummaryReviewStatus;
  reviewed_by_doctor_id?: string | null;
  doctor_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SummarySourceLink {
  id: string;
  summary_id: string;
  report_page_id: string;
  claim_text: string;
  bounding_box: BoundingBox;
  created_at: string;
}

export interface PatientConsent {
  id: string;
  patient_id: string;
  doctor_id?: string | null;
  hospital_id?: string | null;
  scopes: ConsentScope[];
  lookback_months: number;
  status: ConsentStatus;
  valid_from: string;
  valid_until: string;
  granted_at: string;
  revoked_at?: string | null;
}

export interface DoctorBrief {
  id: string;
  patient_id: string;
  appointment_id?: string | null;
  chief_complaint: string;
  triage_level: string;
  brief_markdown: string;
  critical_biomarkers: any[];
  gaps_detected: any[];
  created_at: string;
}

export interface DoctorReview {
  id: string;
  summary_id: string;
  doctor_id: string;
  decision: SummaryReviewStatus;
  clinical_notes?: string | null;
  signed_at: string;
}

export interface MedicalTimelineEvent {
  id: string;
  patient_id: string;
  event_type: string;
  title: string;
  description?: string | null;
  event_date: string;
  reference_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  hospital_id?: string | null;
  slot_id?: string | null;
  appointment_date: string;
  start_time: string;
  status: AppointmentStatus;
  chief_complaint?: string | null;
  symptom_audio_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalNote {
  id: string;
  appointment_id?: string | null;
  patient_id: string;
  doctor_id: string;
  subjective?: string | null;
  objective?: string | null;
  assessment: string;
  plan: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  id: string;
  appointment_id?: string | null;
  patient_id: string;
  doctor_id: string;
  diagnosis?: string | null;
  instructions?: string | null;
  created_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  food_timing: FoodTiming;
  instructions?: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  prescription_id?: string | null;
  name: string;
  dosage: string;
  frequency: string;
  food_timing: FoodTiming;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  remaining_doses: number;
  created_at: string;
  updated_at: string;
}

export interface MedicationReminder {
  id: string;
  medication_id: string;
  patient_id: string;
  reminder_time: string;
  label: string;
  is_enabled: boolean;
  created_at: string;
}

export interface MedicationDoseLog {
  id: string;
  medication_id: string;
  patient_id: string;
  scheduled_at: string;
  taken_at?: string | null;
  status: DoseStatus;
  created_at: string;
}

export interface Bill {
  id: string;
  patient_id: string;
  hospital_id?: string | null;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  currency: string;
  file_path: string;
  has_discrepancies: boolean;
  audit_summary?: string | null;
  created_at: string;
}

export interface BillItem {
  id: string;
  bill_id: string;
  item_code?: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  service_date?: string | null;
  created_at: string;
}

export interface BillingFlag {
  id: string;
  bill_id: string;
  bill_item_id?: string | null;
  flag_type: string;
  severity: BillingFlagSeverity;
  message: string;
  amount_delta: number;
  is_resolved: boolean;
  resolution_note?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  patient_id: string;
  doctor_id?: string | null;
  hospital_id?: string | null;
  title: string;
  language: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'patient' | 'doctor' | 'staff' | 'assistant' | 'system';
  content: string;
  audio_url?: string | null;
  citations_json?: any[] | null;
  is_read: boolean;
  created_at: string;
}

export interface PublicHealthScheme {
  id: string;
  scheme_code: string;
  scheme_name: string;
  description: string;
  eligibility_criteria: string;
  coverage_details?: string | null;
  helpline_number?: string | null;
  official_portal_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_hash: string;
  role: UserRole;
  action: string;
  resource_type: string;
  resource_hash?: string | null;
  status: string;
  ip_hash?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}
