// Module hub calls to Supabase. Who can read, share and vote is enforced by the
// rules in migration 007; this file only shapes the requests.
import { supabase } from '../supabase.js';
import { addCards } from './data.js';
import { deckPayload } from './hubRules.js';
import { sections } from './guides.js';

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export const HUB_MIGRATION_HINT = 'The database needs updating for module hubs: run supabase/migrations/007_module_hubs.sql in the Supabase SQL Editor.';
export const needsHubMigration = (err) => /hub_|takes_module|my_contribution|schema cache|could not find the function/i.test(err?.message ?? '');

export const hubApi = {
  list: async (catalogId) => check(await supabase.rpc('hub_list', { p_catalog: catalogId })),
  contributors: async (catalogId) => check(await supabase.rpc('hub_contributors', { p_catalog: catalogId })),
  counts: async () => check(await supabase.rpc('hub_counts')),
  mine: async () => (check(await supabase.rpc('my_contribution')) ?? [])[0] ?? { items: 0, helpful: 0, copies: 0, points: 0 },
  payload: async (id) => check(await supabase.from('hub_items').select('payload').eq('id', id).single()).payload,

  async vote(itemId, value, current) {
    if (value === current) check(await supabase.from('hub_votes').delete().eq('item_id', itemId));
    else check(await supabase.from('hub_votes').upsert({ item_id: itemId, value }, { onConflict: 'item_id,user_id' }));
  },

  async remove(itemId) {
    check(await supabase.from('hub_items').delete().eq('id', itemId));
  },

  // Shares (or re-shares, updating the existing item) a deck or guide.
  async publish({ userId, kind, sourceId, catalogId, title, description, payload, itemCount }) {
    const existing = check(await supabase.from('hub_items').select('id').eq('author_id', userId).eq('kind', kind).eq('source_id', sourceId).maybeSingle());
    const content = { title, description: description || null, payload, item_count: itemCount, updated_at: new Date().toISOString() };
    if (existing) {
      check(await supabase.from('hub_items').update(content).eq('id', existing.id));
      return { id: existing.id, updated: true };
    }
    const row = check(await supabase.from('hub_items').insert({ ...content, kind, source_id: sourceId, catalog_module_id: catalogId }).select('id').single());
    return { id: row.id, updated: false };
  },

  shareDeck: (userId, deck, cards, catalogId, description) => {
    const payload = deckPayload(cards);
    return hubApi.publish({ userId, kind: 'deck', sourceId: deck.id, catalogId, title: deck.title, description, payload, itemCount: payload.cards.length });
  },

  shareGuide: (userId, guide, catalogId, description) =>
    hubApi.publish({
      userId,
      kind: 'guide',
      sourceId: guide.id,
      catalogId,
      title: guide.title,
      description,
      payload: { content: guide.content },
      itemCount: sections(guide.content).filter((s) => s.level > 0).length,
    }),

  // Copies an item into the student's own decks or guides; returns where to go.
  async copy(db, item, moduleId) {
    const payload = await hubApi.payload(item.id);
    let path;
    if (item.kind === 'deck') {
      const deck = await db.insert('decks', { title: item.title, module_id: moduleId ?? null });
      await addCards(db, deck.id, payload.cards ?? []);
      path = `/decks/${deck.id}`;
    } else {
      const guide = await db.insert('guides', { title: item.title, module_id: moduleId ?? null, template: 'hub', content: payload.content, updated_at: new Date().toISOString() });
      path = `/guides/${guide.id}`;
    }
    await supabase.rpc('hub_record_copy', { p_item: item.id });
    return path;
  },
};
