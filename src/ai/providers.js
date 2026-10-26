// One interface over several AI providers. Each user brings their own key;
// Gemini and Groq both offer free keys, Claude is the paid option.
// Every call returns JSON validated against a zod schema.
import { z } from 'zod';
import { prefs } from '../lib/prefs.js';

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    free: true,
    vision: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHelp: 'Free: sign in with a Google account and click "Create API key". Google may use free-tier data to improve its products.',
    defaultModel: 'gemini-flash-latest',
    // Tried in order when the chosen model is overloaded or rate-limited.
    fallbackModels: ['gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    // Free tiers have small per-minute limits, so keep each request modest.
    chunkChars: 9000,
  },
  groq: {
    label: 'Groq (open models)',
    free: true,
    vision: false,
    keyUrl: 'https://console.groq.com/keys',
    keyHelp: 'Free: sign up and create a key. Very fast, but reads text only (no slide images).',
    defaultModel: 'llama-3.3-70b-versatile',
    preferredModels: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b'],
    fallbackModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    chunkChars: 5000,
  },
  anthropic: {
    label: 'Anthropic Claude',
    free: false,
    vision: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHelp: 'Paid: needs prepaid credits. Best quality.',
    defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    chunkChars: 20000,
  },
};

export class AIError extends Error {}

export function activeAI() {
  const provider = prefs.getProvider();
  const info = PROVIDERS[provider];
  const apiKey = prefs.getKey(provider);
  if (!info || !apiKey) return null;
  return { provider, info, apiKey, model: prefs.getModel(provider) || info.defaultModel };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits between retries when a provider is busy. Exported so tests can shorten them.
export const RETRY = { delaysMs: [4000, 12000, 25000, 40000] };
const MAX_ATTEMPTS = 6;
// Rate limits and "overloaded" errors are temporary, so they're worth retrying.
const TEMPORARY = new Set([429, 500, 502, 503, 504, 529]);

// SDKs report the HTTP status in different places; Gemini sometimes only in the message JSON.
export function statusOf(err) {
  const s = err?.status ?? err?.code ?? err?.error?.code;
  if (typeof s === 'number') return s;
  const m = String(err?.message ?? '').match(/"code"\s*:\s*(\d{3})/);
  return m ? Number(m[1]) : undefined;
}

function friendly(err, info) {
  const status = statusOf(err);
  if (status === 401 || status === 403) return new AIError(`${info.label} rejected your API key. Check it in Settings.`);
  if (status === 429) return new AIError(`${info.label}'s free limit was reached. Wait a minute and try again, or switch provider in Settings.`);
  if (TEMPORARY.has(status))
    return new AIError(`${info.label} is overloaded right now. This is common on free tiers at busy times. Wait a few minutes and try again, or switch provider in Settings.`);
  if (status === 404) return new AIError(`${info.label} couldn't find that model. Pick another one in Settings.`);
  if (status === 400 && /api key/i.test(err.message)) return new AIError(`${info.label} rejected your API key. Check it in Settings.`);
  if (err instanceof TypeError) return new AIError(`Could not reach ${info.label}. Check your internet connection.`);
  return new AIError(`${info.label} error: ${err.message}`);
}

// The chosen model first, then the provider's backups. If Settings has listed
// the models this key can use, backups the key can't use are skipped.
function modelsToTry(ai) {
  const known = prefs.getModels(ai.provider);
  const backups = (ai.info.fallbackModels ?? []).filter((m) => m !== ai.model && (!known.length || known.includes(m)));
  // Gemini model names change often, so also use any other Flash model the key lists.
  if (ai.provider === 'gemini')
    for (const m of known) if (/flash/.test(m) && m !== ai.model && !backups.includes(m) && backups.length < 4) backups.push(m);
  return [ai.model, ...backups];
}

// parts: [{ text } | { image: { mime, data } }]
// onRetry({ message }) is called while waiting on a busy provider, for progress messages.
export async function generateJSON(ai, { system, parts, schema, maxTokens = 8000, onRetry = () => {} }) {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  const call = CALLERS[ai.provider];
  const models = modelsToTry(ai);

  let modelIndex = 0;
  let busyCount = 0;
  let waits = 0;
  let badFormat = null;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = models[modelIndex];
    let raw;
    try {
      const extra = badFormat ? [{ text: `Your previous reply was invalid (${badFormat}). Reply again with valid JSON only.` }] : [];
      raw = await call({ ...ai, model }, { system, parts: [...parts, ...extra], jsonSchema, schema, maxTokens });
    } catch (err) {
      if (err instanceof AIError) throw err;
      const status = statusOf(err);
      lastError = err;
      badFormat = null;
      const hasBackup = modelIndex < models.length - 1;

      // A backup model this key can't use: move straight on to the next one.
      if (modelIndex > 0 && status === 404 && hasBackup) {
        modelIndex++;
        continue;
      }
      if (!TEMPORARY.has(status)) throw friendly(err, ai.info);

      // Busy: retry once on the same model, then switch to a backup.
      busyCount++;
      if (busyCount >= 2 && hasBackup) {
        modelIndex++;
        busyCount = 0;
        onRetry({ message: `${model} is busy. Switching to ${models[modelIndex]}…` });
        continue;
      }
      const wait = RETRY.delaysMs[Math.min(waits++, RETRY.delaysMs.length - 1)];
      onRetry({ message: `${ai.info.label} is busy. Trying again in ${Math.round(wait / 1000)}s…` });
      await sleep(wait);
      continue;
    }
    const result = schema.safeParse(typeof raw === 'string' ? safeJson(raw) : raw);
    if (result.success) return result.data;
    lastError = null;
    badFormat = result.error.issues[0]?.message ?? 'did not match the format';
  }
  if (lastError) throw friendly(lastError, ai.info);
  throw new AIError(`${ai.info.label} kept returning badly formatted answers. Try again or pick another model.`);
}

