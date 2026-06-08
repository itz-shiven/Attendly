'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, ShieldAlert, Loader2, HardHat } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        if (profile?.role === 'Admin') {
          router.push('/admin');
        } else {
          router.push('/');
        }
      }
    };
    checkUser();
  }, [router, supabase]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccessMsg('Registration successful! Please check your email or sign in.');
        setIsSignUp(false);
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Fetch role and redirect accordingly
        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();
          router.push(profile?.role === 'Admin' ? '/admin' : '/');
          router.refresh();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 text-slate-900">
      {/* Branding */}
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-md shadow-emerald-600/10 mb-3 border border-emerald-500/10">
          <HardHat className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-emerald-600">Attendly</h1>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-5 text-center text-slate-900">
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </h2>

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex gap-2 items-center">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-750 rounded-xl text-xs font-semibold">
              {successMsg}
            </div>
          )}

          {/* Email input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@company.com"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none text-slate-900 text-base min-h-[48px] placeholder-slate-400"
              />
            </div>
          </div>

          {/* Password input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none text-slate-900 text-base min-h-[48px] placeholder-slate-400"
              />
            </div>
          </div>

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 active:scale-[0.98] transition-all text-white font-bold rounded-xl text-sm min-h-[48px] flex items-center justify-center gap-2 shadow-md shadow-emerald-600/10 mt-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                Processing...
              </>
            ) : isSignUp ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Toggle sign in / sign up */}
        <div className="mt-6 text-center text-xs">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-slate-500 hover:text-emerald-600 transition-colors font-medium underline underline-offset-4 cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
