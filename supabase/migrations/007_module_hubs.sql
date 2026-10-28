-- Phase E: module hubs. Students taking a module share flashcard decks and study
-- guides with everyone else taking it, rate them, and copy them into their own
-- collection. There is no moderator: items classmates clearly mark unhelpful
-- are hidden automatically. Contributors earn points (shown as badges).
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.hub_items (
  id uuid primary key default gen_random_uuid(),
  catalog_module_id uuid not null references public.catalog_modules (id) on delete cascade,
  kind text not null check (kind in ('deck', 'guide')),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid not null,                 -- the author's own deck or guide; sharing again updates this item
  payload jsonb not null,                  -- deck: { cards: [...] }, guide: { content: <document> }
  item_count integer not null default 0,   -- cards in a deck, sections in a guide
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, kind, source_id)
);
create index if not exists hub_items_module_idx on public.hub_items (catalog_module_id);

create table if not exists public.hub_votes (
  item_id uuid not null references public.hub_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- One row per person who copied an item, so copy counts can't be inflated.
create table if not exists public.hub_copies (
  item_id uuid not null references public.hub_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- Does the signed-in student take this module (via the shared catalogue)?
create or replace function public.takes_module(p_catalog uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules m where m.user_id = auth.uid() and m.catalog_module_id = p_catalog);
$$;

-- Items whose unhelpful votes outnumber helpful ones by this much are hidden.
create or replace function public.hub_hide_threshold() returns integer language sql immutable as $$ select 3 $$;

-- ---------- Access rules ----------
alter table public.hub_items enable row level security;
alter table public.hub_votes enable row level security;
alter table public.hub_copies enable row level security;

drop policy if exists "Module students read hub items" on public.hub_items;
create policy "Module students read hub items" on public.hub_items
  for select to authenticated using (public.takes_module(catalog_module_id));
drop policy if exists "Module students share hub items" on public.hub_items;
create policy "Module students share hub items" on public.hub_items
  for insert to authenticated with check (author_id = auth.uid() and public.takes_module(catalog_module_id));
drop policy if exists "Authors update their hub items" on public.hub_items;
create policy "Authors update their hub items" on public.hub_items
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
-- Authors may change the content, not the module, author or kind.
revoke update on public.hub_items from authenticated, anon;
grant update (title, description, payload, item_count, updated_at) on public.hub_items to authenticated;
drop policy if exists "Authors remove their hub items" on public.hub_items;
create policy "Authors remove their hub items" on public.hub_items
  for delete to authenticated using (author_id = auth.uid());

-- Votes are private; only totals are shown (hub_list below). No voting on your own items.
drop policy if exists "Students manage their own votes" on public.hub_votes;
create policy "Students manage their own votes" on public.hub_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.hub_items i where i.id = item_id and i.author_id <> auth.uid() and public.takes_module(i.catalog_module_id))
  );

drop policy if exists "Students see their own copies" on public.hub_copies;
create policy "Students see their own copies" on public.hub_copies
  for select to authenticated using (user_id = auth.uid());

-- ---------- Functions the app calls ----------