function safeJson(text) {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return undefined;
  }
}

const CALLERS = {
  async gemini(ai, { system, parts, jsonSchema, maxTokens }) {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: ai.apiKey });
    const response = await client.models.generateContent({
      model: ai.model,
      contents: [
        {
          role: 'user',
          parts: parts.map((p) => (p.image ? { inlineData: { mimeType: p.image.mime, data: p.image.data } } : { text: p.text })),
        },
      ],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        maxOutputTokens: maxTokens,
      },
    });
    return response.text;
  },

  async groq(ai, { system, parts, jsonSchema, maxTokens }) {
    const { default: Groq } = await import('groq-sdk');
    const client = new Groq({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
    const response = await client.chat.completions.create({
      model: ai.model,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\n\nReply with a single JSON object matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
        // Groq's text models can't see images, so only the text parts are sent.
        { role: 'user', content: parts.filter((p) => p.text).map((p) => p.text).join('\n\n') },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  },

  async anthropic(ai, { system, parts, schema, maxTokens }) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
    // The key belongs to the person using the page and only ever goes to Anthropic.
    const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.parse({
      model: ai.model,
      max_tokens: Math.max(maxTokens, 16000),
      system,
      messages: [
        {
          role: 'user',
          content: parts.map((p) =>
            p.image
              ? { type: 'image', source: { type: 'base64', media_type: p.image.mime, data: p.image.data } }
              : { type: 'text', text: p.text },
          ),
        },
      ],
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === 'refusal') throw new AIError('Claude declined this request. Try a different section.');
    return response.parsed_output;
  },
};

// Lists the text models a key can use, for the Settings page.
export async function listModels(provider, apiKey) {
  const info = PROVIDERS[provider];
  try {
    if (provider === 'gemini') {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': apiKey },
      });
      if (!res.ok) throw Object.assign(new Error((await res.json()).error?.message ?? res.statusText), { status: res.status });
      const { models = [] } = await res.json();
      const ids = models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/image|tts|audio|live|embedding/.test(m.name))
        .map((m) => m.name.replace('models/', ''));
      return ['gemini-flash-latest', ...ids.filter((id) => id !== 'gemini-flash-latest')];
    }
    if (provider === 'groq') {
      const { default: Groq } = await import('groq-sdk');
      const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
      const ids = (await client.models.list()).data
        .map((m) => m.id)
        .filter((id) => !/whisper|tts|guard|prompt/.test(id));
      const preferred = info.preferredModels.filter((id) => ids.includes(id));
      return [...preferred, ...ids.filter((id) => !preferred.includes(id)).sort()];
    }
    // Validate the Claude key with a cheap models listing.
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
    if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
    return info.models;
  } catch (err) {
    throw err instanceof AIError ? err : friendly(err, info);
  }
}
