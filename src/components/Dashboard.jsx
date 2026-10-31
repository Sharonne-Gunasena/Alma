import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Brain,
  CalendarClock,
  Check,
  Clock3,
  History,
  Layers,
  MapPin,
  Plus,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react';
import { useApp } from '../context.js';
import { usePlan } from '../lib/usePlan.js';
import { weakTopics } from '../lib/data.js';
import * as checkins from '../lib/checkins.js';
import { isDue } from '../lib/srs.js';
import {
  DAY_MS,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  addDays,
  eventOn,
  formatDue,
  formatHours,
  sameDay,
  semesterWeek,
  startOfDay,
  toMinutes,
} from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Card, CardHeader, EmptyState, Eyebrow, IconTile, ModuleBadge, ProgressBar, ProgressRing, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';
import { CountUp, Reveal, RevealText } from '../ui/motion.jsx';

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

// Remembers today's planned sessions and asks about the ones that have ended.
function useCheckins(plan, assignments) {
  const { user } = useApp();
  const uid = user?.id ?? 'local';
  const [list, setList] = useState(() => checkins.load(uid));

  useEffect(() => {
    if (!plan) return;
    const now = new Date();
    setList((prev) => {
      const next = checkins.remember(prev, plan.sessions.filter((s) => sameDay(s.start, now)), now);
      checkins.save(uid, next);
      return next;
    });
  }, [plan, uid]);

  const resolve = (item) =>
    setList((prev) => {
      const next = checkins.resolve(prev, checkins.overlapping(prev, item));
      checkins.save(uid, next);
      return next;
    });

  return { asks: checkins.pending(list, assignments), resolve };
}

