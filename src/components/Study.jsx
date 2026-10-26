import { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { describeInterval, isDue, schedule } from '../lib/srs.js';
import { materialPages } from '../lib/data.js';
import { activeAI } from '../ai/providers.js';
import { CARD_TYPES } from '../ai/cardTypes.js';

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

const savedAnswerMode = () => {
  try {
    return localStorage.getItem('cl_answer_mode') || 'flip';
  } catch {
    return 'flip';
  }
};

// mode: "due" reviews and reschedules due cards; "all" and "topic" are
// practice runs that don't change the schedule.
export default function Study({ deckId, mode = 'due', topic, moduleId }) {
  const { db } = useApp();
  const ai = activeAI();
  const practice = mode !== 'due';
  const [queue, setQueue] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState(null);
  const [answerMode, setAnswerMode] = useState(savedAnswerMode);
  const [answer, setAnswer] = useState('');
  const [grade, setGrade] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      let cards;
      if (deckId) cards = await db.list('cards', { deck_id: deckId });
      else {
        cards = await db.list('cards');
        if (moduleId) {
          const decks = new Set((await db.list('decks', { module_id: moduleId })).map((d) => d.id));
          cards = cards.filter((c) => decks.has(c.deck_id));
        }
      }
      if (mode === 'due') cards = cards.filter((c) => isDue(c));
      if (mode === 'topic') cards = cards.filter((c) => c.topic === topic);
      setQueue(shuffle(cards));
    })().catch((e) => setError(e.message));
  }, [deckId, mode, topic, moduleId]);

  const card = queue?.[0];
  const backHref = deckId ? `#/decks/${deckId}` : '#/decks';

  function reset() {
    setFlipped(false);
    setAnswer('');
    setGrade(null);
    setExplanation(null);
    setSource(null);
  }

  async function rate(rating) {
    if (!card) return;
    const rest = queue.slice(1);
    if (practice) {
      setQueue(rating === 'again' ? [...rest, card] : rest);
    } else {
      const update = schedule(card, rating);
      try {
        await db.update('cards', card.id, update);
      } catch (e) {
        setError(e.message);
        return;
      }
      // Cards marked "Again" come back later in this session.
      setQueue(rating === 'again' ? [...rest, { ...card, ...update }] : rest);
    }
    if (rating !== 'again') setDone((d) => d + 1);
    reset();
  }

  async function check() {
    setBusy(true);
    try {
      const { gradeAnswer } = await import('../ai/engine.js');
      setGrade(await gradeAnswer(ai, card, answer));
    } catch (e) {
      setGrade({ verdict: 'error', feedback: e.message });
    } finally {
      setBusy(false);
      setFlipped(true);
    }
  }

  async function explain() {
    setBusy(true);
    try {
      const { explainCard } = await import('../ai/engine.js');
      const notes = await loadSource();
      setExplanation(await explainCard(ai, card, notes?.text));
    } catch (e) {
      setExplanation(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSource() {
    if (!card.material_id) return null;
    if (source) return source;
    const material = await db.get('materials', card.material_id);
    const page = materialPages(material).find((p) => p.page === card.source_page);
    const found = { name: material.name, page: card.source_page, text: page?.text ?? material.text_content?.slice(0, 2000) ?? '' };
    setSource(found);
    return found;
  }

  function setMode(m) {
    setAnswerMode(m);
    try {
      localStorage.setItem('cl_answer_mode', m);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !flipped) check();
        return;
      }
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
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

  const typing = answerMode === 'type' && ai;

  return (
    <div className="stack study">
      <div className="row between">
        <a className="back" href={backHref}>
          ← Back
        </a>
        <span className="muted small">
          {practice ? (mode === 'topic' ? `Practising: ${topic} · ` : 'Practice (schedule unchanged) · ') : ''}
          {done} done · {queue.length} left
        </span>
      </div>

      {!card ? (
        <div className="card empty">
          <h2>🎉 All done!</h2>
          <p className="muted">{practice ? 'You went through every card.' : 'No more cards due right now. Come back tomorrow.'}</p>
          <a className="button primary" href={backHref}>
            Back
          </a>
        </div>
      ) : (
        <>
          <div className="chips">
            <button className={!typing ? 'active' : ''} onClick={() => setMode('flip')}>
              Flip cards
            </button>
            <button className={typing ? 'active' : ''} onClick={() => (ai ? setMode('type') : alert('Typed answers are graded by AI. Add a free key in Settings first.'))}>
              Type answers (AI-graded)
            </button>
          </div>

          <div className={`flashcard ${flipped ? 'flipped' : ''}`}>
            <div className="row wrap small muted card-meta">
              {card.type && card.type !== 'basic' && <span className="type">{CARD_TYPES[card.type] ?? card.type}</span>}
              {card.topic && <span>{card.topic}</span>}
            </div>
            <div className="face">{card.front}</div>

            {!flipped && typing && (
              <div className="stack tight">
                <textarea autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer… (Ctrl+Enter to check)" />
                <div className="row">
                  <button className="primary" disabled={busy} onClick={check}>
                    {busy ? 'Checking…' : 'Check answer'}
                  </button>
                  <button onClick={() => setFlipped(true)}>Show answer</button>
                </div>
              </div>
            )}
            {!flipped && !typing && (
              <button className="reveal" onClick={() => setFlipped(true)}>
                Show answer <small>(Space)</small>
              </button>
            )}

            {flipped && (
              <>
                <hr />
                <div className="face answer">{card.back}</div>
                {grade && (
                  <div className={`grade ${grade.verdict.replace(' ', '-')}`}>
                    <b>{grade.verdict === 'error' ? 'Could not grade' : grade.verdict[0].toUpperCase() + grade.verdict.slice(1)}</b> {grade.feedback}
                  </div>
                )}
                {explanation && <div className="explain">{explanation}</div>}
                {source && (
                  <details className="source" open>
                    <summary>
                      From {source.name}
                      {source.page ? `, page ${source.page}` : ''}
                    </summary>
                    <p className="small">{source.text}</p>
                  </details>
                )}
                <div className="row wrap small">
                  {ai && !explanation && (
                    <button className="link" disabled={busy} onClick={explain}>
                      {busy ? 'Thinking…' : '💡 Explain this'}
                    </button>
                  )}
                  {card.material_id && !source && (
                    <button className="link" onClick={loadSource}>
                      📄 Show in my notes{card.source_page ? ` (p. ${card.source_page})` : ''}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {flipped && (
            <div className="ratings">
              {RATINGS.map((r) => (
                <button key={r.id} className={`rate ${r.id} ${grade?.rating === r.id ? 'suggested' : ''}`} onClick={() => rate(r.id)}>
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
