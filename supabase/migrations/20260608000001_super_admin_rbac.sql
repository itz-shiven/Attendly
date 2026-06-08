-- ============================================================
-- Super Admin RBAC Migration - Phase 2: Schema & Policies
-- ============================================================

-- 1. Ensure profiles has 'role' and 'full_name' columns (creating them if not exists)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'Engineer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

-- 2. Create site_engineers join table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.site_engineers (
  site_id     uuid REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  engineer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (site_id, engineer_id)
);

ALTER TABLE public.site_engineers ENABLE ROW LEVEL SECURITY;

-- 3. Create site_admins join table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.site_admins (
  site_id     uuid REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  admin_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (site_id, admin_id)
);

ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Update Policies
-- ============================================================

-- SITES
drop policy if exists "Engineers can view their assigned site" on public.sites;
drop policy if exists "Admins can view all sites" on public.sites;
drop policy if exists "Admins can insert sites" on public.sites;
drop policy if exists "Admins can update sites" on public.sites;
drop policy if exists "Super Admins can do everything on sites" on public.sites;
drop policy if exists "Admins can view assigned sites" on public.sites;

-- Engineers can view their assigned site only
create policy "Engineers can view their assigned site" on public.sites
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.sites.id
    )
  );

-- Super Admin has full control over sites
create policy "Super Admins can do everything on sites" on public.sites
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

-- Admin can view sites they manage
create policy "Admins can view assigned sites" on public.sites
  for select using (
    exists (
      select 1 from public.site_admins sa
      where sa.site_id = public.sites.id and sa.admin_id = auth.uid()
    )
  );

-- PROFILES
drop policy if exists "Engineers can view their own profile" on public.profiles;
drop policy if exists "Engineers can update their own profile" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Super Admins can manage all profiles" on public.profiles;
drop policy if exists "Admins can view engineers at their sites" on public.profiles;

-- Any authenticated user can view/update their own profile
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Super Admin can manage all profiles
create policy "Super Admins can manage all profiles" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

-- Admin can view profiles of Engineers assigned to their sites
create policy "Admins can view engineers at their sites" on public.profiles
  for select using (
    role = 'Engineer' and site_id in (
      select site_id from public.site_admins sa where sa.admin_id = auth.uid()
    )
  );

-- LABORERS
drop policy if exists "Engineers can view laborers at their site" on public.laborers;
drop policy if exists "Engineers can insert laborers at their site" on public.laborers;
drop policy if exists "Engineers can update laborers at their site" on public.laborers;
drop policy if exists "Engineers can delete laborers at their site" on public.laborers;
drop policy if exists "Admins can view all laborers" on public.laborers;
drop policy if exists "Admins can insert laborers" on public.laborers;
drop policy if exists "Super Admins can do everything on laborers" on public.laborers;
drop policy if exists "Admins can manage laborers at their sites" on public.laborers;

-- Engineers can manage laborers at their assigned site
create policy "Engineers can view laborers at their site" on public.laborers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can insert laborers at their site" on public.laborers
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can update laborers at their site" on public.laborers
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can delete laborers at their site" on public.laborers
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

create policy "Super Admins can do everything on laborers" on public.laborers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

create policy "Admins can manage laborers at their sites" on public.laborers
  for all using (
    site_id in (select site_id from public.site_admins sa where sa.admin_id = auth.uid())
  );

-- ATTENDANCE
drop policy if exists "Engineers can view attendance at their site" on public.attendance;
drop policy if exists "Engineers can insert attendance at their site" on public.attendance;
drop policy if exists "Engineers can update attendance at their site" on public.attendance;
drop policy if exists "Engineers can delete attendance at their site" on public.attendance;
drop policy if exists "Admins can view all attendance" on public.attendance;
drop policy if exists "Super Admins can do everything on attendance" on public.attendance;
drop policy if exists "Admins can manage attendance at their sites" on public.attendance;

-- Engineers can manage attendance at their site
create policy "Engineers can view attendance at their site" on public.attendance
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    )
  );

create policy "Engineers can insert attendance at their site" on public.attendance
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    ) and marked_by = auth.uid()
  );

create policy "Engineers can update attendance at their site" on public.attendance
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    )
  );

create policy "Super Admins can do everything on attendance" on public.attendance
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

create policy "Admins can manage attendance at their sites" on public.attendance
  for all using (
    site_id in (select site_id from public.site_admins sa where sa.admin_id = auth.uid())
  );

-- SITE_ENGINEERS
drop policy if exists "Admins can manage site_engineers" on public.site_engineers;
drop policy if exists "Engineers can view their own assignment" on public.site_engineers;
drop policy if exists "Super Admins can do everything on site_engineers" on public.site_engineers;
drop policy if exists "Admins can manage site_engineers at their sites" on public.site_engineers;

create policy "Engineers can view their own assignment" on public.site_engineers
  for select using (engineer_id = auth.uid());

create policy "Super Admins can do everything on site_engineers" on public.site_engineers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

create policy "Admins can manage site_engineers at their sites" on public.site_engineers
  for all using (
    site_id in (select site_id from public.site_admins sa where sa.admin_id = auth.uid())
  );

-- SITE_ADMINS
drop policy if exists "Super Admins can manage site_admins" on public.site_admins;
drop policy if exists "Admins can view their own site_admins" on public.site_admins;

create policy "Super Admins can manage site_admins" on public.site_admins
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Super Admin')
  );

create policy "Admins can view their own site_admins" on public.site_admins
  for select using (admin_id = auth.uid());

-- ============================================================
-- Update handle_new_user trigger
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_role public.user_role;
begin
  if new.email = 'admin123@gmail.com' then
    assigned_role := 'Super Admin';
  else
    assigned_role := 'Engineer';
  end if;

  insert into public.profiles (id, email, role, site_id)
  values (new.id, new.email, assigned_role, null);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-promote admin123@gmail.com if already exists
update public.profiles set role = 'Super Admin' where email = 'admin123@gmail.com';
