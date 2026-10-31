import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  BookText,
  Check,
  ExternalLink,
  FileText,
  Funnel,
  Layers,
  Ellipsis,
  ScanEye,
  Settings2,
  Sparkles,
  SquareSplitVertical,
  Trash,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { ACCEPTED_TYPES, extractDocument, splitIntoPages } from '../lib/extract.js';
import { addCards, deleteMaterial, listDecks, materialPages, saveMaterial } from '../lib/data.js';
import { generateFromRules } from '../lib/rules.js';
import { activeAI } from '../ai/providers.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { dedupe } from '../ai/quality.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { Button } from '../ui/Button.jsx';
import { Card, PageHeader, Pill, ProgressBar } from '../ui/primitives.jsx';
import { Checkbox, ChoiceCard, Field, Input, ModuleSelect, Select, Textarea, Toggle } from '../ui/form.jsx';
import { Menu, useDialogs } from '../ui/dialog.jsx';
import { Dropzone } from '../ui/Dropzone.jsx';
import { cn } from '../ui/cn.js';

const pageRange = (pages) => (pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : `${pages[0]}`);

const HOW = [
  { icon: SquareSplitVertical, title: 'Splits the lecture', text: 'into sections, keeping page numbers.' },
  { icon: ScanEye, title: 'Reads each section', text: 'including slide images, and writes a summary, key terms and varied cards.' },
  { icon: Check, title: 'Double-checks', text: 'vague, wrong or multi-idea cards and fixes them.' },
  { icon: Funnel, title: 'Filters in code', text: 'removing duplicates and flagging answers not in your notes.' },
];

