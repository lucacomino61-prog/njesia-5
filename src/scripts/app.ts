// One small client entry. Everything works without it (forms post and redirect); this layer
// keeps the page in place, answers the press, and loads the motion engine when it is wanted.

const root = document.documentElement;
const lang = root.lang === 'en' ? 'en' : 'sq';

/* ---------- toast ---------- */
const toastEl = document.querySelector<HTMLElement>('[data-toast]');
let toastTimer = 0;
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  if (!toastEl) return;
  toastEl.dataset.kind = kind;
  toastEl.querySelector('[data-toast-text]')!.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  // long messages (a temporary password) stay long enough to read
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), Math.max(4200, text.length * 90));
}
if (toastEl && !toastEl.hidden)
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), Math.max(4200, (toastEl.textContent ?? '').length * 90));

/* ---------- stop-animations switch ---------- */
const motionOff = () =>
  root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
function syncMotionButtons() {
  const off = root.dataset.motion === 'off';
  document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(off));
    b.querySelector<HTMLElement>('[data-on]')!.hidden = off;
    b.querySelector<HTMLElement>('[data-off]')!.hidden = !off;
  });
}
syncMotionButtons();
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest('[data-motion-toggle]');
  if (!b) return;
  const off = root.dataset.motion !== 'off';
  if (off) root.dataset.motion = 'off';
  else delete root.dataset.motion;
  try {
    localStorage.setItem('n5-motion', off ? 'off' : 'on');
  } catch {}
  syncMotionButtons();
  window.dispatchEvent(new CustomEvent('n5:motion', { detail: { off } }));
});

/* ---------- region refresh: re-render from the server after a write ---------- */
async function refreshRegions(url = location.href) {
  const res = await fetch(url, { headers: { accept: 'text/html' }, credentials: 'same-origin' });
  if (!res.ok) return;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  document.querySelectorAll<HTMLElement>('[data-region]').forEach((el) => {
    const fresh = doc.querySelector(`[data-region="${el.dataset.region}"]`);
    if (fresh) el.replaceWith(document.importNode(fresh, true));
  });
}

/* ---------- optimistic toggles (support, upvote, RSVP, question votes) ---------- */
function optimistic(form: HTMLFormElement) {
  const btn = form.querySelector<HTMLButtonElement>('[aria-pressed]');
  if (!btn) return () => {};
  const was = btn.getAttribute('aria-pressed') === 'true';
  const counter = form.closest('[data-count-scope]')?.querySelector<HTMLElement>('[data-count]');
  const before = counter?.textContent ?? '';
  btn.setAttribute('aria-pressed', String(!was));
  if (counter) {
    const n = Number(counter.dataset.count) + (was ? -1 : 1);
    counter.dataset.count = String(n);
    counter.textContent = String(n);
  }
  return () => {
    btn.setAttribute('aria-pressed', String(was));
    if (counter) {
      counter.textContent = before;
      counter.dataset.count = String(Number(counter.dataset.count) + (was ? 1 : -1));
    }
  };
}

document.addEventListener('submit', async (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('form[data-enhance]') || e.defaultPrevented) return;
  e.preventDefault();
  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  const data = new FormData(form, submitter);
  const undo = form.hasAttribute('data-optimistic') ? optimistic(form) : () => {};
  form.setAttribute('aria-busy', 'true');
  const err = form.querySelector<HTMLElement>('.form-error');
  if (err) err.textContent = '';
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { accept: 'application/json', 'x-n5-lang': lang },
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      redirect?: string;
      error?: string;
    };
    if (json.redirect) {
      location.assign(json.redirect);
      return;
    }
    if (!res.ok || !json.ok) {
      undo();
      const msg = json.error ?? (lang === 'en' ? 'Something went wrong. Please try again.' : 'Diçka nuk shkoi. Provo përsëri.');
      if (err) err.textContent = msg;
      else toast(msg, 'error');
      return;
    }
    if (form.hasAttribute('data-reset')) form.reset();
    if (json.message) toast(json.message);
    await refreshRegions();
    form.closest('dialog')?.close();
  } catch {
    undo();
    toast(lang === 'en' ? 'No connection. Try again.' : 'Pa lidhje. Provo përsëri.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
});

