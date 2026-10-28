import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { EditorContent, useEditor } from '@tiptap/react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { CalendarPlus, Copy, Ellipsis, ListChecks, MessagesSquare, Paperclip, PenLine, Plus, Shapes, Trash, UserPlus, Users } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { WorkspaceSync, colorFor } from '../lib/collab.js';
import { MIGRATION_HINT, displayFileName, needsMigration, workspaceApi } from '../lib/workspaces.js';
import { inviteLink } from '../lib/chatRules.js';
import { buildExtensions, imageToDataUrl } from '../ui/editor/extensions.js';
import { Toolbar } from './GuideEditor.jsx';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, EmptyState, ModuleBadge, Segmented, Skeleton } from '../ui/primitives.jsx';
import { Checkbox, Input, Select } from '../ui/form.jsx';
import { Menu, useDialogs } from '../ui/dialog.jsx';
import { Dropzone } from '../ui/Dropzone.jsx';
import { cn } from '../ui/cn.js';

const WorkspaceBoard = lazy(() => import('./WorkspaceBoard.jsx'));

export default function Workspace({ workspaceId }) {
  const { user } = useApp();
  const [ws, reload, error] = useLoad(() => (user ? workspaceApi.get(workspaceId) : Promise.resolve(null)), [workspaceId, user?.id]);

  if (!user) return <WorkspacesLocked />;
  if (error)
    return (
      <Card>
        <EmptyState icon={Shapes} title={needsMigration({ message: error }) ? 'Workspaces need a database update' : 'Workspace not found'}>
          {needsMigration({ message: error }) ? MIGRATION_HINT : <a href="#/workspaces">Back to workspaces</a>}
        </EmptyState>
      </Card>
    );
  if (!ws)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[60vh] rounded-2xl" />
      </div>
    );
  return <Room key={ws.id} ws={ws} reload={reload} />;
}

export function WorkspacesLocked() {
  return (
    <Card>
      <EmptyState icon={Shapes} title="Create an account to use workspaces">
        Workspaces are shared with your study group (a whiteboard, notes, tasks and files), so they need an account.
      </EmptyState>
    </Card>
  );
}

function Room({ ws, reload }) {
  const { user, profile, modules } = useApp();
  const dialogs = useDialogs();
  const doc = useMemo(() => new Y.Doc(), [ws.id]);
  const [status, setStatus] = useState('loading');
  const [peers, setPeers] = useState([]);
  const [tab, setTab] = useState('board');
  const [title, setTitle] = useState(ws.title);
  const me = { id: user.id, name: profile?.display_name || 'Student' };

  useEffect(() => {
    const sync = new WorkspaceSync({ workspaceId: ws.id, doc, me, onStatus: setStatus, onPeers: setPeers });
    sync.start().catch((err) => {
      setStatus('offline');
      toast.error(needsMigration(err) ? MIGRATION_HINT : `Couldn't load the workspace: ${err.message}`);
    });
    return () => {
      sync.stop();
      doc.destroy();
    };
  }, [doc]);

  async function rename() {
    const t = title.trim();
    if (!t || t === ws.title) return setTitle(ws.title);
    await workspaceApi.rename(ws.id, t).catch((e) => toast.error(e.message));
  }

  async function copyInvite() {
    if (!ws.invite_code) return;
    await navigator.clipboard.writeText(inviteLink(ws.invite_code, `${window.location.origin}${window.location.pathname}`));
    toast.success('Invite link copied', { description: 'Anyone with the link joins the study group and its workspace.' });
  }

  async function remove() {
    if (!(await dialogs.confirm({ title: `Delete "${ws.title}"?`, description: "The whiteboard, notes, tasks and files are deleted for everyone. The group chat stays. This can't be undone.", confirmLabel: 'Delete workspace', danger: true })))
      return;
    try {
      const files = await workspaceApi.files(ws.id).catch(() => []);
      for (const f of files) await workspaceApi.removeFile(ws.id, f.name);
      await workspaceApi.remove(ws.id);
      go('/workspaces');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const moduleId = modules.find((m) => m.catalog_module_id && m.catalog_module_id === ws.catalog_module_id)?.id;
  const online = new Set(peers.map((p) => p.id));

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="#/workspaces">Workspaces</BackLink>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full bg-transparent text-3xl font-semibold tracking-[-0.03em] outline-none sm:text-4xl"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <SyncStatus status={status} />
            {moduleId && <ModuleBadge moduleId={moduleId} />}
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" /> {ws.people.length} member{ws.people.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex -space-x-2">
            {ws.people.slice(0, 6).map((p) => (
              <span
                key={p.user_id}
                title={`${p.display_name}${online.has(p.user_id) ? ' (here now)' : ''}`}
                className={cn('grid size-8 place-items-center rounded-full border-2 border-bg text-xs font-semibold text-white', !online.has(p.user_id) && 'opacity-40')}
                style={{ background: colorFor(p.user_id) }}
              >
                {(p.display_name || 'S')[0].toUpperCase()}
              </span>
            ))}
          </div>
          <Button size="sm" onClick={copyInvite}>
            <UserPlus /> Invite
          </Button>
          <Button size="sm" href={`#/chat/${ws.conversation_id}`}>
            <MessagesSquare /> Chat
          </Button>
          <Menu
            trigger={
              <Button size="icon" aria-label="More">
                <Ellipsis />
              </Button>
            }
            items={[{ label: 'Copy invite link', icon: Copy, onSelect: copyInvite }, ws.created_by === user.id && '-', ws.created_by === user.id && { label: 'Delete workspace', icon: Trash, onSelect: remove, danger: true }]}
          />
        </div>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'board', label: 'Board', icon: Shapes },
          { value: 'notes', label: 'Notes', icon: PenLine },
          { value: 'tasks', label: 'Tasks', icon: ListChecks },
          { value: 'files', label: 'Files', icon: Paperclip },
        ]}
      />

      {tab === 'board' && (
        <Suspense fallback={<Skeleton className="h-[72vh] rounded-2xl" />}>
          <WorkspaceBoard doc={doc} name={ws.title} />
        </Suspense>
      )}
      {tab === 'notes' && <NotesPanel doc={doc} />}
      {tab === 'tasks' && <TasksPanel doc={doc} ws={ws} moduleId={moduleId} />}
      {tab === 'files' && <FilesPanel ws={ws} />}
    </div>
  );
}

