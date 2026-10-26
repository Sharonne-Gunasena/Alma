// Imports a timetable exported from Google Calendar (or any .ics file) and
// collapses recurring classes into weekly slots: "COMP10110 lecture,
// Thursday 15:00–15:50, Sept–Dec".
import ICAL from 'ical.js';
import { fromMinutes, isoDate } from './time.js';

const MAX_OCCURRENCES = 200;

// "COMP10330: Critical Thinking (Practical)" -> code, name, kind
export function parseTitle(summary) {
  const m = summary.match(/^\s*([A-Z]{3,5}\s?\d{4,6}[A-Z]?)\s*[:\-–]\s*(.+?)\s*(?:\(([^)]+)\))?\s*$/);
  if (!m) return { code: null, name: summary.trim(), kind: guessKind(summary) };
  return { code: m[1].replace(/\s/g, ''), name: m[2].trim(), kind: (m[3] ?? guessKind(summary)).toLowerCase() };
}

function guessKind(s) {
  return /lab|practical/i.test(s) ? 'practical' : /tutorial/i.test(s) ? 'tutorial' : /lecture/i.test(s) ? 'lecture' : 'class';
}

export function parseIcs(text, { now = new Date() } = {}) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const occurrences = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    // Edited single occurrences of a series are covered by the series itself.
    if (event.isRecurrenceException()) continue;
    if (!event.startDate || event.startDate.isDate) continue; // skip all-day events

    const durationMin = Math.round(event.duration.toSeconds() / 60);
    const starts = [];
    if (event.isRecurring()) {
      const it = event.iterator();
      const stopAt = new Date(now.getFullYear() + 1, now.getMonth(), 1);
      for (let next = it.next(); next && starts.length < MAX_OCCURRENCES; next = it.next()) {
        const d = next.toJSDate();
        if (d > stopAt) break;
        starts.push(d);
      }
    } else {
      starts.push(event.startDate.toJSDate());
    }
    for (const start of starts) occurrences.push({ summary: event.summary ?? 'Class', location: event.location ?? '', start, durationMin });
  }

  // Group identical weekly slots into one event with a date range.
  const slots = new Map();
  for (const o of occurrences) {
    const startMin = o.start.getHours() * 60 + o.start.getMinutes();
    const key = [o.summary, o.start.getDay(), startMin, o.durationMin, o.location].join('|');
    const day = isoDate(o.start);
    const slot = slots.get(key);
    if (slot) {
      if (day < slot.start_date) slot.start_date = day;
      if (day > slot.end_date) slot.end_date = day;
    } else {
      const { code, name, kind } = parseTitle(o.summary);
      slots.set(key, {
        title: o.summary.trim(),
        code,
        module_name: name,
        kind,
        location: o.location,
        weekday: o.start.getDay(),
        start_time: fromMinutes(startMin),
        end_time: fromMinutes(Math.min(startMin + o.durationMin, 24 * 60 - 1)),
        start_date: day,
        end_date: day,
      });
    }
  }
  return [...slots.values()].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}
