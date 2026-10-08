import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { all } from '../lib/db';
import { postPath, eventPath, townHallPath } from '../lib/paths';

export const prerender = false;

export const GET: APIRoute = async () => {
  const site = env.SITE_URL.replace(/\/$/, '');
  const [posts, events, halls] = await Promise.all([
    all<{ id: string; kind: string; title: string; activity_at: number }>(
      "SELECT id, kind, title, activity_at FROM post WHERE state = 'visible' ORDER BY activity_at DESC LIMIT 2000",
    ),
    all<{ id: string; title: string; created_at: number }>("SELECT id, title, created_at FROM event WHERE state = 'visible' ORDER BY starts_at DESC LIMIT 500"),
    all<{ id: string; title: string; created_at: number }>("SELECT id, title, created_at FROM town_hall WHERE state = 'visible' ORDER BY starts_at DESC LIMIT 200"),
  ]);
  const pages: { path: string; mod?: number }[] = [
    { path: '/' },
    { path: '/forumi' },
    { path: '/vendime' },
    { path: '/ngjarje' },
    { path: '/live' },
    { path: '/bizneset' },
    { path: '/kushtet' },
    { path: '/privatesia' },
    ...posts.map((p) => ({ path: postPath(p), mod: p.activity_at })),
    ...events.map((e) => ({ path: eventPath(e), mod: e.created_at })),
    ...halls.map((h) => ({ path: townHallPath(h), mod: h.created_at })),
  ];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const url = (p: { path: string; mod?: number }) => {
    const sq = site + p.path;
    const en = site + (p.path === '/' ? '/en' : '/en' + p.path);
    const alt = `<xhtml:link rel="alternate" hreflang="sq" href="${esc(sq)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${esc(sq)}"/>`;
    const lm = p.mod ? `<lastmod>${new Date(p.mod).toISOString()}</lastmod>` : '';
    return `<url><loc>${esc(sq)}</loc>${lm}${alt}</url><url><loc>${esc(en)}</loc>${lm}${alt}</url>`;
  };
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pages.map(url).join('')}</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' } });
};
