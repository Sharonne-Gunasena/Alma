// Finds a student's modules from four sources: what classmates on the same course
// reported, a timetable file, the university's course page, or typing them in.
// Chosen modules collect in `picked` (a Map of code -> { code, name, source }).
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, ExternalLink, Globe, PenLine, Plus, Sparkles, Users } from 'lucide-react';
import { useApp } from '../context.js';
import { courseSearchLink, extractModules, extractModulesWithAI, normalizeCode, readCoursePage, suggestModules, universityForUrl } from '../lib/catalog.js';
import { activeAI } from '../ai/providers.js';
import TimetableImport from './TimetableImport.jsx';
import { Button } from '../ui/Button.jsx';
import { Checkbox, Field, Input, Textarea } from '../ui/form.jsx';
import { Segmented } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';

export default function ModuleFinder({ university, universities, courseName, course, year, picked, setPicked }) {
  const { modules } = useApp();
  const [tab, setTab] = useState('suggested');
  const [suggested, setSuggested] = useState(null);

  useEffect(() => {
    let alive = true;
    suggestModules(course?.id, Number(year)).then((rows) => {
      if (!alive) return;
      setSuggested(rows);
      // Pre-select what classmates take, and open the most useful tab.
      if (rows.length) {
        setPicked((p) => {
          const next = new Map(p);
          for (const r of rows) if (!next.has(r.code)) next.set(r.code, { code: r.code, name: r.name, source: 'manual' });
          return next;
        });
      } else setTab('timetable');
    });
    return () => {
      alive = false;
    };
  }, [course?.id, year]);

  const toggle = (m, source, on) =>
    setPicked((p) => {
      const next = new Map(p);
      if (on) next.set(m.code, { code: m.code, name: m.name, source });
      else next.delete(m.code);
      return next;
    });

  const already = modules.filter((m) => m.code);

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        className="w-full overflow-x-auto [&>button]:flex-1 [&>button]:justify-center"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'suggested', label: 'Classmates', icon: Users },
          { value: 'timetable', label: 'Timetable', icon: CalendarDays },
          { value: 'website', label: 'Website', icon: Globe },
          { value: 'manual', label: 'Type', icon: PenLine },
        ]}
      />

      {tab === 'suggested' &&
        (suggested === null ? (
          <p className="text-sm text-muted">Checking what classmates on your course take…</p>
        ) : suggested.length === 0 ? (
          <div className="rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">
            {course ? 'No classmates on this course have shared their modules yet.' : 'Your course is new to Alma.'} Import your timetable or read your course page instead, and you'll be the first. Classmates
            who join after you get your list suggested.
          </div>
        ) : (
          <ModuleChecklist
            heading={`Taken by students on ${courseName}${year ? `, year ${year}` : ''}`}
            items={suggested.map((s) => ({ code: s.code, name: s.name, hint: `${s.students} student${s.students === 1 ? '' : 's'}` }))}
            picked={picked}
            onToggle={(m, on) => toggle(m, 'manual', on)}
          />
        ))}

      {tab === 'timetable' &&
        (already.length ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              <Check className="size-4 shrink-0" /> You already have {already.length} module{already.length === 1 ? '' : 's'}: {already.map((m) => m.code).join(', ')}. Import a
              timetable to add more, with class times.
            </p>
            <TimetableImport />
          </div>
        ) : (
          <TimetableImport />
        ))}

      {tab === 'website' && <WebsiteReader university={university} universities={universities} courseName={courseName} picked={picked} onToggle={(m, on) => toggle(m, 'website', on)} setPicked={setPicked} />}

      {tab === 'manual' && <ManualAdd onAdd={(m) => toggle(m, 'manual', true)} />}

      {picked.size > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold">
            Selected ({picked.size}){already.length ? ` + ${already.length} already added` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...picked.values()].map((m) => (
              <button
                key={m.code}
                onClick={() => toggle(m, m.source, false)}
                title="Remove"
                className="flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-indigo-300"
              >
                <span className="font-mono">{m.code}</span> {m.name !== m.code && <span className="max-w-40 truncate font-normal">{m.name}</span>} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleChecklist({ heading, items, picked, onToggle }) {
  const allOn = items.every((i) => picked.has(i.code));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{heading}</p>
        <button className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => items.forEach((i) => onToggle(i, !allOn))}>
          {allOn ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <ul className="flex max-h-72 flex-col gap-1 overflow-auto rounded-2xl border border-line p-1.5">
        {items.map((m) => (
          <li key={m.code}>
            <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-subtle', picked.has(m.code) && 'bg-soft/60')}>
              <Checkbox checked={picked.has(m.code)} onChange={(on) => onToggle(m, on)} />
              <span className="w-24 shrink-0 font-mono text-xs text-muted">{m.code}</span>
              <span className="flex-1 truncate text-sm">{m.name}</span>
              {m.hint && <span className="shrink-0 text-xs text-muted">{m.hint}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebsiteReader({ university, universities, courseName, picked, onToggle, setPicked }) {
  const ai = activeAI();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [found, setFound] = useState(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  // Reads modules from page text, with the AI as a fallback for unusual layouts.
  async function findIn(text, uni) {
    let modules = extractModules(text, uni);
    if (modules.length < 3 && ai) modules = await extractModulesWithAI(ai, text, uni?.name ?? 'the university');
    if (!modules.length) throw new Error("No module codes found. Try the page that lists the course's modules, or add them by hand.");
    setFound(modules);
    // Tick everything found; the student unticks electives they don't take.
    setPicked((p) => {
      const next = new Map(p);
      for (const m of modules) if (!next.has(m.code)) next.set(m.code, { ...m, source: 'website' });
      return next;
    });
  }

  async function run(work) {
    setError(null);
    setFound(null);
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function read(e) {
    e.preventDefault();
    const pageUni = universityForUrl(url, universities);
    if (!pageUni || pageUni.id === 'other') return setError(`That link isn't on a supported university website${university?.domains?.[0] ? ` (e.g. ${university.domains[0]})` : ''}.`);
    run(async () => {
      try {
        await findIn((await readCoursePage(url)).text, pageUni);
      } catch (err) {
        // Some university sites block automated requests; copying the page text always works.
        if (/403|blocked|took too long|could not reach/i.test(err.message)) {
          setPasting(true);
          throw new Error(`${err.message} That website doesn't allow automatic reading, so copy the page instead: open it, press Ctrl+A then Ctrl+C, and paste below.`);
        }
        throw err;
      }
    });
  }

  function readPasted(e) {
    e.preventDefault();
    run(() => findIn(pasted, university));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Paste the link to your course's page on the {university?.short_name ?? 'university'} website, the one that lists its modules. Alma reads the module codes and names from it.
      </p>
      <a href={courseSearchLink(university, courseName)} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400">
        Find my course page <ExternalLink className="size-3.5" />
      </a>
      <form onSubmit={read} className="flex flex-col gap-2 sm:flex-row">
        <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`https://www.${university?.domains?.[0] ?? 'university.ie'}/…`} className="flex-1" />
        <Button variant="primary" disabled={busy}>
          <Sparkles /> {busy ? 'Reading…' : 'Read page'}
        </Button>
      </form>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      {pasting ? (
        <form onSubmit={readPasted} className="flex flex-col gap-2">
          <Field label="Course page text" hint="Open your course page, press Ctrl+A (Cmd+A on Mac) then Ctrl+C, and paste it here.">
            <Textarea required className="min-h-32" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the whole page here…" />
          </Field>
          <Button variant="primary" disabled={busy} className="w-fit">
            <Sparkles /> {busy ? 'Reading…' : 'Find modules'}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setPasting(true)} className="w-fit text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Or paste the page text instead
        </button>
      )}
      {found && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <ModuleChecklist heading={`Found ${found.length} modules. Untick any you don't take.`} items={found} picked={picked} onToggle={onToggle} />
        </motion.div>
      )}
    </div>
  );
}

function ManualAdd({ onAdd }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  function add(e) {
    e.preventDefault();
    if (!code.trim()) return;
    onAdd({ code: normalizeCode(code), name: name.trim() || normalizeCode(code) });
    setCode('');
    setName('');
  }
  return (
    <form onSubmit={add} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <Field label="Module code">
          <Input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="COMP10110" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Programming I" />
        </Field>
      </div>
      <Button type="submit" className="w-fit">
        <Plus /> Add module
      </Button>
    </form>
  );
}
