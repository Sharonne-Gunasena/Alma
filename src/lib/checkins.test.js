import { describe, expect, it } from 'vitest';
import { overlapping, pending, remember, resolve } from './checkins.js';

const at = (h, m = 0) => new Date(2026, 9, 29, h, m);
const session = (id, h, len = 60, m = 0) => ({ kind: 'task', assignmentId: id, title: `Task ${id}`, start: at(h, m), end: new Date(at(h, m).getTime() + len * 60000) });
const open = [{ id: 'a', status: 'todo' }, { id: 'b', status: 'todo' }];

describe('check-ins', () => {
  it('remembers task sessions once and ignores review blocks', () => {
    let list = remember([], [session('a', 10), { kind: 'review', start: at(9), end: at(9, 20) }], at(8));
    list = remember(list, [session('a', 10)], at(8));
    expect(list).toHaveLength(1);
  });

  it('asks only about sessions that have ended, for work that is still open', () => {
    const list = remember([], [session('a', 10), session('b', 13), session('gone', 9)], at(8));
    expect(pending(list, open, at(12)).map((x) => x.assignmentId)).toEqual(['a']);
    expect(pending(list, [{ id: 'a', status: 'done' }], at(12))).toEqual([]);
  });

  it('asks once about a session that was replanned a few minutes later', () => {
    // At 14:10 the plan rebuilt and moved the 14:00 session to 14:15.
    const list = remember([], [session('a', 14), session('a', 14, 60, 15)], at(13));
    const ask = pending(list, open, at(16));
    expect(ask).toHaveLength(1);
    const done = resolve(list, overlapping(list, ask[0]));
    expect(pending(done, open, at(16))).toEqual([]);
  });

  it('forgets sessions older than a week', () => {
    const list = remember([], [session('a', 10)], at(8));
    expect(remember(list, [], new Date(2026, 10, 10))).toEqual([]);
  });
});
