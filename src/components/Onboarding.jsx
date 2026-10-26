import { useState } from 'react';
import { useApp } from '../context.js';
import TimetableImport from './TimetableImport.jsx';
import { DEFAULT_STUDY_PREFS } from '../lib/planner.js';

const STUDY_PRESETS = {
  daytime: { label: 'Daytime (9:00–18:00)', weekday: [[540, 1080]], weekend: [[660, 960]] },
  evening: { label: 'Evenings (17:00–22:00)', weekday: [[1020, 1320]], weekend: [[600, 1080]] },
  allday: { label: 'Flexible (9:00–21:00)', weekday: [[540, 1260]], weekend: [[600, 1080]] },
};

export default function Onboarding() {
  const { db, user, reloadProfile, modules } = useApp();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ display_name: '', university: 'University College Dublin', course: '', year: 1 });
  const [preset, setPreset] = useState('allday');
  const [hours, setHours] = useState(4);
  const [imported, setImported] = useState(null);
  const [error, setError] = useState(null);

  async function finish() {
    const p = STUDY_PRESETS[preset];
    const windows = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 || d === 6 ? p.weekend : p.weekday]));
    try {
      await db.saveProfile({
        ...form,
        year: Number(form.year) || null,
        study_prefs: { ...DEFAULT_STUDY_PREFS, windows, maxDailyMinutes: hours * 60 },
        onboarded: true,
      });
      await reloadProfile();
    } catch (err) {
      setError(
        /profiles|schema cache/.test(err.message)
          ? 'The database needs updating first: run supabase/migrations/002_campusloop.sql in the Supabase SQL Editor, then try again.'
          : err.message,
      );
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="onboarding">
      <h1>
        <span className="logo-mark">◎</span> Welcome to CampusLoop
      </h1>
      <ol className="steps">
        {['About you', 'Timetable', 'Study time'].map((s, i) => (
          <li key={s} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}>
            {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <label>
            What should we call you?
            <input value={form.display_name} onChange={set('display_name')} placeholder={user?.email?.split('@')[0] ?? 'Your name'} />
          </label>
          <label>
            University
            <input value={form.university} onChange={set('university')} />
          </label>
          <div className="two">
            <label>
              Course
              <input value={form.course} onChange={set('course')} placeholder="e.g. Computer Science" />
            </label>
            <label>
              Year
              <select value={form.year} onChange={set('year')}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <button className="primary">Next</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="card stack">
          <p>Import your class timetable. CampusLoop creates your modules from it and plans study time around your classes.</p>
          {imported ? (
            <p className="ok">
              ✓ Imported {imported.classes} classes across {modules.length} modules.
            </p>
          ) : (
            <TimetableImport onDone={setImported} />
          )}
          <div className="row">
            <button onClick={() => setStep(1)}>Back</button>
            <button className="primary" onClick={() => setStep(3)}>
              {imported ? 'Next' : 'Skip for now'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <p>When do you usually study? The planner only schedules sessions in these hours, and never during classes.</p>
          <div className="stack tight">
            {Object.entries(STUDY_PRESETS).map(([id, p]) => (
              <label key={id} className="check">
                <input type="radio" checked={preset === id} onChange={() => setPreset(id)} /> {p.label}
              </label>
            ))}
          </div>
          <label>
            Most hours of study per day: {hours}
            <input type="range" min="1" max="8" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </label>
          <p className="muted small">You can fine-tune this per day later in the Planner.</p>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button onClick={() => setStep(2)}>Back</button>
            <button className="primary" onClick={finish}>
              Finish setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
