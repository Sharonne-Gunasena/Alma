import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { parseIcs } from '../lib/ics.js';
import { importTimetable } from '../lib/data.js';
import { contributeModules } from '../lib/catalog.js';
import { applyExclusions, describeRule, rulesFromText } from '../lib/exclusions.js';
import { imageToPart } from '../lib/imageFile.js';
import { activeAI } from '../ai/providers.js';
import { parseExclusions, readTimetableImage } from '../ai/timetableAI.js';
import { useApp } from '../context.js';
import { WEEKDAYS_SHORT, isoDate } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Dropzone } from '../ui/Dropzone.jsx';
import { Field, Input, Textarea } from '../ui/form.jsx';
import { Pill } from '../ui/primitives.jsx';

// A screenshot has no term dates, so the term runs from this Monday for about four months.
function defaultTerm() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return { start: isoDate(monday), end: isoDate(new Date(monday.getTime() + 120 * 24 * 60 * 60 * 1000)) };
}

export default function TimetableImport({ onDone }) {
  const { db, modules, reloadModules, profile } = useApp();
  const [source, setSource] = useState(null); // 'calendar' or 'screenshot'
  const [slots, setSlots] = useState(null);
  const [term, setTerm] = useState(defaultTerm);
  const [rules, setRules] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [reading, setReading] = useState(false);
  const [readStatus, setReadStatus] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Bumped on every new read and on cancel, so a late answer from a cancelled read is ignored.
  const readId = useRef(0);

  useEffect(() => {
    if (!reading) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [reading]);

  // Screenshot classes take the term dates; calendar classes already have their own.
  const dated = useMemo(
    () => (slots && source === 'screenshot' ? slots.map((s) => ({ ...s, start_date: term.start, end_date: term.end })) : slots ?? []),
    [slots, source, term],
  );
  const { kept, excluded } = useMemo(() => applyExclusions(dated, rules), [dated, rules]);

  async function onFile(file) {
    setError(null);
    if (file.type.startsWith('image/')) return readScreenshot(file);
    try {
      const found = parseIcs(await file.text());
      if (!found.length) throw new Error('No timed events found in this file.');
      setSource('calendar');
      setSlots(found);
    } catch (err) {
      setError(`Couldn't read that calendar file: ${err.message}`);
    }
  }

  async function readScreenshot(file) {
    const ai = activeAI();
    if (!ai) return setError('Reading a screenshot needs an AI key. Add a Gemini or Claude key in Settings first.');
    if (!ai.info.vision) return setError(`${ai.info.label} can't read images. Switch to Gemini or Claude in Settings to read a screenshot.`);
    const id = ++readId.current;
    const current = () => id === readId.current;
    setReading(true);
    setReadStatus(`Reading your timetable with ${ai.info.label}…`);
    try {
      const found = await readTimetableImage(ai, await imageToPart(file), {
        onRetry: ({ message }) => current() && setReadStatus(message),
      });
      if (!current()) return;
      if (!found.length) throw new Error('No classes found in that picture. Try a clearer screenshot of the weekly view.');
      setSource('screenshot');
      setSlots(found);
    } catch (err) {
      if (current()) setError(`Couldn't read that screenshot: ${err.message}`);
    } finally {
      if (current()) setReading(false);
    }
  }

  function cancelReading() {
    readId.current++;
    setReading(false);
    setReadStatus(null);
  }

  // Turns the instructions into rules. Without an AI key, or if the AI fails, simple word matching is used.
  async function addInstructions() {
    const text = instructions.trim();
    if (!text) return;
    setParsing(true);
    setError(null);
    const ai = activeAI();
    let found;
    try {
      found = ai ? await parseExclusions(ai, text) : rulesFromText(text);
    } catch {
      found = rulesFromText(text);
      toast('The AI couldn’t read that, so Alma matched your words directly.');
    }
    setParsing(false);
    if (!found.length) return setError('I couldn’t find any classes to leave out in that.');
    setRules((r) => [...r, ...found]);
    setInstructions('');
  }

  async function save() {
    setBusy(true);
    try {
      const result = await importTimetable(db, kept, modules);
      // Share the module list with the student's course, so classmates get it suggested.
      await contributeModules(db, profile, result.moduleList, 'timetable');
      await reloadModules();
      setSlots(null);
      setRules([]);
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
      <Dropzone
        accept=".ics,text/calendar,image/png,image/jpeg,image/webp"
        onFile={onFile}
        icon={reading ? Sparkles : CalendarDays}
        title={reading ? 'Reading your timetable…' : 'Drop your calendar file or a timetable screenshot'}
        subtitle=".ics from Google Calendar, Outlook or Apple Calendar, or a PNG or JPG screenshot (needs a Gemini or Claude key)"
      />

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
          <li>No calendar file? Take a screenshot of your weekly timetable and drop it here instead.</li>
        </ol>
      </details>

      {reading && (
        <div className="flex flex-col gap-2 rounded-xl bg-subtle px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>
              {readStatus} <span className="text-muted tabular-nums">{elapsed}s</span>
            </span>
            <Button size="sm" variant="ghost" onClick={cancelReading}>
              Cancel
            </Button>
          </div>
          {elapsed >= 30 && (
            <p className="text-xs text-muted">
              Taking a while? Free AI keys are often busy, and Alma keeps retrying for you. You can cancel and try later, or import a calendar file instead.
            </p>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {slots && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 rounded-2xl border border-line p-4">
          {source === 'screenshot' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Term starts">
                <Input type="date" value={term.start} onChange={(e) => setTerm({ ...term, start: e.target.value })} />
              </Field>
              <Field label="Term ends">
                <Input type="date" value={term.end} onChange={(e) => setTerm({ ...term, end: e.target.value })} />
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Field label="Leave these out (optional)" hint='e.g. "skip Thursday tutorials" or "leave out COMP10330 and Italian"'>
              <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Tell Alma which classes to leave out" />
            </Field>
            <Button variant="secondary" disabled={parsing || !instructions.trim()} onClick={addInstructions} className="self-start">
              <Sparkles /> {parsing ? 'Working it out…' : 'Apply instruction'}
            </Button>
            {rules.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {rules.map((r, i) => (
                  <li key={i}>
                    <Pill>
                      {describeRule(r)}
                      <button type="button" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Remove this rule" className="ml-1 rounded-full p-0.5 hover:bg-black/10">
                        <X className="size-3" />
                      </button>
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check className="size-4 text-emerald-500" /> {kept.length} classes to import
            {excluded.length > 0 && <span className="font-normal text-muted">· {excluded.length} left out</span>}
          </p>
          <ul className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
            {kept.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg px-2 py-1 odd:bg-subtle">
                <span className="w-24 shrink-0 font-mono text-xs text-muted">
                  {WEEKDAYS_SHORT[s.weekday]} {s.start_time}
                </span>
                <span className="truncate">{s.title}</span>
              </li>
            ))}
          </ul>
          {excluded.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {excluded.map(({ slot }, i) => (
                <li key={i} className="flex gap-3 px-2 py-0.5 line-through">
                  <span className="w-24 shrink-0 font-mono text-xs">
                    {WEEKDAYS_SHORT[slot.weekday]} {slot.start_time}
                  </span>
                  <span className="truncate">{slot.title}</span>
                </li>
              ))}
            </ul>
          )}

          <Button variant="primary" disabled={busy || kept.length === 0} onClick={save} className="self-start">
            <Upload /> {busy ? 'Importing…' : 'Import timetable'}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
