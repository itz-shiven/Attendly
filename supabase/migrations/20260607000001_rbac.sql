-- ============================================================
-- CLAMS RBAC Migration: Admin & Engineer roles
-- Run this AFTER the initial 20260606000000_init.sql migration
-- ============================================================

-- 1. Create user_role enum
create type public.user_role as enum ('Admin', 'Engineer');

-- 2. Add role and full_name columns to profiles
alter table public.profiles
  add column role public.user_role not null default 'Engineer',
  add column full_name text;

-- 3. Create site_engineers join table
--    Links an admin's sites to assigned engineers
create table public.site_engineers (
  site_id     uuid references public.sites(id) on delete cascade not null,
  engineer_id uuid references public.profiles(id) on delete cascade not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (site_id, engineer_id)
);

alter table public.site_engineers enable row level security;

-- ============================================================
-- Drop old single-role RLS policies and replace with RBAC ones
-- ============================================================

-- PROFILES --
drop policy if exists "Engineers can view their own profile" on public.profiles;
drop policy if exists "Engineers can update their own profile" on public.profiles;

-- Any authenticated user can view their own profile
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

-- Admins can view all profiles (for engineer management)
create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Users can update their own profile
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- SITES --
drop policy if exists "Engineers can view their assigned site" on public.sites;

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

-- Admins can view ALL sites
create policy "Admins can view all sites" on public.sites
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Admins can create new sites
create policy "Admins can insert sites" on public.sites
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Admins can update site details
create policy "Admins can update sites" on public.sites
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- LABORERS --
drop policy if exists "Engineers can view laborers at their site" on public.laborers;
drop policy if exists "Engineers can insert laborers at their site" on public.laborers;
drop policy if exists "Engineers can update laborers at their site" on public.laborers;
drop policy if exists "Engineers can delete laborers at their site" on public.laborers;

-- Engineers can view laborers at their assigned site
create policy "Engineers can view laborers at their site" on public.laborers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

-- Engineers can insert laborers at their assigned site
create policy "Engineers can insert laborers at their site" on public.laborers
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

-- Engineers can update laborers at their assigned site
create policy "Engineers can update laborers at their site" on public.laborers
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

-- Engineers can delete laborers at their assigned site
create policy "Engineers can delete laborers at their site" on public.laborers
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.laborers.site_id
    )
  );

-- Admins can view ALL laborers across all sites
create policy "Admins can view all laborers" on public.laborers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Admins can insert laborers at any site
create policy "Admins can insert laborers" on public.laborers
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- ATTENDANCE --
drop policy if exists "Engineers can view attendance at their site" on public.attendance;
drop policy if exists "Engineers can insert attendance at their site" on public.attendance;
drop policy if exists "Engineers can update attendance at their site" on public.attendance;
drop policy if exists "Engineers can delete attendance at their site" on public.attendance;

-- Engineers can view attendance at their site
create policy "Engineers can view attendance at their site" on public.attendance
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    )
  );

-- Engineers can insert attendance at their site
create policy "Engineers can insert attendance at their site" on public.attendance
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    ) and marked_by = auth.uid()
  );

-- Engineers can update attendance at their site
create policy "Engineers can update attendance at their site" on public.attendance
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.attendance.site_id
    )
  );

-- Admins can view ALL attendance across all sites
create policy "Admins can view all attendance" on public.attendance
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- SITE_ENGINEERS --
-- Admins can manage engineer assignments
create policy "Admins can manage site_engineers" on public.site_engineers
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Engineers can see their own assignment
create policy "Engineers can view their own assignment" on public.site_engineers
  for select using (engineer_id = auth.uid());

-- ============================================================
-- Update handle_new_user trigger: first user becomes Admin
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_site_id uuid;
  user_count int;
  assigned_role public.user_role;
begin
  -- Count existing profiles
  select count(*) into user_count from public.profiles;

  -- First ever user becomes Admin, everyone else is Engineer
  if user_count = 0 then
    assigned_role := 'Admin';
    default_site_id := null; -- Admins are not bound to a single site
  else
    assigned_role := 'Engineer';
    -- Assign engineer to the first available site by default
    select id into default_site_id from public.sites limit 1;
  end if;

  insert into public.profiles (id, email, role, site_id)
  values (new.id, new.email, assigned_role, default_site_id);

  return new;
end;
$$ language plpgsql security definer;
