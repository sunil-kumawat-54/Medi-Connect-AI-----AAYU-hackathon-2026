import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Profile } from '@medi-connect/shared';
import { computeAge } from '@medi-connect/shared';

interface DoctorMobileScreenProps {
  profile: Profile;
  onSignOut: () => void;
}

export const DoctorMobileScreen: React.FC<DoctorMobileScreenProps> = ({ profile, onSignOut }) => {
  const [reviewStatus, setReviewStatus] = useState<string>('DRAFT');
  const [docNotes, setDocNotes] = useState('');
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [patientConsent, setPatientConsent] = useState<any>(null);
  const [biomarkers, setBiomarkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const patientId = 'a0000000-0000-0000-0000-000000000001';

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch patient profile to compute age
      const { data: pat } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', patientId)
        .single();
      if (pat) setPatientProfile(pat);

      // 2. Fetch real patient consent grant
      const { data: con } = await supabase
        .from('patient_consents')
        .select('*')
        .eq('patient_id', patientId)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPatientConsent(con);

      // 3. Fetch biomarkers
      const { data: bio } = await supabase
        .from('biomarkers')
        .select('*')
        .eq('patient_id', patientId);
      if (bio) setBiomarkers(bio);

      // 4. Fetch summary review status
      const { data: sum } = await supabase
        .from('ai_summaries')
        .select('review_status, doctor_notes')
        .eq('id', 'f2000000-0000-0000-0000-000000000001')
        .maybeSingle();
      if (sum) {
        setReviewStatus(sum.review_status);
        if (sum.doctor_notes) setDocNotes(sum.doctor_notes);
      }
    } catch (e: any) {
      console.warn('Error loading doctor mobile data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isConsentActive = Boolean(
    patientConsent &&
    patientConsent.status === 'ACTIVE' &&
    !patientConsent.revoked_at &&
    new Date(patientConsent.valid_until) >= new Date()
  );

  const hasAiSummaryScope = Boolean(patientConsent?.scopes?.includes('ai_summary'));

  // Spec Rule: Approval blocks on CRITICAL red flags only (not ELEVATED)
  const redFlags = biomarkers.filter((b) => b.severity === 'CRITICAL');
  const hasUnverifiedRedFlags = redFlags.some((b) => !b.verified_at);

  const handleVerifyBiomarker = async (bioId: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc('verify_biomarker', {
        p_biomarker_id: bioId,
        p_verified: true,
      });
      if (error) {
        Alert.alert('Verification Failed', error.message);
        return;
      }
      Alert.alert('Biomarker Certified', 'Biomarker certified and audit logged.');
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignOff = async (decision: 'APPROVED' | 'EDITED' | 'REJECTED') => {
    if (!isConsentActive) {
      Alert.alert('CONSENT DENIED', `No active patient consent (Status: ${patientConsent?.status || 'REVOKED'}).`);
      return;
    }
    if (!hasAiSummaryScope) {
      Alert.alert('CONSENT DENIED', `Consent exists but lacks required 'ai_summary' scope.`);
      return;
    }
    if (decision === 'APPROVED' && hasUnverifiedRedFlags) {
      Alert.alert(
        'Server Rejection Pre-empted',
        'Spec Rule: All critical and elevated biomarkers must be verified by the attending physician before approval.'
      );
      return;
    }

    try {
      setActionLoading(true);
      const { data, error } = await supabase.rpc('approve_ai_summary', {
        p_summary_id: 'f2000000-0000-0000-0000-000000000001',
        p_decision: decision,
        p_doctor_notes: docNotes || `Signed off on mobile by ${profile.full_name}`,
      });

      if (error) {
        Alert.alert('Approval Refused by Server', error.message);
        return;
      }

      setReviewStatus(decision);
      Alert.alert('Decision Recorded', `60-Second Patient Brief marked as ${decision}. Server-side audit logged.`);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const patientAge = computeAge(patientProfile?.date_of_birth) ?? 44;

  return (
    <View style={styles.container}>
      <View style={styles.safetyBanner}>
        <Text style={styles.safetyText}>PHYSICIAN CLINICAL COCKPIT • LICENSE #MCI-DEMO-84920</Text>
      </View>

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Dr. Alex Morgan, MD</Text>
          <Text style={styles.headerSub}>Cardiology & Metabolic Health</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Patient Identity Card with Real-time DB Consent & Dynamic Age */}
        <View style={styles.patientCard}>
          <Text style={styles.patientHeading}>
            Current Outpatient: {patientProfile?.full_name || 'Aarav Sharma'} (Age: {patientAge})
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#38BDF8" style={{ marginTop: 6 }} />
          ) : isConsentActive ? (
            <View>
              <Text style={styles.patientConsent}>
                ✓ Active DPDPA Consent Grant ({patientConsent.lookback_months || 12}m Lookback)
              </Text>
              <Text style={styles.consentScopes}>
                Scopes: {patientConsent.scopes?.join(', ')}
              </Text>
              {!hasAiSummaryScope && (
                <Text style={styles.consentWarning}>
                  ⚠️ Missing 'ai_summary' scope! Summary approval is locked under DPDPA.
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.patientConsentRevoked}>
              ⚠️ NO ACTIVE CONSENT (Status: {patientConsent?.status || 'REVOKED'}) • RLS Restricted
            </Text>
          )}
        </View>

        {/* 60-Second Brief View (SCR-11) */}
        <View style={styles.briefCard}>
          <View style={styles.briefHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.briefTitle}>60-Second Patient Brief (SCR-11)</Text>
              <Text style={styles.mockBadgeText}>[MOCK / DEMO BRIEF]</Text>
            </View>
            <Text style={styles.triageBadge}>MODERATE PRIORITY</Text>
          </View>

          {/* Red Flag Biomarker Gating Section */}
          <Text style={styles.sectionHeader}>Critical Red-Flag Biomarkers</Text>
          <Text style={styles.specRuleText}>
            Spec Rule: Approval is refused until each red-flag biomarker is certified via server RPC.
          </Text>

          {redFlags.map((b) => (
            <View key={b.id} style={styles.bioRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bioName}>{b.name}</Text>
                <Text style={styles.bioVal}>
                  {b.numeric_value ?? b.raw_value} {b.unit} ({b.severity})
                </Text>
              </View>
              {b.verified_at ? (
                <View style={styles.badgeVerified}>
                  <Text style={styles.badgeVerifiedText}>✓ Verified</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={() => handleVerifyBiomarker(b.id)}
                  disabled={actionLoading}
                >
                  <Text style={styles.verifyBtnText}>Verify</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <Text style={styles.sectionHeader}>Longitudinal Trend & Gaps [MOCK SYNTHESIS]</Text>
          <View style={styles.bioBox}>
            <Text style={styles.bioItem}>• Gradual rise in HbA1c (+0.4% over 90 days).</Text>
            <Text style={styles.bioItem}>• Adherence to Metformin 500mg logged at 85%.</Text>
            <Text style={styles.bioItem}>• Gap: Missing Urine Microalbuminuria annual check.</Text>
          </View>

          <Text style={styles.sectionHeader}>Doctor Clinical Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={docNotes}
            onChangeText={setDocNotes}
            placeholder="Add consultation notes and titration plan..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
          />

          <View style={styles.statusRow}>
            <Text style={styles.statusText}>Current Status: {reviewStatus}</Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[
                styles.btnApprove,
                (hasUnverifiedRedFlags || !isConsentActive || !hasAiSummaryScope) && styles.btnDisabled,
              ]}
              onPress={() => handleSignOff('APPROVED')}
              disabled={actionLoading || hasUnverifiedRedFlags || !isConsentActive || !hasAiSummaryScope}
            >
              <Text style={styles.btnApproveText}>
                {hasUnverifiedRedFlags ? 'Approve (Verify Flags First)' : 'Approve'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnEdit}
              onPress={() => handleSignOff('EDITED')}
              disabled={actionLoading}
            >
              <Text style={styles.btnEditText}>Edit & Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnReject}
              onPress={() => handleSignOff('REJECTED')}
              disabled={actionLoading}
            >
              <Text style={styles.btnRejectText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  safetyBanner: { backgroundColor: '#064E3B', padding: 6, alignItems: 'center' },
  safetyText: { color: '#6EE7B7', fontSize: 10, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B' },
  signOutBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#FEE2E2' },
  signOutText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  patientCard: { backgroundColor: '#0A2540', padding: 14, borderRadius: 14, marginBottom: 14 },
  patientHeading: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  patientConsent: { color: '#38BDF8', fontSize: 11, fontWeight: '600', marginTop: 4 },
  consentScopes: { color: '#94A3B8', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  consentWarning: { color: '#FBBF24', fontSize: 10, fontWeight: '700', marginTop: 4 },
  patientConsentRevoked: { color: '#F87171', fontSize: 11, fontWeight: '700', marginTop: 4 },
  briefCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  briefHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  briefTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  mockBadgeText: { fontSize: 10, fontWeight: '700', color: '#B45309', marginTop: 2, fontFamily: 'monospace' },
  triageBadge: { backgroundColor: '#FEF3C7', color: '#D97706', fontSize: 10, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 12, marginBottom: 4 },
  specRuleText: { fontSize: 10, color: '#B45309', marginBottom: 6, fontStyle: 'italic' },
  bioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  bioName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  bioVal: { fontSize: 11, color: '#DC2626', fontFamily: 'monospace' },
  badgeVerified: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0' },
  badgeVerifiedText: { color: '#059669', fontSize: 10, fontWeight: '700' },
  verifyBtn: { backgroundColor: '#D97706', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  verifyBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  bioBox: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  bioItem: { fontSize: 12, color: '#1E293B', marginBottom: 4 },
  notesInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, fontSize: 12, color: '#0F172A', minHeight: 60, textAlignVertical: 'top' },
  statusRow: { marginTop: 12, alignItems: 'flex-end' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#0284C7', fontFamily: 'monospace' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  btnApprove: { backgroundColor: '#059669', flex: 1.2, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginRight: 6 },
  btnDisabled: { backgroundColor: '#94A3B8', opacity: 0.6 },
  btnApproveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11, textAlign: 'center' },
  btnEdit: { backgroundColor: '#0284C7', flex: 0.9, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginRight: 6 },
  btnEditText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  btnReject: { backgroundColor: '#FEE2E2', flex: 0.8, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnRejectText: { color: '#DC2626', fontWeight: '700', fontSize: 11 },
});
