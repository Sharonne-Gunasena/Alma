// Chat helpers that don't touch the network, so they can be tested directly.
// The database enforces the same limits (see supabase/migrations/005_chat.sql);
// these checks only give students a clear message before they send.

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_GROUP_NAME = 60;
export const REPORT_REASONS = ['Spam or scam', 'Harassment or bullying', 'Inappropriate content', 'Something else'];

export const cleanMessage = (text) => (text ?? '').trim();

// The problem to show before sending, or null when the message is fine.
export function messageProblem(text) {
  const body = cleanMessage(text);
  if (!body) return 'Type a message first.';
  if ([...body].length > MAX_MESSAGE_LENGTH) return `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`;
  return null;
}

// Splits the inbox into the sections the brief lists: module channels, groups, direct messages and requests.
export function groupConversations(rows, userId) {
  const sections = { modules: [], groups: [], direct: [], requests: [] };
  for (const row of rows) {
    if (row.kind === 'module') sections.modules.push(row);
    else if (row.kind === 'group') sections.groups.push(row);
    else if (row.status === 'requested' && row.created_by !== userId) sections.requests.push(row);
    else sections.direct.push(row);
  }
  return sections;
}

// Muted chats still exist, but they don't add to the badge.
export const unreadOf = (row) => (row.muted ? 0 : Number(row.unread) || 0);

export const unreadTotal = (rows) => rows.reduce((sum, row) => sum + unreadOf(row), 0);

export const badgeText = (n) => (n > 99 ? '99+' : String(n));

export const conversationTitle = (row) => (row.kind === 'module' ? `#${row.title}` : row.title || 'Chat');

export function previewOf(row, userId) {
  if (!row.last_body) return 'No messages yet';
  const body = row.last_body.replace(/\s+/g, ' ');
  return row.last_sender_id === userId ? `You: ${body}` : body;
}

// "14:05" today, "Mon" this week, then "3 Nov".
export function formatTime(iso, now = new Date()) {
  const date = new Date(iso);
  const days = daysBetween(now, date);
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Calendar days between two dates. Rounds, because days can be 23 or 25 hours long.
const daysBetween = (later, earlier) => Math.round((startOfDay(later) - startOfDay(earlier)) / 86400000);

// True when a date label should appear above this message.
export const startsNewDay = (prevIso, iso) => !prevIso || new Date(prevIso).toDateString() !== new Date(iso).toDateString();

export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  const days = daysBetween(now, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

// Hides messages from people the student has blocked.
export function visibleMessages(messages, blockedIds) {
  const blocked = new Set(blockedIds);
  return messages.filter((m) => !blocked.has(m.sender_id));
}

export function typingLabel(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

export const inviteLink = (code, base) => `${base}#/chat/join/${code}`;

// The database was not updated yet, so the chat tables or functions are missing.
export const isMissingMigration = (message) => /chat_overview|sync_module_channels|conversations|could not find the (function|table)/i.test(message ?? '');
