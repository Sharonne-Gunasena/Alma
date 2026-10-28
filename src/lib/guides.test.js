import { describe, expect, it } from 'vitest';
import { TEMPLATES, bullets, callout, doc, fromLectureGuide, h, p, plainText, sections, slugify, toMarkdown } from './guides.js';

describe('templates', () => {
  it('build valid documents', () => {
    for (const t of Object.values(TEMPLATES)) {
      const d = t.build();
      expect(d.type).toBe('doc');
      expect(d.content.length).toBeGreaterThan(0);
    }
  });
});

describe('fromLectureGuide', () => {
  it('turns AI lecture sections into headings, summaries and key terms', () => {
    const d = fromLectureGuide({
      sections: [{ topic: 'Eigenvalues', summary: 'Scalars that stretch eigenvectors.', key_terms: [{ term: 'Eigenvalue', definition: 'λ with Av = λv' }], pages: [3] }],
    });
    expect(d.content.map((n) => n.type)).toEqual(['heading', 'paragraph', 'callout']);
    expect(plainText(d)).toContain('Eigenvalue — λ with Av = λv');
  });
});

describe('sections', () => {
  it('splits a guide at headings with unique anchors', () => {
    const d = doc(p('Intro text'), h(2, 'Pointers'), p('Store addresses.'), h(2, 'Pointers'), bullets('Arrays decay', 'Null pointers'));
    expect(sections(d)).toEqual([
      { heading: 'Introduction', anchor: 'introduction', level: 0, text: 'Intro text' },
      { heading: 'Pointers', anchor: 'pointers', level: 2, text: 'Store addresses.' },
      { heading: 'Pointers', anchor: 'pointers-2', level: 2, text: 'Arrays decay\nNull pointers' },
    ]);
  });

  it('slugifies headings', () => {
    expect(slugify('What is a Matrix? (Part 1)')).toBe('what-is-a-matrix-part-1');
    expect(slugify('')).toBe('section');
  });
});

describe('toMarkdown', () => {
  it('exports headings, marks, lists, callouts and maths', () => {
    const d = doc(
      h(2, 'Key ideas'),
      { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' and ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] },
      bullets('one', 'two'),
      callout('keyterm', p('Matrix — a grid of numbers')),
      { type: 'blockMath', attrs: { latex: '\\det A' } },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('Revise')] }] },
    );
    expect(toMarkdown(d, 'Week 7')).toBe(
      '# Week 7\n\n## Key ideas\n\n**bold** and $x^2$\n\n- one\n- two\n\n> 🔑 **Key term**\n>\n> Matrix — a grid of numbers\n\n$$\n\\det A\n$$\n\n- [x] Revise\n',
    );
  });
});
