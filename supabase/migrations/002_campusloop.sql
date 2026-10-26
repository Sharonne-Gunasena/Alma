-- CampusLoop: modules, timetable, assignments, study preferences, and richer
-- flashcards. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once.

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text,
  name text not null,
  color text not null default '#4f5bd5',
  exam_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.class_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid references public.modules (id) on delete set null,
  title text not null,
  kind text not null default 'class',
  location text,
  weekday smallint not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid references public.modules (id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  effort_hours real not null default 2,
  hours_done real not null default 0,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'todo' check (status in ('todo', 'done')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  university text,
  course text,
  year smallint,
  study_prefs jsonb,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.decks add column if not exists module_id uuid references public.modules (id) on delete set null;
alter table public.materials add column if not exists module_id uuid references public.modules (id) on delete set null;
alter table public.materials add column if not exists page_count integer;
alter table public.materials add column if not exists guide jsonb;
alter table public.cards add column if not exists type text not null default 'basic';
alter table public.cards add column if not exists topic text;
alter table public.cards add column if not exists source_page integer;
alter table public.cards add column if not exists material_id uuid references public.materials (id) on delete set null;
alter table public.cards add column if not exists lapses integer not null default 0;
alter table public.cards add column if not exists reviews integer not null default 0;

create index if not exists class_events_user_idx on public.class_events (user_id);
create index if not exists assignments_user_idx on public.assignments (user_id);
create index if not exists modules_user_idx on public.modules (user_id);

alter table public.modules enable row level security;
alter table public.class_events enable row level security;
alter table public.assignments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users manage their own modules" on public.modules;
create policy "Users manage their own modules" on public.modules
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage their own classes" on public.class_events;
create policy "Users manage their own classes" on public.class_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage their own assignments" on public.assignments;
create policy "Users manage their own assignments" on public.assignments
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile" on public.profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
