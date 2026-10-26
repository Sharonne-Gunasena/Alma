import { useState } from 'react';
import { useApp, useLoad, go } from '../context.js';
import { addCards } from '../lib/data.js';
import { isDue } from '../lib/srs.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { ModuleSelect, ModuleTag } from './bits.jsx';

export default function DeckView({ deckId }) {
  const { db } = useApp();
  const [data, reload, error] = useLoad(async () => {
    const [deck, cards] = await Promise.all([db.get('decks', deckId), db.list('cards', { deck_id: deckId })]);
    return { deck, cards: cards.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')) };
  }, [db, deckId]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { deck, cards } = data;

  async function add(e) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await addCards(db, deckId, [{ front: front.trim(), back: back.trim() }]);
    setFront('');
    setBack('');
    reload();
  }

  async function saveEdit() {
    await db.update('cards', editing.id, { front: editing.front.trim(), back: editing.back.trim() });
    setEditing(null);
    reload();
  }

  async function remove(card) {
    await db.remove('cards', card.id);
    reload();
  }

  async function rename() {
    const title = prompt('Rename deck', deck.title);
    if (title?.trim()) {
      await db.update('decks', deckId, { title: title.trim() });
      reload();
    }
  }

  async function setModule(module_id) {
    await db.update('decks', deckId, { module_id });
    reload();
  }

  async function removeDeck() {
    if (!confirm(`Delete "${deck.title}" and all ${cards.length} cards? This cannot be undone.`)) return;
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
  const q = query.toLowerCase();
  const shown = q ? cards.filter((c) => `${c.front} ${c.back} ${c.topic ?? ''}`.toLowerCase().includes(q)) : cards;

  return (
    <div className="stack">
      <a className="back" href="#/decks">
        ← Flashcards
      </a>
      <header className="page-head">
        <div>
          <ModuleTag moduleId={deck.module_id} />
          <h1>{deck.title}</h1>
          <p className="muted">
            {cards.length} cards · {due} due now
          </p>
        </div>
        <div className="row wrap">
          <a className={`button primary ${due ? '' : 'disabled'}`} href={due ? `#/decks/${deckId}/study?mode=due` : undefined}>
            Study {due ? `(${due})` : ''}
          </a>
          <a className={`button ${cards.length ? '' : 'disabled'}`} href={cards.length ? `#/decks/${deckId}/study?mode=all` : undefined}>
            Practise all
          </a>
          <a className="button" href={`#/create?deck=${deckId}${deck.module_id ? `&module=${deck.module_id}` : ''}`}>
            Add from lecture
          </a>
        </div>
      </header>

      <form className="card stack" onSubmit={add}>
        <strong>Add a card</strong>
        <div className="two">
          <textarea placeholder="Front (question)" value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea placeholder="Back (answer)" value={back} onChange={(e) => setBack(e.target.value)} />
        </div>
        <div>
          <button>Add card</button>
        </div>
      </form>

      {cards.length > 8 && <input placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />}

      <div className="stack tight">
        {shown.map((c) =>
          editing?.id === c.id ? (
            <div key={c.id} className="card stack">
              <div className="two">
                <textarea value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
                <textarea value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
              </div>
              <div className="row">
                <button className="primary" onClick={saveEdit}>
                  Save
                </button>
                <button onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="card cardrow">
              <div className="grow stack tight">
                <div className="row wrap small muted">
                  {c.type && c.type !== 'basic' && <span className="type">{CARD_TYPES[c.type] ?? c.type}</span>}
                  {c.topic && <span>{c.topic}</span>}
                  {c.source_page && <span>p. {c.source_page}</span>}
                </div>
                <div className="two">
                  <div>{c.front}</div>
                  <div className="muted">{c.back}</div>
                </div>
              </div>
              <div className="row">
                <button className="link" onClick={() => setEditing(c)}>
                  Edit
                </button>
                <button className="link danger" onClick={() => remove(c)}>
                  Delete
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="card row wrap">
        <ModuleSelect value={deck.module_id} onChange={setModule} />
        <button onClick={rename}>Rename deck</button>
        <button disabled={!cards.length} onClick={exportDeck}>
          Export JSON
        </button>
        <button className="danger" onClick={removeDeck}>
          Delete deck
        </button>
      </div>
    </div>
  );
}