function SyncStatus({ status }) {
  const states = {
    loading: ['bg-slate-400', 'Connecting…'],
    live: ['bg-emerald-500', 'Live'],
    saved: ['bg-emerald-500', 'Saved'],
    offline: ['bg-amber-500', 'Offline: changes save when you reconnect'],
  };
  const [dot, label] = states[status] ?? states.loading;
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', dot, status === 'live' && 'animate-pulse')} /> {label}
    </span>
  );
}

// ---------- Shared notes ----------

function NotesPanel({ doc }) {
  const dialogs = useDialogs();
  const editorRef = useRef();
  const handlers = useRef({});
  handlers.current.editMath = async (kind, node, pos) => {
    const latex = await dialogs.prompt({ title: 'Edit maths', defaultValue: node.attrs.latex, confirmLabel: 'Save' });
    if (latex == null) return;
    const chain = editorRef.current.chain().focus();
    kind === 'block' ? chain.updateBlockMath({ latex, pos }).run() : chain.updateInlineMath({ latex, pos }).run();
  };
  const extensions = useMemo(() => buildExtensions({ ydoc: doc, placeholder: 'Shared notes: everyone in the group can edit at the same time…', onEditMath: (...a) => handlers.current.editMath(...a) }), [doc]);
  const editor = useEditor(
    {
      extensions,
      shouldRerenderOnTransaction: true,
      editorProps: { attributes: { class: 'prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight' } },
    },
    [doc],
  );
  editorRef.current = editor;

  async function addLink() {
    const href = await dialogs.prompt({ title: 'Link', placeholder: 'https://…', defaultValue: editor.getAttributes('link').href ?? '', confirmLabel: 'Save' });
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    href ? chain.setLink({ href }).run() : chain.unsetLink().run();
  }
  async function addMath(kind) {
    const latex = await dialogs.prompt({ title: kind === 'block' ? 'Insert equation' : 'Insert inline maths', placeholder: 'E = mc^2', confirmLabel: 'Insert' });
    if (latex) kind === 'block' ? editor.chain().focus().insertBlockMath({ latex }).run() : editor.chain().focus().insertInlineMath({ latex }).run();
  }
  async function addImage(file) {
    // Small images only: they travel with every live update.
    editor.chain().focus().setImage({ src: await imageToDataUrl(file, 800), alt: file.name }).run();
  }

  if (!editor) return null;
  return (
    <div className="flex flex-col gap-3">
      <Toolbar editor={editor} onImage={addImage} onLink={addLink} onMath={addMath} />
      <Card className="guide-editor px-5 py-6 sm:px-10 sm:py-8">
        <EditorContent editor={editor} />
      </Card>
    </div>
  );
}

// ---------- Tasks ----------

