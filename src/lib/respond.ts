// One response shape for every write. With JS the page gets JSON and stays in place; without JS
// the form posts, we set a one-shot flash cookie and redirect back (POST → redirect → GET).
import type { APIContext, AstroCookies } from 'astro';

export function safeBack(raw: unknown, fallback = '/'): string {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return fallback;
  return s.slice(0, 1024);
}

export function setFlash(cookies: AstroCookies, kind: 'ok' | 'error', text: string) {
  cookies.set('n5_flash', encodeURIComponent(JSON.stringify({ kind, text })), {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60,
  });
}

export const wantsJson = (req: Request) => (req.headers.get('accept') ?? '').includes('application/json');

export function done(
  ctx: APIContext,
  r: { ok: boolean; message?: string; error?: string; redirect?: string; back?: string; status?: number },
) {
  if (wantsJson(ctx.request)) {
    return new Response(JSON.stringify({ ok: r.ok, message: r.message, error: r.error, redirect: r.redirect }), {
      status: r.ok ? 200 : r.status ?? 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (r.message || r.error) setFlash(ctx.cookies, r.ok ? 'ok' : 'error', (r.ok ? r.message : r.error) ?? '');
  return ctx.redirect(r.redirect ?? r.back ?? '/', 303);
}
