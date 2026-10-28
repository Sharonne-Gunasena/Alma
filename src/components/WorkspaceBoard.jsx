// The shared whiteboard (Excalidraw), synced through the workspace's Yjs document.
// Loaded on its own because Excalidraw is large.
import { useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, reconcileElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { bindBoard } from '../lib/boardSync.js';

const UI_OPTIONS = {
  // Images aren't synced (they'd be too large for live messages); use the Files tab instead.
  tools: { image: false },
  canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } },
};

export default function WorkspaceBoard({ doc, name }) {
  const [api, setApi] = useState(null);
  const binding = useRef(null);
  const dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    if (!api) return;
    binding.current = bindBoard({ api, doc, map: doc.getMap('board'), reconcileElements, CaptureUpdateAction });
    return () => {
      binding.current?.unbind();
      binding.current = null;
    };
  }, [api, doc]);

  return (
    <div className="h-[72vh] min-h-[420px] overflow-hidden rounded-2xl border border-line">
      <Excalidraw
        excalidrawAPI={setApi}
        onChange={(elements) => binding.current?.onChange(elements)}
        theme={dark ? 'dark' : 'light'}
        name={name}
        UIOptions={UI_OPTIONS}
        // White canvas: Excalidraw's dark theme inverts it itself.
        initialData={{ appState: { viewBackgroundColor: '#ffffff' } }}
      />
    </div>
  );
}
