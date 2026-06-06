import { createBrowserClient } from '@supabase/ssr';
import { Database } from '../db.types';

// Browser-side Supabase Client
// Fallback placeholder URLs are supplied to prevent Next.js from throwing errors during static build prerendering.
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  );
