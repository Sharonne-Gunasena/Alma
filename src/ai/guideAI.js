// AI helpers for study guides. All use the student's own key via generateJSON.
import { z } from 'zod';
import { generateJSON } from './providers.js';
import { bullets, callout, doc, h, p } from '../lib/guides.js';

const DraftSchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string(),
      summary: z.string(),
      points: z.array(z.string()),
      key_terms: z.array(z.object({ term: z.string(), definition: z.string() })),
    }),
  ),
});

// A first draft of a study guide from lecture text, as an editable document.
export async function draftGuide(ai, { title, text }) {
  const result = await generateJSON(ai, {
    system:
      'You write clear, well-organised study guides for university students from their lecture material. Group the material into logical sections (4–10). For each: a short heading, a 2–4 sentence summary in plain language, 3–6 key points, and the key terms with precise definitions. Use only the material provided.',
    parts: [{ text: `Lecture: ${title}\n\n${text.slice(0, 60000)}` }],
    schema: DraftSchema,
    maxTokens: 12000,
  });
  const content = [];
  for (const s of result.sections) {
    content.push(h(2, s.heading), p(s.summary));
    if (s.points.length) content.push(bullets(...s.points));
    if (s.key_terms.length)
      content.push(
        callout(
          'keyterm',
          ...s.key_terms.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t.term, marks: [{ type: 'bold' }] }, { type: 'text', text: ` — ${t.definition}` }] })),
        ),
      );
  }
  return doc(...content);
}

const ExplainSchema = z.object({ explanation: z.string() });

export async function explainSelection(ai, { selection, context }) {
  const result = await generateJSON(ai, {
    system:
      'You are a patient tutor. Explain the highlighted passage for a first-year university student in under 120 words: what it means and why it matters, with a short example if useful. Plain text, no headings.',
    parts: [{ text: `Highlighted: ${selection}\n\nSurrounding notes:\n${context.slice(0, 4000)}` }],
    schema: ExplainSchema,
    maxTokens: 1500,
  });
  return result.explanation;
}

const QuizSchema = z.object({ questions: z.array(z.object({ question: z.string(), answer: z.string() })) });

export async function quizFromGuide(ai, { title, text, count = 6 }) {
  const result = await generateJSON(ai, {
    system: `Write ${count} varied exam-style questions that test understanding of the study guide, each with a concise model answer. Mix recall, explanation and application. Use only the guide's content.`,
    parts: [{ text: `Guide: ${title}\n\n${text.slice(0, 30000)}` }],
    schema: QuizSchema,
    maxTokens: 4000,
  });
  return result.questions;
}
