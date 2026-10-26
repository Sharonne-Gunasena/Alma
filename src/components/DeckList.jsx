import { useEffect, useRef, useState } from 'react';

export default function DeckList({ store, go }) {
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const importRef = useRef();

  const refresh = () =>
    store
      .listDecks()
      .then(setDecks)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, [store]);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const deck = await store.createDeck(title.trim());
    setTitle('');
    go('deck', { deckId: deck.id });
  }

  async function importDeck(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.cards)) throw new Error('This file is not a deck export.');
      const deck = await store.createDeck(data.title || file.name.replace(/\.json$/i, ''));
      await store.addCards(
        deck.id,
        data.cards.filter((c) => c.front && c.back).map((c) => ({ front: String(c.front), back: String(c.back) })),
      );
      refresh();
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <h1>Your decks</h1>
        <button className="primary" onClick={() => go('create')}>
          + Cards from material
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {decks === null ? (
        <p className="muted">Loading…</p>
      ) : decks.length === 0 ? (
        <div className="card empty">
          <p>No decks yet.</p>
          <p className="muted">Upload a PDF, Word file or notes and turn them into flashcards, or start an empty deck below.</p>
        </div>
      ) : (
        <div className="grid">
          {decks.map((d) => (
            <button key={d.id} className="card deck" onClick={() => go('deck', { deckId: d.id })}>
              <strong>{d.title}</strong>
              <span className="muted">
                {d.card_count} card{d.card_count === 1 ? '' : 's'}
              </span>
              {d.due_count > 0 && <span className="pill">{d.due_count} due</span>}
            </button>
          ))}
        </div>
      )}

      <form className="row" onSubmit={create}>
        <input placeholder="New empty deck name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button>Create deck</button>
        <button type="button" onClick={() => importRef.current.click()}>
          Import JSON
        </button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importDeck} />
      </form>
    </div>
  );
}
