// Live collaboration for workspaces: one Yjs document per workspace (whiteboard,
// notes and tasks), kept in sync between members over a *private* Supabase
// Realtime channel and saved to the `workspace_state` table.
//
// Yjs updates merge in any order, so:
//   - local edits are broadcast as small updates (batched to limit message rate),
//   - someone joining asks peers for anything newer than what they loaded,
//   - saving first merges whatever others saved, so no one's changes are lost.
import * as Y from 'yjs';
import { supabase } from '../supabase.js';

// ---------- Encoding helpers (pure, tested) ----------

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function applyBase64(doc, b64, origin) {
  if (b64) Y.applyUpdate(doc, fromBase64(b64), origin);
}

// Everything in `doc` that a peer with state vector `sv` hasn't seen, or null if nothing.
export function diffFor(doc, svBase64) {
  const update = Y.encodeStateAsUpdate(doc, svBase64 ? fromBase64(svBase64) : undefined);
  // An empty update is 2 bytes (no structs, no deletes).
  return update.length > 2 ? toBase64(update) : null;
}

const SEND_EVERY_MS = 120;
const SAVE_AFTER_MS = 2500;
const COLORS = ['#f97316', '#ef4444', '#0ea5e9', '#d97706', '#e11d48', '#0284c7', '#ea580c', '#16a34a'];
export const colorFor = (id) => COLORS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

// ---------- The provider ----------

export class WorkspaceSync {
  constructor({ workspaceId, doc, me, onStatus = () => {}, onPeers = () => {} }) {
    Object.assign(this, { workspaceId, doc, me, onStatus, onPeers });
    this.outbox = [];
    this.sendTimer = null;
    this.saveTimer = null;
    this.stopped = false;
    this.onUpdate = (update, origin) => {
      if (origin === this) return; // came from the network or the database
      this.outbox.push(update);
      this.sendTimer ??= setTimeout(() => this.flushOutbox(), SEND_EVERY_MS);
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), SAVE_AFTER_MS);
    };
  }

  async start() {
    this.onStatus('loading');
    const { data, error } = await supabase.from('workspace_state').select('state').eq('workspace_id', this.workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    applyBase64(this.doc, data?.state, this);
    this.doc.on('update', this.onUpdate);
    if (this.stopped) return;

    this.channel = supabase
      .channel(`ws:${this.workspaceId}`, { config: { private: true, broadcast: { self: false }, presence: { key: this.me.id } } })
      .on('broadcast', { event: 'update' }, ({ payload }) => applyBase64(this.doc, payload.u, this))
      .on('broadcast', { event: 'sync-request' }, ({ payload }) => {
        const diff = diffFor(this.doc, payload.sv);
        if (diff) this.channel.send({ type: 'broadcast', event: 'update', payload: { u: diff } });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        this.onPeers(Object.entries(state).map(([id, metas]) => ({ id, ...metas[0] })));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.onStatus('live');
          await this.channel.track({ name: this.me.name, color: colorFor(this.me.id) });
          this.channel.send({ type: 'broadcast', event: 'sync-request', payload: { sv: toBase64(Y.encodeStateVector(this.doc)) } });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.onStatus('offline');
        }
      });
  }

  flushOutbox() {
    this.sendTimer = null;
    if (!this.outbox.length || !this.channel) return;
    const merged = Y.mergeUpdates(this.outbox.splice(0));
    this.channel.send({ type: 'broadcast', event: 'update', payload: { u: toBase64(merged) } });
  }

  async save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      // Merge what others have saved first, then store the combined document.
      const { data } = await supabase.from('workspace_state').select('state').eq('workspace_id', this.workspaceId).maybeSingle();
      applyBase64(this.doc, data?.state, this);
      const { error } = await supabase
        .from('workspace_state')
        .upsert({ workspace_id: this.workspaceId, state: toBase64(Y.encodeStateAsUpdate(this.doc)), updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      this.onStatus(this.channel ? 'live' : 'saved');
    } catch {
      this.onStatus('offline');
    }
  }

  async stop() {
    this.stopped = true;
    this.doc.off('update', this.onUpdate);
    clearTimeout(this.sendTimer);
    this.flushOutbox();
    if (this.saveTimer) await this.save();
    if (this.channel) await supabase.removeChannel(this.channel);
  }
}
