// Keeps an Excalidraw whiteboard and a Yjs map of its elements in step.
// Every Excalidraw element carries a version number; the higher version wins
// (ties broken by versionNonce, as Excalidraw does), so concurrent edits by
// different people settle on the same result everywhere.

export const LOCAL = Symbol('board-local');

// Should `next` replace `prev` in the shared map?
export function isNewer(next, prev) {
  if (!prev) return true;
  if (next.version !== prev.version) return next.version > prev.version;
  return next.versionNonce !== prev.versionNonce && next.versionNonce < prev.versionNonce;
}

// Excalidraw changes element objects in place while you drag, so the shared map
// must hold copies; otherwise later edits would look unchanged and never be sent.
const copy = (el) => structuredClone(el);

// Writes local elements that changed into the shared map, in one transaction.
export function pushElements(doc, map, elements) {
  const changed = elements.filter((el) => isNewer(el, map.get(el.id)));
  if (!changed.length) return 0;
  doc.transact(() => {
    for (const el of changed) map.set(el.id, copy(el));
  }, LOCAL);
  return changed.length;
}

// Connects a live Excalidraw instance (via its API) to the shared map.
export function bindBoard({ api, doc, map, reconcileElements, CaptureUpdateAction }) {
  const pull = (remote) => {
    const local = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: reconcileElements(local, remote.map(copy), api.getAppState()), captureUpdate: CaptureUpdateAction.NEVER });
  };
  pull([...map.values()]);

  const observer = (event, transaction) => {
    if (transaction.origin === LOCAL) return;
    const remote = [...event.keysChanged].map((k) => map.get(k)).filter(Boolean);
    if (remote.length) pull(remote);
  };
  map.observe(observer);

  return {
    // Call from Excalidraw's onChange.
    onChange: (elements) => pushElements(doc, map, elements),
    unbind: () => map.unobserve(observer),
  };
}
