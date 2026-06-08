# CLAMS — Construction Labor Attendance Management System

An "Anti-Gravity" (ultra-lightweight, high-performance, resilient) Construction Labor Attendance Management System built with **Next.js 15**, **Supabase**, **Tailwind CSS**, and **TanStack Query v5**.

---

## User Roles

CLAMS has two distinct roles:

| Role | Access |
|------|--------|
| **Admin** | Multi-site overview, create sites, manage & assign engineers, view all attendance, export reports |
| **Engineer** | Single-site attendance marking, laborer registration |

> **First signup = Admin.** Every subsequent signup = Engineer by default.

---

## Key Features

- **Zero-Latency Search** — In-memory client-side filter, 0ms response
- **One-Tap Attendance** — Optimistic UI with background sync + auto rollback on failure
- **Camera Integration** — Direct browser camera stream for laborer photos
- **Image Compression** — Canvas-based JPEG compression (5MB → ~150KB)
- **Aadhaar / PAN Masking** — Sensitive IDs masked in UI (`•••• •••• 1234`)
- **Multi-Site Admin Dashboard** — Attendance rates, progress bars, site creation
- **Engineer Management** — Assign/reassign engineers to sites inline
- **Daily CSV Reports** — Auto-export to Supabase Storage with masked IDs
- **PWA Ready** — Installable on Android, standalone display

---

## 5-Step Deployment Guide (Vercel + Supabase)

### Step 1 — Create Supabase Project & Run Migrations

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the left sidebar.
3. Run the **first migration** — open [`supabase/migrations/20260606000000_init.sql`](./supabase/migrations/20260606000000_init.sql), paste into SQL Editor, and click **Run**.
4. Run the **second migration** — open [`supabase/migrations/20260607000001_rbac.sql`](./supabase/migrations/20260607000001_rbac.sql), paste into SQL Editor, and click **Run**.

> This creates all tables, enums, RLS policies, the `handle_new_user` trigger, seeded sites, and the Admin/Engineer role system.

---

### Step 2 — Configure Supabase Storage

1. Go to the **Storage** tab.
2. Click **New Bucket** → create `laborer-photos` → set to **Public**.
3. Click **New Bucket** → create `reports` → set to **Public**.
4. For each bucket, go to **Policies** and add a policy allowing **Authenticated** users to `INSERT`, `SELECT`, and `UPDATE`.

---

### Step 3 — Get API Credentials

1. Go to **Project Settings** → **API**.
2. Copy the **Project URL**.
3. Copy the **anon (public)** key.

---

### Step 4 — Configure Environment Variables

Copy the template and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
CRON_SECRET=pick-a-strong-random-secret
```

---

### Step 5 — Deploy to Vercel

1. Push to a GitHub repository.
2. Log in to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. In **Environment Variables**, add the three keys from Step 4.
4. Click **Deploy**.

---

## How to Manage User Roles

### Making Someone an Admin

By default, the **first user who signs up** is automatically promoted to Admin. All others become Engineers.

To **manually promote an Engineer to Admin** at any time:
1. Go to your **Supabase Dashboard** → **Table Editor** → `profiles`.
2. Find the user's row by email.
3. Click the `role` cell and change the value from `Engineer` to `Admin`.
4. Click **Save**. The user will be redirected to `/admin` on their next login.

### Assigning an Engineer to a Site

Option A — **Via Admin UI** (recommended):
1. Sign in as Admin.
2. Go to **Engineers** (the users icon in the top-right).
3. Find the engineer and click **Assign** → select a site → **Save**.

Option B — **Directly in Supabase**:
1. Go to **Table Editor** → `profiles`.
2. Find the engineer's row.
3. Set the `site_id` column to the UUID of the desired site (find site IDs in the `sites` table).
4. Click **Save**.

### Changing a User's Full Name

In Supabase **Table Editor** → `profiles` → find the row → edit the `full_name` column → **Save**.

---

## Automated Daily CSV Reports (Vercel Cron)

Create `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/reports/daily?cron_key=YOUR_CRON_SECRET",
      "schedule": "0 18 * * *"
    }
  ]
}
```

Replace `YOUR_CRON_SECRET` with the value in your `CRON_SECRET` env variable. Redeploy to activate.

---

## Local Development

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your Supabase credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first signup will become Admin.
