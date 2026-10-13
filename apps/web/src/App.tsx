import React, { useEffect, useState } from 'react';
import { supabase, getCurrentProfile } from './lib/supabase';
import { requestMockOtp, verifyMockOtp } from './lib/mockAadhaar';
import type { Profile, UserRole } from '@medi-connect/shared';
import { DevDemoAssistant } from './components/DevDemoAssistant';
import { Header } from './components/common/Header';
import { PatientDashboard } from './components/patient/PatientDashboard';
import { DoctorDashboard } from './components/doctor/DoctorDashboard';
import { HospitalDashboard } from './components/hospital/HospitalDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import {
  ShieldAlert,
  Activity,
  User,
  Stethoscope,
  Building2,
  Lock,
  LogOut,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  Fingerprint,
} from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  
  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Mock Aadhaar Modal State
  const [showAadhaarModal, setShowAadhaarModal] = useState(false);
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [aadhaarMsg, setAadhaarMsg] = useState<string | null>(null);

  // Initialize and listen to session changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        getCurrentProfile().then((p) => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const p = await getCurrentProfile();
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        alert('Registration successful! Please sign in with your credentials.');
        setAuthMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAadhaarOtpRequest = async () => {
    setAadhaarMsg(null);
    const res = await requestMockOtp(aadhaarInput);
    if (res.success) {
      setOtpSent(true);
      setAadhaarMsg(res.message);
    } else {
      setAadhaarMsg(res.message);
    }
  };

  const handleAadhaarVerify = async () => {
    const res = await verifyMockOtp(aadhaarInput, otpInput);
    if (res.success) {
      alert(`[SANDBOX SUCCESS] Authenticated as: ${res.fullName} (Mock ABHA: ${res.mockAbhaId})`);
      setShowAadhaarModal(false);
      // Auto-fill demo credentials
      setEmail('patient.aarav@mediconnect.demo');
      setPassword('');
    } else {
      setAadhaarMsg(res.error || 'Verification failed');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center space-y-4">
          <Activity className="w-10 h-10 text-brand-400 animate-spin" />
          <p className="text-slate-400 font-mono text-sm tracking-wide">Initializing Medi Connect Secure Session...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // AUTHENTICATED ROLE-BASED DASHBOARD
  // --------------------------------------------------------------------------
  if (session && profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-body">
        <Header
          profile={profile}
          onSignOut={handleSignOut}
          language={language}
          onLanguageChange={setLanguage}
        />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
          {profile.role === 'patient' && <PatientDashboard profile={profile} language={language} />}
          {profile.role === 'doctor' && <DoctorDashboard profile={profile} language={language} />}
          {profile.role === 'hospital_staff' && <HospitalDashboard profile={profile} />}
          {profile.role === 'super_admin' && <AdminDashboard profile={profile} />}
        </main>
      </div>
    );
  }


  // --------------------------------------------------------------------------
  // UNAUTHENTICATED / LOGIN & ONBOARDING VIEW
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-brand-500 selection:text-white">
      {/* Top Banner */}
      <div className="bg-navy-950/80 backdrop-blur-md border-b border-navy-800/80 px-4 py-2 text-center text-xs text-slate-400">
        <span className="font-semibold text-brand-400">AAYU 2026 Hackathon Prototype:</span> Grounded AI Medical Intelligence • Rules-Before-Reasoning • Doctor-In-Control
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/80 p-8 shadow-2xl">
          {/* Logo & Heading */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-teal-500 mx-auto flex items-center justify-center text-white shadow-lg mb-3">
              <Activity className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold font-heading text-white">Medi Connect AI</h2>
            <p className="text-xs text-slate-400 mt-1">Connects Patients, Doctors & Diagnostic Intelligence</p>
          </div>

          {/* Persistent Safety Directive */}
          <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <p><strong>Clinical Notice:</strong> AI assists, doctor decides. All summaries require authorized physician verification.</p>
          </div>

          {/* Mode Tabs */}
          <div className="flex rounded-xl bg-slate-900/60 p-1 mb-6 border border-slate-700/50">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                authMode === 'login' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                authMode === 'signup' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Patient Sign Up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {authError}
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-white text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-white text-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-white text-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
            >
              {authLoading ? (
                <Activity className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{authMode === 'login' ? 'Sign In' : 'Create Patient Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Dev-Only Demo Credentials Assistant (Stripped completely in production) */}
          {import.meta.env.DEV && (
            <DevDemoAssistant
              onSelect={(selectedEmail, selectedPw) => {
                setEmail(selectedEmail);
                setPassword(selectedPw);
              }}
            />
          )}

          <div className="mt-4 pt-4 border-t border-slate-700/60">

            <button
              type="button"
              onClick={() => setShowAadhaarModal(true)}
              className="mt-4 w-full py-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-slate-300 text-xs font-mono border border-slate-700 flex items-center justify-center space-x-2 transition"
            >
              <Fingerprint className="w-4 h-4 text-brand-400" />
              <span>Simulate Aadhaar / ABHA ID SSO (Sandbox)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mock Aadhaar Modal */}
      {showAadhaarModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2 font-heading">
              <Fingerprint className="w-5 h-5 text-brand-400" />
              <span>Mock Aadhaar / ABHA SSO</span>
            </h3>
            <p className="text-xs text-amber-300/90 mt-1 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
              [SANDBOX PROTOTYPE] Simulated sandbox only. Never input real personal Aadhaar numbers.
            </p>

            {aadhaarMsg && (
              <p className="mt-3 text-xs text-brand-300 bg-brand-500/10 p-2 rounded-lg border border-brand-500/20 font-mono">
                {aadhaarMsg}
              </p>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">Simulated 12-Digit Number</label>
                <input
                  type="text"
                  maxLength={12}
                  value={aadhaarInput}
                  onChange={(e) => setAadhaarInput(e.target.value)}
                  placeholder="Demo: 123412341234"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                />
              </div>

              {otpSent && (
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">Demo OTP (Enter: 123456)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 flex space-x-2">
              <button
                type="button"
                onClick={() => setShowAadhaarModal(false)}
                className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold"
              >
                Cancel
              </button>
              {!otpSent ? (
                <button
                  type="button"
                  onClick={handleAadhaarOtpRequest}
                  className="flex-1 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
                >
                  Request OTP
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAadhaarVerify}
                  className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
                >
                  Verify & Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-3 border-t border-slate-800">
        Medi Connect AI • Phase 2 Monorepo Baseline • Supabase Auth + Postgres RLS + Encrypted Storage
      </footer>
    </div>
  );
}
