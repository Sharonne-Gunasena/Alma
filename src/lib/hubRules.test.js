import { describe, expect, it } from 'vitest';
import { badgeFor, deckPayload, isHidden, nextBadge, points, rankItems } from './hubRules.js';

describe('hub rules', () => {
  it('hides items classmates clearly find unhelpful', () => {
    expect(isHidden({ helpful: 0, unhelpful: 2 })).toBe(false);
    expect(isHidden({ helpful: 0, unhelpful: 3 })).toBe(true);
    expect(isHidden({ helpful: 4, unhelpful: 6 })).toBe(false);
  });

  it('scores contributions and awards badges', () => {
    expect(points({ items: 2, helpful: 3, copies: 4 })).toBe(20 + 15 + 8);
    expect(badgeFor(0)).toBeNull();
    expect(badgeFor(10).label).toBe('Contributor');
    expect(badgeFor(60).label).toBe('Helper');
    expect(badgeFor(150).label).toBe('Top contributor');
    expect(nextBadge(42)).toMatchObject({ label: 'Helper', needed: 8 });
    expect(nextBadge(200)).toBeNull();
  });

  it('ranks by net helpful votes, then copies, then recency', () => {
    const items = [
      { id: 'a', helpful: 2, unhelpful: 0, copies: 1, updated_at: '2026-10-01' },
      { id: 'b', helpful: 5, unhelpful: 1, copies: 0, updated_at: '2026-09-01' },
      { id: 'c', helpful: 2, unhelpful: 0, copies: 3, updated_at: '2026-08-01' },
      { id: 'd', helpful: 2, unhelpful: 0, copies: 1, updated_at: '2026-10-05' },
    ];
    expect(rankItems(items).map((i) => i.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('shares card content but not study progress', () => {
    const payload = deckPayload([
      { front: 'Q', back: 'A', type: 'definition', topic: 'T', ease: 2.1, reps: 5, due: '2026-11-01' },
      { front: ' ', back: 'empty front is dropped' },
    ]);
    expect(payload).toEqual({ cards: [{ front: 'Q', back: 'A', type: 'definition', topic: 'T' }] });
  });
});
