import { env } from 'cloudflare:workers';

export const db = () => env.DB;
export const now = () => Date.now();

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
/** 16-char sortable-ish id: 8 chars of time, 8 random (crockford base32). */
export function newId(): string {
  let t = Date.now();
  let head = '';
  for (let i = 0; i < 8; i++) {
    head = ALPHABET[t % 32] + head;
    t = Math.floor(t / 32);
  }
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  let tail = '';
  for (const b of rnd) tail += ALPHABET[b % 32];
  return head + tail;
}

export async function all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
  const r = await db().prepare(sql).bind(...args).all<T>();
  return r.results ?? [];
}

export async function one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
  return (await db().prepare(sql).bind(...args).first<T>()) ?? null;
}

export async function run(sql: string, ...args: unknown[]) {
  return db().prepare(sql).bind(...args).run();
}

export const stmt = (sql: string, ...args: unknown[]) => db().prepare(sql).bind(...args);

export async function batch(statements: D1PreparedStatement[]) {
  if (statements.length) await db().batch(statements);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: string }>('SELECT value FROM setting WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown, by: string) {
  await run(
    'INSERT INTO setting (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
    key,
    JSON.stringify(value),
    now(),
    by,
  );
}
