import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Profile, Appointment, Biomarker, AISummary } from '@medi-connect/shared';
import { generateMock60SecondBrief, computeAge } from '@medi-connect/shared';
import {
  Stethoscope,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Edit3,
  FileText,
  User,
  Clock,
  Send,
  Pill,
  Shield,
  ShieldAlert,
  Activity,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Eye
} from 'lucide-react';

interface DoctorDashboardProps {
  profile: Profile;
  language: 'en' | 'hi';
}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = ({ profile }) => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('a0000000-0000-0000-0000-000000000001');
  const [patientProfile, setPatientProfile] = useState<Profile | null>(null);
  const [patientReports, setPatientReports] = useState<any[]>([]);
  const [patientBiomarkers, setPatientBiomarkers] = useState<Biomarker[]>([]);
  const [activeConsent, setActiveConsent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 60-Second Brief & Review State (SCR-11)
  const [doctorNotes, setDoctorNotes] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'DRAFT' | 'APPROVED' | 'EDITED' | 'REJECTED'>('DRAFT');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSavedMessage, setReviewSavedMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [verifyingBioId, setVerifyingBioId] = useState<string | null>(null);
  const [viewedReportData, setViewedReportData] = useState<any>(null);
  const [viewReportLoading, setViewReportLoading] = useState(false);

  // Prescription Form State
  const [rxMedName, setRxMedName] = useState('Metformin Hydrochloride');
  const [rxDosage, setRxDosage] = useState('500 mg');
  const [rxInstructions, setRxInstructions] = useState('Take 1 tablet twice daily with meals');
  const [rxSuccess, setRxSuccess] = useState(false);

  const loadDoctorData = async () => {
    try {
      setLoading(true);
      // 1. Fetch appointments for Doctor Alex
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*, patient:profiles!appointments_patient_id_fkey(*)')
        .order('appointment_date', { ascending: true });

      if (aptData) {
        setAppointments(aptData);
      }

      // 2. Fetch Selected Patient Profile (Aarav Sharma)
      const { data: patData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selectedPatientId)
        .single();

      if (patData) {
        setPatientProfile(patData as Profile);
      }

      // 3. Verify Active Consent Grant from Patient
      const { data: conData } = await supabase
        .from('patient_consents')
        .select('*')
        .eq('patient_id', selectedPatientId)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveConsent(conData);

      // 4. If consent is active and not expired/revoked, fetch patient reports and biomarkers
      const isConActive = conData && 
        conData.status === 'ACTIVE' && 
        !conData.revoked_at && 
        new Date(conData.valid_until) >= new Date();

      if (isConActive) {
        const { data: repData } = await supabase
          .from('medical_reports')
          .select('*, ai_summaries(*)')
          .eq('patient_id', selectedPatientId);

        if (repData) {
          setPatientReports(repData);
          if (repData[0]?.ai_summaries?.[0]) {
            setReviewStatus(repData[0].ai_summaries[0].review_status || 'DRAFT');
          }
        }

        const { data: bioData } = await supabase
          .from('biomarkers')
          .select('*')
          .eq('patient_id', selectedPatientId);

        if (bioData) {
          setPatientBiomarkers(bioData as Biomarker[]);
        }
      } else {
        setPatientReports([]);
        setPatientBiomarkers([]);
      }
    } catch (err) {
      console.error('Error loading doctor cockpit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctorData();
  }, [selectedPatientId]);

  // Per-Biomarker Verification (SECURITY DEFINER RPC)
  const handleVerifyBiomarker = async (biomarkerId: string) => {
    try {
      setVerifyingBioId(biomarkerId);
      setReviewError(null);
      const { data, error } = await supabase.rpc('verify_biomarker', {
        p_biomarker_id: biomarkerId,
      });

      if (error) {
        setReviewError(error.message);
        return;
      }

      setReviewSavedMessage('Biomarker clinically verified & cryptographically audited server-side.');
      await loadDoctorData();
    } catch (err: any) {
      setReviewError(err.message);
    } finally {
      setVerifyingBioId(null);
    }
  };

  // View Medical Report via Audited SECURITY DEFINER RPC
  const handleViewMedicalReport = async (reportId: string) => {
    try {
      setViewReportLoading(true);
      setReviewError(null);
      const { data, error } = await supabase.rpc('get_medical_report_for_view', {
        p_report_id: reportId,
      });

      if (error) {
        setReviewError(error.message);
        return;
      }

      setViewedReportData(data);
      setReviewSavedMessage(`Report "${data.title}" viewed securely. Server-side audit event logged to patient timeline.`);
    } catch (err: any) {
      setReviewError(err.message);
    } finally {
      setViewReportLoading(false);
    }
  };

  // Doctor Sign-Off Action (SCR-11: Hardened SECURITY DEFINER RPC - no client boolean)
  const handleDoctorSignOff = async (decision: 'APPROVED' | 'EDITED' | 'REJECTED') => {
    try {
      setReviewLoading(true);
      setReviewSavedMessage(null);
      setReviewError(null);

      const targetSummaryId = patientReports[0]?.ai_summaries?.[0]?.id || 'f2000000-0000-0000-0000-000000000001';

      // Call hardened SECURITY DEFINER database function (server strictly enforces verified red flags)
      const { data, error } = await supabase.rpc('approve_ai_summary', {
        p_summary_id: targetSummaryId,
        p_decision: decision,
        p_doctor_notes: doctorNotes || `Signed off by ${profile.full_name}`,
      });

      if (error) {
        setReviewError(error.message);
        return;
      }

      setReviewStatus(decision);
      setReviewSavedMessage(`Decision recorded: ${decision}. Cryptographic audit row signed server-side.`);
      await loadDoctorData();
    } catch (err: any) {
      setReviewError(err.message);
    } finally {
      setReviewLoading(false);
    }
  };

  // Issue prescription
  const handleIssuePrescription = (e: React.FormEvent) => {
    e.preventDefault();
    setRxSuccess(true);
    setTimeout(() => setRxSuccess(false), 3000);
  };

  const brief = generateMock60SecondBrief(patientProfile?.full_name || 'Aarav Sharma');

  return (
    <div className="space-y-6">
      {/* Doctor Header Banner */}
      <div className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div>
          <span className="bg-teal-500/20 text-teal-300 border border-teal-400/30 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wide uppercase">
            Physician Clinical Cockpit
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading mt-3">
            Consultation Desk — {profile.full_name}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 font-mono">
            License #MCI-DEMO-84920 • City Care Multi-Specialty Hospital (OPD)
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-center">
            <span className="text-xs text-slate-400 font-mono">Scheduled Today</span>
            <p className="text-xl font-bold text-white font-heading">14 Patients</p>
          </div>
          <div className="bg-red-500/20 px-4 py-2 rounded-xl border border-red-500/30 text-center">
            <span className="text-xs text-red-300 font-mono">Critical Flags</span>
            <p className="text-xl font-bold text-red-400 font-heading">2 Pending</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Consented Patient Queue */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm font-heading mb-3 flex items-center justify-between">
              <span>Today's Outpatient Queue</span>
              <span className="text-xs font-mono text-slate-400">10:00 AM - 01:00 PM</span>
            </h3>

            <div className="space-y-2">
              {[
                { id: 'a0000000-0000-0000-0000-000000000001', name: 'Aarav Sharma (DEMO)', time: '10:00 AM', reason: 'Metabolic & Glycemic Review', consent: selectedPatientId === 'a0000000-0000-0000-0000-000000000001' ? !!activeConsent : true },
                { id: 'a0000000-0000-0000-0000-000000000002', name: 'Sunita Verma (DEMO)', time: '10:30 AM', reason: 'Hypertension Follow-up', consent: false },
                { id: '3', name: 'Rajesh Gupta', time: '11:00 AM', reason: 'Lipid Profile Consultation', consent: true },
              ].map((pt) => (
                <button
                  key={pt.id}
                  onClick={() => setSelectedPatientId(pt.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between ${
                    selectedPatientId === pt.id
                      ? 'bg-brand-50 border-brand-500 text-brand-900 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <p className="font-bold text-xs">{pt.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{pt.reason}</p>
                    <span className="text-[10px] font-mono text-brand-700 font-semibold">{pt.time}</span>
                  </div>
                  <div>
                    {pt.consent ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Consent Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-700 border border-red-200">
                        No Consent
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Active Consent Shield Card */}
          {(() => {
            const isConActive = Boolean(
              activeConsent &&
              activeConsent.status === 'ACTIVE' &&
              !activeConsent.revoked_at &&
              new Date(activeConsent.valid_until) >= new Date()
            );
            const hasAiScope = Boolean(activeConsent?.scopes?.includes('ai_summary'));

            if (isConActive) {
              return (
                <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-200 shadow-xs">
                  <div className="flex items-center space-x-2 text-purple-900 font-bold text-xs">
                    <Shield className="w-4 h-4 text-purple-700" />
                    <span>DPDPA Consent Enforced via RLS</span>
                  </div>
                  <p className="text-xs text-purple-800 mt-2 leading-relaxed">
                    Patient {patientProfile?.full_name || 'Aarav Sharma'} has granted active clinical read privileges with a **{activeConsent.lookback_months || 12}-month lookback window**.
                  </p>
                  <p className="text-[11px] font-mono text-purple-700 mt-2">
                    Valid Scopes: {activeConsent.scopes?.join(', ') || 'none'}
                  </p>
                  {!hasAiScope && (
                    <div className="mt-2 text-xs font-semibold text-amber-800 bg-amber-100 p-2 rounded-lg border border-amber-300">
                      ⚠️ Missing 'ai_summary' scope! AI Brief approval is locked.
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div className="bg-red-50/70 p-5 rounded-2xl border border-red-200 shadow-xs">
                <div className="flex items-center space-x-2 text-red-900 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-red-700" />
                  <span>Consent Inactive / {activeConsent?.status || 'REVOKED'}</span>
                </div>
                <p className="text-xs text-red-800 mt-2 leading-relaxed">
                  Zero clinical access granted. All electronic health records and AI briefs are locked under RLS.
                </p>
                {activeConsent && (
                  <p className="text-[11px] font-mono text-red-600 mt-2">
                    Status: {activeConsent.status} {activeConsent.revoked_at ? `(Revoked: ${new Date(activeConsent.revoked_at).toLocaleDateString()})` : ''}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Right Column: 60-Second Patient Brief View (SCR-11) */}
        {(() => {
          if (loading) {
            return (
              <div className="lg:col-span-8 flex items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              </div>
            );
          }

          const isConActive = Boolean(
            activeConsent &&
            activeConsent.status === 'ACTIVE' &&
            !activeConsent.revoked_at &&
            new Date(activeConsent.valid_until) >= new Date()
          );

          if (!isConActive) {
            return (
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white p-12 rounded-2xl border border-red-200 shadow-xs text-center space-y-4">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-xl font-heading">
                    No Active Patient Consent
                  </h3>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    Access to patient clinical timeline, diagnostic reports, and AI consultation brief is denied under DPDPA 2023 regulations. The patient has revoked or not authorized clinical data access for your provider ID.
                  </p>
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-50 text-red-700 border border-red-200">
                    <span>RLS ACCESS RESTRICTED (0 ROWS RETURNED)</span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="lg:col-span-8 space-y-6">
              {/* Brief Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-teal-500 animate-pulse"></span>
                    <h3 className="font-bold text-slate-900 text-lg font-heading flex items-center space-x-2">
                      <span>60-Second Patient Brief</span>
                      <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono font-normal">
                        [MOCK / DEMO BRIEF]
                      </span>
                    </h3>
                    <span className="bg-brand-50 text-brand-700 font-mono text-xs px-2 py-0.5 rounded border border-brand-200 font-semibold">
                      SCR-11 View
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Patient: <span className="font-semibold text-slate-800">{patientProfile?.full_name || 'Aarav Sharma'}</span> (Age: {computeAge(patientProfile?.date_of_birth) ?? 44}, Male)
                  </p>
                </div>

              {/* Triage Priority Badge */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-slate-500">Triage Level:</span>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>MODERATE PRIORITY</span>
                </span>
              </div>
            </div>

            {/* Synthesized Findings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-brand-600" />
                  <span>Critical Biomarkers & Abnormalities</span>
                </span>
                <div className="space-y-1 font-mono text-slate-700 pt-1">
                  <p>• HbA1c: <span className="font-bold text-red-600">7.8%</span> (Target &lt; 7.0%)</p>
                  <p>• Fasting Glucose: <span className="font-bold text-red-600">142 mg/dL</span> (Normal &lt; 100)</p>
                  <p>• Total Cholesterol: <span className="font-bold text-amber-600">245 mg/dL</span> (Borderline High)</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-teal-600" />
                  <span>Longitudinal Trend & Gaps</span>
                </span>
                <div className="space-y-1 text-slate-700 pt-1">
                  <p>• <strong>Trend:</strong> Gradual rise in HbA1c (+0.4% over 90 days).</p>
                  <p>• <strong>Gap:</strong> Missing Urine Microalbuminuria test from annual checkup.</p>
                  <p>• <strong>Adherence:</strong> Metformin adherence self-logged at 85%.</p>
                </div>
              </div>
            </div>

            {/* Markdown Summary Content */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed space-y-2">
              <p className="text-teal-300 font-bold">[MOCK AI SUMMARY CO-PILOT]:</p>
              <p>
                "Patient presents with suboptimally controlled Type 2 Diabetes Mellitus with secondary hypercholesterolemia. Fasting plasma glucose has plateaued around 140 mg/dL. Renal indices (Serum Creatinine 0.9 mg/dL) remain normal. Recommend assessing dietary adherence and considering addition of SGLT2 inhibitor or lifestyle intensification."
              </p>
            </div>

            {/* Doctor Sign-Off Panel (SCR-11 Decision) */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm font-heading">
                  Physician Review & Clinical Sign-Off
                </h4>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  Current Status: {reviewStatus}
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-600 mb-1">
                  Physician Clinical Notes (Recorded to Audit Trail & Patient Chart):
                </label>
                <textarea
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="e.g. Reviewed 60-second summary and confirmed lab results. Discussed Metformin titration..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-brand-500 font-sans"
                />
              </div>

              {(() => {
                // Spec Rule: Approval blocks on CRITICAL red flags only (not ELEVATED)
                const redFlagBiomarkers = patientBiomarkers.filter(
                  (b) => b.severity === 'CRITICAL'
                );
                const unverifiedCount = redFlagBiomarkers.filter((b) => !b.verified_at).length;
                const allVerified = redFlagBiomarkers.length > 0 && unverifiedCount === 0;

                return (
                  <div className="bg-amber-50/90 border border-amber-200 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span className="font-bold text-amber-900 text-xs font-heading">
                          Per-Biomarker Clinical Verification ({unverifiedCount} Unverified)
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          allVerified
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {allVerified ? 'ALL VERIFIED — APPROVAL UNLOCKED' : 'APPROVAL REFUSED BY SERVER'}
                      </span>
                    </div>

                    <p className="text-amber-800 font-mono text-[11px] leading-relaxed">
                      Spec Rule: Server rejects approval while critical biomarkers remain unverified. Each biomarker must be certified by the attending physician via SECURITY DEFINER RPC.
                    </p>

                    <div className="space-y-2 pt-1">
                      {redFlagBiomarkers.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-amber-200 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{b.name}</span>: <span className="font-mono text-red-600 font-bold">{b.raw_value || b.numeric_value} {b.unit}</span>
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-700">
                              {b.severity}
                            </span>
                          </div>

                          <div>
                            {b.verified_at ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-700 font-mono text-[11px] font-semibold bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Verified by Doctor</span>
                              </span>
                            ) : (
                              <button
                                id={`verify-biomarker-${b.id}`}
                                onClick={() => handleVerifyBiomarker(b.id)}
                                disabled={verifyingBioId === b.id}
                                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs font-semibold font-mono transition disabled:opacity-50"
                              >
                                {verifyingBioId === b.id ? 'Verifying...' : 'Verify Biomarker'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {reviewError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs font-mono flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{reviewError}</span>
                </div>
              )}

              {reviewSavedMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{reviewSavedMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              {(() => {
                const redFlagBiomarkers = patientBiomarkers.filter(
                  (b) => b.severity === 'CRITICAL' || b.severity === 'ELEVATED'
                );
                const hasUnverified = redFlagBiomarkers.some((b) => !b.verified_at);

                return (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      id="approve-summary-btn"
                      onClick={() => handleDoctorSignOff('APPROVED')}
                      disabled={reviewLoading || hasUnverified}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title={hasUnverified ? 'Verify all red-flag biomarkers above to enable approval' : 'Approve Summary'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{hasUnverified ? 'Approve Summary (Locked: Verify Red Flags)' : 'Approve Summary'}</span>
                    </button>

                    <button
                      id="edit-summary-btn"
                      onClick={() => handleDoctorSignOff('EDITED')}
                      disabled={reviewLoading}
                      className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition disabled:opacity-50"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Edit & Append Notes</span>
                    </button>

                    <button
                      id="reject-summary-btn"
                      onClick={() => handleDoctorSignOff('REJECTED')}
                      disabled={reviewLoading}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject AI Synthesis</span>
                    </button>

                    {patientReports[0] && (
                      <button
                        id="doctor-view-report-btn"
                        onClick={() => handleViewMedicalReport(patientReports[0].id)}
                        disabled={viewReportLoading}
                        className="bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition ml-auto"
                      >
                        <Eye className="w-4 h-4 text-brand-300" />
                        <span>{viewReportLoading ? 'Retrieving Audited Report...' : 'View Full Lab Report (Audited)'}</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Audited View Report Modal / Details Card */}
              {viewedReportData && (
                <div id="doctor-viewed-report-card" className="p-4 rounded-xl bg-slate-950 text-slate-100 border border-brand-500/30 text-xs space-y-2 mt-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-brand-400 font-mono">
                      [RETRIEVED VIA get_medical_report_for_view RPC]
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono">
                      ✓ Server-Side Audit Logged: REPORT_VIEW
                    </span>
                  </div>
                  <p><strong>Title:</strong> {viewedReportData.title}</p>
                  <p><strong>Lab:</strong> {viewedReportData.lab_name} • <strong>Category:</strong> {viewedReportData.category}</p>
                  <p><strong>Report Date:</strong> {viewedReportData.report_date} • <strong>OCR Confidence:</strong> {viewedReportData.ocr_confidence}%</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Prescription Issuance Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="font-bold text-slate-900 text-sm font-heading flex items-center space-x-2">
              <Pill className="w-4 h-4 text-brand-600" />
              <span>Issue Digital Prescription</span>
            </h4>

            <form onSubmit={handleIssuePrescription} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-600 mb-1">Drug Name</label>
                <input
                  type="text"
                  value={rxMedName}
                  onChange={(e) => setRxMedName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-600 mb-1">Dosage</label>
                <input
                  type="text"
                  value={rxDosage}
                  onChange={(e) => setRxDosage(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-600 mb-1">Instructions</label>
                <input
                  type="text"
                  value={rxInstructions}
                  onChange={(e) => setRxInstructions(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  {rxSuccess ? '✓ Prescription Issued!' : 'Sign & Issue Prescription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    })()}
      </div>
    </div>
  );
};
