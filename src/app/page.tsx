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
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-zinc-400">Loading dashboard...</p>
      </div>
    );
  }

  if (profileQueryError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4 text-center">
        <p className="text-red-500 font-bold mb-2">Error loading profile data:</p>
        <p className="text-zinc-400 max-w-md bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-sm">
          {(profileQueryError as Error).message}
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const siteInfo = profile?.sites as unknown as SiteInfo | null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-12">
      {/* Header */}
      <header className="sticky top-0 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-4 py-4 z-45 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center border border-emerald-500/20">
            <HardHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Attendly Dashboard</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Site Terminal</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center border border-zinc-700"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Body */}
      <main className="max-w-md mx-auto p-4 flex flex-col gap-5">
        {/* Profile/Site Info Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
              <Calendar className="w-4 h-4 text-emerald-500" />
              <span>{today}</span>
            </div>
            
            {siteInfo ? (
              <div className="flex flex-col gap-1 mt-1">
                <h2 className="text-xl font-black text-white">{siteInfo.name}</h2>
                <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
                  <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span className="truncate">{siteInfo.location}</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-950/20 border border-amber-800/60 p-4 rounded-2xl text-amber-300 text-sm font-medium">
                You are not currently assigned to any construction site. Please contact administration.
              </div>
            )}
          </div>
        </div>

        {/* Attendance Stats Summary */}
        {siteInfo && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider">Today&apos;s Standup</h3>

            {isStatsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase">Registered Force</span>
                  <span className="text-2xl font-black text-white mt-1">{stats.total}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-emerald-500 uppercase">Present Today</span>
                  <span className="text-2xl font-black text-emerald-400 mt-1">{stats.present}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-yellow-500 uppercase">Half Day</span>
                  <span className="text-2xl font-black text-yellow-400 mt-1">{stats.halfDay}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col">
                  <span className="text-[11px] font-semibold text-red-500 uppercase">Absent / Unmarked</span>
                  <span className="text-2xl font-black text-red-400 mt-1">{stats.absent + stats.unmarked}</span>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-xs">Could not fetch statistics.</p>
            )}
          </div>
        )}

        {/* Quick Action Navigation Grid */}
        {siteInfo && (
          <div className="flex flex-col gap-3">
            {/* Mark Attendance Card */}
            <Link
              href="/attendance"
              className="bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:scale-[0.99] transition-all p-5 rounded-3xl flex items-center justify-between group shadow-lg shadow-emerald-950/20 min-h-[84px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                  <CheckSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">Mark Attendance</h4>
                  <p className="text-xs text-emerald-100 font-medium mt-0.5">Instant search and mark (0ms latency)</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-emerald-100 group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>

            {/* Register Laborer Card */}
            <Link
              href="/register"
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:scale-[1.01] active:scale-[0.99] transition-all p-5 rounded-3xl flex items-center justify-between group shadow-md min-h-[84px]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700">
                  <PlusCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">Add Laborer</h4>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">Camera integration & image compression</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-zinc-400 group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>
          </div>
        )}

        {/* Report Section */}
        {siteInfo && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
              <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider">Reports Terminal</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Compile and save the day&apos;s attendance as a CSV document in Supabase Storage. A public link will be generated for download.
            </p>

            {reportError && (
              <div className="p-3 bg-red-950/40 border border-red-800 text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reportError}</span>
              </div>
            )}

            {reportUrl && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-semibold flex flex-col gap-2">
                <span>Report ready for download!</span>
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs min-h-[36px] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Report
                </a>
              </div>
            )}

            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="w-full py-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 disabled:bg-zinc-850 disabled:text-zinc-600 text-white font-bold rounded-xl text-sm min-h-[44px] transition-all flex items-center justify-center gap-2"
            >
              {reportLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  Generating CSV...
                </>
              ) : (
                'Generate Today&apos;s CSV'
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
