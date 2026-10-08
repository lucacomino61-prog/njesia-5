// The one motion engine: GSAP's ticker drives Lenis and every scripted effect; nothing else
// runs its own requestAnimationFrame. The sentence paints itself with CSS scroll timelines
// (no per-frame JS); this file adds smooth scrolling and the row
// reveals, loaded on the first interaction. stop() undoes all of it for the Stop-animations switch.
import { gsap } from 'gsap';
import Lenis from 'lenis';

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;
let ctx: gsap.Context | null = null;

export function start() {
  if (ctx) return;
  document.documentElement.classList.add('has-motion');
  ctx = gsap.context(() => reveals());
  // smooth scroll only for mouse/trackpad; touch keeps native scrolling
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.12, wheelMultiplier: 1 });
    tick = (time: number) => lenis!.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // keep in-page anchors and scroll restoration native
    document.addEventListener('click', anchorJump);
  }
}

export function stop() {
  document.documentElement.classList.remove('has-motion');
  ctx?.revert();
  ctx = null;
  if (tick) gsap.ticker.remove(tick);
  tick = null;
  lenis?.destroy();
  lenis = null;
  document.removeEventListener('click', anchorJump);
}

function anchorJump(e: MouseEvent) {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a || !lenis) return;
  const target = document.querySelector(a.hash);
  if (!target) return;
  e.preventDefault();
  window.scrollTo({ top: window.scrollY, behavior: 'instant' });
  lenis.scrollTo(target as HTMLElement, { offset: 0 });
}

/** Rows below the first screen arrive with a short lift; anything already visible stays put. */
function reveals() {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-reveal] > *')].filter(
    (el) => el.getBoundingClientRect().top > window.innerHeight,
  );
  if (!rows.length) return undefined;
  gsap.set(rows, { y: 18, opacity: 0.001 });
  const io = new IntersectionObserver(
    (entries) => {
      const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
      if (!shown.length) return;
      shown.forEach((el) => io.unobserve(el));
      gsap.to(shown, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.05, clearProps: 'transform,opacity' });
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  rows.forEach((r) => io.observe(r));
  return () => {
    io.disconnect();
    gsap.set(rows, { clearProps: 'transform,opacity' });
  };
}