export default function Dashboard() {
  const { profile, moduleById, modules } = useApp();
  const { loading, error, plan, assignments = [], classEvents = [], cards = [], decks = [], dueCount, logStudy } = usePlan();
  const { asks, resolve } = useCheckins(plan, assignments);
  const now = new Date();

  if (loading) return <DashboardSkeleton />;
  if (error) return <p className="text-rose-600">{/schema cache|does not exist/.test(error) ? 'The database needs updating: run supabase/migrations/002_campusloop.sql in Supabase, then reload.' : error}</p>;

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const week = semesterWeek(classEvents, now);

  // Today's timeline: classes plus planned sessions, in time order.
  const items = [
    ...classEvents
      .filter((e) => eventOn(e, now))
      .map((c) => ({ kind: 'class', start: toMinutes(c.start_time), end: toMinutes(c.end_time), c })),
    ...plan.sessions
      .filter((s) => sameDay(s.start, now) && (s.kind !== 'review' || dueCount > 0))
      .map((s) => ({ kind: s.kind, start: minutesOf(s.start), end: minutesOf(s.end), s })),
  ].sort((a, b) => a.start - b.start);
  const nowMin = minutesOf(now);
  const next = items.find((i) => i.end > nowMin);
  const classesToday = items.filter((i) => i.kind === 'class').length;
  const studyToday = items.filter((i) => i.kind === 'task').reduce((s, i) => s + i.end - i.start, 0);

  const open = assignments.filter((a) => a.status !== 'done').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const weekEnd = new Date(startOfDay(now).getTime() + 7 * DAY_MS);
  const dueThisWeek = open.filter((a) => new Date(a.due_at) < weekEnd);
  const effort = open.reduce((s, a) => s + (a.effort_hours || 0), 0);
  const done = open.reduce((s, a) => s + Math.min(a.hours_done || 0, a.effort_hours || 0), 0);
  const weak = weakTopics(cards, 4);

  const summary = [
    classesToday ? `${classesToday} class${classesToday > 1 ? 'es' : ''}` : null,
    studyToday ? `${formatHours(studyToday)} of study` : null,
    dueCount ? `${dueCount} card${dueCount > 1 ? 's' : ''} to review` : null,
  ].filter(Boolean);

  async function markDone(s) {
    const minutes = (s.end - s.start) / 60000;
    await logStudy(s.assignmentId, minutes);
    resolve({ assignmentId: s.assignmentId, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
    toast.success(`Logged ${formatHours(minutes)} on ${s.title}`, { description: 'Your plan has been updated.' });
  }

  // Answer to "did you get to it?". Skipped work is already back in the plan,
  // because the planner rebuilds from what's left, so say where it went.
  async function checkIn(item, share) {
    const minutes = Math.round(((new Date(item.end) - new Date(item.start)) / 60000) * share);
    resolve(item);
    if (minutes > 0) {
      await logStudy(item.assignmentId, minutes);
      toast.success(`Logged ${formatHours(minutes)} on ${item.title}`);
      return;
    }
    const nextSession = plan.sessions.find((s) => s.kind === 'task' && s.assignmentId === item.assignmentId);
    const short = plan.warnings.find((w) => w.assignmentId === item.assignmentId);
    toast(`No problem. ${item.title} has been replanned.`, {
      description: nextSession
        ? `Next session: ${WEEKDAYS[nextSession.start.getDay()]} ${fmt(minutesOf(nextSession.start))}.${short ? ` It's now ${formatHours(short.minutes)} short of time, so consider adding study hours.` : ''}`
        : 'There is no free time left before the deadline. Open the planner to add study hours.',
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <motion.section variants={fadeUp} initial="hidden" animate="show" className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <Eyebrow>
            {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            {week ? ` · Week ${week}` : ''}
          </Eyebrow>
          <RevealText as="h1" text={`${greeting}${profile?.display_name ? `, ${profile.display_name}` : ''}.`} className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl" />
          <p className="text-[15px] text-muted text-pretty">
            {summary.length ? `Today you have ${listify(summary)}.` : 'Nothing scheduled today. A good day to get ahead.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" href="#/planner?new=1">
            <Plus /> Deadline
          </Button>
          <Button variant="primary" href="#/create" className="btn-sheen">
            <Sparkles /> Lecture → flashcards
          </Button>
        </div>
      </motion.section>

      {/* Up next + check-ins + warnings */}
      <div className="flex flex-col gap-3">
        {next && <UpNext item={next} nowMin={nowMin} moduleById={moduleById} dueCount={dueCount} />}
        <CheckIns asks={asks} onAnswer={checkIn} />
        {plan.warnings.slice(0, 2).map((w) => (
          <motion.a
            key={w.assignmentId}
            href="#/planner"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 no-underline transition-colors hover:bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              <b className="font-semibold">{w.title}</b>{' '}
              {w.kind === 'overdue'
                ? `is overdue with ${formatHours(w.minutes)} left. Update the deadline or mark it done.`
                : `needs ${formatHours(w.minutes)} more than your free time before ${formatDue(w.deadline)}. Add study hours or start now.`}
            </span>
            <ArrowRight className="ml-auto mt-0.5 size-4 shrink-0 opacity-60" />
          </motion.a>
        ))}
      </div>

      {/* Stats */}
      {/* Four across only when there's room, so labels never wrap and numbers share a baseline. */}
      <section className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <Stat i={0} href="#/study?mode=due" icon={Layers} label="Cards due" value={dueCount} hint={dueCount ? 'Review now' : 'All caught up'} />
        <Stat
          i={1}
          href="#/planner"
          icon={Clock3}
          label="Study today"
          value={studyToday}
          format={(m) => formatHours(Math.round(m))}
          hint={plan.stats.remainingMinutes ? `${formatHours(plan.stats.remainingMinutes)} of work left` : 'Nothing planned. Add a deadline'}
          tone="emerald"
        />
        <Stat i={2} href="#/planner" icon={CalendarClock} label="Due this week" value={dueThisWeek.length} hint={dueThisWeek[0] ? `Next: ${dueThisWeek[0].title}` : 'Nothing due'} tone="amber" />
        <Stat
          i={3}
          href="#/planner"
          label="Coursework"
          value={effort ? Math.round((done / effort) * 100) : null}
          format={(n) => `${Math.round(n)}%`}
          hint={effort ? `${done.toFixed(done % 1 ? 1 : 0)}h of ${effort}h done` : 'No coursework yet'}
          ring={effort ? done / effort : 0}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Today's timeline */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today"
            icon={Target}
            action={
              <a href="#/planner" className="flex items-center gap-1 text-[13px] font-medium text-indigo-700 no-underline hover:gap-1.5 dark:text-indigo-400">
                Planner <ArrowRight className="size-3.5 transition-all" />
              </a>
            }
          />
          <div className="p-5 pt-4">
            {items.length === 0 ? (
              <EmptyState icon={Sparkles} title="A free day">
                No classes or planned study today. Add a deadline and the planner will find time for it.
              </EmptyState>
            ) : (
              <ol className="relative flex flex-col gap-2">
                {items.map((item, i) => {
                  const past = item.end <= nowMin;
                  const current = item.start <= nowMin && nowMin < item.end;
                  const color = item.kind === 'class' ? moduleById(item.c.module_id)?.color ?? '#64748b' : item.kind === 'review' ? '#10b981' : moduleById(item.s.module_id)?.color ?? '#f97316';
                  return (
                    <motion.li
                      key={i}
                      custom={i}
                      variants={fadeUp}
                      initial="hidden"
                      animate="show"
                      className={cn(
                        'group relative flex items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-line hover:bg-subtle',
                        past && 'opacity-50',
                        current && 'border-indigo-200 bg-soft dark:border-indigo-500/30',
                      )}
                    >
                      <span className="w-[76px] shrink-0 font-mono text-[11px] text-muted tabular-nums sm:w-[92px] sm:text-xs">
                        {fmt(item.start)}–{fmt(item.end)}
                      </span>
                      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color }} />
                      <div className="min-w-0 flex-1">
                        {item.kind === 'class' && (
                          <>
                            <p className="truncate text-sm font-medium">
                              {item.c.kind === 'busy' ? (
                                <span className="text-muted">Blocked off</span>
                              ) : (
                                <>
                                  {moduleById(item.c.module_id)?.name ?? item.c.title} <span className="font-normal text-muted capitalize">· {item.c.kind}</span>
                                </>
                              )}
                            </p>
                            {item.c.location && (
                              <p className="flex items-center gap-1 truncate text-xs text-muted">
                                <MapPin className="size-3" /> {item.c.location}
                              </p>
                            )}
                          </>
                        )}
                        {item.kind === 'review' && (
                          <a href="#/study?mode=due" className="text-sm font-medium text-fg no-underline hover:text-indigo-700">
                            Flashcard review <span className="font-normal text-muted">· {dueCount} due</span>
                          </a>
                        )}
                        {item.kind === 'task' && (
                          <p className="truncate text-sm font-medium">
                            Work on {item.s.title} <ModuleBadge moduleId={item.s.module_id} className="ml-1" />
                          </p>
                        )}
                      </div>
                      {current && <span className="hidden rounded-full bg-indigo-700 px-2 py-0.5 text-[11px] font-medium text-white sm:inline">Now</span>}
                      {item.kind === 'task' && !past && (
                        <Button size="sm" variant="ghost" onClick={() => markDone(item.s)} className="opacity-70 group-hover:opacity-100">
                          <Check /> Done
                        </Button>
                      )}
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:gap-5">
          {/* Deadlines */}
          <Card>
            <CardHeader title="Deadlines" icon={CalendarClock} action={<Button size="sm" variant="ghost" href="#/planner?new=1"><Plus /> Add</Button>} />
            <div className="flex flex-col gap-1 p-3 pt-3">
              {open.length === 0 && <p className="px-2 pb-2 text-sm text-muted">No open deadlines.</p>}
              {open.slice(0, 4).map((a) => {
                const due = new Date(a.due_at);
                const hoursLeft = (due - now) / 3600000;
                const urgent = hoursLeft < 48;
                return (
                  <a key={a.id} href="#/planner" className="flex items-center gap-3 rounded-xl px-2 py-2 text-fg no-underline transition-colors hover:bg-subtle">
                    <ProgressRing value={(a.hours_done || 0) / (a.effort_hours || 1)} size={38} stroke={4} color={urgent ? 'var(--color-rose-500)' : 'var(--color-indigo-500)'}>
                      <span className="font-mono text-[10px] text-muted">{Math.round(((a.hours_done || 0) / (a.effort_hours || 1)) * 100)}</span>
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="flex items-center gap-2 text-xs">
                        <span className={cn(hoursLeft < 0 ? 'text-rose-600' : urgent ? 'text-amber-600' : 'text-muted')}>{formatDue(due)}</span>
                        <ModuleBadge moduleId={a.module_id} className="px-1.5 py-0 text-[10px]" />
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          </Card>

          <WeekChart plan={plan} classEvents={classEvents} now={now} />
        </div>
      </section>

      {/* Weak topics + modules */}
      <Reveal as="section" className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <Card>
          <CardHeader title="Topics to work on" icon={Brain} />
          <div className="flex flex-col gap-3 p-5 pt-4">
            {weak.length === 0 ? (
              <p className="text-sm text-muted">Study some flashcards and Alma will spot the topics you find hardest.</p>
            ) : (
              weak.map((t) => (
                <a key={t.topic} href={`#/decks/${t.deck_id}/study?mode=topic&topic=${encodeURIComponent(t.topic)}`} className="group flex flex-col gap-1.5 text-fg no-underline">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium group-hover:text-indigo-700">{t.topic}</span>
                    <span className="font-mono text-xs text-muted">{Math.round(t.accuracy * 100)}%</span>
                  </div>
                  <ProgressBar value={t.accuracy} tone={t.accuracy < 0.6 ? 'rose' : 'amber'} />
                </a>
              ))
            )}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {modules.slice(0, 4).map((m, i) => {
            const deckIds = new Set(decks.filter((d) => d.module_id === m.id).map((d) => d.id));
            const due = cards.filter((c) => deckIds.has(c.deck_id) && isDue(c)).length;
            const nextClass = upcomingClass(classEvents.filter((e) => e.module_id === m.id), now);
            const openCount = open.filter((a) => a.module_id === m.id).length;
            return (
              <motion.div key={m.id} custom={i} variants={fadeUp} initial="hidden" animate="show">
                <Card as="a" href={`#/modules/${m.id}`} interactive className="relative flex h-full flex-col gap-3 overflow-hidden p-5 text-fg no-underline">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: m.color }} />
                  <div>
                    <p className="font-mono text-[11px] font-medium" style={{ color: m.color }}>
                      {m.code}
                    </p>
                    <p className="font-semibold tracking-tight">{m.name}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {nextClass && <span>Next class {nextClass}</span>}
                    <span>{due} cards due</span>
                    <span>{openCount} open</span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {modules.length === 0 && (
            <Card className="sm:col-span-2">
              <EmptyState icon={Layers} title="No modules yet">
                Import your timetable and Alma creates your modules automatically. <a href="#/timetable">Go to timetable</a>
              </EmptyState>
            </Card>
          )}
        </div>
      </Reveal>
    </div>
  );
}

// Numbers count up on load; the card tilts toward the cursor.
// One layout for every stat: label and icon (or ring) on top, the number, then a hint.
// A null value shows a dash rather than a misleading zero.
function Stat({ icon, label, value, format, hint, href, tone = 'indigo', ring, i }) {
  return (
    <motion.div custom={i} variants={fadeUp} initial="hidden" animate="show" className="h-full">
      <Card as="a" href={href} interactive className="flex h-full flex-col gap-3 p-4 text-fg no-underline lg:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-muted">{label}</span>
          {ring !== undefined ? <ProgressRing value={ring} size={32} stroke={4} /> : <IconTile icon={icon} size="sm" tone={tone} />}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value === null ? <span className="text-muted">–</span> : <CountUp value={value} format={format} />}</p>
        <p className="truncate text-xs text-muted">{hint}</p>
      </Card>
    </motion.div>
  );
}

function UpNext({ item, nowMin, moduleById, dueCount }) {
  const inMin = item.start - nowMin;
  const when = inMin <= 0 ? 'Happening now' : inMin < 60 ? `In ${inMin} min` : `At ${fmt(item.start)}`;
  const title =
    item.kind === 'class'
      ? `${moduleById(item.c.module_id)?.name ?? item.c.title} ${item.c.kind}`
      : item.kind === 'review'
        ? `Flashcard review (${dueCount} due)`
        : `Study: ${item.s.title}`;
  const where = item.kind === 'class' ? item.c.location : null;
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-fit max-w-full items-center gap-3 rounded-2xl border border-line bg-card py-2.5 pr-5 pl-3 shadow-lift">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-indigo-500" />
      </span>
      <div className="min-w-0 text-sm">
        <span className="font-medium text-indigo-700 dark:text-indigo-400">{when}</span>
        <span className="text-muted"> · </span>
        <span className="font-medium">{title}</span>
        {where && <span className="text-muted"> · {where}</span>}
      </div>
    </motion.div>
  );
}

function CheckIns({ asks, onAnswer }) {
  if (!asks.length) return null;
  const today = new Date();
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3.5 dark:border-sky-500/20 dark:bg-sky-500/10">
      <p className="flex items-center gap-2 text-sm font-medium text-sky-900 dark:text-sky-100">
        <History className="size-4 text-sky-600 dark:text-sky-300" /> Did you get to {asks.length === 1 ? 'this' : 'these'}?
      </p>
      <AnimatePresence initial={false}>
        {asks.slice(0, 3).map((a) => {
          const start = new Date(a.start);
          const end = new Date(a.end);
          return (
            <motion.div key={a.key} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{a.title}</span>{' '}
                <span className="text-muted">
                  · {sameDay(start, today) ? 'today' : WEEKDAYS[start.getDay()]} {fmt(minutesOf(start))}–{fmt(minutesOf(end))}
                </span>
              </span>
              <span className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => onAnswer(a, 1)}>
                  <Check /> Yes
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onAnswer(a, 0.5)}>
                  Partly
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAnswer(a, 0)}>
                  No
                </Button>
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}

// Planned study and class time for the next seven days.
function WeekChart({ plan, classEvents, now }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));
  const data = days.map((d) => {
    const study = plan.sessions.filter((s) => s.kind === 'task' && sameDay(s.start, d)).reduce((m, s) => m + (s.end - s.start) / 60000, 0);
    const classes = classEvents.filter((e) => eventOn(e, d)).reduce((m, e) => m + toMinutes(e.end_time) - toMinutes(e.start_time), 0);
    return { d, study, classes };
  });
  const max = Math.max(240, ...data.map((x) => x.study + x.classes));
  return (
    <Card>
      <CardHeader title="Next 7 days" icon={Clock3} />
      <div className="flex h-36 items-end gap-2 px-5 pt-4 pb-2">
        {data.map(({ d, study, classes }, i) => (
          <a key={i} href="#/planner" className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5 no-underline">
            <span
              className={cn(
                'pointer-events-none invisible absolute -top-1 z-10 -translate-y-full rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100',
                // Keep edge tooltips inside the card.
                i < 2 ? 'left-0' : i > 4 ? 'right-0' : 'left-1/2 -translate-x-1/2',
              )}
            >
              {WEEKDAYS[d.getDay()]}: {formatHours(study)} study · {formatHours(classes)} classes
            </span>
            <div className="flex w-full max-w-7 flex-1 flex-col justify-end overflow-hidden rounded-lg bg-subtle">
              <motion.div className="w-full bg-indigo-500 group-hover:bg-indigo-400" initial={{ height: 0 }} animate={{ height: `${(study / max) * 100}%` }} transition={{ delay: i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
              <motion.div className="w-full bg-slate-300 dark:bg-slate-600" initial={{ height: 0 }} animate={{ height: `${(classes / max) * 100}%` }} transition={{ delay: i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <span className={cn('text-[11px]', i === 0 ? 'font-semibold text-indigo-700 dark:text-indigo-400' : 'text-muted')}>{WEEKDAYS_SHORT[d.getDay()]}</span>
          </a>
        ))}
      </div>
      <div className="flex gap-4 px-5 pb-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-indigo-500" /> Study
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-slate-300 dark:bg-slate-600" /> Classes
        </span>
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function listify(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
}

function upcomingClass(events, now) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(startOfDay(now), i);
    const todays = events
      .filter((e) => eventOn(e, d) && (i > 0 || toMinutes(e.start_time) > minutesOf(now)))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (todays[0]) return i === 0 ? `today ${todays[0].start_time}` : i === 1 ? `tomorrow ${todays[0].start_time}` : `${WEEKDAYS_SHORT[d.getDay()]} ${todays[0].start_time}`;
  }
  return null;
}
