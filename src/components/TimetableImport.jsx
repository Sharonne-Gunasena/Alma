import { useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { parseIcs } from '../lib/ics.js';
import { importTimetable } from '../lib/data.js';
import { useApp } from '../context.js';
import { WEEKDAYS_SHORT } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Dropzone } from '../ui/Dropzone.jsx';

export default function TimetableImport({ onDone }) {
  const { db, modules, reloadModules } = useApp();
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file) {
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
      toast.success(`Imported ${result.classes} classes`, { description: `${result.modules} modules are set up.` });
      onDone?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Dropzone accept=".ics,text/calendar" onFile={onFile} icon={CalendarDays} title="Drop your calendar file here" subtitle=".ics from Google Calendar, Outlook or Apple Calendar" />

      <details className="group rounded-2xl bg-subtle px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-indigo-600 marker:content-none dark:text-indigo-400">How do I get my timetable file?</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-muted">
          <li>
            Open{' '}
            <a href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noreferrer">
              Google Calendar → Settings → Import &amp; export
            </a>{' '}
            and click <b>Export</b>. This downloads a .zip file.
          </li>
          <li>Unzip it and choose the .ics file for your timetable (e.g. "UCD Timetable").</li>
        </ol>
      </details>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {slots && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check className="size-4 text-emerald-500" /> Found {slots.length} weekly classes
          </p>
          <ul className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
            {slots.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg px-2 py-1 odd:bg-subtle">
                <span className="w-24 shrink-0 font-mono text-xs text-muted">
                  {WEEKDAYS_SHORT[s.weekday]} {s.start_time}
                </span>
                <span className="truncate">{s.title}</span>
              </li>
            ))}
          </ul>
          <Button variant="primary" disabled={busy} onClick={save} className="self-start">
            <Upload /> {busy ? 'Importing…' : 'Import timetable'}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
