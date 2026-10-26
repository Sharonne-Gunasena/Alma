import { useState } from 'react';
import { parseIcs } from '../lib/ics.js';
import { importTimetable } from '../lib/data.js';
import { useApp } from '../context.js';
import { WEEKDAYS_SHORT } from '../lib/time.js';

export default function TimetableImport({ onDone }) {
  const { db, modules, reloadModules } = useApp();
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const found = parseIcs(await file.text());
      if (!found.length) throw new Error('No timed events found in this file.');
      setSlots(found);
    } catch (err) {
      setError(`Couldn't read that calendar file: ${err.message}`);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const result = await importTimetable(db, slots, modules);
      await reloadModules();
      setSlots(null);
      onDone?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <details className="help">
        <summary>How do I get my timetable file?</summary>
        <ol>
          <li>
            Open <a href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noreferrer">Google Calendar → Settings → Import &amp; export</a> and click <b>Export</b>. This downloads a .zip file.
          </li>
          <li>Unzip it and choose the .ics file for your university timetable (e.g. "UCD Timetable").</li>
          <li>Outlook and Apple Calendar can also export .ics files.</li>
        </ol>
      </details>
      <label className="drop">
        <input type="file" accept=".ics,text/calendar" onChange={onFile} />
        <span>📅 Choose a calendar file (.ics)</span>
      </label>
      {error && <p className="error">{error}</p>}
      {slots && (
        <div className="card stack">
          <strong>Found {slots.length} weekly classes</strong>
          <ul className="plain small">
            {slots.slice(0, 12).map((s, i) => (
              <li key={i}>
                {WEEKDAYS_SHORT[s.weekday]} {s.start_time}–{s.end_time} · {s.title}
              </li>
            ))}
            {slots.length > 12 && <li className="muted">…and {slots.length - 12} more</li>}
          </ul>
          <div>
            <button className="primary" disabled={busy} onClick={save}>
              {busy ? 'Importing…' : 'Import timetable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
