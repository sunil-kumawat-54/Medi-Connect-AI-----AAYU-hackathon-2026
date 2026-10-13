import React, { useState } from 'react';
import type { Profile } from '@medi-connect/shared';
import {
  Building2,
  Users,
  Calendar,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PlusCircle,
  FileText
} from 'lucide-react';

interface HospitalDashboardProps {
  profile: Profile;
}

export const HospitalDashboard: React.FC<HospitalDashboardProps> = ({ profile }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'roster' | 'billing'>('overview');

  const [roster] = useState([
    { doctor: 'Dr. Alex Morgan, MD', specialty: 'Cardiology & Metabolic Health', department: 'Cardiology OPD', slotCount: 16, status: 'On Duty' },
    { doctor: 'Dr. Reena Mehta, MS', specialty: 'General & Laparoscopic Surgery', department: 'Surgical OPD', slotCount: 12, status: 'In Surgery' },
    { doctor: 'Dr. Vikram Sethi, MD', specialty: 'Internal Medicine', department: 'General Medicine', slotCount: 20, status: 'On Duty' },
  ]);

  const [bills] = useState([
    { id: 'INV-2026-081', patient: 'Aarav Sharma (DEMO)', amount: 2690, status: 'Flagged', flagCount: 2, date: 'Today' },
    { id: 'INV-2026-080', patient: 'Sunita Verma (DEMO)', amount: 1450, status: 'Approved', flagCount: 0, date: 'Yesterday' },
    { id: 'INV-2026-079', patient: 'Karan Mehra', amount: 8200, status: 'Approved', flagCount: 0, date: '2 days ago' },
  ]);

  return (
    <div className="space-y-6">
      {/* Hospital Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-navy-900 to-brand-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-wrap items-center justify-between gap-6">
        <div>
          <span className="bg-brand-500/20 text-brand-300 border border-brand-400/30 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wide uppercase">
            Hospital Administration Desk
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading mt-3">
            City Care Multi-Specialty Hospital (DEMO)
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 font-mono">
            Accreditation: NABH-DEMO-2026-918 • Staff: {profile.full_name} (Records Officer)
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-center">
            <span className="text-xs text-slate-400 font-mono flex items-center justify-center space-x-1">
              <span>Active OPD Doctors</span>
              <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1 rounded">[MOCK]</span>
            </span>
            <p className="text-xl font-bold text-white font-heading">8 On Duty</p>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20 text-center">
            <span className="text-xs text-slate-400 font-mono flex items-center justify-center space-x-1">
              <span>Appointments</span>
              <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1 rounded">[DEMO]</span>
            </span>
            <p className="text-xl font-bold text-brand-400 font-heading">42 Today</p>
          </div>
        </div>
      </div>

      {/* Hospital Navigation */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex space-x-2">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeSubTab === 'overview' ? 'bg-brand-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Operations Overview
        </button>
        <button
          onClick={() => setActiveSubTab('roster')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeSubTab === 'roster' ? 'bg-brand-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Doctor Rosters & Slots [MOCK]
        </button>
        <button
          onClick={() => setActiveSubTab('billing')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeSubTab === 'billing' ? 'bg-brand-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Itemized Invoices & Billing Audit [MOCK]
        </button>
      </div>

      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-500 uppercase">OPD Queue Throughput</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                [MOCK / DEMO]
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 font-heading mt-2">84 Patients</p>
            <p className="text-xs text-slate-500 mt-1">Average wait time: 14 mins (Simulated metric)</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-500 uppercase">Bed Occupancy Rate</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                [MOCK / DEMO]
              </span>
            </div>
            <p className="text-2xl font-bold text-teal-600 font-heading mt-2">78.5%</p>
            <p className="text-xs text-slate-500 mt-1">142 of 180 beds occupied (Simulated metric)</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-500 uppercase">Billing Discrepancies</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                [MOCK / DEMO]
              </span>
            </div>
            <p className="text-2xl font-bold text-amber-600 font-heading mt-2">2 Flagged</p>
            <p className="text-xs text-slate-500 mt-1">Under records officer review</p>
          </div>
        </div>
      )}

      {activeSubTab === 'roster' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-base font-heading">
              Consultant Physician Duty Roster <span className="text-xs font-mono font-bold text-amber-600">[MOCK / DEMO]</span>
            </h3>
            <span className="text-xs font-mono text-brand-600 font-semibold">Department: Outpatient Services</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-mono uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Physician</th>
                  <th className="py-2.5 px-3">Specialty</th>
                  <th className="py-2.5 px-3">OPD Department</th>
                  <th className="py-2.5 px-3">Max Slots</th>
                  <th className="py-2.5 px-3">Duty Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {roster.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 text-slate-900 font-bold">{r.doctor}</td>
                    <td className="py-3 px-3 text-slate-600">{r.specialty}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{r.department}</td>
                    <td className="py-3 px-3 font-mono font-bold">{r.slotCount}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'billing' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-base font-heading">Itemized Invoices & Discrepancy Queue</h3>
          <p className="text-xs text-slate-500">
            Rules-based auditor verifies procedural pricing against hospital NABH caps.
          </p>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-mono uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Invoice #</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Amount (₹)</th>
                  <th className="py-2.5 px-3">Audit Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {bills.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">{b.id}</td>
                    <td className="py-3 px-3 text-slate-800">{b.patient}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{b.date}</td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">₹{b.amount}</td>
                    <td className="py-3 px-3">
                      {b.flagCount > 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          {b.flagCount} Discrepancies Flagged
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Passed Audit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
