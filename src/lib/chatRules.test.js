import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_LENGTH,
  badgeText,
  conversationTitle,
  dayLabel,
  groupConversations,
  inviteLink,
  isMissingMigration,
  messageProblem,
  previewOf,
  startsNewDay,
  typingLabel,
  unreadTotal,
  visibleMessages,
} from './chatRules.js';

const ME = 'me-id';

describe('messageProblem', () => {
  it('asks for text when the message is blank', () => {
    expect(messageProblem('   ')).toBe('Type a message first.');
    expect(messageProblem(undefined)).toBe('Type a message first.');
  });

  it('accepts ordinary messages and rejects ones over the limit', () => {
    expect(messageProblem('  hello  ')).toBeNull();
    expect(messageProblem('a'.repeat(MAX_MESSAGE_LENGTH))).toBeNull();
    expect(messageProblem('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toMatch(/up to 2000/);
  });

  it('counts characters, not UTF-16 units, like the database does', () => {
    expect(messageProblem('😀'.repeat(MAX_MESSAGE_LENGTH))).toBeNull();
    expect(messageProblem('😀'.repeat(MAX_MESSAGE_LENGTH + 1))).not.toBeNull();
  });
});

describe('groupConversations', () => {
  const rows = [
    { conversation_id: 'a', kind: 'module', title: 'COMP10110' },
    { conversation_id: 'b', kind: 'group', title: 'Exam crew' },
    { conversation_id: 'c', kind: 'direct', status: 'active', created_by: ME },
    { conversation_id: 'd', kind: 'direct', status: 'requested', created_by: 'stranger' },
    { conversation_id: 'e', kind: 'direct', status: 'requested', created_by: ME },
  ];

  it('puts each chat in its section', () => {
    const s = groupConversations(rows, ME);
    expect(s.modules.map((r) => r.conversation_id)).toEqual(['a']);
    expect(s.groups.map((r) => r.conversation_id)).toEqual(['b']);
    expect(s.requests.map((r) => r.conversation_id)).toEqual(['d']);
    expect(s.direct.map((r) => r.conversation_id)).toEqual(['c', 'e']);
  });

  it('keeps requests I sent out of the requests section', () => {
    expect(groupConversations([rows[4]], ME).requests).toEqual([]);
  });
});

describe('unread counts', () => {
  it('adds up unread messages and skips muted chats', () => {
    const rows = [
      { unread: '3', muted: false },
      { unread: 2, muted: true },
      { unread: 0, muted: false },
    ];
    expect(unreadTotal(rows)).toBe(3);
  });

  it('caps the badge at 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(120)).toBe('99+');
  });
});

describe('labels', () => {
  it('prefixes module channels with a hash', () => {
    expect(conversationTitle({ kind: 'module', title: 'COMP10110' })).toBe('#COMP10110');
    expect(conversationTitle({ kind: 'group', title: 'Exam crew' })).toBe('Exam crew');
    expect(conversationTitle({ kind: 'direct', title: null })).toBe('Chat');
  });

  it('says who sent the last message', () => {
    expect(previewOf({ last_body: 'See you at 3', last_sender_id: ME }, ME)).toBe('You: See you at 3');
    expect(previewOf({ last_body: 'Hi\n\nthere', last_sender_id: 'x' }, ME)).toBe('Hi there');
    expect(previewOf({ last_body: null }, ME)).toBe('No messages yet');
  });

  it('describes who is typing', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Ana'])).toBe('Ana is typing…');
    expect(typingLabel(['Ana', 'Ben'])).toBe('Ana and Ben are typing…');
    expect(typingLabel(['Ana', 'Ben', 'Cal'])).toBe('3 people are typing…');
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 28, 15, 0);

  it('labels days in the thread', () => {
    expect(dayLabel(new Date(2026, 9, 28, 9).toISOString(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 27, 23).toISOString(), now)).toBe('Yesterday');
  });

  it('starts a new day group only when the date changes', () => {
    const morning = new Date(2026, 9, 28, 8).toISOString();
    const evening = new Date(2026, 9, 28, 20).toISOString();
    const nextDay = new Date(2026, 9, 29, 8).toISOString();
    expect(startsNewDay(null, morning)).toBe(true);
    expect(startsNewDay(morning, evening)).toBe(false);
    expect(startsNewDay(evening, nextDay)).toBe(true);
  });
});

describe('visibleMessages', () => {
  it('hides messages from blocked people', () => {
    const messages = [
      { id: 1, sender_id: 'ana' },
      { id: 2, sender_id: 'ben' },
    ];
    expect(visibleMessages(messages, ['ben']).map((m) => m.id)).toEqual([1]);
    expect(visibleMessages(messages, [])).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('builds invite links that open the join screen', () => {
    expect(inviteLink('abc123', 'https://example.test/app/')).toBe('https://example.test/app/#/chat/join/abc123');
  });

  it('recognises the error from a database without migration 005', () => {
    expect(isMissingMigration("Could not find the function public.chat_overview() in the schema cache")).toBe(true);
    expect(isMissingMigration('relation "public.conversations" does not exist')).toBe(true);
    expect(isMissingMigration('You are sending messages too quickly.')).toBe(false);
  });
});
