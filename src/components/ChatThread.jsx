import { Fragment, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Bell, BellOff, LogOut, MessagesSquare, MoreHorizontal, Send, UserPlus, Users } from 'lucide-react';
import { chatApi, joinRoom, watchMessages } from '../lib/chat.js';
import { cleanMessage, conversationTitle, dayLabel, formatTime, messageProblem, startsNewDay, typingLabel, visibleMessages } from '../lib/chatRules.js';
import { Menu, useDialogs } from '../ui/dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';
import { InviteSheet } from './ChatSheets.jsx';

const TYPING_HOLD_MS = 3500;

// One conversation: header with presence, messages, typing, and the composer.
export default function ChatThread({ row, people, userId, myName, blockedIds, onChanged }) {
  const dialogs = useDialogs();
  const id = row.conversation_id;
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState({});
  const [inviting, setInviting] = useState(false);
  const roomRef = useRef(null);
  const lastTypingSent = useRef(0);
  const bottom = useRef(null);

  const names = Object.fromEntries((people ?? []).map((p) => [p.user_id, p.display_name]));
  const nameOf = (uid) => (uid === userId ? 'You' : names[uid] ?? 'Student');
  const isDirect = row.kind === 'direct';
  const otherId = row.other_user_id;
  const iBlockedThem = isDirect && blockedIds.includes(otherId);
  const waitingForMe = isDirect && row.status === 'requested' && row.created_by !== userId;
  const waitingForThem = isDirect && row.status === 'requested' && row.created_by === userId;

  // Load history, then append new messages as they arrive.
  useEffect(() => {
    let alive = true;
    setMessages(null);
    chatApi
      .messages(id)
      .then((rows) => alive && setMessages(rows))
      .catch((e) => alive && toast.error(e.message));
    const stop = watchMessages(id, (msg) => setMessages((list) => (list && !list.some((m) => m.id === msg.id) ? [...list, msg] : list)));
    return () => {
      alive = false;
      stop();
    };
  }, [id]);

  // Presence and typing for this chat.
  useEffect(() => {
    setOnline([]);
    setTyping({});
    const room = joinRoom(id, { id: userId, name: myName }, {
      onOnline: setOnline,
      onTyping: ({ userId: who, name }) => {
        if (who === userId) return;
        setTyping((t) => ({ ...t, [who]: name }));
        setTimeout(() => setTyping((t) => {
          const next = { ...t };
          delete next[who];
          return next;
        }), TYPING_HOLD_MS);
      },
    });
    roomRef.current = room;
    return () => {
      room.leave();
      roomRef.current = null;
    };
  }, [id, userId, myName]);

  // Opening a chat (or getting a new message while it is open) marks it read.
  useEffect(() => {
    if (!messages) return;
    chatApi.markRead(id).catch(() => {});
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [id, messages?.length]);

  const visible = messages ? visibleMessages(messages, blockedIds) : null;
  const typers = Object.values(typing);
  const onlineOthers = (people ?? []).filter((p) => p.user_id !== userId && online.includes(p.user_id));

  function onType() {
    if (Date.now() - lastTypingSent.current < 2500) return;
    lastTypingSent.current = Date.now();
    roomRef.current?.typing().catch(() => {});
  }

  async function send(e) {
    e?.preventDefault();
    if (!cleanMessage(draft)) return;
    const problem = messageProblem(draft);
    if (problem) return toast.error(problem);
    setSending(true);
    try {
      const sent = await chatApi.send(id, cleanMessage(draft));
      setDraft('');
      setMessages((list) => (list && !list.some((m) => m.id === sent.id) ? [...list, sent] : list));
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(msg) {
    if (!(await dialogs.confirm({ title: 'Delete this message?', description: 'Everyone in the chat will lose it.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await chatApi.deleteMessage(msg.id);
      setMessages((list) => list.filter((m) => m.id !== msg.id));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleMute() {
    await chatApi.setMuted(id, !row.muted).catch((e) => toast.error(e.message));
    onChanged();
  }

  async function block() {
    const ok = await dialogs.confirm({
      title: `Block ${row.title}?`,
      description: "They can't message you, and you won't see their messages in shared chats. You can unblock them later.",
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    try {
      await chatApi.block(otherId);
      toast.success(`Blocked ${row.title}`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function unblock() {
    await chatApi.unblock(otherId).catch((e) => toast.error(e.message));
    toast.success(`Unblocked ${row.title}`);
    onChanged();
  }

  async function leave() {
    const ok = await dialogs.confirm({
      title: row.kind === 'group' ? `Leave ${row.title}?` : 'Delete this chat?',
      description: row.kind === 'group' ? 'You can rejoin with the invite link.' : 'It is removed from your list. Messages stay for the other person.',
      confirmLabel: row.kind === 'group' ? 'Leave' : 'Delete chat',
      danger: true,
    });
    if (!ok) return;
    await chatApi.leave(id).catch((e) => toast.error(e.message));
    window.location.hash = '/chat';
    onChanged();
  }

  async function answer(accept) {
    try {
      await chatApi.answerRequest(id, accept);
      if (!accept) window.location.hash = '/chat';
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const menuItems = [
    row.kind === 'group' && { label: 'Invite people', icon: UserPlus, onSelect: () => setInviting(true) },
    { label: row.muted ? 'Turn notifications on' : 'Mute chat', icon: row.muted ? Bell : BellOff, onSelect: toggleMute },
    isDirect && !iBlockedThem && { label: 'Block', icon: Ban, danger: true, onSelect: block },
    isDirect && iBlockedThem && { label: 'Unblock', icon: Ban, onSelect: unblock },
    row.kind !== 'module' && '-',
    row.kind !== 'module' && { label: row.kind === 'group' ? 'Leave group' : 'Delete chat', icon: LogOut, danger: true, onSelect: leave },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line pb-3">
        <a href="#/chat" className="grid size-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg md:hidden" aria-label="Back to chats">
          <ArrowLeft className="size-5" />
        </a>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold', row.kind === 'module' ? 'bg-soft text-indigo-700 dark:text-indigo-300' : 'bg-subtle text-muted')}>
          {row.kind === 'module' ? '#' : row.kind === 'group' ? <Users className="size-4" /> : (row.title?.[0] ?? '?').toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conversationTitle(row)}</p>
          <p className="truncate text-xs text-muted">
            {isDirect ? (onlineOthers.length ? 'Online' : 'Offline') : `${row.member_count} member${row.member_count === 1 ? '' : 's'} · ${onlineOthers.length + 1} online`}
          </p>
        </div>
        <Menu
          trigger={
            <button className="grid size-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Chat options">
              <MoreHorizontal className="size-5" />
            </button>
          }
          items={menuItems}
        />
      </header>

      {waitingForMe && (
        <Card className="mt-3 flex flex-col gap-3 p-4">
          <p className="text-sm">
            <span className="font-semibold">{row.title}</span> wants to message you. Accept to see replies, or decline to remove this request.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => answer(true)}>
              Accept
            </Button>
            <Button size="sm" onClick={() => answer(false)}>
              Decline
            </Button>
          </div>
        </Card>
      )}
      {waitingForThem && (
        <p className="mt-3 text-sm text-muted">
          {visible?.length > 0 ? 'Waiting for them to accept. You can send more once they do.' : 'Send one message to start your request. They can reply once they accept.'}
        </p>
      )}
      {iBlockedThem && (
        <p className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2 text-sm text-muted">
          You blocked this person.
          <Button size="sm" onClick={unblock}>
            Unblock
          </Button>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {!visible ? (
          <p className="py-10 text-center text-sm text-muted">Loading messages…</p>
        ) : visible.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No messages yet">
            Say hello. Messages you send here are visible to everyone in this chat.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((msg, i) => {
              const mine = msg.sender_id === userId;
              const prev = visible[i - 1];
              const showName = !mine && !isDirect && (!prev || prev.sender_id !== msg.sender_id || startsNewDay(prev.created_at, msg.created_at));
              return (
                <Fragment key={msg.id}>
                  {startsNewDay(prev?.created_at, msg.created_at) && (
                    <li className="my-3 text-center text-xs font-medium text-muted">{dayLabel(msg.created_at)}</li>
                  )}
                  <li className={cn('group flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                      {showName && <span className="mb-0.5 ml-3 text-xs font-medium text-muted">{nameOf(msg.sender_id)}</span>}
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap',
                          mine ? 'rounded-br-md bg-gradient-to-br from-orange-500 to-red-500 text-white' : 'rounded-bl-md bg-card text-fg ring-1 ring-line',
                        )}
                      >
                        {msg.body}
                      </div>
                      <span className="mt-0.5 flex items-center gap-2 px-2 text-[11px] text-muted">
                        {formatTime(msg.created_at)}
                        {mine && (
                          <button onClick={() => deleteMessage(msg)} className="opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100 focus:opacity-100">
                            Delete
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <div className="h-5 px-1 text-xs text-muted" aria-live="polite">
        {typingLabel(typers)}
      </div>

      {!waitingForMe && !iBlockedThem && !(waitingForThem && visible?.length > 0) && (
        <form onSubmit={send} className="flex items-end gap-2 pt-1">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onType();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message"
            aria-label="Message"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-card px-3.5 py-2.5 text-base outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 sm:text-sm"
          />
          <Button type="submit" variant="primary" size="icon" disabled={sending || !cleanMessage(draft)} aria-label="Send">
            <Send />
          </Button>
        </form>
      )}

      {row.kind === 'group' && (
        <InviteSheet
          open={inviting}
          onClose={() => setInviting(false)}
          group={row}
          members={(people ?? []).map((p) => p.user_id)}
          onAdded={onChanged}
        />
      )}
    </section>
  );
}

