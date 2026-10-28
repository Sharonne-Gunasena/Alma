import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Bold,
  Brain,
  Check,
  ChevronDown,
  Code,
  Ellipsis,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Layers,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Printer,
  Quote,
  Radical,
  Redo2,
  Sigma,
  Share2,
  Sparkles,
  SquareCode,
  Strikethrough,
  Trash,
  Underline,
  Undo2,
} from 'lucide-react';
import 'katex/dist/katex.min.css';
import { useApp, useLoad, go } from '../context.js';
import { CALLOUTS, sections, toMarkdown } from '../lib/guides.js';
import { addCards, listDecks } from '../lib/data.js';
import { generateFromRules } from '../lib/rules.js';
import { activeAI } from '../ai/providers.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { dedupe } from '../ai/quality.js';
import { buildExtensions, imageToDataUrl } from '../ui/editor/extensions.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, EmptyState, Pill, Skeleton } from '../ui/primitives.jsx';
import { Checkbox, Select, Textarea } from '../ui/form.jsx';
import { Menu, Modal, useDialogs } from '../ui/dialog.jsx';
import { ShareToHubDialog } from './Hub.jsx';
import { cn } from '../ui/cn.js';

const SAVE_DELAY = 800;

// Defined once: new objects on each render would make the bubble menu re-register
// itself, which triggers another render and loops.
const BUBBLE_OPTIONS = { placement: 'top' };
const showBubble = ({ editor, from, to }) => from !== to && !editor.isActive('image') && !editor.isActive('blockMath');

export default function GuideEditor({ guideId, section }) {
  const { db } = useApp();
  const [guide, , error] = useLoad(() => db.get('guides', guideId), [db, guideId]);

  if (error)
    return (
      <Card>
        <EmptyState icon={Brain} title="Guide not found">
          <a href="#/guides">Back to study guides</a>
        </EmptyState>
      </Card>
    );
  if (!guide)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-[60vh] rounded-2xl" />
      </div>
    );
  return <Editor key={guide.id} guide={guide} section={section} />;
}

