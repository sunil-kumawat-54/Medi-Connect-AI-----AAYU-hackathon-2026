import React from 'react';
import { User, Stethoscope, Building2, Lock } from 'lucide-react';

interface DevDemoAssistantProps {
  onSelect: (email: string, password: string) => void;
}

export const DevDemoAssistant: React.FC<DevDemoAssistantProps> = ({ onSelect }) => {
  // Guard: Never render or execute in production
  if (!import.meta.env.DEV) {
    return null;
  }

  const handleFill = async (email: string) => {
    try {
      const res = await fetch('/api/dev-demo-credentials');
      if (res.ok) {
        const data = await res.json();
        onSelect(email, data.password || '');
      } else {
        onSelect(email, '');
      }
    } catch {
      onSelect(email, '');
    }
  };

  return (
    <div className="mt-6 pt-5 border-t border-slate-700/60">
      <p className="text-[11px] font-mono text-slate-400 mb-2">
        [DEV ONLY] Sandbox Accounts (Loads password via dev server):
      </p>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => handleFill('patient.aarav@mediconnect.demo')}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-slate-300 text-left border border-slate-700 flex items-center space-x-1"
        >
          <User className="w-3 h-3 text-brand-400" />
          <span>Patient A</span>
        </button>
        <button
          type="button"
          onClick={() => handleFill('doctor.alex@mediconnect.demo')}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-slate-300 text-left border border-slate-700 flex items-center space-x-1"
        >
          <Stethoscope className="w-3 h-3 text-teal-400" />
          <span>Doctor Alex</span>
        </button>
        <button
          type="button"
          onClick={() => handleFill('staff.priya@mediconnect.demo')}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-slate-300 text-left border border-slate-700 flex items-center space-x-1"
        >
          <Building2 className="w-3 h-3 text-amber-400" />
          <span>Hospital Staff</span>
        </button>
        <button
          type="button"
          onClick={() => handleFill('admin.officer@mediconnect.demo')}
          className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-slate-300 text-left border border-slate-700 flex items-center space-x-1"
        >
          <Lock className="w-3 h-3 text-purple-400" />
          <span>Super Admin</span>
        </button>
      </div>
    </div>
  );
};
