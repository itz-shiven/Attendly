'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { compressImage, formatAadhaar, formatPan, maskAadhaar, maskPan } from '@/lib/utils';
import CameraCapture from '@/components/CameraCapture';
import { User, Phone, CreditCard, Shield, Camera, Upload, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const TRADES = ['Helper', 'Mason', 'Carpenter', 'Plumber', 'Electrician', 'Painter', 'Welder', 'Other'] as const;

interface SiteInfo {
  id: string;
  name: string;
  location: string | null;
}

function RegisterLaborPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySiteId = searchParams.get('site');
  const queryName = searchParams.get('name') || '';
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Form states
  const [name, setName] = useState(queryName);
  const [mobile, setMobile] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [trade, setTrade] = useState<typeof TRADES[number]>('Helper');
  
  // Camera & Image states
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [originalSizeKB, setOriginalSizeKB] = useState<number | null>(null);
  const [compressedSizeKB, setCompressedSizeKB] = useState<number | null>(null);

  // Focus states for masking in UI
  const [aadhaarFocused, setAadhaarFocused] = useState(false);
  const [panFocused, setPanFocused] = useState(false);

  // Status states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch engineer's profile or resolve admin site query parameter
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useQuery({
    queryKey: ['engineer-profile', querySiteId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        throw new Error('Not authenticated');
      }

      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id, email, role, site_id')
        .eq('id', user.id)
        .single();

      if (profileErr) throw profileErr;

      const targetSiteId = querySiteId || profileData.site_id;

      if (!targetSiteId) {
        throw new Error('No construction site was specified or assigned.');
      }

      // Fetch site details for the target site
      const { data: siteData, error: siteErr } = await supabase
        .from('sites')
        .select('id, name, location')
        .eq('id', targetSiteId)
        .single();

      if (siteErr) throw siteErr;

      return {
        ...profileData,
        site_id: targetSiteId,
        sites: siteData
      };
    },
    retry: false
  });

  // Handle local image uploads (fallback)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOriginalSizeKB(Math.round(file.size / 1024));
    try {
      const compressed = await compressImage(file, 800, 0.7);
      setPhotoBlob(compressed);
      setCompressedSizeKB(Math.round(compressed.size / 1024));
      
      const url = URL.createObjectURL(compressed);
      setPhotoPreview(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Image compression failed';
      setErrorMessage(msg);
    }
  };

  // Handle captured photo from camera component
  const handleCameraCapture = async (blob: Blob) => {
    // Treat camera capture as original, compressed size is the same since it's already captured at compressed resolution
    setOriginalSizeKB(null);
    setPhotoBlob(blob);
    setCompressedSizeKB(Math.round(blob.size / 1024));
    
    const url = URL.createObjectURL(blob);
    setPhotoPreview(url);
    setShowCamera(false);
  };

  // Form submission mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.site_id) throw new Error('Site ID is missing');
      if (!name.trim()) throw new Error('Please enter name');
      if (mobile.length < 10) throw new Error('Please enter a valid 10-digit mobile number');
      if (aadhaar.replace(/\D/g, '').length !== 12) throw new Error('Aadhaar must be 12 digits');
      if (pan.length !== 10) throw new Error('PAN must be 10 characters');
      if (!photoBlob) throw new Error('Worker photo is required');

      const cleanAadhaar = aadhaar.replace(/\D/g, '');
      const laborerId = crypto.randomUUID();

      // 1. Upload compressed photo to Supabase Storage
      const fileExt = 'jpg';
      const filePath = `${profile.site_id}/${laborerId}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('laborer-photos')
        .upload(filePath, photoBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Photo upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('laborer-photos')
        .getPublicUrl(filePath);

      // 2. Insert Laborer Record
      const { error: insertError } = await supabase
        .from('laborers')
        .insert({
          id: laborerId,
          name: name.trim(),
          mobile: mobile.replace(/\D/g, ''),
          aadhaar: cleanAadhaar,
          pan: pan.toUpperCase(),
          trade: trade,
          photo_url: publicUrl,
          site_id: profile.site_id,
        });

      if (insertError) {
        throw insertError;
      }
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['laborers'] });
      // Reset form
      setName('');
      setMobile('');
      setAadhaar('');
      setPan('');
      setTrade('Helper');
      setPhotoBlob(null);
      setPhotoPreview(null);
      setOriginalSizeKB(null);
      setCompressedSizeKB(null);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to register laborer.');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    registerMutation.mutate();
  };

  if (isProfileLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-zinc-400">Loading site assignment...</p>
      </div>
    );
  }

  if (profileError || !profile?.site_id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-6 text-center">
        <div className="bg-red-950/40 border border-red-800 rounded-2xl p-6 max-w-sm">
          <h2 className="text-red-400 font-bold text-lg mb-2">Access Denied</h2>
          <p className="text-zinc-300 text-sm mb-6">
            {profileError?.message || 'You are not assigned to any active site. Please contact your administrator.'}
          </p>
          <Link
            href="/login"
            className="block w-full py-3 bg-zinc-800 text-white font-semibold rounded-xl hover:bg-zinc-700 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const siteInfo = profile?.sites as unknown as SiteInfo | null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-12">
      {/* Header */}
      <header className="sticky top-0 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-4 py-4 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            href={profile?.role === 'Admin' ? `/admin/sites/${profile.site_id}` : '/'} 
            className="p-2 -ml-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-zinc-300" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Add Laborer</h1>
            <p className="text-xs text-emerald-500 font-medium">
              Site: {siteInfo?.name || 'Unassigned'}
            </p>
          </div>
        </div>
      </header>

      {/* Main Registration Form */}
      <main className="max-w-md mx-auto p-4 mt-2">
        {showCamera ? (
          <div className="py-2">
            <h3 className="text-center text-sm text-zinc-400 mb-3">Position the worker in frame</h3>
            <CameraCapture
              onCapture={handleCameraCapture}
              onClose={() => setShowCamera(false)}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {errorMessage && (
              <div className="p-4 bg-red-950/50 border border-red-800 text-red-300 rounded-xl text-sm font-medium">
                {errorMessage}
              </div>
            )}

            {success && (
              <div className="p-4 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-xl text-sm font-semibold flex items-center gap-2 animate-bounce">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                Laborer registered successfully!
              </div>
            )}

            {/* Photo Section */}
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col items-center">
              <label className="text-sm font-semibold text-zinc-400 mb-4 self-start">
                Worker Photo <span className="text-red-500">*</span>
              </label>

              {photoPreview ? (
                <div className="relative w-40 h-40 rounded-full overflow-hidden border-4 border-zinc-800 mb-4 group shadow-xl bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-xs font-semibold text-white">Photo Set</span>
                  </div>
                </div>
              ) : (
                <div className="w-40 h-40 rounded-full bg-zinc-800/50 border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center text-zinc-500 mb-4 shadow-inner">
                  <Camera className="w-10 h-10 mb-1" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold">No Image</span>
                </div>
              )}

              {/* Compression feedback */}
              {compressedSizeKB && (
                <div className="text-xs text-zinc-400 text-center mb-4 leading-relaxed">
                  <span className="text-emerald-400 font-bold">Compressed: {compressedSizeKB} KB</span>
                  {originalSizeKB && (
                    <>
                      {' '}
                      <span className="line-through text-zinc-600">({originalSizeKB} KB)</span>
                      <br />
                      <span className="text-[10px] text-zinc-500">Saved {originalSizeKB - compressedSizeKB} KB ({Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100)}% reduction)</span>
                    </>
                  )}
                </div>
              )}

              {/* Image Input Buttons */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold rounded-xl text-sm min-h-[48px] transition-all shadow-md"
                >
                  <Camera className="w-4 h-4" />
                  Use Camera
                </button>
                
                <label className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-semibold rounded-xl text-sm min-h-[48px] cursor-pointer transition-all border border-zinc-700 text-center">
                  <Upload className="w-4 h-4 text-zinc-400" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                </label>
              </div>
            </div>

            {/* General Info Card */}
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-zinc-400 mb-1 border-b border-zinc-800 pb-2">Personal Details</h3>
              
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="name">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Enter worker's full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] placeholder-zinc-600 transition-colors"
                  />
                </div>
              </div>

              {/* Mobile Number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="mobile">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    id="mobile"
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="Enter 10-digit number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] placeholder-zinc-600 transition-colors"
                  />
                </div>
              </div>

              {/* Trade Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="trade">
                  Trade / Occupation <span className="text-red-500">*</span>
                </label>
                <select
                  id="trade"
                  value={trade}
                  onChange={(e) => setTrade(e.target.value as typeof TRADES[number])}
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] transition-colors appearance-none cursor-pointer"
                >
                  {TRADES.map((t) => (
                    <option key={t} value={t} className="bg-zinc-900">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Document details Card */}
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-zinc-400 mb-1 border-b border-zinc-800 pb-2">Verification Documents</h3>

              {/* Aadhaar Number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="aadhaar">
                  Aadhaar Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    id="aadhaar"
                    type="text"
                    required
                    placeholder="XXXX-XXXX-XXXX"
                    value={aadhaarFocused ? aadhaar : maskAadhaar(aadhaar)}
                    onFocus={() => setAadhaarFocused(true)}
                    onBlur={() => setAadhaarFocused(false)}
                    onChange={(e) => setAadhaar(formatAadhaar(e.target.value))}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] placeholder-zinc-600 transition-colors"
                  />
                </div>
              </div>

              {/* PAN Card */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="pan">
                  PAN Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    id="pan"
                    type="text"
                    required
                    placeholder="Enter 10-char PAN"
                    value={panFocused ? pan : maskPan(pan)}
                    onFocus={() => setPanFocused(true)}
                    onBlur={() => setPanFocused(false)}
                    onChange={(e) => setPan(formatPan(e.target.value))}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-emerald-500 focus:outline-none text-white text-base min-h-[48px] placeholder-zinc-600 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Register Action button */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:bg-emerald-850 disabled:text-emerald-300 text-white font-bold rounded-2xl text-base min-h-[52px] transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving Worker Data...
                </>
              ) : (
                'Register and Save Labor'
              )}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default function RegisterLaborPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-zinc-400">Loading form...</p>
      </div>
    }>
      <RegisterLaborPageContent />
    </Suspense>
  );
}
