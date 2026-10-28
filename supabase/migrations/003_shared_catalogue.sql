-- Phase A: a shared catalogue of universities, courses and modules.
-- Courses "learn" their module lists from the timetables students import.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

-- ---------- Universities (seeded below, read-only for users) ----------
create table if not exists public.universities (
  id text primary key,                    -- short slug, e.g. 'ucd'
  name text not null,
  short_name text,
  domains text[] not null default '{}',   -- websites CampusLoop may read course pages from
  code_pattern text,                      -- module-code pattern (JavaScript regex source)
  sort smallint not null default 100
);

-- ---------- Courses (students add their own) ----------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id text not null references public.universities (id),
  name text not null,
  page_url text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists courses_university_name_idx on public.courses (university_id, lower(name));

-- ---------- Shared module catalogue: one row per module per university ----------
create table if not exists public.catalog_modules (
  id uuid primary key default gen_random_uuid(),
  university_id text not null references public.universities (id),
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (university_id, code)
);

-- ---------- Which modules students on a course report taking ----------
-- One row per student per module, so counts can't be inflated by re-importing.
create table if not exists public.course_module_reports (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  year smallint not null,
  module_id uuid not null references public.catalog_modules (id) on delete cascade,
  source text not null default 'timetable' check (source in ('timetable', 'website', 'manual')),
  created_at timestamptz not null default now(),
  primary key (user_id, course_id, year, module_id)
);

-- ---------- Links from personal data to the catalogue ----------
alter table public.modules add column if not exists catalog_module_id uuid references public.catalog_modules (id) on delete set null;
alter table public.profiles add column if not exists university_id text references public.universities (id);
alter table public.profiles add column if not exists course_id uuid references public.courses (id) on delete set null;

-- ---------- Access rules ----------
alter table public.universities enable row level security;
alter table public.courses enable row level security;
alter table public.catalog_modules enable row level security;
alter table public.course_module_reports enable row level security;

-- Catalogue data is public information (module codes and names), so anyone may read it.
drop policy if exists "Anyone can read universities" on public.universities;
create policy "Anyone can read universities" on public.universities for select to anon, authenticated using (true);

drop policy if exists "Anyone can read courses" on public.courses;
create policy "Anyone can read courses" on public.courses for select to anon, authenticated using (true);
drop policy if exists "Signed-in users add courses" on public.courses;
create policy "Signed-in users add courses" on public.courses for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Anyone can read the module catalogue" on public.catalog_modules;
create policy "Anyone can read the module catalogue" on public.catalog_modules for select to anon, authenticated using (true);
drop policy if exists "Signed-in users add catalogue modules" on public.catalog_modules;
create policy "Signed-in users add catalogue modules" on public.catalog_modules for insert to authenticated with check (true);

-- Individual reports stay private; only the aggregate is exposed (see function below).
drop policy if exists "Users manage their own module reports" on public.course_module_reports;
create policy "Users manage their own module reports" on public.course_module_reports
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Suggested modules for a course and year, ranked by how many students reported them.
-- SECURITY DEFINER so it can count everyone's reports while only returning totals.
create or replace function public.suggest_course_modules(p_course uuid, p_year smallint default null)
returns table (module_id uuid, code text, name text, students bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.code, m.name, count(distinct r.user_id) as students
  from public.course_module_reports r
  join public.catalog_modules m on m.id = r.module_id
  where r.course_id = p_course and (p_year is null or r.year = p_year)
  group by m.id, m.code, m.name
  order by students desc, m.code;
$$;
grant execute on function public.suggest_course_modules(uuid, smallint) to anon, authenticated;

-- ---------- Seed: Irish universities ----------
-- Patterns are best guesses at each university's module-code format; the app falls
-- back to a generic pattern when one is missing, and students always confirm the list.
insert into public.universities (id, name, short_name, domains, code_pattern, sort) values
  ('ucd', 'University College Dublin', 'UCD', '{ucd.ie}', '[A-Z]{4}\d{5}[A-Z]?', 1),
  ('tcd', 'Trinity College Dublin', 'TCD', '{tcd.ie}', '[A-Z]{3}\d{5}', 2),
  ('dcu', 'Dublin City University', 'DCU', '{dcu.ie}', '[A-Z]{2,4}\d{3}', 3),
  ('ucc', 'University College Cork', 'UCC', '{ucc.ie}', '[A-Z]{2}\d{4}', 4),
  ('galway', 'University of Galway', 'Galway', '{universityofgalway.ie,nuigalway.ie}', '[A-Z]{2}\d{3,4}', 5),
  ('maynooth', 'Maynooth University', 'MU', '{maynoothuniversity.ie}', '[A-Z]{2}\d{3}', 6),
  ('ul', 'University of Limerick', 'UL', '{ul.ie}', '[A-Z]{2}\d{4}', 7),
  ('tudublin', 'Technological University Dublin', 'TU Dublin', '{tudublin.ie}', null, 8),
  ('ncirl', 'National College of Ireland', 'NCI', '{ncirl.ie}', null, 9),
  ('rcsi', 'RCSI University of Medicine and Health Sciences', 'RCSI', '{rcsi.com,rcsi.ie}', null, 10),
  ('atu', 'Atlantic Technological University', 'ATU', '{atu.ie}', null, 11),
  ('mtu', 'Munster Technological University', 'MTU', '{mtu.ie}', null, 12),
  ('setu', 'South East Technological University', 'SETU', '{setu.ie}', null, 13),
  ('tus', 'Technological University of the Shannon', 'TUS', '{tus.ie}', null, 14),
  ('dkit', 'Dundalk Institute of Technology', 'DkIT', '{dkit.ie}', null, 15),
  ('iadt', 'IADT Dún Laoghaire', 'IADT', '{iadt.ie}', null, 16),
  ('other', 'Other university or college', 'Other', '{}', null, 999)
on conflict (id) do update set
  name = excluded.name, short_name = excluded.short_name, domains = excluded.domains,
  code_pattern = excluded.code_pattern, sort = excluded.sort;
