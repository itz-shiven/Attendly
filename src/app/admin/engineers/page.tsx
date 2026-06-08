'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft, Users, MapPin, Loader2,
  UserPlus, CheckCircle2, AlertCircle, Edit2, Save, X, Trash2, ShieldOff
} from 'lucide-react';
import Link from 'next/link';

interface EngineerWithSite {
  id: string;
  email: string;
  full_name: string | null;
  site_id: string | null;
  created_at: string;
  sites: { name: string } | null;
}

export default function AdminEngineersPage() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<EngineerWithSite | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  // Fetch admin profile
  const { data: adminProfile, isLoading: isAdminLoading } = useQuery({
    queryKey: ['admin-profile-engineers'],
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

  // Fetch all engineers
  const { data: engineers = [], isLoading: isEngLoading } = useQuery({
    queryKey: ['all-engineers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, email, full_name, site_id, created_at,
          sites!site_id ( name )
        `)
        .eq('role', 'Engineer')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as EngineerWithSite[];
    },
    enabled: !!adminProfile,
  });

  // Fetch all sites for the assignment dropdown
  const { data: sites = [] } = useQuery({
    queryKey: ['all-sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!adminProfile,
  });

  // Assign engineer to a site
  const assignMutation = useMutation({
    mutationFn: async ({ engineerId, siteId }: { engineerId: string; siteId: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ site_id: siteId || null })
        .eq('id', engineerId);
      if (error) throw error;

      // Also upsert into site_engineers join table
      if (siteId && adminProfile) {
        await supabase.from('site_engineers').upsert({
          site_id: siteId,
          engineer_id: engineerId,
          assigned_by: adminProfile.id,
        }, { onConflict: 'site_id,engineer_id' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-engineers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-site-stats'] });
      setEditingId(null);
      setSuccessMsg('Engineer site assignment updated!');
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Failed to update assignment');
      setTimeout(() => setErrorMsg(null), 4000);
    },
  });

  // Terminate engineer (delete auth user via API, profile cascades)
  const handleTerminate = async () => {
    if (!terminateTarget) return;
    setIsTerminating(true);
    try {
      const res = await fetch('/api/engineers/terminate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineer_id: terminateTarget.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to terminate engineer');

      setTerminateTarget(null);
      setSuccessMsg(`${terminateTarget.full_name || terminateTarget.email}'s access has been terminated.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      queryClient.invalidateQueries({ queryKey: ['all-engineers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-site-stats'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Termination failed';
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setIsTerminating(false);
    }
  };

  const isLoading = isAdminLoading || isEngLoading;

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
              You are about to permanently revoke access for:
            </p>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 mb-5">
              <p className="font-bold text-white text-sm">{terminateTarget.full_name || '(No name)'}</p>
              <p className="text-xs text-zinc-500">{terminateTarget.email}</p>
              {terminateTarget.sites && (
                <p className="text-xs text-amber-400 mt-1">
                  Assigned to: {(terminateTarget.sites as { name: string }).name}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setTerminateTarget(null)}
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
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-base font-bold">Engineer Management</h1>
            <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
              {engineers.length} engineers across {sites.length} sites
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-4">
        {/* Info banner */}
        <div className="bg-violet-950/30 border border-violet-800/40 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <UserPlus className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-300">Managing Engineers</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Create engineer accounts directly from a site&apos;s detail page. 
                Here you can <span className="font-semibold text-white">assign sites</span> or{' '}
                <span className="font-semibold text-red-400">terminate access</span> for any engineer.
              </p>
            </div>
          </div>
        </div>

        {/* Success / Error toasts */}
        {successMsg && (
          <div className="p-3 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Engineers List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
          </div>
        ) : engineers.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
            <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm font-semibold">No engineers yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Create engineers from a site&apos;s detail page.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {engineers.map(eng => {
              const isEditing = editingId === eng.id;
              const joinedDate = new Date(eng.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              });

              return (
                <div
                  key={eng.id}
                  className={`bg-zinc-900 border rounded-2xl p-4 transition-all ${
                    isEditing ? 'border-violet-600/60' : 'border-zinc-800'
                  }`}
                >
                  {/* Engineer info */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-violet-600/15 border border-violet-500/25 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-violet-400">
                        {(eng.full_name || eng.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-white truncate">
                        {eng.full_name || '(No name set)'}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{eng.email}</p>
                    </div>
                    {/* Terminate button */}
                    {!isEditing && (
                      <button
                        onClick={() => setTerminateTarget(eng)}
                        title="Terminate access"
                        className="p-1.5 bg-red-950/40 border border-red-800/40 rounded-lg hover:bg-red-900/50 transition-colors shrink-0"
                      >
                        <ShieldOff className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>

                  {/* Site assignment row */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      {isEditing ? (
                        <select
                          value={selectedSiteId}
                          onChange={e => setSelectedSiteId(e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-zinc-950 border border-violet-600/50 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                        >
                          <option value="">— Unassigned —</option>
                          {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs font-semibold truncate ${
                          eng.sites ? 'text-emerald-400' : 'text-zinc-600 italic'
                        }`}>
                          {eng.sites ? (eng.sites as { name: string }).name : 'Unassigned'}
                        </span>
                      )}
                    </div>

                    {/* Edit / Save / Cancel */}
                    {isEditing ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            assignMutation.mutate({ engineerId: eng.id, siteId: selectedSiteId });
                          }}
                          disabled={assignMutation.isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-500 transition-colors min-h-[32px]"
                        >
                          {assignMutation.isPending
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Save className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(eng.id);
                          setSelectedSiteId(eng.site_id || '');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-colors min-h-[32px]"
                      >
                        <Edit2 className="w-3 h-3" />
                        Assign
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-zinc-700 mt-2">Joined {joinedDate}</p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
