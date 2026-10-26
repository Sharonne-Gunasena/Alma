import { describe, expect, it } from 'vitest';
import { parseIcs, parseTitle } from './ics.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:COMP10110: Computer Programming I (Lecture)
LOCATION:Science Hub F-H1.37SCH
DTSTART:20260910T150000
DTEND:20260910T155000
RRULE:FREQ=WEEKLY;COUNT=12
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:MATH10200: Matrix Algebra (Tutorial)
DTSTART:20260907T160000
DTEND:20260907T165000
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:MATH10200: Matrix Algebra (Tutorial)
DTSTART:20260914T160000
DTEND:20260914T165000
END:VEVENT
END:VCALENDAR`;

describe('parseTitle', () => {
  it('reads UCD-style module titles', () => {
    expect(parseTitle('COMP10330: Critical Thinking (Practical)')).toEqual({ code: 'COMP10330', name: 'Critical Thinking', kind: 'practical' });
    expect(parseTitle('Team meeting')).toEqual({ code: null, name: 'Team meeting', kind: 'class' });
  });
});

describe('parseIcs', () => {
  it('collapses recurring and repeated events into weekly slots', () => {
    const slots = parseIcs(ICS, { now: new Date(2026, 8, 1) });
    expect(slots).toHaveLength(2);
    const [tutorial, lecture] = slots;
    expect(tutorial).toMatchObject({ code: 'MATH10200', weekday: 1, start_time: '16:00', end_time: '16:50', start_date: '2026-09-07', end_date: '2026-09-14' });
    expect(lecture).toMatchObject({ code: 'COMP10110', kind: 'lecture', weekday: 4, start_time: '15:00', location: 'Science Hub F-H1.37SCH' });
    expect(lecture.end_date).toBe('2026-11-26');
  });
});
