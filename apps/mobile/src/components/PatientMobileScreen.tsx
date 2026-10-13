import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile, MedicalReport, Biomarker, AISummary } from '@medi-connect/shared';
import { simulateReportExtraction, generateMockAssistantReply, computeAge, evaluateMedicationSlots, getKolkataDateTime } from '@medi-connect/shared';

interface PatientMobileScreenProps {
  profile: Profile;
  onSignOut: () => void;
}

export const PatientMobileScreen: React.FC<PatientMobileScreenProps> = ({ profile, onSignOut }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'timeline' | 'meds' | 'chat' | 'consent'>('overview');
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<MedicalReport | null>(null);
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<Biomarker[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<AISummary | null>(null);
  const [consents, setConsents] = useState<any[]>([]);
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [medicationReminders, setMedicationReminders] = useState<any[]>([]);
  const [medicationDoseLogs, setMedicationDoseLogs] = useState<any[]>([]);
  const [loggingSlot, setLoggingSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string }>>([
    {
      sender: 'assistant',
      text: `Hello ${profile.full_name}! I am your clinical health assistant.\n\n⚠️ AI assists, doctor decides. In an emergency, call 112 / 108.`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch reports
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

      // Fetch patient biomarkers (SCR-02)
      const { data: bioData } = await supabase
        .from('biomarkers')
        .select('*')
        .eq('patient_id', profile.id);

      if (bioData) setBiomarkers(bioData as Biomarker[]);

      // Fetch consents with doctor relations
      const { data: conData } = await supabase
        .from('patient_consents')
        .select('*, doctor:doctors(*, profile:profiles(*))')
        .eq('patient_id', profile.id)
        .order('granted_at', { ascending: false });

      if (conData) setConsents(conData);

      // Fetch appointments with doctor relations
      const { data: appData } = await supabase
        .from('appointments')
        .select('*, doctor:doctors(*, profile:profiles(*))')
        .eq('patient_id', profile.id)
        .order('appointment_date', { ascending: true });

      if (appData) setAppointments(appData);

      // Fetch medications
      const { data: medsData } = await supabase
        .from('medications')
        .select('*')
        .eq('patient_id', profile.id)
        .order('name');

      if (medsData) setMedications(medsData);

      // Fetch reminders
      const { data: remData } = await supabase
        .from('medication_reminders')
        .select('*')
        .eq('patient_id', profile.id);

      if (remData) setMedicationReminders(remData);

      // Fetch today's dose logs in Asia/Kolkata
      const { dateString } = getKolkataDateTime();
      const { data: doseLogsData } = await supabase
        .from('medication_dose_logs')
        .select('*')
        .eq('patient_id', profile.id)
        .eq('scheduled_date', dateString);

      if (doseLogsData) setMedicationDoseLogs(doseLogsData);
    } catch (e) {
      console.warn('Error fetching mobile patient data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile.id]);

  const handleSelectReport = async (rep: MedicalReport) => {
    setSelectedReport(rep);
    const { data: bioData } = await supabase
      .from('biomarkers')
      .select('*')
      .eq('report_id', rep.id);
    if (bioData) setSelectedBiomarkers(bioData as Biomarker[]);

    const { data: sumData } = await supabase
      .from('ai_summaries')
      .select('*')
      .eq('report_id', rep.id)
      .maybeSingle();
    if (sumData) setSelectedSummary(sumData as AISummary);
  };

  const handleSimulateUpload = async () => {
    try {
      Alert.alert('Camera Scan Ingestion', 'Simulating OCR extraction from camera document...');
      const reportId = crypto.randomUUID();
      const fakePath = `${profile.id}/${Date.now()}_camera_scan.pdf`;

      await supabase.from('medical_reports').insert({
        id: reportId,
        patient_id: profile.id,
        title: 'Thyroid Function Panel (Camera Scan)',
        lab_name: 'City Pathology Diagnostic Center',
        report_date: new Date().toISOString().split('T')[0],
        category: 'Endocrinology',
        file_path: fakePath,
        file_type: 'application/pdf',
        file_size_bytes: 840000,
        processing_status: 'COMPLETED',
        ocr_confidence: 96.8,
      });

      const extraction = simulateReportExtraction(reportId, profile.id, 'Endocrinology', 'Thyroid');
      for (const b of extraction.biomarkers) {
        await supabase.from('biomarkers').insert({
          report_id: reportId,
          patient_id: profile.id,
          name: b.name,
          raw_value: b.rawValue,
          numeric_value: b.numericValue,
          unit: b.unit,
          normalized_unit: b.normalizedUnit,
          reference_interval_raw: b.referenceIntervalRaw,
          interval_low: b.intervalLow,
          interval_high: b.intervalHigh,
          severity: b.severity,
          bounding_box: b.boundingBox,
        });
      }

      await supabase.from('ai_summaries').insert({
        report_id: reportId,
        patient_id: profile.id,
        version: 1,
        summary_type: 'PATIENT_PLAIN_LANGUAGE',
        content_markdown: extraction.summary.contentMarkdown,
        citations_json: extraction.summary.citations,
        red_flags_json: extraction.summary.redFlags,
        gaps_json: extraction.summary.gaps,
        review_status: 'DRAFT',
      });

      Alert.alert('Scan Complete', 'Thyroid Function Panel processed and added to your records.');
      await loadData();
      setActiveTab('reports');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRevokeConsent = async (consentId: string) => {
    try {
      await supabase
        .from('patient_consents')
        .update({ status: 'REVOKED', revoked_at: new Date().toISOString() })
        .eq('id', consentId);

      Alert.alert('Consent Revoked', 'Doctor access terminated immediately via Supabase RLS.');
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const txt = chatInput.trim();
    setChatMessages((prev) => [...prev, { sender: 'user', text: txt }]);
    setChatInput('');

    setTimeout(() => {
      const reply = generateMockAssistantReply(txt, {
        patientName: profile.full_name,
        latestHbA1c: '7.8%',
        latestGlucose: '142 mg/dL',
      });
      setChatMessages((prev) => [...prev, { sender: 'assistant', text: reply.text }]);
    }, 400);
  };

  const handleReauthorizeConsent = async (consentId: string) => {
    try {
      await supabase
        .from('patient_consents')
        .update({
          status: 'ACTIVE',
          revoked_at: null,
          scopes: ['reports', 'timeline', 'ai_summary', 'prescriptions'],
          valid_from: new Date().toISOString(),
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', consentId);

      Alert.alert('Consent Re-Authorized', 'Doctor access restored with full clinical scopes.');
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleLogDose = async (medicationId: string, slot: string) => {
    try {
      setLoggingSlot(`${medicationId}-${slot}`);
      const { dateString } = getKolkataDateTime();
      const { error } = await supabase.rpc('log_dose', {
        p_medication_id: medicationId,
        p_slot: slot,
        p_scheduled_date: dateString,
      });

      if (error) {
        Alert.alert('Dose Logging Error', error.message);
        return;
      }
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoggingSlot(null);
    }
  };

  const handleUndoDose = async (doseLogId: string) => {
    try {
      const { error } = await supabase.rpc('undo_dose', {
        p_dose_log_id: doseLogId,
      });

      if (error) {
        Alert.alert('Undo Error', error.message);
        return;
      }
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Clinical Safety Banner */}
      <View style={styles.safetyBanner}>
        <Text style={styles.safetyText}>
          AI ASSISTS, DOCTOR DECIDES • Certified Clinical Prototype
        </Text>
      </View>

      {/* Profile Bar */}
      <View style={styles.profileHeader}>
        <View>
          <Text style={styles.greeting}>Welcome, {profile.full_name}</Text>
          <Text style={styles.subtext}>
            Age: {computeAge(profile.date_of_birth) ?? 44} • ABHA: {profile.abha_id_mock || 'aarav@abdm-demo'}
          </Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Navigation Bar */}
      <View style={styles.navBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'reports', label: `Reports (${reports.length})` },
            { id: 'timeline', label: 'Timeline' },
            { id: 'meds', label: 'Medications' },
            { id: 'chat', label: 'AI Chat' },
            { id: 'consent', label: 'Privacy' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.navTab, activeTab === tab.id && styles.navTabActive]}
              onPress={() => setActiveTab(tab.id as any)}
            >
              <Text
                style={[styles.navTabText, activeTab === tab.id && styles.navTabTextActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ------------------------------------------------------------- */}
      {/* OVERVIEW TAB                                                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <ScrollView style={styles.content}>
          {(() => {
            const upcomingAppt = appointments.find(
              (a) => new Date(a.appointment_date + 'T' + (a.start_time || '23:59:59')) >= new Date()
            );

            if (!upcomingAppt) {
              return (
                <View style={[styles.cardHighlight, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }]}>
                  <Text style={[styles.cardHighlightTitle, { color: '#64748B' }]}>Upcoming Doctor Visit</Text>
                  <Text style={[styles.cardHighlightSub, { color: '#94A3B8', marginTop: 4 }]}>
                    No upcoming consultations scheduled
                  </Text>
                </View>
              );
            }

            const activeConsentForAppt = consents.find(
              (c) =>
                c.doctor_id === upcomingAppt.doctor_id &&
                c.status === 'ACTIVE' &&
                (!c.valid_until || new Date(c.valid_until) >= new Date()) &&
                !c.revoked_at
            );

            const docName = upcomingAppt.doctor?.profile?.full_name || 'Dr. Alex Morgan, MD';
            const docSpec = upcomingAppt.doctor?.specialty || 'Cardiology & Metabolic Health';
            const apptDateFormatted = new Date(
              upcomingAppt.appointment_date + 'T' + (upcomingAppt.start_time || '10:00:00')
            ).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
            const apptTime = upcomingAppt.start_time ? upcomingAppt.start_time.slice(0, 5) : '10:00';

            return (
              <View style={styles.cardHighlight}>
                <Text style={styles.cardHighlightTitle}>Upcoming Doctor Visit</Text>
                <Text style={styles.cardHighlightSub}>
                  {docName} • {docSpec}
                </Text>
                <Text style={styles.cardHighlightDetails}>
                  📅 {apptDateFormatted}, {apptTime} • City Care Hospital
                </Text>
                {activeConsentForAppt ? (
                  <Text style={styles.cardHighlightBadge}>
                    Active Consent ({activeConsentForAppt.lookback_months || 12}m Lookback)
                  </Text>
                ) : (
                  <Text style={[styles.cardHighlightBadge, { backgroundColor: '#FEF3C7', color: '#B45309' }]}>
                    No Active Consent
                  </Text>
                )}
              </View>
            );
          })()}

          <Text style={styles.sectionTitle}>Key Diagnostic Biomarkers (SCR-02: DB Computed)</Text>
          {(() => {
            const glucoseBio = biomarkers.find(b => b.name?.toLowerCase().includes('glucose'));
            const hba1cBio = biomarkers.find(b => b.name?.toLowerCase().includes('hba1c') || b.name?.toLowerCase().includes('glycated'));
            const cholBio = biomarkers.find(b => b.name?.toLowerCase().includes('cholesterol'));

            return (
              <View style={styles.metricGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Fasting Glucose</Text>
                  <Text style={styles.metricValElevated}>
                    {glucoseBio ? `${glucoseBio.numeric_value ?? glucoseBio.raw_value} ${glucoseBio.unit || 'mg/dL'}` : '—'}
                  </Text>
                  <Text style={styles.metricRange}>
                    {glucoseBio?.reference_interval_raw ? `Target: ${glucoseBio.reference_interval_raw}` : 'Target: 70 - 99'}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>HbA1c (Glycated)</Text>
                  <Text style={styles.metricValElevated}>
                    {hba1cBio ? `${hba1cBio.numeric_value ?? hba1cBio.raw_value} ${hba1cBio.unit || '%'}` : '—'}
                  </Text>
                  <Text style={styles.metricRange}>
                    {hba1cBio?.reference_interval_raw ? `Target: ${hba1cBio.reference_interval_raw}` : 'Target: < 5.7 %'}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Total Cholesterol</Text>
                  <Text style={styles.metricValElevated}>
                    {cholBio ? `${cholBio.numeric_value ?? cholBio.raw_value} ${cholBio.unit || 'mg/dL'}` : '—'}
                  </Text>
                  <Text style={styles.metricRange}>
                    {cholBio?.reference_interval_raw ? `Desirable: ${cholBio.reference_interval_raw}` : 'Desirable: < 200'}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Active Consents</Text>
                  <Text style={styles.metricValNormal}>
                    {consents.filter((c) => c.status === 'ACTIVE').length} Active
                  </Text>
                  <Text style={styles.metricRange}>DPDPA Enforced</Text>
                </View>
              </View>
            );
          })()}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSimulateUpload}>
            <Text style={styles.primaryBtnText}>📷 Scan Report with Camera [MOCK SIMULATION]</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- */}
      {/* REPORTS TAB                                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'reports' && (
        <ScrollView style={styles.content}>
          <View style={styles.actionHeader}>
            <Text style={styles.sectionTitle}>Diagnostic Reports Vault</Text>
            <TouchableOpacity style={styles.smallBtn} onPress={handleSimulateUpload}>
              <Text style={styles.smallBtnText}>+ Scan Report</Text>
            </TouchableOpacity>
          </View>

          {reports.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.reportItem, selectedReport?.id === r.id && styles.reportItemActive]}
              onPress={() => handleSelectReport(r)}
            >
              <View>
                <Text style={styles.reportTitle}>{r.title}</Text>
                <Text style={styles.reportSub}>
                  {r.lab_name} • {r.report_date}
                </Text>
              </View>
              <Text style={styles.reportStatus}>{r.processing_status}</Text>
            </TouchableOpacity>
          ))}

          {selectedReport && (
            <View style={styles.detailCard}>
              <Text style={styles.detailHeading}>[MOCK AI] Plain-Language Explanation</Text>
              <Text style={styles.detailText}>
                {selectedSummary?.content_markdown ||
                  'Your HbA1c is 7.8%, which is above the standard target range of 4.0 - 5.6%. This indicates elevated average blood sugar over the last 90 days. Fasting Blood Glucose is 142 mg/dL.'}
              </Text>

              <Text style={[styles.detailHeading, { marginTop: 16 }]}>Extracted Biomarkers</Text>
              {selectedBiomarkers.map((b) => (
                <View key={b.id} style={styles.biomarkerRow}>
                  <Text style={styles.bioName}>{b.name}</Text>
                  <Text style={styles.bioVal}>
                    {b.raw_value} {b.unit}
                  </Text>
                  <Text
                    style={[
                      styles.bioSeverity,
                      b.severity === 'NORMAL' ? styles.bioNormal : styles.bioElevated,
                    ]}
                  >
                    {b.severity}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TIMELINE TAB                                                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'timeline' && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Longitudinal Health Timeline</Text>
          <View style={styles.timelineItem}>
            <Text style={styles.timelineDate}>Yesterday</Text>
            <Text style={styles.timelineTitle}>Metabolic Panel Processed</Text>
            <Text style={styles.timelineDesc}>HbA1c elevated at 7.8%; Fasting Glucose at 142 mg/dL.</Text>
          </View>
          <View style={styles.timelineItem}>
            <Text style={styles.timelineDate}>3 Days Ago</Text>
            <Text style={styles.timelineTitle}>Consultation Confirmed</Text>
            <Text style={styles.timelineDesc}>Dr. Alex Morgan at City Care Hospital OPD.</Text>
          </View>
          <View style={styles.timelineItem}>
            <Text style={styles.timelineDate}>1 Week Ago</Text>
            <Text style={styles.timelineTitle}>Doctor Consent Granted</Text>
            <Text style={styles.timelineDesc}>12-month lookback clinical record access authorized.</Text>
          </View>
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MEDICATIONS TAB                                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'meds' && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Daily Time-Slot Medication Schedule</Text>
          {medications.map((m) => {
            const evalResult = evaluateMedicationSlots({
              medication: m,
              reminders: medicationReminders,
              doseLogs: medicationDoseLogs,
            });

            return (
              <View key={m.id} style={styles.medCardContainer}>
                <View style={styles.medCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.name}</Text>
                    <Text style={styles.medDosage}>{m.dosage} • {m.frequency}</Text>
                  </View>
                  {!evalResult.isDueToday ? (
                    <Text style={styles.medNextDueBadge}>{evalResult.nextDueText || 'Scheduled Day'}</Text>
                  ) : (
                    <Text style={styles.medTodayBadge}>Due Today (IST)</Text>
                  )}
                </View>

                {!evalResult.isDueToday ? (
                  <View style={styles.medInactiveNotice}>
                    <Text style={styles.medInactiveText}>
                      Weekly medication: Not scheduled today. {evalResult.nextDueText ? `Will activate: ${evalResult.nextDueText}.` : ''}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.slotsGrid}>
                    {evalResult.slots.map((s) => {
                      const isLogging = loggingSlot === `${m.id}-${s.slot}`;
                      const isActionable = s.status === 'PENDING';

                      return (
                        <View
                          key={s.slot}
                          style={[
                            styles.slotItem,
                            s.status === 'TAKEN' && styles.slotItemTaken,
                            s.status === 'MISSED' && styles.slotItemMissed,
                            s.status === 'PENDING' && styles.slotItemPending,
                          ]}
                        >
                          <View style={styles.slotHeader}>
                            <Text style={styles.slotTitle}>{s.slot.toUpperCase()}</Text>
                            <Text style={styles.slotTime}>{s.reminderTime}</Text>
                          </View>

                          <View style={styles.slotStatusRow}>
                            {s.status === 'TAKEN' && (
                              <Text style={styles.slotTakenText}>✓ Taken at {s.takenAtFormatted || 'Logged'}</Text>
                            )}
                            {s.status === 'MISSED' && (
                              <Text style={styles.slotMissedText}>Missed Window</Text>
                            )}
                            {s.status === 'PENDING' && (
                              <Text style={styles.slotPendingText}>Pending Dose</Text>
                            )}
                            {s.status === 'UPCOMING' && (
                              <Text style={styles.slotUpcomingText}>Upcoming Slot</Text>
                            )}
                          </View>

                          <View style={styles.slotActionRow}>
                            {s.status === 'TAKEN' ? (
                              s.canUndo && s.doseLogId ? (
                                <TouchableOpacity onPress={() => handleUndoDose(s.doseLogId!)}>
                                  <Text style={styles.undoText}>Undo (10m)</Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={styles.lockedText}>Locked</Text>
                              )
                            ) : (
                              <TouchableOpacity
                                disabled={!isActionable || isLogging}
                                style={[styles.takeBtn, !isActionable && styles.takeBtnDisabled]}
                                onPress={() => handleLogDose(m.id, s.slot)}
                              >
                                <Text style={[styles.takeBtnText, !isActionable && styles.takeBtnTextDisabled]}>
                                  {isLogging ? 'Logging...' : 'Mark Taken'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CHAT TAB                                                      */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'chat' && (
        <View style={styles.chatContainer}>
          <ScrollView style={styles.chatMessages}>
            {chatMessages.map((msg, i) => (
              <View
                key={i}
                style={[
                  styles.chatBubble,
                  msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                ]}
              >
                <Text
                  style={[
                    styles.chatText,
                    msg.sender === 'user' ? styles.chatTextUser : styles.chatTextAssistant,
                  ]}
                >
                  {msg.text}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask about your reports or meds..."
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChat}>
              <Text style={styles.chatSendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRIVACY & CONSENT TAB                                         */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'consent' && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Physician Clinical Consent Grants (DPDPA 2023)</Text>
          {consents.length === 0 ? (
            <View style={styles.detailCard}>
              <Text style={styles.detailText}>No clinical consent grants on file.</Text>
            </View>
          ) : (
            consents.map((c) => (
              <View key={c.id} style={styles.consentCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.consentDoctor}>
                    {c.doctor?.profile?.full_name || 'Dr. Alex Morgan, MD'}
                  </Text>
                  <Text
                    style={[
                      styles.bioSeverity,
                      c.status === 'ACTIVE' ? styles.bioNormal : styles.bioElevated,
                    ]}
                  >
                    {c.status}
                  </Text>
                </View>
                <Text style={styles.consentSub}>
                  Scopes: {Array.isArray(c.scopes) ? c.scopes.join(', ') : 'reports, timeline, ai_summary'}
                </Text>
                <Text style={styles.consentSub}>
                  Lookback: {c.lookback_months || 12} Months • Valid Until: {c.valid_until ? c.valid_until.split('T')[0] : 'N/A'}
                </Text>
                {c.status === 'ACTIVE' ? (
                  <TouchableOpacity
                    style={styles.revokeBtn}
                    onPress={() => handleRevokeConsent(c.id)}
                  >
                    <Text style={styles.revokeBtnText}>Revoke Doctor Access Immediately</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.revokeBtn, { backgroundColor: '#E0F2FE' }]}
                    onPress={() => handleReauthorizeConsent(c.id)}
                  >
                    <Text style={[styles.revokeBtnText, { color: '#0369A1' }]}>Re-Authorize Consent Grant</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safetyBanner: {
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  safetyText: { color: '#E2E8F0', fontSize: 10, fontWeight: '700' },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  greeting: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  subtext: { fontSize: 11, color: '#64748B', fontFamily: 'monospace' },
  signOutBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#FEE2E2' },
  signOutText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  navBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 8, paddingHorizontal: 12 },
  navTab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8 },
  navTabActive: { backgroundColor: '#0284C7' },
  navTabText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  navTabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  cardHighlight: {
    backgroundColor: '#0A2540',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHighlightTitle: { color: '#38BDF8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardHighlightSub: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 4 },
  cardHighlightDetails: { color: '#CBD5E1', fontSize: 12, marginTop: 4, fontFamily: 'monospace' },
  cardHighlightBadge: {
    backgroundColor: '#064E3B',
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  metricLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  metricValElevated: { fontSize: 18, fontWeight: '800', color: '#D97706', marginVertical: 4 },
  metricValNormal: { fontSize: 16, fontWeight: '800', color: '#059669', marginVertical: 4 },
  metricRange: { fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  smallBtn: { backgroundColor: '#E0F2FE', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  smallBtnText: { color: '#0369A1', fontSize: 11, fontWeight: '700' },
  reportItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportItemActive: { borderColor: '#0284C7', backgroundColor: '#F0F9FF' },
  reportTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  reportSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  reportStatus: { fontSize: 10, fontWeight: '700', color: '#059669', fontFamily: 'monospace' },
  detailCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 12 },
  detailHeading: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  detailText: { fontSize: 12, color: '#334155', lineHeight: 18 },
  biomarkerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  bioName: { fontSize: 12, color: '#1E293B', fontWeight: '600', flex: 1 },
  bioVal: { fontSize: 12, fontWeight: '700', color: '#0F172A', fontFamily: 'monospace', marginHorizontal: 8 },
  bioSeverity: { fontSize: 10, fontWeight: '700', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  bioNormal: { backgroundColor: '#ECFDF5', color: '#059669' },
  bioElevated: { backgroundColor: '#FEF3C7', color: '#D97706' },
  timelineItem: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  timelineDate: { fontSize: 10, color: '#64748B', fontFamily: 'monospace', fontWeight: '600' },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  timelineDesc: { fontSize: 11, color: '#475569', marginTop: 2 },
  medCard: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  medCardContainer: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  medCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 10,
  },
  medDosage: { fontSize: 11, color: '#64748B', fontFamily: 'monospace', marginTop: 2 },
  medNextDueBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  medTodayBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  medInactiveNotice: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  medInactiveText: { fontSize: 11, color: '#64748B', fontFamily: 'monospace' },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  slotItem: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  slotItemTaken: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  slotItemMissed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  slotItemPending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotTitle: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
  slotTime: { fontSize: 10, color: '#64748B', fontFamily: 'monospace' },
  slotStatusRow: { marginVertical: 6 },
  slotTakenText: { fontSize: 10, fontWeight: '700', color: '#15803D' },
  slotMissedText: { fontSize: 10, fontWeight: '700', color: '#B91C1C' },
  slotPendingText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  slotUpcomingText: { fontSize: 10, color: '#94A3B8' },
  slotActionRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 6 },
  undoText: { fontSize: 10, color: '#64748B', textDecorationLine: 'underline', textAlign: 'center' },
  lockedText: { fontSize: 10, color: '#166534', fontWeight: '700', textAlign: 'center' },
  takeBtn: { backgroundColor: '#0284C7', paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  takeBtnDisabled: { backgroundColor: '#CBD5E1' },
  takeBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  takeBtnTextDisabled: { color: '#64748B' },
  medName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  medTiming: { fontSize: 11, color: '#64748B', marginTop: 2 },
  medBtn: { borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  medBtnTaken: { backgroundColor: '#059669', borderColor: '#059669' },
  medBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  medBtnTextTaken: { color: '#FFFFFF' },
  chatContainer: { flex: 1, justifyContent: 'space-between' },
  chatMessages: { flex: 1, padding: 12 },
  chatBubble: { padding: 12, borderRadius: 12, marginBottom: 10, maxWidth: '85%' },
  chatBubbleUser: { backgroundColor: '#0284C7', alignSelf: 'flex-end' },
  chatBubbleAssistant: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignSelf: 'flex-start' },
  chatText: { fontSize: 12, lineHeight: 18 },
  chatTextUser: { color: '#FFFFFF' },
  chatTextAssistant: { color: '#1E293B' },
  chatInputRow: { flexDirection: 'row', padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, marginRight: 8 },
  chatSendBtn: { backgroundColor: '#0284C7', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
  chatSendBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  consentCard: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  consentDoctor: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  consentSub: { fontSize: 11, color: '#64748B', marginVertical: 4 },
  revokeBtn: { backgroundColor: '#FEE2E2', paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  revokeBtnText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
});
