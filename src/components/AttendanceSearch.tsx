'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database, AttendanceStatus } from '@/lib/db.types';
import { maskAadhaar } from '@/lib/utils';
import { Search, Check, AlertCircle, RefreshCcw, Wifi } from 'lucide-react';
import Link from 'next/link';

type Laborer = Database['public']['Tables']['laborers']['Row'];
type Attendance = Database['public']['Tables']['attendance']['Row'];

interface AttendanceSearchProps {
  siteId: string;
  userId: string;
}

export default function AttendanceSearch({ siteId, userId }: AttendanceSearchProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unmarked' | 'Present' | 'Absent' | 'Half Day'>('all');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!e.target.value.trim()) {
      setHasSearched(false);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      setHasSearched(true);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setHasSearched(false);
  };

  const today = useMemo(() => {
    const d = new Date();
    // Format YYYY-MM-DD in local time zone
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - offset * 60 * 1000);
    return localDate.toISOString().split('T')[0];
  }, []);

  // Fetch laborers for this site
  const { data: laborers = [], isLoading: isLoadingLaborers } = useQuery({
    queryKey: ['laborers', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('laborers')
        .select('*')
        .eq('site_id', siteId)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Laborer[];
    }
  });

  // Fetch today's attendance for this site
  const { data: attendanceMap = {}, isLoading: isLoadingAttendance } = useQuery({
    queryKey: ['attendance', siteId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('site_id', siteId)
        .eq('date', today);
      if (error) throw error;

      // Convert array to a hash map for O(1) lookups
      const map: Record<string, Attendance> = {};
      data.forEach((record) => {
        map[record.laborer_id] = record as Attendance;
      });
      return map;
    }
  });

  // Mutation to mark attendance (optimistic)
  const attendanceMutation = useMutation({
    mutationFn: async ({ laborerId, status }: { laborerId: string; status: AttendanceStatus }) => {
      const { data, error } = await supabase
        .from('attendance')
        .upsert({
          date: today,
          laborer_id: laborerId,
          status,
          marked_by: userId,
          site_id: siteId,
          marked_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    // Optimistic Update
    onMutate: async ({ laborerId, status }) => {
      setSyncError(null);
      
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['attendance', siteId, today] });

      // Snapshot the previous attendance map
      const previousAttendance = queryClient.getQueryData<Record<string, Attendance>>(['attendance', siteId, today]) || {};

      // Optimistically update the cache
      const updatedAttendance = { ...previousAttendance };
      updatedAttendance[laborerId] = {
        date: today,
        laborer_id: laborerId,
        status,
        marked_by: userId,
        marked_at: new Date().toISOString(),
        site_id: siteId
      };

      queryClient.setQueryData(['attendance', siteId, today], updatedAttendance);

      // Return context with previous values for rollback
      return { previousAttendance };
    },
    onError: (err: Error, variables, context) => {
      console.error('Attendance sync error:', err);
      setSyncError(`Failed to sync: ${err.message || 'Connection lost'}. Auto-retrying...`);
      // Rollback cache to the snapshot state
      if (context?.previousAttendance) {
        queryClient.setQueryData(['attendance', siteId, today], context.previousAttendance);
      }
    },
    onSuccess: () => {
      // Keep cache updated, optionally invalidate to confirm server state
      // queryClient.invalidateQueries({ queryKey: ['attendance', siteId, today] });
    }
  });

  // One-tap mark present handler
  const handleMarkPresent = (laborerId: string) => {
    const currentRecord = attendanceMap[laborerId];
    // If already present, do nothing on simple click, or let them toggle
    if (currentRecord?.status === 'Present') return;

    attendanceMutation.mutate({ laborerId, status: 'Present' });
  };

  // Change status to specific value (Present, Absent, Half Day)
  const handleStatusChange = (laborerId: string, status: AttendanceStatus) => {
    attendanceMutation.mutate({ laborerId, status });
  };

  // In-memory instant filtering
  const filteredLaborers = useMemo(() => {
    let list = laborers;

    // Search query filter (Name, Mobile, last 4 digits of Aadhaar/ID)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace(/\s/g, '');
      list = list.filter((lab) => {
        const nameClean = lab.name.toLowerCase().replace(/\s/g, '');
        const mobileClean = lab.mobile.replace(/\s/g, '');
        const aadhaarClean = lab.aadhaar;
        const idClean = lab.id.toLowerCase();
        
        return (
          nameClean.includes(q) ||
          mobileClean.includes(q) ||
          aadhaarClean.includes(q) ||
          idClean.includes(q)
        );
      });
    }

    // Status filter
    if (filterStatus !== 'all') {
      list = list.filter((lab) => {
        const record = attendanceMap[lab.id];
        if (filterStatus === 'unmarked') {
          return !record;
        } else {
          return record?.status === filterStatus;
        }
      });
    }

    return list;
  }, [laborers, attendanceMap, searchQuery, filterStatus]);

  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let unmarked = 0;

    laborers.forEach((lab) => {
      const record = attendanceMap[lab.id];
      if (!record) {
        unmarked++;
      } else if (record.status === 'Present') {
        present++;
      } else if (record.status === 'Absent') {
        absent++;
      } else if (record.status === 'Half Day') {
        halfDay++;
      }
    });

    return { total: laborers.length, present, absent, halfDay, unmarked };
  }, [laborers, attendanceMap]);

  if (isLoadingLaborers || isLoadingAttendance) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <RefreshCcw className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
        <p className="text-sm text-slate-550">Loading worker directory...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Network Sync Indicator */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          {attendanceMutation.isPending ? (
            <>
              <RefreshCcw className="w-4 h-4 animate-spin text-amber-500" />
              <span className="text-xs text-amber-600 font-semibold">Syncing in background...</span>
            </>
          ) : syncError ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-xs text-red-650 font-semibold truncate max-w-[200px]">{syncError}</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-emerald-600 font-semibold">Offline-ready / Cloud Synced</span>
            </>
          )}
        </div>
        <span className="text-xs text-slate-650 font-bold bg-slate-100 px-2.5 py-1 rounded-md">
          Date: {today}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'all' ? 'bg-slate-200 border-slate-300 text-slate-900 font-bold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] sm:text-xs text-slate-500 font-semibold">Total</span>
          <span className="text-base sm:text-lg font-bold">{stats.total}</span>
        </button>
        <button
          onClick={() => setFilterStatus('Present')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'Present' ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] sm:text-xs text-emerald-600 font-semibold">Present</span>
          <span className="text-base sm:text-lg font-bold">{stats.present}</span>
        </button>
        <button
          onClick={() => setFilterStatus('unmarked')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'unmarked' ? 'bg-slate-200 border-slate-300 text-slate-900 font-bold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] sm:text-xs text-slate-550 font-semibold">Pending</span>
          <span className="text-base sm:text-lg font-bold">{stats.unmarked}</span>
        </button>
        <button
          onClick={() => setFilterStatus('Absent')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer ${
            filterStatus === 'Absent' ? 'bg-red-100 border-red-300 text-red-800 font-bold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span className="text-[10px] sm:text-xs text-red-600 font-semibold">Absent</span>
          <span className="text-base sm:text-lg font-bold">{stats.absent + stats.halfDay}</span>
        </button>
      </div>

      {/* Search Input Box */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearchSubmit();
            }
          }}
          placeholder="Search by Name, Mobile, Aadhaar..."
          className={`w-full pl-12 py-3.5 bg-white border border-slate-200 rounded-2xl focus:border-emerald-500 focus:outline-none text-slate-900 text-base min-h-[48px] placeholder-slate-400 transition-colors shadow-xs ${
            searchQuery ? (hasSearched && filteredLaborers.length === 0 ? 'pr-[170px]' : 'pr-[130px]') : 'pr-[80px]'
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl text-slate-500 min-h-[32px] flex items-center justify-center cursor-pointer select-none border border-slate-200"
            >
              Clear
            </button>
          )}
          {hasSearched && filteredLaborers.length === 0 && searchQuery.trim() ? (
            <Link
              href={`/register?site=${siteId}&name=${encodeURIComponent(searchQuery.trim())}`}
              className="text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-3 py-1.5 rounded-xl transition-all shadow-md min-h-[32px] flex items-center justify-center"
            >
              Create Profile
            </Link>
          ) : (
            <button
              onClick={handleSearchSubmit}
              className="text-xs font-bold bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl transition-all shadow-xs min-h-[32px] flex items-center justify-center cursor-pointer select-none"
            >
              Search
            </button>
          )}
        </div>
      </div>

      {/* Laborer Directory List */}
      <div className="flex flex-col gap-3">
        {filteredLaborers.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-slate-500">No laborers found matching filters.</p>
            {searchQuery.trim() && (
              <Link
                href={`/register?site=${siteId}&name=${encodeURIComponent(searchQuery.trim())}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md mt-1"
              >
                Register &quot;{searchQuery.trim()}&quot;
              </Link>
            )}
          </div>
        ) : (
          filteredLaborers.map((worker) => {
            const record = attendanceMap[worker.id];
            const status = record?.status;

            return (
              <div
                key={worker.id}
                onClick={() => handleMarkPresent(worker.id)}
                className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer select-none flex items-center justify-between min-h-[72px] ${
                  status === 'Present'
                    ? 'bg-emerald-50 border-emerald-250 shadow-xs'
                    : status === 'Absent'
                    ? 'bg-red-50 border-red-200'
                    : status === 'Half Day'
                    ? 'bg-amber-50 border-amber-250'
                    : 'bg-white border-slate-200 hover:border-slate-350 shadow-xs'
                }`}
              >
                {/* Photo & Name Info */}
                <div className="flex items-center gap-3 min-w-0">
                  {worker.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={worker.photo_url}
                      alt={worker.name}
                      className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-200 bg-slate-100"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 font-bold text-slate-500 text-sm">
                      {worker.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate text-slate-900 leading-tight">
                      {worker.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      {worker.trade} • {worker.mobile}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      UID: {maskAadhaar(worker.aadhaar)}
                    </p>
                  </div>
                </div>

                {/* Instant Action Controls */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Status Selection Buttons */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Present')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all cursor-pointer ${
                        status === 'Present'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'text-emerald-600 hover:bg-slate-200/50'
                      }`}
                      title="Present"
                    >
                      P
                    </button>
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Half Day')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all cursor-pointer ${
                        status === 'Half Day'
                          ? 'bg-amber-500 text-white shadow-md'
                          : 'text-amber-500 hover:bg-slate-200/50'
                      }`}
                      title="Half Day"
                    >
                      H
                    </button>
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Absent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all cursor-pointer ${
                        status === 'Absent'
                          ? 'bg-red-600 text-white shadow-md'
                          : 'text-red-500 hover:bg-slate-200/50'
                      }`}
                      title="Absent"
                    >
                      A
                    </button>
                  </div>

                  {/* Sync status checkmark */}
                  {status === 'Present' && (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200 shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
