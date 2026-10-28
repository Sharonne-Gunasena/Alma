-- Phase C: chat. Module channels (one per shared module a student takes),
-- study groups (invite link or classmates), and direct messages (requests
-- from people you don't share a chat with). Members can only read their own
-- chats; rate limits and blocks are enforced here, not just in the app.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

-- ---------- Tables ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('module', 'group', 'direct')),
  catalog_module_id uuid unique references public.catalog_modules (id) on delete cascade,
  title text,
  invite_code text unique,                              -- groups only: the invite link
  status text not null default 'active' check (status in ('active', 'requested')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint module_channel_has_module check ((kind = 'module') = (catalog_module_id is not null))
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at);

create table if not exists public.chat_blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Reports keep a copy of the message text, so moderation still works after a message is deleted.
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  message_body text,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

-- ---------- Helpers used by the access rules ----------
create or replace function public.is_chat_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------- Message rules: rate limit, requests, blocks ----------
-- Runs on every insert, so the limits hold even if the app is bypassed.
create or replace function public.check_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conv public.conversations;
  other_id uuid;
  recent_count integer;
begin
  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if recent_count >= 10 then
    raise exception 'You are sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  select * into conv from public.conversations where id = new.conversation_id;
  if conv.kind = 'direct' then
    -- A message request allows one message from the person who asked, until it is accepted.
    if conv.status = 'requested' then
      if conv.created_by is distinct from new.sender_id then
        raise exception 'Accept this message request before you reply.' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.messages where conversation_id = new.conversation_id) then
        raise exception 'Wait for them to accept your message request before you send more.' using errcode = 'P0001';
      end if;
    end if;

    select user_id into other_id
    from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
    limit 1;
    if other_id is not null and public.is_blocked_between(new.sender_id, other_id) then
      raise exception 'You cannot message this person.' using errcode = 'P0001';
    end if;
  end if;

  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.check_message();

-- ---------- Actions the app calls (all checked on the server) ----------

-- Gives the student one module channel per shared module they take, and removes
-- channels for modules they no longer have. Called when the Chat page opens.
create or replace function public.sync_module_channels()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to use chat.'; end if;

  insert into public.conversations (kind, catalog_module_id, title, created_by)
  select 'module', m.catalog_module_id, cm.code, null
  from public.modules m
  join public.catalog_modules cm on cm.id = m.catalog_module_id
  where m.user_id = auth.uid()
  on conflict (catalog_module_id) do nothing;

  insert into public.conversation_members (conversation_id, user_id, role)
  select c.id, auth.uid(), 'member'
  from public.conversations c
  join public.modules m on m.catalog_module_id = c.catalog_module_id and m.user_id = auth.uid()
  where c.kind = 'module'
  on conflict do nothing;

  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id and c.kind = 'module' and cm.user_id = auth.uid()
    and not exists (
      select 1 from public.modules m
      where m.user_id = auth.uid() and m.catalog_module_id = c.catalog_module_id
    );
end;
$$;

