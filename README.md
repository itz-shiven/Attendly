# CLAMS (Construction Labor Attendance Management System)

An "Anti-Gravity" (ultra-lightweight, high-performance, and resilient) Construction Labor Attendance Management System. Built with Next.js 15 (App Router), Supabase (Auth, DB, RLS, Storage), Tailwind CSS, and TanStack Query v5.

Designed specifically for site engineers on dusty construction sites with poor 4G/5G connectivity to search workers and mark attendance in under 2 seconds.

---

## Key Features

1. **Zero-Latency Client-Side Search**: Instant in-memory search over cached worker database.
2. **One-Tap Attendance Marking**: Optimistic UI cache updates with automatic background synchronization and rollback on network failure.
3. **Smart Laborer Registration Form**:
   - **Direct Camera Access**: Inline dual-camera (front/back) viewport using browser media streams.
   - **Client-side JPEG Compression**: Scales image to max-width 800px on canvas, reducing upload sizes by up to 90% (saving cellular data).
   - **Strict Document Masking**: Formats and masks Aadhaar (`•••• •••• 1234`) and PAN (`••••••1234`) in the UI to protect sensitive worker data.
4. **Resilient SQL Constraints & RLS**: Prevents double attendance on the same date and isolates worker directories based on Site IDs.
5. **PWA Standalone Ready**: Add-to-homescreen capability on Android with orientation locking and branding colors.
6. **Automated Daily CSV Reports**: Generates and archives daily reports in Supabase Storage with masked identity fields.

---

## 5-Step Deployment Guide (Vercel + Supabase)

### Step 1: Set Up Supabase Database & Migrations
1. Create a new project in the [Supabase Dashboard](https://supabase.com).
2. Open the **SQL Editor** in the left navigation panel.
3. Open the migration file [supabase/migrations/20260606000000_init.sql](file:///e:/Shiven%20Goyal/Hacathon/Attendly/supabase/migrations/20260606000000_init.sql), copy its SQL contents, paste it into the Supabase SQL editor, and click **Run**.
   - *This creates the sites, profiles, laborers, and attendance tables, configures custom ENUM types, creates RLS policies, seeds test sites, and sets up the automatic trigger that maps new signups to default profiles.*

### Step 2: Configure Supabase Storage Buckets & Policies
1. Go to the **Storage** tab in your Supabase Dashboard.
2. Click **New Bucket** and create a bucket named `laborer-photos`. Make it **Public**.
3. Create another bucket named `reports`. Make it **Public**.
4. Set up Storage Policies to allow engineers to upload files:
   - Click on **Policies** under Storage.
   - Under both `laborer-photos` and `reports`, add a policy for **INSERT**, **SELECT**, **UPDATE**, and **DELETE** where `Target: Authenticated Users` is enabled, or add a wildcard policy for simple testing.

### Step 3: Gather API Credentials
1. Go to **Project Settings** -> **API** in the Supabase Dashboard.
2. Copy the **Project URL** (`https://your-project.supabase.co`).
3. Copy the **anon (public)** API key.

### Step 4: Deploy to Vercel
1. Push your code to a GitHub repository.
2. Log in to [Vercel](https://vercel.com) and click **Add New** -> **Project**.
3. Import your repository.
4. In the **Environment Variables** section, add the following parameters:
   - `NEXT_PUBLIC_SUPABASE_URL`: (Your Supabase Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Your Supabase Anon API Key)
   - `CRON_SECRET`: (A strong random string of your choice to secure daily report generation)
5. Click **Deploy**. Vercel will build, optimize, and deploy the application in under a minute.

### Step 5: Setup Automated Reporting (Optional Vercel Cron)
To trigger the Daily CSV Report export automatically every evening at 6:00 PM local time:
1. Create a `vercel.json` file in the project's root folder:
   ```json
   {
     "crons": [
       {
         "path": "/api/reports/daily?cron_key=YOUR_CRON_SECRET_HERE",
         "schedule": "0 18 * * *"
       }
     ]
   }
   ```
2. Replace `YOUR_CRON_SECRET_HERE` with the value you defined in your Vercel `CRON_SECRET` environment variable.
3. Push to main to redeploy. Vercel will automatically schedule the serverless cron execution.

---

## Verification & Testing
1. Visit your deployed URL.
2. Under the sign-in form, click **Register** to create a test engineer account.
3. Once logged in, you will be redirected to the **Dashboard** and automatically assigned to the first seeded construction site.
4. Tap **Add Laborer** to register a worker. Capture a photo from your camera or upload a file; you will see the canvas compression ratio and size savings.
5. Tap **Mark Attendance** to access the directory. Type in search queries to test 0ms filtering. Click a worker card or status pill (`P`, `H`, `A`) to mark attendance with real-time background sync.
6. Return to the Dashboard and click **Generate Today's CSV** to export the compiled records to Supabase Storage.
