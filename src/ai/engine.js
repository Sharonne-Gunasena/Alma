// The flashcard engine. Instead of one big prompt, it works section by section:
//   1. split the lecture into sections (keeping page numbers),
//   2. for each section, write a summary, key terms and varied cards
//      (reading slide images too when the model supports it),
//   3. optionally run a review pass where the model critiques and fixes its cards,
//   4. check every card in code: drop duplicates, flag vague or ungrounded answers.
// The section summaries become the study guide.
import { z } from 'zod';
import { generateJSON } from './providers.js';
import { cardBudget, checkCards, chunkPages, dedupe } from './quality.js';
import { renderPageImage } from '../lib/extract.js';
import { CARD_TYPES } from './cardTypes.js';

const Card = z.object({
  type: z.enum(Object.keys(CARD_TYPES)),
  front: z.string(),
  back: z.string(),
  page: z.number().int(),
});

const SectionSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  cards: z.array(Card),
});

const ReviewSchema = z.object({ cards: z.array(Card) });

const SYSTEM = `You are an expert university tutor who writes flashcards for active recall and spaced repetition.

Principles:
- One idea per card. Split lists and multi-part answers into separate cards.
- The question must make sense on its own, weeks later, without the slides. Name the subject ("In C, what does..."), never "according to the slide" or "as discussed".
- Answers are short and precise: usually one sentence or a formula; never more than about 3 sentences.
- Prefer understanding over trivia: test why and how things work, not slide titles, lecturer names or admin details.
- Use only information in the material. Do not invent facts.
- Skip slides that are only titles, outlines, admin or references.

Card types (mix them to suit the material):
- definition: "What is an eigenvalue of a matrix A?" -> "A scalar λ such that Av = λv for some non-zero vector v."
- concept: "Why does binary search need a sorted array?" -> "It discards half the range each step based on comparing with the middle element, which only works if order is known."
- cloze: front contains ____ for one key term. "A function that calls itself is called ____." -> "recursive"
- compare: "How does a stack differ from a queue?" -> "A stack is last-in-first-out; a queue is first-in-first-out."
- procedure: "What are the steps of row reducing a matrix to echelon form?" -> short ordered steps.
- application: a small worked problem with its answer, e.g. "det of [[2,1],[4,3]]?" -> "2·3 − 1·4 = 2".
- code: "What does this print? <short code>" or "What is wrong with this code?" Include the code in the front.

Every card's page is the page number (from the [Page n] markers) where the idea appears.`;

const REVIEW_SYSTEM = `You review flashcards written from lecture material. For each card: fix it if it is vague, ambiguous, depends on context, tests trivia, has a wrong or unsupported answer, or covers more than one idea (split those). Drop cards about admin, titles or trivia. Keep good cards unchanged. If an important idea in the material has no card, add one. Use only the material provided.`;

export async function buildStudySet({ ai, title, pages, pdf, focus, thorough, useImages, onProgress = () => {} }) {
  const usable = pages.filter((p) => p.text.trim().length > 20 || (useImages && pdf));
  if (!usable.length) throw new Error('No readable text found. If this is a scanned PDF, use Gemini or Claude with "Read slide images" turned on.');

  const sections = chunkPages(usable, ai.info.chunkChars);
  const withImages = useImages && ai.info.vision && pdf;
  const steps = sections.length * (thorough ? 2 : 1);
  let step = 0;
  const guide = [];
  let cards = [];

  for (const section of sections) {
    onProgress({ step: ++step, steps, label: `Reading pages ${range(section.pages)}…` });
    const parts = [{ text: `Lecture: ${title}\n\n${section.text}` }];
    if (withImages) {
      for (const page of section.pages.slice(0, 10)) {
        parts.push({ text: `[Image of page ${page}]` }, { image: await renderPageImage(pdf, page) });
      }
    }
    const { min, max } = cardBudget(section.text);
    parts.push({
      text: [
        `Write ${min}–${max} flashcards for this section, mixing card types to suit the content.`,
        guide.length ? `Topics already covered (don't repeat them): ${guide.map((g) => g.topic).join('; ')}.` : '',
        focus ? `The student asked to focus on: ${focus}` : '',
        'Also give the section a short topic name, a 2–4 sentence summary for a study guide, and its key terms.',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const result = await generateJSON(ai, { system: SYSTEM, parts, schema: SectionSchema });
    let sectionCards = result.cards;

    if (thorough && sectionCards.length) {
      onProgress({ step: ++step, steps, label: `Checking cards for pages ${range(section.pages)}…` });
      const review = await generateJSON(ai, {
        system: REVIEW_SYSTEM,
        parts: [
          { text: `Material:\n${section.text}` },
          { text: `Cards to review:\n${JSON.stringify(sectionCards, null, 1)}` },
          { text: 'Return the improved list of cards.' },
        ],
        schema: ReviewSchema,
      });
      if (review.cards.length) sectionCards = review.cards;
    }

    guide.push({ topic: result.topic, summary: result.summary, key_terms: result.key_terms, pages: section.pages });
    cards.push(...checkCards(sectionCards, section.text).map((c) => ({ ...c, topic: result.topic })));
  }

  cards = dedupe(cards);
  return { cards, guide: { title, sections: guide, generated_at: new Date().toISOString(), model: ai.model } };
}

function range(pages) {
  return pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : `${pages[0]}`;
}

const GradeSchema = z.object({
  verdict: z.enum(['correct', 'partly correct', 'incorrect']),
  feedback: z.string(),
  rating: z.enum(['again', 'hard', 'good', 'easy']),
});

// Grades a typed answer against the card, so students practise recall
// instead of just flipping and self-rating.
export async function gradeAnswer(ai, card, answer) {
  return generateJSON(ai, {
    system:
      'You grade a student\'s answer to a flashcard. Judge meaning, not wording: accept paraphrases and equivalent notation. In one or two sentences of feedback, say what was right and what was missing or wrong. Suggest a spaced-repetition rating: again (wrong or blank), hard (partly right), good (right), easy (right and complete).',
    parts: [{ text: `Question: ${card.front}\nExpected answer: ${card.back}\nStudent's answer: ${answer || '(blank)'}` }],
    schema: GradeSchema,
    maxTokens: 1000,
  });
}

const ExplainSchema = z.object({ explanation: z.string() });

export async function explainCard(ai, card, sourceText) {
  return (
    await generateJSON(ai, {
      system: 'You are a patient tutor. Explain the idea behind a flashcard in plain language for a first-year university student, in under 150 words, with a short example if it helps. Base it on the provided notes when available.',
      parts: [{ text: `Card: ${card.front}\nAnswer: ${card.back}${sourceText ? `\n\nNotes from the lecture:\n${sourceText.slice(0, 4000)}` : ''}` }],
      schema: ExplainSchema,
      maxTokens: 1500,
    })
  ).explanation;
}
