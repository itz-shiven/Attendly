'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import AttendanceSearch from '@/components/AttendanceSearch';
import { ArrowLeft, MapPin, Users, Loader2, Download, PlusCircle, ShieldOff, Trash2 } from 'lucide-react';
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
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-white">
        <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-16">
      {/* Terminate Confirmation Modal */}
      {terminateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-red-800/60 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-950/60 border border-red-700/50 rounded-xl flex items-center justify-center shrink-0">
                <ShieldOff className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Terminate Access</h3>
                <p className="text-xs text-zinc-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-zinc-300 mb-1">
              Permanently revoke access for:
            </p>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 mb-4">
              <p className="font-bold text-white text-sm">{terminateTarget.full_name || '(No name)'}</p>
              <p className="text-xs text-zinc-500">{terminateTarget.email}</p>
            </div>

            {terminateError && (
              <p className="text-xs text-red-400 mb-3">{terminateError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setTerminateTarget(null); setTerminateError(''); }}
                disabled={isTerminating}
                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 font-semibold rounded-xl text-sm hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminate}
                disabled={isTerminating}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isTerminating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-4 py-4">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </Link>
            <div>
              <h1 className="text-base font-bold leading-tight truncate max-w-[200px]">
                {site?.name || 'Site Detail'}
              </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-500">{site?.location || 'No location'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/api/reports/daily?date=${todayISO}&site_id=${siteId}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 text-xs font-bold rounded-xl hover:bg-emerald-600/25 transition-all min-h-[36px]"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </Link>
            <Link
              href={`/register?site=${siteId}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600/15 border border-violet-500/25 text-violet-400 text-xs font-bold rounded-xl hover:bg-violet-600/25 transition-all min-h-[36px]"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Labor
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-5">
        {/* Success toast */}
        {addSuccess && (
          <div className="p-3 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-semibold">
            {addSuccess}
          </div>
        )}

        {/* Engineers on this site */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Assigned Engineers ({engineers.length})
              </h3>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-2 py-1 bg-violet-600/20 text-violet-300 text-xs font-bold rounded-lg hover:bg-violet-600/30 transition-all"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Engineer
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddEngineer} className="mb-4 bg-zinc-950 p-3 rounded-xl border border-violet-800/40 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-violet-400 mb-1">Create Engineer Account</h4>
              {addError && <p className="text-[10px] text-red-400">{addError}</p>}
              <input
                type="text"
                required
                placeholder="Full Name"
                value={engName}
                onChange={e => setEngName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:border-violet-500 focus:outline-none text-white text-xs"
              />
              <input
                type="email"
                required
                placeholder="Email Address"
                value={engEmail}
                onChange={e => setEngEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:border-violet-500 focus:outline-none text-white text-xs"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={engPassword}
                onChange={e => setEngPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg focus:border-violet-500 focus:outline-none text-white text-xs"
              />
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-zinc-800 text-zinc-300 font-semibold rounded-lg text-xs hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-2 bg-violet-600 text-white font-bold rounded-lg text-xs hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
                >
                  {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          )}

          {engineers.length === 0 && !showAddForm ? (
            <p className="text-xs text-zinc-500 italic">No engineers assigned. Use &quot;Add Engineer&quot; above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {engineers.map(eng => (
                <div
                  key={eng.id}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl"
                >
                  <div className="w-7 h-7 bg-violet-600/20 border border-violet-500/30 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-violet-400">
                      {(eng.full_name || eng.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-300 truncate">
                      {eng.full_name || eng.email}
                    </p>
                    {eng.full_name && (
                      <p className="text-[10px] text-zinc-600 truncate">{eng.email}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setTerminateTarget(eng)}
                    title="Terminate access"
                    className="p-1.5 bg-red-950/40 border border-red-800/40 rounded-lg hover:bg-red-900/50 transition-colors shrink-0"
                  >
                    <ShieldOff className="w-3 h-3 text-red-400" />
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