function useYArray(arr) {
  const [items, setItems] = useState(() => arr.toArray());
  useEffect(() => {
    const update = () => setItems(arr.toArray());
    arr.observe(update);
    update();
    return () => arr.unobserve(update);
  }, [arr]);
  return items;
}

function TasksPanel({ doc, ws, moduleId }) {
  const { db } = useApp();
  const tasks = doc.getArray('tasks');
  const items = useYArray(tasks);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');

  const replace = (id, patch) => {
    const i = tasks.toArray().findIndex((t) => t.id === id);
    if (i < 0) return;
    doc.transact(() => {
      const t = tasks.get(i);
      tasks.delete(i, 1);
      tasks.insert(i, [{ ...t, ...patch }]);
    });
  };

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    tasks.push([{ id: crypto.randomUUID(), text: text.trim(), done: false, due: due || null, assignee: null }]);
    setText('');
    setDue('');
  }

  async function toPlanner(t) {
    const dueAt = t.due ? new Date(`${t.due}T17:00`) : new Date(Date.now() + 7 * 864e5);
    try {
      await db.insert('assignments', { title: `${ws.title}: ${t.text}`, module_id: moduleId ?? null, due_at: dueAt.toISOString(), effort_hours: 2, priority: 2, hours_done: 0, status: 'todo' });
      toast.success('Added to your planner', { description: 'Study time has been scheduled for it.', action: { label: 'Open planner', onClick: () => go('/planner') } });
    } catch (err) {
      toast.error(err.message);
    }
  }

  const open = items.filter((t) => !t.done);
  const done = items.filter((t) => t.done);

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task for the group…" className="flex-1" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-44" aria-label="Due date" />
        <Button variant="primary">
          <Plus /> Add
        </Button>
      </form>
      {items.length === 0 && <p className="py-6 text-center text-sm text-muted">No tasks yet. Split the project into pieces and assign them.</p>}
      <ul className="flex flex-col gap-1.5">
        {[...open, ...done].map((t) => (
          <motion.li layout key={t.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5', t.done && 'opacity-55')}>
            <Checkbox checked={t.done} onChange={(v) => replace(t.id, { done: v })} />
            <span className={cn('min-w-0 flex-1 text-sm', t.done && 'line-through')}>{t.text}</span>
            {t.due && <span className="text-xs text-muted">{new Date(`${t.due}T00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>}
            <Select value={t.assignee ?? ''} onChange={(e) => replace(t.id, { assignee: e.target.value || null })} className="h-8 w-36 rounded-full text-xs">
              <option value="">Unassigned</option>
              {ws.people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
            <Button size="icon" variant="ghost" title="Add to my planner" onClick={() => toPlanner(t)}>
              <CalendarPlus />
            </Button>
            <Button size="icon" variant="danger" title="Delete task" onClick={() => tasks.delete(tasks.toArray().findIndex((x) => x.id === t.id), 1)}>
              <Trash />
            </Button>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Files ----------

function FilesPanel({ ws }) {
  const [files, reload, error] = useLoad(() => workspaceApi.files(ws.id), [ws.id]);
  const [busy, setBusy] = useState(false);

  async function upload(file) {
    if (file.size > 25 * 1024 * 1024) return toast.error('Files can be up to 25 MB.');
    setBusy(true);
    try {
      await workspaceApi.upload(ws.id, file);
      toast.success(`Uploaded ${file.name}`);
      reload();
    } catch (err) {
      toast.error(needsMigration(err) ? MIGRATION_HINT : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Dropzone onFile={upload} icon={Paperclip} title={busy ? 'Uploading…' : 'Drop a file to share with the group'} subtitle="Slides, PDFs, images, anything up to 25 MB" />
      {error && <p className="text-sm text-rose-600">{needsMigration({ message: error }) ? MIGRATION_HINT : error}</p>}
      <Card className="divide-y divide-line">
        {(files ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted">No files yet.</p>}
        {(files ?? []).map((f) => (
          <div key={f.name} className="flex items-center gap-3 px-4 py-3">
            <Paperclip className="size-4 shrink-0 text-muted" />
            <button className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-indigo-600" onClick={async () => window.open(await workspaceApi.fileUrl(ws.id, f.name), '_blank', 'noopener')}>
              {displayFileName(f.name)}
            </button>
            <span className="shrink-0 text-xs text-muted">{f.metadata?.size ? `${Math.max(1, Math.round(f.metadata.size / 1024))} KB` : ''}</span>
            <Button
              size="icon"
              variant="danger"
              title="Delete file"
              onClick={async () => {
                await workspaceApi.removeFile(ws.id, f.name);
                reload();
              }}
            >
              <Trash />
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
