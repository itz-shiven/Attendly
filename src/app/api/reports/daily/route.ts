import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/db.types';


// Helper to sanitize CSV fields
function escapeCSV(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface WorkerRecord {
  name: string;
  mobile: string;
  trade: string;
  aadhaar: string;
  pan: string;
}

interface SiteRecord {
  name: string;
}

interface UserProfile {
  full_name: string | null;
  email: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const siteIdParam = searchParams.get('site_id');
    const cronKeyParam = searchParams.get('cron_key');

    // Default to today's date in local time formatting (YYYY-MM-DD)
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - offset * 60 * 1000);
    const targetDate = dateParam || localDate.toISOString().split('T')[0];

    // Authenticate client
    const cookieStore = await cookies();
    
    // We create a client utilizing the request's cookies
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
              // Ignore cookie mutations in API routes
            }
          },
        },
      }
    );

    // Verify authentication OR verify cron key
    const isCronAuthorized = cronKeyParam && process.env.CRON_SECRET && cronKeyParam === process.env.CRON_SECRET;
    
    let activeSiteId: string | null = null;

    if (!isCronAuthorized) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized. Please login or provide a valid cron key.' }, { status: 401 });
      }

      // Fetch user profile to get their assigned site_id and role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('site_id, role')
        .eq('id', user.id)
        .single();

      if (profileError) {
        return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 });
      }

      if (profile.role === 'Admin') {
        // Admins can query any site requested in searchParams, or all sites if none specified
        activeSiteId = siteIdParam || null;
      } else {
        // Engineers must have an assigned site_id and can only query that site
        if (!profile.site_id) {
          return NextResponse.json({ error: 'Assigned construction site not found for engineer.' }, { status: 403 });
        }
        activeSiteId = profile.site_id;
      }
    } else {
      activeSiteId = siteIdParam || null;
    }

    // Build the query
    let query = supabase
      .from('attendance')
      .select(`
        date,
        status,
        marked_at,
        marked_by,
        laborer_id,
        site_id,
        laborers (
          name,
          mobile,
          trade,
          aadhaar,
          pan
        ),
        sites (
          name
        ),
        profiles!attendance_marked_by_fkey (
          full_name,
          email
        )
      `)
      .eq('date', targetDate);

    if (activeSiteId) {
      query = query.eq('site_id', activeSiteId);
    }

    const { data: records, error: queryError } = await query;

    if (queryError) {
      return NextResponse.json({ error: `Query failed: ${queryError.message}` }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No attendance records found for date ${targetDate}. Report not generated.`,
        recordsCount: 0
      });
    }

    // Generate CSV Content
    const csvHeaders = [
      'Date',
      'Time',
      'Person Name',
      'Marked By'
    ];

    const csvRows = records.map((record) => {
      const worker = record.laborers as unknown as WorkerRecord | null;
      const engineer = record.profiles as unknown as UserProfile | null;
      
      const time = record.marked_at ? new Date(record.marked_at).toLocaleTimeString() : '';

      return [
        record.date,
        time,
        worker?.name || 'Unknown',
        engineer?.full_name || engineer?.email || 'Unknown'
      ].map(escapeCSV).join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\r\n');

    // Create reports bucket programmatically if it doesn't exist
    try {
      await supabase.storage.createBucket('reports', {
        public: true,
        fileSizeLimit: 1024 * 1024 * 10, // 10MB limit
      });
    } catch {
      // Bucket might already exist, ignore error
    }

    // Upload CSV to Supabase Storage
    const rawSiteName = (records[0].sites as unknown as SiteRecord)?.name || 'site';
    const siteName = rawSiteName.replace(/[^a-z0-9]/gi, '_'); // sanitize site name only
    const fileName = `${siteName}_${targetDate}.csv`;

    const filePath = `daily-reports/${targetDate}/${fileName}`;

    // Convert string to blob/buffer for upload
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([csvBlob], fileName, { type: 'text/csv' });

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(filePath, file, {
        contentType: 'text/csv',
        upsert: true
      });

    if (uploadError) {
      return NextResponse.json({ error: `CSV upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('reports')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      message: 'Daily report generated and stored successfully.',
      date: targetDate,
      recordsCount: records.length,
      storagePath: filePath,
      downloadUrl: publicUrl
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Report generation error:', err);
    return NextResponse.json({ error: `Internal Server Error: ${errorMsg}` }, { status: 500 });
  }
}
