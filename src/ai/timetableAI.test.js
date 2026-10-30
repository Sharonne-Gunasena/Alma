import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./providers.js', () => ({ generateJSON: vi.fn() }));

const { generateJSON } = await import('./providers.js');
const { parseExclusions, readTimetableImage } = await import('./timetableAI.js');

const ai = { provider: 'gemini', info: { vision: true }, apiKey: 'test', model: 'test' };
const image = { mime: 'image/jpeg', data: 'abc' };

describe('readTimetableImage', () => {
  it('sends a format with no nullable fields, which Gemini may reject', async () => {
    generateJSON.mockResolvedValueOnce({ events: [] });
    await readTimetableImage(ai, image);
    const { schema, maxTokens } = generateJSON.mock.calls.at(-1)[1];
    expect(JSON.stringify(z.toJSONSchema(schema))).not.toContain('null');
    // Long enough for a full week, even when the model thinks first.
    expect(maxTokens).toBeGreaterThanOrEqual(8000);
  });

  it('turns what the AI read into weekly slots', async () => {
    generateJSON.mockResolvedValueOnce({
      events: [
        { title: 'Module A Lecture', code: '', kind: 'Lecture', day: 'Monday', start_time: '9:00', end_time: '10:00', location: '' },
        { title: 'COMP10330 Tutorial', code: 'COMP10330', kind: 'tutorial', day: 'Thursday', start_time: '14.00', end_time: '15:00', location: 'Room 2' },
      ],
    });
    const slots = await readTimetableImage(ai, image);
    expect(slots).toEqual([
      { title: 'Module A Lecture', code: null, module_name: 'Module A Lecture', kind: 'lecture', weekday: 1, start_time: '09:00', end_time: '10:00', location: null },
      { title: 'COMP10330 Tutorial', code: 'COMP10330', module_name: 'COMP10330 Tutorial', kind: 'tutorial', weekday: 4, start_time: '14:00', end_time: '15:00', location: 'Room 2' },
    ]);
  });

  it('drops entries with no real day or time', async () => {
    generateJSON.mockResolvedValueOnce({
      events: [
        { title: 'Lunch', code: '', kind: 'class', day: 'Every day', start_time: '12:00', end_time: '13:00', location: '' },
        { title: 'Module B Seminar', code: '', kind: 'seminar', day: 'Tuesday', start_time: 'TBC', end_time: '', location: '' },
      ],
    });
    expect(await readTimetableImage(ai, image)).toEqual([]);
  });
});

describe('parseExclusions', () => {
  it('sends a format with no nullable fields, and drops an empty class type', async () => {
    generateJSON.mockResolvedValueOnce({
      rules: [
        { field: 'weekday', value: 'Thursday', kind: '' },
        { field: 'code', value: 'COMP10330', kind: 'tutorial' },
      ],
    });
    const rules = await parseExclusions(ai, 'skip Thursdays and COMP10330 tutorials');
    expect(JSON.stringify(z.toJSONSchema(generateJSON.mock.calls.at(-1)[1].schema))).not.toContain('null');
    expect(rules).toEqual([
      { field: 'weekday', value: 'Thursday' },
      { field: 'code', value: 'COMP10330', kind: 'tutorial' },
    ]);
  });
});
