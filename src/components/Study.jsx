import { useEffect, useState } from 'react';
import { describeInterval, isDue, schedule } from '../lib/srs.js';

const RATINGS = [
  { id: 'again', label: 'Again', key: '1' },
  { id: 'hard', label: 'Hard', key: '2' },
  { id: 'good', label: 'Good', key: '3' },
  { id: 'easy', label: 'Easy', key: '4' },
];

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "practice" mode runs through every card without changing its schedule.
export default function Study({ store, deckId, practice, go }) {
  const [queue, setQueue] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    store
      .listCards(deckId)
      .then((cards) => setQueue(shuffle(practice ? cards : cards.filter((c) => isDue(c)))))
      .catch((e) => setError(e.message));
  }, [deckId, practice]);

  const card = queue?.[0];

  async function rate(rating) {
    if (!card) return;
    const rest = queue.slice(1);
    if (practice) {
      setQueue(rating === 'again' ? [...rest, card] : rest);
    } else {
      const update = schedule(card, rating);
      try {
        await store.updateCard(card.id, update);
      } catch (e) {
        setError(e.message);
        return;
      }
      // Cards marked "Again" come back later in this session.
      setQueue(rating === 'again' ? [...rest, { ...card, ...update }] : rest);
    }
    if (rating !== 'again') setDone((d) => d + 1);
    setFlipped(false);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <p className="error">{error}</p>;
  if (!queue) return <p className="muted">Loading…</p>;

  return (
    <div className="stack study">
      <div className="row between">
        <button className="link back" onClick={() => go('deck', { deckId })}>
          ← Back to deck
        </button>
        <span className="muted">
          {practice ? 'Practice (schedule unchanged) · ' : ''}
          {done} done · {queue.length} left
        </span>
      </div>

      {!card ? (
        <div className="card empty">
          <h2>🎉 All done!</h2>
          <p className="muted">{practice ? 'You went through every card.' : 'No more cards due in this deck right now.'}</p>
          <button className="primary" onClick={() => go('deck', { deckId })}>
            Back to deck
          </button>
        </div>
      ) : (
        <>
          <button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
            <div className="face">{card.front}</div>
            {flipped && (
              <>
                <hr />
                <div className="face answer">{card.back}</div>
              </>
            )}
            {!flipped && <span className="hint">Click or press Space to show the answer</span>}
          </button>

          {flipped && (
            <div className="ratings">
              {RATINGS.map((r) => (
                <button key={r.id} className={`rate ${r.id}`} onClick={() => rate(r.id)}>
                  <strong>{r.label}</strong>
                  <span className="small">{practice ? `key ${r.key}` : describeInterval(card, r.id)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
