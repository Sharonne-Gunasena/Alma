// SM-2 style spaced repetition, the same family of algorithm Anki uses.
const QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };
const DAY = 24 * 60 * 60 * 1000;

export function schedule(card, rating, now = new Date()) {
  const q = QUALITY[rating];
  let ease = card.ease ?? 2.5;
  let reps = card.reps ?? 0;
  let interval = card.interval_days ?? 0;

  if (q < 3) {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    // Failed cards come back in ten minutes.
    return { ease, reps, interval_days: 0, due: new Date(now.getTime() + 10 * 60 * 1000).toISOString() };
  }

  reps += 1;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = 6;
  else interval = Math.round(interval * ease);

  if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  if (rating === 'easy') interval = reps === 1 ? 4 : Math.round(interval * 1.3);

  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ease, reps, interval_days: interval, due: new Date(now.getTime() + interval * DAY).toISOString() };
}

export function isDue(card, now = new Date()) {
  return new Date(card.due) <= now;
}

export function describeInterval(card, rating) {
  const { interval_days } = schedule(card, rating);
  if (interval_days === 0) return '10 min';
  if (interval_days === 1) return '1 day';
  if (interval_days < 30) return `${interval_days} days`;
  if (interval_days < 365) return `${Math.round(interval_days / 30)} mo`;
  return `${(interval_days / 365).toFixed(1)} yr`;
}
