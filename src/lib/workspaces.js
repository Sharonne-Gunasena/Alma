// Workspace calls to Supabase. Membership comes from the workspace's study-group
// chat, so the database rules for chats also protect workspaces.
import { supabase } from '../supabase.js';

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

const BUCKET = 'workspace-files';

export const MIGRATION_HINT = 'The database needs updating for workspaces: run supabase/migrations/006_workspaces.sql in the Supabase SQL Editor.';
export const needsMigration = (err) => /workspace|schema cache|does not exist|bucket not found/i.test(err?.message ?? '');

export const workspaceApi = {
  async list() {
    return check(await supabase.from('workspaces').select('id, title, conversation_id, catalog_module_id, created_by, created_at').order('created_at', { ascending: false }));
  },

  async get(id) {
    const ws = check(await supabase.from('workspaces').select('*').eq('id', id).single());
    const [conv, people] = await Promise.all([
      supabase.from('conversations').select('invite_code').eq('id', ws.conversation_id).maybeSingle(),
      supabase.rpc('chat_people', { p_conversation: ws.conversation_id }),
    ]);
    return { ...ws, invite_code: conv.data?.invite_code ?? null, people: people.data ?? [] };
  },

  // With no conversation, a new study group of the same name is created too.
  async create({ title, conversationId = null, catalogModuleId = null }) {
    return check(await supabase.rpc('create_workspace', { p_title: title, p_conversation: conversationId, p_catalog_module: catalogModuleId }));
  },

  async rename(id, title) {
    check(await supabase.from('workspaces').update({ title }).eq('id', id));
  },

  async remove(id) {
    check(await supabase.from('workspaces').delete().eq('id', id));
  },

  // ---------- Files: one folder per workspace ----------
  async files(id) {
    const rows = check(await supabase.storage.from(BUCKET).list(id, { sortBy: { column: 'created_at', order: 'desc' } }));
    return rows.filter((f) => f.name !== '.emptyFolderPlaceholder');
  },

  async upload(id, file) {
    const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (error) throw new Error(error.message);
  },

  async fileUrl(id, name) {
    return check(await supabase.storage.from(BUCKET).createSignedUrl(`${id}/${name}`, 300)).signedUrl;
  },

  async removeFile(id, name) {
    check(await supabase.storage.from(BUCKET).remove([`${id}/${name}`]));
  },
};

// "3f2…-lecture_notes.pdf" -> "lecture_notes.pdf"
export const displayFileName = (name) => name.replace(/^[0-9a-f-]{36}-/, '');
