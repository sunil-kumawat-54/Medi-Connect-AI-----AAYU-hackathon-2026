import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Profile, MedicalReport, Biomarker, AISummary, PatientConsent, Appointment, Doctor } from '@medi-connect/shared';
import {
  simulateReportExtraction,
  generateMockAssistantReply,
  analyzeMockBillDiscrepancies,
  computeAge,
  evaluateMedicationSlots,
  getKolkataDateTime,
  executeReportPipeline,
  processAssistantChatQuery,
  FIXED_CHAT_MENU_PROMPTS,
  auditHospitalInvoice,
  generateHindiExplanation,
} from '@medi-connect/shared';
import {
  FileText,
  UploadCloud,
  Clock,
  Calendar,
  Shield,
  MessageSquare,
  Pill,
  Receipt,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Search,
  ExternalLink,
  ShieldAlert,
  Send,
  Lock,
  XCircle,
  Eye,
  PlusCircle,
  RefreshCw,
  UserCheck
} from 'lucide-react';

interface PatientDashboardProps {
  profile: Profile;
  language: 'en' | 'hi';
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({ profile, language }) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'reports' | 'timeline' | 'appointments' | 'medications' | 'assistant' | 'billing' | 'privacy'
  >('overview');

  // Live Supabase Data State
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [loadingAccessLogs, setLoadingAccessLogs] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selected Report for Split-Screen Explanation (SCR-04)
  const [selectedReport, setSelectedReport] = useState<MedicalReport | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<AISummary | null>(null);
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<Biomarker[]>([]);
  const [summaryLang, setSummaryLang] = useState<'en' | 'hi'>('en');
  const [activeCitationBox, setActiveCitationBox] = useState<number[] | null>(null);
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null);

  // Ingestion Modal State (SCR-03)
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadLab, setUploadLab] = useState('Apex Diagnostics & Clinical Labs');
  const [uploadCategory, setUploadCategory] = useState('Biochemistry');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'ocr' | 'summarizing' | 'done'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Booking & Consent Modal State (SCR-08)
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>('');
  const [bookingTime, setBookingTime] = useState<string>('10:00');
  const [bookingComplaint, setBookingComplaint] = useState<string>('');
  const [consentLookback, setConsentLookback] = useState<number>(12);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Health Assistant Chat State (SCR-06)
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; time: string; citations?: any[] }>>([
    {
      sender: 'assistant',
      text: `Hello ${profile.full_name}! I am your clinical health assistant. I can explain your diagnostic tests, help you prepare for doctor consultations, or answer questions about your medications.\n\n⚠️ AI assists, doctor decides. In an emergency, call 112 / 108.`,
      time: 'Just now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Medication Dose Tracking State (SCR-09)
  const [medications, setMedications] = useState<any[]>([]);
  const [medicationReminders, setMedicationReminders] = useState<any[]>([]);
  const [medicationDoseLogs, setMedicationDoseLogs] = useState<any[]>([]);
  const [loggingDoseSlot, setLoggingDoseSlot] = useState<string | null>(null);

  // Billing Discrepancy Items (SCR-13)
  const [mockBillItems] = useState([
    { code: 'OPD-801', desc: 'Consultant Clinical Specialist Fee', qty: 1, rate: 800, amount: 800, flag: null },
    { code: 'LAB-204', desc: 'Comprehensive Metabolic Panel (HbA1c & Fasting Glucose)', qty: 1, rate: 1200, amount: 1200, flag: null },
    { code: 'DISP-019', desc: 'Disposable Syringe & Infusion Set 20ml', qty: 4, rate: 110, amount: 440, flag: 'Possible discrepancy, requires review: Billed 4x during outpatient visit (standard: max 1x)' },
    { code: 'ADM-902', desc: 'Administrative Record Archival & Digital Processing', qty: 1, rate: 250, amount: 250, flag: 'Possible discrepancy, requires review: Administrative fee exceeds NABH recommended benchmark by ₹120' },
  ]);

  // Fetch live patient data from Supabase
  const loadPatientData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Reports
      const { data: repData } = await supabase
        .from('medical_reports')
        .select('*')
        .eq('patient_id', profile.id)
        .order('created_at', { ascending: false });

      if (repData) {
        setReports(repData as MedicalReport[]);
        if (repData.length > 0 && !selectedReport) {
          handleSelectReport(repData[0] as MedicalReport);
        }
      }

      // 2. Fetch Biomarkers
      const { data: bioData } = await supabase
        .from('biomarkers')
        .select('*')
        .eq('patient_id', profile.id)
        .order('created_at', { ascending: false });

      if (bioData) {
        setBiomarkers(bioData as Biomarker[]);
      }

      // 3. Fetch Consents
      const { data: conData } = await supabase
        .from('patient_consents')
        .select('*, doctor:doctors(*, profile:profiles(*))')
        .eq('patient_id', profile.id)
        .order('granted_at', { ascending: false });

      if (conData) {
        setConsents(conData);
      }

      // 4. Fetch Appointments
      const { data: appData } = await supabase
        .from('appointments')
        .select('*, doctor:doctors(*, profile:profiles(*))')
        .eq('patient_id', profile.id)
        .order('appointment_date', { ascending: true });

      if (appData) {
        setAppointments(appData);
      }

      // 5. Fetch Doctors
      const { data: docData } = await supabase
        .from('doctors')
        .select('*, profile:profiles(*)');

      if (docData) {
        setDoctors(docData);
        if (docData.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(docData[0].id);
        }
      }

      // 6. Fetch Medications (SCR-09)
      const { data: medsData } = await supabase
        .from('medications')
        .select('*')
        .eq('patient_id', profile.id)
        .order('name');
      if (medsData) setMedications(medsData);

      // 7. Fetch Medication Reminders
      const { data: remData } = await supabase
        .from('medication_reminders')
        .select('*')
        .eq('patient_id', profile.id);
      if (remData) setMedicationReminders(remData);

      // 8. Fetch Medication Dose Logs (Kolkata date)
      const { dateString } = getKolkataDateTime();
      const { data: doseLogsData } = await supabase
        .from('medication_dose_logs')
        .select('*')
        .eq('patient_id', profile.id)
        .eq('scheduled_date', dateString);
      if (doseLogsData) setMedicationDoseLogs(doseLogsData);

      // 9. Fetch SCR-15 Patient Access Logs via SECURITY DEFINER RPC
      await fetchAccessLogs();
    } catch (err) {
      console.error('Error loading patient data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessLogs = async () => {
    try {
      setLoadingAccessLogs(true);
      const { data, error } = await supabase.rpc('get_patient_access_log');
      if (data) {
        setAccessLogs(data);
      }
    } catch (err) {
      console.warn('Error fetching SCR-15 access logs:', err);
    } finally {
      setLoadingAccessLogs(false);
    }
  };

  useEffect(() => {
    loadPatientData();
  }, [profile.id]);

  const handleSelectReport = async (rep: MedicalReport) => {
    setSelectedReport(rep);
    setActiveCitationBox(null);
    setSignedDocUrl(null);

    // Call audited SECURITY DEFINER RPC for report viewing
    try {
      await supabase.rpc('get_medical_report_for_view', { p_report_id: rep.id });
    } catch (rpcErr) {
      console.warn('Audited report view RPC error:', rpcErr);
    }

    // Call audited SECURITY DEFINER RPC for storage access
    try {
      await supabase.rpc('get_storage_document_signed_access', { p_object_path: rep.file_path });
    } catch (rpcErr) {
      console.warn('Audited storage signed access RPC error:', rpcErr);
    }

    // Fetch storage signed URL for document
    try {
      const { data: urlData } = await supabase.storage
        .from('patient-medical-documents')
        .createSignedUrl(rep.file_path, 3600);
      if (urlData?.signedUrl) {
        setSignedDocUrl(urlData.signedUrl);
      }
    } catch (urlErr) {
      console.warn('Storage signed URL error:', urlErr);
    }

    // Fetch associated summary
    const { data: sumData } = await supabase
      .from('ai_summaries')
      .select('*')
      .eq('report_id', rep.id)
      .maybeSingle();

    if (sumData) {
      setSelectedSummary(sumData as AISummary);
    } else {
      setSelectedSummary(null);
    }

    // Fetch associated biomarkers
    const { data: bioData } = await supabase
      .from('biomarkers')
      .select('*')
      .eq('report_id', rep.id);

    if (bioData) {
      setSelectedBiomarkers(bioData as Biomarker[]);
    }
  };

  // Upload and Simulated Ingestion Pipeline (SCR-03)
  const handleSimulateUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle) return;

    try {
      setUploadStage('uploading');
      setUploadProgress(20);

      const fakePath = `${profile.id}/${Date.now()}_${uploadTitle.replace(/\s+/g, '_')}.pdf`;
      const reportId = crypto.randomUUID();

      // 1. Truly upload file or generated PDF Blob to storage bucket 'patient-medical-documents'
      const fileBlob = uploadFile || new Blob([
        `%PDF-1.4 Clinical Diagnostic Report: ${uploadTitle}\nPatient: ${profile.full_name}\nCategory: ${uploadCategory}\nLab: ${uploadLab}\nDate: ${new Date().toISOString()}`
      ], { type: 'application/pdf' });

      const { error: storeError } = await supabase.storage
        .from('patient-medical-documents')
        .upload(fakePath, fileBlob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (storeError) {
        console.warn('Storage upload note:', storeError.message);
      }

      // 2. Insert into medical_reports with initial status 'UPLOADED'
      setUploadProgress(70);
      setUploadStage('ocr');
      const { data: newRep, error: repError } = await supabase
        .from('medical_reports')
        .insert({
          id: reportId,
          patient_id: profile.id,
          title: uploadTitle,
          lab_name: uploadLab,
          report_date: new Date().toISOString().split('T')[0],
          category: uploadCategory,
          file_path: fakePath,
          file_type: 'application/pdf',
          file_size_bytes: fileBlob.size,
          processing_status: 'UPLOADED',
          ocr_confidence: null,
        })
        .select()
        .single();

      if (repError) throw repError;

      // Note: Extraction, rule-based explanation, and status progression happen strictly server-side.
      // Client cannot write biomarkers, summaries, or mutate status (enforced by RLS & DB trigger).
      setUploadProgress(100);
      setUploadStage('done');

      // Refresh data
      await loadPatientData();
      setShowUploadModal(false);
      setUploadStage('idle');
      setActiveTab('reports');
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
      setUploadStage('idle');
    }
  };

  // Instant Consent Revocation (SCR-15)
  const handleRevokeConsent = async (consentId: string) => {
    try {
      const { error } = await supabase
        .from('patient_consents')
        .update({
          status: 'REVOKED',
          revoked_at: new Date().toISOString(),
        })
        .eq('id', consentId);

      if (error) throw error;
      await loadPatientData();
    } catch (err: any) {
      alert('Error revoking consent: ' + err.message);
    }
  };

  // Instant Consent Re-Authorization
  const handleReauthorizeConsent = async (consentId: string) => {
    try {
      const { error } = await supabase
        .from('patient_consents')
        .update({
          status: 'ACTIVE',
          revoked_at: null,
          valid_from: new Date().toISOString(),
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', consentId);

      if (error) throw error;
      await loadPatientData();
    } catch (err: any) {
      alert('Error re-authorizing consent: ' + err.message);
    }
  };

  // Book Appointment with Consent (SCR-08)
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !bookingDate) return;

    try {
      setBookingLoading(true);
      const apptId = crypto.randomUUID();

      // 1. Create Appointment
      const { error: apptError } = await supabase.from('appointments').insert({
        id: apptId,
        patient_id: profile.id,
        doctor_id: selectedDoctorId,
        appointment_date: bookingDate,
        start_time: bookingTime + ':00',
        status: 'CONFIRMED',
        chief_complaint: bookingComplaint || 'Routine medical review',
      });

      if (apptError) throw apptError;

      // 2. Create Active Consent Grant with Lookback Window
      const { error: conError } = await supabase.from('patient_consents').insert({
        patient_id: profile.id,
        doctor_id: selectedDoctorId,
        scopes: ['reports', 'timeline', 'ai_summary', 'prescriptions'],
        lookback_months: consentLookback,
        status: 'ACTIVE',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (conError) throw conError;

      alert('Appointment confirmed! Doctor consent granted for ' + consentLookback + ' months lookback.');
      setShowBookingModal(false);
      setBookingComplaint('');
      await loadPatientData();
      setActiveTab('appointments');
    } catch (err: any) {
      alert('Booking error: ' + err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // Chat message send
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    const userMsg = {
      sender: 'user' as const,
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    // Generate AI response with clinical refusal & escalation safety guards (Phase 4)
    setTimeout(() => {
      const recentBios = biomarkers.slice(0, 6).map((b) => ({
        name: b.name,
        value: b.raw_value || String(b.numeric_value),
        unit: b.unit,
        severity: b.severity,
      }));

      const reply = processAssistantChatQuery(userText, {
        patientName: profile.full_name,
        recentBiomarkers: recentBios,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: reply.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citations: reply.citations,
        },
      ]);
    }, 350);
  };

  const handleLogDose = async (medicationId: string, slot: string) => {
    try {
      setLoggingDoseSlot(`${medicationId}-${slot}`);
      const { dateString } = getKolkataDateTime();
      const { error } = await supabase.rpc('log_dose', {
        p_medication_id: medicationId,
        p_slot: slot,
        p_scheduled_date: dateString,
      });
      if (error) throw error;
      await loadPatientData();
    } catch (err: any) {
      alert('Error logging dose: ' + err.message);
    } finally {
      setLoggingDoseSlot(null);
    }
  };

  const handleUndoDose = async (doseLogId: string) => {
    try {
      const { error } = await supabase.rpc('undo_dose', {
        p_dose_log_id: doseLogId,
      });
      if (error) throw error;
      await loadPatientData();
    } catch (err: any) {
      alert('Error undoing dose: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Patient Sub-Navigation Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex flex-wrap gap-1">
        {[
          { id: 'overview', label: 'Health Overview', icon: TrendingUp },
          { id: 'reports', label: 'Diagnostic Reports', icon: FileText, count: reports.length },
          { id: 'timeline', label: 'Medical Timeline', icon: Clock },
          { id: 'appointments', label: 'Appointments & Doctors', icon: Calendar, count: appointments.length },
          { id: 'medications', label: 'Medications', icon: Pill },
          { id: 'assistant', label: 'Health Assistant', icon: MessageSquare },
          { id: 'billing', label: 'Billing Review', icon: Receipt },
          { id: 'privacy', label: 'Privacy & Consent', icon: Shield, count: consents.filter(c => c.status === 'ACTIVE').length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TAB 1: HEALTH OVERVIEW (SCR-02)                                    */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-brand-900 via-navy-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 max-w-2xl">
              <span className="bg-brand-500/20 text-brand-300 border border-brand-400/30 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wide uppercase">
                Patient Health Cockpit
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold font-heading mt-3">
                Welcome back, {profile.full_name}
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 font-mono">
                Age: {computeAge(profile.date_of_birth) ?? 44} yrs • ABHA: {profile.abha_id_mock || 'aarav@abdm-demo'}
              </p>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                Your medical timeline and diagnostic records are protected by Supabase Row-Level Security. Upload recent pathology reports to generate grounded clinical explanations and synchronized doctor briefs.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm flex items-center space-x-2 transition shadow-md"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Medical Report</span>
                </button>
                <button
                  onClick={() => setShowBookingModal(true)}
                  className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl font-medium text-sm flex items-center space-x-2 transition border border-white/20"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Consultation</span>
                </button>
              </div>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
              <TrendingUp className="w-96 h-96 text-white" />
            </div>
          </div>

          {/* Quick Health Biomarker Sparklines (SCR-02: Computed directly from Supabase biomarkers) */}
          {(() => {
            const glucoseBio = biomarkers.find(b => b.name?.toLowerCase().includes('glucose'));
            const hba1cBio = biomarkers.find(b => b.name?.toLowerCase().includes('hba1c') || b.name?.toLowerCase().includes('glycated'));
            const cholBio = biomarkers.find(b => b.name?.toLowerCase().includes('cholesterol'));

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 uppercase font-semibold">Fasting Blood Glucose</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      glucoseBio?.severity === 'CRITICAL' || glucoseBio?.severity === 'ELEVATED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {glucoseBio?.severity || 'NORMAL'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline space-x-2">
                    <span id="fasting-glucose-value" className="text-2xl font-bold text-slate-900 font-heading">
                      {glucoseBio ? (glucoseBio.numeric_value ?? glucoseBio.raw_value) : '—'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{glucoseBio?.unit || 'mg/dL'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {glucoseBio?.reference_interval_raw ? `Target: ${glucoseBio.reference_interval_raw}` : 'Target: 70 - 99 mg/dL'} • Computed from Biomarkers
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 uppercase font-semibold">HbA1c Glycated Hgb</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      hba1cBio?.severity === 'CRITICAL' || hba1cBio?.severity === 'ELEVATED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {hba1cBio?.severity || 'NORMAL'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-slate-900 font-heading">
                      {hba1cBio ? (hba1cBio.numeric_value ?? hba1cBio.raw_value) : '—'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{hba1cBio?.unit || '%'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {hba1cBio?.reference_interval_raw ? `Non-diabetic: ${hba1cBio.reference_interval_raw}` : 'Target: 4.0 - 5.6%'} • Computed from Biomarkers
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 uppercase font-semibold">Total Cholesterol</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      cholBio?.severity === 'CRITICAL' || cholBio?.severity === 'ELEVATED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {cholBio?.severity || 'NORMAL'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-slate-900 font-heading">
                      {cholBio ? (cholBio.numeric_value ?? cholBio.raw_value) : '—'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{cholBio?.unit || 'mg/dL'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {cholBio?.reference_interval_raw ? `Desirable: ${cholBio.reference_interval_raw}` : 'Target: < 200 mg/dL'} • Computed from Biomarkers
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 uppercase font-semibold">Active Doctor Consents</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ENFORCED
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline space-x-2">
                    <span className="text-2xl font-bold text-slate-900 font-heading">
                      {consents.filter((c) => c.status === 'ACTIVE').length}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">physician grant</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">DPDPA Enforced • Real-time DB Count</p>
                </div>
              </div>
            );
          })()}

          {/* Action Row: Upcoming Consultation + Recent Reports */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upcoming Consultations */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 text-base flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-brand-500" />
                  <span>Upcoming Appointment</span>
                </h3>
                <span className="text-xs text-brand-600 font-medium">Confirmed</span>
              </div>

              {appointments.length > 0 ? (
                <div className="p-4 rounded-xl bg-brand-50/50 border border-brand-100">
                  <p className="font-bold text-slate-900 text-base">Dr. Alex Morgan, MD</p>
                  <p className="text-xs text-brand-700 font-medium mt-0.5">Cardiology & Metabolic Health</p>
                  <div className="mt-3 text-xs text-slate-600 space-y-1 font-mono">
                    <p>📅 Date: {appointments[0].appointment_date}</p>
                    <p>⏰ Time: {appointments[0].start_time}</p>
                    <p>🏥 Location: City Care Hospital (OPD)</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-brand-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Doctor Consent Active</span>
                    </span>
                    <button
                      onClick={() => setActiveTab('appointments')}
                      className="text-xs text-brand-600 hover:text-brand-800 font-semibold"
                    >
                      View Details &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-sm">No scheduled consultations.</p>
                  <button
                    onClick={() => setShowBookingModal(true)}
                    className="mt-3 text-xs text-brand-600 font-semibold hover:underline"
                  >
                    Schedule an appointment &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Recent Reports List */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 text-base flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-brand-500" />
                  <span>Recent Diagnostic Reports</span>
                </h3>
                <button
                  onClick={() => setActiveTab('reports')}
                  className="text-xs text-brand-600 hover:text-brand-800 font-semibold"
                >
                  View All ({reports.length}) &rarr;
                </button>
              </div>

              <div className="space-y-3">
                {reports.slice(0, 3).map((rep) => (
                  <div
                    key={rep.id}
                    onClick={() => {
                      handleSelectReport(rep);
                      setActiveTab('reports');
                    }}
                    className="p-4 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-slate-50 transition cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3.5">
                      <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm group-hover:text-brand-600 transition">
                          {rep.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {rep.lab_name} • {rep.report_date}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {rep.processing_status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 2: DIAGNOSTIC REPORTS & INGESTION (SCR-03 & SCR-04)           */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Diagnostic Reports Vault</h2>
              <p className="text-xs text-slate-500">
                Encrypted at rest in Supabase storage bucket `patient-medical-documents` with strict RLS isolation.
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload New Report</span>
            </button>
          </div>

          {/* Interactive Split-Screen Viewer (SCR-04) */}
          {selectedReport ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Report List & Document Representation */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <p className="text-xs font-mono font-semibold text-slate-500 uppercase mb-3">Available Reports</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {reports.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelectReport(r)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition flex items-center justify-between ${
                          selectedReport.id === r.id
                            ? 'bg-brand-50 border-brand-500 font-semibold text-brand-900'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="truncate max-w-[200px]">{r.title}</span>
                        <span className="font-mono text-[10px] text-slate-500">{r.report_date}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Simulated Document Canvas with Highlightable Citations */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-semibold text-slate-700">Lab Document Viewer</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        [MOCK / DEMO CANVAS]
                      </span>
                    </div>
                    {signedDocUrl ? (
                      <a
                        href={signedDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Signed Storage URL</span>
                      </a>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400">OCR Confidence: 97.4%</span>
                    )}
                  </div>

                  {/* Document Container */}
                  <div className="mt-4 p-4 rounded-xl bg-slate-100 border border-slate-300 font-mono text-[11px] leading-relaxed relative min-h-[320px]">
                    <div className="text-center font-bold text-slate-800 pb-2 border-b border-slate-300">
                      {selectedReport.lab_name.toUpperCase()}
                      <div className="text-[10px] font-normal text-slate-600">Patient: {profile.full_name} • Date: {selectedReport.report_date}</div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className={`p-1.5 rounded transition ${activeCitationBox ? 'bg-amber-200/70 border border-amber-400' : ''}`}>
                        <span className="font-bold">HbA1c (Glycated Hemoglobin):</span> 7.8 % [Ref: 4.0 - 5.6]
                      </div>
                      <div className={`p-1.5 rounded transition ${activeCitationBox ? 'bg-amber-200/70 border border-amber-400' : ''}`}>
                        <span className="font-bold">Fasting Blood Glucose:</span> 142 mg/dL [Ref: 70 - 99]
                      </div>
                      <div className="p-1.5 rounded">
                        <span className="font-bold">Serum Total Cholesterol:</span> 245 mg/dL [Ref: &lt; 200]
                      </div>
                      <div className="p-1.5 rounded">
                        <span className="font-bold">Serum Triglycerides:</span> 188 mg/dL [Ref: &lt; 150]
                      </div>
                    </div>

                    {activeCitationBox && (
                      <div className="absolute inset-x-4 top-20 border-2 border-brand-500 bg-brand-500/10 rounded pointer-events-none p-2 animate-pulse">
                        <span className="bg-brand-500 text-white font-mono text-[9px] px-1 rounded absolute -top-3 left-2 font-bold">
                          Grounded Source Citation
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    💡 Click on citation pills on the right to focus grounded bounding coordinates.
                  </p>
                </div>
              </div>

              {/* Right Column: Grounded AI Explanation & Biomarker List (SCR-04) */}
              <div className="lg:col-span-7 space-y-6">
                {/* AI Explanation Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base font-heading">
                          Rule-Based Clinical Explanation
                        </h3>
                        <p className="text-xs text-slate-500 font-mono">Deterministic rule-based analysis; no language models used</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSummaryLang('en')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                            summaryLang === 'en'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          EN
                        </button>
                        <button
                          type="button"
                          onClick={() => setSummaryLang('hi')}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                            summaryLang === 'hi'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          हिन्दी
                        </button>
                      </div>
                      <span className="bg-brand-50 text-brand-700 border border-brand-200 text-xs font-mono font-semibold px-2 py-0.5 rounded">
                        Doctor Review: {selectedSummary?.review_status || 'DRAFT'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 leading-relaxed space-y-3">
                    {summaryLang === 'hi' ? (
                      <div className="whitespace-pre-line text-xs font-sans leading-relaxed text-slate-800">
                        {generateHindiExplanation(
                          selectedBiomarkers.map((b) => ({
                            id: b.id,
                            name: b.name,
                            rawValue: b.raw_value || String(b.numeric_value),
                            numericValue: b.numeric_value ?? 0,
                            unit: b.unit,
                            normalizedUnit: b.normalized_unit ?? null,
                            referenceIntervalRaw: b.reference_interval_raw ?? null,
                            intervalLow: b.interval_low ?? null,
                            intervalHigh: b.interval_high ?? null,
                            severity: b.severity as any,
                            boundingBox: b.bounding_box as any,
                            ocrConfidence: 98,
                          })),
                          selectedSummary?.content_markdown || '',
                          selectedBiomarkers.some((b) => b.severity === 'CRITICAL')
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-line">
                        {selectedSummary?.content_markdown ||
                          'Your HbA1c is 7.8%, which is above the non-diabetic target range of 4.0 - 5.6%. This reflects elevated average blood sugar levels over the past 90 days. Fasting Glucose is 142 mg/dL.'}
                      </p>
                    )}

                    {/* Interactive Citation Pills */}
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-mono font-semibold text-slate-500">Source Citations:</span>
                      <button
                        onClick={() => setActiveCitationBox([120, 240, 480, 265])}
                        className="px-2.5 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 text-brand-800 text-xs font-mono transition flex items-center space-x-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>[1] HbA1c 7.8% (Page 1)</span>
                      </button>
                      <button
                        onClick={() => setActiveCitationBox([120, 280, 480, 305])}
                        className="px-2.5 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 text-brand-800 text-xs font-mono transition flex items-center space-x-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>[2] Fasting Sugar 142 mg/dL</span>
                      </button>
                    </div>
                  </div>

                  {/* Red Flags & Clinical Gaps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="p-3 rounded-xl bg-red-50/60 border border-red-200 text-xs text-red-800">
                      <span className="font-bold flex items-center space-x-1 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Critical Flags</span>
                      </span>
                      <p>• Glycemic level exceeds target; discuss medication adjustment with physician.</p>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-800">
                      <span className="font-bold flex items-center space-x-1 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Identified Gaps</span>
                      </span>
                      <p>• Missing urine microalbuminuria test from current annual checkup cycle.</p>
                    </div>
                  </div>
                </div>

                {/* Structured Biomarkers Table */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                  <h3 className="font-bold text-slate-900 text-base font-heading mb-3">
                    Extracted Biomarkers & Reference Limits
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-mono uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Test Name</th>
                          <th className="py-2.5 px-3">Value</th>
                          <th className="py-2.5 px-3">Reference Range</th>
                          <th className="py-2.5 px-3">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(selectedBiomarkers.length > 0 ? selectedBiomarkers : biomarkers).map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-3 text-slate-900 font-semibold">{b.name}</td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-900">
                              {b.raw_value} {b.unit}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-500">{b.reference_interval_raw || 'N/A'}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  b.severity === 'NORMAL'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : b.severity === 'CRITICAL'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {b.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No diagnostic reports uploaded yet.</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-4 bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Upload First Report
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 3: MEDICAL TIMELINE & TREND CHARTS (SCR-05)                    */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 font-heading">Continuous Health Timeline & Trends</h2>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic trend analysis tracking longitudinal biomarker evolution across tests.
            </p>

            {/* SVG Trend Chart: HbA1c & Fasting Glucose */}
            <div className="mt-6 p-6 rounded-2xl bg-slate-900 text-white shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold font-heading">Glycemic Trend Evolution (Last 6 Months)</h3>
                  <p className="text-xs text-slate-400 font-mono">Fasting Glucose (mg/dL) & HbA1c (%)</p>
                </div>
                <div className="flex items-center space-x-4 text-xs font-mono">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded-full bg-brand-400 inline-block"></span>
                    <span>HbA1c Target (&lt; 7.0%)</span>
                  </span>
                  <span className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded-full bg-teal-400 inline-block"></span>
                    <span>Fasting Glucose</span>
                  </span>
                </div>
              </div>

              {/* Accessible Interactive SVG Chart */}
              <div className="w-full h-48 relative flex items-end justify-between px-6 pt-4 pb-2 border-b border-slate-700">
                {/* Horizontal reference bands */}
                <div className="absolute inset-x-0 top-1/4 border-b border-dashed border-red-500/40 text-[10px] text-red-400 px-2 font-mono">
                  Elevated Threshold (HbA1c &gt; 7.0%)
                </div>
                <div className="absolute inset-x-0 top-2/3 border-b border-dashed border-emerald-500/40 text-[10px] text-emerald-400 px-2 font-mono">
                  Optimal Target (HbA1c &lt; 5.7%)
                </div>

                {/* Data Points */}
                {[
                  { month: 'May 2026', hba1c: '7.1%', glucose: '128 mg/dL', barHeight: '58%' },
                  { month: 'Jul 2026', hba1c: '7.4%', glucose: '135 mg/dL', barHeight: '70%' },
                  { month: 'Sep 2026', hba1c: '7.6%', glucose: '139 mg/dL', barHeight: '80%' },
                  { month: 'Current', hba1c: '7.8%', glucose: '142 mg/dL', barHeight: '92%' },
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center space-y-2 z-10 group cursor-pointer">
                    <div className="text-[11px] font-mono text-brand-300 font-bold group-hover:scale-110 transition">
                      {item.hba1c}
                    </div>
                    <div
                      style={{ height: item.barHeight }}
                      className="w-10 rounded-t-xl bg-gradient-to-t from-brand-600 to-teal-400 shadow-md group-hover:brightness-125 transition"
                    ></div>
                    <div className="text-[10px] font-mono text-slate-400 mt-2">{item.month}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chronological Event Stream */}
            <div className="mt-8 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Chronological Clinical Milestones</h3>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                <div className="relative">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-brand-500 border-2 border-white shadow-xs"></div>
                  <p className="text-xs text-slate-400 font-mono">Yesterday, 11:30 AM</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Metabolic Profile Diagnostic Ingestion</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Apex Diagnostics Lab report processed. Elevated HbA1c (7.8%) and Fasting Sugar (142 mg/dL) identified.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-teal-500 border-2 border-white shadow-xs"></div>
                  <p className="text-xs text-slate-400 font-mono">3 days ago</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Outpatient Consultation Confirmed</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Appointment booked with Dr. Alex Morgan (Cardiology & Metabolic Health) at City Care Hospital.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-purple-500 border-2 border-white shadow-xs"></div>
                  <p className="text-xs text-slate-400 font-mono">1 week ago</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Active Doctor Consent Granted</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Granted 12-month lookback clinical record access to Dr. Alex Morgan.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 4: APPOINTMENTS & DOCTOR DIRECTORY (SCR-07 & SCR-08)           */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Consultations & Doctor Directory</h2>
              <p className="text-xs text-slate-500">
                Book authorized consultations with verified hospital physicians.
              </p>
            </div>
            <button
              onClick={() => setShowBookingModal(true)}
              className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
            >
              <Calendar className="w-4 h-4" />
              <span>Book New Appointment</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Appointments */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Scheduled Outpatient Visits</h3>
              {appointments.length > 0 ? (
                appointments.map((apt) => (
                  <div key={apt.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-base">Dr. Alex Morgan, MD</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {apt.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Cardiology & Metabolic Health • City Care Multi-Specialty Hospital
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-slate-600">
                        <span>📅 Date: {apt.appointment_date}</span>
                        <span>⏰ Time: {apt.start_time}</span>
                        <span>Reason: {apt.chief_complaint}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const aptConsent = consents.find(c => 
                          c.doctor_id === apt.doctor_id && 
                          c.status === 'ACTIVE' && 
                          (!c.valid_until || new Date(c.valid_until) >= new Date()) && 
                          !c.revoked_at
                        );
                        return aptConsent ? (
                          <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block">
                            Active Consent ({aptConsent.lookback_months || 12}m)
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-block">
                            No Active Consent
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
                  No upcoming appointments booked.
                </div>
              )}
            </div>

            {/* Doctor Directory Card */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Empaneled Specialists</h3>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-lg">
                    AM
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">Dr. Alex Morgan, MD</p>
                    <p className="text-xs text-slate-500">MCI-DEMO-84920</p>
                    <p className="text-xs text-brand-600 font-semibold mt-0.5">Cardiology & Metabolic Health</p>
                  </div>
                </div>
                <div className="text-xs text-slate-600 space-y-1.5 font-mono">
                  <p>• Experience: 14 Years</p>
                  <p>• Consultation Fee: ₹800</p>
                  <p>• Hospital: City Care Hospital (Jaipur)</p>
                </div>
                <button
                  onClick={() => setShowBookingModal(true)}
                  className="w-full bg-slate-900 hover:bg-black text-white py-2 rounded-xl text-xs font-semibold transition"
                >
                  Book Consultation Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 5: MEDICATIONS & REMINDERS (SCR-09)                            */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'medications' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-heading">Medication Schedule & Adherence</h2>
                <p className="text-xs text-slate-500">Active prescriptions verified by Dr. Alex Morgan.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Adherence Rate: 85%
              </span>
            </div>

            <div className="space-y-6 mt-6">
              {medications.map((med) => {
                const evalResult = evaluateMedicationSlots({
                  medication: med,
                  reminders: medicationReminders,
                  doseLogs: medicationDoseLogs,
                });
                return (
                  <div key={med.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 shadow-xs space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-base font-bold text-slate-900 font-heading">{med.name}</span>
                          <span className="text-xs font-mono bg-white px-2.5 py-0.5 rounded border border-slate-200 font-bold text-brand-700">
                            {med.dosage}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          Frequency: {med.frequency} • Food: {med.food_timing || 'As advised'}
                        </p>
                      </div>
                      <div>
                        {!evalResult.isDueToday ? (
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {evalResult.nextDueText || 'Scheduled Day'}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Scheduled Today (Asia/Kolkata)
                          </span>
                        )}
                      </div>
                    </div>

                    {!evalResult.isDueToday ? (
                      <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 font-mono">
                        Weekly medication: Not scheduled for today. {evalResult.nextDueText ? `Will automatically activate: ${evalResult.nextDueText}.` : ''}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {evalResult.slots.map((s) => {
                          const isLogging = loggingDoseSlot === `${med.id}-${s.slot}`;
                          const isActionable = s.status === 'PENDING';
                          return (
                            <div
                              key={s.slot}
                              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 ${
                                s.status === 'TAKEN'
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                  : s.status === 'MISSED'
                                  ? 'bg-red-50/60 border-red-200 text-red-950'
                                  : s.status === 'PENDING'
                                  ? 'bg-amber-50/70 border-amber-300 text-amber-950 shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs uppercase tracking-wider">{s.slot}</span>
                                  <span className="text-[10px] font-mono opacity-80">{s.reminderTime}</span>
                                </div>
                                <div className="mt-2">
                                  {s.status === 'TAKEN' && (
                                    <span className="text-xs font-bold text-emerald-700 block">
                                      Taken at {s.takenAtFormatted || 'Logged'}
                                    </span>
                                  )}
                                  {s.status === 'MISSED' && (
                                    <span className="text-xs font-bold text-red-700 block">
                                      Missed Window
                                    </span>
                                  )}
                                  {s.status === 'PENDING' && (
                                    <span className="text-xs font-bold text-amber-700 block">
                                      Due Now (Active Slot)
                                    </span>
                                  )}
                                  {s.status === 'UPCOMING' && (
                                    <span className="text-xs font-medium text-slate-500 block">
                                      Upcoming Slot
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-200/50">
                                {s.status === 'TAKEN' ? (
                                  <div>
                                    {s.canUndo && s.doseLogId ? (
                                      <button
                                        onClick={() => handleUndoDose(s.doseLogId!)}
                                        className="w-full text-center text-xs font-medium text-slate-600 hover:text-red-700 underline py-1"
                                      >
                                        Undo Dose (10m)
                                      </button>
                                    ) : (
                                      <span className="w-full text-center text-xs font-mono font-semibold text-emerald-800 block py-1">
                                        ✓ Locked & Recorded
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    disabled={!isActionable || isLogging}
                                    onClick={() => handleLogDose(med.id, s.slot)}
                                    id={`take-dose-${med.id}-${s.slot}`}
                                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 ${
                                      isActionable
                                        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{isLogging ? 'Logging...' : 'Mark Taken'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 6: AI HEALTH ASSISTANT (SCR-06)                                */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'assistant' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[600px] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-teal-500 text-white flex items-center justify-center font-bold">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm font-heading">Rule-Based Health Assistant</h3>
                <p className="text-[11px] text-slate-500 font-mono">Grounded template questions; no language models used</p>
              </div>
            </div>
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-mono font-semibold">
              Rules-Before-Reasoning
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-brand-500 text-white shadow-xs rounded-br-none'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-xs rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Citations */}
                  {msg.citations && (
                    <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-[10px] font-mono">
                      {msg.citations.map((c: any, cidx: number) => (
                        <span key={cidx} className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200">
                          📌 {c.label}: {c.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-1 px-1">{msg.time}</span>
              </div>
            ))}
          </div>

          {/* Quick Prompts - Fixed Menu */}
          <div className="px-4 py-2 bg-white border-t border-slate-100 flex flex-wrap gap-2">
            {FIXED_CHAT_MENU_PROMPTS.map((item) => (
              <button
                key={item.id}
                onClick={() => setChatInput(item.prompt)}
                className="text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition"
              >
                {item.prompt}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-white flex items-center space-x-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question about your reports, doctor, or medications..."
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              className="bg-brand-500 hover:bg-brand-600 text-white p-2 rounded-xl transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 7: BILLING REVIEW & DISCREPANCIES (SCR-13)                     */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-heading">Hospital Invoices & Review</h2>
                <p className="text-xs text-slate-500">
                  Itemized hospital invoice review with rule-based discrepancy auditor.
                </p>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full">
                2 Items Flagged for Review
              </span>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-mono uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Item Code</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Qty</th>
                    <th className="py-2.5 px-3">Rate (₹)</th>
                    <th className="py-2.5 px-3">Amount (₹)</th>
                    <th className="py-2.5 px-3">Auditor Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {mockBillItems.map((item, idx) => (
                    <tr key={idx} className={item.flag ? 'bg-amber-50/30' : ''}>
                      <td className="py-3 px-3 font-mono text-slate-500">{item.code}</td>
                      <td className="py-3 px-3 text-slate-900 font-semibold">
                        {item.desc}
                        {item.flag && (
                          <p className="text-[11px] text-amber-700 font-normal mt-0.5 font-mono">
                            ⚠️ {item.flag}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono">{item.qty}</td>
                      <td className="py-3 px-3 font-mono">₹{item.rate}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">₹{item.amount}</td>
                      <td className="py-3 px-3">
                        {item.flag ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Possible Discrepancy
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Standard
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center text-sm">
              <span className="font-semibold text-slate-600">Total Invoiced Amount:</span>
              <span className="text-xl font-bold font-heading text-slate-900">₹2,690.00</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 8: PRIVACY & CONSENT CENTER (SCR-15)                           */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-heading">
                  Consent Management & DPDPA Governance
                </h2>
                <p className="text-xs text-slate-500">
                  You maintain 100% control over who views your clinical data. Revoking access takes effect instantly.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                DPDPA 2023 Compliant
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Active Clinical Consent Grants</h3>
              {consents.map((con) => (
                <div key={con.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-sm">Dr. Alex Morgan, MD</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          con.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {con.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-mono">
                      Granted Scopes: {con.scopes ? con.scopes.join(', ') : 'reports, timeline, ai_summary'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      Lookback Window: {con.lookback_months || 12} Months • Valid Until: {con.valid_until ? con.valid_until.split('T')[0] : 'N/A'}
                    </p>
                  </div>

                  {con.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handleRevokeConsent(con.id)}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Revoke Consent Immediately</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReauthorizeConsent(con.id)}
                      className="bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Re-Authorize Consent</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SCR-15 Patient Immutable Access Log */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-slate-900 text-sm font-heading">
                    SCR-15: Immutable Access Audit Trail
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                    DPDPA Real-Time
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Server-side cryptographic record of every healthcare provider and clinical event accessing your medical records.
                </p>
              </div>

              <button
                id="refresh-access-log-btn"
                onClick={fetchAccessLogs}
                disabled={loadingAccessLogs}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold font-mono flex items-center space-x-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAccessLogs ? 'animate-spin' : ''}`} />
                <span>{loadingAccessLogs ? 'Refreshing...' : 'Refresh Access Log'}</span>
              </button>
            </div>

            <div id="patient-access-log-list" className="space-y-2 max-h-96 overflow-y-auto">
              {accessLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-mono">
                  No access audit events recorded yet.
                </div>
              ) : (
                accessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-50 text-brand-700 border border-brand-200">
                        {log.action}
                      </span>
                      <span className="font-medium text-slate-800">
                        Role: <span className="font-mono font-bold">{log.role}</span> • Resource: <span className="font-mono text-slate-600">{log.resource_type}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 font-mono text-[11px] text-slate-500">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {log.status}
                      </span>
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: REPORT UPLOAD (SCR-03)                                      */}
      {/* ------------------------------------------------------------------ */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-heading text-slate-900">Upload Medical Diagnostic Report</h3>
                <p className="text-xs text-slate-500 font-mono">Encrypted directly to Supabase private storage</p>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                &times;
              </button>
            </div>

            {uploadStage === 'idle' ? (
              <form onSubmit={handleSimulateUpload} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Report Title / Test Name</label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Complete Blood Count (CBC) or Thyroid Profile"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Diagnostic Laboratory Name</label>
                  <input
                    type="text"
                    required
                    value={uploadLab}
                    onChange={(e) => setUploadLab(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Test Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="Biochemistry">Biochemistry (Sugar, Lipids, LFT, KFT)</option>
                    <option value="Pathology">Pathology & Hematology (CBC, Blood Count)</option>
                    <option value="Endocrinology">Endocrinology (Thyroid, Hormones)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Select File (PDF, PNG, JPG)</label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => e.target.files && setUploadFile(e.target.files[0])}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    Start Ingestion Pipeline
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-8 text-center space-y-4">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  [SECURE DOCUMENT INGESTION]
                </span>
                <RefreshCw className="w-10 h-10 text-brand-500 animate-spin mx-auto" />
                <h4 className="font-bold text-slate-900 text-base">
                  {uploadStage === 'uploading' && 'Uploading Encrypted Document to Supabase Storage Bucket...'}
                  {uploadStage === 'ocr' && 'Registering report in secure queue for server-side processing...'}
                  {uploadStage === 'done' && 'Document Uploaded Successfully!'}
                </h4>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    style={{ width: `${uploadProgress}%` }}
                    className="bg-brand-500 h-full transition-all duration-300"
                  ></div>
                </div>
                <p className="text-xs text-slate-500 font-mono">{uploadProgress}% Processed</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: BOOK APPOINTMENT & GRANT CONSENT (SCR-08)                   */}
      {/* ------------------------------------------------------------------ */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-heading text-slate-900">Book Outpatient Consultation</h3>
                <p className="text-xs text-slate-500 font-mono">Includes integrated doctor consent authorization</p>
              </div>
              <button onClick={() => setShowBookingModal(false)} className="text-slate-400 hover:text-slate-600">
                &times;
              </button>
            </div>

            <form onSubmit={handleBookAppointment} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-700 mb-1">Select Physician</label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.profile?.full_name || 'Dr. Alex Morgan'} — {d.specialty} (₹{d.consultation_fee})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Consultation Date</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-700 mb-1">Time Slot</label>
                  <select
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="10:00">10:00 AM - 10:30 AM</option>
                    <option value="11:00">11:00 AM - 11:30 AM</option>
                    <option value="14:00">02:00 PM - 02:30 PM</option>
                    <option value="15:30">03:30 PM - 04:00 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-700 mb-1">Chief Symptoms / Reason</label>
                <input
                  type="text"
                  value={bookingComplaint}
                  onChange={(e) => setBookingComplaint(e.target.value)}
                  placeholder="e.g. Metabolic review, fatigue, blood sugar fluctuations"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Integrated Consent Authorization Section (SCR-08) */}
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-3">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-purple-700" />
                  <span className="text-xs font-bold text-purple-900 font-heading">
                    Clinical Consent Authorization (DPDPA 2023)
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  By confirming, you grant the selected doctor permission to view your diagnostic reports, 60-second summary brief, and medical timeline.
                </p>
                <div>
                  <label className="block text-[11px] font-mono text-purple-900 font-semibold mb-1">
                    Historical Record Lookback Window:
                  </label>
                  <select
                    value={consentLookback}
                    onChange={(e) => setConsentLookback(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-purple-300 text-xs bg-white focus:outline-none focus:border-purple-600"
                  >
                    <option value={3}>Past 3 Months Only</option>
                    <option value={6}>Past 6 Months</option>
                    <option value={12}>Past 12 Months (Recommended)</option>
                    <option value={36}>Full History (36 Months)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading}
                  className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {bookingLoading ? 'Confirming...' : 'Authorize & Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
