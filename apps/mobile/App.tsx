import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';
import type { Profile } from '@medi-connect/shared';
import { PatientMobileScreen } from './src/components/PatientMobileScreen';
import { DoctorMobileScreen } from './src/components/DoctorMobileScreen';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    setErrorMsg(null);
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0284C7" />
        <Text style={styles.loadingText}>Medi Connect AI • Restoring Session...</Text>
      </View>
    );
  }

  // Authenticated View
  if (session && profile) {
    if (profile.role === 'patient') {
      return (
        <SafeAreaProvider>
          <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <PatientMobileScreen profile={profile} onSignOut={handleSignOut} />
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }

    if (profile.role === 'doctor') {
      return (
        <SafeAreaProvider>
          <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <DoctorMobileScreen profile={profile} onSignOut={handleSignOut} />
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }

    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Medi Connect AI</Text>
            <Text style={styles.headerSub}>Role: {profile.role.toUpperCase()}</Text>
          </View>

          <View style={styles.safetyBanner}>
            <Text style={styles.safetyText}>
              AI ASSISTS, DOCTOR DECIDES • Certified Clinical Prototype
            </Text>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome, {profile.full_name}</Text>
              <Text style={styles.cardBody}>
                {profile.role === 'hospital_staff'
                  ? 'City Care Hospital Operations Desk • Duty Rosters & Invoices Active.'
                  : 'Super Admin Operational Oversight • Strictly De-Identified Mode.'}
              </Text>
            </View>

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Unauthenticated Sign In View
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Medi Connect AI</Text>
          <Text style={styles.headerSub}>Mobile Patient & Doctor Shell</Text>
        </View>

      <View style={styles.safetyBanner}>
        <Text style={styles.safetyText}>
          AI ASSISTS, DOCTOR DECIDES • All Summaries Require Doctor Sign-off
        </Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.authCard}>
          <Text style={styles.authHeading}>Secure Sign In</Text>

          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="patient.aarav@mediconnect.demo"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor="#64748B"
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSignIn}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Dev-Only Demo Account Selector (Stripped by Metro in production) */}
          {__DEV__ && (() => {
            let devPw = '';
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              devPw = require('./dev_secret.json').demoPassword || '';
            } catch {}

            return (
              <View style={styles.demoBox}>
                <Text style={styles.demoTitle}>[DEV ONLY] Tap to Fill Demo Account:</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEmail('patient.aarav@mediconnect.demo');
                    setPassword(devPw);
                  }}
                >
                  <Text style={styles.demoLink}>• Patient Aarav (Demo)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmail('patient.sunita@mediconnect.demo');
                    setPassword(devPw);
                  }}
                >
                  <Text style={styles.demoLink}>• Patient Sunita (Demo)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmail('doctor.alex@mediconnect.demo');
                    setPassword(devPw);
                  }}
                >
                  <Text style={styles.demoLink}>• Doctor Alex (Demo)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmail('staff.priya@mediconnect.demo');
                    setPassword(devPw);
                  }}
                >
                  <Text style={styles.demoLink}>• Staff Priya (Demo)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmail('admin.officer@mediconnect.demo');
                    setPassword(devPw);
                  }}
                >
                  <Text style={styles.demoLink}>• Admin Officer (Demo)</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A192F',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0A192F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'System',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    backgroundColor: '#060F1E',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
    fontWeight: '600',
  },
  safetyBanner: {
    backgroundColor: '#78350F',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  safetyText: {
    color: '#FEF3C7',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  signOutButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  authCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
  },
  authHeading: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 10,
  },
  demoBox: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  demoTitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '600',
  },
  demoLink: {
    color: '#38BDF8',
    fontSize: 13,
    marginVertical: 4,
    fontWeight: '500',
  },
});
