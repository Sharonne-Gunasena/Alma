import { useRef, useState } from 'react';
import { useApp, useLoad, go } from '../context.js';
import { addCards, listDecks } from '../lib/data.js';
import { Empty, ModuleTag, SchemaHint } from './bits.jsx';

export default function Decks() {
  const { db, modules } = useApp();
  const [filter, setFilter] = useState('');
  const [decks, reload, loadError] = useLoad(() => listDecks(db), [db]);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const importRef = useRef();

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const deck = await db.insert('decks', { title: title.trim(), module_id: filter || null });
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
      await addCards(
        db,
        deck.id,
        data.cards.filter((c) => c.front && c.back).map((c) => ({ front: String(c.front), back: String(c.back), type: c.type, topic: c.topic })),
      );
      reload();
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    }
  }

  const shown = (decks ?? []).filter((d) => !filter || d.module_id === filter);
  const due = shown.reduce((s, d) => s + d.due_count, 0);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Flashcards</h1>
          <p className="muted">{due ? `${due} cards due for review.` : 'All caught up.'}</p>
        </div>
        <div className="row">
          {due > 0 && (
            <a className="button" href={`#/study?mode=due${filter ? `&module=${filter}` : ''}`}>
              Review {due} due
            </a>
          )}
          <a className="button primary" href={`#/create${filter ? `?module=${filter}` : ''}`}>
            + From lecture
          </a>
        </div>
      </header>

      {modules.length > 0 && (
        <div className="chips">
          <button className={!filter ? 'active' : ''} onClick={() => setFilter('')}>
            All
          </button>
          {modules.map((m) => (
            <button key={m.id} className={filter === m.id ? 'active' : ''} onClick={() => setFilter(m.id)} style={{ '--c': m.color }}>
              {m.code || m.name}
            </button>
          ))}
        </div>
      )}

      <SchemaHint error={loadError} />
      {error && <p className="error">{error}</p>}

      {!decks && !loadError ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty title="No decks yet">
          <p className="muted">Upload lecture slides and CampusLoop turns them into flashcards and a study guide.</p>
        </Empty>
      ) : (
        <div className="grid">
          {shown.map((d) => (
            <a key={d.id} className="card deck" href={`#/decks/${d.id}`}>
              <ModuleTag moduleId={d.module_id} />
              <strong>{d.title}</strong>
              <span className="muted small">
                {d.card_count} card{d.card_count === 1 ? '' : 's'}
              </span>
              {d.due_count > 0 && <span className="pill">{d.due_count} due</span>}
            </a>
          ))}
        </div>
      )}

      <form className="row wrap" onSubmit={create}>
        <input className="grow" placeholder="New empty deck name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button>Create deck</button>
        <button type="button" onClick={() => importRef.current.click()}>
          Import JSON
        </button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importDeck} />
      </form>
    </div>
  );
}
