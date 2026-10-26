// Domain-level helpers on top of the table API in db.js.
import { isDue } from './srs.js';

const byCreated = (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '');

// A card counts as "mastered" once its review interval reaches three weeks.
export const MASTERED_DAYS = 21;

export async function listDecks(db, filters = {}) {
  const [decks, cards] = await Promise.all([db.list('decks', filters), db.list('cards', {}, 'id, deck_id, due, interval_days')]);
  return decks.sort(byCreated).map((d) => {
    const own = cards.filter((c) => c.deck_id === d.id);
    return {
      ...d,
      card_count: own.length,
      due_count: own.filter((c) => isDue(c)).length,
      mastered_count: own.filter((c) => (c.interval_days ?? 0) >= MASTERED_DAYS).length,
    };
  });
}

export function newCard(deckId, card) {
  return {
    deck_id: deckId,
    front: card.front,
    back: card.back,
    type: card.type ?? 'basic',
    topic: card.topic ?? null,
    source_page: card.page ?? card.source_page ?? null,
    material_id: card.material_id ?? null,
    ease: 2.5,
    interval_days: 0,
    reps: 0,
    lapses: 0,
    reviews: 0,
    due: new Date().toISOString(),
  };
}

export async function addCards(db, deckId, cards) {
  if (cards.length) await db.insert('cards', cards.map((c) => newCard(deckId, c)));
}

// Pages are stored joined by form-feed characters so they can be split back
// apart for page references without a separate table.
export const PAGE_BREAK = '\f';

export async function saveMaterial(db, { name, file, pages, moduleId, guide }) {
  const storage_path = file ? await db.uploadFile(name, file) : null;
  return db.insert('materials', {
    name,
    storage_path,
    module_id: moduleId ?? null,
    text_content: pages.map((p) => p.text).join(PAGE_BREAK),
    page_count: pages.length,
    guide: guide ?? null,
  });
}

export function materialPages(material) {
  return (material.text_content ?? '').split(PAGE_BREAK).map((text, i) => ({ page: i + 1, text }));
}

export async function deleteMaterial(db, material) {
  if (material.storage_path) await db.removeFile(material.storage_path);
  await db.remove('materials', material.id);
}

export const MODULE_COLORS = ['#4f5bd5', '#e5534b', '#2f9e5a', '#d4881e', '#3b82c4', '#9b59b6', '#16a2a2', '#c2185b'];

// Saves parsed timetable slots, creating a module for each new module code.
export async function importTimetable(db, slots, modules) {
  const byCode = new Map(modules.filter((m) => m.code).map((m) => [m.code, m]));
  let colorIndex = modules.length;
  for (const slot of slots) {
    if (slot.code && !byCode.has(slot.code)) {
      const created = await db.insert('modules', {
        code: slot.code,
        name: slot.module_name,
        color: MODULE_COLORS[colorIndex++ % MODULE_COLORS.length],
      });
      byCode.set(slot.code, created);
    }
  }
  const existing = await db.list('class_events');
  const key = (e) => [e.title, e.weekday, e.start_time, e.end_time].join('|');
  const seen = new Set(existing.map(key));
  const rows = slots
    .filter((s) => !seen.has(key(s)))
    .map((s) => ({
      title: s.title,
      kind: s.kind,
      location: s.location || null,
      weekday: s.weekday,
      start_time: s.start_time,
      end_time: s.end_time,
      start_date: s.start_date,
      end_date: s.end_date,
      module_id: s.code ? byCode.get(s.code).id : null,
    }));
  if (rows.length) await db.insert('class_events', rows);
  return { classes: rows.length, modules: byCode.size };
}

export async function listModules(db) {
  return (await db.list('modules')).sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
}

// Accuracy per topic, worst first: "you keep missing eigenvalues".
export function weakTopics(cards, limit = 5) {
  const topics = new Map();
  for (const c of cards) {
    if (!c.topic || !c.reviews) continue;
    const t = topics.get(c.topic) ?? { topic: c.topic, reviews: 0, lapses: 0, due: 0, deck_id: c.deck_id };
    t.reviews += c.reviews;
    t.lapses += c.lapses ?? 0;
    if (isDue(c)) t.due += 1;
    topics.set(c.topic, t);
  }
  return [...topics.values()]
    .filter((t) => t.reviews >= 3 && t.lapses > 0)
    .map((t) => ({ ...t, accuracy: 1 - t.lapses / t.reviews }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
