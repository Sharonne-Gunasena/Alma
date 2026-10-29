import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 select-none cursor-pointer disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'btn-sheen bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-glow hover:from-orange-400 hover:to-red-500 hover:-translate-y-px',
        secondary: 'bg-card text-fg border border-line shadow-card hover:border-indigo-300 hover:-translate-y-px dark:hover:border-indigo-500/50',
        ghost: 'text-muted hover:text-fg hover:bg-subtle',
        soft: 'bg-soft text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-500/20',
        danger: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
      },
      size: {
        sm: 'h-8 rounded-full px-3 text-[13px]',
        md: 'h-10 rounded-full px-4.5 text-sm',
        lg: 'h-12 rounded-full px-6 text-[15px]',
        icon: 'size-9 rounded-full',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

// Big primary buttons lean slightly toward the mouse, like a magnet.
// Uses `transform`, which doesn't clash with Tailwind's `translate`/`scale`.
const magnet = {
  onPointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    e.currentTarget.style.transform = `translate(${dx * 0.12}px, ${dy * 0.22}px)`;
  },
  onPointerLeave(e) {
    e.currentTarget.style.transform = '';
  },
};
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Renders a link when given href, so navigation stays a real <a>.
export function Button({ className, variant, size, href, ...props }) {
  const classes = cn(buttonVariants({ variant, size }), className);
  const extra = variant === 'primary' && size !== 'sm' && !reduced() ? magnet : {};
  if (href) return <a href={href} className={cn(classes, 'no-underline')} {...extra} {...props} />;
  return <button className={classes} {...extra} {...props} />;
}
