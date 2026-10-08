import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = () => {
  const site = env.SITE_URL.replace(/\/$/, '');
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /do/',
    'Disallow: /api/',
    'Disallow: /dev/',
    'Disallow: /ekipi',
    'Disallow: /konfirmo',
    'Disallow: /ne-pritje',
    'Disallow: /profili',
    'Disallow: /njoftime',
    'Disallow: /raporto',
    'Disallow: /shkruaj',
    'Disallow: /propozo',
    'Disallow: /en/profili',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
