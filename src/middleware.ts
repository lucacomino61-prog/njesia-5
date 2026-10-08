import { defineMiddleware, sequence } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { getAuth, toSessionUser } from './lib/auth';

const STATIC = /^\/(_astro|fonts|icons|favicon|apple-touch|og|manifest|sw\.js|robots\.txt|sitemap)/;

/** /en/... renders the same route in English; locals.path is the path without the prefix. */
const language = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname === '/en' ? '/' : pathname.slice(3);
    ctx.locals.lang = 'en';
    ctx.locals.path = rest;
    return next(new Request(new URL(rest + ctx.url.search, ctx.url), ctx.request));
  }
  ctx.locals.lang = 'sq';
  ctx.locals.path = pathname;
  return next();
});

const session = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = null;
  ctx.locals.flash = null;
  const p = ctx.url.pathname;
  if (STATIC.test(p) || p.startsWith('/api/auth')) return next();
  try {
    const s = await getAuth().api.getSession({ headers: ctx.request.headers });
    ctx.locals.user = toSessionUser(s?.user as Record<string, unknown> | undefined);
  } catch {
    ctx.locals.user = null;
  }
  const flash = ctx.cookies.get('n5_flash')?.value;
  if (flash) {
    try {
      ctx.locals.flash = JSON.parse(decodeURIComponent(flash));
    } catch {
      /* ignore a malformed flash */
    }
    ctx.cookies.delete('n5_flash', { path: '/' });
  }
  return next();
});

const headers = defineMiddleware(async (ctx, next) => {
  const res = await next();
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  if (env.ENVIRONMENT === 'production') h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  const type = h.get('content-type') ?? '';
  if (type.includes('text/html')) {
    // pages are personal (signed-in state, flash): never cached by shared caches
    if (!h.has('cache-control')) h.set('Cache-Control', 'private, no-store');
    h.set('Content-Language', ctx.locals.lang ?? 'sq');
  }
  return res;
});

export const onRequest = sequence(language, session, headers);
