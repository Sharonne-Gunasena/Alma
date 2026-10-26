import { describe, expect, it, vi } from 'vitest';

// Stand-in for the real providers: records each request and returns canned JSON.
const calls = [];
vi.mock('./providers.js', () => ({
  generateJSON: vi.fn(async (_ai, { system, parts }) => {
    calls.push({ system, text: parts.map((p) => p.text ?? '[image]').join('\n') });
    if (system.startsWith('You review')) {
      return { cards: [{ type: 'definition', front: 'In C, what is a pointer?', back: 'A variable that stores a memory address.', page: 1 }] };
    }
    return {
      topic: `Topic ${calls.length}`,
      summary: 'Summary.',
      key_terms: [{ term: 'pointer', definition: 'stores an address' }],
      cards: [
        { type: 'definition', front: 'What is a pointer?', back: 'A variable that stores a memory address.', page: 1 },
        { type: 'definition', front: 'What is a pointer?', back: 'A variable that stores a memory address.', page: 1 },
      ],
    };
  }),
}));
vi.mock('../lib/extract.js', () => ({ renderPageImage: vi.fn() }));

const { buildStudySet } = await import('./engine.js');
const ai = { provider: 'groq', model: 'test', info: { chunkChars: 200, vision: false } };
const pages = [
  { page: 1, text: 'A pointer is a variable that stores a memory address. '.repeat(2) },
  { page: 2, text: 'The dereference operator reads the value stored at an address. '.repeat(2) },
];

describe('buildStudySet', () => {
  it('works section by section and builds a study guide', async () => {
    calls.length = 0;
    const steps = [];
    const { cards, guide } = await buildStudySet({ ai, title: 'Pointers', pages, onProgress: (p) => steps.push(p) });
    expect(calls).toHaveLength(2); // one request per section
    expect(calls[1].text).toContain('Topics already covered'); // later sections know what's been done
    expect(guide.sections.map((s) => s.pages)).toEqual([[1], [2]]);
    expect(cards).toHaveLength(1); // duplicates removed across sections
    expect(cards[0].topic).toBe('Topic 1');
    expect(steps.at(-1)).toMatchObject({ step: 2, steps: 2 });
  });

  it('runs a review pass per section in thorough mode', async () => {
    calls.length = 0;
    const { cards } = await buildStudySet({ ai, title: 'Pointers', pages, thorough: true });
    expect(calls.filter((c) => c.system.startsWith('You review'))).toHaveLength(2);
    expect(cards[0].front).toBe('In C, what is a pointer?');
  });

  it('keeps finished sections when the provider fails partway', async () => {
    const { generateJSON } = await import('./providers.js');
    calls.length = 0;
    const normal = generateJSON.getMockImplementation();
    generateJSON.mockImplementationOnce(normal).mockImplementationOnce(async () => {
      throw new Error('Google Gemini is overloaded right now.');
    });
    const set = await buildStudySet({ ai, title: 'Pointers', pages });
    expect(set.guide.sections.map((s) => s.pages)).toEqual([[1]]);
    expect(set.skipped).toEqual([2]);
    expect(set.stopReason).toMatch(/overloaded/);
  });

  it('fails outright if no section could be processed', async () => {
    const { generateJSON } = await import('./providers.js');
    generateJSON.mockImplementationOnce(async () => {
      throw new Error('Google Gemini is overloaded right now.');
    });
    await expect(buildStudySet({ ai, title: 'Pointers', pages })).rejects.toThrow(/overloaded/);
  });

  it('tells the model which topics an earlier run already covered', async () => {
    calls.length = 0;
    await buildStudySet({ ai, title: 'Pointers', pages: [pages[1]], previousTopics: ['Pointer basics'] });
    expect(calls[0].text).toContain('Pointer basics');
  });

  it('refuses empty documents with a helpful message', async () => {
    await expect(buildStudySet({ ai, title: 'Empty', pages: [{ page: 1, text: '' }] })).rejects.toThrow(/No readable text/);
  });
});
