-- ============================================================
-- SAFE Two-Role System Migration (Fix version)
-- Works from scratch — handles missing tables/enums gracefully
-- Admin = full control of ALL sites
-- Engineer = access to their single assigned site only
-- ============================================================

-- ============================================================
-- 1. Drop ALL existing RLS policies safely (ignore missing tables)
-- ============================================================

DO $$ BEGIN
  -- SITES
  DROP POLICY IF EXISTS "Engineers can view their assigned site" ON public.sites;
  DROP POLICY IF EXISTS "Admins can view all sites" ON public.sites;
  DROP POLICY IF EXISTS "Admins can insert sites" ON public.sites;
  DROP POLICY IF EXISTS "Admins can update sites" ON public.sites;
  DROP POLICY IF EXISTS "Super Admins can do everything on sites" ON public.sites;
  DROP POLICY IF EXISTS "Admins can view assigned sites" ON public.sites;
  DROP POLICY IF EXISTS "Admins can do everything on sites" ON public.sites;

  -- PROFILES
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can delete engineer profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Super Admins can manage all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can view engineers at their sites" ON public.profiles;
  DROP POLICY IF EXISTS "Engineers can view their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Engineers can update their own profile" ON public.profiles;

  -- LABORERS
  DROP POLICY IF EXISTS "Engineers can view laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can insert laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can update laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can delete laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Admins can view all laborers" ON public.laborers;
  DROP POLICY IF EXISTS "Admins can insert laborers" ON public.laborers;
  DROP POLICY IF EXISTS "Super Admins can do everything on laborers" ON public.laborers;
  DROP POLICY IF EXISTS "Admins can manage laborers at their sites" ON public.laborers;
  DROP POLICY IF EXISTS "Admins can do everything on laborers" ON public.laborers;

  -- ATTENDANCE
  DROP POLICY IF EXISTS "Engineers can view attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Engineers can insert attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Engineers can update attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Engineers can delete attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Admins can view all attendance" ON public.attendance;
  DROP POLICY IF EXISTS "Super Admins can do everything on attendance" ON public.attendance;
  DROP POLICY IF EXISTS "Admins can manage attendance at their sites" ON public.attendance;
  DROP POLICY IF EXISTS "Admins can do everything on attendance" ON public.attendance;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop site_engineers policies safely
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can manage site_engineers" ON public.site_engineers;
  DROP POLICY IF EXISTS "Engineers can view their own assignment" ON public.site_engineers;
  DROP POLICY IF EXISTS "Super Admins can do everything on site_engineers" ON public.site_engineers;
  DROP POLICY IF EXISTS "Admins can manage all site_engineers" ON public.site_engineers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop site_admins table if it happens to exist
DROP TABLE IF EXISTS public.site_admins CASCADE;

-- ============================================================
-- 2. Ensure user_role enum has exactly 'Admin' and 'Engineer'
-- ============================================================

DO $$
BEGIN
  -- If the enum doesn't exist at all, create it fresh
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('Admin', 'Engineer');
  END IF;
END $$;

-- Add 'Admin' value to enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'Admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'Admin';
  END IF;
END $$;

-- Add 'Engineer' value to enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype AND enumlabel = 'Engineer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'Engineer';
  END IF;
END $$;

-- ============================================================
-- 3. Ensure profiles table has role and full_name columns
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'Engineer';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL;

-- ============================================================
-- 4. Ensure site_engineers table exists
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_engineers (
  site_id     UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (site_id, engineer_id)
);

ALTER TABLE public.site_engineers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Promote admin email to Admin role
-- ============================================================

UPDATE public.profiles SET role = 'Admin' WHERE email = 'admin123@gmail.com';

-- ============================================================
-- 6. Recreate all RLS policies for 2-role system
-- ============================================================

-- SITES --
CREATE POLICY "Engineers can view their assigned site" ON public.sites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'Engineer'
        AND p.site_id = public.sites.id
    )
  );

CREATE POLICY "Admins can do everything on sites" ON public.sites
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- PROFILES --
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

CREATE POLICY "Admins can delete engineer profiles" ON public.profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- LABORERS --
CREATE POLICY "Engineers can view laborers at their site" ON public.laborers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.laborers.site_id
    )
  );

CREATE POLICY "Engineers can insert laborers at their site" ON public.laborers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.laborers.site_id
    )
  );

CREATE POLICY "Engineers can update laborers at their site" ON public.laborers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.laborers.site_id
    )
  );

CREATE POLICY "Engineers can delete laborers at their site" ON public.laborers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.laborers.site_id
    )
  );

CREATE POLICY "Admins can do everything on laborers" ON public.laborers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- ATTENDANCE --
CREATE POLICY "Engineers can view attendance at their site" ON public.attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.attendance.site_id
    )
  );

CREATE POLICY "Engineers can insert attendance at their site" ON public.attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.attendance.site_id
    ) AND marked_by = auth.uid()
  );

CREATE POLICY "Engineers can update attendance at their site" ON public.attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Engineer' AND p.site_id = public.attendance.site_id
    )
  );

CREATE POLICY "Admins can do everything on attendance" ON public.attendance
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- SITE_ENGINEERS --
CREATE POLICY "Engineers can view their own assignment" ON public.site_engineers
  FOR SELECT USING (engineer_id = auth.uid());

CREATE POLICY "Admins can manage all site_engineers" ON public.site_engineers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- ============================================================
-- 7. Replace handle_new_user trigger
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role public.user_role;
BEGIN
  -- admin123@gmail.com → Admin, everyone else → Engineer
  IF NEW.email = 'admin123@gmail.com' THEN
    assigned_role := 'Admin';
  ELSE
    assigned_role := 'Engineer';
  END IF;

  INSERT INTO public.profiles (id, email, role, site_id)
  VALUES (NEW.id, NEW.email, assigned_role, NULL);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Final promotion (in case profile already existed before trigger)
UPDATE public.profiles SET role = 'Admin' WHERE email = 'admin123@gmail.com';
