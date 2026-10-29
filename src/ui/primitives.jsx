// Small design-system pieces shared by every page.
import { motion } from 'motion/react';
import { cn } from './cn.js';
import { useApp } from '../context.js';
import { RevealText, trackSpotlight } from './motion.jsx';

// Interactive cards lift on hover and light up where the cursor is.
export function Card({ className, interactive, as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-line bg-card shadow-card',
        interactive && 'spotlight transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lift dark:hover:border-indigo-500/40',
        className,
      )}
      onPointerMove={interactive ? trackSpotlight : undefined}
      {...props}
    />
  );
}

export function CardHeader({ title, icon: Icon, action, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex items-center gap-2.5">
        {Icon && <IconTile icon={Icon} size="sm" />}
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// The small label above a heading: an amber marker plus indigo text.
export function Eyebrow({ children, className }) {
  return (
    <p className={cn('flex items-center gap-2 text-[13px] font-medium text-indigo-600 dark:text-indigo-400', className)}>
      <span className="size-1.5 rotate-45 rounded-[1px] bg-sky-400" aria-hidden />
      {children}
    </p>
  );
}

export function IconTile({ icon: Icon, size = 'md', tone = 'indigo', className }) {
  const tones = {
    indigo: 'bg-soft text-indigo-600 dark:text-indigo-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  };
  const sizes = { sm: 'size-8 rounded-lg [&_svg]:size-4', md: 'size-10 rounded-xl [&_svg]:size-5', lg: 'size-12 rounded-2xl [&_svg]:size-6' };
  return (
    <span className={cn('inline-grid shrink-0 place-items-center', tones[tone], sizes[size], className)}>
      <Icon strokeWidth={1.9} />
    </span>
  );
}

export function ModuleBadge({ moduleId, className }) {
  const { moduleById } = useApp();
  const m = moduleById(moduleId);
  if (!m) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium', className)}
      style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: m.color }} />
      {m.code || m.name}
    </span>
  );
}

// Animated circular progress, 0–1.
export function ProgressRing({ value, size = 44, stroke = 5, color = 'var(--color-indigo-500)', children, className }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cl-line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'indigo' }) {
  const tones = { indigo: 'bg-indigo-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500' };
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-subtle', className)}>
      <motion.div
        className={cn('h-full rounded-full', tones[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton rounded-xl', className)} />;
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-grid min-w-5 place-items-center rounded-md border border-line bg-subtle px-1.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

// Pill-style toggle between a few options.
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-full border border-line bg-subtle p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors [&_svg]:size-3.5',
            value === o.value ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-full bg-card shadow-card" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon && <o.icon />}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-8 text-center', className)}>
      {icon && <IconTile icon={icon} tone="indigo" size="lg" className="mb-1" />}
      <p className="font-semibold">{title}</p>
      <div className="max-w-xs text-sm text-muted">{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <motion.header variants={fadeUp} initial="hidden" animate="show" className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex max-w-2xl min-w-0 flex-col gap-2.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <RevealText as="h1" text={title} className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl" />
        {description && <p className="text-[15px] text-muted text-pretty">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </motion.header>
  );
}

export function Pill({ children, className, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-soft text-indigo-700 dark:text-indigo-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    slate: 'bg-subtle text-muted',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3', tones[tone], className)}>{children}</span>;
}

export function BackLink({ href, children }) {
  return (
    <a href={href} className="group flex w-fit items-center gap-1 text-sm font-medium text-muted no-underline hover:text-fg">
      <span className="transition-transform group-hover:-translate-x-0.5">←</span> {children}
    </a>
  );
}

// Staggered fade-up for lists of cards.
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }),
};