create or replace function public.create_group(p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to create a group.'; end if;
  if char_length(trim(p_title)) not between 1 and 60 then
    raise exception 'Give the group a name of up to 60 characters.';
  end if;

  insert into public.conversations (kind, title, created_by, invite_code)
  values ('group', trim(p_title), auth.uid(), replace(gen_random_uuid()::text, '-', ''))
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

create or replace function public.join_group(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  found_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join a group.'; end if;
  select id into found_id from public.conversations where invite_code = p_code and kind = 'group';
  if found_id is null then raise exception 'That invite link is not valid any more.'; end if;

  insert into public.conversation_members (conversation_id, user_id) values (found_id, auth.uid())
  on conflict do nothing;
  return found_id;
end;
$$;

-- Classmates: people who share a module channel with the student (blocked people excluded).
create or replace function public.chat_classmates()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select distinct cm.user_id, coalesce(p.display_name, 'Student')
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id and c.kind = 'module'
  join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id <> auth.uid()
  left join public.profiles p on p.user_id = cm.user_id
  where me.user_id = auth.uid()
    and not public.is_blocked_between(auth.uid(), cm.user_id)
  order by 2;
$$;

-- Adds a classmate to a group the student is in. The classmate must share a module channel with them.
create or replace function public.add_to_group(p_conversation uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation and c.kind = 'group' and public.is_chat_member(c.id)
  ) then
    raise exception 'You can only add people to a group you are in.';
  end if;
  if p_user = auth.uid() or public.is_blocked_between(auth.uid(), p_user) then
    raise exception 'You cannot add this person.';
  end if;
  if not exists (
    select 1
    from public.conversation_members a
    join public.conversations c on c.id = a.conversation_id and c.kind = 'module'
    join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user
    where a.user_id = auth.uid()
  ) then
    raise exception 'You can only add classmates who share a module with you.';
  end if;

  insert into public.conversation_members (conversation_id, user_id) values (p_conversation, p_user)
  on conflict do nothing;
end;
$$;

-- Opens a direct chat. If the two people share no chat yet, it starts as a request.
create or replace function public.start_direct_message(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  new_id uuid;
  shared boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to send messages.'; end if;
  if p_user = auth.uid() then raise exception 'You cannot message yourself.'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'That person is not on CampusLoop.'; end if;
  if public.is_blocked_between(auth.uid(), p_user) then raise exception 'You cannot message this person.'; end if;

  select c.id into existing_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = auth.uid()
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user
  where c.kind = 'direct'
  limit 1;
  if existing_id is not null then return existing_id; end if;

  shared := exists (
    select 1
    from public.conversation_members a
    join public.conversation_members b on b.conversation_id = a.conversation_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );

  insert into public.conversations (kind, status, created_by)
  values ('direct', case when shared then 'active' else 'requested' end, auth.uid())
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, auth.uid()), (new_id, p_user);
  return new_id;
end;
$$;

-- The recipient accepts a message request, or declines it (which deletes the chat).
create or replace function public.answer_request(p_conversation uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation and c.kind = 'direct' and c.status = 'requested'
      and c.created_by is distinct from auth.uid() and public.is_chat_member(c.id)
  ) then
    raise exception 'This request is no longer waiting for you.';
  end if;

  if p_accept then
    update public.conversations set status = 'active' where id = p_conversation;
  else
    delete from public.conversations where id = p_conversation;
  end if;
end;
$$;

-- Leaving removes only the student's own membership. Module channels follow their modules instead.
create or replace function public.leave_conversation(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.conversations where id = p_conversation and kind = 'module') then
    raise exception 'Module channels follow your modules. Remove the module to leave.';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation and user_id = auth.uid();
  delete from public.conversations c
  where c.id = p_conversation and not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);
end;
$$;

-- Everything the inbox needs in one call: titles, unread counts, last message and mute state.
create or replace function public.chat_overview()
returns table (
  conversation_id uuid,
  kind text,
  title text,
  status text,
  created_by uuid,
  muted boolean,
  unread bigint,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  other_user_id uuid,
  member_count bigint,
  invite_code text
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.kind,
    case c.kind
      when 'module' then cm.code
      when 'direct' then coalesce(op.display_name, 'Student')
      else c.title
    end,
    c.status,
    c.created_by,
    me.muted,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid()),
    c.last_message_at,
    latest.body,
    latest.sender_id,
    other.user_id,
    (select count(*) from public.conversation_members x where x.conversation_id = c.id),
    case when c.kind = 'group' then c.invite_code end
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join public.catalog_modules cm on cm.id = c.catalog_module_id
  left join lateral (
    select x.user_id from public.conversation_members x
    where x.conversation_id = c.id and x.user_id <> auth.uid() and c.kind = 'direct'
    limit 1
  ) other on true
  left join public.profiles op on op.user_id = other.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

-- Members of one chat, with names. Only members can ask.
create or replace function public.chat_people(p_conversation uuid)
returns table (user_id uuid, display_name text, role text)
language sql stable security definer set search_path = public as $$
  select cm.user_id, coalesce(p.display_name, 'Student'), cm.role
  from public.conversation_members cm
  left join public.profiles p on p.user_id = cm.user_id
  where cm.conversation_id = p_conversation and public.is_chat_member(p_conversation)
  order by p.display_name nulls last;
$$;

-- Lock the functions down to signed-in users.
revoke all on function public.sync_module_channels() from public, anon;
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.chat_classmates() from public, anon;
revoke all on function public.add_to_group(uuid, uuid) from public, anon;
revoke all on function public.start_direct_message(uuid) from public, anon;
revoke all on function public.answer_request(uuid, boolean) from public, anon;
revoke all on function public.leave_conversation(uuid) from public, anon;
revoke all on function public.chat_overview() from public, anon;
revoke all on function public.chat_people(uuid) from public, anon;
revoke all on function public.is_chat_member(uuid) from public, anon;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.sync_module_channels() to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.chat_classmates() to authenticated;
grant execute on function public.add_to_group(uuid, uuid) to authenticated;
grant execute on function public.start_direct_message(uuid) to authenticated;
grant execute on function public.answer_request(uuid, boolean) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.chat_overview() to authenticated;
grant execute on function public.chat_people(uuid) to authenticated;
grant execute on function public.is_chat_member(uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ---------- Access rules ----------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_reports enable row level security;

-- Chats are created and changed through the functions above, so there are no insert or delete policies on conversations.
drop policy if exists "Members read their chats" on public.conversations;
create policy "Members read their chats" on public.conversations
  for select to authenticated using (public.is_chat_member(id));

drop policy if exists "Members read who is in their chats" on public.conversation_members;
create policy "Members read who is in their chats" on public.conversation_members
  for select to authenticated using (public.is_chat_member(conversation_id));
drop policy if exists "Members update their own settings" on public.conversation_members;
create policy "Members update their own settings" on public.conversation_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Only the personal settings columns may change. Without this, a member could
-- point their own row at another conversation_id and join a chat uninvited,
-- or promote themselves to owner.
revoke update on public.conversation_members from authenticated, anon;
grant update (muted, last_read_at) on public.conversation_members to authenticated;

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages" on public.messages
  for select to authenticated using (public.is_chat_member(conversation_id));
drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and public.is_chat_member(conversation_id));
drop policy if exists "Senders delete their own messages" on public.messages;
create policy "Senders delete their own messages" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

drop policy if exists "Users manage their own blocks" on public.chat_blocks;
create policy "Users manage their own blocks" on public.chat_blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

drop policy if exists "Users file and read their own reports" on public.chat_reports;
create policy "Users file and read their own reports" on public.chat_reports
  for select to authenticated using (reporter_id = auth.uid());
drop policy if exists "Users file reports" on public.chat_reports;
create policy "Users file reports" on public.chat_reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ---------- Live updates ----------
-- Supabase Realtime sends each change only to people allowed to read it.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'conversations', 'conversation_members'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
