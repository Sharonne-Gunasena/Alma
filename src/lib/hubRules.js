// Pure rules for module hubs, mirrored by migration 007 where the database enforces them.

// Items whose unhelpful votes outnumber helpful ones by this much are hidden.
export const HIDE_THRESHOLD = 3;
export const isHidden = ({ helpful = 0, unhelpful = 0 }) => unhelpful - helpful >= HIDE_THRESHOLD;

// Points: 10 per shared item, 5 per helpful vote received, 2 per person who copied it.
export const points = ({ items = 0, helpful = 0, copies = 0 }) => items * 10 + helpful * 5 + copies * 2;

export const BADGES = [
  { min: 150, label: 'Top contributor', emoji: '🏆' },
  { min: 50, label: 'Helper', emoji: '🌟' },
  { min: 10, label: 'Contributor', emoji: '🌱' },
];

export const badgeFor = (pts) => BADGES.find((b) => pts >= b.min) ?? null;

export function nextBadge(pts) {
  const next = [...BADGES].reverse().find((b) => pts < b.min);
  return next ? { ...next, needed: next.min - pts } : null;
}

// Best first: net helpful votes, then copies, then most recently updated.
export function rankItems(items) {
  return [...items].sort(
    (a, b) => b.helpful - b.unhelpful - (a.helpful - a.unhelpful) || b.copies - a.copies || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
  );
}

// What gets shared from a deck: the content only, never the author's study progress.
export const deckPayload = (cards) => ({
  cards: cards.filter((c) => c.front?.trim() && c.back?.trim()).map(({ front, back, type, topic }) => ({ front, back, type: type ?? 'basic', topic: topic ?? null })),
});
