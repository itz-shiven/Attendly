import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/db.types';
import { maskAadhaar, maskPan } from '@/lib/utils';

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
    
    let engineerSiteId: string | null = null;

    if (!isCronAuthorized) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized. Please login or provide a valid cron key.' }, { status: 401 });
      }

      // Fetch user profile to get their assigned site_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('site_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.site_id) {
        return NextResponse.json({ error: 'Assigned construction site not found for engineer.' }, { status: 403 });
      }
      engineerSiteId = profile.site_id;
    }

    // Determine target site_id (Engineers can only query their own site; cron can query any or all)
    const activeSiteId = isCronAuthorized ? (siteIdParam || null) : engineerSiteId;

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
      'Site ID',
      'Site Name',
      'Laborer ID',
      'Laborer Name',
      'Mobile',
      'Trade',
      'Aadhaar (Masked)',
      'PAN (Masked)',
      'Status',
      'Marked By (User ID)',
      'Marked At'
    ];

    const csvRows = records.map((record) => {
      const worker = record.laborers as unknown as WorkerRecord | null;
      const site = record.sites as unknown as SiteRecord | null;
      
      const maskedAadhaar = worker?.aadhaar ? maskAadhaar(worker.aadhaar) : '';
      const maskedPan = worker?.pan ? maskPan(worker.pan) : '';

      return [
        record.date,
        record.site_id,
        site?.name || 'Unknown',
        record.laborer_id,
        worker?.name || 'Unknown',
        worker?.mobile || '',
        worker?.trade || '',
        maskedAadhaar,
        maskedPan,
        record.status,
        record.marked_by,
        record.marked_at
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
    const fileName = activeSiteId 
      ? `report_${activeSiteId}_${targetDate}.csv`
      : `report_consolidated_${targetDate}.csv`;

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
