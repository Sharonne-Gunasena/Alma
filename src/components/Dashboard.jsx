import { useApp } from '../context.js';
import { usePlan } from '../lib/usePlan.js';
import { weakTopics } from '../lib/data.js';
import { eventOn, formatDue, formatHours, sameDay, startOfDay } from '../lib/time.js';
import { ModuleTag, SchemaHint, timeOf } from './bits.jsx';

export default function Dashboard() {
  const { profile, moduleById } = useApp();
  const { loading, error, plan, assignments = [], classEvents = [], cards = [], dueCount, logStudy } = usePlan();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading) return <p className="muted">Loading…</p>;

  const todayClasses = classEvents.filter((e) => eventOn(e, now)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const todaySessions = plan.sessions.filter((s) => sameDay(s.start, now));
  const upcoming = assignments
    .filter((a) => a.status !== 'done' && new Date(a.due_at) < new Date(startOfDay(now).getTime() + 14 * 864e5))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const weak = weakTopics(cards, 4);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>
            {greeting}
            {profile?.display_name ? `, ${profile.display_name}` : ''}
          </h1>
          <p className="muted">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <a className="button mobile-only" href="#/settings">
          ⚙️
        </a>
      </header>
      <SchemaHint error={error} />

      {plan.warnings.length > 0 && (
        <div className="alert stack tight">
          {plan.warnings.slice(0, 3).map((w) => (
            <p key={w.assignmentId}>
              {w.kind === 'overdue' ? (
                <>
                  ⚠️ <b>{w.title}</b> is overdue with {formatHours(w.minutes)} of work left. Update its deadline or mark it done in the Planner.
                </>
              ) : (
                <>
                  ⚠️ <b>{w.title}</b> needs {formatHours(w.minutes)} more than your free time before {formatDue(w.deadline)}. Add study hours,
                  reduce the estimate, or start now.
                </>
              )}
            </p>
          ))}
          <a href="#/planner">Open the planner →</a>
        </div>
      )}

      <div className="stats">
        <a className="stat" href="#/study?mode=due">
          <b>{dueCount}</b>
          <span>cards due</span>
        </a>
        <a className="stat" href="#/planner">
          <b>{upcoming.length}</b>
          <span>deadlines in 2 weeks</span>
        </a>
        <div className="stat">
          <b>{formatHours(plan.stats.remainingMinutes)}</b>
          <span>work left</span>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card stack tight">
          <h2>Today's plan</h2>
          {todayClasses.length === 0 && todaySessions.length === 0 && <p className="muted">Nothing scheduled. Enjoy the free time!</p>}
          <ul className="timeline">
            {[
              ...todayClasses.map((c) => ({ kind: 'class', start: c.start_time, end: c.end_time, c })),
              ...todaySessions.map((s) => ({ kind: s.kind, start: timeOf(s.start), end: timeOf(s.end), s })),
            ]
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((item, i) => (
                <li key={i} className={`tl-${item.kind}`}>
                  <span className="tl-time">
                    {item.start}–{item.end}
                  </span>
                  {item.kind === 'class' && (
                    <span>
                      <ModuleTag moduleId={item.c.module_id} /> {moduleById(item.c.module_id)?.name ?? item.c.title} · {item.c.kind}
                      {item.c.location && <small className="muted"> · {item.c.location}</small>}
                    </span>
                  )}
                  {item.kind === 'review' && (
                    <span>
                      Flashcard review · <a href="#/study?mode=due">{dueCount} due</a>
                    </span>
                  )}
                  {item.kind === 'task' && (
                    <span className="grow row between">
                      <span>
                        <ModuleTag moduleId={item.s.module_id} /> Work on <b>{item.s.title}</b>
                      </span>
                      <button className="small" onClick={() => logStudy(item.s.assignmentId, (item.s.end - item.s.start) / 60000)}>
                        ✓ Done
                      </button>
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>

        <section className="card stack tight">
          <h2>Upcoming deadlines</h2>
          {upcoming.length === 0 ? (
            <p className="muted">
              No deadlines in the next two weeks. <a href="#/planner">Add one</a>
            </p>
          ) : (
            <ul className="plain list">
              {upcoming.slice(0, 6).map((a) => {
                const pct = Math.min(100, Math.round(((a.hours_done ?? 0) / (a.effort_hours || 1)) * 100));
                return (
                  <li key={a.id}>
                    <div className="row between">
                      <span>
                        <ModuleTag moduleId={a.module_id} /> {a.title}
                      </span>
                      <span className={`small ${new Date(a.due_at) < now ? 'error' : 'muted'}`}>{formatDue(new Date(a.due_at))}</span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card stack tight">
          <h2>Topics to work on</h2>
          {weak.length === 0 ? (
            <p className="muted">Study some flashcards and CampusLoop will spot the topics you find hardest.</p>
          ) : (
            <ul className="plain list">
              {weak.map((t) => (
                <li key={t.topic} className="row between">
                  <span>
                    {t.topic} <small className="muted">· {Math.round(t.accuracy * 100)}% recall</small>
                  </span>
                  <a className="small" href={`#/decks/${t.deck_id}/study?mode=topic&topic=${encodeURIComponent(t.topic)}`}>
                    Practise
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card stack tight">
          <h2>Quick actions</h2>
          <div className="actions">
            <a className="button" href="#/create">
              📄 Lecture → flashcards
            </a>
            <a className="button" href="#/planner?new=1">
              ➕ Add a deadline
            </a>
            <a className="button" href="#/timetable">
              ⏰ Timetable
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
