// Rules for leaving classes out of an imported timetable, e.g. "COMP10330 tutorials",
// "Thursdays" or "Italian". Plain code, so it works without an AI key.

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const RULE_FIELDS = ['title', 'code', 'kind', 'weekday', 'location'];

// "Thursdays", "thu", "tues" -> 4, 2, 2. Returns null when the text isn't a day.
export function weekdayFromName(text) {
  const t = String(text).trim().toLowerCase().replace(/s$/, '');
  if (t.length < 3) return null;
  const i = DAYS.findIndex((d) => d.startsWith(t));
  return i === -1 ? null : i;
}

// A rule can also narrow itself to a class type and a day, e.g.
// { field: 'code', value: 'COMP10330', kind: 'tutorial', day: 'Thursday' }.
export function matchesRule(slot, rule) {
  const value = String(rule.value).trim().toLowerCase();
  if (!value) return false;
  if (rule.kind && !(slot.kind ?? '').toLowerCase().includes(String(rule.kind).toLowerCase())) return false;
  if (rule.day) {
    const day = weekdayFromName(rule.day);
    if (day === null || slot.weekday !== day) return false;
  }
  if (rule.field === 'weekday') {
    const day = weekdayFromName(rule.value);
    return day !== null && slot.weekday === day;
  }
  if (rule.field === 'code') return (slot.code ?? '').replace(/\s/g, '').toLowerCase() === value.replace(/\s/g, '');
  if (rule.field === 'kind') return (slot.kind ?? '').toLowerCase().includes(value);
  if (rule.field === 'location') return (slot.location ?? '').toLowerCase().includes(value);
  // Titles match when every word appears, so "Module A" finds "Module A Tutorial".
  const title = (slot.title ?? '').toLowerCase();
  return value.split(/\s+/).every((word) => title.includes(word));
}

// Splits the slots into the ones kept and the ones left out, and says which rule removed each.
export function applyExclusions(slots, rules) {
  const kept = [];
  const excluded = [];
  for (const slot of slots) {
    const rule = rules.find((r) => matchesRule(slot, r));
    if (rule) excluded.push({ slot, rule });
    else kept.push(slot);
  }
  return { kept, excluded };
}

const dayName = (text) => {
  const day = weekdayFromName(text);
  return day === null ? text : `${DAYS[day][0].toUpperCase()}${DAYS[day].slice(1)}`;
};
const plural = (kind) => `${kind.replace(/s$/i, '')}s`;

// A short label for a rule, e.g. "on Thursday", "MATH10200 tutorials".
export function describeRule({ field, value, kind, day }) {
  if (field === 'weekday') return kind ? `${dayName(value)} ${plural(kind)}` : `on ${dayName(value)}`;
  if (field === 'kind') return `all ${plural(value)}`;
  if (field === 'location') return `in ${value}`;
  let text;
  if (field === 'code') text = kind ? `${value} ${plural(kind)}` : `code ${value}`;
  else text = kind ? `"${value}" ${plural(kind)}` : `"${value}"`;
  return day ? `${text} on ${dayName(day)}` : text;
}

const CODE = /\b([a-z]{2,5}\s?\d{3,6}[a-z]?)\b/i;
const KIND = /\b(lecture|tutorial|lab|practical|seminar|workshop)s?\b/i;
const FILLER = /\b(please|leave|out|skip|don'?t|do|not|include|exclude|remove|ignore|drop|without|any|all|the|my|classes|class|on|every|from|them|these|those|following|no)\b/gi;

// Reads instructions like "leave out MATH10200 tutorials", "skip Thursdays and Italian"
// or "don't include Module A labs". One rule per clause (split on commas, lines and "and").
export function rulesFromText(text) {
  return text
    .split(/[\n,;&]+|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((clause) => {
      const code = clause.match(CODE)?.[1].replace(/\s/g, '').toUpperCase();
      const kind = clause.match(KIND)?.[1].toLowerCase();
      const dayWord = clause.split(/[^a-z]+/i).find((w) => w.length >= 3 && weekdayFromName(w) !== null);

      if (code) return { field: 'code', value: code, ...(kind && { kind }), ...(dayWord && { day: dayWord }) };
      if (dayWord) return { field: 'weekday', value: dayWord, ...(kind && { kind }) };

      // Whatever is left after the filler words is part of a class name.
      const rest = clause
        .replace(new RegExp(KIND.source, 'gi'), ' ')
        .replace(FILLER, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (rest) return { field: 'title', value: rest, ...(kind && { kind }) };
      if (kind) return { field: 'kind', value: kind };
      return null;
    })
    .filter(Boolean);
}
