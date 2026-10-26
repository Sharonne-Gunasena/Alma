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

function statusOf(err) {
  return err?.status ?? err?.code ?? err?.error?.code;
}

function friendly(err, info) {
  const status = statusOf(err);
  if (status === 401 || status === 403) return new AIError(`${info.label} rejected your API key. Check it in Settings.`);
  if (status === 429) return new AIError(`${info.label}'s free limit was reached. Wait a minute and try again, or switch provider in Settings.`);
  if (status === 400 && /api key/i.test(err.message)) return new AIError(`${info.label} rejected your API key. Check it in Settings.`);
  if (err instanceof TypeError) return new AIError(`Could not reach ${info.label}. Check your internet connection.`);
  return new AIError(`${info.label} error: ${err.message}`);
}

// parts: [{ text } | { image: { mime, data } }]
export async function generateJSON(ai, { system, parts, schema, maxTokens = 8000 }) {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  const call = CALLERS[ai.provider];

  let lastProblem = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let raw;
    try {
      const extra = lastProblem ? [{ text: `Your previous reply was invalid (${lastProblem}). Reply again with valid JSON only.` }] : [];
      raw = await call(ai, { system, parts: [...parts, ...extra], jsonSchema, schema, maxTokens });
    } catch (err) {
      // Free tiers rate-limit per minute; back off and retry a few times.
      if (statusOf(err) === 429 && attempt < 3) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      throw err instanceof AIError ? err : friendly(err, ai.info);
    }
    const result = schema.safeParse(typeof raw === 'string' ? safeJson(raw) : raw);
    if (result.success) return result.data;
    lastProblem = result.error.issues[0]?.message ?? 'did not match the format';
  }
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
