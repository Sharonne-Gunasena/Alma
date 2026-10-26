-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Row-level security makes every row and file visible only to the user who owns it.

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  front text not null,
  back text not null,
  ease real not null default 2.5,
  interval_days real not null default 0,
  reps integer not null default 0,
  due timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  storage_path text,
  text_content text not null,
  created_at timestamptz not null default now()
);

create index if not exists cards_deck_id_idx on public.cards (deck_id);
create index if not exists decks_user_id_idx on public.decks (user_id);
create index if not exists materials_user_id_idx on public.materials (user_id);

alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.materials enable row level security;

drop policy if exists "Users manage their own decks" on public.decks;
create policy "Users manage their own decks" on public.decks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage their own cards" on public.cards;
create policy "Users manage their own cards" on public.cards
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
  );

drop policy if exists "Users manage their own materials" on public.materials;
create policy "Users manage their own materials" on public.materials
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Private bucket for original uploaded files, 20 MB limit per file.
-- Files are stored under "<user id>/...", and the policies check that folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "Users read their own material files" on storage.objects;
create policy "Users read their own material files" on storage.objects
  for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own material files" on storage.objects;
create policy "Users upload their own material files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own material files" on storage.objects;
create policy "Users delete their own material files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
