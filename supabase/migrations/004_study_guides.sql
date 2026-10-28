-- Phase B: study guides students write themselves (rich-text documents), and
-- links from flashcards back to the guide section they came from.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid references public.modules (id) on delete set null,
  material_id uuid references public.materials (id) on delete set null,
  title text not null default 'Untitled guide',
  template text,
  content jsonb not null default '{"type":"doc","content":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guides_user_idx on public.guides (user_id);

alter table public.guides enable row level security;
drop policy if exists "Users manage their own guides" on public.guides;
create policy "Users manage their own guides" on public.guides
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cards made from a guide remember the guide and the section heading they came from.
alter table public.cards add column if not exists guide_id uuid references public.guides (id) on delete set null;
alter table public.cards add column if not exists guide_anchor text;
