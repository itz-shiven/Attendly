'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database, AttendanceStatus } from '@/lib/db.types';
import { maskAadhaar } from '@/lib/utils';
import { Search, Check, AlertCircle, RefreshCcw, Wifi } from 'lucide-react';

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
        <RefreshCcw className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-sm text-zinc-400">Loading worker directory...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Network Sync Indicator */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center gap-2">
          {attendanceMutation.isPending ? (
            <>
              <RefreshCcw className="w-4 h-4 animate-spin text-yellow-500" />
              <span className="text-xs text-yellow-500 font-semibold">Syncing in background...</span>
            </>
          ) : syncError ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-xs text-red-400 font-semibold truncate max-w-[200px]">{syncError}</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-emerald-500 font-semibold">Offline-ready / Cloud Synced</span>
            </>
          )}
        </div>
        <span className="text-xs text-zinc-400 font-bold bg-zinc-800 px-2.5 py-1 rounded-md">
          Date: {today}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
            filterStatus === 'all' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-900/40 border-zinc-850'
          }`}
        >
          <span className="text-xs text-zinc-400 font-semibold">Total</span>
          <span className="text-lg font-bold">{stats.total}</span>
        </button>
        <button
          onClick={() => setFilterStatus('Present')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
            filterStatus === 'Present' ? 'bg-emerald-950/30 border-emerald-800 text-emerald-400' : 'bg-zinc-900/40 border-zinc-850'
          }`}
        >
          <span className="text-xs text-emerald-500/80 font-semibold">Present</span>
          <span className="text-lg font-bold">{stats.present}</span>
        </button>
        <button
          onClick={() => setFilterStatus('unmarked')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
            filterStatus === 'unmarked' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-900/40 border-zinc-850'
          }`}
        >
          <span className="text-xs text-zinc-400 font-semibold">Pending</span>
          <span className="text-lg font-bold">{stats.unmarked}</span>
        </button>
        <button
          onClick={() => setFilterStatus('Absent')}
          className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
            filterStatus === 'Absent' ? 'bg-red-950/30 border-red-900/70 text-red-400' : 'bg-zinc-900/40 border-zinc-850'
          }`}
        >
          <span className="text-xs text-red-500/80 font-semibold">Absent</span>
          <span className="text-lg font-bold">{stats.absent + stats.halfDay}</span>
        </button>
      </div>

      {/* Search Input Box */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Name, Mobile, Aadhaar..."
          className="w-full pl-12 pr-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] placeholder-zinc-500 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Laborer Directory List */}
      <div className="flex flex-col gap-3">
        {filteredLaborers.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/20 border border-dashed border-zinc-850 rounded-2xl">
            <p className="text-sm text-zinc-500">No laborers found matching filters.</p>
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
                    ? 'bg-emerald-950/20 border-emerald-800/80 shadow-md shadow-emerald-950/10'
                    : status === 'Absent'
                    ? 'bg-red-950/20 border-red-900/60'
                    : status === 'Half Day'
                    ? 'bg-yellow-950/10 border-yellow-900/40'
                    : 'bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {/* Photo & Name Info */}
                <div className="flex items-center gap-3 min-w-0">
                  {worker.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={worker.photo_url}
                      alt={worker.name}
                      className="w-12 h-12 rounded-full object-cover shrink-0 border border-zinc-800 bg-zinc-800"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-750 font-bold text-zinc-400 text-sm">
                      {worker.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate text-white leading-tight">
                      {worker.name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">
                      {worker.trade} • {worker.mobile}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      UID: {maskAadhaar(worker.aadhaar)}
                    </p>
                  </div>
                </div>

                {/* Instant Action Controls */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Status Selection Buttons */}
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Present')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all ${
                        status === 'Present'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'text-emerald-500/80 hover:bg-zinc-900'
                      }`}
                      title="Present"
                    >
                      P
                    </button>
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Half Day')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all ${
                        status === 'Half Day'
                          ? 'bg-yellow-600 text-white shadow-md'
                          : 'text-yellow-500/80 hover:bg-zinc-900'
                      }`}
                      title="Half Day"
                    >
                      H
                    </button>
                    <button
                      onClick={() => handleStatusChange(worker.id, 'Absent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold min-h-[38px] transition-all ${
                        status === 'Absent'
                          ? 'bg-red-600 text-white shadow-md'
                          : 'text-red-500/80 hover:bg-zinc-900'
                      }`}
                      title="Absent"
                    >
                      A
                    </button>
                  </div>

                  {/* Sync status checkmark */}
                  {status === 'Present' && (
                    <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center border border-emerald-500/30 shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
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
