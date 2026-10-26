import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// A fake Gemini SDK whose responses each test scripts.
vi.mock('@google/genai', () => {
  const generateContent = vi.fn();
  return {
    GoogleGenAI: class {
      models = { generateContent };
    },
    generateContent,
  };
});

const { generateContent } = await import('@google/genai');
const { generateJSON, statusOf, PROVIDERS, RETRY } = await import('./providers.js');

const ai = { provider: 'gemini', info: PROVIDERS.gemini, apiKey: 'test-key', model: 'gemini-flash-latest' };
const schema = z.object({ ok: z.boolean() });
const busy = () => Object.assign(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand."}}'), { status: 503 });
const ok = { text: '{"ok":true}' };
const modelsCalled = () => generateContent.mock.calls.map(([req]) => req.model);

beforeEach(() => {
  generateContent.mockReset();
  RETRY.delaysMs = [0, 0, 0, 0];
});

describe('generateJSON retries', () => {
  it('retries a busy model and succeeds', async () => {
    generateContent.mockRejectedValueOnce(busy()).mockResolvedValueOnce(ok);
    await expect(generateJSON(ai, { system: 's', parts: [{ text: 'x' }], schema })).resolves.toEqual({ ok: true });
    expect(modelsCalled()).toEqual(['gemini-flash-latest', 'gemini-flash-latest']);
  });

  it('switches to a backup model when the main one stays busy', async () => {
    generateContent.mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValueOnce(ok);
    const messages = [];
    await generateJSON(ai, { system: 's', parts: [{ text: 'x' }], schema, onRetry: (r) => messages.push(r.message) });
    expect(modelsCalled()).toEqual(['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
    expect(messages.at(-1)).toMatch(/Switching to gemini-flash-lite-latest/);
  });

  it('skips backup models that do not exist', async () => {
    const missing = Object.assign(new Error('not found'), { status: 404 });
    generateContent
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(ok);
    await generateJSON(ai, { system: 's', parts: [{ text: 'x' }], schema });
    expect(modelsCalled().at(-1)).toBe('gemini-2.5-flash');
  });

  it('gives a clear message when everything is overloaded', async () => {
    generateContent.mockRejectedValue(busy());
    await expect(generateJSON(ai, { system: 's', parts: [{ text: 'x' }], schema })).rejects.toThrow(/overloaded right now/);
  });

  it('does not retry errors that will not go away', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }));
    await expect(generateJSON(ai, { system: 's', parts: [{ text: 'x' }], schema })).rejects.toThrow(/rejected your API key/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('statusOf', () => {
  it('finds the status inside an error message', () => {
    expect(statusOf(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))).toBe(503);
    expect(statusOf({ status: 429 })).toBe(429);
  });
});
