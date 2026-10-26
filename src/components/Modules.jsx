import { useState } from 'react';
import { useApp, useLoad } from '../context.js';
import { MODULE_COLORS } from '../lib/data.js';
import { isDue } from '../lib/srs.js';
import { Empty } from './bits.jsx';

export default function Modules() {
  const { db, modules, reloadModules } = useApp();
  const [form, setForm] = useState(null);
  const [counts] = useLoad(async () => {
    const [decks, cards, assignments] = await Promise.all([db.list('decks'), db.list('cards', {}, 'id, deck_id, due'), db.list('assignments')]);
    const deckModule = new Map(decks.map((d) => [d.id, d.module_id]));
    const stats = {};
    for (const m of modules) stats[m.id] = { cards: 0, due: 0, open: 0 };
    for (const c of cards) {
      const s = stats[deckModule.get(c.deck_id)];
      if (s) {
        s.cards++;
        if (isDue(c)) s.due++;
      }
    }
    for (const a of assignments) if (a.status !== 'done' && stats[a.module_id]) stats[a.module_id].open++;
    return stats;
  }, [db, modules]);

  async function create(e) {
    e.preventDefault();
    await db.insert('modules', { code: form.code.trim().toUpperCase() || null, name: form.name.trim(), color: form.color });
    setForm(null);
    reloadModules();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Modules</h1>
          <p className="muted">Each module keeps its lectures, flashcards, study guides and deadlines together.</p>
        </div>
        <button className="primary" onClick={() => setForm({ code: '', name: '', color: MODULE_COLORS[modules.length % MODULE_COLORS.length] })}>
          + Module
        </button>
      </header>

      {form && (
        <form className="card stack" onSubmit={create}>
          <div className="three">
            <label>
              Code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="COMP10110" />
            </label>
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Computer Programming I" />
            </label>
            <label>
              Colour
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <button className="primary">Create</button>
            <button type="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {modules.length === 0 ? (
        <Empty title="No modules yet">
          Import your timetable (it creates modules automatically) or add one by hand. <a href="#/timetable">Go to timetable</a>
        </Empty>
      ) : (
        <div className="grid">
          {modules.map((m) => {
            const s = counts?.[m.id];
            return (
              <a key={m.id} className="card module-card" href={`#/modules/${m.id}`} style={{ '--c': m.color }}>
                <small className="muted">{m.code}</small>
                <strong>{m.name}</strong>
                {s && (
                  <span className="small muted">
                    {s.cards} cards{s.due ? ` · ${s.due} due` : ''} · {s.open} open deadline{s.open === 1 ? '' : 's'}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
