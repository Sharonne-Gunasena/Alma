import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Eye, FileText, Keyboard, Lightbulb, PenLine, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { useApp } from '../context.js';
import { describeInterval, isDue, schedule } from '../lib/srs.js';
import { materialPages } from '../lib/data.js';
import { activeAI } from '../ai/providers.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { Button } from '../ui/Button.jsx';
import { Card, IconTile, Kbd, ProgressBar, Segmented, Skeleton } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';
import { Tilt } from '../ui/motion.jsx';

const RATINGS = [
  { id: 'again', label: 'Again', key: '1', tone: 'text-rose-600 dark:text-rose-400', ring: 'hover:border-rose-300 dark:hover:border-rose-500/50', dot: 'bg-rose-500' },
  { id: 'hard', label: 'Hard', key: '2', tone: 'text-amber-600 dark:text-amber-400', ring: 'hover:border-amber-300 dark:hover:border-amber-500/50', dot: 'bg-amber-500' },
  { id: 'good', label: 'Good', key: '3', tone: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:border-emerald-300 dark:hover:border-emerald-500/50', dot: 'bg-emerald-500' },
  { id: 'easy', label: 'Easy', key: '4', tone: 'text-sky-600 dark:text-sky-400', ring: 'hover:border-sky-300 dark:hover:border-sky-500/50', dot: 'bg-sky-500' },
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
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [error, setError] = useState(null);
  const [answerMode, setAnswerMode] = useState(savedAnswerMode);
  const [answer, setAnswer] = useState('');
  const [grade, setGrade] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0); // changes the card key so repeats re-animate

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
      setTotal(cards.length);
    })().catch((e) => setError(e.message));
  }, [deckId, mode, topic, moduleId]);

  const card = queue?.[0];
  const backHref = deckId ? `#/decks/${deckId}` : '#/decks';
  const finished = total - (queue?.length ?? 0);
  const typing = answerMode === 'type' && !!ai;

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
    setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
    setRound((r) => r + 1);
    reset();
  }

  async function check() {
    if (busy) return;
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

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!queue)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <a href={backHref} className="flex items-center gap-1 text-sm font-medium text-muted no-underline hover:text-fg">
            <ChevronLeft className="size-4" /> Back
          </a>
          <span className="text-[13px] text-muted">
            {practice ? (mode === 'topic' ? `Practising ${topic}` : 'Practice · schedule unchanged') : 'Review'}
          </span>
          <span className="font-mono text-[13px] text-muted tabular-nums">
            {Math.min(finished + (card ? 1 : 0), total)}/{total}
          </span>
        </div>
        <ProgressBar value={total ? finished / total : 1} />
      </div>

      {!card ? (
        <SessionComplete tally={tally} practice={practice} backHref={backHref} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Segmented
              value={typing ? 'type' : 'flip'}
              onChange={(v) => (v === 'type' && !ai ? alert('Typed answers are graded by AI. Add a free key in Settings first.') : setMode(v))}
              options={[
                { value: 'flip', label: 'Flip', icon: RotateCcw },
                { value: 'type', label: 'Type answer', icon: PenLine },
              ]}
            />
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              <Keyboard className="size-3.5" /> <Kbd>Space</Kbd> flip · <Kbd>1</Kbd>–<Kbd>4</Kbd> rate
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${card.id}-${round}`}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -60, rotate: -3, transition: { duration: 0.22 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="perspective"
            >
              {/* The card leans toward the cursor; the flip happens inside it. */}
              <Tilt max={4} light={false} className="preserve-3d">
              <motion.div
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="preserve-3d grid"
              >
                {/* Front */}
                <Face hidden={flipped}>
                  <Meta card={card} />
                  <p className="text-center text-2xl font-semibold tracking-tight text-balance whitespace-pre-wrap sm:text-[26px]">{card.front}</p>
                  {typing ? (
                    <div className="flex flex-col gap-3">
                      <textarea
                        autoFocus
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer…"
                        className="min-h-24 w-full resize-y rounded-2xl border border-line bg-subtle px-4 py-3 text-base outline-none transition-colors focus:border-indigo-400 focus:bg-card"
                      />
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button variant="primary" onClick={check} disabled={busy}>
                          <Sparkles /> {busy ? 'Checking…' : 'Check answer'}
                        </Button>
                        <Button variant="ghost" onClick={() => setFlipped(true)}>
                          Show answer
                        </Button>
                      </div>
                      <p className="text-center text-xs text-muted">
                        <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> to check
                      </p>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <Button variant="soft" size="lg" onClick={() => setFlipped(true)}>
                        <Eye /> Show answer
                      </Button>
                    </div>
                  )}
                </Face>

                {/* Back */}
                <Face back hidden={!flipped}>
                  <Meta card={card} />
                  <p className="text-center text-sm text-muted text-balance whitespace-pre-wrap">{card.front}</p>
                  <div className="mx-auto h-px w-16 bg-line" />
                  <p className="text-center text-xl font-semibold tracking-tight text-balance whitespace-pre-wrap sm:text-2xl">{card.back}</p>

                  {grade && <GradeBox grade={grade} />}
                  {explanation && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-soft px-4 py-3 text-sm leading-relaxed">
                      <p className="mb-1 flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
                        <Lightbulb className="size-4" /> Explanation
                      </p>
                      {explanation}
                    </motion.div>
                  )}
                  {source && (
                    <motion.details initial={{ opacity: 0 }} animate={{ opacity: 1 }} open className="rounded-2xl bg-subtle px-4 py-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        From {source.name}
                        {source.page ? `, page ${source.page}` : ''}
                      </summary>
                      <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted">{source.text}</p>
                    </motion.details>
                  )}

                  <div className="flex flex-wrap justify-center gap-1">
                    {ai && !explanation && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={explain}>
                        <Lightbulb /> {busy ? 'Thinking…' : 'Explain this'}
                      </Button>
                    )}
                    {card.guide_id && (
                      <Button size="sm" variant="ghost" href={`#/guides/${card.guide_id}${card.guide_anchor ? `?section=${encodeURIComponent(card.guide_anchor)}` : ''}`}>
                        <FileText /> Open in my guide
                      </Button>
                    )}
                    {card.material_id && !source && (
                      <Button size="sm" variant="ghost" onClick={loadSource}>
                        <FileText /> Show in my notes{card.source_page ? ` (p. ${card.source_page})` : ''}
                      </Button>
                    )}
                  </div>
                </Face>
              </motion.div>
              </Tilt>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {flipped && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {RATINGS.map((r, i) => {
                  const suggested = grade?.rating === r.id;
                  return (
                    <motion.button
                      key={r.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.05 * i } }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => rate(r.id)}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-2xl border border-line bg-card px-3 py-3.5 shadow-card transition-colors',
                        r.ring,
                        suggested && 'border-indigo-400 ring-4 ring-indigo-500/15',
                      )}
                    >
                      {suggested && <span className="absolute -top-2.5 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Suggested</span>}
                      <span className={cn('flex items-center gap-1.5 text-sm font-semibold', r.tone)}>
                        <span className={cn('size-1.5 rounded-full', r.dot)} />
                        {r.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted">{practice ? `key ${r.key}` : describeInterval(card, r.id)}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

// Both faces sit in the same grid cell; the hidden one ignores clicks.
function Face({ back, hidden, children }) {
  return (
    <div
      aria-hidden={hidden}
      className={cn(
        'backface-hidden col-start-1 row-start-1 flex min-h-[340px] flex-col justify-center gap-6 rounded-3xl border border-line bg-card p-6 shadow-lift sm:p-10',
        back && '[transform:rotateY(180deg)]',
        hidden && 'pointer-events-none',
      )}
    >
      {children}
    </div>
  );
}

function Meta({ card }) {
  if (!(card.type && card.type !== 'basic') && !card.topic) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
      {card.type && card.type !== 'basic' && <span className="rounded-full bg-soft px-2.5 py-1 font-medium text-indigo-700 dark:text-indigo-300">{CARD_TYPES[card.type] ?? card.type}</span>}
      {card.topic && <span className="text-muted">{card.topic}</span>}
    </div>
  );
}

function GradeBox({ grade }) {
  const styles = {
    correct: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200',
    'partly correct': 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200',
    incorrect: 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200',
    error: 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200',
  };
  const label = grade.verdict === 'error' ? 'Could not grade' : grade.verdict[0].toUpperCase() + grade.verdict.slice(1);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-2xl px-4 py-3 text-sm leading-relaxed', styles[grade.verdict])}>
      <b className="font-semibold">{label}.</b> {grade.feedback}
    </motion.div>
  );
}

function SessionComplete({ tally, practice, backHref }) {
  const total = tally.again + tally.hard + tally.good + tally.easy;
  const firstTry = total ? Math.round(((tally.good + tally.easy) / total) * 100) : 0;
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !total || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fired.current = true;
    import('canvas-confetti').then(({ default: confetti }) =>
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 }, colors: ['#f97316', '#ef4444', '#7dd3fc', '#fdba74'] }),
    );
  }, [total]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <Card className="flex flex-col items-center gap-5 px-6 py-12 text-center">
        <IconTile icon={Trophy} tone="amber" size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{total ? 'Session complete' : 'Nothing to review'}</h1>
          <p className="text-muted">{total ? (practice ? 'You went through every card.' : 'No more cards due right now. Come back tomorrow.') : 'No cards are due right now.'}</p>
        </div>
        {total > 0 && (
          <div className="grid w-full max-w-md grid-cols-3 gap-3">
            <Metric value={total} label="reviews" />
            <Metric value={`${firstTry}%`} label="good or easy" />
            <Metric value={tally.again} label="to revisit" />
          </div>
        )}
        <Button variant="primary" href={backHref}>
          Back to {backHref.includes('decks/') ? 'deck' : 'flashcards'}
        </Button>
      </Card>
    </motion.div>
  );
}

function Metric({ value, label }) {
  return (
    <div className="rounded-2xl bg-subtle px-3 py-3">
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
