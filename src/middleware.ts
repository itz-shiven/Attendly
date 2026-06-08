import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a response we can mutate cookies on
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Always allow public auth routes
  if (pathname.startsWith('/login')) {
    return response;
  }

  // Fetch session
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Fetch profile role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  console.log('[Middleware] user:', user.id, '| role:', profile?.role, '| error:', profileError?.message, '| path:', pathname);

  const role = profile?.role;
  const isAdmin = role === 'Admin';

  // Admin trying to access engineer routes → send to /admin (except /register)
  if (isAdmin && !pathname.startsWith('/admin') && !pathname.startsWith('/api') && pathname !== '/register') {
    console.log('[Middleware] Redirecting Admin → /admin');
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // Engineer trying to access admin routes → send to /
  if (role === 'Engineer' && pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)',
  ],
};
