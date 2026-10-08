// Albanian mobile numbers: 066/067/068/069 + 7 digits, stored as E.164 (+3556X XXXXXXX).

export function normalizePhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+355')) d = d.slice(4);
  else if (d.startsWith('355') && d.length === 12) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^6[6-9]\d{7}$/.test(d)) return null;
  return '+355' + d;
}

export const isAlbanianMobile = (e164: string) => /^\+3556[6-9]\d{7}$/.test(e164);

/** "+355691234567" → "069 123 4567" */
export function formatPhone(e164: string): string {
  const d = '0' + e164.replace('+355', '');
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Accounts created with a phone number get a placeholder address that can never receive mail. */
export const phoneEmail = (e164: string) => `${e164.replace('+', '')}@telefon.invalid`;
export const isPhoneEmail = (email: string) => email.endsWith('@telefon.invalid');

/** "Email or phone" sign-in field: a phone number if it parses as one. */
export const looksLikePhone = (s: string) => !s.includes('@') && normalizePhone(s) !== null;
