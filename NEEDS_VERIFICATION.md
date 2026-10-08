# Needs verification before going public

This file is authoritative: nothing below may be presented as fact on the live site until it is confirmed.

## Identity and contact (placeholders in `src/lib/legal.ts`)
- **Operator** of the forum: `[Emri i organizatorit]` / `[Operator name]` — who runs it and is the data controller.
- **Support email**: `[email i suportit]` — also where business sponsors write.
- **Domain** and `SITE_URL` (wrangler.jsonc `vars`), `site` in astro.config.mjs (`https://njesia5.example` today).

## Facts used on the site
- **Neighbourhoods of Njësia 5**: Blloku, Selita, Tirana e Re — from Wikipedia ("Tirana 5"); one Wikipedia table omits Blloku. Confirm with Bashkia Tiranë / the unit.
- **Landmarks** (place filters): Liceu Petro Nini Luarasi, Shkolla Besnik Sykja — named for Tirana 5 on Wikipedia. Confirm they are inside the unit; add the places residents actually use.
- **Unit office**: Rruga "Nikolla Tupe", Nd. 10, Tiranë 1019 (tirana.al) — shown in the footer.
- No population figure is shown (sources disagree: 54,000 vs 85,579 vs 89,579).

## Sample content (user's choice: launch with sample content "like the original")
All of it is created by `tools/seed.mjs` and must be replaced or removed before launch:
- 60 sample residents (first name + initial, emails `@shembull.test`) and 2 team accounts.
- 4 topics, 4 proposals with supporters and status histories, 3 team posts, 1 poll, 3 events, 2 town halls with questions.
- 2 sample businesses ("Furra e lagjes", "Libraria e qoshes") — not real businesses; no address, phone or link.
- The footer line "Përmbajtja aktuale është shembull për paraqitje" shows only outside production.

## How accounts work (decided 2026-10-08)
- Sign-up asks for first name, last name, mobile number, street, email and password (+ neighbourhood).
- The email is confirmed with a 6-digit code; then the **team approves** the account before it can write.
  No SMS is sent (free to run). Phone and street are seen only by the team.
- Sign-in works with the email or the phone number. A team member can issue a temporary password.

## Services not chosen yet
- **Email sender — REQUIRED before launch** (Resend: `RESEND_API_KEY`, `MAIL_FROM`; a free tier is enough
  to start). It sends the 6-digit confirmation codes and password-reset links. Without it production
  cannot confirm new accounts; development shows the code on the page instead.
- **SMS provider** — not needed. The hook exists (`SMS_API_URL`, `SMS_API_TOKEN`, `SMS_SENDER`) if one is ever wanted.
- **Google sign-in** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). The button appears only when both are set.
- **Cloudflare**: D1 database id and KV namespace ids in wrangler.jsonc are placeholders; `BETTER_AUTH_SECRET` must be set as a secret.
