import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  Flag,
  Gauge,
  Layers,
  ListChecks,
  RotateCcw,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { activeAI } from '../ai/providers.js';
import {
  VERDICT_MARK,
  buildExam,
  calibration,
  isAnswered,
  markQuestion,
  missedQuestions,
  needsMarking,
  revisionTask,
  scoreOf,
  topicBreakdown,
} from '../lib/exam.js';
import { formatDue } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, CardHeader, EmptyState, IconTile, PageHeader, Pill, ProgressBar, ProgressRing, Segmented, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Select, Textarea, Toggle } from '../ui/form.jsx';
import { useDialogs } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

export const EXAM_MIGRATION_HINT = 'The database needs updating for practice exams: run supabase/migrations/008_exam_practice.sql in the Supabase SQL Editor, then reload.';
const needsExamMigration = (msg) => /exam_attempts|schema cache|does not exist/i.test(msg ?? '');
const LETTERS = ['A', 'B', 'C', 'D'];

// "#/exam" is the setup page; "#/exam/<id>" is an attempt (session or results).
export default function Exam({ attemptId, moduleId }) {
  return attemptId ? <Attempt key={attemptId} attemptId={attemptId} /> : <ExamHome moduleId={moduleId} />;
}

// Cards for one module (through its decks), or every card.
async function loadCards(db, moduleId) {
  const cards = await db.list('cards');
  if (!moduleId) return cards;
  const decks = new Set((await db.list('decks', { module_id: moduleId })).map((d) => d.id));
  return cards.filter((c) => decks.has(c.deck_id));
}

// ---------- Setup ----------

