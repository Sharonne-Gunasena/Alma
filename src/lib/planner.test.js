import { describe, expect, it } from 'vitest';
import { buildPlan, subtractRanges } from './planner.js';

// Monday 26 Oct 2026, 08:00 local time.
const NOW = new Date(2026, 9, 26, 8, 0);
const at = (day, h, m = 0) => new Date(2026, 9, 26 + day, h, m).toISOString();
const weekdayWindows = { windows: { 0: [], 1: [[540, 720]], 2: [[540, 720]], 3: [[540, 720]], 4: [[540, 720]], 5: [[540, 720]], 6: [] } };

describe('subtractRanges', () => {
  it('cuts busy time out of free time and drops tiny leftovers', () => {
    expect(subtractRanges([[540, 720]], [[600, 660]])).toEqual([
      [540, 600],
      [660, 720],
    ]);
    expect(subtractRanges([[540, 560]], [])).toEqual([]);
  });
});

describe('buildPlan', () => {
  it('never schedules study during a class', () => {
    const lecture = { weekday: 1, start_time: '10:00', end_time: '11:00', start_date: '2026-09-01', end_date: '2026-12-31' };
    const { sessions } = buildPlan({
      now: NOW,
      prefs: weekdayWindows,
      classEvents: [lecture],
      assignments: [{ id: 'a', title: 'Essay', due_at: at(4, 17), effort_hours: 6 }],
    });
    const monday = sessions.filter((s) => s.start.getDate() === 26);
    for (const s of monday) expect(s.end <= new Date(2026, 9, 26, 10) || s.start >= new Date(2026, 9, 26, 11)).toBe(true);
  });

  it('works on the tighter task first, even if it is due later', () => {
    const { sessions } = buildPlan({
      now: NOW,
      prefs: weekdayWindows,
      assignments: [
        { id: 'small', title: 'Quiz prep', due_at: at(1, 17), effort_hours: 1 },
        { id: 'big', title: 'Project', due_at: at(2, 17), effort_hours: 6 },
      ],
    });
    // The 6h project only has 6h of study time before its deadline, so it must start immediately.
    expect(sessions[0].assignmentId).toBe('big');
  });

  it('warns when work cannot fit before the deadline', () => {
    const { warnings } = buildPlan({
      now: NOW,
      prefs: weekdayWindows,
      assignments: [{ id: 'a', title: 'Report', due_at: at(1, 17), effort_hours: 10 }],
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: 'shortfall', assignmentId: 'a', minutes: 240 })]);
  });

  it('flags overdue work and ignores finished tasks', () => {
    const { warnings, sessions } = buildPlan({
      now: NOW,
      prefs: weekdayWindows,
      assignments: [
        { id: 'late', title: 'Lab', due_at: at(-1, 17), effort_hours: 2 },
        { id: 'done', title: 'Old', due_at: at(3, 17), effort_hours: 2, status: 'done' },
      ],
    });
    expect(warnings).toEqual([expect.objectContaining({ kind: 'overdue', assignmentId: 'late' })]);
    expect(sessions.some((s) => s.assignmentId === 'done')).toBe(false);
  });

  it('counts hours already done', () => {
    const { sessions } = buildPlan({
      now: NOW,
      prefs: weekdayWindows,
      assignments: [{ id: 'a', title: 'Essay', due_at: at(4, 17), effort_hours: 3, hours_done: 2 }],
    });
    const minutes = sessions.reduce((s, x) => s + (x.end - x.start) / 60000, 0);
    expect(minutes).toBe(60);
  });

  it('adds a daily flashcard review when the student has cards', () => {
    const { sessions } = buildPlan({ now: NOW, prefs: weekdayWindows, hasCards: true });
    expect(sessions.filter((s) => s.kind === 'review').length).toBe(5);
  });
});