-- A module's hub: items with vote totals, copy counts and the student's own vote.
create or replace function public.hub_list(p_catalog uuid)
returns table (
  id uuid, kind text, title text, description text, author_id uuid, author_name text,
  item_count integer, copies bigint, helpful bigint, unhelpful bigint, my_vote smallint,
  hidden boolean, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.title, i.description, i.author_id, coalesce(p.display_name, 'Student'),
    i.item_count,
    (select count(*) from public.hub_copies c where c.item_id = i.id),
    (select count(*) from public.hub_votes v where v.item_id = i.id and v.value = 1),
    (select count(*) from public.hub_votes v where v.item_id = i.id and v.value = -1),
    (select v.value from public.hub_votes v where v.item_id = i.id and v.user_id = auth.uid()),
    ((select count(*) filter (where v.value = -1) - count(*) filter (where v.value = 1) from public.hub_votes v where v.item_id = i.id) >= public.hub_hide_threshold()),
    i.created_at, i.updated_at
  from public.hub_items i
  left join public.profiles p on p.user_id = i.author_id
  where i.catalog_module_id = p_catalog and public.takes_module(p_catalog)
  order by i.updated_at desc;
$$;

-- Records that the student copied an item (once per person).
create or replace function public.hub_record_copy(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.hub_items i where i.id = p_item and i.author_id <> auth.uid() and public.takes_module(i.catalog_module_id)) then
    return; -- own item, or not allowed: nothing to count
  end if;
  insert into public.hub_copies (item_id, user_id) values (p_item, auth.uid()) on conflict do nothing;
end;
$$;

-- Points: 10 per shared item, 5 per helpful vote received, 2 per person who copied.
create or replace function public.hub_contributors(p_catalog uuid)
returns table (author_id uuid, author_name text, items bigint, helpful bigint, copies bigint, points bigint)
language sql stable security definer set search_path = public as $$
  select i.author_id, coalesce(p.display_name, 'Student'),
    count(distinct i.id),
    (select count(*) from public.hub_votes v join public.hub_items j on j.id = v.item_id where j.author_id = i.author_id and j.catalog_module_id = p_catalog and v.value = 1),
    (select count(*) from public.hub_copies c join public.hub_items j on j.id = c.item_id where j.author_id = i.author_id and j.catalog_module_id = p_catalog),
    count(distinct i.id) * 10
      + 5 * (select count(*) from public.hub_votes v join public.hub_items j on j.id = v.item_id where j.author_id = i.author_id and j.catalog_module_id = p_catalog and v.value = 1)
      + 2 * (select count(*) from public.hub_copies c join public.hub_items j on j.id = c.item_id where j.author_id = i.author_id and j.catalog_module_id = p_catalog)
  from public.hub_items i
  left join public.profiles p on p.user_id = i.author_id
  where i.catalog_module_id = p_catalog and public.takes_module(p_catalog)
  group by i.author_id, p.display_name
  order by 6 desc
  limit 20;
$$;

-- The signed-in student's own totals across all modules (for their badge).
create or replace function public.my_contribution()
returns table (items bigint, helpful bigint, copies bigint, points bigint)
language sql stable security definer set search_path = public as $$
  with mine as (select id from public.hub_items where author_id = auth.uid()),
  t as (
    select (select count(*) from mine) as items,
      (select count(*) from public.hub_votes v where v.item_id in (select id from mine) and v.value = 1) as helpful,
      (select count(*) from public.hub_copies c where c.item_id in (select id from mine)) as copies
  )
  select items, helpful, copies, items * 10 + helpful * 5 + copies * 2 from t;
$$;

-- Hub item counts for the student's modules (for the module pages).
create or replace function public.hub_counts()
returns table (catalog_module_id uuid, items bigint)
language sql stable security definer set search_path = public as $$
  select i.catalog_module_id, count(*)
  from public.hub_items i
  where public.takes_module(i.catalog_module_id)
  group by i.catalog_module_id;
$$;

revoke all on function public.takes_module(uuid) from public, anon;
revoke all on function public.hub_list(uuid) from public, anon;
revoke all on function public.hub_record_copy(uuid) from public, anon;
revoke all on function public.hub_contributors(uuid) from public, anon;
revoke all on function public.my_contribution() from public, anon;
revoke all on function public.hub_counts() from public, anon;
grant execute on function public.takes_module(uuid) to authenticated;
grant execute on function public.hub_list(uuid) to authenticated;
grant execute on function public.hub_record_copy(uuid) to authenticated;
grant execute on function public.hub_contributors(uuid) to authenticated;
grant execute on function public.my_contribution() to authenticated;
grant execute on function public.hub_counts() to authenticated;
