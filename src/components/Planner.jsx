import { useState } from 'react';
import { useApp } from '../context.js';
import { usePlan } from '../lib/usePlan.js';
import { addDays, formatDue, formatHours, fromMinutes, isoDate, sameDay, startOfDay, toMinutes, WEEKDAYS } from '../lib/time.js';
import { Empty, ModuleSelect, ModuleTag, SchemaHint, timeOf } from './bits.jsx';

const blankTask = () => ({ title: '', module_id: null, due: isoDate(addDays(new Date(), 7)), due_time: '17:00', effort_hours: 3, priority: 2, notes: '' });

export default function Planner() {
  const { db } = useApp();
  const { loading, error, plan, assignments = [], reload, logStudy } = usePlan();
  const [editing, setEditing] = useState(window.location.hash.includes('new=1') ? blankTask() : null);
  const [showDone, setShowDone] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);

  if (loading) return <p className="muted">Loading…</p>;

  async function save(e) {
    e.preventDefault();
    const row = {
      title: editing.title.trim(),
      module_id: editing.module_id,
      due_at: new Date(`${editing.due}T${editing.due_time}`).toISOString(),
      effort_hours: Number(editing.effort_hours) || 1,
      priority: Number(editing.priority),
      notes: editing.notes || null,
    };
    if (editing.id) await db.update('assignments', editing.id, row);
    else await db.insert('assignments', { ...row, hours_done: 0, status: 'todo' });
    setEditing(null);
    reload();
  }

  function edit(a) {
    const d = new Date(a.due_at);
    setEditing({ ...a, due: isoDate(d), due_time: d.toTimeString().slice(0, 5) });
  }

  async function toggleDone(a) {
    await db.update('assignments', a.id, { status: a.status === 'done' ? 'todo' : 'done' });
    reload();
  }

  async function remove(a) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    await db.remove('assignments', a.id);
    reload();
  }

  const open = assignments.filter((a) => a.status !== 'done').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const done = assignments.filter((a) => a.status === 'done');
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
  const { remainingMinutes, capacityMinutes } = plan.stats;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Planner</h1>
          <p className="muted">
            {formatHours(remainingMinutes)} of work left · {formatHours(capacityMinutes)} of study time before your last deadline. The plan
            rebuilds itself as you log work, so missed sessions roll forward.
          </p>
        </div>
        <div className="row">
          <button onClick={() => setShowPrefs(!showPrefs)}>Study hours</button>
          <button className="primary" onClick={() => setEditing(blankTask())}>
            + Deadline
          </button>
        </div>
      </header>
      <SchemaHint error={error} />

      {showPrefs && <StudyHours onClose={() => setShowPrefs(false)} />}

      {editing && (
        <form className="card stack" onSubmit={save}>
          <strong>{editing.id ? 'Edit deadline' : 'New deadline'}</strong>
          <label>
            What is it?
            <input required value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Programming assignment 2" />
          </label>
          <div className="two">
            <ModuleSelect value={editing.module_id} onChange={(v) => setEditing({ ...editing, module_id: v })} />
            <label>
              Priority
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                <option value={1}>Low</option>
                <option value={2}>Normal</option>
                <option value={3}>High (e.g. counts a lot)</option>
              </select>
            </label>
          </div>
          <div className="three">
            <label>
              Due date
              <input type="date" required value={editing.due} onChange={(e) => setEditing({ ...editing, due: e.target.value })} />
            </label>
            <label>
              Time
              <input type="time" required value={editing.due_time} onChange={(e) => setEditing({ ...editing, due_time: e.target.value })} />
            </label>
            <label>
              Estimated hours
              <input type="number" min="0.5" step="0.5" value={editing.effort_hours} onChange={(e) => setEditing({ ...editing, effort_hours: e.target.value })} />
            </label>
          </div>
          <label>
            Notes
            <textarea value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </label>
          <div className="row">
            <button className="primary">Save</button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {plan.warnings.length > 0 && (
        <div className="alert stack tight">
          {plan.warnings.map((w) => (
            <p key={w.assignmentId}>
              ⚠️ <b>{w.title}</b>{' '}
              {w.kind === 'overdue'
                ? `is overdue with ${formatHours(w.minutes)} left.`
                : `is ${formatHours(w.minutes)} short before ${formatDue(w.deadline)}. Free up time, lower the estimate, or raise your daily study limit.`}
            </p>
          ))}
        </div>
      )}

      <section className="stack tight">
        <h2>This week</h2>
        <div className="week">
          {days.map((d) => {
            const items = plan.sessions.filter((s) => sameDay(s.start, d));
            return (
              <div key={d} className={`day ${sameDay(d, new Date()) ? 'today' : ''}`}>
                <div className="day-head">
                  {WEEKDAYS[d.getDay()].slice(0, 3)} <small>{d.getDate()}</small>
                </div>
                {items.length === 0 && <p className="muted small">Free</p>}
                {items.map((s, i) => (
                  <div key={i} className={`session ${s.kind}`}>
                    <small>
                      {timeOf(s.start)}–{timeOf(s.end)}
                    </small>
                    <div>{s.kind === 'review' ? 'Flashcards' : s.title}</div>
                    {s.kind === 'task' && sameDay(d, new Date()) && (
                      <button className="link small" onClick={() => logStudy(s.assignmentId, (s.end - s.start) / 60000)}>
                        ✓ Done
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack tight">
        <h2>Deadlines</h2>
        {open.length === 0 && <Empty title="No deadlines yet">Add assignments, labs and exams, and the planner will schedule study time for them.</Empty>}
        {open.map((a) => {
          const pct = Math.min(100, Math.round(((a.hours_done ?? 0) / (a.effort_hours || 1)) * 100));
          const due = new Date(a.due_at);
          return (
            <div key={a.id} className="card task">
              <input type="checkbox" checked={false} onChange={() => toggleDone(a)} title="Mark done" />
              <div className="grow stack tight">
                <div className="row between wrap">
                  <span>
                    <ModuleTag moduleId={a.module_id} /> <b>{a.title}</b> {a.priority === 3 && <span className="pill">High</span>}
                  </span>
                  <span className={`small ${due < new Date() ? 'error' : 'muted'}`}>{formatDue(due)}</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="row between wrap small">
                  <span className="muted">
                    {a.hours_done ?? 0}h of {a.effort_hours}h done
                  </span>
                  <span className="row">
                    <button className="link" onClick={() => logStudy(a.id, 60)}>
                      +1h
                    </button>
                    <button className="link" onClick={() => edit(a)}>
                      Edit
                    </button>
                    <button className="link danger" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {done.length > 0 && (
          <button className="link" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} {done.length} completed
          </button>
        )}
        {showDone &&
          done.map((a) => (
            <div key={a.id} className="card task done">
              <input type="checkbox" checked onChange={() => toggleDone(a)} />
              <span className="grow">
                <ModuleTag moduleId={a.module_id} /> {a.title}
              </span>
              <button className="link danger small" onClick={() => remove(a)}>
                Delete
              </button>
            </div>
          ))}
      </section>
    </div>
  );
}

function StudyHours({ onClose }) {
  const { db, profile, reloadProfile } = useApp();
  const { studyPrefs } = usePlan();
  const [prefs, setPrefs] = useState(studyPrefs);

  const setDay = (d, range) => setPrefs({ ...prefs, windows: { ...prefs.windows, [d]: range ? [range] : [] } });

  async function save() {
    await db.saveProfile({ study_prefs: prefs });
    await reloadProfile();
    onClose();
  }

  return (
    <div className="card stack">
      <strong>When can you study?</strong>
      <div className="hours">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const range = prefs.windows[d]?.[0];
          return (
            <div key={d} className="row">
              <label className="check day-name">
                <input type="checkbox" checked={!!range} onChange={(e) => setDay(d, e.target.checked ? [540, 1080] : null)} />
                {WEEKDAYS[d].slice(0, 3)}
              </label>
              {range && (
                <>
                  <input type="time" value={fromMinutes(range[0])} onChange={(e) => setDay(d, [toMinutes(e.target.value), range[1]])} />
                  <span>to</span>
                  <input type="time" value={fromMinutes(range[1])} onChange={(e) => setDay(d, [range[0], toMinutes(e.target.value)])} />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="three">
        <label>
          Max study per day (hours)
          <input type="number" min="1" max="12" value={prefs.maxDailyMinutes / 60} onChange={(e) => setPrefs({ ...prefs, maxDailyMinutes: Number(e.target.value) * 60 })} />
        </label>
        <label>
          Session length (minutes)
          <select value={prefs.sessionMinutes} onChange={(e) => setPrefs({ ...prefs, sessionMinutes: Number(e.target.value) })}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Daily flashcard review (minutes)
          <input type="number" min="0" max="120" value={prefs.reviewMinutes} onChange={(e) => setPrefs({ ...prefs, reviewMinutes: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
