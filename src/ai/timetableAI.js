// AI helpers for timetables: reading a screenshot, and turning a student's
// instructions ("leave out Thursday tutorials") into exclusion rules.
import { z } from 'zod';
import { generateJSON } from './providers.js';
import { RULE_FIELDS, weekdayFromName } from '../lib/exclusions.js';

const EventsSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      code: z.string().nullable(),
      kind: z.string(),
      day: z.string(),
      start_time: z.string(),
      end_time: z.string(),
      location: z.string().nullable(),
    }),
  ),
});

const RulesSchema = z.object({
  rules: z.array(z.object({ field: z.enum(RULE_FIELDS), value: z.string(), kind: z.string().nullish() })),
});

// "9:00", "09.00" or "9:00am" -> "09:00". Anything else is dropped.
function clock(text) {
  const m = String(text).match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// Reads one picture of a weekly timetable into weekly slots, the same shape the calendar import uses.
// The dates are filled in by the caller, since a screenshot has no term dates.
export async function readTimetableImage(ai, image) {
  const { events } = await generateJSON(ai, {
    system: [
      'You read a weekly university timetable from a screenshot.',
      'List each recurring class once, not once per week.',
      'For each: the title as shown, the module code if shown (e.g. COMP10330), the kind (lecture, tutorial, lab, practical, or class), the day of the week, the 24-hour start and end times, and the room if shown.',
      'Skip anything that is not a class, such as headings, legends or empty cells.',
    ].join(' '),
    parts: [{ text: 'Timetable screenshot:' }, { image }],
    schema: EventsSchema,
    maxTokens: 4000,
  });

  return events
    .map((e) => ({
      title: e.title.trim(),
      code: e.code?.trim() || null,
      module_name: e.title.trim(),
      kind: (e.kind || 'class').trim().toLowerCase(),
      weekday: weekdayFromName(e.day),
      start_time: clock(e.start_time),
      end_time: clock(e.end_time),
      location: e.location?.trim() || null,
    }))
    .filter((e) => e.weekday !== null && e.start_time && e.end_time);
}

// Turns free text like "leave out COMP10330 tutorials and all Thursdays" into rules.
export async function parseExclusions(ai, instructions) {
  const { rules } = await generateJSON(ai, {
    system: [
      "You turn a student's instructions about which timetable entries to leave out into rules.",
      'Fields: title (words in the class name), code (a module code such as COMP10330), kind (lecture, tutorial, lab or practical), weekday (a day name such as Thursday), location (a room or building).',
      'Create one rule per thing to leave out. For a module with a class type ("COMP10330 tutorials"), use field code with kind set to the type. Only include what the student asked to leave out, never what they want kept.',
    ].join(' '),
    parts: [{ text: instructions }],
    schema: RulesSchema,
    maxTokens: 1000,
  });
  return rules;
}
