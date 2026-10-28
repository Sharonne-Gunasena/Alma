import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Plus, Shapes } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { MIGRATION_HINT, needsMigration, workspaceApi } from '../lib/workspaces.js';
import { chatApi } from '../lib/chat.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, PageHeader, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Input, Select } from '../ui/form.jsx';
import { Modal } from '../ui/dialog.jsx';
import { WorkspacesLocked } from './Workspace.jsx';

export default function Workspaces() {
  const { user, modules } = useApp();
  const [creating, setCreating] = useState(false);
  const [list, , error] = useLoad(() => (user ? workspaceApi.list() : Promise.resolve([])), [user?.id]);

  if (!user)
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow="Workspaces" title="Group projects" />
        <WorkspacesLocked />
      </div>
    );

  const moduleFor = (catalogId) => modules.find((m) => m.catalog_module_id && m.catalog_module_id === catalogId);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspaces"
        title="Group projects"
        description="A shared whiteboard, notes, tasks and files for each study group, all editable together in real time."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> New workspace
          </Button>
        }
      />

      {error && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{needsMigration({ message: error }) ? MIGRATION_HINT : error}</p>}

      {!list && !error ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : (list ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={Shapes} title="No workspaces yet">
            Start one for a group project or study session, then share the invite link.
            <div className="mt-4">
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New workspace
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w, i) => {
            const m = moduleFor(w.catalog_module_id);
            return (
              <motion.div key={w.id} custom={i} variants={fadeUp} initial="hidden" animate="show">
                <Card as="a" href={`#/workspaces/${w.id}`} interactive className="group relative flex h-full flex-col gap-3 overflow-hidden p-5 text-fg no-underline">
                  <div className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-3xl border-2 border-dashed border-line transition-transform duration-500 group-hover:rotate-12" />
                  <span className="grid size-10 place-items-center rounded-xl bg-soft text-indigo-600 dark:text-indigo-300">
                    <Shapes className="size-5" />
                  </span>
                  <p className="text-[17px] leading-snug font-semibold tracking-tight">{w.title}</p>
                  <p className="mt-auto text-xs text-muted">
                    {m ? `${m.code ?? m.name} · ` : ''}created {new Date(w.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <NewWorkspaceSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewWorkspaceSheet({ open, onClose }) {
  const { modules } = useApp();
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [groups] = useLoad(async () => (open ? (await chatApi.overview().catch(() => [])).filter((c) => c.kind === 'group') : []), [open]);
  const shared = modules.filter((m) => m.catalog_module_id);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const catalogId = shared.find((m) => m.id === moduleId)?.catalog_module_id ?? null;
      const id = await workspaceApi.create({ title: title.trim(), conversationId: group || null, catalogModuleId: catalogId });
      go(`/workspaces/${id}`);
    } catch (err) {
      toast.error(needsMigration(err) ? MIGRATION_HINT : err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      side="right"
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="New workspace"
      description="Everyone in the study group can edit it together."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="ws-form" disabled={busy || !title.trim()}>
            Create workspace
          </Button>
        </>
      }
    >
      <form id="ws-form" onSubmit={create} className="flex flex-col gap-4">
        <Field label="Name">
          <Input autoFocus required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Databases group project" />
        </Field>
        <Field label="Study group" hint={group ? 'Members of this group get the workspace.' : 'A new study group with the same name is created; invite people with its link.'}>
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">New study group</option>
            {(groups ?? []).map((g) => (
              <option key={g.conversation_id} value={g.conversation_id}>
                {g.title}
              </option>
            ))}
          </Select>
        </Field>
        {shared.length > 0 && (
          <Field label="Module (optional)">
            <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">None</option>
              {shared.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ${m.name}` : m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