function Editor({ guide, section }) {
  const { db, modules, user } = useApp();
  const dialogs = useDialogs();
  const ai = activeAI();
  const [title, setTitle] = useState(guide.title);
  const [moduleId, setModuleId] = useState(guide.module_id);
  const catalogId = modules.find((m) => m.id === moduleId)?.catalog_module_id;
  const [status, setStatus] = useState('saved');
  const [content, setContent] = useState(guide.content);
  const [makeCards, setMakeCards] = useState(null); // { anchors: [...], selection?: string }
  const [quiz, setQuiz] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(null);
  const timer = useRef();
  const pending = useRef({});
  const editorRef = useRef();

  const [cards, reloadCards] = useLoad(async () => {
    try {
      return await db.list('cards', { guide_id: guide.id }, 'id, deck_id, guide_anchor');
    } catch {
      return []; // Database not updated for guides yet.
    }
  }, [db, guide.id]);

  // ---------- Saving ----------
  function queueSave(patch) {
    Object.assign(pending.current, patch);
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }
  async function flush() {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    try {
      await db.update('guides', guide.id, { ...patch, updated_at: new Date().toISOString() });
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      toast.error(`Couldn't save: ${err.message}`);
    }
  }
  useEffect(() => () => (clearTimeout(timer.current), flush()), []);

  // ---------- Maths ----------
  async function editMath(kind, node, pos) {
    const latex = await dialogs.prompt({ title: kind === 'block' ? 'Edit equation' : 'Edit inline maths', description: 'LaTeX, e.g. \\frac{a}{b} or x^2 + y^2', defaultValue: node.attrs.latex, confirmLabel: 'Save' });
    if (latex == null) return;
    const chain = editorRef.current.chain().focus();
    kind === 'block' ? chain.updateBlockMath({ latex, pos }).run() : chain.updateInlineMath({ latex, pos }).run();
  }

  // The editor must be created once: new extensions or callbacks on each render
  // would make Tiptap rebuild it, so callbacks go through refs.
  const handlers = useRef({});
  handlers.current = {
    editMath,
    update: (json) => {
      setContent(json);
      queueSave({ content: json });
    },
  };
  const extensions = useMemo(() => buildExtensions({ onEditMath: (...a) => handlers.current.editMath(...a) }), []);
  const editor = useEditor(
    {
      extensions,
      content: guide.content,
      shouldRerenderOnTransaction: true,
      editorProps: { attributes: { class: 'prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-h2:mt-8 prose-a:text-indigo-600' } },
      onUpdate: ({ editor }) => handlers.current.update(editor.getJSON()),
    },
    [],
  );
  editorRef.current = editor;

  const outline = useMemo(() => sections(content).filter((s) => s.level > 0), [content]);
  const counts = useMemo(() => (cards ?? []).reduce((m, c) => ((m[c.guide_anchor] = (m[c.guide_anchor] ?? 0) + 1), m), {}), [cards]);

  // Jump to a section when opened from a flashcard ("Show in my notes").
  useEffect(() => {
    if (!editor || !section) return;
    const index = outline.findIndex((s) => s.anchor === section);
    const el = editor.view.dom.querySelectorAll('h1, h2, h3')[index];
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [editor]);

  function scrollTo(i) {
    editor?.view.dom.querySelectorAll('h1, h2, h3')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Actions ----------
  async function addImage(file) {
    try {
      editor.chain().focus().setImage({ src: await imageToDataUrl(file), alt: file.name }).run();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addLink() {
    const prev = editor.getAttributes('link').href ?? '';
    const href = await dialogs.prompt({ title: 'Link', placeholder: 'https://…', defaultValue: prev, confirmLabel: prev ? 'Update' : 'Add link' });
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    href ? chain.setLink({ href }).run() : chain.unsetLink().run();
  }

  async function addMath(kind) {
    const latex = await dialogs.prompt({ title: kind === 'block' ? 'Insert equation' : 'Insert inline maths', description: 'Write LaTeX, e.g. \\int_0^1 x^2\\,dx', placeholder: 'E = mc^2', confirmLabel: 'Insert' });
    if (!latex) return;
    kind === 'block' ? editor.chain().focus().insertBlockMath({ latex }).run() : editor.chain().focus().insertInlineMath({ latex }).run();
  }

  async function explain() {
    if (!ai) return toast('Add a free AI key in Settings to use Explain.');
    const { from, to, $to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, ' ');
    if (!selection.trim()) return;
    setBusy('Explaining…');
    try {
      const { explainSelection } = await import('../ai/guideAI.js');
      const explanation = await explainSelection(ai, { selection, context: editor.getText() });
      // Insert the explanation as a note right after the paragraph it explains.
      editor
        .chain()
        .focus()
        .insertContentAt($to.after(1), { type: 'callout', attrs: { tone: 'info' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: explanation }] }] })
        .run();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function startQuiz() {
    if (!ai) return toast('Add a free AI key in Settings to use Quiz me.');
    setBusy('Writing your quiz…');
    try {
      const { quizFromGuide } = await import('../ai/guideAI.js');
      setQuiz(await quizFromGuide(ai, { title, text: editor.getText() }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  function exportMarkdown() {
    const url = URL.createObjectURL(new Blob([toMarkdown(editor.getJSON(), title)], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, '_') || 'study-guide'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeGuide() {
    if (!(await dialogs.confirm({ title: `Delete "${title}"?`, description: "Flashcards made from it are kept. This can't be undone.", confirmLabel: 'Delete guide', danger: true }))) return;
    clearTimeout(timer.current);
    pending.current = {};
    await db.remove('guides', guide.id);
    go('/guides');
  }

  if (!editor) return null;
  const selectionText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BackLink href="#/guides">Study guides</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('flex items-center gap-1.5 text-xs', status === 'error' ? 'text-rose-600' : 'text-muted')}>
            {status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : (
              <>
                <Check className="size-3.5" /> Saved
              </>
            )}
          </span>
          <Button size="sm" onClick={() => setMakeCards({ anchors: outline.map((s) => s.anchor) })}>
            <Layers /> Make flashcards
          </Button>
          <Button size="sm" variant="soft" onClick={startQuiz} disabled={!!busy}>
            <Brain /> Quiz me
          </Button>
          <Menu
            trigger={
              <Button size="icon" aria-label="More">
                <Ellipsis />
              </Button>
            }
            items={[
              {
                label: 'Share to module hub',
                icon: Share2,
                onSelect: async () => {
                  if (!catalogId) return toast('Pick a module for this guide first (one from your course).');
                  await flush(); // share the latest text
                  setSharing(true);
                },
              },
              { label: 'Download Markdown', icon: FileDown, onSelect: exportMarkdown },
              { label: 'Print or save as PDF', icon: Printer, onSelect: () => window.print() },
              '-',
              { label: 'Delete guide', icon: Trash, onSelect: removeGuide, danger: true },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queueSave({ title: e.target.value || 'Untitled guide' });
          }}
          placeholder="Untitled guide"
          className="w-full bg-transparent text-3xl font-semibold tracking-[-0.03em] outline-none placeholder:text-muted/50 sm:text-4xl"
        />
        <div className="no-print w-fit">
          <Select
            value={moduleId ?? ''}
            onChange={(e) => {
              setModuleId(e.target.value || null);
              queueSave({ module_id: e.target.value || null });
            }}
            className="h-8 rounded-full text-xs"
          >
            <option value="">No module</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ${m.name}` : m.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Toolbar editor={editor} onImage={addImage} onLink={addLink} onMath={addMath} />

      <AnimatePresence>
        {busy && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="no-print flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
            <Sparkles className="size-4 animate-pulse" /> {busy}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_240px]">
        <Card className="guide-editor min-w-0 px-5 py-6 sm:px-10 sm:py-8">
          <BubbleMenu editor={editor} options={BUBBLE_OPTIONS} shouldShow={showBubble}>
            <div className="no-print flex items-center gap-0.5 rounded-xl border border-line bg-card p-1 shadow-lift">
              <ToolButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
              <ToolButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
              <ToolButton icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
              <ToolButton icon={Link2} label="Link" active={editor.isActive('link')} onClick={addLink} />
              <span className="mx-1 h-5 w-px bg-line" />
              <button onClick={explain} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-soft dark:text-indigo-400">
                <Lightbulb className="size-3.5" /> Explain
              </button>
              <button
                onClick={() => setMakeCards({ anchors: [], selection: selectionText })}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-soft dark:text-indigo-400"
              >
                <Layers className="size-3.5" /> Cards
              </button>
            </div>
          </BubbleMenu>
          <EditorContent editor={editor} />
        </Card>

        <aside className="no-print hidden xl:block">
          <div className="sticky top-8 flex flex-col gap-1">
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Outline</p>
            {outline.length === 0 && <p className="text-xs text-muted">Add headings to build an outline. Each heading becomes a section you can turn into flashcards.</p>}
            {outline.map((s, i) => (
              <div key={s.anchor} className="group flex items-center gap-1">
                <button onClick={() => scrollTo(i)} className={cn('flex-1 truncate rounded-lg py-1 text-left text-sm text-muted transition-colors hover:text-fg', s.level === 3 && 'pl-3 text-xs', s.level === 1 && 'font-medium text-fg')}>
                  {s.heading}
                </button>
                {counts[s.anchor] ? (
                  <Pill tone="emerald" className="shrink-0">
                    {counts[s.anchor]}
                  </Pill>
                ) : (
                  <button onClick={() => setMakeCards({ anchors: [s.anchor] })} title="Make flashcards from this section" className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-600">
                    <Layers className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {cards?.length > 0 && <p className="mt-3 text-xs text-muted">{cards.length} flashcards made from this guide.</p>}
          </div>
        </aside>
      </div>

      <MakeCardsDialog
        request={makeCards}
        onClose={() => setMakeCards(null)}
        guide={{ id: guide.id, title, module_id: moduleId }}
        outline={sections(content)}
        onSaved={reloadCards}
      />
      <QuizDialog questions={quiz} onClose={() => setQuiz(null)} />
      {user && catalogId && <ShareToHubDialog open={sharing} onClose={() => setSharing(false)} catalogId={catalogId} moduleId={moduleId} preset={{ kind: 'guide', id: guide.id, title }} />}
    </div>
  );
}

// ---------- Toolbar ----------

function ToolButton({ icon: Icon, label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-35', active ? 'bg-soft text-indigo-600 dark:text-indigo-300' : 'text-muted hover:bg-subtle hover:text-fg')}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function Toolbar({ editor, onImage, onLink, onMath }) {
  const file = useRef();
  const c = () => editor.chain().focus();
  const level = [1, 2, 3].find((l) => editor.isActive('heading', { level: l }));
  const blockLabel = level ? `Heading ${level}` : 'Text';
  const toneActive = Object.keys(CALLOUTS).find((t) => editor.isActive('callout', { tone: t }));

  return (
    <div className="no-print sticky top-0 z-20 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] rounded-2xl border border-line bg-card/90 p-1.5 shadow-card backdrop-blur-xl md:top-2">
      <Menu
        align="start"
        trigger={
          <button className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium hover:bg-subtle">
            {blockLabel} <ChevronDown className="size-3.5 text-muted" />
          </button>
        }
        items={[
          { label: 'Text', icon: Pilcrow, onSelect: () => c().setParagraph().run() },
          { label: 'Heading 1', icon: Heading1, onSelect: () => c().toggleHeading({ level: 1 }).run() },
          { label: 'Heading 2', icon: Heading2, onSelect: () => c().toggleHeading({ level: 2 }).run() },
          { label: 'Heading 3', icon: Heading3, onSelect: () => c().toggleHeading({ level: 3 }).run() },
        ]}
      />
      <Divider />
      <ToolButton icon={Bold} label="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
      <ToolButton icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => c().toggleHighlight().run()} />
      <ToolButton icon={Code} label="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()} />
      <ToolButton icon={Link2} label="Link" active={editor.isActive('link')} onClick={onLink} />
      <Divider />
      <ToolButton icon={List} label="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
      <ToolButton icon={ListTodo} label="Checklist" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()} />
      <Divider />
      <Menu
        align="start"
        trigger={
          <button title="Study block" className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium', toneActive ? 'bg-soft text-indigo-600 dark:text-indigo-300' : 'text-muted hover:bg-subtle hover:text-fg')}>
            <Lightbulb className="size-4" /> Block <ChevronDown className="size-3.5" />
          </button>
        }
        items={[
          ...Object.entries(CALLOUTS).map(([tone, cfg]) => ({ label: `${cfg.emoji}  ${cfg.label}`, onSelect: () => c().toggleCallout(tone).run() })),
          '-',
          { label: 'Quote', icon: Quote, onSelect: () => c().toggleBlockquote().run() },
          { label: 'Code block', icon: SquareCode, onSelect: () => c().toggleCodeBlock().run() },
          { label: 'Divider', icon: Minus, onSelect: () => c().setHorizontalRule().run() },
        ]}
      />
      <Menu
        align="start"
        trigger={
          <button title="Maths" className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted hover:bg-subtle hover:text-fg">
            <Sigma className="size-4" /> Maths <ChevronDown className="size-3.5" />
          </button>
        }
        items={[
          { label: 'Equation (own line)', icon: Sigma, onSelect: () => onMath('block') },
          { label: 'Inline maths', icon: Radical, onSelect: () => onMath('inline') },
        ]}
      />
      <ToolButton icon={ImagePlus} label="Image" onClick={() => file.current.click()} />
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files[0];
          e.target.value = '';
          if (f) onImage(f);
        }}
      />
      <span className="flex-1" />
      <ToolButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => c().undo().run()} />
      <ToolButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => c().redo().run()} />
    </div>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" />;

// ---------- Turn sections into flashcards ----------

function MakeCardsDialog({ request, onClose, guide, outline, onSaved }) {
  const { db } = useApp();
  const ai = activeAI();
  const [chosen, setChosen] = useState(new Set());
  const [method, setMethod] = useState(ai ? 'ai' : 'rules');
  const [candidates, setCandidates] = useState(null);
  const [target, setTarget] = useState('new');
  const [busy, setBusy] = useState(null);
  const [decks] = useLoad(() => (request ? listDecks(db) : Promise.resolve([])), [db, !!request]);

  useEffect(() => {
    if (!request) return;
    setChosen(new Set(request.anchors));
    setCandidates(null);
    setTarget('new');
  }, [request]);

  const fromSelection = !!request?.selection;
  const picked = fromSelection
    ? [{ heading: 'Selection', anchor: null, text: request.selection }]
    : outline.filter((s) => chosen.has(s.anchor) && s.text.trim());

  async function generate() {
    setBusy('Writing flashcards…');
    try {
      const all = [];
      for (const [i, s] of picked.entries()) {
        let cards;
        if (method === 'ai') {
          setBusy(`Writing flashcards for "${s.heading}" (${i + 1}/${picked.length})…`);
          const { buildStudySet } = await import('../ai/engine.js');
          cards = (await buildStudySet({ ai, title: `${guide.title}: ${s.heading}`, pages: [{ page: 1, text: s.text }], thorough: false })).cards;
        } else {
          cards = generateFromRules(s.text).map((c) => ({ ...c, type: 'definition' }));
        }
        all.push(...cards.map((c) => ({ ...c, topic: s.anchor ? s.heading : c.topic, guide_anchor: s.anchor, keep: true })));
      }
      if (!all.length) throw new Error(method === 'rules' ? 'No "term: definition" lines found. Try AI instead.' : 'No cards came back. Try again.');
      setCandidates(dedupe(all));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const keep = candidates.filter((c) => c.keep && c.front.trim() && c.back.trim());
    setBusy('Saving…');
    try {
      const deckId = target === 'new' ? (await db.insert('decks', { title: guide.title || 'Study guide', module_id: guide.module_id ?? null })).id : target;
      await addCards(
        db,
        deckId,
        keep.map((c) => ({ front: c.front.trim(), back: c.back.trim(), type: c.type, topic: c.topic, guide_id: guide.id, guide_anchor: c.guide_anchor })),
      );
      toast.success(`Saved ${keep.length} flashcards`, { action: { label: 'Open deck', onClick: () => go(`/decks/${deckId}`) } });
      onSaved();
      onClose();
    } catch (err) {
      toast.error(/guide_id|guide_anchor|column/.test(err.message) ? 'The database needs updating: run supabase/migrations/004_study_guides.sql in Supabase.' : err.message);
    } finally {
      setBusy(null);
    }
  }

  const keepCount = candidates?.filter((c) => c.keep).length ?? 0;

  return (
    <Modal
      side="right"
      open={!!request}
      onOpenChange={(o) => !o && onClose()}
      title="Make flashcards"
      description={fromSelection ? 'From the text you selected.' : 'Choose the sections to turn into cards. Each card links back to its section.'}
      className="max-w-xl"
      footer={
        candidates ? (
          <>
            <Button variant="ghost" onClick={() => setCandidates(null)}>
              Back
            </Button>
            <Button variant="primary" disabled={!!busy || !keepCount} onClick={save}>
              Save {keepCount} card{keepCount === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!!busy || !picked.length} onClick={generate}>
              <Sparkles /> Generate
            </Button>
          </>
        )
      }
    >
      {busy && (
        <p className="mb-4 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
          <Sparkles className="size-4 animate-pulse" /> {busy}
        </p>
      )}
      {!candidates ? (
        <div className="flex flex-col gap-4">
          {!fromSelection && (
            <ul className="flex flex-col gap-1 rounded-2xl border border-line p-1.5">
              {outline.filter((s) => s.text.trim()).length === 0 && <li className="p-3 text-sm text-muted">Write some notes under a heading first.</li>}
              {outline
                .filter((s) => s.text.trim())
                .map((s) => (
                  <li key={s.anchor}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-subtle">
                      <Checkbox
                        checked={chosen.has(s.anchor)}
                        onChange={(on) =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            on ? next.add(s.anchor) : next.delete(s.anchor);
                            return next;
                          })
                        }
                      />
                      <span className="flex-1 truncate text-sm">{s.heading}</span>
                      <span className="text-xs text-muted">{s.text.split(/\s+/).length} words</span>
                    </label>
                  </li>
                ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant={method === 'ai' ? 'soft' : 'ghost'} disabled={!ai} onClick={() => setMethod('ai')}>
              <Sparkles /> AI{!ai && ' (add a key in Settings)'}
            </Button>
            <Button size="sm" variant={method === 'rules' ? 'soft' : 'ghost'} onClick={() => setMethod('rules')}>
              Quick: "term: definition" lines
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.map((c, i) => (
            <div key={i} className={cn('flex gap-3 rounded-2xl border border-line p-3', !c.keep && 'opacity-50')}>
              <Checkbox checked={c.keep} onChange={(keep) => setCandidates(candidates.map((x, j) => (j === i ? { ...x, keep } : x)))} className="mt-1" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.type && <Pill>{CARD_TYPES[c.type] ?? c.type}</Pill>}
                  {c.topic && <span className="text-xs text-muted">{c.topic}</span>}
                </div>
                <Textarea className="min-h-14 sm:text-[13px]" value={c.front} onChange={(e) => setCandidates(candidates.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} />
                <Textarea className="min-h-14 sm:text-[13px]" value={c.back} onChange={(e) => setCandidates(candidates.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Save to
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">New deck: {guide.title || 'Study guide'}</option>
              {(decks ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </label>
        </div>
      )}
    </Modal>
  );
}

// ---------- Quiz ----------

function QuizDialog({ questions, onClose }) {
  const [shown, setShown] = useState(new Set());
  useEffect(() => setShown(new Set()), [questions]);
  return (
    <Modal open={!!questions} onOpenChange={(o) => !o && onClose()} title="Quiz yourself" description="Answer in your head (or on paper), then reveal the model answer." className="max-w-xl">
      <ol className="flex flex-col gap-3 pb-2">
        {(questions ?? []).map((q, i) => (
          <li key={i} className="rounded-2xl border border-line p-4">
            <p className="text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            {shown.has(i) ? (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-xl bg-soft px-3 py-2 text-sm">
                {q.answer}
              </motion.p>
            ) : (
              <button onClick={() => setShown(new Set([...shown, i]))} className="mt-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Show answer
              </button>
            )}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
