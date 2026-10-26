// A week calendar: day columns, hour rows, and positioned blocks.
// With onCreate, dragging on empty space (or tapping, on touch screens)
// creates a block, snapped to 15 minutes.
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from './cn.js';
import { fromMinutes } from '../lib/time.js';

const SNAP = 15;
const PX = 0.9; // pixels per minute

export function TimeGrid({ columns, blocks, startMin = 8 * 60, endMin = 20 * 60, onCreate, nowMin }) {
  const from = Math.floor(startMin / 60) * 60;
  const to = Math.ceil(endMin / 60) * 60;
  const height = (to - from) * PX;
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);

  const minuteAt = (e, el) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    return Math.min(to, Math.max(from, from + Math.round(y / PX / SNAP) * SNAP));
  };

  function down(e, col) {
    if (!onCreate || e.target.closest('[data-block]')) return;
    const m = minuteAt(e, e.currentTarget);
    if (e.pointerType === 'touch') {
      // Tapping on touch screens creates a one-hour block instead of dragging, so scrolling still works.
      onCreate(col, m, Math.min(to, m + 60));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { col, start: m };
    setDraft({ col, start: m, end: m + SNAP });
  }

  function move(e) {
    if (!drag.current) return;
    const m = minuteAt(e, e.currentTarget);
    const { col, start } = drag.current;
    setDraft({ col, start: Math.min(start, m), end: Math.max(start + SNAP, m) });
  }

  function up() {
    if (!drag.current) return;
    const d = draft;
    drag.current = null;
    setDraft(null);
    if (d && d.end - d.start >= SNAP) onCreate(d.col, d.start, d.end === d.start + SNAP ? d.start + 60 : d.end);
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] gap-x-1.5" style={{ gridTemplateColumns: `44px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div />
        {columns.map((c) => (
          <div key={c.key} className="flex flex-col items-center pb-2">
            <span className={cn('text-xs font-medium', c.today ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted')}>{c.label}</span>
            {c.sub != null && (
              <span className={cn('mt-0.5 grid size-7 place-items-center rounded-full text-sm font-semibold', c.today ? 'bg-indigo-600 text-white' : 'text-fg')}>{c.sub}</span>
            )}
          </div>
        ))}

        <div className="relative" style={{ height }}>
          {Array.from({ length: (to - from) / 60 }, (_, i) => (
            <span key={i} className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-muted" style={{ top: i * 60 * PX }}>
              {i === 0 ? '' : fromMinutes(from + i * 60)}
            </span>
          ))}
        </div>

        {columns.map((c, ci) => (
          <div
            key={c.key}
            onPointerDown={(e) => down(e, ci)}
            onPointerMove={move}
            onPointerUp={up}
            className={cn('relative rounded-xl border border-line', c.today ? 'bg-soft/40' : 'bg-subtle/40', onCreate && 'cursor-crosshair')}
            style={{
              height,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX - 1}px, var(--cl-line) ${60 * PX - 1}px, var(--cl-line) ${60 * PX}px)`,
            }}
          >
            {blocks
              .filter((b) => b.col === ci)
              .map((b, i) => (
                <Block key={b.id ?? i} block={b} from={from} />
              ))}
            {c.today && nowMin != null && nowMin > from && nowMin < to && (
              <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMin - from) * PX }}>
                <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                <span className="h-px flex-1 bg-rose-500" />
              </div>
            )}
            {draft?.col === ci && (
              <div
                className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-500/10 px-2 py-1 font-mono text-[11px] text-indigo-700 dark:text-indigo-300"
                style={{ top: (draft.start - from) * PX, height: Math.max(SNAP, draft.end - draft.start) * PX }}
              >
                {fromMinutes(draft.start)}–{fromMinutes(draft.end)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const STYLES = {
  class: 'bg-[color-mix(in_srgb,var(--c)_14%,var(--cl-card))] border-l-[3px] border-[var(--c)] text-fg',
  session: 'bg-indigo-600 text-white shadow-glow hover:bg-indigo-500',
  review: 'bg-emerald-500/15 border-l-[3px] border-emerald-500 text-emerald-900 dark:text-emerald-200',
  busy: 'border border-dashed border-slate-400/60 text-muted [background:repeating-linear-gradient(135deg,transparent_0,transparent_6px,rgb(148_163_184/0.15)_6px,rgb(148_163_184/0.15)_12px)]',
};

function Block({ block, from }) {
  const top = (block.start - from) * PX;
  const h = Math.max(20, (block.end - block.start) * PX - 2);
  const Tag = block.onClick ? motion.button : motion.div;
  return (
    <Tag
      data-block
      type={block.onClick ? 'button' : undefined}
      onClick={block.onClick}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={block.onClick ? { scale: 1.02 } : undefined}
      title={block.tooltip}
      className={cn('absolute inset-x-1 z-10 flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] leading-tight transition-colors', STYLES[block.kind])}
      style={{ top, height: h, '--c': block.color ?? '#6366f1' }}
    >
      <span className="truncate font-semibold">{block.title}</span>
      {h > 30 && block.subtitle && <span className="truncate opacity-75">{block.subtitle}</span>}
    </Tag>
  );
}
