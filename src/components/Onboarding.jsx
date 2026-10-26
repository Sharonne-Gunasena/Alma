import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Moon, Sun, Sunrise } from 'lucide-react';
import { useApp } from '../context.js';
import TimetableImport from './TimetableImport.jsx';
import { DEFAULT_STUDY_PREFS } from '../lib/planner.js';
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
const STEPS = ['About you', 'Timetable', 'Study time'];

export default function Onboarding() {
  const { db, user, reloadProfile, modules } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ display_name: '', university: 'University College Dublin', course: '', year: 1 });
  const [preset, setPreset] = useState('allday');
  const [hours, setHours] = useState(4);
  const [imported, setImported] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function finish() {
    const p = STUDY_PRESETS[preset];
    const windows = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 || d === 6 ? p.weekend : p.weekday]));
    setBusy(true);
    try {
      await db.saveProfile({ ...form, year: Number(form.year) || null, study_prefs: { ...DEFAULT_STUDY_PREFS, windows, maxDailyMinutes: hours * 60 }, onboarded: true });
      await reloadProfile();
    } catch (err) {
      setError(
        /profiles|schema cache/.test(err.message)
          ? 'The database needs updating first: run supabase/migrations/002_campusloop.sql in the Supabase SQL Editor, then try again.'
          : err.message,
      );
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-10 sm:py-16">
      <div className="pointer-events-none absolute -top-48 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark className="size-11" />
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Let's set up your semester</h1>
          <p className="text-muted">Three quick steps. You can change any of it later.</p>
        </div>

        {/* Stepper */}
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-subtle text-muted',
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm sm:inline', i === step ? 'font-medium' : 'text-muted')}>{s}</span>
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
                    <Input autoFocus value={form.display_name} onChange={set('display_name')} placeholder={user?.email?.split('@')[0] ?? 'Your first name'} />
                  </Field>
                  <Field label="University">
                    <Input value={form.university} onChange={set('university')} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="Course">
                      <Input value={form.course} onChange={set('course')} placeholder="e.g. Computer Science" />
                    </Field>
                    <Field label="Year">
                      <Select value={form.year} onChange={set('year')}>
                        {[1, 2, 3, 4, 5].map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Nav next="Continue" />
                </form>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Import your timetable</h2>
                    <p className="text-sm text-muted">CampusLoop creates your modules from it, and never plans study during your classes.</p>
                  </div>
                  {imported ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                      <Check className="size-5" /> Imported {imported.classes} classes across {modules.length} modules.
                    </div>
                  ) : (
                    <TimetableImport onDone={setImported} />
                  )}
                  <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} next={imported ? 'Continue' : 'Skip for now'} />
                </div>
              )}

              {step === 2 && (
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
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{hours}h</span>
                    </div>
                    <input type="range" min="1" max="8" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="accent-indigo-600" />
                  </div>
                  {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
                  <Nav onBack={() => setStep(1)} onNext={finish} next={busy ? 'Setting up…' : 'Finish setup'} disabled={busy} />
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
