-- ============================================================
-- Two-Role System Migration
-- Collapses Super Admin + Admin → single "Admin" role
-- Admin = full control of ALL sites, can add/terminate engineers
-- Engineer = access to their single assigned site only
-- ============================================================

-- 1. Drop all existing RLS policies that reference old roles
-- SITES
drop policy if exists "Engineers can view their assigned site" on public.sites;
drop policy if exists "Admins can view all sites" on public.sites;
drop policy if exists "Admins can insert sites" on public.sites;
drop policy if exists "Admins can update sites" on public.sites;
drop policy if exists "Super Admins can do everything on sites" on public.sites;
drop policy if exists "Admins can view assigned sites" on public.sites;

-- PROFILES
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Super Admins can manage all profiles" on public.profiles;
drop policy if exists "Admins can view engineers at their sites" on public.profiles;

-- LABORERS
drop policy if exists "Engineers can view laborers at their site" on public.laborers;
drop policy if exists "Engineers can insert laborers at their site" on public.laborers;
drop policy if exists "Engineers can update laborers at their site" on public.laborers;
drop policy if exists "Engineers can delete laborers at their site" on public.laborers;
drop policy if exists "Admins can view all laborers" on public.laborers;
drop policy if exists "Admins can insert laborers" on public.laborers;
drop policy if exists "Super Admins can do everything on laborers" on public.laborers;
drop policy if exists "Admins can manage laborers at their sites" on public.laborers;

-- ATTENDANCE
drop policy if exists "Engineers can view attendance at their site" on public.attendance;
drop policy if exists "Engineers can insert attendance at their site" on public.attendance;
drop policy if exists "Engineers can update attendance at their site" on public.attendance;
drop policy if exists "Engineers can delete attendance at their site" on public.attendance;
drop policy if exists "Admins can view all attendance" on public.attendance;
drop policy if exists "Super Admins can do everything on attendance" on public.attendance;
drop policy if exists "Admins can manage attendance at their sites" on public.attendance;

-- SITE_ENGINEERS
drop policy if exists "Admins can manage site_engineers" on public.site_engineers;
drop policy if exists "Engineers can view their own assignment" on public.site_engineers;
drop policy if exists "Super Admins can do everything on site_engineers" on public.site_engineers;
drop policy if exists "Admins can manage site_engineers at their sites" on public.site_engineers;

-- SITE_ADMINS (table no longer needed — drop it)
drop policy if exists "Super Admins can manage site_admins" on public.site_admins;
drop policy if exists "Admins can view their own site_admins" on public.site_admins;
drop table if exists public.site_admins;

-- 2. Rename enum: add 'Admin' value if missing, remove 'Super Admin'
--    Since ALTER TYPE can't drop values in Postgres < 16, we recreate the type.
--    First update any 'Super Admin' rows to 'Admin':
update public.profiles set role = 'Admin' where role = 'Super Admin';

-- Recreate the enum with only two values
alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('Admin', 'Engineer');

-- Migrate the column
alter table public.profiles
  alter column role drop default;
alter table public.profiles
  alter column role type public.user_role using role::text::public.user_role;
alter table public.profiles
  alter column role set default 'Engineer';

drop type public.user_role_old;

-- ============================================================
-- Recreate RLS Policies for 2-role system
-- ============================================================

-- SITES --
-- Engineers can only see their assigned site
create policy "Engineers can view their assigned site" on public.sites
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'Engineer'
        and p.site_id = public.sites.id
    )
  );

-- Admins have full control over all sites
create policy "Admins can do everything on sites" on public.sites
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- PROFILES --
-- Any authenticated user can view their own profile
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

-- Any authenticated user can update their own profile
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Admins can view all profiles (to list engineers)
create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- Admins can update any profile (to assign sites, change role)
create policy "Admins can update all profiles" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- Admins can delete engineer profiles (terminate access)
create policy "Admins can delete engineer profiles" on public.profiles
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- LABORERS --
-- Engineers can manage laborers at their assigned site
create policy "Engineers can view laborers at their site" on public.laborers
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can insert laborers at their site" on public.laborers
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can update laborers at their site" on public.laborers
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.laborers.site_id
    )
  );

create policy "Engineers can delete laborers at their site" on public.laborers
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.laborers.site_id
    )
  );

-- Admins have full control over all laborers
create policy "Admins can do everything on laborers" on public.laborers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- ATTENDANCE --
-- Engineers can manage attendance at their site
create policy "Engineers can view attendance at their site" on public.attendance
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.attendance.site_id
    )
  );

create policy "Engineers can insert attendance at their site" on public.attendance
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.attendance.site_id
    ) and marked_by = auth.uid()
  );

create policy "Engineers can update attendance at their site" on public.attendance
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Engineer' and p.site_id = public.attendance.site_id
    )
  );

-- Admins have full control over all attendance
create policy "Admins can do everything on attendance" on public.attendance
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- SITE_ENGINEERS --
-- Engineers can view their own assignment
create policy "Engineers can view their own assignment" on public.site_engineers
  for select using (engineer_id = auth.uid());

-- Admins have full control over assignments
create policy "Admins can manage all site_engineers" on public.site_engineers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Admin')
  );

-- ============================================================
-- Update handle_new_user trigger
-- New signup = Engineer by default
-- Promote specific email to Admin
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_role public.user_role;
begin
  -- Promote admin email to Admin, everyone else is Engineer
  if new.email = 'admin123@gmail.com' then
    assigned_role := 'Admin';
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

-- Ensure admin email is Admin
update public.profiles set role = 'Admin' where email = 'admin123@gmail.com';
