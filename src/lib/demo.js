// Sample student data for the live demo on the portfolio site (#/demo).
// It only fills a browser that has no guest data yet, so it never overwrites real work.
import { localDb } from './db.js';
import { addCards } from './data.js';
import { prefs } from './prefs.js';
import { isoDate } from './time.js';

// Same key localDb uses for guest mode.
const LOCAL_KEY = 'campusloop_local_v2';

export async function enterDemo() {
  repairClassTimes();
  if (!localStorage.getItem(LOCAL_KEY)) await seedDemo();
  prefs.setGuest(true);
  history.replaceState(null, '', '#/');
}

// An earlier build of this demo saved class times as `start` and `end`, which crashed the dashboard.
// Copy them across so browsers that already loaded that demo recover without losing anything.
function repairClassTimes() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return;
    const db = JSON.parse(raw);
    let changed = false;
    for (const row of db.class_events ?? []) {
      if (!row.start_time && row.start) {
        row.start_time = row.start;
        row.end_time = row.end;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
  } catch {
    /* unreadable storage: nothing to repair */
  }
}

async function seedDemo() {
  const db = localDb();

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const termStart = isoDate(monday);
  const termEnd = isoDate(new Date(monday.getTime() + 120 * 24 * 60 * 60 * 1000));

  const logic = await db.insert('modules', { code: 'COMP10070', name: 'Formal Foundations 1', color: '#f97316' });
  const databases = await db.insert('modules', { code: 'DEMO1', name: 'Databases (sample)', color: '#0ea5e9' });

  const classes = [
    { title: 'Formal Foundations 1 lecture', kind: 'lecture', weekday: 1, start_time: '10:00', end_time: '11:00', module_id: logic.id, location: 'Lecture theatre' },
    { title: 'Formal Foundations 1 tutorial', kind: 'tutorial', weekday: 3, start_time: '14:00', end_time: '15:00', module_id: logic.id, location: 'Room 2' },
    { title: 'Databases lecture', kind: 'lecture', weekday: 2, start_time: '09:00', end_time: '10:00', module_id: databases.id, location: 'Lecture theatre' },
    { title: 'Databases lab', kind: 'lab', weekday: 4, start_time: '11:00', end_time: '13:00', module_id: databases.id, location: 'Computer lab' },
  ].map((c) => ({ ...c, start_date: termStart, end_date: termEnd }));
  await db.insert('class_events', classes);

  const proofs = await db.insert('decks', { title: 'Proofs and implication', module_id: logic.id });
  const sql = await db.insert('decks', { title: 'SQL basics', module_id: databases.id });

  await addCards(db, proofs.id, [
    { front: 'What is modus ponens?', back: 'From p → q and p, conclude q.', topic: 'Inference rules' },
    { front: 'What is modus tollens?', back: 'From p → q and ¬q, conclude ¬p.', topic: 'Inference rules' },
    { front: 'What does a conditional proof assume?', back: 'The left side of the implication, then derive the right side.', topic: 'Conditional proof' },
    { front: 'How do you prove ¬A by contradiction?', back: 'Assume A, derive a contradiction, then conclude ¬A.', topic: 'Indirect proof' },
    { front: 'What is hypothetical syllogism?', back: 'From p → q and q → r, conclude p → r.', topic: 'Inference rules' },
  ]);
  await addCards(db, sql.id, [
    { front: 'What does SELECT DISTINCT do?', back: 'Removes duplicate rows from the result.', topic: 'Queries' },
    { front: 'What is a primary key?', back: 'A column (or set) that uniquely identifies each row.', topic: 'Keys' },
    { front: 'What does a LEFT JOIN keep?', back: 'Every row from the left table, with NULLs where the right side has no match.', topic: 'Joins' },
  ]);

  // Give some cards a review history, so the weak-topic panel and due counts have something to show.
  const cards = await db.list('cards');
  const hard = new Set(['Conditional proof', 'Indirect proof']);
  for (const card of cards) {
    if (hard.has(card.topic)) {
      await db.update('cards', card.id, { reviews: 5, lapses: 2, reps: 1, interval_days: 1 });
    } else if (card.topic === 'Joins') {
      await db.update('cards', card.id, { reviews: 3, lapses: 1, reps: 1, interval_days: 1 });
    }
  }

  await db.saveProfile({
    onboarded: true,
    display_name: 'Sample student',
    university: 'University College Dublin',
    course: 'Computer Science',
    year: 1,
  });
}
