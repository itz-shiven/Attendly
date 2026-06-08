'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  Building2, Users, FileSpreadsheet,
  LogOut, HardHat, PlusCircle, ChevronRight,
  MapPin, Loader2, Download, AlertCircle
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
  const [showCsvPicker, setShowCsvPicker] = useState(false);
  const [reportLoading, setReportLoading] = useState<string | null>(null); // siteId or 'all'
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSiteLabel, setReportSiteLabel] = useState<string>('');

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

  const handleGenerateReport = async (siteId: string | null, siteLabel: string) => {
    setShowCsvPicker(false);
    setReportLoading(siteId || 'all');
    setReportUrl(null);
    setReportError(null);
    setReportSiteLabel(siteLabel);
    try {
      const todayISO = new Date().toISOString().split('T')[0];
      const url = siteId
        ? `/api/reports/daily?date=${todayISO}&site_id=${siteId}`
        : `/api/reports/daily?date=${todayISO}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to generate report');
      if (data.recordsCount === 0) throw new Error('No attendance records found for this site today.');
      setReportUrl(data.downloadUrl);
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setReportLoading(null);
    }
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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-lg flex items-center justify-center border border-violet-500/10">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-slate-900">Admin Command Centre</h1>
            <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wider">
              {profile?.full_name || profile?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/engineers"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Manage Engineers"
          >
            <Users className="w-4 h-4 text-violet-600" />
          </Link>
          <button
            onClick={handleSignOut}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-5">
        {/* Date + Global Stats Strip */}
        <div className="bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-3xl p-5 shadow-xs relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl" />
          <p className="text-xs text-slate-500 font-semibold mb-3">{todayLabel}</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Sites</span>
              <span className="text-2xl font-black text-slate-900">{siteStats.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Total Force</span>
              <span className="text-2xl font-black text-slate-900">{totalWorkers}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-emerald-650 uppercase font-semibold tracking-wider">Present</span>
              <span className="text-2xl font-black text-emerald-600">{totalPresent}</span>
            </div>
          </div>
          {totalWorkers > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Attendance Rate</span>
                <span className="text-emerald-600 font-bold">{Math.round((totalPresent / totalWorkers) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-600" />
            Construction Sites
          </h2>
          <button
            onClick={() => setShowNewSite(!showNewSite)}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 text-violet-755 text-xs font-bold rounded-xl hover:bg-violet-100 transition-all min-h-[36px] cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-violet-600" />
            New Site
          </button>
        </div>

        {/* Create Site Form */}
        {showNewSite && (
          <form
            onSubmit={handleCreateSite}
            className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-xs"
          >
            <h3 className="text-sm font-bold text-violet-755">Create New Site</h3>
            <input
              type="text"
              required
              placeholder="Site name (e.g. Tower B, Block 4)"
              value={newSiteName}
              onChange={e => setNewSiteName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-violet-500 focus:outline-none text-slate-900 text-sm min-h-[44px] placeholder-slate-400"
            />
            <input
              type="text"
              placeholder="Location (optional)"
              value={newSiteLocation}
              onChange={e => setNewSiteLocation(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-violet-500 focus:outline-none text-slate-900 text-sm min-h-[44px] placeholder-slate-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewSite(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm hover:bg-violet-500 transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
          <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-3xl shadow-xs">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-450 text-sm">No sites yet. Create your first site above.</p>
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
                  className="bg-white border border-slate-200 hover:border-slate-350 rounded-3xl p-4 transition-all hover:scale-[1.005] active:scale-[0.998] group shadow-xs"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-slate-900 truncate leading-tight">{site.name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500 truncate">{site.location || 'No location'}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-650 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 font-semibold">Total</p>
                      <p className="text-base font-black text-slate-755">{site.totalWorkers}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-emerald-600 font-semibold">Present</p>
                      <p className="text-base font-black text-emerald-650">{site.present}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600 font-semibold">Half Day</p>
                      <p className="text-base font-black text-amber-500">{site.halfDay}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-red-655 font-semibold">Absent</p>
                      <p className="text-base font-black text-red-600">{site.absent + site.unmarked}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${attendanceRate}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{attendanceRate}% attendance</p>
                </Link>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/admin/engineers"
            className="flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl transition-all group min-h-[72px]"
          >
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
              <Users className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Engineers</p>
              <p className="text-[10px] text-slate-500">Manage team</p>
            </div>
          </Link>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setShowCsvPicker(true); setReportUrl(null); setReportError(null); }}
              disabled={!!reportLoading}
              className="flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-60 rounded-2xl transition-all group min-h-[72px] w-full text-left cursor-pointer"
            >
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 shrink-0">
                {reportLoading
                  ? <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                  : <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Export CSV</p>
                <p className="text-[10px] text-slate-500">
                  {reportLoading ? `Generating for ${reportSiteLabel}...` : 'Choose a site'}
                </p>
              </div>
            </button>
            {reportError && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-750 rounded-xl text-xs font-semibold">
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
                Download — {reportSiteLabel}
              </a>
            )}
          </div>
        </div>
      </main>

      {/* Site Picker Modal */}
      {showCsvPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 w-full max-w-sm shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Generate CSV Report</h3>
              </div>
              <button
                onClick={() => setShowCsvPicker(false)}
                className="text-slate-400 hover:text-slate-650 text-xl leading-none transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">Select which site to generate today&apos;s attendance report for.</p>

            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {/* All Sites option */}
              <button
                onClick={() => handleGenerateReport(null, 'All Sites')}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-2xl transition-all text-left group cursor-pointer"
              >
                <div className="w-8 h-8 bg-violet-50 border border-violet-100 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-violet-650" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-805">All Sites</p>
                  <p className="text-[10px] text-slate-500">Consolidated report for all sites</p>
                </div>
              </button>

              {/* Individual sites */}
              {siteStats.map(site => (
                <button
                  key={site.id}
                  onClick={() => handleGenerateReport(site.id, site.name)}
                  className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all text-left group cursor-pointer"
                >
                  <div className="w-8 h-8 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-805 truncate">{site.name}</p>
                    <p className="text-[10px] text-slate-500">{site.present} present · {site.totalWorkers} total</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
