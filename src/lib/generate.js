import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { cleanCards } from './rules.js';

const CardsSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});

// Roughly 200k tokens. Beyond this we ask the user to split the material
// rather than silently cutting it off.
export const MAX_AI_CHARS = 800_000;

const SYSTEM = `You write flashcards that help university students learn and remember material.
Each card tests one idea. The front is a clear question or prompt that makes sense on its own, without the source in front of the student. The back is a short, accurate answer taken from the material.
Cover the most important concepts, definitions, processes and facts first. Do not invent information that is not in the material.`;

export async function generateWithAI({ text, apiKey, model, count, focus }) {
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings first.');
  if (text.length > MAX_AI_CHARS) {
    throw new Error(
      `This material is too long to send in one go (${text.length.toLocaleString()} characters). Split it into smaller sections and generate cards for each.`,
    );
  }

  // The key belongs to the person using the page and never leaves their browser
  // except to go to Anthropic, which is why browser access is acceptable here.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const instructions = [
    count === 'auto'
      ? 'Write as many cards as the material needs to cover its key points (usually 10–40).'
      : `Write exactly ${count} cards.`,
    focus ? `Focus: ${focus}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `<material>\n${text}\n</material>\n\n${instructions}`,
        },
      ],
      output_config: { effort: 'medium', format: zodOutputFormat(CardsSchema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Your API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('Your API key does not have access to this model.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limited by Anthropic. Wait a minute and try again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your internet connection.');
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic API error: ${err.message}`);
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to make cards from this material. Try a different section or model.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The response was cut off. Ask for fewer cards or use a shorter section.');
  }
  if (!response.parsed_output) throw new Error('The model returned cards in an unexpected format. Try again.');

  return cleanCards(response.parsed_output.cards);
}
