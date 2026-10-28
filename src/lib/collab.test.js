import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('../supabase.js', () => ({ supabase: {} }));
const { applyBase64, colorFor, diffFor, fromBase64, toBase64 } = await import('./collab.js');
const { isNewer, pushElements, LOCAL } = await import('./boardSync.js');

describe('collab encoding', () => {
  it('round-trips bytes through base64, including large arrays', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('merges two people’s edits made from the same saved state', () => {
    const saved = new Y.Doc();
    saved.getArray('tasks').push(['Read chapter 3']);
    const snapshot = toBase64(Y.encodeStateAsUpdate(saved));

    const alice = new Y.Doc();
    const bob = new Y.Doc();
    applyBase64(alice, snapshot);
    applyBase64(bob, snapshot);
    alice.getArray('tasks').push(['Draw the diagram']);
    bob.getArray('tasks').push(['Write the intro']);

    // Each applies the other's state (what a save-with-merge does).
    applyBase64(alice, toBase64(Y.encodeStateAsUpdate(bob)));
    applyBase64(bob, toBase64(Y.encodeStateAsUpdate(alice)));
    expect(alice.getArray('tasks').toArray()).toEqual(bob.getArray('tasks').toArray());
    expect(alice.getArray('tasks').length).toBe(3);
  });

  it('sends a newcomer only what they are missing', () => {
    const peer = new Y.Doc();
    peer.getMap('board').set('a', { id: 'a', version: 1 });
    const newcomer = new Y.Doc();
    applyBase64(newcomer, toBase64(Y.encodeStateAsUpdate(peer)));
    const sv = toBase64(Y.encodeStateVector(newcomer));
    expect(diffFor(peer, sv)).toBeNull(); // already up to date
    peer.getMap('board').set('b', { id: 'b', version: 1 });
    applyBase64(newcomer, diffFor(peer, sv));
    expect(newcomer.getMap('board').has('b')).toBe(true);
  });

  it('gives each person a stable colour', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'));
    expect(colorFor('user-1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('board sync', () => {
  it('prefers higher versions, then lower nonce on ties', () => {
    expect(isNewer({ version: 2, versionNonce: 5 }, { version: 1, versionNonce: 1 })).toBe(true);
    expect(isNewer({ version: 1, versionNonce: 5 }, { version: 2, versionNonce: 1 })).toBe(false);
    expect(isNewer({ version: 3, versionNonce: 1 }, { version: 3, versionNonce: 9 })).toBe(true);
    expect(isNewer({ version: 3, versionNonce: 9 }, { version: 3, versionNonce: 9 })).toBe(false);
  });

  it('only writes elements that changed, tagged as local', () => {
    const doc = new Y.Doc();
    const map = doc.getMap('board');
    const origins = [];
    doc.on('update', (_u, origin) => origins.push(origin));
    expect(pushElements(doc, map, [{ id: 'r1', version: 1, versionNonce: 1 }])).toBe(1);
    expect(pushElements(doc, map, [{ id: 'r1', version: 1, versionNonce: 1 }])).toBe(0);
    expect(pushElements(doc, map, [{ id: 'r1', version: 2, versionNonce: 4 }])).toBe(1);
    expect(origins).toEqual([LOCAL, LOCAL]);
    expect(map.get('r1').version).toBe(2);
  });

  it('stores copies, so in-place edits by Excalidraw are still detected and sent', () => {
    const doc = new Y.Doc();
    const map = doc.getMap('board');
    const el = { id: 'r1', version: 1, versionNonce: 1, width: 0 };
    pushElements(doc, map, [el]);
    // Excalidraw mutates the same object while the user drags.
    Object.assign(el, { version: 2, versionNonce: 7, width: 230 });
    expect(pushElements(doc, map, [el])).toBe(1);
    expect(map.get('r1').width).toBe(230);
  });
});
