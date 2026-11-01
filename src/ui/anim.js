// The motion system. Each library owns one kind of job, so two libraries
// never drive the same element:
//
// - Motion (motion/react): routes, layout and shared-element moves, presence
//   (mount/unmount), hover/tap/focus states. MotionConfig handles "reduce
//   motion" for it.
// - GSAP: choreographed entrance timelines and scroll-triggered reveals
//   (useIntro below).
// - Anime.js: SVG line drawing and small decorative details (useDraw below).
// - React Spring: physical movement that follows the pointer (the TimeGrid
//   drag-to-create block).
//
// GSAP and Anime.js load on demand, so they never add to the first download,
// and both check "reduce motion" here, in one place.
//
// Timing scale: 150ms for feedback, 250ms for small moves, 400–700ms for
// entrances. Easing: a soft ease-out (EASE). Selection springs don't bounce.
import { useLayoutEffect } from 'react';

export const EASE = [0.22, 1, 0.36, 1];
export const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.45, intro: 0.7 };

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs a GSAP timeline on the elements inside `ref`. Elements marked
// `data-intro` stay hidden until the timeline starts, so nothing flashes in
// before it plays; if GSAP is slow to load they appear anyway.
// `build(gsap, scope, ScrollTrigger)` sets up the animation; pass null to skip it.
export function useIntro(ref, build, deps = []) {
  useLayoutEffect(() => {
    const scope = ref.current;
    if (!scope || !build || reducedMotion()) return;
    let ctx;
    let cancelled = false;
    scope.classList.add('intro-pending');
    const show = () => scope.classList.remove('intro-pending');
    const fallback = setTimeout(show, 1200);

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        ctx = gsap.context(() => build(gsap, scope, ScrollTrigger), scope);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallback);
        if (!cancelled) show();
      });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      show();
      ctx?.revert();
    };
  }, deps);
}

// Starts downloading GSAP early (e.g. while the app checks the session), so an
// entrance never waits on the network with its content hidden.
export function preloadIntro() {
  if (!reducedMotion()) import('gsap').catch(() => {});
}

// Draws the strokes of the SVG paths inside `ref`, one after another.
export function useDraw(ref, { duration = 900, delay = 0, stagger = 120 } = {}, deps = []) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let anim;
    let cancelled = false;
    const paths = el.querySelectorAll('[data-draw]');
    // Hide the strokes until the drawing starts.
    paths.forEach((p) => (p.style.opacity = '0'));
    import('animejs')
      .then(({ animate, createDrawable, stagger: by }) => {
        if (cancelled) return;
        paths.forEach((p) => (p.style.opacity = ''));
        anim = animate(createDrawable(paths), { draw: ['0 0', '0 1'], ease: 'inOutQuad', duration, delay: by(stagger, { start: delay }) });
      })
      .catch(() => paths.forEach((p) => (p.style.opacity = '')));
    return () => {
      cancelled = true;
      anim?.revert();
      paths.forEach((p) => (p.style.opacity = ''));
    };
  }, deps);
}
