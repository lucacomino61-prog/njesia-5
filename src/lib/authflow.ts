// Calls Better Auth from our own form pages (so every form is a real POST that works without
// JS) and forwards its cookies onto our redirect.
import type { AstroGlobal } from 'astro';
import { getAuth } from './auth';
import { t as tr } from '../i18n';

export interface AuthResult {
  ok: boolean;
  code?: string;
  data?: Record<string, unknown>;
  cookies: string[];
}

export async function callAuth(fn: (auth: ReturnType<typeof getAuth>) => Promise<unknown>): Promise<AuthResult> {
  try {
    const res = (await fn(getAuth())) as Response;
    const cookies = res.headers.getSetCookie?.() ?? [];
    const body = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, code: String(body.code ?? body.message ?? 'generic'), cookies };
    return { ok: true, data: body, cookies };
  } catch (e) {
    const err = e as { body?: { code?: string }; message?: string };
    return { ok: false, code: err.body?.code ?? (err.message?.includes('SMS_SEND_FAILED') ? 'SMS_SEND_FAILED' : 'generic'), cookies: [] };
  }
}

export function errorText(lang: Lang, code?: string) {
  const e = tr(lang).errors as Record<string, string>;
  if (!code) return e.generic;
  return e[code] ?? (code === 'OTP_NOT_FOUND' ? e.OTP_EXPIRED : code === 'PHONE_NUMBER_NOT_EXIST' ? e.INVALID_PHONE_NUMBER : e.generic);
}

/** 303 to `to`, carrying the auth cookies (and an optional flash). */
export function redirectWith(to: string, cookies: string[], flash?: { kind: 'ok' | 'error'; text: string }) {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  if (flash) h.append('set-cookie', `n5_flash=${encodeURIComponent(JSON.stringify(flash))}; Path=/; Max-Age=60; SameSite=Lax`);
  return new Response(null, { status: 303, headers: h });
}

export const readForm = async (Astro: AstroGlobal) => {
  try {
    return await Astro.request.formData();
  } catch {
    return new FormData();
  }
};
