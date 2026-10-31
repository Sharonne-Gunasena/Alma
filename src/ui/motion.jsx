// Motion pieces shared across pages: masked text reveals, count-up numbers,
// the cursor light for .spotlight, and scroll reveals.
//
// Rules: animate only transform and opacity (cheap for the GPU), never block
// input, and respect "reduce motion". Pointer effects only run on devices
// with a precise pointer, so phones get the plain, fast version.
import { useEffect, useRef } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { cn } from './cn.js';

const EASE = [0.22, 1, 0.36, 1];

// Words slide up from behind a mask, one after another.
export function RevealText({ text, as: Tag = 'span', className, delay = 0, stagger = 0.045 }) {
  const reduce = useReducedMotion();
  if (reduce || typeof text !== 'string') return <Tag className={className}>{text}</Tag>;
  const words = text.split(' ');
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        // A real space between the masks so long titles can still wrap.
        <span key={i}>
          <span aria-hidden className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-top">
            <motion.span className="inline-block" initial={{ y: '110%' }} animate={{ y: '0%' }} transition={{ duration: 0.75, ease: EASE, delay: delay + i * stagger }}>
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  );
}

// A number that counts up to its value. `format` turns the number into text.
export function CountUp({ value, format = (n) => Math.round(n).toString(), duration = 1.1, className }) {
  const ref = useRef(null);
  const from = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || typeof value !== 'number') {
      el.textContent = typeof value === 'number' ? format(value) : value;
      return;
    }
    const controls = animate(from.current, value, { duration, ease: EASE, onUpdate: (v) => (el.textContent = format(v)) });
    from.current = value;
    return () => controls.stop();
  }, [value]);
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {typeof value === 'number' ? format(reduce ? value : 0) : value}
    </span>
  );
}

// Moves the cursor light on any element with the .spotlight class.
export function trackSpotlight(e) {
  if (e.pointerType !== 'mouse') return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

// Fades and lifts into place the first time it scrolls into view.
export function Reveal({ children, className, delay = 0, as = 'div', ...props }) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      {...props}
    >
      {children}
    </Comp>
  );
}

// Slow-drifting colour light behind the page. Radial gradients moved with
// transforms only, so it costs almost nothing to animate.
export function Aurora({ className }) {
  return (
    <div aria-hidden className={cn('aurora pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
      <span className="aurora-blob aurora-a" />
      <span className="aurora-blob aurora-b" />
      <span className="aurora-blob aurora-c" />
    </div>
  );
}