/* ---------- dialogs (report, compose) ---------- */
document.addEventListener('click', (e) => {
  const opener = (e.target as Element).closest<HTMLElement>('[data-open]');
  if (opener) {
    const d = document.getElementById(opener.dataset.open!) as HTMLDialogElement | null;
    if (d) {
      e.preventDefault();
      if (opener.dataset.fill) {
        const fill = JSON.parse(opener.dataset.fill) as Record<string, string>;
        for (const [k, v] of Object.entries(fill)) {
          const input = d.querySelector<HTMLInputElement>(`[data-field="${k}"]`);
          if (input) input.value = v;
        }
      }
      d.showModal();
    }
  }
  const closer = (e.target as Element).closest('[data-close]');
  if (closer) closer.closest('dialog')?.close();
});

/* ---------- share ---------- */
document.addEventListener('click', async (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-share]');
  if (!b) return;
  const url = b.dataset.share || location.href;
  const title = b.dataset.title || document.title;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(b.dataset.copied || (lang === 'en' ? 'Link copied' : 'Lidhja u kopjua'));
  } catch {
    prompt('', url);
  }
});

/* ---------- show password ---------- */
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('[data-reveal]');
  if (!b) return;
  const input = document.getElementById(b.dataset.reveal!) as HTMLInputElement | null;
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show));
});

/* ---------- sponsor views: counted once a card is on screen, once a day per browser ---------- */
const dayKey = 'n5-seen-' + new Date().toISOString().slice(0, 10);
const seenToday = (() => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('n5-seen-') && k !== dayKey) localStorage.removeItem(k);
    }
    return new Set<string>(JSON.parse(localStorage.getItem(dayKey) ?? '[]'));
  } catch {
    return new Set<string>();
  }
})();
const seen = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = (en.target as HTMLElement).dataset.sponsor!;
      seen.unobserve(en.target);
      if (seenToday.has(id)) continue;
      seenToday.add(id);
      try {
        localStorage.setItem(dayKey, JSON.stringify([...seenToday]));
      } catch {}
      navigator.sendBeacon?.(`/api/sponsors/${id}/view`);
    }
  },
  { threshold: 0.6 },
);
document.querySelectorAll('[data-sponsor]').forEach((el) => seen.observe(el));

/* ---------- countdowns to the next town hall ---------- */
function countdowns() {
  document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
    const out = el.querySelector('[data-cd-text]');
    if (!out) return;
    const ms = Number(el.dataset.countdown) - Date.now();
    if (ms <= 0) {
      out.textContent = lang === 'en' ? 'starting' : 'po fillon';
      return;
    }
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const u = lang === 'en' ? ['d', 'h', 'min'] : ['ditë', 'orë', 'min'];
    out.textContent = (d ? `${d} ${u[0]} ` : '') + `${h} ${u[1]} ${m} ${u[2]}`;
  });
}
if (document.querySelector('[data-countdown]')) {
  countdowns();
  setInterval(countdowns, 30_000);
}

/* ---------- motion engine: only when wanted, after first paint ---------- */
// Loaded on the first sign of a person (scroll, wheel, touch, key, pointer), never during load:
// the page is fully usable without it, so it costs nothing until someone moves.
function startMotion() {
  if (motionOff()) return;
  import('./motion').then((m) => m.start()).catch(() => {});
}
const wake = () => {
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll']) removeEventListener(ev, wake);
  startMotion();
};
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll']) addEventListener(ev, wake, { passive: true, once: true });
window.addEventListener('n5:motion', ((e: CustomEvent) => {
  if (e.detail.off) import('./motion').then((m) => m.stop());
  else startMotion();
}) as EventListener);

/* ---------- service worker (offline page only) ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
