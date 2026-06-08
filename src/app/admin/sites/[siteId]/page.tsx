'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import AttendanceSearch from '@/components/AttendanceSearch';
import { ArrowLeft, MapPin, Users, Loader2, Download, PlusCircle, ShieldOff, Trash2, FileSpreadsheet, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface EngineerOnSite {
  id: string;
  email: string;
  full_name: string | null;
}

export default function AdminSiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const todayISO = new Date().toISOString().split('T')[0];

  // Fetch admin user ID + verify admin
  const { data: adminProfile, isLoading: isAdminLoading } = useQuery({
    queryKey: ['admin-profile-site'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); throw new Error('Not authenticated'); }
      const { data, error } = await supabase
        .from('profiles').select('id, role').eq('id', user.id).single();
      if (error) throw error;
      if (data.role !== 'Admin') { router.push('/'); throw new Error('Not admin'); }
      return data;
    },
    retry: false,
  });

  // Fetch site info
  const { data: site, isLoading: isSiteLoading } = useQuery({
    queryKey: ['admin-site-detail', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites').select('id, name, location').eq('id', siteId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  // Fetch engineers on this site
  const { data: engineers = [] } = useQuery({
    queryKey: ['site-engineers', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('site_id', siteId)
        .eq('role', 'Engineer');
      if (error) throw error;
      return data as EngineerOnSite[];
    },
    enabled: !!siteId,
  });

  const isLoading = isAdminLoading || isSiteLoading;

  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [engEmail, setEngEmail] = useState('');
  const [engName, setEngName] = useState('');
  const [engPassword, setEngPassword] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [terminateTarget, setTerminateTarget] = useState<EngineerOnSite | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setReportLoading(true);
    setReportUrl(null);
    setReportError(null);
    try {
      const res = await fetch(`/api/reports/daily?date=${todayISO}&site_id=${siteId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate report');
      if (data.recordsCount === 0) throw new Error('No attendance records have been marked today yet.');
      setReportUrl(data.downloadUrl);
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setReportLoading(false);
    }
  };

  const handleAddEngineer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/engineers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: engEmail, password: engPassword, full_name: engName, site_id: siteId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create engineer');
      setShowAddForm(false);
      setEngEmail('');
      setEngName('');
      setEngPassword('');
      setAddSuccess(`${engName || engEmail} has been added as an engineer.`);
      setTimeout(() => setAddSuccess(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['site-engineers'] });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setAddError(errorMessage);
    } finally {
      setIsAdding(false);
    }
  };

  const handleTerminate = async () => {
    if (!terminateTarget) return;
    setIsTerminating(true);
    setTerminateError('');
    try {
      const res = await fetch('/api/engineers/terminate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineer_id: terminateTarget.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to terminate');
      setTerminateTarget(null);
      setAddSuccess(`${terminateTarget.full_name || terminateTarget.email}'s access has been terminated.`);
      setTimeout(() => setAddSuccess(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['site-engineers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-site-stats'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Termination failed';
      setTerminateError(msg);
    } finally {
      setIsTerminating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-900">
        <Loader2 className="w-7 h-7 animate-spin text-violet-650" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Terminate Confirmation Modal */}
      {terminateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-red-200 rounded-3xl p-6 max-w-sm w-full shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-50 border border-red-205 rounded-xl flex items-center justify-center shrink-0">
                <ShieldOff className="w-5 h-5 text-red-650" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Terminate Access</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-650 mb-1">
              Permanently revoke access for:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
              <p className="font-bold text-slate-900 text-sm">{terminateTarget.full_name || '(No name)'}</p>
              <p className="text-xs text-slate-500">{terminateTarget.email}</p>
            </div>

            {terminateError && (
              <p className="text-xs text-red-600 mb-3">{terminateError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setTerminateTarget(null); setTerminateError(''); }}
                disabled={isTerminating}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminate}
                disabled={isTerminating}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isTerminating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 shadow-xs">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </Link>
            <div>
              <h1 className="text-base font-bold leading-tight truncate max-w-[200px] text-slate-900">
                {site?.name || 'Site Detail'}
              </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-500">{site?.location || 'No location'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 disabled:opacity-60 transition-all min-h-[36px] cursor-pointer"
            >
              {reportLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {reportLoading ? 'Generating...' : 'CSV'}
            </button>
            <Link
              href={`/register?site=${siteId}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold rounded-xl hover:bg-violet-100 transition-all min-h-[36px]"
            >
              <PlusCircle className="w-3.5 h-3.5 text-violet-650" />
              Add Labor
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-5">
        {/* CSV report status */}
        {reportError && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{reportError}</span>
          </div>
        )}
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs min-h-[40px] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV Report
          </a>
        )}

        {/* Success toast */}
        {addSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-750 rounded-xl text-xs font-semibold">
            {addSuccess}
          </div>
        )}

        {/* Engineers on this site */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Assigned Engineers ({engineers.length})
              </h3>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-bold rounded-lg hover:bg-violet-100 transition-all cursor-pointer border border-violet-100"
            >
              <PlusCircle className="w-3.5 h-3.5 text-violet-650" />
              Add Engineer
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddEngineer} className="mb-4 bg-slate-50 p-3 rounded-xl border border-violet-100 flex flex-col gap-2 shadow-xs">
              <h4 className="text-xs font-bold text-violet-700 mb-1">Create Engineer Account</h4>
              {addError && <p className="text-[10px] text-red-600">{addError}</p>}
              <input
                type="text"
                required
                placeholder="Full Name"
                value={engName}
                onChange={e => setEngName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:border-violet-500 focus:outline-none text-slate-900 text-xs"
              />
              <input
                type="email"
                required
                placeholder="Email Address"
                value={engEmail}
                onChange={e => setEngEmail(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:border-violet-500 focus:outline-none text-slate-900 text-xs"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={engPassword}
                onChange={e => setEngPassword(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:border-violet-500 focus:outline-none text-slate-900 text-xs"
              />
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-2 bg-violet-600 text-white font-bold rounded-lg text-xs hover:bg-violet-500 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          )}

          {engineers.length === 0 && !showAddForm ? (
            <p className="text-xs text-slate-500 italic">No engineers assigned. Use &quot;Add Engineer&quot; above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {engineers.map(eng => (
                <div
                  key={eng.id}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <div className="w-7 h-7 bg-violet-50 border border-violet-150 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-violet-700">
                      {(eng.full_name || eng.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {eng.full_name || eng.email}
                    </p>
                    {eng.full_name && (
                      <p className="text-[10px] text-slate-500 truncate">{eng.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setTerminateTarget(eng)}
                    title="Terminate access"
                    className="p-1.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors shrink-0 cursor-pointer"
                  >
                    <ShieldOff className="w-3 h-3 text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance view — reuse the same search component */}
        {adminProfile && (
          <AttendanceSearch
            siteId={siteId}
            userId={adminProfile.id}
          />
        )}
      </main>
    </div>
  );
}
