import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { FileUp, Layers, Plus, Sparkles } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { addCards, listDecks } from '../lib/data.js';
import { Button } from '../ui/Button.jsx';
import { Card, EmptyState, ModuleBadge, PageHeader, ProgressRing, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Input, ModuleSelect } from '../ui/form.jsx';
import { Modal } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

export default function Decks() {
  const { db, modules } = useApp();
  const [filter, setFilter] = useState('');
  const [decks, reload, loadError] = useLoad(() => listDecks(db), [db]);
  const [creating, setCreating] = useState(null);
  const importRef = useRef();

  async function create(e) {
    e.preventDefault();
    const deck = await db.insert('decks', { title: creating.title.trim(), module_id: creating.module_id });
    go(`/decks/${deck.id}`);
  }

  async function importDeck(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.cards)) throw new Error('This file is not a deck export.');
      const deck = await db.insert('decks', { title: data.title || file.name.replace(/\.json$/i, ''), module_id: filter || null });
      const cards = data.cards.filter((c) => c.front && c.back).map((c) => ({ front: String(c.front), back: String(c.back), type: c.type, topic: c.topic }));
      await addCards(db, deck.id, cards);
      toast.success(`Imported ${cards.length} cards`);
      reload();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    }
  }

  const shown = (decks ?? []).filter((d) => !filter || d.module_id === filter);
  const due = shown.reduce((s, d) => s + d.due_count, 0);
  const total = shown.reduce((s, d) => s + d.card_count, 0);
  const mastered = shown.reduce((s, d) => s + d.mastered_count, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Flashcards"
        title={due ? `${due} card${due === 1 ? '' : 's'} to review` : 'All caught up'}
        description={total ? `${total} cards across ${shown.length} decks · ${mastered} mastered.` : 'Upload lecture slides and Alma turns them into flashcards and a study guide.'}
        actions={
          <>
            {due > 0 && (
              <Button href={`#/study?mode=due${filter ? `&module=${filter}` : ''}`}>
                <Layers /> Review {due}
              </Button>
            )}
            <Button variant="primary" href={`#/create${filter ? `?module=${filter}` : ''}`}>
              <Sparkles /> From lecture
            </Button>
          </>
        }
      />

      {modules.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={!filter} onClick={() => setFilter('')}>
            All decks
          </Chip>
          {modules.map((m) => (
            <Chip key={m.id} active={filter === m.id} onClick={() => setFilter(m.id)} color={m.color}>
              {m.code || m.name}
            </Chip>
          ))}
        </div>
      )}

      {loadError && <p className="text-rose-600">{loadError}</p>}

      {!decks && !loadError ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="No decks here yet">
            Turn a lecture into flashcards, or start an empty deck and write your own.
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" href="#/create">
                <Sparkles /> From lecture
              </Button>
              <Button onClick={() => setCreating({ title: '', module_id: filter || null })}>
                <Plus /> Empty deck
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {shown.map((d, i) => {
              const pct = d.card_count ? d.mastered_count / d.card_count : 0;
              return (
                <motion.div key={d.id} layout custom={i} variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0, scale: 0.96 }}>
                  <Card as="a" href={`#/decks/${d.id}`} interactive className="group relative flex h-full flex-col gap-4 overflow-hidden p-5 text-fg no-underline">
                    {/* Stacked-cards decoration */}
                    <span className="absolute -top-3 -right-3 h-16 w-20 rotate-12 rounded-xl border border-line bg-subtle transition-transform duration-300 group-hover:rotate-[18deg]" />
                    <span className="absolute -top-2 right-1 h-16 w-20 rotate-3 rounded-xl border border-line bg-card transition-transform duration-300 group-hover:rotate-6" />
                    <div className="relative flex flex-col gap-2 pr-16">
                      <ModuleBadge moduleId={d.module_id} className="w-fit" />
                      <p className="text-[17px] leading-snug font-semibold tracking-tight">{d.title}</p>
                    </div>
                    <div className="relative mt-auto flex items-center gap-3">
                      <ProgressRing value={pct} size={40} stroke={4} color="var(--color-emerald-500)">
                        <span className="font-mono text-[10px] text-muted">{Math.round(pct * 100)}</span>
                      </ProgressRing>
                      <div className="flex-1 text-xs text-muted">
                        <p>
                          <b className="font-semibold text-fg">{d.card_count}</b> cards
                        </p>
                        <p>{d.mastered_count} mastered</p>
                      </div>
                      {d.due_count > 0 && <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-glow">{d.due_count} due</span>}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setCreating({ title: '', module_id: filter || null })}>
          <Plus /> Empty deck
        </Button>
        <Button variant="ghost" onClick={() => importRef.current.click()}>
          <FileUp /> Import JSON
        </Button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importDeck} />
      </div>

      <Modal
        open={!!creating}
        onOpenChange={(o) => !o && setCreating(null)}
        title="New deck"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="deck-form">
              Create deck
            </Button>
          </>
        }
      >
        {creating && (
          <form id="deck-form" onSubmit={create} className="flex flex-col gap-4">
            <Field label="Deck name">
              <Input autoFocus required value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} placeholder="e.g. Week 6: Pointers" />
            </Field>
            <ModuleSelect value={creating.module_id} onChange={(v) => setCreating({ ...creating, module_id: v })} />
          </form>
        )}
      </Modal>
    </div>
  );
}

function Chip({ active, onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
        active ? 'border-transparent bg-ink text-white shadow-card dark:bg-white dark:text-ink' : 'border-line bg-card text-muted hover:text-fg',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
