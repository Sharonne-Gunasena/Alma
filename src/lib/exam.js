// Practice exams built from a student's own flashcards.
//
// Questions are either written (typed answer, marked by AI or by the student)
// or multiple choice. Multiple-choice options come from the answers of the
// student's other cards on the same topic, so they need no AI, cost nothing
// and are always plausible. Everything here is pure so it can be tested.

const WRITTEN_ONLY = new Set(['code', 'procedure', 'compare']);
const MAX_CHOICE_ANSWER = 90;
const MAX_DISTRACTOR = 120;
const DAY = 24 * 60 * 60 * 1000;

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// How much a card deserves a place in the exam: cards you keep failing,
// haven't seen yet, or are overdue come up more often.
export function cardWeight(card, now = new Date()) {
  const reviews = card.reviews ?? 0;
  const lapseRate = reviews ? (card.lapses ?? 0) / reviews : 0;
  const unseen = reviews === 0 ? 1 : 0;
  const overdue = reviews > 0 && new Date(card.due) <= now ? 1 : 0;
  return 1 + 3 * lapseRate + unseen + overdue;
}

// Weighted sampling without replacement (Efraimidis–Spirakis): each card gets
// the key u^(1/w) and the highest keys win, so heavier cards are likelier.
export function pickCards(cards, count, { focusWeak = true, rng = Math.random, now = new Date() } = {}) {
  return cards
    .map((c) => ({ c, key: rng() ** (1 / (focusWeak ? cardWeight(c, now) : 1)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.c);
}

// Up to three wrong options for a card, preferring answers from the same
// topic, then the same deck, then anywhere.
export function distractorsFor(card, pool, rng = Math.random) {
  const answer = norm(card.back);
  const seen = new Set([answer]);
  const usable = pool.filter((o) => o.id !== card.id && o.back && o.back.length <= MAX_DISTRACTOR);
  const tiers = [
    usable.filter((o) => card.topic && o.topic === card.topic),
    usable.filter((o) => o.deck_id === card.deck_id),
    usable,
  ];
  const out = [];
  for (const tier of tiers) {
    for (const o of shuffle(tier, rng)) {
      const key = norm(o.back);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o.back.trim());
      if (out.length === 3) return out;
    }
  }
  return out;
}

export function canBeChoice(card) {
  return !WRITTEN_ONLY.has(card.type) && !!card.back && card.back.trim().length <= MAX_CHOICE_ANSWER;
}

// format: "mixed" | "choice" | "written". Choice questions fall back to written
// when there aren't three distinct wrong answers to offer.
export function buildQuestions(picked, pool, { format = 'mixed', rng = Math.random } = {}) {
  return picked.map((card, i) => {
    const base = {
      id: `q${i + 1}`,
      card_id: card.id,
      deck_id: card.deck_id ?? null,
      material_id: card.material_id ?? null,
      source_page: card.source_page ?? null,
      topic: card.topic || 'General',
      prompt: card.front,
      answer: card.back,
      response: null,
      confidence: null,
      flagged: false,
      mark: null,
      feedback: null,
    };
    const wantChoice = format === 'choice' || (format === 'mixed' && rng() < 0.6);
    if (format !== 'written' && wantChoice && canBeChoice(card)) {
      const wrong = distractorsFor(card, pool, rng);
      if (wrong.length === 3) {
        const choices = shuffle([card.back.trim(), ...wrong], rng);
        return { ...base, kind: 'choice', choices, correct_index: choices.indexOf(card.back.trim()) };
      }
    }
    return { ...base, kind: 'written' };
  });
}

export function buildExam(cards, { count = 15, format = 'mixed', focusWeak = true, rng = Math.random, now = new Date() } = {}) {
  const usable = cards.filter((c) => c.front?.trim() && c.back?.trim());
  return buildQuestions(pickCards(usable, count, { focusWeak, rng, now }), usable, { format, rng });
}

// ---------- Marking ----------

export const isAnswered = (q) => (q.kind === 'choice' ? q.response !== null && q.response !== undefined : !!String(q.response ?? '').trim());

// Multiple choice is marked instantly; written answers keep their mark (from
// AI or the student) and a blank written answer scores zero.
export function markQuestion(q) {
  if (q.kind === 'choice') return { ...q, mark: q.response === q.correct_index ? 1 : 0 };
  if (!isAnswered(q)) return { ...q, mark: 0, feedback: q.feedback ?? 'No answer given.' };
  return q;
}

export const VERDICT_MARK = { correct: 1, 'partly correct': 0.5, incorrect: 0 };

export function scoreOf(questions) {
  if (!questions.length) return 0;
  return questions.reduce((s, q) => s + (q.mark ?? 0), 0) / questions.length;
}

export const needsMarking = (questions) => questions.filter((q) => q.kind === 'written' && q.mark === null);

// Topic by topic, worst first.
export function topicBreakdown(questions) {
  const topics = new Map();
  for (const q of questions) {
    const t = topics.get(q.topic) ?? { topic: q.topic, total: 0, earned: 0, deck_id: q.deck_id };
    t.total += 1;
    t.earned += q.mark ?? 0;
    topics.set(q.topic, t);
  }
  return [...topics.values()].map((t) => ({ ...t, pct: t.earned / t.total })).sort((a, b) => a.pct - b.pct || b.total - a.total);
}

// Confidence against results: the dangerous case is being sure and wrong.
export function calibration(questions) {
  const rated = questions.filter((q) => q.confidence);
  const sure = rated.filter((q) => q.confidence === 'sure');
  const unsure = rated.filter((q) => q.confidence === 'unsure');
  return {
    rated: rated.length,
    sure: sure.length,
    sureRight: sure.filter((q) => (q.mark ?? 0) >= 1).length,
    sureWrong: sure.filter((q) => (q.mark ?? 0) < 1),
    unsureRight: unsure.filter((q) => (q.mark ?? 0) >= 1).length,
  };
}

export const missedQuestions = (questions) => questions.filter((q) => (q.mark ?? 0) < 1);

// A deadline the planner can schedule: revise what the exam showed you don't
// know yet. Due in three days, or the day before the real exam if sooner.
export function revisionTask({ questions, moduleId, moduleName, examDate, now = new Date() }) {
  const missed = missedQuestions(questions);
  if (!missed.length) return null;
  const topics = topicBreakdown(missed).map((t) => t.topic);
  const hours = Math.min(4, Math.max(0.5, Math.ceil((missed.length * 6) / 30) / 2));
  let due = new Date(now.getTime() + 3 * DAY);
  due.setHours(18, 0, 0, 0);
  if (examDate) {
    const dayBefore = new Date(`${examDate}T18:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    if (dayBefore > now && dayBefore < due) due = dayBefore;
  }
  const named = topics.slice(0, 3).join(', ') + (topics.length > 3 ? ` +${topics.length - 3} more` : '');
  return {
    title: `Revise ${moduleName ? `${moduleName}: ` : ''}${named}`,
    module_id: moduleId ?? null,
    due_at: due.toISOString(),
    effort_hours: hours,
    priority: 3,
    notes: `From a practice exam. Missed ${missed.length} question${missed.length === 1 ? '' : 's'}: ${topics.join(', ')}.`,
  };
}

// ---------- Helpers ----------

export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Small deterministic generator for tests and reproducible exams.
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e9) / 1e9;
  };
}
