import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessagesSquare, Plus, Send, Users } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { chatApi, watchInbox } from '../lib/chat.js';
import { groupConversations, isMissingMigration } from '../lib/chatRules.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, PageHeader, Skeleton } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';
import ChatList from './ChatList.jsx';
import ChatThread from './ChatThread.jsx';
import { MessageSheet, NewGroupSheet } from './ChatSheets.jsx';

// Chat needs an account: guests have no server to talk through.
export default function Chat({ conversationId, joinCode }) {
  const { db, user, profile, signOut } = useApp();
  if (db?.kind !== 'cloud' || !user) return <ChatLocked onSignUp={signOut} />;
  return <ChatInbox conversationId={conversationId} joinCode={joinCode} userId={user.id} myName={profile?.display_name || 'Student'} />;
}

function ChatLocked({ onSignUp }) {
  return (
    <Card className="mx-auto max-w-md">
      <EmptyState icon={MessagesSquare} title="Create an account to chat">
        Join your module channels, study groups and direct messages with an account. Your flashcards and guides stay in this browser.
      </EmptyState>
      <div className="mt-4 flex justify-center">
        <Button variant="primary" onClick={onSignUp}>
          Create an account
        </Button>
      </div>
    </Card>
  );
}

function ChatInbox({ conversationId, joinCode, userId, myName }) {
  const [inbox, reloadInbox, inboxError] = useLoad(() => chatApi.overview(), [userId]);
  const [blocked, reloadBlocks] = useLoad(() => chatApi.blockedIds(), [userId]);
  const [people, reloadPeople] = useLoad(() => (conversationId ? chatApi.people(conversationId) : Promise.resolve([])), [conversationId, userId]);
  const [creating, setCreating] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [joining, setJoining] = useState(false);

  // Any change to the student's chats refreshes the inbox. Membership changes also refresh the member names.
  useEffect(
    () =>
      watchInbox((payload) => {
        reloadInbox();
        if (payload?.table === 'conversation_members') reloadPeople();
      }),
    [userId],
  );

  const sections = groupConversations(inbox ?? [], userId);
  const active = inbox?.find((r) => r.conversation_id === conversationId);
  const showThread = Boolean(conversationId || joinCode);
  const migrationMissing = inboxError && isMissingMigration(inboxError);

  async function startDirect(person) {
    const id = await chatApi.startDirect(person.user_id);
    reloadInbox();
    go(`/chat/${id}`);
  }

  async function join() {
    setJoining(true);
    try {
      const id = await chatApi.joinGroup(joinCode);
      reloadInbox();
      go(`/chat/${id}`);
    } catch (err) {
      toast.error(err.message);
      setJoining(false);
    }
  }

  function answered(row, accept) {
    reloadInbox();
    if (accept) go(`/chat/${row.conversation_id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={cn(showThread && 'max-md:hidden')}>
        <PageHeader
          eyebrow="Study together"
          title="Chat"
          description="Talk with classmates on your modules, in study groups, or one to one."
          actions={
            <>
              <Button onClick={() => setMessaging(true)}>
                <Send /> Message
              </Button>
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New group
              </Button>
            </>
          }
        />
      </div>

      {migrationMissing && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          Chat needs a database update: run <code>supabase/migrations/005_chat.sql</code> in the Supabase SQL Editor, then reload this page.
        </p>
      )}
      {inboxError && !migrationMissing && <p className="text-sm text-rose-600">{inboxError}</p>}

      <div className="flex flex-col gap-4 md:grid md:h-[68vh] md:min-h-[480px] md:grid-cols-[300px_minmax(0,1fr)] md:gap-6">
        <aside className={cn('min-h-0 overflow-y-auto md:pr-1', showThread && 'max-md:hidden')}>
          {!inbox && !inboxError ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : inbox?.length === 0 ? (
            <Card>
              <EmptyState icon={Users} title="No chats yet">
                Your module channels appear here once your modules are on your account. You can also start a study group or message a classmate.
              </EmptyState>
            </Card>
          ) : (
            <ChatList sections={sections} activeId={conversationId} userId={userId} onAnswered={answered} />
          )}
        </aside>

        <div className={cn('flex min-h-0 min-w-0 flex-col', !showThread && 'max-md:hidden')}>
          {joinCode ? (
            <Card className="flex flex-col items-center gap-4 p-8 text-center">
              <EmptyState icon={Users} title="Join this study group?">
                You will see its messages and can invite classmates.
              </EmptyState>
              <Button variant="primary" onClick={join} disabled={joining}>
                Join group
              </Button>
            </Card>
          ) : !conversationId ? (
            <Card className="hidden flex-1 md:flex">
              <EmptyState icon={MessagesSquare} title="Pick a chat">
                Choose a module channel, a study group or a direct message on the left.
              </EmptyState>
            </Card>
          ) : active ? (
            <Card className="flex h-[calc(100dvh-13rem)] min-h-0 flex-col p-4 md:h-full">
              <ChatThread
                key={active.conversation_id}
                row={active}
                people={people}
                userId={userId}
                myName={myName}
                blockedIds={blocked ?? []}
                onChanged={() => {
                  reloadInbox();
                  reloadBlocks();
                }}
              />
            </Card>
          ) : inbox ? (
            <Card>
              <EmptyState icon={MessagesSquare} title="Chat not found">
                It may have been deleted, or you have left it.
              </EmptyState>
            </Card>
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          )}
        </div>
      </div>

      <NewGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          reloadInbox();
          toast.success('Group created. Invite classmates from the menu.');
          go(`/chat/${id}`);
        }}
      />
      <MessageSheet open={messaging} onClose={() => setMessaging(false)} onPick={startDirect} />
    </div>
  );
}