function ExamHome({ moduleId: initialModule }) {
  const { db, modules, moduleById } = useApp();
  const [moduleId, setModuleId] = useState(initialModule ?? modules[0]?.id ?? null);
  const [count, setCount] = useState('15');
  const [minutes, setMinutes] = useState('20');
  const [format, setFormat] = useState('mixed');
  const [focusWeak, setFocusWeak] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cards] = useLoad(() => loadCards(db, moduleId), [db, moduleId]);
  const [attempts, , attemptsError] = useLoad(() => db.list('exam_attempts'), [db]);

  const usable = cards?.filter((c) => c.front?.trim() && c.back?.trim()) ?? [];
  const n = Math.min(Number(count), usable.length);
  const module = moduleById(moduleId);

  async function start() {
    setStarting(true);
    try {
      const questions = buildExam(usable, { count: Number(count), format, focusWeak });
      const attempt = await db.insert('exam_attempts', {
        module_id: moduleId,
        title: `${module ? module.code || module.name : 'All modules'} practice exam`,
        time_limit_minutes: minutes === 'none' ? null : Number(minutes),
        started_at: new Date().toISOString(),
        status: 'in_progress',
        questions,
      });
      go(`/exam/${attempt.id}`);
    } catch (e) {
      toast.error(needsExamMigration(e.message) ? EXAM_MIGRATION_HINT : e.message);
      setStarting(false);
    }
  }

  const past = (attempts ?? []).slice().sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Exam practice"
        title="Practice exam"
        description="A timed test built from your own flashcards. Answers stay hidden until you submit, then you get a score, a topic-by-topic breakdown and a revision plan for what you missed."
      />

      {attemptsError && needsExamMigration(attemptsError) && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{EXAM_MIGRATION_HINT}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="flex flex-col gap-6 p-5 sm:p-6">
          <Field label="Module">
            <Select value={moduleId ?? ''} onChange={(e) => setModuleId(e.target.value || null)}>
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ${m.name}` : m.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Questions</span>
              <Segmented value={count} onChange={setCount} options={['10', '15', '25', '40'].map((v) => ({ value: v, label: v }))} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Time limit</span>
              <Segmented
                value={minutes}
                onChange={setMinutes}
                options={[
                  { value: '10', label: '10m' },
                  { value: '20', label: '20m' },
                  { value: '45', label: '45m' },
                  { value: 'none', label: 'None' },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Question style</span>
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'mixed', label: 'Mixed' },
                { value: 'choice', label: 'Multiple choice' },
                { value: 'written', label: 'Written' },
              ]}
            />
            <p className="text-xs text-muted">
              Multiple-choice options are answers from your other cards on the same topic. Written answers are marked by AI if you have a key in Settings, or by you against the model answer.
            </p>
          </div>

          <Toggle checked={focusWeak} onChange={setFocusWeak} label="Focus on weak spots" description="Cards you've got wrong, haven't seen yet or are overdue come up more often." />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-muted">
              {!cards ? 'Counting cards…' : usable.length === 0 ? 'No flashcards here yet.' : `${n} question${n === 1 ? '' : 's'} from ${usable.length} card${usable.length === 1 ? '' : 's'}`}
            </p>
            {usable.length === 0 && cards ? (
              <Button variant="primary" href={`#/create${moduleId ? `?module=${moduleId}` : ''}`}>
                <Sparkles /> Make flashcards first
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={start} disabled={!cards || starting || usable.length < 2}>
                <ClipboardCheck /> {starting ? 'Building…' : 'Start exam'}
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Past attempts" icon={ListChecks} />
          <div className="flex flex-col gap-1 p-3 pt-3">
            {!attempts && !attemptsError && <Skeleton className="m-2 h-10" />}
            {attempts && past.length === 0 && <p className="px-2 pb-2 text-sm text-muted">Your results will appear here.</p>}
            {past.slice(0, 12).map((a) => (
              <a key={a.id} href={`#/exam/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 text-fg no-underline transition-colors hover:bg-subtle">
                <ProgressRing value={a.score ?? 0} size={38} stroke={4} color={scoreColor(a.score)}>
                  <span className="font-mono text-[10px] text-muted">{a.status === 'finished' ? Math.round((a.score ?? 0) * 100) : '…'}</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted">
                    {a.status === 'finished' ? new Date(a.started_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : a.status === 'marking' ? 'Waiting for marking' : 'In progress · resume'} · {a.questions?.length ?? 0} questions
                  </p>
                </div>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

const scoreColor = (s) => (s === null || s === undefined ? 'var(--color-slate-400)' : s >= 0.7 ? 'var(--color-emerald-500)' : s >= 0.5 ? 'var(--color-amber-500)' : 'var(--color-rose-500)');

// ---------- One attempt ----------

function Attempt({ attemptId }) {
  const { db } = useApp();
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    db.get('exam_attempts', attemptId).then(setAttempt, (e) => setError(e.message));
  }, [db, attemptId]);

  async function save(patch) {
    setAttempt((a) => ({ ...a, ...patch }));
    await db.update('exam_attempts', attemptId, patch);
  }

  if (error) return <p className="text-rose-600">{needsExamMigration(error) ? EXAM_MIGRATION_HINT : error}</p>;
  if (!attempt)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  if (attempt.status === 'in_progress') return <Session attempt={attempt} save={save} />;
  if (attempt.status === 'marking') return <Marking attempt={attempt} save={save} />;
  return <Results attempt={attempt} save={save} />;
}

// ---------- Answering ----------

function Session({ attempt, save }) {
  const dialogs = useDialogs();
  const [questions, setQuestions] = useState(attempt.questions);
  const [index, setIndex] = useState(() => Math.max(0, attempt.questions.findIndex((q) => !isAnswered(q))));
  const [now, setNow] = useState(Date.now());
  const submitted = useRef(false);
  const q = questions[index];

  const deadline = attempt.time_limit_minutes ? new Date(attempt.started_at).getTime() + attempt.time_limit_minutes * 60000 : null;
  const left = deadline ? Math.max(0, deadline - now) : null;
  const answered = questions.filter(isAnswered).length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Save answers as you go, so a refresh or a dropped connection loses nothing.
  useEffect(() => {
    const t = setTimeout(() => save({ questions }).catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [questions]);

  useEffect(() => {
    if (left === 0) submit(true);
  }, [left]);

  const update = (patch) => setQuestions((qs) => qs.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  async function submit(timeUp = false) {
    if (submitted.current) return;
    if (!timeUp) {
      const blank = questions.length - answered;
      const ok = await dialogs.confirm({
        title: 'Submit your exam?',
        description: blank ? `${blank} question${blank === 1 ? ' is' : 's are'} unanswered and will score zero.` : 'You can review every answer once it has been marked.',
        confirmLabel: 'Submit',
      });
      if (!ok) return;
    } else toast("Time's up. Your exam has been submitted.");
    submitted.current = true;
    const marked = questions.map(markQuestion);
    await save({ questions: marked, status: 'marking' });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{attempt.title}</p>
          <p className="text-xs text-muted">
            {answered} of {questions.length} answered
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deadline && (
            <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm tabular-nums', left < 60000 ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : left < 300000 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-subtle text-fg')}>
              <Timer className="size-4" /> {clock(left)}
            </span>
          )}
          <Button variant="primary" onClick={() => submit(false)}>
            <Check /> Submit
          </Button>
        </div>
      </div>
      <ProgressBar value={answered / questions.length} />

      {/* Question navigator */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
        {questions.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}${isAnswered(x) ? ', answered' : ''}${x.flagged ? ', flagged' : ''}`}
            className={cn(
              'relative grid size-9 shrink-0 place-items-center rounded-xl border font-mono text-xs transition-colors',
              i === index ? 'border-indigo-400 ring-4 ring-indigo-500/15' : 'border-line',
              isAnswered(x) ? 'bg-soft text-indigo-700 dark:text-indigo-300' : 'bg-card text-muted hover:text-fg',
            )}
          >
            {i + 1}
            {x.flagged && <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-card bg-sky-500" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <Card className="flex flex-col gap-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-medium text-muted">Question {index + 1}</span>
                <Pill tone="slate">{q.topic}</Pill>
                <Pill>{q.kind === 'choice' ? 'Multiple choice' : 'Written'}</Pill>
              </div>
              <Button size="sm" variant={q.flagged ? 'soft' : 'ghost'} onClick={() => update({ flagged: !q.flagged })}>
                <Flag /> {q.flagged ? 'Flagged' : 'Flag for review'}
              </Button>
            </div>

            <p className="text-xl font-semibold tracking-tight text-pretty whitespace-pre-wrap sm:text-2xl">{q.prompt}</p>

            {q.kind === 'choice' ? (
              <div className="flex flex-col gap-2" role="radiogroup">
                {q.choices.map((choice, i) => (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={q.response === i}
                    onClick={() => update({ response: i })}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-colors',
                      q.response === i ? 'border-indigo-400 bg-soft' : 'border-line bg-card hover:border-indigo-200 hover:bg-subtle',
                    )}
                  >
                    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold', q.response === i ? 'bg-indigo-600 text-white' : 'bg-subtle text-muted')}>
                      {LETTERS[i]}
                    </span>
                    <span className="whitespace-pre-wrap">{choice}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Textarea value={q.response ?? ''} onChange={(e) => update({ response: e.target.value })} placeholder="Write your answer…" className="min-h-32 text-base" />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">How sure are you?</span>
                {[
                  ['sure', 'Sure'],
                  ['unsure', 'Not sure'],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => update({ confidence: q.confidence === v ? null : v })}
                    className={cn('rounded-full border px-3 py-1 text-[13px] font-medium transition-colors', q.confidence === v ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200' : 'border-line text-muted hover:text-fg')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                  <ChevronLeft /> Back
                </Button>
                {index < questions.length - 1 ? (
                  <Button size="sm" onClick={() => setIndex(index + 1)}>
                    Next <ChevronRight />
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => submit(false)}>
                    <Check /> Submit
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- Marking ----------

// Written answers are marked by AI when a key is set; anything it can't mark
// (no key, or an error) is marked by the student against the model answer.
function Marking({ attempt, save }) {
  const { db } = useApp();
  const ai = activeAI();
  const [questions, setQuestions] = useState(attempt.questions);
  const [progress, setProgress] = useState(null);
  const [aiDone, setAiDone] = useState(!ai);
  const started = useRef(false);
  const todo = needsMarking(questions);

  useEffect(() => {
    if (!ai || started.current) return;
    started.current = true;
    (async () => {
      const { gradeAnswer } = await import('../ai/engine.js');
      const queue = needsMarking(questions);
      const total = queue.length;
      let done = 0;
      let next = questions;
      setProgress({ done, total });
      // Two at a time keeps within free-tier rate limits.
      const worker = async () => {
        while (queue.length) {
          const q = queue.shift();
          try {
            const g = await gradeAnswer(ai, { front: q.prompt, back: q.answer }, q.response);
            next = next.map((x) => (x.id === q.id ? { ...x, mark: VERDICT_MARK[g.verdict], verdict: g.verdict, feedback: g.feedback, marked_by: 'ai' } : x));
          } catch {
            /* left for the student to mark */
          }
          setProgress({ done: ++done, total });
          setQuestions(next);
        }
      };
      await Promise.all([worker(), worker()]);
      await save({ questions: next }).catch(() => {});
      setAiDone(true);
    })();
  }, []);

  function selfMark(id, verdict) {
    setQuestions((qs) => qs.map((x) => (x.id === id ? { ...x, mark: VERDICT_MARK[verdict], verdict, marked_by: 'you' } : x)));
  }

  async function finish(final) {
    const score = scoreOf(final);
    await save({ questions: final, score, status: 'finished', finished_at: new Date().toISOString() });
    // Missed cards go straight back into the review queue.
    const missed = [...new Set(missedQuestions(final).map((q) => q.card_id))];
    const now = new Date().toISOString();
    await Promise.all(missed.map((id) => db.update('cards', id, { due: now }).catch(() => {})));
  }

  useEffect(() => {
    if (aiDone && todo.length === 0) finish(questions);
  }, [aiDone, todo.length]);

  if (!aiDone)
    return (
      <div className="mx-auto max-w-xl">
        <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }} className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 text-white">
            <Sparkles className="size-5" />
          </motion.span>
          <h1 className="text-2xl font-semibold tracking-tight">Marking your answers</h1>
          <p className="text-sm text-muted">{progress?.total ? `Written answer ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : 'Getting started…'}</p>
          {progress?.total > 0 && <ProgressBar value={progress.done / progress.total} className="w-full max-w-xs" />}
        </Card>
      </div>
    );

  if (todo.length === 0)
    return (
      <div className="mx-auto max-w-xl">
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Mark your answers"
        title={`${todo.length} written answer${todo.length === 1 ? '' : 's'} to mark`}
        description={ai ? "The AI couldn't mark these. Compare each with the model answer and be honest: the point is to find what you don't know yet." : 'Compare each answer with the model answer. Add a free AI key in Settings to have written answers marked for you.'}
      />
      {todo.map((q) => (
        <Card key={q.id} className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-medium text-muted">Question {questions.indexOf(q) + 1}</span>
            <Pill tone="slate">{q.topic}</Pill>
          </div>
          <p className="font-semibold whitespace-pre-wrap">{q.prompt}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AnswerBox label="Your answer">{q.response}</AnswerBox>
            <AnswerBox label="Model answer" good>
              {q.answer}
            </AnswerBox>
          </div>
          <MarkButtons onMark={(v) => selfMark(q.id, v)} />
        </Card>
      ))}
    </div>
  );
}

function AnswerBox({ label, good, children }) {
  return (
    <div className={cn('rounded-2xl px-4 py-3 text-sm', good ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-subtle')}>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap">{children || <span className="text-muted italic">No answer</span>}</p>
    </div>
  );
}

function MarkButtons({ value, onMark, size = 'md' }) {
  const opts = [
    ['correct', 'Right', CircleCheck, 'text-emerald-600 dark:text-emerald-400'],
    ['partly correct', 'Partly', CircleDashed, 'text-amber-600 dark:text-amber-400'],
    ['incorrect', 'Wrong', CircleX, 'text-rose-600 dark:text-rose-400'],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map(([v, label, Icon, tone]) => (
        <Button key={v} size={size === 'sm' ? 'sm' : 'md'} variant={value === v ? 'soft' : 'secondary'} onClick={() => onMark(v)}>
          <Icon className={tone} /> {label}
        </Button>
      ))}
    </div>
  );
}

// ---------- Results ----------

function Results({ attempt, save }) {
  const { db, moduleById } = useApp();
  const module = moduleById(attempt.module_id);
  const qs = attempt.questions;
  const topics = useMemo(() => topicBreakdown(qs), [qs]);
  const cal = useMemo(() => calibration(qs), [qs]);
  const missed = missedQuestions(qs);
  const [filter, setFilter] = useState(missed.length ? 'missed' : 'all');
  const [adding, setAdding] = useState(false);
  const pct = Math.round((attempt.score ?? 0) * 100);
  const earned = qs.reduce((s, q) => s + (q.mark ?? 0), 0);
  const took = attempt.finished_at ? Math.round((new Date(attempt.finished_at) - new Date(attempt.started_at)) / 60000) : null;
  const shown = filter === 'missed' ? missed : filter === 'flagged' ? qs.filter((q) => q.flagged) : qs;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || pct < 70) return;
    import('canvas-confetti').then(({ default: confetti }) => confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 }, colors: ['#f97316', '#ef4444', '#7dd3fc', '#fdba74'] }));
  }, []);

  async function addRevision() {
    setAdding(true);
    try {
      const task = revisionTask({ questions: qs, moduleId: attempt.module_id, moduleName: module?.code || module?.name, examDate: module?.exam_date });
      const created = await db.insert('assignments', task);
      await save({ revision_assignment_id: created.id });
      toast.success('Added to your planner', { description: `${task.title}, due ${formatDue(new Date(task.due_at))}. The planner will find time for it.` });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  }

  // Lets students overrule a mark they think is wrong, AI or their own.
  async function remark(id, verdict) {
    const next = qs.map((q) => (q.id === id ? { ...q, mark: VERDICT_MARK[verdict], verdict, marked_by: 'you' } : q));
    await save({ questions: next, score: scoreOf(next) });
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="#/exam">Practice exams</BackLink>

      <motion.section variants={fadeUp} initial="hidden" animate="show" className="flex flex-wrap items-center gap-6">
        <ProgressRing value={attempt.score} size={112} stroke={10} color={scoreColor(attempt.score)}>
          <span className="text-center">
            <span className="block text-3xl font-semibold tracking-tight tabular-nums">{pct}%</span>
          </span>
        </ProgressRing>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] font-medium text-indigo-600 dark:text-indigo-400">{attempt.title}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{pct >= 85 ? 'Excellent work' : pct >= 70 ? 'Solid result' : pct >= 50 ? 'Getting there' : 'Now you know what to work on'}</h1>
          <p className="text-[15px] text-muted">
            {fmtMark(earned)} of {qs.length} marks{took !== null ? ` · ${took} min` : ''} · {new Date(attempt.started_at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </motion.section>

      {/* Next steps */}
      {missed.length > 0 && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconTile icon={CalendarPlus} />
            <div>
              <p className="font-semibold tracking-tight">Turn this into a plan</p>
              <p className="text-sm text-muted">
                The {missed.length} card{missed.length === 1 ? '' : 's'} you missed {missed.length === 1 ? 'is' : 'are'} back in your review queue. Add a revision session and the planner will fit it in before {module?.exam_date ? 'your exam' : 'the end of the week'}.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button href={`#/study?mode=due${attempt.module_id ? `&module=${attempt.module_id}` : ''}`}>
              <Layers /> Review now
            </Button>
            {attempt.revision_assignment_id ? (
              <Button variant="soft" href="#/planner">
                <Check /> In your planner
              </Button>
            ) : (
              <Button variant="primary" onClick={addRevision} disabled={adding}>
                <CalendarPlus /> {adding ? 'Adding…' : 'Add to planner'}
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By topic" icon={Gauge} />
          <div className="flex flex-col gap-3.5 p-5 pt-4">
            {topics.map((t) => (
              <div key={t.topic} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{t.topic}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {fmtMark(t.earned)}/{t.total}
                  </span>
                </div>
                <ProgressBar value={t.pct} tone={t.pct >= 0.7 ? 'emerald' : t.pct >= 0.5 ? 'amber' : 'rose'} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Confidence check" icon={Flag} />
          <div className="flex flex-col gap-3 p-5 pt-4 text-sm">
            {cal.rated < 3 ? (
              <p className="text-muted">Mark how sure you are on each question next time, and this shows whether your confidence matches your results. Being sure and wrong is the gap that hurts most in a real exam.</p>
            ) : (
              <>
                <p>
                  You were sure on <b>{cal.sure}</b> question{cal.sure === 1 ? '' : 's'} and right on <b>{cal.sureRight}</b> of them.
                  {cal.unsureRight > 0 && ` You also got ${cal.unsureRight} right that you weren't sure about: you know more than you think.`}
                </p>
                {cal.sureWrong.length > 0 && (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 dark:bg-rose-500/10">
                    <p className="mb-1.5 font-medium text-rose-800 dark:text-rose-200">Sure, but wrong. Look at these first:</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-rose-900/80 dark:text-rose-100/80">
                      {cal.sureWrong.slice(0, 4).map((q) => (
                        <li key={q.id} className="line-clamp-2">
                          {q.prompt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Every question, with answers and feedback */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Answers</h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'missed', label: `Missed (${missed.length})` },
              { value: 'flagged', label: `Flagged (${qs.filter((q) => q.flagged).length})` },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {shown.length === 0 && (
          <Card>
            <EmptyState icon={CircleCheck} title={filter === 'missed' ? 'Nothing missed' : 'Nothing flagged'}>
              {filter === 'missed' ? 'Every answer was right.' : "You didn't flag any questions."}
            </EmptyState>
          </Card>
        )}
        {shown.map((q) => (
          <QuestionReview key={q.id} q={q} n={qs.indexOf(q) + 1} onRemark={remark} />
        ))}
      </section>

      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button href={`#/exam${attempt.module_id ? `?module=${attempt.module_id}` : ''}`}>
          <RotateCcw /> New exam
        </Button>
        {attempt.module_id && <Button href={`#/modules/${attempt.module_id}`}>Module readiness</Button>}
      </div>
    </div>
  );
}

const fmtMark = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

function QuestionReview({ q, n, onRemark }) {
  const [changing, setChanging] = useState(false);
  const right = (q.mark ?? 0) >= 1;
  const partly = !right && (q.mark ?? 0) > 0;
  const Icon = right ? CircleCheck : partly ? CircleDashed : CircleX;
  const yours = q.kind === 'choice' ? (q.response === null || q.response === undefined ? '' : q.choices[q.response]) : q.response;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-5 shrink-0', right ? 'text-emerald-500' : partly ? 'text-amber-500' : 'text-rose-500')} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-medium text-muted">Q{n}</span>
            <Pill tone="slate">{q.topic}</Pill>
            {q.flagged && (
              <Pill>
                <Flag /> Flagged
              </Pill>
            )}
            {q.confidence && <span className="text-muted">You were {q.confidence === 'sure' ? 'sure' : 'not sure'}</span>}
          </div>
          <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AnswerBox label="Your answer">{yours}</AnswerBox>
        <AnswerBox label="Correct answer" good>
          {q.answer}
        </AnswerBox>
      </div>
      {q.feedback && (
        <p className="rounded-2xl bg-soft px-4 py-3 text-sm">
          <span className="font-medium text-indigo-700 dark:text-indigo-300">{q.marked_by === 'ai' ? 'AI feedback: ' : ''}</span>
          {q.feedback}
        </p>
      )}
      {q.kind === 'written' && isAnswered(q) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {changing ? (
            <MarkButtons
              size="sm"
              value={q.verdict}
              onMark={(v) => {
                onRemark(q.id, v);
                setChanging(false);
              }}
            />
          ) : (
            <>
              Marked by {q.marked_by === 'ai' ? 'AI' : 'you'}.
              <button onClick={() => setChanging(true)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Change mark
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
