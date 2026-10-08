// Mail and (optional) SMS delivery. With a provider configured, messages go out through it.
// Without one, development keeps them in the dev_outbox table; production skips mail and refuses
// SMS. Nothing on the site needs SMS: accounts are approved by the team.
import { env } from 'cloudflare:workers';
import { newId, now, run } from './db';
import { formatPhone, isPhoneEmail } from './phone';

const isProd = () => env.ENVIRONMENT === 'production';

export const smsConfigured = () => Boolean(env.SMS_API_URL && env.SMS_API_TOKEN);
export const mailConfigured = () => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
/** True when links land in the development outbox instead of a real inbox. */
export const devOutbox = () => !isProd();

async function keep(channel: 'mail' | 'sms', recipient: string, subject: string, body: string) {
  await run(
    'INSERT INTO dev_outbox (id, channel, recipient, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId(),
    channel,
    recipient,
    subject,
    body,
    now(),
  );
}

export async function deliverSms(phone: string, code: string) {
  const text = `${code} është kodi yt për Njësia 5. Mos ia trego askujt.`;
  if (smsConfigured()) {
    const res = await fetch(env.SMS_API_URL!, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.SMS_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to: phone, from: env.SMS_SENDER ?? 'Njesia5', text }),
    });
    if (!res.ok) throw new Error('SMS_SEND_FAILED');
    return;
  }
  if (isProd()) throw new Error('SMS_SEND_FAILED');
  await keep('sms', formatPhone(phone), '', text);
}

const MAIL = {
  verify: {
    sq: ['Konfirmo email-in për Njësia 5', 'Mirë se erdhe, {name}! Hap lidhjen për të konfirmuar email-in:'],
    en: ['Confirm your email for Njësia 5', 'Welcome, {name}! Open the link to confirm your email:'],
  },
  reset: {
    sq: ['Ndrysho fjalëkalimin për Njësia 5', 'Dikush kërkoi të ndryshojë fjalëkalimin tënd. Lidhja vlen 1 orë:'],
    en: ['Reset your password for Njësia 5', 'Someone asked to reset your password. The link is valid for 1 hour:'],
  },
} as const;

async function send(to: string, subject: string, text: string) {
  if (mailConfigured()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
    });
    if (!res.ok) throw new Error('MAIL_SEND_FAILED');
    return;
  }
  // no sender configured: production cannot confirm emails (the README says so); dev keeps it
  if (isProd()) throw new Error('MAIL_SEND_FAILED');
  await keep('mail', to, subject, text);
}

/** The 6-digit code that confirms an email (and, if ever enabled, other code types). */
export async function deliverCode(to: string, code: string, type: string) {
  if (isPhoneEmail(to)) return;
  const what =
    type === 'forget-password'
      ? ['për të ndryshuar fjalëkalimin', 'to reset your password']
      : ['për të konfirmuar email-in', 'to confirm your email'];
  const text = `${code}\n\nKy është kodi yt ${what[0]} te Njësia 5. Vlen 10 minuta.\nThis is your code ${what[1]} on Njësia 5. It is valid for 10 minutes.\n\nNëse nuk e ke kërkuar ti, injoroje këtë email.`;
  await send(to, `${code} është kodi yt · Njësia 5`, text);
}

export async function deliverMail(to: string, kind: 'verify' | 'reset', url: string, name: string) {
  if (isPhoneEmail(to)) return; // phone accounts have no mailbox
  const [subject, lead] = MAIL[kind].sq;
  const [subjectEn, leadEn] = MAIL[kind].en;
  const text = `${lead.replace('{name}', name)}\n${url}\n\n${leadEn.replace('{name}', name)}\n${url}\n\nNëse nuk e ke kërkuar ti, injoroje këtë email.`;
  if (mailConfigured()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject: `${subject} · ${subjectEn}`, text }),
    });
    if (!res.ok) throw new Error('MAIL_SEND_FAILED');
    return;
  }
  if (isProd()) return; // no sender configured: the account still works, the mail is skipped
  await keep('mail', to, subject, text);
}
