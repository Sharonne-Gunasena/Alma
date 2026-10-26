// A small table API with two backends: Supabase for signed-in users and
// localStorage for guests. Everything above this file is backend-agnostic.
import { supabase } from '../supabase.js';
import { MATERIALS_BUCKET } from '../config.js';

export const TABLES = ['modules', 'decks', 'cards', 'materials', 'class_events', 'assignments', 'profiles'];

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function applyFilters(query, filters) {
  for (const [col, val] of Object.entries(filters)) query = val === null ? query.is(col, null) : query.eq(col, val);
  return query;
}

export function cloudDb(user) {
  return {
    kind: 'cloud',
    userId: user.id,

    async list(table, filters = {}, columns = '*') {
      return check(await applyFilters(supabase.from(table).select(columns), filters));
    },

    async get(table, id) {
      return check(await supabase.from(table).select('*').eq('id', id).single());
    },

    async insert(table, rows) {
      const many = Array.isArray(rows);
      const data = check(await supabase.from(table).insert(many ? rows : [rows]).select());
      return many ? data : data[0];
    },

    async update(table, id, patch) {
      check(await supabase.from(table).update(patch).eq('id', id));
    },

    async remove(table, id) {
      check(await supabase.from(table).delete().eq('id', id));
    },

    async getProfile() {
      return check(await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle());
    },

    async saveProfile(patch) {
      check(await supabase.from('profiles').upsert({ user_id: user.id, ...patch }));
    },

    async uploadFile(name, file) {
      const path = `${user.id}/${crypto.randomUUID()}-${name.replace(/[^\w.-]+/g, '_')}`;
      const { error } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      return path;
    },

    async fileUrl(path) {
      return check(await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(path, 300)).signedUrl;
    },

    async removeFile(path) {
      await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
    },
  };
}

// ---------- Guest mode: everything in one localStorage entry ----------

const LOCAL_KEY = 'campusloop_local_v2';
const LEGACY_KEY = 'sf_local_v1';

function load() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
    // Carry over decks made with the first version of the site.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return { ...emptyDb(), ...JSON.parse(legacy) };
  } catch {
    /* fall through */
  }
  return emptyDb();
}

function emptyDb() {
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}

function save(db) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
  } catch {
    throw new Error('Could not save on this device. Browser storage may be full or blocked.');
  }
}

const matches = (row, filters) => Object.entries(filters).every(([k, v]) => (row[k] ?? null) === v);

export function localDb() {
  return {
    kind: 'local',
    userId: 'local',

    async list(table, filters = {}) {
      return load()[table].filter((r) => matches(r, filters));
    },

    async get(table, id) {
      const row = load()[table].find((r) => r.id === id);
      if (!row) throw new Error('Not found');
      return row;
    },

    async insert(table, rows) {
      const db = load();
      const many = Array.isArray(rows);
      const created = (many ? rows : [rows]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      db[table].push(...created);
      save(db);
      return many ? created : created[0];
    },

    async update(table, id, patch) {
      const db = load();
      const row = db[table].find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      save(db);
    },

    async remove(table, id) {
      const db = load();
      db[table] = db[table].filter((r) => r.id !== id);
      // Mirror the cascades the cloud database does.
      if (table === 'decks') db.cards = db.cards.filter((c) => c.deck_id !== id);
      if (table === 'modules')
        for (const t of ['decks', 'materials', 'class_events', 'assignments'])
          db[t].forEach((r) => r.module_id === id && (r.module_id = null));
      save(db);
    },

    async getProfile() {
      return load().profiles[0] ?? null;
    },

    async saveProfile(patch) {
      const db = load();
      db.profiles = [{ ...(db.profiles[0] ?? { user_id: 'local' }), ...patch }];
      save(db);
    },

    // Guests keep only extracted text: original files are too big for browser storage.
    async uploadFile() {
      return null;
    },
    async fileUrl() {
      return null;
    },
    async removeFile() {},
  };
}
