import { describe, expect, it } from 'vitest';
import { applyExclusions, describeRule, rulesFromText, weekdayFromName } from './exclusions.js';

const slots = [
  { title: 'COMP10330: Critical Thinking (Tutorial)', code: 'COMP10330', kind: 'tutorial', weekday: 4, location: 'Room 1' },
  { title: 'COMP10330: Critical Thinking (Lecture)', code: 'COMP10330', kind: 'lecture', weekday: 1, location: 'Theatre' },
  { title: 'Italian 1', code: null, kind: 'lecture', weekday: 4, location: 'Room 9' },
  { title: 'Databases lab', code: 'DEMO1', kind: 'lab', weekday: 2, location: 'Lab 3' },
];

describe('weekdayFromName', () => {
  it('reads plurals, short forms and misspellings of days', () => {
    expect(weekdayFromName('Thursdays')).toBe(4);
    expect(weekdayFromName('tues')).toBe(2);
    expect(weekdayFromName('mon')).toBe(1);
  });

  it('returns null for things that are not days', () => {
    expect(weekdayFromName('Sunderland')).toBeNull();
    expect(weekdayFromName('t')).toBeNull();
  });
});

describe('applyExclusions', () => {
  it('leaves out by module code, ignoring spaces and case', () => {
    const { kept } = applyExclusions(slots, [{ field: 'code', value: 'comp 10330' }]);
    expect(kept.map((s) => s.title)).toEqual(['Italian 1', 'Databases lab']);
  });

  it('leaves out one kind of class for one module only', () => {
    const { kept, excluded } = applyExclusions(slots, [{ field: 'kind', value: 'tutorial' }]);
    expect(excluded).toHaveLength(1);
    expect(kept).toHaveLength(3);
  });

  it('leaves out a whole day', () => {
    const { kept } = applyExclusions(slots, [{ field: 'weekday', value: 'Thursdays' }]);
    expect(kept.map((s) => s.title)).toEqual(['COMP10330: Critical Thinking (Lecture)', 'Databases lab']);
  });

  it('matches part of a class name, and tells you which rule removed it', () => {
    const { excluded } = applyExclusions(slots, [{ field: 'title', value: 'italian' }]);
    expect(excluded[0].slot.title).toBe('Italian 1');
    expect(excluded[0].rule.value).toBe('italian');
  });

  it('keeps everything when there are no rules', () => {
    expect(applyExclusions(slots, []).kept).toHaveLength(4);
  });

  it('ignores blank rules rather than removing everything', () => {
    expect(applyExclusions(slots, [{ field: 'title', value: '  ' }]).kept).toHaveLength(4);
  });
});

describe('rulesFromText', () => {
  it('turns a plain list into rules by what each item looks like', () => {
    expect(rulesFromText('COMP10330 tutorials, Thursday\nItalian; labs')).toEqual([
      { field: 'code', value: 'COMP10330', kind: 'tutorial' },
      { field: 'weekday', value: 'Thursday' },
      { field: 'title', value: 'Italian' },
      { field: 'kind', value: 'lab' },
    ]);
  });

  it('understands a plain sentence, ignoring words like "leave out"', () => {
    const rules = rulesFromText('leave out math10200 tutorials');
    expect(rules).toEqual([{ field: 'code', value: 'MATH10200', kind: 'tutorial' }]);
    const timetable = [
      { title: 'MATH10200: Matrix Algebra (Tutorial)', code: 'MATH10200', kind: 'tutorial', weekday: 1 },
      { title: 'MATH10200: Matrix Algebra (Lecture)', code: 'MATH10200', kind: 'lecture', weekday: 2 },
    ];
    expect(applyExclusions(timetable, rules).kept.map((s) => s.kind)).toEqual(['lecture']);
  });

  it('combines a day with a class type', () => {
    expect(rulesFromText("don't include Thursday tutorials")).toEqual([{ field: 'weekday', value: 'Thursday', kind: 'tutorial' }]);
    const { excluded } = applyExclusions(slots, rulesFromText("don't include Thursday tutorials"));
    expect(excluded.map((e) => e.slot.title)).toEqual(['COMP10330: Critical Thinking (Tutorial)']);
  });

  it('combines a module with a day', () => {
    expect(rulesFromText('skip COMP10330 on Mondays')).toEqual([{ field: 'code', value: 'COMP10330', day: 'Mondays' }]);
    const { excluded } = applyExclusions(slots, rulesFromText('skip COMP10330 on Mondays'));
    expect(excluded.map((e) => e.slot.title)).toEqual(['COMP10330: Critical Thinking (Lecture)']);
  });

  it('splits on "and", and matches class names word by word', () => {
    expect(rulesFromText('skip Thursdays and Italian')).toEqual([
      { field: 'weekday', value: 'Thursdays' },
      { field: 'title', value: 'Italian' },
    ]);
    expect(rulesFromText('leave out Databases labs')).toEqual([{ field: 'title', value: 'Databases', kind: 'lab' }]);
    const { excluded } = applyExclusions(slots, rulesFromText('leave out Databases labs'));
    expect(excluded.map((e) => e.slot.title)).toEqual(['Databases lab']);
  });

  it('reads a module code with a class type as one rule', () => {
    expect(rulesFromText('COMP10330 tutorials')).toEqual([{ field: 'code', value: 'COMP10330', kind: 'tutorial' }]);
    const { kept, excluded } = applyExclusions(slots, rulesFromText('COMP10330 tutorials'));
    expect(excluded.map((e) => e.slot.title)).toEqual(['COMP10330: Critical Thinking (Tutorial)']);
    expect(kept).toHaveLength(3);
  });

  it('recognises a module code on its own', () => {
    expect(rulesFromText('COMP10330')).toEqual([{ field: 'code', value: 'COMP10330' }]);
  });
});

describe('describeRule', () => {
  it('describes each kind of rule in plain words', () => {
    expect(describeRule({ field: 'weekday', value: 'thursdays' })).toBe('on Thursday');
    expect(describeRule({ field: 'code', value: 'COMP10330' })).toBe('code COMP10330');
    expect(describeRule({ field: 'kind', value: 'tutorial' })).toBe('all tutorials');
    expect(describeRule({ field: 'title', value: 'Italian' })).toBe('"Italian"');
    expect(describeRule({ field: 'code', value: 'MATH10200', kind: 'tutorial' })).toBe('MATH10200 tutorials');
    expect(describeRule({ field: 'weekday', value: 'Thursday', kind: 'tutorial' })).toBe('Thursday tutorials');
    expect(describeRule({ field: 'code', value: 'COMP10330', day: 'mondays' })).toBe('code COMP10330 on Monday');
  });
});
