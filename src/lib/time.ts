// Tirana time and Albanian/English date words, by hand: Chrome and workerd ship no Albanian
// Intl data (Intl.DateTimeFormat('sq-AL') prints English months), so nothing here uses Intl.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Last Sunday of a month at 01:00 UTC (EU summer-time switch). */
function lastSundayUtc(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

/** Offset of Tirana from UTC in ms at instant t (CET +1, CEST +2). */
export function tiranaOffset(t: number): number {
  const y = new Date(t).getUTCFullYear();
  return t >= lastSundayUtc(y, 2) && t < lastSundayUtc(y, 9) ? 2 * HOUR : HOUR;
}

/** Wall-clock parts in Tirana. */
export function tirana(t: number) {
  const d = new Date(t + tiranaOffset(t));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Tirana wall time "2026-10-10T18:00" → UTC ms (used by the team's forms). */
export function fromTiranaWall(wall: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // try both offsets; pick the one that maps back to the same wall time
  for (const off of [HOUR, 2 * HOUR]) {
    const t = guess - off;
    if (tiranaOffset(t) === off) return t;
  }
  return guess - HOUR;
}

export function toTiranaWall(t: number): string {
  const p = tirana(t);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month + 1)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** Midnight (Tirana) of the day containing t, as UTC ms. */
export function tiranaDayStart(t: number): number {
  const p = tirana(t);
  return fromTiranaWall(`${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T00:00`)!;
}

export const tiranaDayKey = (t: number) => toTiranaWall(t).slice(0, 10);

const WORDS = {
  sq: {
    weekdays: ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'],
    months: ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'],
    short: ['JAN', 'SHK', 'MAR', 'PRI', 'MAJ', 'QER', 'KOR', 'GUS', 'SHT', 'TET', 'NËN', 'DHJ'],
  },
  en: {
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    short: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
  },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "e shtunë, 10 tetor" / "Saturday 10 October" (+ year when not this year) */
export function dateLabel(t: number, lang: Lang, opts: { capital?: boolean; year?: boolean } = {}) {
  const p = tirana(t);
  const w = WORDS[lang];
  const showYear = opts.year ?? p.year !== tirana(Date.now()).year;
  const s =
    lang === 'sq'
      ? `${w.weekdays[p.weekday]}, ${p.day} ${w.months[p.month]}${showYear ? ' ' + p.year : ''}`
      : `${w.weekdays[p.weekday]} ${p.day} ${w.months[p.month]}${showYear ? ' ' + p.year : ''}`;
  return opts.capital ? cap(s) : s;
}

export function dayMonth(t: number, lang: Lang) {
  const p = tirana(t);
  return { day: String(p.day), month: WORDS[lang].short[p.month] };
}

export function clock(t: number) {
  const p = tirana(t);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Relative time: "3 javë më parë" / "pas 2 ditësh" / "3 weeks ago" / "in 2 days". */
export function relative(t: number, lang: Lang, ref = Date.now()): string {
  const diff = t - ref;
  const past = diff < 0;
  const a = Math.abs(diff);
  const units: [number, 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'][] = [
    [365 * DAY, 'year'],
    [30 * DAY, 'month'],
    [7 * DAY, 'week'],
    [DAY, 'day'],
    [HOUR, 'hour'],
    [60_000, 'minute'],
  ];
  if (a < 60_000) return lang === 'sq' ? 'tani' : 'just now';
  const [size, unit] = units.find(([s]) => a >= s)!;
  const n = Math.floor(a / size);
  return lang === 'sq' ? sqRelative(n, unit, past) : `${past ? '' : 'in '}${n} ${unit}${n === 1 ? '' : 's'}${past ? ' ago' : ''}`;
}

function sqRelative(n: number, unit: string, past: boolean) {
  // past: "{n} {noun} më parë"; future: "pas {n} {ablative}"
  const P: Record<string, [string, string]> = {
    minute: ['minutë', 'minuta'],
    hour: ['orë', 'orë'],
    day: ['ditë', 'ditë'],
    week: ['javë', 'javë'],
    month: ['muaj', 'muaj'],
    year: ['vit', 'vjet'],
  };
  const F: Record<string, [string, string]> = {
    minute: ['minute', 'minutash'],
    hour: ['ore', 'orësh'],
    day: ['dite', 'ditësh'],
    week: ['jave', 'javësh'],
    month: ['muaji', 'muajsh'],
    year: ['viti', 'vitesh'],
  };
  const one = n === 1;
  return past ? `${n} ${P[unit][one ? 0 : 1]} më parë` : `pas ${n} ${F[unit][one ? 0 : 1]}`;
}

/** Duration in hours for the "the team replied after N hours" badge. */
export function hoursBetween(a: number, b: number) {
  return Math.max(1, Math.round((b - a) / HOUR));
}

/** ICS date: 20261010T160000Z */
export function icsDate(t: number) {
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export { HOUR, DAY };
