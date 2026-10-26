import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Ban, CalendarClock, Check, ChevronDown, Clock3, Ellipsis, Pencil, Plus, Settings2, Trash, TriangleAlert } from 'lucide-react';
import { useApp } from '../context.js';
import { usePlan } from '../lib/usePlan.js';
import { addDays, eventOn, formatDue, formatHours, fromMinutes, isoDate, sameDay, startOfDay, toMinutes, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, ModuleBadge, PageHeader, Pill, ProgressBar, ProgressRing, Segmented, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Input, ModuleSelect, Select, Textarea } from '../ui/form.jsx';
import { Menu, Modal, useDialogs } from '../ui/dialog.jsx';
import { TimeGrid } from '../ui/TimeGrid.jsx';
import { cn } from '../ui/cn.js';

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
const blankTask = () => ({ title: '', module_id: null, due: isoDate(addDays(new Date(), 7)), due_time: '17:00', effort_hours: 3, priority: 2, notes: '' });

export default function Planner() {
  const { db, moduleById } = useApp();
  const dialogs = useDialogs();
  const { loading, error, plan, assignments = [], classEvents = [], studyPrefs, reload, logStudy } = usePlan();
  const [editing, setEditing] = useState(window.location.hash.includes('new=1') ? blankTask() : null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [session, setSession] = useState(null);
  const [showDone, setShowDone] = useState(false);

  if (loading)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    );
  if (error) return <p className="text-rose-600">{error}</p>;

  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));
  const windows = Object.values(studyPrefs.windows).flat();
  const visibleClasses = classEvents.filter((e) => days.some((d) => eventOn(e, d)));
  const startMin = Math.min(9 * 60, ...windows.map((w) => w[0]), ...visibleClasses.map((e) => toMinutes(e.start_time)));
  const endMin = Math.max(18 * 60, ...windows.map((w) => w[1]), ...visibleClasses.map((e) => toMinutes(e.end_time)));

  const blocks = days.flatMap((d, col) => [
    ...classEvents
      .filter((e) => eventOn(e, d))
      .map((e) =>
        e.kind === 'busy'
          ? { id: e.id, col, kind: 'busy', start: toMinutes(e.start_time), end: toMinutes(e.end_time), title: 'Busy', subtitle: `${e.start_time}–${e.end_time}`, onClick: () => unblock(e), tooltip: 'Click to remove' }
          : {
              id: e.id,
              col,
              kind: 'class',
              start: toMinutes(e.start_time),
              end: toMinutes(e.end_time),
              color: moduleById(e.module_id)?.color ?? '#64748b',
              title: moduleById(e.module_id)?.code ?? e.title,
              subtitle: e.kind,
              tooltip: `${e.title}\n${e.start_time}–${e.end_time}${e.location ? `\n${e.location}` : ''}`,
            },
      ),
    ...plan.sessions
      .filter((s) => sameDay(s.start, d))
      .map((s, i) => ({
        id: `s${col}-${i}`,
        col,
        kind: s.kind === 'review' ? 'review' : 'session',
        start: minutesOf(s.start),
        end: minutesOf(s.end),
        title: s.kind === 'review' ? 'Flashcards' : s.title,
        subtitle: `${fromMinutes(minutesOf(s.start))}–${fromMinutes(minutesOf(s.end))}`,
        onClick: s.kind === 'task' ? () => setSession(s) : () => (window.location.hash = '#/study?mode=due'),
      })),
  ]);

  async function block(col, start, end, quiet) {
    const day = days[col];
    await db.insert('class_events', { title: 'Busy', kind: 'busy', weekday: day.getDay(), start_time: fromMinutes(start), end_time: fromMinutes(end), start_date: isoDate(day), end_date: isoDate(day) });
    reload();
    if (!quiet) toast.success(`Blocked ${WEEKDAYS[day.getDay()]} ${fromMinutes(start)}–${fromMinutes(end)}`, { description: 'Your plan has been rearranged around it.' });
  }

  async function unblock(e) {
    await db.remove('class_events', e.id);
    reload();
    toast('Time unblocked', { description: 'It is available for study again.' });
  }

  async function markSession(s, how) {
    setSession(null);
    if (how === 'done') {
      const minutes = (s.end - s.start) / 60000;
      await logStudy(s.assignmentId, minutes);
      toast.success(`Logged ${formatHours(minutes)} on ${s.title}`);
    } else {
      const col = days.findIndex((d) => sameDay(d, s.start));
      await block(col, minutesOf(s.start), minutesOf(s.end), true);
      toast.success('Session moved', { description: 'That time is blocked and the work has been rescheduled.' });
    }
  }

  async function toggleDone(a) {
    await db.update('assignments', a.id, { status: a.status === 'done' ? 'todo' : 'done' });
    reload();
    if (a.status !== 'done') toast.success(`${a.title} marked done 🎉`);
  }

  async function remove(a) {
    if (!(await dialogs.confirm({ title: `Delete "${a.title}"?`, description: 'This removes the deadline and its planned sessions.', confirmLabel: 'Delete', danger: true }))) return;
    await db.remove('assignments', a.id);
    reload();
  }

  async function addHour(a) {
    await logStudy(a.id, 60);
    toast.success(`Logged 1h on ${a.title}`);
  }

  const open = assignments.filter((a) => a.status !== 'done').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const done = assignments.filter((a) => a.status === 'done');
  const { remainingMinutes, capacityMinutes } = plan.stats;
  const load = capacityMinutes ? remainingMinutes / capacityMinutes : remainingMinutes ? 1 : 0;
  const weekSessions = plan.sessions.filter((s) => s.kind === 'task' && s.start < addDays(startOfDay(now), 7));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Planner"
        title="Your week"
        description="Study sessions fit into your free time, most urgent work first. The plan rebuilds itself as you log work, so missed sessions roll forward."
        actions={
          <>
            <Button onClick={() => setShowPrefs(true)}>
              <Settings2 /> Study hours
            </Button>
            <Button variant="primary" onClick={() => setEditing(blankTask())}>
              <Plus /> Deadline
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <MiniStat label="Work left" value={formatHours(remainingMinutes)} />
        <MiniStat label="Time available" value={formatHours(capacityMinutes)}>
          <ProgressBar value={Math.min(1, load)} tone={load > 1 ? 'rose' : load > 0.8 ? 'amber' : 'emerald'} className="mt-2" />
        </MiniStat>
        <MiniStat label="Sessions this week" value={weekSessions.length} />
      </div>

      {plan.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {plan.warnings.map((w) => (
            <motion.div key={w.assignmentId} variants={fadeUp} initial="hidden" animate="show" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                <b className="font-semibold">{w.title}</b>{' '}
                {w.kind === 'overdue'
                  ? `is overdue with ${formatHours(w.minutes)} left. Update its deadline or mark it done.`
                  : `is ${formatHours(w.minutes)} short before ${formatDue(w.deadline)}. Free up time, lower the estimate, or raise your daily study limit.`}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Next 7 days</h2>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <Legend className="bg-indigo-600" label="Study" />
            <Legend className="bg-emerald-500/40" label="Flashcards" />
            <Legend className="bg-slate-300 dark:bg-slate-600" label="Classes" />
            <Legend className="border border-dashed border-slate-400" label="Busy" />
          </div>
        </div>
        <TimeGrid
          columns={days.map((d) => ({ key: isoDate(d), label: WEEKDAYS_SHORT[d.getDay()], sub: d.getDate(), today: sameDay(d, now) }))}
          blocks={blocks}
          startMin={startMin}
          endMin={endMin}
          nowMin={minutesOf(now)}
          onCreate={block}
        />
        <p className="mt-3 text-xs text-muted">
          <b className="font-medium text-fg">Tip:</b> drag on the calendar to block out time you're busy. Click a study session to log it or skip it.
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Deadlines</h2>
          <span className="text-sm text-muted">{open.length} open</span>
        </div>
        {open.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarClock} title="No deadlines yet">
              Add assignments, labs and exams, and the planner will schedule study time for them.
            </EmptyState>
          </Card>
        ) : (
          <AnimatePresence initial={false}>
            {open.map((a, i) => (
              <motion.div key={a.id} layout custom={i} variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0, x: 40 }}>
                <DeadlineRow a={a} now={now} onDone={() => toggleDone(a)} onHour={() => addHour(a)} onEdit={() => setEditing(toForm(a))} onDelete={() => remove(a)} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {done.length > 0 && (
          <button onClick={() => setShowDone(!showDone)} className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            <ChevronDown className={cn('size-4 transition-transform', showDone && 'rotate-180')} /> {done.length} completed
          </button>
        )}
        {showDone &&
          done.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 px-4 py-3 opacity-70">
              <button onClick={() => toggleDone(a)} className="grid size-6 place-items-center rounded-full bg-emerald-500 text-white" title="Mark not done">
                <Check className="size-3.5" />
              </button>
              <span className="flex-1 truncate text-sm line-through">{a.title}</span>
              <ModuleBadge moduleId={a.module_id} />
              <Button size="icon" variant="danger" onClick={() => remove(a)} aria-label="Delete">
                <Trash />
              </Button>
            </Card>
          ))}
      </section>

      <DeadlineSheet editing={editing} setEditing={setEditing} onSaved={reload} />
      <StudyHoursSheet open={showPrefs} onClose={() => setShowPrefs(false)} initial={studyPrefs} />

      <Modal
        open={!!session}
        onOpenChange={(o) => !o && setSession(null)}
        title={session?.title}
        description={session && `${WEEKDAYS[session.start.getDay()]} ${fromMinutes(minutesOf(session.start))}–${fromMinutes(minutesOf(session.end))} · ${formatHours((session.end - session.start) / 60000)}`}
      >
        {session && (
          <div className="flex flex-col gap-2.5 pb-2">
            <Button variant="primary" size="lg" onClick={() => markSession(session, 'done')}>
              <Check /> I did it: log {formatHours((session.end - session.start) / 60000)}
            </Button>
            <Button size="lg" onClick={() => markSession(session, 'skip')}>
              <Ban /> Can't make it: reschedule
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function toForm(a) {
  const d = new Date(a.due_at);
  return { ...a, due: isoDate(d), due_time: d.toTimeString().slice(0, 5) };
}

function MiniStat({ label, value, children }) {
  return (
    <Card className="px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-[11px] leading-tight text-muted sm:text-[13px]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      {children}
    </Card>
  );
}

function Legend({ className, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} /> {label}
    </span>
  );
}

function DeadlineRow({ a, now, onDone, onHour, onEdit, onDelete }) {
  const due = new Date(a.due_at);
  const hoursLeft = (due - now) / 3600000;
  const pct = Math.min(1, (a.hours_done || 0) / (a.effort_hours || 1));
  return (
    <Card className="group flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <button onClick={onDone} title="Mark done" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-line text-transparent transition-colors hover:border-emerald-500 hover:text-emerald-500">
        <Check className="size-3.5" />
      </button>
      <ProgressRing value={pct} size={42} stroke={4} color={hoursLeft < 48 ? 'var(--color-rose-500)' : 'var(--color-indigo-500)'}>
        <span className="font-mono text-[10px] text-muted">{Math.round(pct * 100)}%</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          {a.title} {a.priority === 3 && <Pill tone="rose">High</Pill>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <ModuleBadge moduleId={a.module_id} />
          <span className={cn(hoursLeft < 0 ? 'text-rose-600' : hoursLeft < 48 && 'text-amber-600')}>
            <Clock3 className="mr-1 inline size-3" />
            {formatDue(due)}
          </span>
          <span>
            {a.hours_done ?? 0}h of {a.effort_hours}h
          </span>
        </p>
      </div>
      <Button size="sm" variant="soft" onClick={onHour} className="hidden sm:inline-flex">
        +1h
      </Button>
      <Menu
        trigger={
          <Button size="icon" variant="ghost" aria-label="More">
            <Ellipsis />
          </Button>
        }
        items={[
          { label: 'Log 1 hour', icon: Plus, onSelect: onHour },
          { label: 'Edit', icon: Pencil, onSelect: onEdit },
          { label: 'Mark done', icon: Check, onSelect: onDone },
          '-',
          { label: 'Delete', icon: Trash, onSelect: onDelete, danger: true },
        ]}
      />
    </Card>
  );
}

function DeadlineSheet({ editing, setEditing, onSaved }) {
  const { db } = useApp();
  const set = (k) => (e) => setEditing({ ...editing, [k]: e?.target ? e.target.value : e });

  async function save(e) {
    e.preventDefault();
    const row = {
      title: editing.title.trim(),
      module_id: editing.module_id,
      due_at: new Date(`${editing.due}T${editing.due_time}`).toISOString(),
      effort_hours: Number(editing.effort_hours) || 1,
      priority: Number(editing.priority),
      notes: editing.notes || null,
    };
    if (editing.id) await db.update('assignments', editing.id, row);
    else await db.insert('assignments', { ...row, hours_done: 0, status: 'todo' });
    toast.success(editing.id ? 'Deadline updated' : 'Deadline added', { description: 'Study sessions have been planned for it.' });
    setEditing(null);
    onSaved();
  }

  return (
    <Modal
      side="right"
      open={!!editing}
      onOpenChange={(o) => !o && setEditing(null)}
      title={editing?.id ? 'Edit deadline' : 'New deadline'}
      description="Assignments, labs, exams: anything with a due date."
      footer={
        <>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="deadline-form">
            Save
          </Button>
        </>
      }
    >
      {editing && (
        <form id="deadline-form" onSubmit={save} className="flex flex-col gap-4">
          <Field label="What is it?">
            <Input autoFocus required value={editing.title} onChange={set('title')} placeholder="e.g. Programming assignment 2" />
          </Field>
          <ModuleSelect value={editing.module_id} onChange={set('module_id')} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <Input type="date" required value={editing.due} onChange={set('due')} />
            </Field>
            <Field label="Time">
              <Input type="time" required value={editing.due_time} onChange={set('due_time')} />
            </Field>
          </div>
          <Field label="Estimated hours of work" hint="Your best guess. You can change it any time.">
            <Input type="number" min="0.5" step="0.5" value={editing.effort_hours} onChange={set('effort_hours')} />
          </Field>
          <Field label="Priority">
            <Segmented
              value={String(editing.priority)}
              onChange={(v) => setEditing({ ...editing, priority: Number(v) })}
              options={[
                { value: '1', label: 'Low' },
                { value: '2', label: 'Normal' },
                { value: '3', label: 'High' },
              ]}
            />
          </Field>
          <Field label="Notes">
            <Textarea value={editing.notes ?? ''} onChange={set('notes')} placeholder="Brief, links, requirements…" />
          </Field>
        </form>
      )}
    </Modal>
  );
}

function StudyHoursSheet({ open, onClose, initial }) {
  const { db, reloadProfile } = useApp();
  const [prefs, setPrefs] = useState(initial);
  const setDay = (d, range) => setPrefs({ ...prefs, windows: { ...prefs.windows, [d]: range ? [range] : [] } });

  async function save() {
    await db.saveProfile({ study_prefs: prefs });
    await reloadProfile();
    toast.success('Study hours saved', { description: 'Your plan has been rebuilt.' });
    onClose();
  }

  return (
    <Modal
      side="right"
      open={open}
      onOpenChange={(o) => (o ? setPrefs(initial) : onClose())}
      title="Study hours"
      description="The planner only schedules study inside these hours, and never during classes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const range = prefs.windows[d]?.[0];
            return (
              <div key={d} className="flex items-center gap-3 rounded-xl px-1 py-1">
                <span className="w-12 text-sm font-medium">{WEEKDAYS_SHORT[d]}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!range}
                  onClick={() => setDay(d, range ? null : [540, 1080])}
                  className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', range ? 'bg-indigo-600' : 'bg-line')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', range && 'translate-x-4')} />
                </button>
                {range ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input type="time" className="h-9" value={fromMinutes(range[0])} onChange={(e) => setDay(d, [toMinutes(e.target.value), range[1]])} />
                    <span className="text-xs text-muted">to</span>
                    <Input type="time" className="h-9" value={fromMinutes(range[1])} onChange={(e) => setDay(d, [range[0], toMinutes(e.target.value)])} />
                  </div>
                ) : (
                  <span className="text-sm text-muted">Day off</span>
                )}
              </div>
            );
          })}
        </div>
        <Field label={`Most study per day: ${prefs.maxDailyMinutes / 60}h`}>
          <input type="range" min="1" max="12" value={prefs.maxDailyMinutes / 60} onChange={(e) => setPrefs({ ...prefs, maxDailyMinutes: Number(e.target.value) * 60 })} className="accent-indigo-600" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Session length">
            <Select value={prefs.sessionMinutes} onChange={(e) => setPrefs({ ...prefs, sessionMinutes: Number(e.target.value) })}>
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Daily flashcards">
            <Select value={prefs.reviewMinutes} onChange={(e) => setPrefs({ ...prefs, reviewMinutes: Number(e.target.value) })}>
              {[0, 10, 15, 20, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min` : 'None'}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
