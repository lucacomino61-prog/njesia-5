// Sponsor views (beacon when a card is on screen, at most once a day per browser) and clicks
// (a redirect that counts, then sends the visitor to the business's own page).
import type { APIRoute } from 'astro';
import { one, run } from '../../../../lib/db';
import { tiranaDayKey } from '../../../../lib/time';

export const prerender = false;

const bump = (id: string, col: 'views' | 'clicks') =>
  run(
    `INSERT INTO sponsor_stat (sponsor_id, day, ${col}) VALUES (?, ?, 1) ON CONFLICT(sponsor_id, day) DO UPDATE SET ${col} = ${col} + 1`,
    id,
    tiranaDayKey(Date.now()),
  );

const isBot = (ua: string | null) => !ua || /bot|crawl|spider|lighthouse|headless|preview/i.test(ua);

export const POST: APIRoute = async ({ params, request }) => {
  if (params.op !== 'view') return new Response(null, { status: 404 });
  const s = await one<{ id: string }>('SELECT id FROM sponsor WHERE id = ?', String(params.id));
  if (s && !isBot(request.headers.get('user-agent'))) await bump(s.id, 'views');
  return new Response(null, { status: 204 });
};

export const GET: APIRoute = async ({ params, request, redirect }) => {
  if (params.op !== 'click') return new Response(null, { status: 404 });
  const s = await one<{ id: string; url: string | null }>('SELECT id, url FROM sponsor WHERE id = ?', String(params.id));
  if (!s?.url) return redirect('/bizneset', 302);
  if (!isBot(request.headers.get('user-agent'))) await bump(s.id, 'clicks');
  return redirect(s.url, 302);
};
