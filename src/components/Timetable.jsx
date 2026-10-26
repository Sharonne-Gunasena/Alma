import { useState } from 'react';
import { useApp, useLoad } from '../context.js';
import { toMinutes, WEEKDAYS, isoDate } from '../lib/time.js';
import TimetableImport from './TimetableImport.jsx';
import { Empty, ModuleSelect, SchemaHint } from './bits.jsx';

const START = 8 * 60;
const END = 20 * 60;

export default function Timetable() {
  const { db, moduleById } = useApp();
  const [events, reload, error] = useLoad(() => db.list('class_events'), [db]);
  const [showImport, setShowImport] = useState(false);
  const [adding, setAdding] = useState(null);

  if (!events && !error) return <p className="muted">Loading…</p>;
  const today = isoDate(new Date());
  const current = (events ?? []).filter((e) => !e.end_date || e.end_date >= today);
  const days = [1, 2, 3, 4, 5, ...(current.some((e) => e.weekday === 6) ? [6] : []), ...(current.some((e) => e.weekday === 0) ? [0] : [])];
  const first = Math.min(START, ...current.map((e) => toMinutes(e.start_time)));
  const last = Math.max(END, ...current.map((e) => toMinutes(e.end_time)));
  const scale = 1.1; // px per minute

  async function add(e) {
    e.preventDefault();
    await db.insert('class_events', { ...adding, weekday: Number(adding.weekday) });
    setAdding(null);
    reload();
  }

  async function remove(ev) {
    if (!confirm(`Remove ${ev.title} on ${WEEKDAYS[ev.weekday]}s?`)) return;
    await db.remove('class_events', ev.id);
    reload();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Timetable</h1>
          <p className="muted">Your weekly classes. The planner never schedules study during these.</p>
        </div>
        <div className="row">
          <button onClick={() => setShowImport(!showImport)}>Import .ics</button>
          <button className="primary" onClick={() => setAdding({ title: '', module_id: null, kind: 'lecture', weekday: 1, start_time: '09:00', end_time: '10:00', location: '' })}>
            + Class
          </button>
        </div>
      </header>
      <SchemaHint error={error} />

      {showImport && (
        <div className="card">
          <TimetableImport
            onDone={() => {
              setShowImport(false);
              reload();
            }}
          />
        </div>
      )}

      {adding && (
        <form className="card stack" onSubmit={add}>
          <div className="two">
            <label>
              Title
              <input required value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="e.g. Matrix Algebra lecture" />
            </label>
            <ModuleSelect value={adding.module_id} onChange={(v) => setAdding({ ...adding, module_id: v })} />
          </div>
          <div className="three">
            <label>
              Day
              <select value={adding.weekday} onChange={(e) => setAdding({ ...adding, weekday: e.target.value })}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAYS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <input type="time" value={adding.start_time} onChange={(e) => setAdding({ ...adding, start_time: e.target.value })} />
            </label>
            <label>
              Ends
              <input type="time" value={adding.end_time} onChange={(e) => setAdding({ ...adding, end_time: e.target.value })} />
            </label>
          </div>
          <div className="two">
            <label>
              Type
              <select value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>
                {['lecture', 'tutorial', 'practical', 'lab', 'class'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Location
              <input value={adding.location} onChange={(e) => setAdding({ ...adding, location: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <button className="primary">Add class</button>
            <button type="button" onClick={() => setAdding(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {current.length === 0 ? (
        <Empty title="No classes yet">Import your timetable from Google Calendar, or add classes by hand.</Empty>
      ) : (
        <div className="tt-scroll">
          <div className="tt" style={{ '--days': days.length }}>
            <div className="tt-hours" style={{ height: (last - first) * scale }}>
              {Array.from({ length: Math.ceil((last - first) / 60) }, (_, i) => (
                <span key={i} style={{ top: i * 60 * scale }}>
                  {String(Math.floor(first / 60) + i).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div key={d} className="tt-day">
                <div className="tt-head">{WEEKDAYS[d].slice(0, 3)}</div>
                <div className="tt-col" style={{ height: (last - first) * scale }}>
                  {current
                    .filter((e) => e.weekday === d)
                    .map((e) => {
                      const m = moduleById(e.module_id);
                      return (
                        <button
                          key={e.id}
                          className="tt-event"
                          title={`${e.title}\n${e.start_time}–${e.end_time}${e.location ? '\n' + e.location : ''}\nClick to remove`}
                          onClick={() => remove(e)}
                          style={{
                            top: (toMinutes(e.start_time) - first) * scale,
                            height: Math.max(22, (toMinutes(e.end_time) - toMinutes(e.start_time)) * scale - 2),
                            '--c': m?.color ?? '#6b7080',
                          }}
                        >
                          <b>{m?.code ?? e.title}</b>
                          <small>
                            {e.kind} · {e.start_time}
                          </small>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
