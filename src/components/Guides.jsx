import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { BookText, FileText, LayoutTemplate, NotebookPen, Plus, ScrollText, Sparkles, Zap } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { TEMPLATES, fromLectureGuide, plainText, sections } from '../lib/guides.js';
import { activeAI } from '../ai/providers.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, ModuleBadge, PageHeader, Pill, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { ChoiceCard, ModuleSelect } from '../ui/form.jsx';
import { Modal } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

const TEMPLATE_ICONS = { blank: FileText, summary: ScrollText, cornell: LayoutTemplate, cheatsheet: Zap };

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export default function Guides() {
  const { db, modules } = useApp();
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [data, , error] = useLoad(async () => {
    const [guides, materials] = await Promise.all([
      db.list('guides').catch(() => null),
      db.list('materials', {}, 'id, name, module_id, guide, created_at'),
    ]);
    return { guides, materials: materials.filter((m) => m.guide) };
  }, [db]);

  const guides = (data?.guides ?? []).filter((g) => !filter || g.module_id === filter).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const lectures = (data?.materials ?? []).filter((m) => !filter || m.module_id === filter);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Study guides"
        title="Your study guides"
        description="Write guides in your own words, with key terms, maths and diagrams, then turn any section into flashcards."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> New guide
          </Button>
        }
      />

      {modules.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: '', code: 'All guides' }, ...modules].map((m) => (
            <button
              key={m.id}
              onClick={() => setFilter(m.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                filter === m.id ? 'border-transparent bg-ink text-white dark:bg-white dark:text-ink' : 'border-line bg-card text-muted hover:text-fg',
              )}
            >
              {m.color && <span className="size-2 rounded-full" style={{ background: m.color }} />}
              {m.code || m.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-rose-600">{error}</p>}
      {data?.guides === null && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          The database needs updating for study guides: run <code>supabase/migrations/004_study_guides.sql</code> in the Supabase SQL Editor.
        </p>
      )}

      {!data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : guides.length === 0 ? (
        <Card>
          <EmptyState icon={NotebookPen} title="No study guides yet">
            Start from a template, or turn one of your lectures into a guide you can edit.
            <div className="mt-4">
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New guide
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g, i) => {
            const words = plainText(g.content).split(/\s+/).filter(Boolean).length;
            const parts = sections(g.content).filter((s) => s.level > 0).length;
            return (
              <motion.div key={g.id} custom={i} variants={fadeUp} initial="hidden" animate="show">
                <Card as="a" href={`#/guides/${g.id}`} interactive className="flex h-full flex-col gap-3 p-5 text-fg no-underline">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid size-9 place-items-center rounded-xl bg-soft text-indigo-600 dark:text-indigo-300">
                      <NotebookPen className="size-4" />
                    </span>
                    <ModuleBadge moduleId={g.module_id} />
                  </div>
                  <p className="text-[17px] leading-snug font-semibold tracking-tight">{g.title}</p>
                  <p className="mt-auto text-xs text-muted">
                    {parts} section{parts === 1 ? '' : 's'} · {words} words · edited {timeAgo(g.updated_at ?? g.created_at)}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {lectures.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Made from your lectures</h2>
            <p className="text-sm text-muted">The AI wrote these when you made flashcards from a lecture. Open one to read it, or turn it into a guide you can edit.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lectures.map((m) => (
              <Card key={m.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-muted">
                    <BookText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted">{m.guide.sections.length} topics</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" href={`#/lectures/${m.id}`}>
                    Read
                  </Button>
                  <EditCopyButton material={m} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <NewGuideSheet open={creating} onClose={() => setCreating(false)} defaultModule={filter || null} lectures={data?.materials ?? []} />
    </div>
  );
}

export async function createGuide(db, row) {
  try {
    const guide = await db.insert('guides', { title: 'Untitled guide', ...row, updated_at: new Date().toISOString() });
    go(`/guides/${guide.id}`);
  } catch (err) {
    toast.error(/guides|schema cache/.test(err.message) ? 'The database needs updating: run supabase/migrations/004_study_guides.sql in Supabase.' : err.message);
  }
}

function EditCopyButton({ material }) {
  const { db } = useApp();
  return (
    <Button size="sm" variant="soft" onClick={() => createGuide(db, { title: material.name, module_id: material.module_id, material_id: material.id, template: 'lecture', content: fromLectureGuide(material.guide) })}>
      Edit as guide
    </Button>
  );
}

function NewGuideSheet({ open, onClose, defaultModule, lectures }) {
  const { db } = useApp();
  const ai = activeAI();
  const [template, setTemplate] = useState('summary');
  const [moduleId, setModuleId] = useState(defaultModule);
  const [busy, setBusy] = useState(false);
  const [allMaterials] = useLoad(() => (open ? db.list('materials', {}, 'id, name, module_id, guide, created_at') : Promise.resolve([])), [db, open]);

  async function fromTemplate() {
    await createGuide(db, { title: TEMPLATES[template].label === 'Blank page' ? 'Untitled guide' : TEMPLATES[template].label, template, module_id: moduleId, content: TEMPLATES[template].build() });
  }

  async function fromLecture(m) {
    if (m.guide) return createGuide(db, { title: m.name, module_id: m.module_id ?? moduleId, material_id: m.id, template: 'lecture', content: fromLectureGuide(m.guide) });
    if (!ai) return toast('This lecture has no AI guide yet. Add a free AI key in Settings to draft one.');
    setBusy(true);
    try {
      const full = await db.get('materials', m.id);
      const { draftGuide } = await import('../ai/guideAI.js');
      const content = await draftGuide(ai, { title: m.name, text: (full.text_content ?? '').replace(/\f/g, '\n\n') });
      await createGuide(db, { title: m.name, module_id: m.module_id ?? moduleId, material_id: m.id, template: 'lecture', content });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      side="right"
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="New study guide"
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={fromTemplate} disabled={busy}>
            Create guide
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-medium">Start from a template</p>
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <ChoiceCard key={id} selected={template === id} onSelect={() => setTemplate(id)} icon={TEMPLATE_ICONS[id]} title={t.label} description={t.description} />
          ))}
        </div>
        <ModuleSelect value={moduleId} onChange={setModuleId} />

        {(allMaterials ?? []).length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium">…or start from a lecture</p>
            <ul className="flex flex-col gap-1 rounded-2xl border border-line p-1.5">
              {allMaterials.map((m) => (
                <li key={m.id}>
                  <button disabled={busy} onClick={() => fromLecture(m)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-subtle disabled:opacity-50">
                    <FileText className="size-4 shrink-0 text-muted" />
                    <span className="flex-1 truncate text-sm">{m.name}</span>
                    {m.guide ? <Pill tone="emerald">Has AI guide</Pill> : ai ? <Pill>AI draft</Pill> : <Pill tone="slate">Needs AI key</Pill>}
                  </button>
                </li>
              ))}
            </ul>
            {busy && (
              <p className="flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-400">
                <Sparkles className="size-4 animate-pulse" /> Drafting your guide…
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
