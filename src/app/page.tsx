'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { 
  Loader2, 
  Calendar, 
  MapPin, 
  PlusCircle, 
  CheckSquare, 
  FileSpreadsheet, 
  LogOut, 
  HardHat,
  ChevronRight,
  Download,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface SiteInfo {
  id: string;
  name: string;
  location: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Query engineer session & profile
  const { data: profile, isLoading: isProfileLoading, error: profileQueryError } = useQuery({
    queryKey: ['engineer-profile-dashboard'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        throw new Error('Not authenticated');
      }

      console.log('[Dashboard] Authenticated user:', user.id, user.email);

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          role,
          site_id,
          sites!site_id (
            id,
            name,
            location
          )
        `)
        .eq('id', user.id)
        .single();

      console.log('[Dashboard] Supabase response:', { data, error });

      if (error) throw error;

      if (data.role === 'Admin') {
        console.log('[Dashboard] User is Admin, redirecting to /admin');
        router.push('/admin');
      }

      return data;
    },
    retry: false,
  });

  // Query today's attendance stats for the site
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['attendance-stats', profile?.site_id],
    queryFn: async () => {
      if (!profile?.site_id) return null;
      
      const todayISO = new Date().toISOString().split('T')[0];

      // Fetch all laborers at site
      const { data: workers, error: workerErr } = await supabase
        .from('laborers')
        .select('id')
        .eq('site_id', profile.site_id);
      
      if (workerErr) throw workerErr;

      // Fetch today's attendance
      const { data: attendance, error: attErr } = await supabase
        .from('attendance')
        .select('status')
        .eq('site_id', profile.site_id)
        .eq('date', todayISO);

      if (attErr) throw attErr;

      const total = workers?.length || 0;
      let present = 0;
      let halfDay = 0;
      let absent = 0;

      attendance?.forEach((record) => {
        if (record.status === 'Present') present++;
        else if (record.status === 'Half Day') halfDay++;
        else if (record.status === 'Absent') absent++;
      });

      const unmarked = total - (present + halfDay + absent);

      return { total, present, halfDay, absent, unmarked };
    },
    enabled: !!profile?.site_id,
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleGenerateReport = async () => {
    if (!profile?.site_id) return;
    setReportLoading(true);
    setReportUrl(null);
    setReportError(null);

    try {
      const todayISO = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/reports/daily?date=${todayISO}&site_id=${profile.site_id}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate report');
      }

      if (data.recordsCount === 0) {
        throw new Error('No attendance records have been marked today yet.');
      }

      setReportUrl(data.downloadUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Report generation failed';
      setReportError(msg);
    } finally {
      setReportLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  if (profileQueryError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-4 text-center">
        <p className="text-red-650 font-bold mb-2">Error loading profile data:</p>
        <p className="text-slate-500 max-w-md bg-white border border-slate-200 p-4 rounded-xl text-sm shadow-xs">
          {(profileQueryError as Error).message}
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const siteInfo = profile?.sites as unknown as SiteInfo | null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 z-40 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center border border-emerald-500/10">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight text-slate-900">Attendly Dashboard</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Site Terminal</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center border border-slate-200 cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Body */}
      <main className="max-w-md mx-auto p-4 flex flex-col gap-5">
        {/* Profile/Site Info Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>{today}</span>
            </div>
            
            {siteInfo ? (
              <div className="flex flex-col gap-1 mt-1">
                <h2 className="text-xl font-black text-slate-900">{siteInfo.name}</h2>
                <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{siteInfo.location}</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-800 text-sm font-medium shadow-xs">
                You are not currently assigned to any construction site. Please contact administration.
              </div>
            )}
          </div>
        </div>

        {/* Attendance Stats Summary */}
        {siteInfo && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Today&apos;s Standup</h3>

            {isStatsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Registered Force</span>
                  <span className="text-2xl font-black text-slate-900 mt-1">{stats.total}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-emerald-600 uppercase">Present Today</span>
                  <span className="text-2xl font-black text-emerald-650 mt-1">{stats.present}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-amber-600 uppercase">Half Day</span>
                  <span className="text-2xl font-black text-amber-500 mt-1">{stats.halfDay}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-red-600 uppercase">Absent / Unmarked</span>
                  <span className="text-2xl font-black text-red-650 mt-1">{stats.absent + stats.unmarked}</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-xs">Could not fetch statistics.</p>
            )}
          </div>
        )}

        {/* Quick Action Navigation Grid */}
        {siteInfo && (
          <div className="flex flex-col gap-3">
            {/* Mark Attendance Card */}
            <Link
              href="/attendance"
              className="bg-white border border-slate-200 hover:border-slate-350 hover:scale-[1.01] active:scale-[0.99] transition-all p-5 rounded-3xl flex items-center justify-between group shadow-sm min-h-[84px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                  <CheckSquare className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-slate-900">Mark Attendance</h4>
                  <p className="text-xs text-slate-550 font-medium mt-0.5">Instant search and mark (0ms latency)</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>

            {/* Register Laborer Card */}
            <Link
              href="/register"
              className="bg-white border border-slate-200 hover:border-slate-350 hover:scale-[1.01] active:scale-[0.99] transition-all p-5 rounded-3xl flex items-center justify-between group shadow-sm min-h-[84px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                  <PlusCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-slate-900">Add Laborer</h4>
                  <p className="text-xs text-slate-550 font-medium mt-0.5">Camera integration & image compression</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>

            {/* Generate CSV Card */}
            {reportError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{reportError}</span>
              </div>
            )}

            {reportUrl ? (
              <div className="bg-emerald-600 p-5 rounded-3xl flex items-center justify-between shadow-lg shadow-emerald-600/10 min-h-[84px]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">Report is Ready</h4>
                    <div className="flex items-center gap-3 mt-0.5">
                      <a
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white underline font-bold hover:text-emerald-100"
                      >
                        Download CSV
                      </a>
                      <span className="text-[10px] text-emerald-250">•</span>
                      <button
                        onClick={() => {
                          setReportUrl(null);
                          setReportError(null);
                        }}
                        className="text-xs text-emerald-100 hover:text-white font-medium underline cursor-pointer"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerateReport}
                disabled={reportLoading}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700 disabled:opacity-85 hover:scale-[1.01] active:scale-[0.99] transition-all p-5 rounded-3xl flex items-center justify-between group shadow-lg shadow-emerald-600/15 min-h-[84px] text-left w-full cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    {reportLoading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">
                      {reportLoading ? 'Generating CSV...' : 'Generate Today\'s CSV'}
                    </h4>
                    <p className="text-xs text-emerald-100 font-medium mt-0.5">
                      {reportLoading ? 'Compiling attendance records...' : 'Compile and save report to Supabase'}
                    </p>
                  </div>
                </div>
                {!reportLoading && (
                  <ChevronRight className="w-6 h-6 text-emerald-100 group-hover:translate-x-1 transition-transform shrink-0" />
                )}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
