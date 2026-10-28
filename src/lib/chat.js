// Chat calls to Supabase. Every change to a chat goes through a database function
// or a row policy, so the rules hold even if this file is bypassed.
import { supabase } from '../supabase.js';

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export const chatApi = {
  // Module channels follow the student's modules, so sync first.
  async overview() {
    await check(await supabase.rpc('sync_module_channels'));
    return check(await supabase.rpc('chat_overview'));
  },

  async people(conversationId) {
    return check(await supabase.rpc('chat_people', { p_conversation: conversationId }));
  },

  async classmates() {
    return check(await supabase.rpc('chat_classmates'));
  },

  // The newest 100 messages. Older history is not paged yet.
  async messages(conversationId) {
    const rows = check(
      await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100),
    );
    return rows.reverse();
  },

  async send(conversationId, body) {
    return check(await supabase.from('messages').insert({ conversation_id: conversationId, body }).select('id, conversation_id, sender_id, body, created_at').single());
  },

  async deleteMessage(messageId) {
    check(await supabase.from('messages').delete().eq('id', messageId));
  },

  // Row policies only let the student change their own membership.
  async markRead(conversationId) {
    check(await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId));
  },

  async setMuted(conversationId, muted) {
    check(await supabase.from('conversation_members').update({ muted }).eq('conversation_id', conversationId));
  },

  async createGroup(title) {
    return check(await supabase.rpc('create_group', { p_title: title }));
  },

  async joinGroup(code) {
    return check(await supabase.rpc('join_group', { p_code: code }));
  },

  async addToGroup(conversationId, userId) {
    check(await supabase.rpc('add_to_group', { p_conversation: conversationId, p_user: userId }));
  },

  async startDirect(userId) {
    return check(await supabase.rpc('start_direct_message', { p_user: userId }));
  },

  async answerRequest(conversationId, accept) {
    check(await supabase.rpc('answer_request', { p_conversation: conversationId, p_accept: accept }));
  },

  async leave(conversationId) {
    check(await supabase.rpc('leave_conversation', { p_conversation: conversationId }));
  },

  async blockedIds() {
    return check(await supabase.from('chat_blocks').select('blocked_id')).map((r) => r.blocked_id);
  },

  async block(userId) {
    check(await supabase.from('chat_blocks').insert({ blocked_id: userId }));
  },

  async unblock(userId) {
    check(await supabase.from('chat_blocks').delete().eq('blocked_id', userId));
  },

  async report({ conversationId, reportedUserId, message, reason, details }) {
    check(
      await supabase.from('chat_reports').insert({
        conversation_id: conversationId,
        reported_user_id: reportedUserId,
        message_id: message?.id ?? null,
        message_body: message?.body ?? null,
        reason: [reason, details?.trim()].filter(Boolean).join(': ').slice(0, 500),
      }),
    );
  },
};

// Calls onChange whenever something in the student's chats changes. Realtime only
// sends rows the student is allowed to read.
export function watchInbox(onChange) {
  const channel = supabase
    .channel('chat-inbox')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// New messages in one chat.
export function watchMessages(conversationId, onInsert) {
  const channel = supabase
    .channel(`chat-messages-${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) =>
      onInsert(row),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Who is online in a chat, and who is typing. Presence and typing are not stored in the database.
export function joinRoom(conversationId, me, { onOnline, onTyping }) {
  const channel = supabase.channel(`chat-room-${conversationId}`, { config: { presence: { key: me.id } } });
  channel
    .on('presence', { event: 'sync' }, () => onOnline(Object.keys(channel.presenceState())))
    .on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(payload))
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ name: me.name });
    });
  return {
    typing: () => channel.send({ type: 'broadcast', event: 'typing', payload: { userId: me.id, name: me.name } }),
    leave: () => supabase.removeChannel(channel),
  };
}
