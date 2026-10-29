// Study check-ins: "did you get to the session you planned?"
//
// The planner rebuilds the plan from remaining work every time, so a missed
// session silently rolls forward and a completed one is never recorded unless
// the student clicks Done in time. To ask afterwards, the dashboard remembers
// the study sessions it showed (per device, in localStorage) and, once one
// has ended, asks whether it happened.

const KEY = 'alma_checkins_v1';
const KEEP_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export const sessionKey = (s) => `${s.assignmentId}@${new Date(s.start).toISOString()}`;

// Pure: merge newly shown sessions into the remembered list, dropping old ones.
export function remember(list, sessions, now = new Date()) {
  const byKey = new Map(list.map((x) => [x.key, x]));
  for (const s of sessions) {
    if (s.kind !== 'task') continue;
    const key = sessionKey(s);
    if (!byKey.has(key))
      byKey.set(key, { key, assignmentId: s.assignmentId, title: s.title, module_id: s.module_id ?? null, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), resolved: false });
  }
  return [...byKey.values()].filter((x) => now - new Date(x.end) < KEEP_DAYS * DAY);
}

// Pure: sessions that have ended and haven't been answered, for assignments
// that still exist and aren't done. A session that was replanned (same task,
// overlapping time) is only asked about once.
export function pending(list, assignments, now = new Date()) {
  const open = new Map(assignments.filter((a) => a.status !== 'done').map((a) => [a.id, a]));
  const ended = list.filter((x) => !x.resolved && new Date(x.end) <= now && open.has(x.assignmentId)).sort((a, b) => a.start.localeCompare(b.start));
  const out = [];
  for (const x of ended) {
    const clash = out.some((y) => y.assignmentId === x.assignmentId && new Date(y.start) < new Date(x.end) && new Date(x.start) < new Date(y.end));
    if (!clash) out.push(x);
  }
  return out;
}

export const resolve = (list, keys) => list.map((x) => (keys.includes(x.key) ? { ...x, resolved: true } : x));

// Same task, overlapping time: answering one answers its replanned copies.
export function overlapping(list, item) {
  return list
    .filter((y) => y.assignmentId === item.assignmentId && new Date(y.start) < new Date(item.end) && new Date(item.start) < new Date(y.end))
    .map((y) => y.key);
}

// ---------- Storage (per user, per device) ----------

export function load(userId) {
  try {
    return JSON.parse(localStorage.getItem(`${KEY}:${userId}`)) ?? [];
  } catch {
    return [];
  }
}

export function save(userId, list) {
  try {
    localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(list));
  } catch {
    /* storage full or blocked: check-ins are a convenience */
  }
}
