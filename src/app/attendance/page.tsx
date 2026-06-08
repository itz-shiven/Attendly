'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import AttendanceSearch from '@/components/AttendanceSearch';
import { Loader2, ArrowLeft, PlusCircle, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

export default function AttendancePage() {
  const router = useRouter();
  const supabase = createClient();

  // Fetch engineer profile
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['engineer-profile-attendance'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        throw new Error('Not authenticated');
      }

      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          site_id,
          sites!site_id (
            id,
            name,
            location
          )
        `)
        .eq('id', user.id)
        .single();

      if (profileErr) throw profileErr;
      if (!data?.site_id) {
        throw new Error('You are not currently assigned to any active construction site.');
      }
      return data;
    },
    retry: false
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
        <p className="text-slate-550">Loading attendance register...</p>
      </div>
    );
  }

  if (error || !profile?.site_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-sm shadow-xs">
          <h2 className="text-red-650 font-bold text-lg mb-2">Access Error</h2>
          <p className="text-slate-650 text-sm mb-6">
            {error?.message || 'You must be assigned to a construction site to manage attendance.'}
          </p>
          <Link
            href="/login"
            className="block w-full py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 border border-slate-200 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const siteInfo = profile.sites as { name: string; location: string | null } | null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 z-40 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
              <ArrowLeft className="w-6 h-6 text-slate-650" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Mark Attendance</h1>
              <p className="text-xs text-emerald-600 font-semibold truncate max-w-[180px] sm:max-w-xs">
                Site: {siteInfo?.name || 'Unassigned'}
              </p>
            </div>
          </div>
          
          <Link
            href="/register"
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-all min-h-[38px]"
          >
            <PlusCircle className="w-4 h-4 text-emerald-650" />
            <span>Add Laborer</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4 flex flex-col gap-4">
        {/* Attendance Search UI */}
        <AttendanceSearch siteId={profile.site_id} userId={profile.id} />
      </main>

      {/* Mobile Sticky Footer Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-6 flex justify-around items-center z-40 max-w-md mx-auto rounded-t-2xl shadow-md">
        <Link href="/" className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-900 transition-colors">
          <LayoutDashboard className="w-5 h-5 text-slate-500 hover:text-slate-900" />
          <span className="text-[10px] font-semibold">Dashboard</span>
        </Link>
        <Link href="/register" className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-900 transition-colors">
          <PlusCircle className="w-5 h-5 text-slate-500 hover:text-slate-900" />
          <span className="text-[10px] font-semibold">Add Laborer</span>
        </Link>
      </nav>
    </div>
  );
}
