import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Moon, Sun, Sunrise } from 'lucide-react';
import { useApp } from '../context.js';
import { DEFAULT_STUDY_PREFS } from '../lib/planner.js';
import { UNIVERSITIES, addModulesToProfile, contributeModules, findOrCreateCourse, listCourses, listUniversities, normalizeCode } from '../lib/catalog.js';
import ModuleFinder from './ModuleFinder.jsx';
import { LogoMark } from './Shell.jsx';
import { Button } from '../ui/Button.jsx';
import { ChoiceCard, Field, Input, Select } from '../ui/form.jsx';
import { Card } from '../ui/primitives.jsx';
import { cn } from '../ui/cn.js';

const STUDY_PRESETS = {
  daytime: { label: 'Daytime', description: '9:00–18:00 on weekdays', icon: Sun, weekday: [[540, 1080]], weekend: [[660, 960]] },
  evening: { label: 'Evenings', description: '17:00–22:00 on weekdays', icon: Moon, weekday: [[1020, 1320]], weekend: [[600, 1080]] },
  allday: { label: 'Flexible', description: '9:00–21:00, whenever I am free', icon: Sunrise, weekday: [[540, 1260]], weekend: [[600, 1080]] },
};
const STEPS = ['About you', 'Your course', 'Your modules', 'Study time'];

export default function Onboarding() {
  const { db, user, reloadProfile, reloadModules, modules } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [universities, setUniversities] = useState(UNIVERSITIES);
  const [uniId, setUniId] = useState('ucd');
  const [otherUni, setOtherUni] = useState('');
  const [courses, setCourses] = useState([]);
  const [courseName, setCourseName] = useState('');
  const [year, setYear] = useState(1);
  const [picked, setPicked] = useState(() => new Map());
  const [preset, setPreset] = useState('allday');
  const [hours, setHours] = useState(4);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUniversities().then(setUniversities);
  }, []);
  useEffect(() => {
    listCourses(uniId).then(setCourses);
  }, [uniId]);

  const university = universities.find((u) => u.id === uniId);
  // An existing catalogue course with this name, if classmates already created it.
  const course = useMemo(() => courses.find((c) => c.name.toLowerCase() === courseName.trim().toLowerCase()) ?? null, [courses, courseName]);
  const coded = modules.filter((m) => m.code);

  async function finish() {
    const p = STUDY_PRESETS[preset];
    const windows = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 || d === 6 ? p.weekend : p.weekday]));
    setBusy(true);
    setError(null);
    try {
      // Add the course to the shared catalogue (signed-in users only).
      let courseRow = course;
      if (!courseRow && db.kind === 'cloud' && courseName.trim() && uniId !== 'other') {
        courseRow = await findOrCreateCourse(uniId, courseName).catch(() => null);
      }

      const base = {
        display_name: name.trim() || null,
        university: uniId === 'other' ? otherUni.trim() || null : university?.name,
        course: courseName.trim() || null,
        year: Number(year) || null,
        study_prefs: { ...DEFAULT_STUDY_PREFS, windows, maxDailyMinutes: hours * 60 },
        onboarded: false,
      };
      const ids = { university_id: uniId, course_id: courseRow?.id ?? null };
      try {
        await db.saveProfile({ ...base, ...ids });
      } catch (err) {
        // Before migration 003 the catalogue columns don't exist yet.
        if (!/university_id|course_id|column|schema cache/i.test(err.message)) throw err;
        await db.saveProfile(base);
      }

      await addModulesToProfile(db, [...picked.values()], modules);
      const all = (await db.list('modules')).filter((m) => m.code);

      // Share the list with the catalogue so classmates get it suggested.
      const profile = { ...ids, year: base.year };
      const bySource = { timetable: [], website: [], manual: [] };
      for (const m of all) bySource[picked.get(normalizeCode(m.code))?.source ?? 'timetable'].push(m);
      for (const [source, list] of Object.entries(bySource)) await contributeModules(db, profile, list, source);

      await db.saveProfile({ onboarded: true });
      await reloadModules();
      await reloadProfile();
    } catch (err) {
      setError(
        /profiles|schema cache/.test(err.message)
          ? 'The database needs updating first: run the files in supabase/migrations in the Supabase SQL Editor, then try again.'
          : err.message,
      );
      setBusy(false);
    }
  }

  const total = new Set([...picked.keys(), ...coded.map((m) => normalizeCode(m.code))]).size;

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-10 sm:py-16">
      <div className="pointer-events-none absolute -top-48 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark className="size-11" />
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Let's set up your semester</h1>
          <p className="text-muted">A few quick steps. You can change any of it later.</p>
        </div>

        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-700 text-white' : 'bg-subtle text-muted',
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm whitespace-nowrap md:inline', i === step ? 'font-medium' : 'text-muted')}>{s}</span>
              {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-emerald-500' : 'bg-line')} />}
            </li>
          ))}
        </ol>

        <Card className="overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
              {step === 0 && (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep(1);
                  }}
                >
                  <Field label="What should we call you?">
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={user?.email?.split('@')[0] ?? 'Your first name'} />
                  </Field>
                  <Nav next="Continue" />
                </form>
              )}

              {step === 1 && (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep(2);
                  }}
                >
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Where and what do you study?</h2>
                    <p className="text-sm text-muted">Alma uses this to find your modules and connect you with your course.</p>
                  </div>
                  <Field label="University or college">
                    <Select value={uniId} onChange={(e) => setUniId(e.target.value)}>
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {uniId === 'other' && (
                    <Field label="Name of your university or college">
                      <Input value={otherUni} onChange={(e) => setOtherUni(e.target.value)} />
                    </Field>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="Course" hint={course ? 'Classmates on this course already use Alma.' : courses.length ? 'Pick from the list or type your course name.' : undefined}>
                      <Input required value={courseName} onChange={(e) => setCourseName(e.target.value)} list="course-options" placeholder="e.g. Computer Science" />
                      <datalist id="course-options">
                        {courses.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Year">
                      <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Nav onBack={() => setStep(0)} next="Continue" />
                </form>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Your modules</h2>
                    <p className="text-sm text-muted">Pick whichever source is easiest. You can mix them.</p>
                  </div>
                  <ModuleFinder university={university} universities={universities} courseName={courseName} course={course} year={year} picked={picked} setPicked={setPicked} />
                  <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} next={total ? `Continue with ${total} module${total === 1 ? '' : 's'}` : 'Skip for now'} />
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">When do you like to study?</h2>
                    <p className="text-sm text-muted">The planner only schedules sessions in these hours.</p>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {Object.entries(STUDY_PRESETS).map(([id, p]) => (
                      <ChoiceCard key={id} selected={preset === id} onSelect={() => setPreset(id)} icon={p.icon} title={p.label} description={p.description} />
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Most study per day</span>
                      <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">{hours}h</span>
                    </div>
                    <input type="range" min="1" max="8" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="accent-indigo-600" />
                  </div>
                  {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
                  <Nav onBack={() => setStep(2)} onNext={finish} next={busy ? 'Setting up…' : 'Finish setup'} disabled={busy} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, next, disabled }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button variant="primary" type={onNext ? 'button' : 'submit'} onClick={onNext} disabled={disabled}>
        {next} <ArrowRight />
      </Button>
    </div>
  );
}
