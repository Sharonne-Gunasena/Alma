import { describe, expect, it } from 'vitest';
import { buildExam, calibration, canBeChoice, cardWeight, distractorsFor, markQuestion, needsMarking, pickCards, revisionTask, scoreOf, seeded, topicBreakdown } from './exam.js';

const NOW = new Date(2026, 9, 29, 12, 0);
const card = (id, topic, back, extra = {}) => ({ id, deck_id: 'd1', topic, front: `Q${id}`, back, type: 'definition', reviews: 0, lapses: 0, due: NOW.toISOString(), ...extra });

const cards = [
  card('1', 'Logic', 'Modus ponens'),
  card('2', 'Logic', 'Modus tollens'),
  card('3', 'Logic', 'Hypothetical syllogism'),
  card('4', 'Logic', 'Disjunctive syllogism'),
  card('5', 'Sets', 'The empty set'),
  card('6', 'Sets', 'A subset of every set'),
  card('7', 'Sets', 'Power set'),
  card('8', 'Code', 'for (int i = 0; i < n; i++) sum += a[i];', { type: 'code' }),
];

describe('cardWeight', () => {
  it('favours failed, unseen and overdue cards', () => {
    const solid = card('a', 'x', 'y', { reviews: 10, lapses: 0, due: new Date(2027, 0, 1).toISOString() });
    const shaky = card('b', 'x', 'y', { reviews: 10, lapses: 5, due: new Date(2027, 0, 1).toISOString() });
    expect(cardWeight(solid, NOW)).toBe(1);
    expect(cardWeight(shaky, NOW)).toBeGreaterThan(cardWeight(solid, NOW));
    expect(cardWeight(card('c', 'x', 'y'), NOW)).toBe(2);
  });
});

describe('pickCards', () => {
  it('returns the requested number of distinct cards', () => {
    const picked = pickCards(cards, 5, { rng: seeded(3), now: NOW });
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((c) => c.id)).size).toBe(5);
  });

  it('picks weak cards far more often than solid ones', () => {
    const solid = Array.from({ length: 20 }, (_, i) => card(`s${i}`, 'x', 'y', { reviews: 10, due: new Date(2027, 0, 1).toISOString() }));
    const weak = card('w', 'x', 'y', { reviews: 10, lapses: 8 });
    const rng = seeded(7);
    let hits = 0;
    for (let i = 0; i < 200; i++) if (pickCards([...solid, weak], 3, { rng, now: NOW }).some((c) => c.id === 'w')) hits++;
    // Uniform picking would include it about 14% of the time.
    expect(hits / 200).toBeGreaterThan(0.3);
  });
});

describe('distractorsFor', () => {
  it('prefers wrong answers from the same topic and never repeats the right one', () => {
    const wrong = distractorsFor(cards[0], cards, seeded(1));
    expect(wrong).toHaveLength(3);
    expect(wrong).not.toContain('Modus ponens');
    expect(wrong.every((w) => ['Modus tollens', 'Hypothetical syllogism', 'Disjunctive syllogism'].includes(w))).toBe(true);
  });

  it('returns fewer than three when there are not enough answers', () => {
    expect(distractorsFor(cards[0], cards.slice(0, 2), seeded(1))).toHaveLength(1);
  });
});

describe('buildExam', () => {
  it('keeps code cards as written questions and puts the right answer among the choices', () => {
    const qs = buildExam(cards, { count: 8, format: 'choice', rng: seeded(5), now: NOW });
    expect(qs).toHaveLength(8);
    const code = qs.find((q) => q.card_id === '8');
    expect(code.kind).toBe('written');
    for (const q of qs.filter((q) => q.kind === 'choice')) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices[q.correct_index]).toBe(q.answer);
    }
    expect(canBeChoice(cards[7])).toBe(false);
  });

  it('can be all written', () => {
    expect(buildExam(cards, { count: 4, format: 'written', rng: seeded(2) }).every((q) => q.kind === 'written')).toBe(true);
  });

  it('skips cards with an empty side', () => {
    expect(buildExam([card('x', 't', ''), ...cards.slice(0, 2)], { count: 10, rng: seeded(2) })).toHaveLength(2);
  });
});

describe('marking and results', () => {
  const qs = [
    { kind: 'choice', topic: 'Logic', correct_index: 2, response: 2, confidence: 'sure', mark: null },
    { kind: 'choice', topic: 'Logic', correct_index: 1, response: 0, confidence: 'sure', mark: null },
    { kind: 'written', topic: 'Sets', response: '', confidence: null, mark: null },
    { kind: 'written', topic: 'Sets', response: 'something', confidence: 'unsure', mark: null },
  ].map(markQuestion);

  it('marks choices instantly and blanks as zero, leaving typed answers to be marked', () => {
    expect(qs.map((q) => q.mark)).toEqual([1, 0, 0, null]);
    expect(needsMarking(qs)).toHaveLength(1);
  });

  it('scores, breaks down by topic and compares confidence with results', () => {
    const done = qs.map((q) => (q.mark === null ? { ...q, mark: 0.5 } : q));
    expect(scoreOf(done)).toBeCloseTo(1.5 / 4);
    expect(topicBreakdown(done).map((t) => [t.topic, t.pct])).toEqual([
      ['Sets', 0.25],
      ['Logic', 0.5],
    ]);
    const cal = calibration(done);
    expect(cal.sure).toBe(2);
    expect(cal.sureRight).toBe(1);
    expect(cal.sureWrong).toHaveLength(1);
  });
});

describe('revisionTask', () => {
  const missed = [
    { topic: 'Sets', mark: 0 },
    { topic: 'Logic', mark: 0.5 },
    { topic: 'Logic', mark: 1 },
  ];

  it('creates a planner deadline three days out for the missed topics', () => {
    const task = revisionTask({ questions: missed, moduleId: 'm', moduleName: 'Formal Foundations', now: NOW });
    expect(task.title).toBe('Revise Formal Foundations: Sets, Logic');
    expect(task.module_id).toBe('m');
    expect(new Date(task.due_at).getDate()).toBe(1); // 29 Oct + 3 days = 1 Nov
    expect(task.effort_hours).toBe(0.5);
  });

  it('moves the deadline to the day before a sooner exam', () => {
    const task = revisionTask({ questions: missed, examDate: '2026-10-31', now: NOW });
    expect(new Date(task.due_at).getDate()).toBe(30);
  });

  it('returns nothing when every answer was right', () => {
    expect(revisionTask({ questions: [{ topic: 'x', mark: 1 }], now: NOW })).toBeNull();
  });
});
