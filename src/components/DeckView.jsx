import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Download, FileText, Layers, Ellipsis, Pencil, Play, Plus, Search, Share2, Shuffle, Sparkles, Trash } from 'lucide-react';
import { ShareToHubDialog } from './Hub.jsx';
import { useApp, useLoad, go } from '../context.js';
import { addCards, MASTERED_DAYS } from '../lib/data.js';
import { isDue } from '../lib/srs.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, EmptyState, ModuleBadge, PageHeader, Pill, ProgressRing, Skeleton } from '../ui/primitives.jsx';
import { Field, Input, ModuleSelect, Textarea } from '../ui/form.jsx';
import { Menu, Modal, useDialogs } from '../ui/dialog.jsx';

export default function DeckView({ deckId }) {
  const { db } = useApp();
  const dialogs = useDialogs();
  const [data, reload, error] = useLoad(async () => {
    const [deck, cards] = await Promise.all([db.get('decks', deckId), db.list('cards', { deck_id: deckId })]);
    return { deck, cards: cards.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')) };
  }, [db, deckId]);
  const [editing, setEditing] = useState(null); // {} for a new card
  const [query, setQuery] = useState('');
  const [moving, setMoving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { modules, user } = useApp();

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 w-80" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  const { deck, cards } = data;
  const catalogId = modules.find((m) => m.id === deck.module_id)?.catalog_module_id;

  async function saveCard(e) {
    e.preventDefault();
    const front = editing.front.trim();
    const back = editing.back.trim();
    if (!front || !back) return;
    if (editing.id) await db.update('cards', editing.id, { front, back });
    else await addCards(db, deckId, [{ front, back }]);
    toast.success(editing.id ? 'Card updated' : 'Card added');
    setEditing(editing.id ? null : { front: '', back: '' });
    reload();
  }

  async function remove(card) {
    await db.remove('cards', card.id);
    reload();
    toast('Card deleted');
  }

  async function rename() {
    const title = await dialogs.prompt({ title: 'Rename deck', defaultValue: deck.title, confirmLabel: 'Rename' });
    if (title) {
      await db.update('decks', deckId, { title });
      reload();
    }
  }

  async function setModule(module_id) {
    await db.update('decks', deckId, { module_id });
    setMoving(false);
    reload();
  }

  async function removeDeck() {
    const ok = await dialogs.confirm({ title: `Delete "${deck.title}"?`, description: `All ${cards.length} cards will be deleted. This can't be undone.`, confirmLabel: 'Delete deck', danger: true });
    if (!ok) return;
    await db.remove('decks', deckId);
    go('/decks');
  }

  function exportDeck() {
    const out = { title: deck.title, cards: cards.map(({ front, back, type, topic }) => ({ front, back, type, topic })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title.replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const due = cards.filter((c) => isDue(c)).length;
  const mastered = cards.filter((c) => (c.interval_days ?? 0) >= MASTERED_DAYS).length;
  const q = query.toLowerCase();
  const shown = q ? cards.filter((c) => `${c.front} ${c.back} ${c.topic ?? ''}`.toLowerCase().includes(q)) : cards;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="#/decks">Flashcards</BackLink>
      <PageHeader
        title={deck.title}
        actions={
          <>
            <Button variant="primary" href={due ? `#/decks/${deckId}/study?mode=due` : undefined} disabled={!due} className={!due ? 'pointer-events-none opacity-45' : ''}>
              <Play /> Study {due ? due : ''}
            </Button>
            <Button href={cards.length ? `#/decks/${deckId}/study?mode=all` : undefined} className={!cards.length ? 'pointer-events-none opacity-45' : ''}>
              <Shuffle /> Practise all
            </Button>
            <Menu
              trigger={
                <Button size="icon" aria-label="More">
                  <Ellipsis />
                </Button>
              }
              items={[
                { label: 'Add from a lecture', icon: Sparkles, onSelect: () => go(`/create?deck=${deckId}${deck.module_id ? `&module=${deck.module_id}` : ''}`) },
                { label: 'Rename', icon: Pencil, onSelect: rename },
                { label: 'Change module', icon: Layers, onSelect: () => setMoving(true) },
                { label: 'Share to module hub', icon: Share2, onSelect: () => (catalogId ? setSharing(true) : toast('Link this deck to a module from the shared catalogue first (Change module).')) },
                { label: 'Export JSON', icon: Download, onSelect: exportDeck },
                '-',
                { label: 'Delete deck', icon: Trash, onSelect: removeDeck, danger: true },
              ]}
            />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <ModuleBadge moduleId={deck.module_id} />
          <span className="text-sm text-muted">
            {cards.length} cards · {due} due
          </span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-4 px-5 py-4">
          <ProgressRing value={cards.length ? mastered / cards.length : 0} size={48} stroke={5} color="var(--color-emerald-500)">
            <span className="font-mono text-[11px] font-semibold">{cards.length ? Math.round((mastered / cards.length) * 100) : 0}%</span>
          </ProgressRing>
          <div>
            <p className="text-[13px] text-muted">Mastered</p>
            <p className="font-semibold">
              {mastered} of {cards.length}
            </p>
          </div>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[13px] text-muted">Due now</p>
          <p className="text-2xl font-semibold tabular-nums">{due}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[13px] text-muted">Topics</p>
          <p className="text-2xl font-semibold tabular-nums">{new Set(cards.map((c) => c.topic).filter(Boolean)).size || '–'}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-10" placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => setEditing({ front: '', back: '' })}>
          <Plus /> Card
        </Button>
      </div>

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="This deck is empty">
            Add cards by hand, or generate them from a lecture.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {shown.map((c) => (
              <motion.div key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}>
                <Card className="group flex flex-col gap-2.5 px-5 py-4">
                  {(c.type !== 'basic' || c.topic || c.source_page) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.type && c.type !== 'basic' && <Pill>{CARD_TYPES[c.type] ?? c.type}</Pill>}
                      {c.topic && <span className="text-xs text-muted">{c.topic}</span>}
                      {c.source_page && (
                        <span className="flex items-center gap-0.5 text-xs text-muted">
                          <FileText className="size-3" /> p. {c.source_page}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start sm:gap-6">
                  <p className="text-sm font-medium whitespace-pre-wrap">{c.front}</p>
                  <p className="text-sm whitespace-pre-wrap text-muted">{c.back}</p>
                  <div className="flex gap-1 opacity-100 transition-opacity sm:-my-1.5 sm:opacity-0 sm:group-hover:opacity-100">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(c)} aria-label="Edit">
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="danger" onClick={() => remove(c)} aria-label="Delete">
                      <Trash />
                    </Button>
                  </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
          {shown.length === 0 && <p className="text-sm text-muted">No cards match "{query}".</p>}
        </div>
      )}

      <Modal
        side="right"
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? 'Edit card' : 'New card'}
        description={editing?.id ? undefined : 'Keep it to one idea per card. Saving clears the form so you can add another.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Done
            </Button>
            <Button variant="primary" type="submit" form="card-form">
              {editing?.id ? 'Save' : 'Add card'}
            </Button>
          </>
        }
      >
        {editing && (
          <form id="card-form" onSubmit={saveCard} className="flex flex-col gap-4">
            <Field label="Front (question)">
              <Textarea autoFocus required value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
            </Field>
            <Field label="Back (answer)">
              <Textarea required value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
            </Field>
          </form>
        )}
      </Modal>

      {user && catalogId && <ShareToHubDialog open={sharing} onClose={() => setSharing(false)} catalogId={catalogId} moduleId={deck.module_id} preset={{ kind: 'deck', id: deck.id, title: deck.title }} />}
      <Modal open={moving} onOpenChange={setMoving} title="Change module">
        <div className="pb-2">
          <ModuleSelect value={deck.module_id} onChange={setModule} />
        </div>
      </Modal>
    </div>
  );
}
