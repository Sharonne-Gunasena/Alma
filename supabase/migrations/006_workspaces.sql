-- Phase D: shared workspaces (whiteboard, shared notes, tasks, files) for study groups.
-- A workspace belongs to a study-group chat: its members are the group's members, it
-- uses the group's invite link, and the group chat is the workspace chat.
-- Live editing travels over *private* Realtime channels that only members can join;
-- the same rules make chat's online/typing indicators private to chat members.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  catalog_module_id uuid references public.catalog_modules (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The shared document (whiteboard, notes and tasks) as one merged Yjs update, base64-encoded.
create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  state text not null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    join public.conversation_members m on m.conversation_id = w.conversation_id and m.user_id = auth.uid()
    where w.id = p_workspace
  );
$$;

-- Creates a workspace, either for an existing study group the student is in or
-- together with a new group of the same name.
create or replace function public.create_workspace(p_title text, p_conversation uuid default null, p_catalog_module uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  conv uuid := p_conversation;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to create a workspace.'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Give the workspace a name of up to 80 characters.';
  end if;

  if conv is null then
    conv := public.create_group(left(trim(p_title), 60));
  elsif not exists (select 1 from public.conversations c where c.id = conv and c.kind = 'group' and public.is_chat_member(c.id)) then
    raise exception 'You can only add a workspace to a study group you are in.';
  end if;

  select id into new_id from public.workspaces where conversation_id = conv;
  if new_id is not null then return new_id; end if;

  insert into public.workspaces (conversation_id, title, catalog_module_id, created_by)
  values (conv, trim(p_title), p_catalog_module, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.create_workspace(text, uuid, uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.create_workspace(text, uuid, uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_state enable row level security;

drop policy if exists "Members read their workspaces" on public.workspaces;
create policy "Members read their workspaces" on public.workspaces
  for select to authenticated using (public.is_chat_member(conversation_id));
drop policy if exists "Members rename their workspaces" on public.workspaces;
create policy "Members rename their workspaces" on public.workspaces
  for update to authenticated using (public.is_chat_member(conversation_id)) with check (public.is_chat_member(conversation_id));
revoke update on public.workspaces from authenticated, anon;
grant update (title, catalog_module_id) on public.workspaces to authenticated;
drop policy if exists "Creators delete their workspaces" on public.workspaces;
create policy "Creators delete their workspaces" on public.workspaces
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "Members read workspace state" on public.workspace_state;
create policy "Members read workspace state" on public.workspace_state
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "Members save workspace state" on public.workspace_state;
create policy "Members save workspace state" on public.workspace_state
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists "Members update workspace state" on public.workspace_state;
create policy "Members update workspace state" on public.workspace_state
  for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- ---------- Workspace files (private bucket, one folder per workspace) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 26214400)
on conflict (id) do nothing;

create or replace function public.workspace_folder_member(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_workspace_member(((storage.foldername(p_name))[1])::uuid);
exception when others then
  return false; -- not a workspace folder
end;
$$;
grant execute on function public.workspace_folder_member(text) to authenticated;

drop policy if exists "Members read workspace files" on storage.objects;
create policy "Members read workspace files" on storage.objects
  for select to authenticated using (bucket_id = 'workspace-files' and public.workspace_folder_member(name));
drop policy if exists "Members upload workspace files" on storage.objects;
create policy "Members upload workspace files" on storage.objects
  for insert to authenticated with check (bucket_id = 'workspace-files' and public.workspace_folder_member(name));
drop policy if exists "Members delete workspace files" on storage.objects;
create policy "Members delete workspace files" on storage.objects
  for delete to authenticated using (bucket_id = 'workspace-files' and public.workspace_folder_member(name));

-- ---------- Private Realtime channels ----------
-- Topics: "ws:<workspace id>" for live editing, "chat:<conversation id>" for online/typing.
create or replace function public.realtime_topic_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_topic like 'ws:%' then return public.is_workspace_member(substring(p_topic from 4)::uuid); end if;
  if p_topic like 'chat:%' then return public.is_chat_member(substring(p_topic from 6)::uuid); end if;
  return false;
exception when others then
  return false; -- malformed topic
end;
$$;
grant execute on function public.realtime_topic_allowed(text) to authenticated;

drop policy if exists "Members receive on their private channels" on realtime.messages;
create policy "Members receive on their private channels" on realtime.messages
  for select to authenticated using (public.realtime_topic_allowed(realtime.topic()));
drop policy if exists "Members send on their private channels" on realtime.messages;
create policy "Members send on their private channels" on realtime.messages
  for insert to authenticated with check (public.realtime_topic_allowed(realtime.topic()));
