import type { APIRoute } from 'astro';
import { all, one } from '../../../lib/db';
import { isTeam } from '../../../lib/auth';
import { tiranaDayKey, clock } from '../../../lib/time';

export const prerender = false;

const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!isTeam(locals.user)) return new Response('Forbidden', { status: 403 });
  const id = String(params.id).slice(0, 16);
  const ev = await one<{ title: string }>('SELECT title FROM event WHERE id = ?', id);
  if (!ev) return new Response('Not found', { status: 404 });
  const rows = await all<{ name: string; created_at: number; checked_in_at: number | null; suspended: number | null }>(
    'SELECT u.name, r.created_at, r.checked_in_at, u.suspendedAt AS suspended FROM rsvp r JOIN "user" u ON u.id = r.user_id WHERE r.event_id = ? ORDER BY u.name',
    id,
  );
  const csv = [
    ['Emri', 'U regjistrua', 'Erdhi', 'Pezulluar'].map(cell).join(','),
    ...rows.map((r) =>
      [r.name, `${tiranaDayKey(r.created_at)} ${clock(r.created_at)}`, r.checked_in_at ? 'po' : '', r.suspended ? 'po' : ''].map(cell).join(','),
    ),
  ].join('\r\n');
  return new Response('﻿' + csv + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="lista-${id}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
};
