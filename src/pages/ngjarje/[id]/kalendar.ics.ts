import type { APIRoute } from 'astro';
import { getEvent } from '../../../lib/queries';
import { icsDate } from '../../../lib/time';
import { eventPath } from '../../../lib/paths';
import { env } from 'cloudflare:workers';

export const prerender = false;

// RFC 5545: escape text, CRLF line ends, fold lines at 75 octets.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const enc = new TextEncoder();
function fold(line: string) {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export const GET: APIRoute = async ({ params }) => {
  const e = await getEvent(String(params.id).slice(0, 16));
  if (!e || e.state !== 'visible') return new Response('Not found', { status: 404 });
  const url = env.SITE_URL.replace(/\/$/, '') + eventPath(e);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Njesia 5//Forumi//SQ',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@njesia5`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(e.starts_at)}`,
    `DTEND:${icsDate(e.ends_at)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(`${e.description}\n\n${url}`)}`,
    `LOCATION:${esc(e.kind === 'online' ? url : `${e.place_text}, Tiranë`)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="ngjarje-${e.id}.ics"`,
      'cache-control': 'public, max-age=300',
    },
  });
};
