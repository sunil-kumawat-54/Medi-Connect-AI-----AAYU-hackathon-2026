import React from 'react';
import type { Profile } from '@medi-connect/shared';
import { Activity, ShieldAlert, LogOut, Globe, PhoneCall } from 'lucide-react';

interface HeaderProps {
  profile: Profile;
  onSignOut: () => void;
  language: 'en' | 'hi';
  onLanguageChange: (lang: 'en' | 'hi') => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onSignOut,
  language,
  onLanguageChange,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      {/* Persistent Clinical Safety Directive Header */}
      <div className="bg-navy-950 text-white px-4 py-1.5 text-xs flex flex-wrap items-center justify-between border-b border-navy-800">
        <div className="flex items-center space-x-2">
          <span className="bg-brand-500/30 text-brand-300 font-mono uppercase px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border border-brand-400/30">
            SAFETY DIRECTIVE
          </span>
          <span className="text-slate-300 font-medium">
            AI ASSISTS, DOCTOR DECIDES • All clinical summaries require authorized doctor sign-off.
          </span>
        </div>
        <div className="flex items-center space-x-4 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center space-x-1 text-red-400 font-semibold">
            <PhoneCall className="w-3.5 h-3.5 shrink-0" />
            <span>Emergency: 112 / 108</span>
          </span>
          <span className="hidden md:inline">Supabase ap-south-1 (Mumbai)</span>
        </div>
      </div>

      {/* Main App Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-teal-500 flex items-center justify-center text-white shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold font-heading text-slate-900 leading-tight">
                Medi Connect AI
              </h1>
              <span className="bg-brand-50 text-brand-700 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-brand-200">
                Phase 3 Prototype
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">Smart Healthcare & Clinical Intelligence</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-5">
          {/* Language Switcher */}
          <button
            onClick={() => onLanguageChange(language === 'en' ? 'hi' : 'en')}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            title="Switch Language"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span>{language === 'en' ? 'English (EN)' : 'हिंदी (HI)'}</span>
          </button>

          {/* User Profile Chip */}
          <div className="text-right hidden sm:block">
            <div className="flex items-center justify-end space-x-2">
              <p className="text-sm font-semibold text-slate-900 leading-none">{profile.full_name}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold capitalize bg-brand-50 text-brand-700 border border-brand-200">
                {profile.role.replace('_', ' ')}
              </span>
            </div>
            {profile.abha_id_mock && (
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                ABHA: <span className="text-slate-700 font-semibold">{profile.abha_id_mock}</span>
              </p>
            )}
          </div>

          {/* Sign Out Button */}
          <button
            onClick={onSignOut}
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
