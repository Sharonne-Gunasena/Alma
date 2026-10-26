// One data API with two backends: Supabase for signed-in users, and
// localStorage for people trying the site without an account.
import { supabase } from '../supabase.js';
import { MATERIALS_BUCKET } from '../config.js';
import { isDue } from './srs.js';

const now = () => new Date().toISOString();

function summarise(deck, cards) {
  return { ...deck, card_count: cards.length, due_count: cards.filter((c) => isDue(c)).length };
}

function newCard(deckId, { front, back }) {
  return { deck_id: deckId, front, back, ease: 2.5, interval_days: 0, reps: 0, due: now() };
}

// ---------- Supabase ----------

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export function supabaseStore(user) {
  return {
    kind: 'cloud',

    async listDecks() {
      const decks = check(
        await supabase.from('decks').select('id, title, created_at, cards(due)').order('created_at', { ascending: false }),
      );
      return decks.map(({ cards, ...deck }) => summarise(deck, cards));
    },

    async getDeck(id) {
      return check(await supabase.from('decks').select('id, title, created_at').eq('id', id).single());
    },

    async createDeck(title) {
      return check(await supabase.from('decks').insert({ title }).select().single());
    },

    async renameDeck(id, title) {
      check(await supabase.from('decks').update({ title }).eq('id', id));
    },

    async deleteDeck(id) {
      check(await supabase.from('decks').delete().eq('id', id));
    },

    async listCards(deckId) {
      return check(await supabase.from('cards').select('*').eq('deck_id', deckId).order('created_at'));
    },

    async addCards(deckId, cards) {
      if (!cards.length) return;
      check(await supabase.from('cards').insert(cards.map((c) => newCard(deckId, c))));
    },

    async updateCard(id, patch) {
      check(await supabase.from('cards').update(patch).eq('id', id));
    },

    async deleteCard(id) {
      check(await supabase.from('cards').delete().eq('id', id));
    },

    async listMaterials() {
      return check(
        await supabase
          .from('materials')
          .select('id, name, storage_path, created_at')
          .order('created_at', { ascending: false }),
      );
    },

    async getMaterialText(id) {
      return check(await supabase.from('materials').select('text_content').eq('id', id).single()).text_content;
    },

    async saveMaterial({ name, file, text }) {
      let storage_path = null;
      if (file) {
        const safe = name.replace(/[^\w.-]+/g, '_');
        storage_path = `${user.id}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from(MATERIALS_BUCKET).upload(storage_path, file, {
          contentType: file.type || undefined,
        });
        if (error) throw new Error(`Upload failed: ${error.message}`);
      }
      return check(await supabase.from('materials').insert({ name, storage_path, text_content: text }).select('id').single());
    },

    async materialUrl(storagePath) {
      const data = check(await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(storagePath, 300));
      return data.signedUrl;
    },

    async deleteMaterial(material) {
      if (material.storage_path) await supabase.storage.from(MATERIALS_BUCKET).remove([material.storage_path]);
      check(await supabase.from('materials').delete().eq('id', material.id));
    },
  };
}

// ---------- This device only ----------

const LOCAL_KEY = 'sf_local_v1';

function load() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return { decks: [], cards: [], materials: [] };
}

function save(db) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
  } catch {
    throw new Error('Could not save on this device. Browser storage may be full or blocked.');
  }
}

function mutate(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function localStore() {
  return {
    kind: 'local',

    async listDecks() {
      const db = load();
      return db.decks
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((d) => summarise(d, db.cards.filter((c) => c.deck_id === d.id)));
    },

    async getDeck(id) {
      const deck = load().decks.find((d) => d.id === id);
      if (!deck) throw new Error('Deck not found');
      return deck;
    },

    async createDeck(title) {
      return mutate((db) => {
        const deck = { id: crypto.randomUUID(), title, created_at: now() };
        db.decks.push(deck);
        return deck;
      });
    },

    async renameDeck(id, title) {
      mutate((db) => {
        db.decks.find((d) => d.id === id).title = title;
      });
    },

    async deleteDeck(id) {
      mutate((db) => {
        db.decks = db.decks.filter((d) => d.id !== id);
        db.cards = db.cards.filter((c) => c.deck_id !== id);
      });
    },

    async listCards(deckId) {
      return load().cards.filter((c) => c.deck_id === deckId);
    },

    async addCards(deckId, cards) {
      mutate((db) => {
        for (const c of cards) db.cards.push({ id: crypto.randomUUID(), created_at: now(), ...newCard(deckId, c) });
      });
    },

    async updateCard(id, patch) {
      mutate((db) => {
        Object.assign(db.cards.find((c) => c.id === id), patch);
      });
    },

    async deleteCard(id) {
      mutate((db) => {
        db.cards = db.cards.filter((c) => c.id !== id);
      });
    },

    async listMaterials() {
      return load().materials.map(({ text_content, ...m }) => m);
    },

    async getMaterialText(id) {
      return load().materials.find((m) => m.id === id)?.text_content ?? '';
    },

    // Original files are too big for browser storage, so guests keep only the text.
    async saveMaterial({ name, text }) {
      return mutate((db) => {
        const material = { id: crypto.randomUUID(), name, storage_path: null, text_content: text, created_at: now() };
        db.materials.push(material);
        return { id: material.id };
      });
    },

    async materialUrl() {
      return null;
    },

    async deleteMaterial(material) {
      mutate((db) => {
        db.materials = db.materials.filter((m) => m.id !== material.id);
      });
    },
  };
}
