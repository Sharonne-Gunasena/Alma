import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ChevronDown, Copy, Eye, Layers, NotebookPen, Share2, ThumbsDown, ThumbsUp, Trash, Trophy, Users } from 'lucide-react';
import { useApp, useLoad, go } from '../context.js';
import { HUB_MIGRATION_HINT, hubApi, needsHubMigration } from '../lib/hubs.js';
import { badgeFor, isHidden, rankItems } from '../lib/hubRules.js';
import { sections } from '../lib/guides.js';
import { listDecks } from '../lib/data.js';
import { Button } from '../ui/Button.jsx';
import { BackLink, Card, EmptyState, Pill, Segmented, Skeleton, fadeUp } from '../ui/primitives.jsx';
import { Field, Select, Textarea } from '../ui/form.jsx';
import { Modal, useDialogs } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

export default function Hub({ catalogId }) {
  const { user, modules } = useApp();
  const mod = modules.find((m) => m.catalog_module_id === catalogId);
  const [tab, setTab] = useState('deck');
  const [preview, setPreview] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [items, reload, error] = useLoad(() => (user ? hubApi.list(catalogId) : Promise.resolve([])), [catalogId, user?.id]);
  const [people] = useLoad(() => (user ? hubApi.contributors(catalogId).catch(() => []) : Promise.resolve([])), [catalogId, user?.id, items]);

  const pointsBy = useMemo(() => Object.fromEntries((people ?? []).map((p) => [p.author_id, Number(p.points)])), [people]);

  if (!user)
    return (
      <Card>
        <EmptyState icon={Users} title="Create an account to use module hubs">
          Hubs are where students taking the same module share and rate flashcards and study guides.
        </EmptyState>
      </Card>
    );
  if (!mod)
    return (
      <Card>
        <EmptyState icon={Users} title="This hub is for students taking the module">
          Add the module to your modules (from your timetable or course) to see its hub. <a href="#/modules">Go to modules</a>
        </EmptyState>
      </Card>
    );

  const list = rankItems((items ?? []).filter((i) => i.kind === tab).map((i) => ({ ...i, helpful: Number(i.helpful), unhelpful: Number(i.unhelpful), copies: Number(i.copies) })));
  const visible = list.filter((i) => !isHidden(i));
  const hidden = list.filter((i) => isHidden(i));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`#/modules/${mod.id}`}>{mod.name}</BackLink>
      <motion.header
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8"
        style={{ background: `linear-gradient(135deg, ${mod.color}, color-mix(in srgb, ${mod.color} 45%, #0a0f1e))` }}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full border-[28px] border-white/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-medium backdrop-blur">{mod.code ?? 'Module'} hub</span>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{mod.name}</h1>
            <p className="text-sm text-white/85">Decks and guides shared by students taking this module. Rate what helps; heavily downvoted items hide themselves.</p>
          </div>
          <Button onClick={() => setSharing(true)} className="bg-white text-slate-900 shadow-lg hover:bg-white/90">
            <Share2 /> Share yours
          </Button>
        </div>
      </motion.header>

      {error && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{needsHubMigration({ message: error }) ? HUB_MIGRATION_HINT : error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'deck', label: 'Flashcard decks', icon: Layers },
              { value: 'guide', label: 'Study guides', icon: NotebookPen },
            ]}
          />
          {!items && !error ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState icon={tab === 'deck' ? Layers : NotebookPen} title={`No shared ${tab === 'deck' ? 'decks' : 'guides'} yet`}>
                Be the first: share one of yours and classmates can copy it.
                <div className="mt-4">
                  <Button variant="primary" onClick={() => setSharing(true)}>
                    <Share2 /> Share yours
                  </Button>
                </div>
              </EmptyState>
            </Card>
          ) : (
            visible.map((item, i) => <HubItem key={item.id} item={item} i={i} badgePoints={pointsBy[item.author_id] ?? 0} onPreview={() => setPreview(item)} onChanged={reload} moduleId={mod.id} />)
          )}
          {hidden.length > 0 && (
            <>
              <button onClick={() => setShowHidden(!showHidden)} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg">
                <ChevronDown className={cn('size-4 transition-transform', showHidden && 'rotate-180')} /> {hidden.length} hidden by classmates
              </button>
              {showHidden && hidden.map((item, i) => <HubItem key={item.id} item={item} i={i} badgePoints={pointsBy[item.author_id] ?? 0} onPreview={() => setPreview(item)} onChanged={reload} moduleId={mod.id} />)}
            </>
          )}
        </div>

        <aside>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="size-4 text-amber-500" /> Top contributors
            </h2>
            {(people ?? []).length === 0 && <p className="text-xs text-muted">Nobody yet. Sharing earns 10 points, each 👍 earns 5 and each copy earns 2.</p>}
            <ol className="flex flex-col gap-2">
              {(people ?? []).slice(0, 8).map((p, i) => {
                const badge = badgeFor(Number(p.points));
                return (
                  <li key={p.author_id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-4 font-mono text-xs text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.author_name} {badge && <span title={badge.label}>{badge.emoji}</span>}
                    </span>
                    <span className="font-mono text-xs text-muted">{p.points}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </aside>
      </div>

      <PreviewDialog item={preview} onClose={() => setPreview(null)} />
      <ShareToHubDialog open={sharing} onClose={() => setSharing(false)} catalogId={catalogId} moduleId={mod.id} onShared={reload} />
    </div>
  );
}

function HubItem({ item, i, badgePoints, onPreview, onChanged, moduleId }) {
  const { db, user } = useApp();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false);
  const mine = item.author_id === user.id;
  const badge = badgeFor(badgePoints);

  async function vote(value) {
    try {
      await hubApi.vote(item.id, value, item.my_vote);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function copy() {
    setBusy(true);
    try {
      const path = await hubApi.copy(db, item, moduleId);
      toast.success(`Copied "${item.title}" to your ${item.kind === 'deck' ? 'flashcards' : 'guides'}`, { action: { label: 'Open', onClick: () => go(path) } });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await dialogs.confirm({ title: `Stop sharing "${item.title}"?`, description: 'Copies classmates already made are kept.', confirmLabel: 'Stop sharing', danger: true }))) return;
    await hubApi.remove(item.id);
    onChanged();
  }

  return (
    <motion.div custom={i} variants={fadeUp} initial="hidden" animate="show">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] leading-snug font-semibold tracking-tight">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              by {mine ? 'you' : item.author_name} {badge && <span title={badge.label}>{badge.emoji}</span>} · {item.item_count} {item.kind === 'deck' ? 'cards' : 'sections'} · updated{' '}
              {new Date(item.updated_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
            </p>
          </div>
          {item.helpful >= 5 && item.helpful > item.unhelpful * 3 && <Pill tone="emerald">Classmate approved</Pill>}
        </div>
        {item.description && <p className="text-sm text-muted">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={item.my_vote === 1 ? 'soft' : 'ghost'} disabled={mine} onClick={() => vote(1)} title={mine ? "You can't rate your own" : 'Helpful'}>
            <ThumbsUp /> {item.helpful}
          </Button>
          <Button size="sm" variant={item.my_vote === -1 ? 'soft' : 'ghost'} disabled={mine} onClick={() => vote(-1)} title={mine ? "You can't rate your own" : 'Not helpful'}>
            <ThumbsDown /> {item.unhelpful}
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Copy className="size-3.5" /> {item.copies} cop{item.copies === 1 ? 'y' : 'ies'}
          </span>
          <span className="flex-1" />
          <Button size="sm" onClick={onPreview}>
            <Eye /> Preview
          </Button>
          {mine ? (
            <Button size="sm" variant="danger" onClick={remove}>
              <Trash /> Stop sharing
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={busy} onClick={copy}>
              <Copy /> {item.kind === 'deck' ? 'Add to my decks' : 'Copy to my guides'}
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function PreviewDialog({ item, onClose }) {
  const [payload] = useLoad(() => (item ? hubApi.payload(item.id) : Promise.resolve(null)), [item?.id]);
  return (
    <Modal side="right" open={!!item} onOpenChange={(o) => !o && onClose()} title={item?.title ?? ''} description={item && `Shared by ${item.author_name}`} className="max-w-xl">
      {!payload ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : item.kind === 'deck' ? (
        <ol className="flex flex-col gap-2 pb-2">
          {(payload.cards ?? []).map((c, i) => (
            <li key={i} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-medium whitespace-pre-wrap">{c.front}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted">{c.back}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          {sections(payload.content).map((s) => (
            <section key={s.anchor}>
              {s.level > 0 && <h3 className="font-semibold tracking-tight">{s.heading}</h3>}
              <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{s.text}</p>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Share one of your decks or guides to this module's hub. Also used from the deck and guide pages.
export function ShareToHubDialog({ open, onClose, catalogId, moduleId, onShared, preset }) {
  const { db, user } = useApp();
  const [choice, setChoice] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine] = useLoad(async () => {
    if (!open || preset) return { decks: [], guides: [] };
    const [decks, guides] = await Promise.all([listDecks(db, { module_id: moduleId }), db.list('guides', { module_id: moduleId }).catch(() => [])]);
    return { decks, guides };
  }, [open, moduleId]);

  async function share() {
    setBusy(true);
    try {
      const [kind, id] = (preset ? `${preset.kind}:${preset.id}` : choice).split(':');
      let result;
      if (kind === 'deck') {
        const [deck, cards] = await Promise.all([db.get('decks', id), db.list('cards', { deck_id: id })]);
        if (!cards.length) throw new Error('That deck has no cards yet.');
        result = await hubApi.shareDeck(user.id, deck, cards, catalogId, description);
      } else {
        result = await hubApi.shareGuide(user.id, await db.get('guides', id), catalogId, description);
      }
      toast.success(result.updated ? 'Shared copy updated' : 'Shared with your module', { description: 'Classmates taking this module can now see it.' });
      onShared?.();
      onClose();
    } catch (err) {
      toast.error(needsHubMigration(err) ? HUB_MIGRATION_HINT : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      side="right"
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Share to the module hub"
      description="Classmates taking this module can see, rate and copy it. Your study progress isn't shared, only the content. Sharing again updates your shared copy."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || (!preset && !choice)} onClick={share}>
            <Share2 /> Share
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {preset ? (
          <p className="rounded-2xl bg-subtle px-4 py-3 text-sm">
            Sharing <b>{preset.title}</b>
          </p>
        ) : (
          <Field label="What to share" hint={mine && !mine.decks.length && !mine.guides.length ? 'You have no decks or guides linked to this module yet.' : undefined}>
            <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a deck or guide…</option>
              {(mine?.decks ?? []).length > 0 && (
                <optgroup label="Flashcard decks">
                  {mine.decks.map((d) => (
                    <option key={d.id} value={`deck:${d.id}`}>
                      {d.title} ({d.card_count} cards)
                    </option>
                  ))}
                </optgroup>
              )}
              {(mine?.guides ?? []).length > 0 && (
                <optgroup label="Study guides">
                  {mine.guides.map((g) => (
                    <option key={g.id} value={`guide:${g.id}`}>
                      {g.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
        )}
        <Field label="Short description (optional)">
          <Textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Covers weeks 1–6, with worked examples on eigenvalues" />
        </Field>
      </div>
    </Modal>
  );
}
