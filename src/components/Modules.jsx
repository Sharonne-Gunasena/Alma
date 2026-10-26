import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { BookOpen, CalendarClock, GraduationCap, Layers, Plus } from 'lucide-react';
import { useApp, useLoad } from '../context.js';
import { MODULE_COLORS } from '../lib/data.js';
import { isDue } from '../lib/srs.js';
import { DAY_MS, startOfDay } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, PageHeader, Pill, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Input } from '../ui/form.jsx';
import { Modal } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

export default function Modules() {
  const { db, modules, reloadModules } = useApp();
  const [form, setForm] = useState(null);
  const [stats] = useLoad(async () => {
    const [decks, cards, assignments] = await Promise.all([db.list('decks'), db.list('cards', {}, 'id, deck_id, due'), db.list('assignments')]);
    const deckModule = new Map(decks.map((d) => [d.id, d.module_id]));
    const out = {};
    for (const m of modules) out[m.id] = { cards: 0, due: 0, open: 0, decks: decks.filter((d) => d.module_id === m.id).length };
    for (const c of cards) {
      const s = out[deckModule.get(c.deck_id)];
      if (s) {
        s.cards++;
        if (isDue(c)) s.due++;
      }
    }
    for (const a of assignments) if (a.status !== 'done' && out[a.module_id]) out[a.module_id].open++;
    return out;
  }, [db, modules]);

  async function create(e) {
    e.preventDefault();
    await db.insert('modules', { code: form.code.trim().toUpperCase() || null, name: form.name.trim(), color: form.color });
    toast.success(`Added ${form.name.trim()}`);
    setForm(null);
    reloadModules();
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Modules"
        title="Your modules"
        description="Each module keeps its lectures, flashcards, study guides, classes and deadlines together."
        actions={
          <Button variant="primary" onClick={() => setForm({ code: '', name: '', color: MODULE_COLORS[modules.length % MODULE_COLORS.length] })}>
            <Plus /> Module
          </Button>
        }
      />

      {modules.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="No modules yet">
            Import your timetable and modules are created automatically, or add one by hand.
            <div className="mt-4">
              <Button href="#/timetable">Go to timetable</Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m, i) => {
            const s = stats?.[m.id];
            const examDays = m.exam_date ? Math.round((new Date(`${m.exam_date}T00:00`) - startOfDay(new Date())) / DAY_MS) : null;
            return (
              <motion.div key={m.id} custom={i} variants={fadeUp} initial="hidden" animate="show">
                <Card as="a" href={`#/modules/${m.id}`} interactive className="group flex h-full flex-col overflow-hidden text-fg no-underline">
                  <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 55%, #0a0f1e))` }}>
                    <div className="absolute -right-6 -bottom-10 size-32 rounded-full border-[14px] border-white/15 transition-transform duration-500 group-hover:scale-110" />
                    <span className="absolute top-3 left-4 rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur">{m.code || 'Module'}</span>
                    {examDays !== null && examDays >= 0 && (
                      <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-900">
                        <GraduationCap className="size-3" /> Exam in {examDays}d
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <p className="text-lg leading-snug font-semibold tracking-tight">{m.name}</p>
                    {s ? (
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Pill tone="slate">
                          <Layers /> {s.cards} cards
                        </Pill>
                        {s.due > 0 && <Pill tone="indigo">{s.due} due</Pill>}
                        <Pill tone={s.open ? 'amber' : 'slate'}>
                          <CalendarClock /> {s.open} open
                        </Pill>
                      </div>
                    ) : (
                      <Skeleton className="mt-auto h-6 w-40" />
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title="New module"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="module-form">
              Create module
            </Button>
          </>
        }
      >
        {form && (
          <form id="module-form" onSubmit={create} className="flex flex-col gap-4">
            <div className="grid grid-cols-[130px_1fr] gap-3">
              <Field label="Code">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="COMP10110" />
              </Field>
              <Field label="Name">
                <Input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Computer Programming I" />
              </Field>
            </div>
            <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
          </form>
        )}
      </Modal>
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <Field label="Colour">
      <div className="flex flex-wrap gap-2">
        {MODULE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={cn('size-8 rounded-full transition-transform hover:scale-110', value === c && 'ring-2 ring-offset-2 ring-offset-card')}
            style={{ background: c, '--tw-ring-color': c }}
          />
        ))}
      </div>
    </Field>
  );
}
