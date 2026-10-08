/// <reference types="astro/client" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: KVNamespace;
    SESSION: KVNamespace;
    ASSETS: Fetcher;
    SITE_URL: string;
    ENVIRONMENT: 'development' | 'production';
    BETTER_AUTH_SECRET: string;
    /** Optional: Google sign-in. Without both, the Google button is not shown. */
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    /** Optional: SMS provider (generic HTTP API). Not needed: accounts are approved by the team. */
    SMS_API_URL?: string;
    SMS_API_TOKEN?: string;
    SMS_SENDER?: string;
    /** Optional: email via Resend. Without it, mail goes to the dev outbox outside production. */
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
  }
}

type Lang = 'sq' | 'en';

interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: 'resident' | 'admin' | 'superadmin';
  /** set when the account was created (or later given) a phone number */
  phoneNumber: string | null;
  neighbourhood: string | null;
  /** team-only: the street the person says they live on */
  street: string | null;
  suspendedAt: number | null;
  closedAt: number | null;
  /** set when the team approves the account; writing needs it */
  approvedAt: number | null;
  declinedAt: number | null;
}

declare namespace App {
  interface Locals {
    lang: Lang;
    /** Path without the language prefix, e.g. "/forumi" for both "/forumi" and "/en/forumi". */
    path: string;
    user: SessionUser | null;
    /** One-shot message carried across a POST → redirect (no-JS path). */
    flash: { kind: 'ok' | 'error'; text: string } | null;
  }
}
