import { useEffect, useState } from 'react';
import { isDue } from '../lib/srs.js';

export default function DeckView({ store, deckId, go }) {
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editing, setEditing] = useState(null);

  async function refresh() {
    try {
      const [d, c] = await Promise.all([store.getDeck(deckId), store.listCards(deckId)]);
      setDeck(d);
      setCards(c);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [deckId]);

  async function add(e) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    await store.addCards(deckId, [{ front: front.trim(), back: back.trim() }]);
    setFront('');
    setBack('');
    refresh();
  }

  async function saveEdit() {
    await store.updateCard(editing.id, { front: editing.front.trim(), back: editing.back.trim() });
    setEditing(null);
    refresh();
  }

  async function remove(card) {
    await store.deleteCard(card.id);
    refresh();
  }

  async function rename() {
    const title = prompt('Rename deck', deck.title);
    if (title?.trim()) {
      await store.renameDeck(deckId, title.trim());
      refresh();
    }
  }

  async function removeDeck() {
    if (!confirm(`Delete "${deck.title}" and all ${cards.length} cards? This cannot be undone.`)) return;
    await store.deleteDeck(deckId);
    go('decks');
  }

  function exportDeck() {
    const data = { title: deck.title, cards: cards.map(({ front, back }) => ({ front, back })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title.replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="error">{error}</p>;
  if (!deck) return <p className="muted">Loading…</p>;

  const due = cards.filter((c) => isDue(c)).length;

  return (
    <div className="stack">
      <button className="link back" onClick={() => go('decks')}>
        ← All decks
      </button>
      <div className="row between wrap">
        <div>
          <h1>{deck.title}</h1>
          <p className="muted">
            {cards.length} cards · {due} due now
          </p>
        </div>
        <div className="row wrap">
          <button className="primary" disabled={!due} onClick={() => go('study', { deckId })}>
            Study {due ? `(${due})` : ''}
          </button>
          <button disabled={!cards.length} onClick={() => go('study', { deckId, practice: true })}>
            Practise all
          </button>
          <button onClick={() => go('create', { deckId })}>Add from material</button>
        </div>
      </div>

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

      <div className="stack">
        {cards.map((c) =>
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
              <div className="two">
                <div>{c.front}</div>
                <div className="muted">{c.back}</div>
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

      <div className="row wrap">
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
