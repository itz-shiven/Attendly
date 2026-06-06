import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '../db.types';

// Server-side Supabase Client (Server Components, API Routes, Actions)
// Fallback placeholder URLs are supplied to prevent Next.js from throwing errors during static build prerendering.
export const createServer = async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method can be called from a Server Component.
            // This can be ignored if middleware is refreshing sessions.
          }
        },
      },
    }
  );
};
