import { describe, expect, it } from 'vitest';
import { checkCards, chunkPages, dedupe, grounding } from './quality.js';

describe('chunkPages', () => {
  it('groups pages up to the size limit and keeps page numbers', () => {
    const pages = [1, 2, 3, 4].map((page) => ({ page, text: 'x'.repeat(400) }));
    const chunks = chunkPages(pages, 900);
    expect(chunks.map((c) => c.pages)).toEqual([[1, 2], [3, 4]]);
    expect(chunks[0].text).toContain('[Page 2]');
  });

  it('splits a single oversized page', () => {
    const chunks = chunkPages([{ page: 1, text: 'y'.repeat(2500) }], 1000);
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => c.pages[0] === 1)).toBe(true);
  });
});

describe('checkCards', () => {
  const source = 'An eigenvalue is a scalar lambda such that Av equals lambda v for a non-zero vector v.';

  it('drops empty and self-answering cards', () => {
    const out = checkCards(
      [
        { type: 'definition', front: 'Hi', back: 'x' },
        { type: 'definition', front: 'Same text', back: 'same text' },
        { type: 'definition', front: 'What is an eigenvalue?', back: 'A scalar lambda with Av = lambda v for non-zero v.' },
      ],
      source,
    );
    expect(out.length).toBe(1);
    expect(out[0].flags).toEqual([]);
  });

  it('flags answers that are not in the notes', () => {
    const [card] = checkCards([{ type: 'definition', front: 'What is a monad?', back: 'A monoid in the category of endofunctors.' }], source);
    expect(card.flags.some((f) => f.includes('not clearly in your notes'))).toBe(true);
  });

  it('does not hold worked problems to the grounding check', () => {
    const [card] = checkCards([{ type: 'application', front: 'Find det [[2,1],[4,3]]', back: '2·3 − 1·4 = 2' }], source);
    expect(card.flags).toEqual([]);
  });
});

describe('dedupe and grounding', () => {
  it('removes near-duplicate cards', () => {
    const cards = [
      { front: 'What is an eigenvalue of a matrix?', back: 'A scalar lambda with Av = lambda v' },
      { front: 'What is an eigenvalue of a matrix A?', back: 'A scalar lambda such that Av = lambda v' },
      { front: 'What is a determinant?', back: 'A scalar computed from a square matrix' },
    ];
    expect(dedupe(cards).length).toBe(2);
  });

  it('measures how much of an answer appears in the source', () => {
    expect(grounding('scalar vector', 'a scalar and a vector')).toBe(1);
    expect(grounding('banana', 'a scalar and a vector')).toBe(0);
  });
});
