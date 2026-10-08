// Makes an existing account the forum's superadmin (the owner): full team panel, roles, settings.
// The person signs up first at /regjistrohu with their own password; this only changes the role,
// approves the account and lifts any suspension. From then on, superadmins promote others in
// Paneli i ekipit > Njerëz.
//
// Run: node tools/make-super.mjs you@example.com            (local D1)
//      node tools/make-super.mjs you@example.com --remote   (production D1, after a deploy)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const where = process.argv.includes('--remote') ? '--remote' : '--local';
// a strict shape keeps the address safe to put in SQL (no quotes, no spaces)
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error('Usage: node tools/make-super.mjs you@example.com [--remote]');
  process.exit(1);
}
if (email.endsWith('@shembull.test')) {
  console.error('That is a sample account: node tools/seed.mjs deletes it on every reseed. Use your own email.');
  process.exit(1);
}

const now = Date.now();
const sql = `UPDATE "user" SET role = 'superadmin', approvedAt = COALESCE(approvedAt, ${now}), declinedAt = NULL,
  suspendedAt = NULL, closedAt = NULL, updatedAt = '${new Date(now).toISOString()}' WHERE lower(email) = '${email}';
SELECT name, email, role, emailVerified FROM "user" WHERE lower(email) = '${email}';
`;
mkdirSync('tools/.out', { recursive: true });
writeFileSync('tools/.out/make-super.sql', sql);
// every part of this command line is fixed text; the email only travels inside the .sql file
const out = execSync(`npx wrangler d1 execute njesia5 ${where} --file=tools/.out/make-super.sql --json -y`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const rows = JSON.parse(out.slice(out.indexOf('['))).flatMap((r) => r.results ?? []);
const me = rows.find((r) => r.email?.toLowerCase() === email);
if (!me) {
  console.log(`No account with ${email} yet. Sign up at /regjistrohu with that email, then run this again.`);
  process.exit(2);
}
console.log(`${me.name} <${me.email}> is now ${me.role}.`);
if (!me.emailVerified) console.log('The email is not confirmed yet: enter the 6-digit code on /konfirmo (locally the page shows it).');
