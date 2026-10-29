import { describe, expect, it } from 'vitest';
import { moduleReadiness, topicStatus } from './readiness.js';

const NOW = new Date(2026, 9, 29, 12, 0);
const future = new Date(2026, 11, 1).toISOString();
const past = new Date(2026, 9, 20).toISOString();
const card = (topic, extra = {}) => ({ id: Math.random().toString(36), deck_id: 'd1', topic, reviews: 0, lapses: 0, interval_days: 0, due: past, ...extra });

describe('topicStatus', () => {
  it('sorts topics into not started, needs work, in progress and secure', () => {
    const cards = [
      card('Unseen'),
      card('Shaky', { reviews: 6, lapses: 4, due: future }),
      card('Going', { reviews: 3, lapses: 0, interval_days: 6, due: future }),
      card('Solid', { reviews: 8, lapses: 0, interval_days: 30, due: future }),
    ];
    const byTopic = Object.fromEntries(topicStatus(cards, { now: NOW }).map((t) => [t.topic, t.status]));
    expect(byTopic).toEqual({ Unseen: 'new', Shaky: 'risk', Going: 'learning', Solid: 'secure' });
  });

  it('flags a topic you got wrong in a practice exam even if reviews look fine', () => {
    const cards = [card('Solid', { reviews: 8, interval_days: 30, due: future })];
    const [t] = topicStatus(cards, { now: NOW, examTopics: new Map([['Solid', { pct: 0.25 }]]) });
    expect(t.status).toBe('risk');
    expect(t.reasons[0]).toMatch(/25% in your last practice exam/);
  });

  it('flags topics where most cards are overdue', () => {
    const [t] = topicStatus([card('Late', { reviews: 2 }), card('Late', { reviews: 2 })], { now: NOW });
    expect(t.status).toBe('risk');
  });
});

describe('moduleReadiness', () => {
  const cards = [
    card('Logic', { reviews: 4, lapses: 1, due: future }),
    card('Logic', { reviews: 4, lapses: 0, due: past }),
    card('Sets'),
    card('Sets'),
    card('Sets'),
  ];

  it('summarises coverage and retention from real reviews only', () => {
    const r = moduleReadiness({ cards, now: NOW, moduleId: 'm' });
    expect(r.coverage).toBeCloseTo(2 / 5);
    expect(r.retention).toBeCloseTo(1 - 1 / 8);
    expect(r.due).toBe(4);
    expect(r).not.toHaveProperty('passChance');
  });

  it('puts a practice exam first when the real exam is close', () => {
    const r = moduleReadiness({ cards, examDate: '2026-11-05', now: NOW, moduleId: 'm' });
    expect(r.daysToExam).toBe(7);
    expect(r.actions[0].kind).toBe('exam');
    expect(r.actions[0].href).toBe('#/exam?module=m');
    expect(r.actions.length).toBeLessThanOrEqual(3);
  });

  it('uses the latest finished attempt', () => {
    const attempts = [
      { finished_at: '2026-10-20T10:00:00Z', score: 0.4, questions: [] },
      { finished_at: '2026-10-28T10:00:00Z', score: 0.7, questions: [{ topic: 'Logic', mark: 0 }] },
      { finished_at: null, score: null, questions: [] },
    ];
    const r = moduleReadiness({ cards, attempts, now: NOW, moduleId: 'm' });
    expect(r.latest.score).toBe(0.7);
    expect(r.attempts).toHaveLength(2);
    expect(r.topics.find((t) => t.topic === 'Logic').status).toBe('risk');
    // A recent exam means no "take an exam" nudge.
    expect(r.actions.some((a) => a.kind === 'exam')).toBe(false);
  });
});
