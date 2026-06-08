-- ============================================================
-- RLS Recursion Fix Migration
-- Prevents "infinite recursion detected in policy for relation 'profiles'"
-- Uses SECURITY DEFINER functions to query roles/sites safely
-- ============================================================

-- 1. Create SECURITY DEFINER functions to bypass RLS internally
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_engineer_site(user_id uuid)
RETURNS uuid AS $$
DECLARE
  assigned_site_id uuid;
BEGIN
  SELECT site_id INTO assigned_site_id FROM public.profiles WHERE id = user_id;
  RETURN assigned_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop all policies that might cause recursion
DO $$ BEGIN
  -- SITES
  DROP POLICY IF EXISTS "Engineers can view their assigned site" ON public.sites;
  DROP POLICY IF EXISTS "Admins can do everything on sites" ON public.sites;

  -- PROFILES
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can delete engineer profiles" ON public.profiles;

  -- LABORERS
  DROP POLICY IF EXISTS "Engineers can view laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can insert laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can update laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Engineers can delete laborers at their site" ON public.laborers;
  DROP POLICY IF EXISTS "Admins can do everything on laborers" ON public.laborers;

  -- ATTENDANCE
  DROP POLICY IF EXISTS "Engineers can view attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Engineers can insert attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Engineers can update attendance at their site" ON public.attendance;
  DROP POLICY IF EXISTS "Admins can do everything on attendance" ON public.attendance;

  -- SITE_ENGINEERS
  DROP POLICY IF EXISTS "Engineers can view their own assignment" ON public.site_engineers;
  DROP POLICY IF EXISTS "Admins can manage all site_engineers" ON public.site_engineers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Recreate clean RLS policies using helper functions

-- SITES
CREATE POLICY "Engineers can view their assigned site" ON public.sites
  FOR SELECT USING (
    id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Admins can do everything on sites" ON public.sites
  FOR ALL USING (
    public.is_admin(auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
  );

-- PROFILES
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete engineer profiles" ON public.profiles
  FOR DELETE USING (
    public.is_admin(auth.uid())
  );

-- LABORERS
CREATE POLICY "Engineers can view laborers at their site" ON public.laborers
  FOR SELECT USING (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Engineers can insert laborers at their site" ON public.laborers
  FOR INSERT WITH CHECK (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Engineers can update laborers at their site" ON public.laborers
  FOR UPDATE USING (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Engineers can delete laborers at their site" ON public.laborers
  FOR DELETE USING (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Admins can do everything on laborers" ON public.laborers
  FOR ALL USING (
    public.is_admin(auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
  );

-- ATTENDANCE
CREATE POLICY "Engineers can view attendance at their site" ON public.attendance
  FOR SELECT USING (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Engineers can insert attendance at their site" ON public.attendance
  FOR INSERT WITH CHECK (
    site_id = public.get_engineer_site(auth.uid()) AND marked_by = auth.uid()
  );

CREATE POLICY "Engineers can update attendance at their site" ON public.attendance
  FOR UPDATE USING (
    site_id = public.get_engineer_site(auth.uid())
  );

CREATE POLICY "Admins can do everything on attendance" ON public.attendance
  FOR ALL USING (
    public.is_admin(auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
  );

-- SITE_ENGINEERS
CREATE POLICY "Engineers can view their own assignment" ON public.site_engineers
  FOR SELECT USING (engineer_id = auth.uid());

CREATE POLICY "Admins can manage all site_engineers" ON public.site_engineers
  FOR ALL USING (
    public.is_admin(auth.uid())
  ) WITH CHECK (
    public.is_admin(auth.uid())
  );
