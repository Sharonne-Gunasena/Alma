import { BellOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import { chatApi } from '../lib/chat.js';
import { badgeText, conversationTitle, formatTime, previewOf, unreadOf } from '../lib/chatRules.js';
import { Button } from '../ui/Button.jsx';
import { cn } from '../ui/cn.js';

// The inbox: module channels, groups, direct messages, then requests waiting for an answer.
export default function ChatList({ sections, activeId, userId, onAnswered }) {
  const total = sections.modules.length + sections.groups.length + sections.direct.length + sections.requests.length;
  if (total === 0) return null;

  async function answer(row, accept) {
    try {
      await chatApi.answerRequest(row.conversation_id, accept);
      onAnswered(row, accept);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <nav className="flex flex-col gap-5" aria-label="Chats">
      {sections.requests.length > 0 && (
        <Section title="Message requests">
          {sections.requests.map((row) => (
            <div key={row.conversation_id} className="flex flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-line">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted">Wants to message you</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => answer(row, true)}>
                  Accept
                </Button>
                <Button size="sm" onClick={() => answer(row, false)}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </Section>
      )}
      {sections.modules.length > 0 && (
        <Section title="Module channels">
          {sections.modules.map((row) => (
            <ChatRow key={row.conversation_id} row={row} active={activeId === row.conversation_id} userId={userId} />
          ))}
        </Section>
      )}
      {sections.groups.length > 0 && (
        <Section title="Study groups">
          {sections.groups.map((row) => (
            <ChatRow key={row.conversation_id} row={row} active={activeId === row.conversation_id} userId={userId} />
          ))}
        </Section>
      )}
      {sections.direct.length > 0 && (
        <Section title="Direct messages">
          {sections.direct.map((row) => (
            <ChatRow key={row.conversation_id} row={row} active={activeId === row.conversation_id} userId={userId} />
          ))}
        </Section>
      )}
    </nav>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ChatRow({ row, active, userId }) {
  const unread = unreadOf(row);
  const isModule = row.kind === 'module';
  const waiting = row.kind === 'direct' && row.status === 'requested' && row.created_by === userId;

  return (
    <a
      href={`#/chat/${row.conversation_id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 no-underline transition-colors',
        active ? 'bg-card shadow-card ring-1 ring-line' : 'text-fg hover:bg-subtle',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold', isModule ? 'bg-soft text-indigo-700 dark:text-indigo-300' : 'bg-subtle text-muted')}>
        {isModule ? '#' : row.kind === 'group' ? <Users className="size-4" /> : (row.title?.[0] ?? '?').toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>{conversationTitle(row)}</span>
          {row.muted && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
        </span>
        <span className="block truncate text-xs text-muted">{waiting ? 'Waiting for them to accept' : previewOf(row, userId)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {row.last_message_at && <span className="text-[11px] text-muted">{formatTime(row.last_message_at)}</span>}
        {unread > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-700 px-1.5 text-[11px] font-semibold text-white">{badgeText(unread)}</span>
        )}
      </span>
    </a>
  );
}
