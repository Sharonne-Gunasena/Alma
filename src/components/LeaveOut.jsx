import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Trash, X } from 'lucide-react';
import { applyExclusions, describeRule } from '../lib/exclusions.js';
import { parseTitle } from '../lib/ics.js';
import { activeAI } from '../ai/providers.js';
import { instructionRules } from '../ai/timetableAI.js';
import { useApp } from '../context.js';
import { WEEKDAYS_SHORT } from '../lib/time.js';
import { Button } from '../ui/Button.jsx';
import { Field, Textarea } from '../ui/form.jsx';
import { Pill } from '../ui/primitives.jsx';

// Removes saved classes that match plain instructions, e.g. "skip Thursday tutorials",
// showing the matches first. No calendar file needed.
export default function LeaveOut({ events, onDone }) {
  const { db, moduleById } = useApp();
  const [text, setText] = useState('');
  const [rules, setRules] = useState([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  // Saved classes have no code column, so it comes from their module, or failing that their title.
  const classes = useMemo(() => events.map((e) => ({ ...e, code: moduleById(e.module_id)?.code ?? parseTitle(e.title).code })), [events, moduleById]);
  const matches = useMemo(() => applyExclusions(classes, rules).excluded.map((x) => x.slot), [classes, rules]);

  async function findClasses() {
    const instruction = text.trim();
    if (!instruction) return;
    setError(null);
    setWorking(true);
    const { rules: found, aiFailed } = await instructionRules(activeAI(), instruction);
    setWorking(false);
    if (aiFailed) toast('The AI couldn’t read that, so Alma matched your words directly.');
    if (!found.length) return setError('I couldn’t find any classes to leave out in that.');
    if (!applyExclusions(classes, found).excluded.length) {
      return setError('That didn’t match any of your classes. Try a module code like MATH10200, a day, or a class type such as "tutorials".');
    }
    setRules((r) => [...r, ...found]);
    setText('');
  }

  async function removeMatches() {
    setWorking(true);
    try {
      for (const e of matches) await db.remove('class_events', e.id);
      toast.success(`Removed ${matches.length} ${matches.length === 1 ? 'class' : 'classes'}`);
      setRules([]);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="What should Alma leave out?" hint='e.g. "skip Thursday tutorials" or "leave out MATH10200 labs"'>
        <Textarea
          rows={2}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), findClasses())}
          placeholder="Tell Alma which classes to leave out"
        />
      </Field>
      <Button variant="secondary" disabled={working || !text.trim()} onClick={findClasses} className="self-start">
        <Sparkles /> {working && !matches.length ? 'Working it out…' : 'Find classes'}
      </Button>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

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

      {matches.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold">
            {matches.length} {matches.length === 1 ? 'class matches' : 'classes match'}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {matches.map((e) => (
              <li key={e.id} className="flex gap-3 px-2 py-0.5 line-through">
                <span className="w-24 shrink-0 font-mono text-xs">
                  {WEEKDAYS_SHORT[e.weekday]} {e.start_time}
                </span>
                <span className="truncate">{e.title}</span>
              </li>
            ))}
          </ul>
          <Button variant="danger" disabled={working} onClick={removeMatches} className="self-start">
            <Trash /> Remove {matches.length} {matches.length === 1 ? 'class' : 'classes'}
          </Button>
        </div>
      )}
    </div>
  );
}
