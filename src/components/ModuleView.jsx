import { useApp, useLoad, go } from '../context.js';
import { listDecks } from '../lib/data.js';
import { formatDue, WEEKDAYS_SHORT, isoDate, DAY_MS, startOfDay } from '../lib/time.js';

export default function ModuleView({ moduleId }) {
  const { db, moduleById, reloadModules } = useApp();
  const module = moduleById(moduleId);
  const [data, reload] = useLoad(async () => {
    const [decks, materials, assignments, classes] = await Promise.all([
      listDecks(db, { module_id: moduleId }),
      db.list('materials', { module_id: moduleId }, 'id, name, page_count, guide, created_at'),
      db.list('assignments', { module_id: moduleId }),
      db.list('class_events', { module_id: moduleId }),
    ]);
    return { decks, materials, assignments, classes };
  }, [db, moduleId]);

  if (!module) return <p className="muted">Module not found. <a href="#/modules">Back to modules</a></p>;
  if (!data) return <p className="muted">Loading…</p>;

  async function setExam(value) {
    await db.update('modules', moduleId, { exam_date: value || null });
    reloadModules();
  }

  async function rename() {
    const name = prompt('Module name', module.name);
    if (name?.trim()) {
      await db.update('modules', moduleId, { name: name.trim() });
      reloadModules();
    }
  }

  async function removeModule() {
    if (!confirm(`Delete ${module.name}? Its decks, materials and deadlines are kept but no longer linked to a module.`)) return;
    await db.remove('modules', moduleId);
    await reloadModules();
    go('/modules');
  }

  const examDays = module.exam_date ? Math.round((new Date(module.exam_date) - startOfDay(new Date())) / DAY_MS) : null;
  const due = data.decks.reduce((s, d) => s + d.due_count, 0);
  const open = data.assignments.filter((a) => a.status !== 'done').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const today = isoDate(new Date());

  return (
    <div className="stack">
      <a className="back" href="#/modules">
        ← Modules
      </a>
      <header className="module-head" style={{ '--c': module.color }}>
        <div>
          <small>{module.code}</small>
          <h1>{module.name}</h1>
        </div>
        <div className="row wrap">
          {due > 0 && (
            <a className="button primary" href={`#/study?mode=due&module=${moduleId}`}>
              Study {due} due
            </a>
          )}
          <a className="button" href={`#/create?module=${moduleId}`}>
            + Lecture
          </a>
        </div>
      </header>

      <div className="dash-grid">
        <section className="card stack tight">
          <h2>Exam</h2>
          <label>
            Exam date
            <input type="date" value={module.exam_date ?? ''} onChange={(e) => setExam(e.target.value)} />
          </label>
          {examDays !== null && examDays >= 0 && (
            <p>
              <b>{examDays} days</b> to go. Keep reviewing your due cards each day and you'll have seen everything several times by then.
            </p>
          )}
        </section>

        <section className="card stack tight">
          <h2>Classes</h2>
          {data.classes.filter((c) => !c.end_date || c.end_date >= today).length === 0 ? (
            <p className="muted">No classes linked.</p>
          ) : (
            <ul className="plain list small">
              {data.classes
                .filter((c) => !c.end_date || c.end_date >= today)
                .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
                .map((c) => (
                  <li key={c.id}>
                    {WEEKDAYS_SHORT[c.weekday]} {c.start_time}–{c.end_time} · {c.kind}
                    {c.location && <span className="muted"> · {c.location}</span>}
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="card stack tight">
          <h2>Deadlines</h2>
          {open.length === 0 ? (
            <p className="muted">
              None. <a href="#/planner?new=1">Add one</a>
            </p>
          ) : (
            <ul className="plain list">
              {open.map((a) => (
                <li key={a.id} className="row between">
                  <span>{a.title}</span>
                  <span className="small muted">{formatDue(new Date(a.due_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack tight">
          <h2>Lectures &amp; study guides</h2>
          {data.materials.length === 0 ? (
            <p className="muted">
              Upload lecture slides to get flashcards and a study guide. <a href={`#/create?module=${moduleId}`}>Upload a lecture</a>
            </p>
          ) : (
            <ul className="plain list">
              {data.materials
                .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
                .map((m) => (
                  <li key={m.id} className="row between">
                    <span>📄 {m.name}</span>
                    {m.guide ? (
                      <a className="small" href={`#/guides/${m.id}`}>
                        Study guide
                      </a>
                    ) : (
                      <span className="small muted">{m.page_count ?? '?'} pages</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="stack tight">
        <h2>Flashcard decks</h2>
        {data.decks.length === 0 ? (
          <p className="muted">No decks for this module yet.</p>
        ) : (
          <div className="grid">
            {data.decks.map((d) => (
              <a key={d.id} className="card deck" href={`#/decks/${d.id}`}>
                <strong>{d.title}</strong>
                <span className="muted small">{d.card_count} cards</span>
                {d.due_count > 0 && <span className="pill">{d.due_count} due</span>}
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="row">
        <button onClick={rename}>Rename</button>
        <button className="danger" onClick={removeModule}>
          Delete module
        </button>
        <button className="link" onClick={reload}>
          Refresh
        </button>
      </div>
    </div>
  );
}
