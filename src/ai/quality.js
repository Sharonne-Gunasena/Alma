// Pure helpers for the flashcard engine: splitting lectures into sections and
// checking generated cards in code (no AI needed, so they cost nothing).

// Groups consecutive pages into sections of roughly maxChars, keeping page
// numbers so every card can point back to its slide.
export function chunkPages(pages, maxChars) {
  const chunks = [];
  let current = { pages: [], text: '' };
  const push = () => {
    if (current.pages.length) chunks.push(current);
    current = { pages: [], text: '' };
  };
  for (const { page, text } of pages) {
    const block = `[Page ${page}]\n${text.trim()}\n\n`;
    if (block.length > maxChars) {
      // One very long page (e.g. a Word document section) becomes several chunks.
      push();
      for (let i = 0; i < block.length; i += maxChars) chunks.push({ pages: [page], text: block.slice(i, i + maxChars) });
      continue;
    }
    if (current.text.length + block.length > maxChars) push();
    current.pages.push(page);
    current.text += block;
  }
  push();
  return chunks;
}

const STOP = new Set(
  'a an the and or of to in on for is are was were be been it its this that these those with as by at from which what how why when where who whom does do did can could would should will may might not no yes into than then there their they them we you your our i he she his her if so such also any all each per via'.split(
    ' ',
  ),
);

export function contentWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function similarity(a, b) {
  const A = contentWords(a);
  const B = contentWords(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

// Share of the answer's words that appear somewhere in the source material.
export function grounding(answer, source) {
  const words = contentWords(answer);
  if (!words.size) return 1;
  const src = contentWords(source);
  let found = 0;
  for (const w of words) if (src.has(w)) found++;
  return found / words.size;
}

// Cards that are about applying ideas (worked problems, code) legitimately use
// words that aren't in the notes, so they aren't held to the grounding check.
const FREE_FORM = new Set(['application', 'code']);

export function checkCards(cards, source) {
  const out = [];
  for (const raw of cards) {
    const card = { ...raw, front: tidy(raw.front), back: tidy(raw.back), flags: [] };
    if (card.front.length < 4 || !card.back || card.front.toLowerCase() === card.back.toLowerCase()) continue;
    if (card.back.length > 450) card.flags.push('Long answer: consider splitting this card');
    if (card.front.length > 300) card.flags.push('Long question');
    if (!FREE_FORM.has(card.type) && grounding(card.back, source) < 0.35) card.flags.push('Answer not clearly in your notes: check it');
    out.push(card);
  }
  return out;
}

export function dedupe(cards, threshold = 0.7) {
  const kept = [];
  for (const c of cards) {
    if (!kept.some((k) => similarity(k.front, c.front) >= threshold && similarity(k.back, c.back) >= threshold * 0.6)) kept.push(c);
  }
  return kept;
}

function tidy(s) {
  return String(s ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Rough card budget for a section: dense notes get more cards.
export function cardBudget(text) {
  const n = Math.round(text.length / 450);
  return { min: Math.max(3, Math.min(n - 2, 12)), max: Math.max(5, Math.min(n + 3, 18)) };
}
