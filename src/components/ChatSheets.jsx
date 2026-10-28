import { useState } from 'react';
import { toast } from 'sonner';
import { Link, Send, UserPlus } from 'lucide-react';
import { chatApi } from '../lib/chat.js';
import { MAX_GROUP_NAME, REPORT_REASONS, inviteLink } from '../lib/chatRules.js';
import { useLoad } from '../context.js';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select, Textarea } from '../ui/form.jsx';
import { Modal } from '../ui/dialog.jsx';
import { Skeleton } from '../ui/primitives.jsx';

const initial = (name) => (name?.trim()?.[0] ?? '?').toUpperCase();

// Classmates: people who share a module channel with the student.
function ClassmateList({ exclude = [], actionLabel, icon: Icon, onPick }) {
  const [people, , error] = useLoad(() => chatApi.classmates(), []);
  const [busy, setBusy] = useState(null);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!people) return <Skeleton className="h-40 rounded-2xl" />;

  const shown = people.filter((p) => !exclude.includes(p.user_id));
  if (shown.length === 0)
    return <p className="text-sm text-muted">No classmates to show yet. People appear here once you share a module channel with them.</p>;

  async function pick(person) {
    setBusy(person.user_id);
    try {
      await onPick(person);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {shown.map((p) => (
        <li key={p.user_id} className="flex items-center gap-3 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-soft text-sm font-semibold text-indigo-700 dark:text-indigo-300">{initial(p.display_name)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.display_name}</span>
          <Button size="sm" variant="secondary" disabled={busy === p.user_id} onClick={() => pick(p)}>
            <Icon /> {actionLabel}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function NewGroupSheet({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await chatApi.createGroup(name.trim());
      setName('');
      onCreated(id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="New study group" description="Invite classmates after you create it, or share an invite link.">
      <form onSubmit={create} className="flex flex-col gap-4">
        <Field label="Group name">
          <Input value={name} maxLength={MAX_GROUP_NAME} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exam crew" autoFocus />
        </Field>
        <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
          Create group
        </Button>
      </form>
    </Modal>
  );
}

export function MessageSheet({ open, onClose, onPick }) {
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Message a classmate" description="Start a direct message with someone who shares a module with you.">
      {open && (
        <ClassmateList
          actionLabel="Message"
          icon={Send}
          onPick={async (p) => {
            await onPick(p);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

export function InviteSheet({ open, onClose, group, members, onAdded }) {
  const link = group?.invite_code ? inviteLink(group.invite_code, `${window.location.origin}${window.location.pathname}`) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`Invite to ${group?.title ?? 'group'}`} description="Anyone with the link can join. You can also add classmates directly.">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium">Invite link</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-subtle px-3 py-2.5 text-xs">{link}</code>
            <Button variant="secondary" onClick={copy} disabled={!link}>
              <Link /> Copy
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium">Add classmates</p>
          {open && (
            <ClassmateList
              exclude={members}
              actionLabel="Add"
              icon={UserPlus}
              onPick={async (p) => {
                await chatApi.addToGroup(group.conversation_id, p.user_id);
                toast.success(`${p.display_name} joined the group`);
                onAdded();
              }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ReportSheet({ open, onClose, conversationId, reportedUserId, message, onDone }) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  async function send(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await chatApi.report({ conversationId, reportedUserId, message, reason, details });
      toast.success('Thanks. We will look at this report.');
      setDetails('');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={message ? 'Report message' : 'Report person'} description="Reports are read by the CampusLoop team. Nothing is sent to the other person.">
      <form onSubmit={send} className="flex flex-col gap-4">
        {message && <p className="rounded-xl bg-subtle px-3 py-2 text-sm text-muted italic">“{message.body}”</p>}
        <Field label="Why are you reporting this?">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Anything else we should know?" hint="Optional">
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={400} />
        </Field>
        <Button type="submit" variant="primary" disabled={saving}>
          Send report
        </Button>
      </form>
    </Modal>
  );
}