export default function Create({ moduleId: initialModule, deckId: initialDeck }) {
  const { db } = useApp();
  const dialogs = useDialogs();
  const ai = activeAI();

  const [moduleId, setModuleId] = useState(initialModule);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [doc, setDoc] = useState(null); // { pages, pdf }
  const [pasted, setPasted] = useState('');
  const [pasting, setPasting] = useState(false);

  const [method, setMethod] = useState(ai ? 'ai' : 'rules');
  const [useImages, setUseImages] = useState(true);
  const [thorough, setThorough] = useState(true);
  const [focus, setFocus] = useState('');

  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null); // { cards, guide, skipped, stopReason }
  const [target, setTarget] = useState(initialDeck || 'new');
  const [error, setError] = useState(null);

  const [library, reloadLibrary] = useLoad(async () => {
    const [materials, decks] = await Promise.all([db.list('materials', {}, 'id, name, module_id, page_count, storage_path, created_at'), listDecks(db)]);
    return { materials: materials.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')), decks };
  }, [db]);

  async function onFile(f) {
    setError(null);
    if (f.size > MAX_UPLOAD_BYTES) return setError('That file is larger than 20 MB. Split it into smaller files.');
    setProgress({ label: 'Reading file…' });
    try {
      setDoc(await extractDocument(f));
      setFile(f);
      setPasted('');
      setPasting(false);
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      setResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  async function useSaved(m) {
    const full = await db.get('materials', m.id);
    setDoc({ pages: materialPages(full), pdf: null, materialId: m.id });
    setFile(null);
    setTitle(m.name);
    if (m.module_id) setModuleId(m.module_id);
    setResult(null);
  }

  async function removeSaved(m) {
    const ok = await dialogs.confirm({ title: `Delete "${m.name}"?`, description: 'Cards made from it are kept.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await deleteMaterial(db, m);
    reloadLibrary();
  }

  const pages = doc?.pages ?? (pasted.trim() ? splitIntoPages(pasted) : []);

  async function generate() {
    setError(null);
    setResult(null);
    if (!pages.length) return setError('Upload a lecture or paste some notes first.');
    try {
      if (method === 'rules') {
        const cards = generateFromRules(pages.map((p) => p.text).join('\n')).map((c) => ({ ...c, type: 'definition', flags: [] }));
        if (!cards.length) throw new Error('No "term: definition" lines or headings found. Try AI generation instead.');
        setResult({ cards: cards.map((c) => ({ ...c, keep: true })), guide: null });
      } else {
        await runAI(pages, null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  // Runs the AI engine on some pages and merges the output with any earlier
  // partial result, so a busy provider never throws away finished sections.
  async function runAI(todo, previous) {
    setProgress({ label: 'Starting…' });
    const { buildStudySet } = await import('../ai/engine.js');
    const set = await buildStudySet({
      ai,
      title: title || 'Lecture',
      pages: todo,
      pdf: doc?.pdf,
      focus,
      thorough,
      useImages,
      previousTopics: previous?.guide.sections.map((s) => s.topic) ?? [],
      onProgress: setProgress,
    });
    const fresh = set.cards.map((c) => ({ ...c, keep: !c.flags.some((f) => f.startsWith('Answer not')) }));
    const cards = previous ? dedupe([...previous.cards, ...fresh]) : fresh;
    if (!cards.length) throw new Error('No cards came back. Try another model or turn on "Read slide images".');
    const sections = [...(previous?.guide.sections ?? []), ...set.guide.sections].sort((a, b) => a.pages[0] - b.pages[0]);
    setResult({ cards, guide: { ...set.guide, sections }, skipped: set.skipped, stopReason: set.stopReason });
  }

  async function continueRemaining() {
    setError(null);
    try {
      await runAI(
        pages.filter((p) => result.skipped.includes(p.page)),
        result,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  const update = (i, patch) => setResult({ ...result, cards: result.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAll = (keep) => setResult({ ...result, cards: result.cards.map((c) => ({ ...c, keep })) });

  async function save() {
    const chosen = result.cards.filter((c) => c.keep && c.front.trim() && c.back.trim());
    if (!chosen.length) return setError('Select at least one card to save.');
    setProgress({ label: 'Saving…' });
    try {
      let materialId = doc?.materialId ?? null;
      if (!materialId) {
        const name = title || file?.name || `Notes ${new Date().toLocaleDateString()}`;
        try {
          materialId = (await saveMaterial(db, { name, file, pages, moduleId, guide: result.guide })).id;
        } catch (err) {
          // The original file is a convenience; keep the text and cards even if the upload fails.
          toast.warning("Couldn't store the original file", { description: `${err.message}. The text was saved instead.` });
          materialId = (await saveMaterial(db, { name, file: null, pages, moduleId, guide: result.guide })).id;
        }
      } else if (result.guide) {
        await db.update('materials', materialId, { guide: result.guide });
      }
      const deckId = target === 'new' ? (await db.insert('decks', { title: title || 'New deck', module_id: moduleId ?? null })).id : target;
      await addCards(
        db,
        deckId,
        chosen.map(({ front, back, type, topic, page }) => ({ front: front.trim(), back: back.trim(), type, topic, page, material_id: materialId })),
      );
      toast.success(`Saved ${chosen.length} cards${result.guide ? ' and a study guide' : ''}`);
      go(`/decks/${deckId}`);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  }

  const kept = result?.cards.filter((c) => c.keep).length ?? 0;
  const canSeeImages = !!(ai?.info.vision && doc?.pdf);
  const busy = !!progress;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Lecture → flashcards"
        title="Turn a lecture into flashcards"
        description="Upload slides or notes. Alma works through them section by section and builds flashcards and a study guide."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Step 1 */}
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <StepTitle n={1} title="Your lecture" />
            <Dropzone
              accept={ACCEPTED_TYPES}
              onFile={onFile}
              icon={FileText}
              title="Drop lecture slides or notes here"
              subtitle="PDF, Word, text or Markdown · up to 20 MB"
              selected={file ? `${file.name} · ${pages.length} page${pages.length === 1 ? '' : 's'}` : doc?.materialId ? `${title} (saved lecture)` : null}
            />
            {!doc &&
              (pasting ? (
                <Field label="Paste your notes">
                  <Textarea autoFocus className="min-h-40" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Lecture notes, a textbook section…" />
                </Field>
              ) : (
                <button className="w-fit text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400" onClick={() => setPasting(true)}>
                  Or paste text instead
                </button>
              ))}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 7: Eigenvalues" />
              </Field>
              <ModuleSelect value={moduleId} onChange={setModuleId} />
            </div>
            {library?.materials.length > 0 && (
              <details className="group rounded-2xl border border-line px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium marker:content-none">
                  <BookText className="size-4 text-muted" /> Your saved lectures <span className="text-muted">({library.materials.length})</span>
                </summary>
                <ul className="mt-3 flex flex-col gap-1">
                  {library.materials.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-subtle">
                      <FileText className="size-4 shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{m.name}</span>
                      <Button size="sm" variant="soft" onClick={() => useSaved(m)}>
                        Use
                      </Button>
                      <Menu
                        trigger={
                          <Button size="icon" variant="ghost" aria-label="More" className="size-8">
                            <Ellipsis />
                          </Button>
                        }
                        items={[
                          m.storage_path && { label: 'Open original file', icon: ExternalLink, onSelect: async () => window.open(await db.fileUrl(m.storage_path), '_blank', 'noopener') },
                          { label: 'Delete', icon: Trash, onSelect: () => removeSaved(m), danger: true },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {/* Step 2 */}
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <StepTitle n={2} title="How to make cards" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChoiceCard
                selected={method === 'ai'}
                onSelect={() => setMethod('ai')}
                icon={Sparkles}
                title="AI"
                badge={ai && <Pill tone="emerald">{ai.info.label.split(' ')[0]}</Pill>}
                description="Summaries, key terms and 7 kinds of card, section by section."
              />
              <ChoiceCard selected={method === 'rules'} onSelect={() => setMethod('rules')} icon={Zap} title="Quick & offline" description='Picks up "term: definition" lines and headings. Instant and free.' />
            </div>

            {method === 'ai' && !ai && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3 text-sm">
                <span>AI needs a free Gemini or Groq key. It takes a minute and costs nothing.</span>
                <Button size="sm" variant="primary" href="#/settings">
                  <Settings2 /> Add a key
                </Button>
              </div>
            )}
            {method === 'ai' && ai && (
              <div className="flex flex-col gap-4 rounded-2xl bg-subtle/70 p-4">
                <Toggle checked={thorough} onChange={setThorough} label="Double-check cards" description="A second pass fixes vague or wrong cards. Slower, but better." />
                <Toggle
                  checked={useImages && canSeeImages}
                  onChange={setUseImages}
                  disabled={!canSeeImages}
                  label="Read slide images"
                  description={canSeeImages ? 'Diagrams, equations and code screenshots count too.' : ai.info.vision ? 'Available for PDF uploads.' : `${ai.info.label} reads text only.`}
                />
                <Field label="Focus (optional)">
                  <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. exam-style questions, skip the history section" />
                </Field>
              </div>
            )}

            <Button variant="primary" size="lg" onClick={generate} disabled={busy || (method === 'ai' && !ai) || !pages.length} className="w-full sm:w-fit">
              <Sparkles /> Generate {method === 'ai' ? 'flashcards & study guide' : 'flashcards'}
            </Button>
          </Card>

          <AnimatePresence>
            {progress && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="flex items-center gap-4 border-indigo-200 p-5 dark:border-indigo-500/30">
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }} className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
                    <Sparkles className="size-5" />
                  </motion.span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{progress.label}</span>
                      {progress.steps && (
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {progress.step}/{progress.steps}
                        </span>
                      )}
                    </div>
                    {progress.steps ? <ProgressBar value={progress.step / progress.steps} /> : <div className="skeleton h-1.5 rounded-full" />}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
              {result.skipped?.length > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                  <p className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <span>
                      Stopped before page{result.skipped.length > 1 ? 's' : ''} {pageRange(result.skipped)}. {result.stopReason} The cards below come from the pages that finished.
                    </span>
                  </p>
                  <Button size="sm" variant="primary" disabled={busy} onClick={continueRemaining} className="w-fit">
                    Continue with the remaining pages
                  </Button>
                </div>
              )}

              {result.guide && (
                <Card className="flex flex-col gap-3 p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <BookText className="size-4 text-indigo-500" />
                    <h3 className="font-semibold tracking-tight">Study guide preview</h3>
                    <span className="text-sm text-muted">· {result.guide.sections.length} topics</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {result.guide.sections.map((s, i) => (
                      <div key={i} className="rounded-xl bg-subtle px-3.5 py-3">
                        <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
                          <span>{s.topic}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted">p. {pageRange(s.pages)}</span>
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{s.summary}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StepTitle n={3} title={`Review cards · ${kept} of ${result.cards.length} selected`} />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
                      Select all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
                      None
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted">Edit anything you like. Cards flagged ⚠ weren't clearly found in your notes, so they start unticked.</p>
                <div className="flex flex-col gap-2.5">
                  {result.cards.map((c, i) => (
                    <div key={i} className={cn('flex gap-3 rounded-2xl border border-line p-3.5 transition-opacity', !c.keep && 'opacity-50')}>
                      <Checkbox checked={c.keep} onChange={(keep) => update(i, { keep })} className="mt-1" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.type && <Pill>{CARD_TYPES[c.type] ?? c.type}</Pill>}
                          {c.topic && <span className="text-xs text-muted">{c.topic}</span>}
                          {c.page && <span className="font-mono text-[10px] text-muted">p. {c.page}</span>}
                          {c.flags?.map((f) => (
                            <Pill key={f} tone="amber">
                              ⚠ {f}
                            </Pill>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <Textarea className="min-h-16 sm:text-[13px]" value={c.front} onChange={(e) => update(i, { front: e.target.value })} />
                          <Textarea className="min-h-16 sm:text-[13px]" value={c.back} onChange={(e) => update(i, { back: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Sticky save bar */}
              <div className="sticky bottom-24 z-10 md:bottom-4">
                <Card className="flex flex-wrap items-center gap-3 p-3 pl-5 shadow-lift">
                  <Layers className="size-4 text-muted" />
                  <span className="text-sm text-muted">Save to</span>
                  <div className="min-w-44 flex-1">
                    <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="new">New deck: {title || 'New deck'}</option>
                      {library?.decks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="primary" onClick={save} disabled={busy || !kept}>
                    <Check /> Save {kept} card{kept === 1 ? '' : 's'}
                  </Button>
                </Card>
              </div>
            </motion.div>
          )}
        </div>

        {/* How it works */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-10 lg:self-start">
          <Card className="flex flex-col gap-4 p-5">
            <h3 className="text-sm font-semibold">How the AI works</h3>
            <ol className="flex flex-col gap-3.5">
              {HOW.map((h, i) => (
                <li key={h.title} className="flex gap-3">
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-soft text-indigo-600 dark:text-indigo-300">
                    <h.icon className="size-4" />
                    {i < HOW.length - 1 && <span className="absolute top-9 left-1/2 h-3 w-px bg-line" />}
                  </span>
                  <p className="text-xs leading-relaxed text-muted">
                    <b className="font-semibold text-fg">{h.title}</b> {h.text}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className={cn('size-2.5 shrink-0 rounded-full', ai ? 'bg-emerald-500' : 'bg-slate-400')} />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-medium">{ai ? ai.info.label : 'No AI key yet'}</p>
              <p className="truncate text-muted">{ai ? ai.model : 'Free keys from Gemini or Groq'}</p>
            </div>
            <a href="#/settings" className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
              Change
            </a>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StepTitle({ n, title }) {
  return (
    <h2 className="flex items-center gap-3 text-[15px] font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-xs text-white dark:bg-white dark:text-ink">{n}</span>
      {title}
    </h2>
  );
}
