import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { BookOpen, CalendarClock, GraduationCap, Layers, Plus, Search } from 'lucide-react';
import { useApp, useLoad } from '../context.js';
import { MODULE_COLORS } from '../lib/data.js';
import { UNIVERSITIES, addModulesToProfile, contributeModules, listCourses, listUniversities, normalizeCode } from '../lib/catalog.js';
import ModuleFinder from './ModuleFinder.jsx';
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
  const [finding, setFinding] = useState(false);
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
          <>
            <Button onClick={() => setFinding(true)}>
              <Search /> Find my modules
            </Button>
            <Button variant="primary" onClick={() => setForm({ code: '', name: '', color: MODULE_COLORS[modules.length % MODULE_COLORS.length] })}>
              <Plus /> Module
            </Button>
          </>
        }
      />
      <FindModulesSheet open={finding} onClose={() => setFinding(false)} />

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
                  <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(135deg, ${m.color}, color-mix(in srgb, ${m.color} 55%, #2a1209))` }}>
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

// "Find my modules" after onboarding: the same four sources, using the course on the profile.
function FindModulesSheet({ open, onClose }) {
  const { db, profile, modules, reloadModules } = useApp();
  const [picked, setPicked] = useState(() => new Map());
  const [universities, setUniversities] = useState(UNIVERSITIES);
  const [course, setCourse] = useState(null);
  const [busy, setBusy] = useState(false);

  const uniId = profile?.university_id ?? 'ucd';
  const university = universities.find((u) => u.id === uniId);

  useEffect(() => {
    if (!open) return;
    setPicked(new Map());
    listUniversities().then(setUniversities);
    listCourses(uniId).then((list) => setCourse(list.find((c) => c.id === profile?.course_id || c.name.toLowerCase() === (profile?.course ?? '').toLowerCase()) ?? null));
  }, [open]);

  async function add() {
    setBusy(true);
    try {
      const created = await addModulesToProfile(db, [...picked.values()], modules);
      const codes = new Set([...picked.keys()]);
      const mine = (await db.list('modules')).filter((m) => m.code && codes.has(normalizeCode(m.code)));
      await contributeModules(db, profile, mine, 'manual');
      await reloadModules();
      toast.success(created.length ? `Added ${created.length} module${created.length === 1 ? '' : 's'}` : 'Those modules were already added');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      side="right"
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Find my modules"
      description={profile?.course ? `${profile.course}${profile.year ? `, year ${profile.year}` : ''} · ${university?.short_name ?? ''}` : 'Set your course in Settings for suggestions from classmates.'}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={busy || !picked.size} onClick={add}>
            Add {picked.size || ''} module{picked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {open && <ModuleFinder university={university} universities={universities} courseName={profile?.course ?? ''} course={course} year={profile?.year} picked={picked} setPicked={setPicked} />}
    </Modal>
  );
}
