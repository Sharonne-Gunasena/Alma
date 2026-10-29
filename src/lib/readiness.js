// Exam readiness for one module, built only from evidence the student has
// produced: flashcard reviews and practice exams. It deliberately gives no
// "chance of passing", only what has been shown and what to do next.
import { isDue } from './srs.js';
import { MASTERED_DAYS } from './data.js';
import { topicBreakdown } from './exam.js';

const DAY = 24 * 60 * 60 * 1000;
export const STATUS = {
  new: { label: 'Not started', tone: 'slate' },
  learning: { label: 'In progress', tone: 'indigo' },
  risk: { label: 'Needs work', tone: 'rose' },
  secure: { label: 'Secure', tone: 'emerald' },
};

export function topicStatus(cards, { now = new Date(), examTopics = new Map() } = {}) {
  const topics = new Map();
  for (const c of cards) {
    const name = c.topic || 'General';
    const t = topics.get(name) ?? { topic: name, deck_id: c.deck_id, total: 0, studied: 0, mastered: 0, reviews: 0, lapses: 0, overdue: 0 };
    t.total += 1;
    if (c.reviews) {
      t.studied += 1;
      t.reviews += c.reviews;
      t.lapses += c.lapses ?? 0;
      if (isDue(c, now)) t.overdue += 1;
    }
    if ((c.interval_days ?? 0) >= MASTERED_DAYS) t.mastered += 1;
    topics.set(name, t);
  }
  return [...topics.values()]
    .map((t) => {
      const accuracy = t.reviews ? 1 - t.lapses / t.reviews : null;
      const exam = examTopics.get(t.topic) ?? null;
      const reasons = [];
      if (t.reviews >= 3 && accuracy < 0.7) reasons.push(`${Math.round(accuracy * 100)}% recall in reviews`);
      if (t.studied && t.overdue / t.studied >= 0.5) reasons.push(`${t.overdue} card${t.overdue === 1 ? '' : 's'} overdue`);
      if (exam && exam.pct < 0.6) reasons.push(`${Math.round(exam.pct * 100)}% in your last practice exam`);
      let status = 'learning';
      if (!t.studied && !exam) status = 'new';
      else if (reasons.length) status = 'risk';
      else if (t.mastered / t.total >= 0.6 && (accuracy ?? 1) >= 0.8 && (!exam || exam.pct >= 0.8)) status = 'secure';
      return { ...t, accuracy, exam, reasons, status };
    })
    .sort((a, b) => order(a.status) - order(b.status) || a.topic.localeCompare(b.topic));
}

const order = (s) => ({ risk: 0, new: 1, learning: 2, secure: 3 })[s];

export function moduleReadiness({ cards, attempts = [], examDate = null, moduleId = null, now = new Date() }) {
  const finished = attempts.filter((a) => a.finished_at && a.score !== null && a.score !== undefined).sort((a, b) => b.finished_at.localeCompare(a.finished_at));
  const latest = finished[0] ?? null;
  const examTopics = new Map(latest ? topicBreakdown(latest.questions).map((t) => [t.topic, t]) : []);
  const topics = topicStatus(cards, { now, examTopics });

  const studied = cards.filter((c) => c.reviews);
  const reviews = studied.reduce((s, c) => s + c.reviews, 0);
  const lapses = studied.reduce((s, c) => s + (c.lapses ?? 0), 0);
  const due = cards.filter((c) => isDue(c, now)).length;
  const daysToExam = examDate ? Math.round((new Date(`${examDate}T00:00`) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY) : null;

  const counts = { new: 0, learning: 0, risk: 0, secure: 0 };
  topics.forEach((t) => (counts[t.status] += 1));

  return {
    topics,
    counts,
    totalCards: cards.length,
    coverage: cards.length ? studied.length / cards.length : 0,
    retention: reviews ? 1 - lapses / reviews : null,
    due,
    daysToExam,
    attempts: finished,
    latest,
    actions: nextActions({ topics, due, latest, daysToExam, moduleId, cardCount: cards.length, now }),
  };
}

// At most three concrete next steps, most useful first.
export function nextActions({ topics, due, latest, daysToExam, moduleId, cardCount, now = new Date() }) {
  const actions = [];
  const examSoon = daysToExam !== null && daysToExam >= 0 && daysToExam <= 14;
  const staleExam = !latest || now - new Date(latest.finished_at) > 7 * DAY;
  const examAction = cardCount >= 5 && staleExam
    ? { kind: 'exam', label: latest ? 'Take another practice exam' : 'Take a practice exam', detail: latest ? 'Your last one was over a week ago.' : 'Find out what you know before the real thing.', href: `#/exam?module=${moduleId}` }
    : null;

  if (examSoon && examAction) actions.push(examAction);
  const risk = topics.find((t) => t.status === 'risk');
  if (risk) actions.push({ kind: 'topic', label: `Practise ${risk.topic}`, detail: risk.reasons.join(' · '), href: topicHref(risk) });
  if (due) actions.push({ kind: 'due', label: `Review ${due} due card${due === 1 ? '' : 's'}`, detail: 'Keeps what you know from fading.', href: `#/study?mode=due&module=${moduleId}` });
  const fresh = topics.find((t) => t.status === 'new');
  if (fresh) actions.push({ kind: 'topic', label: `Start ${fresh.topic}`, detail: `${fresh.total} card${fresh.total === 1 ? '' : 's'} not studied yet.`, href: topicHref(fresh) });
  if (!examSoon && examAction) actions.push(examAction);
  return actions.slice(0, 3);
}

// Cards without a topic are grouped as "General", which Study can't filter on.
const topicHref = (t) =>
  !t.deck_id ? '#/decks' : t.topic === 'General' ? `#/decks/${t.deck_id}/study?mode=all` : `#/decks/${t.deck_id}/study?mode=topic&topic=${encodeURIComponent(t.topic)}`;
