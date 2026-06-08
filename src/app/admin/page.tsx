'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  Building2, Users, FileSpreadsheet,
  LogOut, HardHat, PlusCircle, ChevronRight,
  MapPin, Loader2
} from 'lucide-react';
import Link from 'next/link';

interface SiteStats {
  id: string;
  name: string;
  location: string | null;
  totalWorkers: number;
  present: number;
  absent: number;
  halfDay: number;
  unmarked: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showNewSite, setShowNewSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteLocation, setNewSiteLocation] = useState('');
  const [creating, setCreating] = useState(false);

  const todayISO = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
  });

  // Fetch admin profile
  const { data: profile } = useQuery({
    queryKey: ['admin-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); throw new Error('Not authenticated'); }
      const { data, error } = await supabase
        .from('profiles').select('id, email, full_name, role').eq('id', user.id).single();
      if (error) throw error;
      if (data.role !== 'Admin') { router.push('/'); throw new Error('Not admin'); }
      return data;
    },
    retry: false,
  });

  // Fetch all sites with today's stats
  const { data: siteStats = [], isLoading } = useQuery({
    queryKey: ['admin-site-stats', todayISO],
    queryFn: async () => {
      const { data: sites, error: sitesErr } = await supabase
        .from('sites').select('id, name, location').order('name');
      if (sitesErr) throw sitesErr;

      const statsPromises = (sites || []).map(async (site) => {
        const [{ count: totalWorkers }, { data: att }] = await Promise.all([
          supabase.from('laborers').select('*', { count: 'exact', head: true }).eq('site_id', site.id),
          supabase.from('attendance').select('status').eq('site_id', site.id).eq('date', todayISO),
        ]);

        let present = 0, absent = 0, halfDay = 0;
        (att || []).forEach(r => {
          if (r.status === 'Present') present++;
          else if (r.status === 'Absent') absent++;
          else if (r.status === 'Half Day') halfDay++;
        });
        const total = totalWorkers || 0;
        return {
          ...site,
          totalWorkers: total,
          present,
          absent,
          halfDay,
          unmarked: total - present - absent - halfDay,
        } as SiteStats;
      });

      return Promise.all(statsPromises);
    },
    enabled: !!profile,
  });

  const totalWorkers = siteStats.reduce((a, s) => a + s.totalWorkers, 0);
  const totalPresent = siteStats.reduce((a, s) => a + s.present, 0);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    router.push('/login');
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    setCreating(true);
    const { data: newSite, error } = await supabase.from('sites').insert({
      name: newSiteName.trim(),
      location: newSiteLocation.trim() || null,
    }).select('id').single();

    if (!error && newSite) {
      setNewSiteName('');
      setNewSiteLocation('');
      setShowNewSite(false);
      queryClient.invalidateQueries({ queryKey: ['admin-site-stats'] });
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center border border-violet-500/30">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Admin Command Centre</h1>
            <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
              {profile?.full_name || profile?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/engineers"
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 transition-colors"
            title="Manage Engineers"
          >
            <Users className="w-4 h-4 text-violet-400" />
          </Link>
          <button
            onClick={handleSignOut}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-5">
        {/* Date + Global Stats Strip */}
        <div className="bg-gradient-to-br from-violet-950/60 to-zinc-900 border border-violet-800/40 rounded-3xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl" />
          <p className="text-xs text-zinc-400 font-semibold mb-3">{todayLabel}</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">Sites</span>
              <span className="text-2xl font-black text-white">{siteStats.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">Total Force</span>
              <span className="text-2xl font-black text-white">{totalWorkers}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-emerald-500 uppercase font-semibold tracking-wider">Present</span>
              <span className="text-2xl font-black text-emerald-400">{totalPresent}</span>
            </div>
          </div>
          {totalWorkers > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                <span>Attendance Rate</span>
                <span className="text-emerald-400 font-bold">{Math.round((totalPresent / totalWorkers) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${Math.round((totalPresent / totalWorkers) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-500" />
            Construction Sites
          </h2>
          <button
            onClick={() => setShowNewSite(!showNewSite)}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-bold rounded-xl hover:bg-violet-600/30 transition-all min-h-[36px]"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New Site
          </button>
        </div>

        {/* Create Site Form */}
        {showNewSite && (
          <form
            onSubmit={handleCreateSite}
            className="bg-zinc-900 border border-violet-800/40 rounded-2xl p-4 flex flex-col gap-3"
          >
            <h3 className="text-sm font-bold text-violet-300">Create New Site</h3>
            <input
              type="text"
              required
              placeholder="Site name (e.g. Tower B, Block 4)"
              value={newSiteName}
              onChange={e => setNewSiteName(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-violet-500 focus:outline-none text-white text-sm min-h-[44px] placeholder-zinc-600"
            />
            <input
              type="text"
              placeholder="Location (optional)"
              value={newSiteLocation}
              onChange={e => setNewSiteLocation(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-violet-500 focus:outline-none text-white text-sm min-h-[44px] placeholder-zinc-600"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewSite(false)}
                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 font-semibold rounded-xl text-sm hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Site'}
              </button>
            </div>
          </form>
        )}

        {/* Site Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
          </div>
        ) : siteStats.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
            <Building2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No sites yet. Create your first site above.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {siteStats.map(site => {
              const attendanceRate = site.totalWorkers > 0
                ? Math.round((site.present / site.totalWorkers) * 100)
                : 0;

              return (
                <Link
                  key={site.id}
                  href={`/admin/sites/${site.id}`}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-3xl p-4 transition-all hover:scale-[1.005] active:scale-[0.998] group shadow-md"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-white truncate leading-tight">{site.name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
                        <span className="text-xs text-zinc-500 truncate">{site.location || 'No location'}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500 font-semibold">Total</p>
                      <p className="text-base font-black text-zinc-300">{site.totalWorkers}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-emerald-600 font-semibold">Present</p>
                      <p className="text-base font-black text-emerald-400">{site.present}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-yellow-600 font-semibold">Half Day</p>
                      <p className="text-base font-black text-yellow-400">{site.halfDay}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-red-600 font-semibold">Absent</p>
                      <p className="text-base font-black text-red-400">{site.absent + site.unmarked}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${attendanceRate}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1 text-right">{attendanceRate}% attendance</p>
                </Link>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/admin/engineers"
            className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-all group min-h-[72px]"
          >
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700">
              <Users className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Engineers</p>
              <p className="text-[10px] text-zinc-500">Manage team</p>
            </div>
          </Link>

          <Link
            href={`/api/reports/daily?date=${todayISO}`}
            target="_blank"
            className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-all group min-h-[72px]"
          >
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Export CSV</p>
              <p className="text-[10px] text-zinc-500">All sites today</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
