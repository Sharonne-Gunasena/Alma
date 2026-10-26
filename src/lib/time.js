export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

export const atMinutes = (day, min) => new Date(startOfDay(day).getTime() + min * 60000);

// YYYY-MM-DD in local time (toISOString would shift the date across midnight UTC).
export const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const sameDay = (a, b) => isoDate(a) === isoDate(b);

// 24-hour "HH:MM", matching how timetable times are stored and sorted.
export const timeOf = (date) => fromMinutes(date.getHours() * 60 + date.getMinutes());

export function formatDue(date, now = new Date()) {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  const time = timeOf(date);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${WEEKDAYS[date.getDay()]} ${time}`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const formatHours = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

// Teaching week number, counted from the Monday of the first timetabled class.
export function semesterWeek(classEvents, now = new Date()) {
  const starts = classEvents.map((e) => e.start_date).filter(Boolean).sort();
  if (!starts.length) return null;
  const [y, m, d] = starts[0].split('-').map(Number);
  const first = new Date(y, m - 1, d);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  const week = Math.floor((startOfDay(now) - first) / (7 * DAY_MS)) + 1;
  return week >= 1 && week <= 20 ? week : null;
}

// Is a weekly class event running on this date?
export function eventOn(event, date) {
  if (event.weekday !== date.getDay()) return false;
  const day = isoDate(date);
  return (!event.start_date || day >= event.start_date) && (!event.end_date || day <= event.end_date);
}
