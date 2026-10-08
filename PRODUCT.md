# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Cloudflare Workers + D1 (user's choice, 2026-10-08). Implementation chosen within that: Astro 7 SSR with `@astrojs/cloudflare`, D1 via Drizzle, Better Auth (password hashing overridden to WebCrypto PBKDF2 so sign-in fits Workers CPU limits), photos/videos in R2 with a KV fallback. Every mutation is a real `<form method="post">` handled on the server (PRG), enhanced with fetch when JS is present. Motion: GSAP + Lenis on one ticker. Local only until the user says deploy.

## Users

Residents of Njësia Administrative Nr. 5 of Tirana — the neighbourhoods Blloku, Selita and Tirana e Re (Wikipedia lists these three; one table omits Blloku, see NEEDS_VERIFICATION.md). Mostly on phones, often in passing: checking what changed on their street, supporting an idea, saying they'll come to a meeting. A second audience is the forum team (admins/superadmins) who answer, moderate and publish.

## Product Purpose

A residents' forum for one administrative unit: residents raise problems, propose fixes and gather support; the team answers within 24 hours, moves proposals through a public status journey, publishes decisions, runs meetings and live town halls. Success = residents see their voice turn into visible outcomes, and the team's promises are measurable.

Same ideology as rrugaelbasanit.forum (the reference audited on 2026-10-08): "the best social network is the neighbourhood"; debate in service of collective wellbeing; a residents' initiative, not an official municipal site.

## Positioning

Accountability made visible: every topic shows whether and how fast the team answered, every proposal shows its support against a goal and its status journey, and the home page states the neighbourhood's week in one live sentence built from those numbers.

## Operating Context

- Reading needs no account. Writing, supporting, voting, RSVPs and questions need an account with a confirmed email and an SMS-verified Albanian mobile number (one person, one account).
- Team roles: resident, admin (moderate, publish announcements/decisions, events, polls, town halls), superadmin (also roles and settings).
- Languages: Albanian (default) and English, with indexable URLs per language.
- Installable as a phone app; push and email notifications.

## Capabilities and Constraints

Feature parity with the reference, minus its bugs (see the audit): topics, proposals (support goal, status journey submitted → under review → planned → completed/rejected, map pin, updates), polls, decisions/news with categories, events (RSVP, add to calendar, share, check-in, attendee export), live town halls (countdown, reminders, upvoted questions, recap, stream link), places/neighbourhood filters, comments with replies, edit/delete/undo, anonymous reports with auto-hide and moderation history, suspensions, notifications (in-app, push, email), sponsors (local businesses, view/click counts), team panel (overview, reports, people, settings, permissions, tracker, places, sponsors, mailbox), account close/reopen.

Constraints: Lighthouse 100 in every category on phone and desktop; no WebGL; nothing writes before JS hydration via GET; every count shown is the real count.

Undecided: operator name (placeholder), domain, SMS provider (demo mode locally), email sender, Google OAuth client, deploy.

## Brand Commitments

- The site says it is a residents' initiative and not an official site of Bashkia Tiranë; it does not use the municipality's logo or imply the municipality runs it.
- Operator: "[Operator name]" placeholder until the user supplies it.

## Evidence on Hand

- Public facts: unit office at Rruga "Nikolla Tupe", Nd. 10, Tiranë 1019 (tirana.al); neighbourhoods Blloku, Selita, Tirana e Re (Wikipedia; conflicting population figures, so no population is shown).
- Launch content: SAMPLE content (user's choice "like the original"), written to be internally consistent, credited to the team or to first-name sample residents, no fabricated municipal decisions. Listed in NEEDS_VERIFICATION.md for replacement before going public.
- No real photos, testimonials, partners or sponsors exist; sample sponsors are marked as samples in NEEDS_VERIFICATION.md.

## Product Principles

1. Show the real number, always — no count-ups from zero, no counts that disagree between pages.
2. Every promise is measured on the page (reply time, support goal, status).
3. Everything works without JavaScript first; motion is a layer, never a gate.
4. Read freely, write as a verified neighbour.
5. Plain Albanian first; English is a full peer, not a partial translation.

## Accessibility & Inclusion

WCAG 2.2 AA; older residents are a core audience (large type, 44px targets, high contrast); a Stop-animations switch in addition to prefers-reduced-motion.
