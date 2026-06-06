-- Create trade and attendance enums
create type public.trade_type as enum (
  'Mason',
  'Helper',
  'Carpenter',
  'Plumber',
  'Electrician',
  'Painter',
  'Welder',
  'Other'
);

create type public.attendance_status as enum (
  'Present',
  'Absent',
  'Half Day'
);

-- 1. Create SITES table
create table public.sites (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  location text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create PROFILES table (extending auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  site_id uuid references public.sites(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create LABORERS table
create table public.laborers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  mobile text not null,
  aadhaar text not null,
  pan text not null,
  trade public.trade_type not null default 'Helper',
  photo_url text,
  site_id uuid references public.sites(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create ATTENDANCE table
create table public.attendance (
  date date not null default current_date,
  laborer_id uuid references public.laborers(id) on delete cascade not null,
  status public.attendance_status not null default 'Present',
  marked_by uuid references public.profiles(id) on delete set null not null,
  marked_at timestamp with time zone default timezone('utc'::text, now()) not null,
  site_id uuid references public.sites(id) on delete cascade not null,
  primary key (date, laborer_id)
);

-- Enable Row Level Security (RLS) on all public tables
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.laborers enable row level security;
alter table public.attendance enable row level security;

-- RLS Policies

-- Profiles Policies
create policy "Engineers can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Engineers can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Sites Policies
create policy "Engineers can view their assigned site" on public.sites
  for select using (
    id = (select site_id from public.profiles where id = auth.uid())
  );

-- Laborers Policies
create policy "Engineers can view laborers at their site" on public.laborers
  for select using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

create policy "Engineers can insert laborers at their site" on public.laborers
  for insert with check (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

create policy "Engineers can update laborers at their site" on public.laborers
  for update using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

create policy "Engineers can delete laborers at their site" on public.laborers
  for delete using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

-- Attendance Policies
create policy "Engineers can view attendance at their site" on public.attendance
  for select using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

create policy "Engineers can insert attendance at their site" on public.attendance
  for insert with check (
    site_id = (select site_id from public.profiles where id = auth.uid()) and
    marked_by = auth.uid()
  );

create policy "Engineers can update attendance at their site" on public.attendance
  for update using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

create policy "Engineers can delete attendance at their site" on public.attendance
  for delete using (
    site_id = (select site_id from public.profiles where id = auth.uid())
  );

-- Automatic handle_new_user trigger
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_site_id uuid;
begin
  -- Get the first available site to assign as default (or null if none exist)
  select id into default_site_id from public.sites limit 1;
  
  insert into public.profiles (id, email, site_id)
  values (new.id, new.email, default_site_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Seed Initial Data
insert into public.sites (name, location) values
('Skyline Heights Tower A', 'Sector 62, Noida'),
('Metro Extension Project Phase II', 'Outer Ring Road, Bengaluru');
