import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, BookText, CalendarClock, ClipboardCheck, Clock3, FileText, Gauge, GraduationCap, Layers, MapPin, Ellipsis, Pencil, Plus, Sparkles, Trash, Users } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { listDecks } from '../lib/data.js';
import { STATUS, moduleReadiness } from '../lib/readiness.js';
import { DAY_MS, formatDue, isoDate, startOfDay, WEEKDAYS_SHORT } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, CardHeader, EmptyState, Pill, ProgressBar, ProgressRing, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Input } from '../ui/form.jsx';
import { Menu, Modal, useDialogs } from '../ui/dialog.jsx';
import { ColorPicker } from './Modules.jsx';

export default function ModuleView({ moduleId }) {
  const { db, moduleById, reloadModules } = useApp();
  const dialogs = useDialogs();
  const module = moduleById(moduleId);
  const [editing, setEditing] = useState(null);
  const [data] = useLoad(async () => {
    const [decks, materials, assignments, classes, allCards, attempts] = await Promise.all([
      listDecks(db, { module_id: moduleId }),
      db.list('materials', { module_id: moduleId }, 'id, name, page_count, guide, created_at'),
      db.list('assignments', { module_id: moduleId }),
      db.list('class_events', { module_id: moduleId }),
      db.list('cards', {}, 'id, deck_id, topic, due, reviews, lapses, interval_days'),
      // Missing until migration 008 has been run; readiness works without it.
      db.list('exam_attempts', { module_id: moduleId }).catch(() => []),
    ]);
    const deckIds = new Set(decks.map((d) => d.id));
    return { decks, materials, assignments, classes, cards: allCards.filter((c) => deckIds.has(c.deck_id)), attempts };
  }, [db, moduleId]);

  if (!module)
    return (
      <Card>
        <EmptyState icon={GraduationCap} title="Module not found">
          <a href="#/modules">Back to modules</a>
        </EmptyState>
      </Card>
    );

  async function setExam(value) {
    await db.update('modules', moduleId, { exam_date: value || null });
    reloadModules();
    if (value) toast.success('Exam date saved');
  }

  async function saveEdit(e) {
    e.preventDefault();
    await db.update('modules', moduleId, { name: editing.name.trim(), code: editing.code.trim().toUpperCase() || null, color: editing.color });
    await reloadModules();
    setEditing(null);
    toast.success('Module updated');
  }

  async function removeModule() {
    const ok = await dialogs.confirm({
      title: `Delete ${module.name}?`,
      description: 'Its decks, lectures and deadlines are kept, but no longer linked to a module.',
      confirmLabel: 'Delete module',
      danger: true,
    });
    if (!ok) return;
    await db.remove('modules', moduleId);
    await reloadModules();
    go('/modules');
  }

  const examDays = module.exam_date ? Math.round((new Date(`${module.exam_date}T00:00`) - startOfDay(new Date())) / DAY_MS) : null;
  const due = data?.decks.reduce((s, d) => s + d.due_count, 0) ?? 0;
  const today = isoDate(new Date());

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="#/modules">Modules</BackLink>

      <motion.header
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8"
        style={{ background: `linear-gradient(135deg, ${module.color}, color-mix(in srgb, ${module.color} 45%, #2a1209))` }}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full border-[28px] border-white/10" />
        <div className="pointer-events-none absolute right-24 -bottom-20 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            {module.code && <span className="w-fit rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-medium backdrop-blur">{module.code}</span>}
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{module.name}</h1>
            {examDays !== null && examDays >= 0 && (
              <p className="flex items-center gap-1.5 text-sm text-white/85">
                <GraduationCap className="size-4" /> Exam in {examDays} day{examDays === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {due > 0 && (
              <Button href={`#/study?mode=due&module=${moduleId}`} className="bg-white text-slate-900 shadow-lg hover:bg-white/90">
                <Layers /> Study {due} due
              </Button>
            )}
            {data?.cards.length >= 2 && (
              <Button href={`#/exam?module=${moduleId}`} className="border-white/25 bg-white/15 text-white shadow-none backdrop-blur hover:border-white/50 hover:bg-white/25">
                <ClipboardCheck /> Practice exam
              </Button>
            )}
            {module.catalog_module_id && (
              <Button href={`#/hubs/${module.catalog_module_id}`} className="border-white/25 bg-white/15 text-white shadow-none backdrop-blur hover:border-white/50 hover:bg-white/25">
                <Users /> Module hub
              </Button>
            )}
            <Button href={`#/create?module=${moduleId}`} className="border-white/25 bg-white/15 text-white shadow-none backdrop-blur hover:border-white/50 hover:bg-white/25">
              <Sparkles /> Add lecture
            </Button>
            <Menu
              trigger={
                <Button size="icon" className="border-white/25 bg-white/15 text-white shadow-none hover:bg-white/25" aria-label="More">
                  <Ellipsis />
                </Button>
              }
              items={[
                { label: 'Edit name & colour', icon: Pencil, onSelect: () => setEditing({ name: module.name, code: module.code ?? '', color: module.color }) },
                '-',
                { label: 'Delete module', icon: Trash, onSelect: removeModule, danger: true },
              ]}
            />
          </div>
        </div>
      </motion.header>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {data.cards.length > 0 && <Readiness r={moduleReadiness({ cards: data.cards, attempts: data.attempts, examDate: module.exam_date, moduleId })} />}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader title="Exam" icon={GraduationCap} />
              <div className="flex items-center gap-4 p-5 pt-4">
                <ProgressRing value={examDays !== null && examDays >= 0 ? 1 - Math.min(examDays, 60) / 60 : 0} size={64} stroke={6} color={module.color}>
                  <span className="text-center text-sm leading-none font-semibold">
                    {examDays !== null && examDays >= 0 ? examDays : '–'}
                    <span className="block text-[9px] font-normal text-muted">days</span>
                  </span>
                </ProgressRing>
                <Field label="Exam date" className="flex-1">
                  <Input type="date" value={module.exam_date ?? ''} onChange={(e) => setExam(e.target.value)} />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="Classes" icon={Clock3} />
              <ul className="flex flex-col gap-1 p-3 pt-3">
                {data.classes.filter((c) => !c.end_date || c.end_date >= today).length === 0 && <li className="px-2 pb-2 text-sm text-muted">No classes linked.</li>}
                {data.classes
                  .filter((c) => !c.end_date || c.end_date >= today)
                  .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
                      <span className="w-20 shrink-0 font-mono text-xs text-muted">
                        {WEEKDAYS_SHORT[c.weekday]} {c.start_time}
                      </span>
                      <span className="capitalize">{c.kind}</span>
                      {c.location && (
                        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted">
                          <MapPin className="size-3 shrink-0" /> {c.location}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>

            <Card className="md:col-span-2 xl:col-span-1">
              <CardHeader title="Deadlines" icon={CalendarClock} action={<Button size="sm" variant="ghost" href="#/planner?new=1"><Plus /> Add</Button>} />
              <ul className="flex flex-col gap-1 p-3 pt-3">
                {data.assignments.filter((a) => a.status !== 'done').length === 0 && <li className="px-2 pb-2 text-sm text-muted">No open deadlines.</li>}
                {data.assignments
                  .filter((a) => a.status !== 'done')
                  .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
                  .map((a) => (
                    <li key={a.id} className="flex flex-col gap-1.5 rounded-xl px-2 py-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{a.title}</span>
                        <span className="shrink-0 text-xs text-muted">{formatDue(new Date(a.due_at))}</span>
                      </div>
                      <ProgressBar value={(a.hours_done || 0) / (a.effort_hours || 1)} />
                    </li>
                  ))}
              </ul>
            </Card>
          </div>

          <Card>
            <CardHeader title="Lectures & study guides" icon={BookText} action={<Button size="sm" variant="ghost" href={`#/create?module=${moduleId}`}><Plus /> Upload</Button>} />
            <div className="p-3 pt-3">
              {data.materials.length === 0 ? (
                <EmptyState icon={FileText} title="No lectures yet">
                  Upload lecture slides to get flashcards and a study guide for this module.
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.materials
                    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
                    .map((m) => (
                      <li key={m.id}>
                        <a
                          href={m.guide ? `#/lectures/${m.id}` : undefined}
                          className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-fg no-underline transition-colors hover:border-indigo-200 hover:bg-subtle"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-soft text-indigo-600 dark:text-indigo-300">
                            <FileText className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{m.name}</span>
                            <span className="text-xs text-muted">
                              {m.page_count ?? '?'} pages{m.guide ? ` · ${m.guide.sections.length} topics` : ''}
                            </span>
                          </span>
                          {m.guide && <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Study guide →</span>}
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Flashcard decks</h2>
            {data.decks.length === 0 ? (
              <p className="text-sm text-muted">No decks for this module yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.decks.map((d) => (
                  <Card key={d.id} as="a" href={`#/decks/${d.id}`} interactive className="flex flex-col gap-3 p-5 text-fg no-underline">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold tracking-tight">{d.title}</p>
                      {d.due_count > 0 && <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{d.due_count} due</span>}
                    </div>
                    <div className="mt-auto flex flex-col gap-1.5">
                      <ProgressBar value={d.card_count ? d.mastered_count / d.card_count : 0} tone="emerald" />
                      <p className="text-xs text-muted">
                        {d.mastered_count} of {d.card_count} mastered
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit module"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="edit-module">
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <form id="edit-module" onSubmit={saveEdit} className="flex flex-col gap-4">
            <div className="grid grid-cols-[130px_1fr] gap-3">
              <Field label="Code">
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </Field>
              <Field label="Name">
                <Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
            </div>
            <ColorPicker value={editing.color} onChange={(color) => setEditing({ ...editing, color })} />
          </form>
        )}
      </Modal>
    </div>
  );
}

// Evidence-based readiness: what you've shown you know, and what to do next.
// Deliberately no "chance of passing".
function Readiness({ r }) {
  const [all, setAll] = useState(false);
  const pct = (v) => (v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`);
  const stats = [
    { label: 'Cards studied', value: pct(r.coverage), hint: `of ${r.totalCards}` },
    { label: 'Recall in reviews', value: pct(r.retention), hint: r.retention === null ? 'no reviews yet' : 'answered right' },
    { label: 'Last practice exam', value: r.latest ? pct(r.latest.score) : '–', hint: r.latest ? new Date(r.latest.finished_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'none yet', href: r.latest ? `#/exam/${r.latest.id}` : null },
    { label: 'Due now', value: r.due, hint: r.due ? 'to review' : 'all caught up' },
  ];
  const topics = all ? r.topics : r.topics.slice(0, 6);
  return (
    <Card>
      <CardHeader
        title="Exam readiness"
        icon={Gauge}
        action={
          <span className="hidden gap-1.5 text-xs sm:flex">
            {Object.entries(r.counts)
              .filter(([, n]) => n)
              .map(([k, n]) => (
                <Pill key={k} tone={STATUS[k].tone}>
                  {n} {STATUS[k].label.toLowerCase()}
                </Pill>
              ))}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-5 p-5 pt-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((s) => {
              const Tag = s.href ? 'a' : 'div';
              return (
                <Tag key={s.label} href={s.href ?? undefined} className="rounded-2xl bg-subtle px-3.5 py-3 text-fg no-underline">
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className="text-xl font-semibold tracking-tight tabular-nums">{s.value}</p>
                  <p className="truncate text-[11px] text-muted">{s.hint}</p>
                </Tag>
              );
            })}
          </div>

          <ul className="flex flex-col gap-3">
            {topics.map((t) => (
              <li key={t.topic} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{t.topic}</span>
                  <Pill tone={STATUS[t.status].tone} className="shrink-0">
                    {STATUS[t.status].label}
                  </Pill>
                </div>
                <ProgressBar value={t.total ? t.mastered / t.total : 0} tone={t.status === 'risk' ? 'rose' : t.status === 'secure' ? 'emerald' : 'indigo'} />
                <p className="text-[11px] text-muted">
                  {t.mastered} of {t.total} mastered · {t.studied} studied
                  {t.reasons.length ? ` · ${t.reasons.join(' · ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
          {r.topics.length > 6 && (
            <button onClick={() => setAll(!all)} className="w-fit text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {all ? 'Show fewer topics' : `Show all ${r.topics.length} topics`}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold tracking-tight">Next steps</p>
          {r.actions.length === 0 && <p className="text-sm text-muted">You're on top of this module. Keep reviewing cards as they come due.</p>}
          {r.actions.map((a, i) => (
            <a key={i} href={a.href} className="group flex items-start gap-3 rounded-2xl border border-line px-3.5 py-3 text-fg no-underline transition-colors hover:border-indigo-200 hover:bg-subtle">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-soft text-indigo-600 dark:text-indigo-300">
                {a.kind === 'exam' ? <ClipboardCheck className="size-3.5" /> : a.kind === 'due' ? <Layers className="size-3.5" /> : <Sparkles className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium group-hover:text-indigo-600">{a.label}</span>
                <span className="block text-xs text-muted">{a.detail}</span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted" />
            </a>
          ))}
          <p className="text-[11px] leading-relaxed text-muted">
            Based only on your flashcard reviews and practice exams{r.daysToExam !== null && r.daysToExam >= 0 ? `, with ${r.daysToExam} day${r.daysToExam === 1 ? '' : 's'} to go` : ''}. It shows what you've demonstrated, not a predicted grade.
          </p>
        </div>
      </div>
    </Card>
  );
}
