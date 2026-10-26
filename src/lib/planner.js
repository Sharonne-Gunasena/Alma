// The adaptive study planner.
//
// Each day's free time = the student's study windows minus their classes,
// capped at a daily maximum. That time is cut into sessions, and each session
// goes to the task with the least *slack*: the study time left before its
// deadline minus the work it still needs. Least-slack-first is a classic
// real-time scheduling rule; it naturally favours tasks that are urgent *and*
// big, not just whichever is due first. Priority nudges the choice.
//
// The plan is recomputed from the remaining work every time it's shown, so a
// missed session simply rolls forward, and the warnings say when the work no
// longer fits before a deadline.
import { DAY_MS, addDays, atMinutes, eventOn, startOfDay, toMinutes } from './time.js';

export const DEFAULT_STUDY_PREFS = {
  // Minutes from midnight, per weekday (0 = Sunday).
  windows: {
    0: [[600, 1020]],
    1: [[540, 1260]],
    2: [[540, 1260]],
    3: [[540, 1260]],
    4: [[540, 1260]],
    5: [[540, 1140]],
    6: [[600, 1020]],
  },
  maxDailyMinutes: 240,
  sessionMinutes: 60,
  reviewMinutes: 20,
};

const DEFAULT_EFFORT_HOURS = 2;
const MIN_SESSION = 25;
const PER_TASK_DAILY_CAP = 120;

// Subtract busy ranges from free ranges (all in minutes from midnight).
export function subtractRanges(free, busy) {
  let result = free.map((r) => [...r]);
  for (const [bs, be] of busy) {
    result = result.flatMap(([s, e]) => {
      if (be <= s || bs >= e) return [[s, e]];
      const parts = [];
      if (bs > s) parts.push([s, bs]);
      if (be < e) parts.push([be, e]);
      return parts;
    });
  }
  return result.filter(([s, e]) => e - s >= MIN_SESSION);
}

function remainingMinutes(task) {
  const effort = task.effort_hours ?? DEFAULT_EFFORT_HOURS;
  return Math.max(0, Math.round((effort - (task.hours_done ?? 0)) * 60));
}

export function buildPlan({ now = new Date(), assignments = [], classEvents = [], prefs = DEFAULT_STUDY_PREFS, hasCards = false }) {
  const p = { ...DEFAULT_STUDY_PREFS, ...prefs };
  const tasks = assignments
    .filter((a) => a.status !== 'done')
    .map((a) => ({ ...a, deadline: new Date(a.due_at), remaining: remainingMinutes(a) }))
    .filter((t) => t.remaining > 0);

  const lastDeadline = Math.max(now.getTime(), ...tasks.map((t) => t.deadline.getTime()));
  const horizon = Math.min(28, Math.max(7, Math.ceil((lastDeadline - startOfDay(now)) / DAY_MS) + 1));

  // 1. Build the free time blocks, day by day.
  const blocks = [];
  const sessions = [];
  for (let d = 0; d < horizon; d++) {
    const day = addDays(startOfDay(now), d);
    const busy = classEvents.filter((e) => eventOn(e, day)).map((e) => [toMinutes(e.start_time), toMinutes(e.end_time)]);
    let free = subtractRanges(p.windows[day.getDay()] ?? [], busy);
    if (d === 0) {
      const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
      free = subtractRanges(free, [[0, nowMin]]);
    }

    let budget = p.maxDailyMinutes;
    let reviewDone = !hasCards || !p.reviewMinutes;
    for (const [s, e] of free) {
      let start = s;
      if (!reviewDone && e - start >= p.reviewMinutes) {
        sessions.push({ kind: 'review', start: atMinutes(day, start), end: atMinutes(day, start + p.reviewMinutes) });
        start += p.reviewMinutes;
        budget -= p.reviewMinutes;
        reviewDone = true;
      }
      while (budget >= MIN_SESSION && e - start >= MIN_SESSION) {
        const len = Math.min(p.sessionMinutes, e - start, budget);
        blocks.push({ day: d, start: atMinutes(day, start), end: atMinutes(day, start + len), minutes: len });
        start += len;
        budget -= len;
      }
    }
  }

  // 2. Assign blocks to tasks, least slack first.
  const capacityAfter = (i, deadline) => {
    let total = 0;
    for (let j = i; j < blocks.length && blocks[j].end <= deadline; j++) total += blocks[j].minutes;
    return total;
  };
  const assigned = new Map(tasks.map((t) => [t.id, 0]));
  const usedToday = new Map();

  blocks.forEach((block, i) => {
    const candidates = tasks
      .filter((t) => t.remaining > 0 && t.deadline >= block.end)
      .map((t) => ({ t, slack: capacityAfter(i, t.deadline) - t.remaining - ((t.priority ?? 2) - 2) * 60 }));
    if (!candidates.length) return;

    const key = (t) => `${block.day}:${t.id}`;
    // Avoid spending a whole day on one task unless it's already tight.
    const varied = candidates.filter(({ t, slack }) => slack <= 0 || (usedToday.get(key(t)) ?? 0) < PER_TASK_DAILY_CAP);
    const pool = varied.length ? varied : candidates;
    pool.sort((a, b) => a.slack - b.slack || a.t.deadline - b.t.deadline);
    const { t } = pool[0];

    const minutes = Math.min(block.minutes, t.remaining);
    t.remaining -= minutes;
    assigned.set(t.id, assigned.get(t.id) + minutes);
    usedToday.set(key(t), (usedToday.get(key(t)) ?? 0) + minutes);
    sessions.push({ kind: 'task', assignmentId: t.id, title: t.title, module_id: t.module_id, start: block.start, end: new Date(block.start.getTime() + minutes * 60000) });
  });

  // 3. Warnings: overdue work, and work that no longer fits before its deadline.
  const warnings = [];
  for (const a of assignments.filter((a) => a.status !== 'done')) {
    const needed = remainingMinutes(a);
    if (!needed) continue;
    const deadline = new Date(a.due_at);
    if (deadline < now) {
      warnings.push({ kind: 'overdue', assignmentId: a.id, title: a.title, minutes: needed });
      continue;
    }
    const got = assigned.get(a.id) ?? 0;
    if (got < needed) warnings.push({ kind: 'shortfall', assignmentId: a.id, title: a.title, minutes: needed - got, deadline });
  }

  const totalRemaining = tasks.reduce((s, t) => s + remainingMinutes(t), 0);
  const capacity = blocks.filter((b) => b.end <= new Date(lastDeadline)).reduce((s, b) => s + b.minutes, 0);
  sessions.sort((a, b) => a.start - b.start);
  return { sessions, warnings, stats: { remainingMinutes: totalRemaining, capacityMinutes: capacity, horizonDays: horizon } };
}
