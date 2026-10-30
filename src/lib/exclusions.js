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

// A rule can also carry a class type, e.g. { field: 'code', value: 'COMP10330', kind: 'tutorial' }.
export function matchesRule(slot, rule) {
  const value = String(rule.value).trim().toLowerCase();
  if (!value) return false;
  if (rule.kind && !(slot.kind ?? '').toLowerCase().includes(String(rule.kind).toLowerCase())) return false;
  if (rule.field === 'weekday') {
    const day = weekdayFromName(rule.value);
    return day !== null && slot.weekday === day;
  }
  if (rule.field === 'code') return (slot.code ?? '').replace(/\s/g, '').toLowerCase() === value.replace(/\s/g, '');
  if (rule.field === 'kind') return (slot.kind ?? '').toLowerCase().includes(value);
  const text = rule.field === 'location' ? slot.location : slot.title;
  return (text ?? '').toLowerCase().includes(value);
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

// A short label for a rule, e.g. "on Thursday", "code COMP10330".
export function describeRule({ field, value, kind }) {
  const day = weekdayFromName(value);
  if (field === 'weekday' && day !== null) return `on ${DAYS[day][0].toUpperCase()}${DAYS[day].slice(1)}`;
  if (field === 'code') return kind ? `${value} ${kind}s` : `code ${value}`;
  if (field === 'kind') return `all ${value.replace(/s$/i, '')}s`;
  if (field === 'location') return `in ${value}`;
  return `"${value}"`;
}

// Offline fallback for instructions: one rule per comma, semicolon or line.
export function rulesFromText(text) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const combo = token.match(/^([a-z]{2,5}\s?\d{3,6}[a-z]?)\s+(lecture|tutorial|lab|practical)s?$/i);
      if (combo) return { field: 'code', value: combo[1], kind: combo[2].toLowerCase() };
      if (/^[a-z]+s?$/i.test(token) && weekdayFromName(token) !== null) return { field: 'weekday', value: token };
      if (/^[a-z]{2,5}\s?\d{3,6}[a-z]?$/i.test(token)) return { field: 'code', value: token };
      if (/^(lecture|tutorial|lab|practical)s?$/i.test(token)) return { field: 'kind', value: token.replace(/s$/i, '') };
      return { field: 'title', value: token };
    });
}
