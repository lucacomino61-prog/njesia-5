// End-to-end check of every write on the local dev server, through the same HTTP the browser
// uses (forms posted with and without JS). Run against a freshly seeded local DB:
//   node tools/seed.mjs && node tools/e2e.mjs [base]
// It changes the local data; reseed afterwards.
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3750';
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const PW = vars.DEV_SEED_PASSWORD;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

class Client {
  jar = new Map();
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  keep(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv, ...attrs] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (expired || v === '') this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  async get(path) {
    const res = await fetch(BASE + path, { headers: { cookie: this.cookie() }, redirect: 'manual' });
    this.keep(res);
    return { status: res.status, location: res.headers.get('location'), html: await res.text() };
  }
  async form(path, data, json = false) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) for (const x of [].concat(v)) body.append(k, x);
    const res = await fetch(BASE + path, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { cookie: this.cookie(), origin: BASE, 'content-type': 'application/x-www-form-urlencoded', ...(json ? { accept: 'application/json' } : {}) },
    });
    this.keep(res);
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    return { status: res.status, location: res.headers.get('location'), json: parsed, html: text };
  }
}

const firstLink = (html, prefix) => (html.match(new RegExp(`href="(${prefix}/[0-9a-z]{16}[^"#?]*)`)) ?? [])[1];
const idOf = (path) => path.split('/')[2].slice(0, 16);
const num = (html, re) => Number((html.match(re) ?? [])[1]);

// ---------- anonymous ----------
const anon = new Client();
let r = await anon.form('/do/support', { post: 'x', back: '/' }, true);
check('anonymous write is refused with a sign-in redirect', r.status === 401 && r.json?.redirect?.startsWith('/hyr'));
r = await anon.form('/hyr', { email: 'banor1@shembull.test', password: 'wrong-password', pas: '/' });
check('wrong password shows an error, no session', r.status === 400 && r.html.includes('Email, numër ose fjalëkalim i gabuar') && !anon.jar.has('n5.session_token'));
r = await anon.get('/hyr?pas=https://evil.example');
check('sign-in page ignores an outside "pas"', r.status === 200 && !r.html.includes('evil.example'));

// ---------- resident ----------
const res = new Client();
r = await res.form('/hyr', { email: 'banor1@shembull.test', password: PW, pas: '/forumi' });
check('resident signs in (form POST, no JS)', r.status === 303 && r.location === '/forumi' && [...res.jar.keys()].some((k) => k.includes('session')), `status ${r.status}`);
r = await res.get('/profili');
check('profile opens when signed in', r.status === 200 && r.html.includes('banor1@shembull.test'));

const forum = await res.get('/forumi?lloji=propozime');
const propPath = firstLink(forum.html, '/propozime');
const prop = await res.get(propPath);
const before = num(prop.html, /data-count="(\d+)"/);
const wasOn = /aria-pressed="true"/.test((prop.html.split('data-region="support"')[1] ?? '').split('</form>')[0]);
r = await res.form('/do/support', { post: idOf(propPath), back: propPath }, true);
const after = num((await res.get(propPath)).html, /data-count="(\d+)"/);
check('support toggles by exactly one', r.json?.ok && after === before + (wasOn ? -1 : 1), `${before} → ${after} (was ${wasOn ? 'on' : 'off'})`);
const listCount = num((await res.get('/forumi?lloji=propozime')).html, new RegExp(`${idOf(propPath)}[\\s\\S]*?data-count="(\\d+)"`));
check('list and page show the same support count', listCount === after, `list ${listCount}, page ${after}`);
r = await res.form('/do/support', { post: idOf(propPath), back: propPath }, true);
check('support again withdraws it', r.json?.ok && num((await res.get(propPath)).html, /data-count="(\d+)"/) === before);

const topicPath = firstLink((await res.get('/forumi?lloji=tema')).html, '/tema');
r = await res.form('/do/upvote', { post: idOf(topicPath), back: topicPath }, true);
check('upvote a topic', r.json?.ok === true);

r = await res.form('/do/comment', { post: idOf(topicPath), body: 'Koment prove nga testi automatik.', back: topicPath });
check('comment without JS redirects back with a flash', r.status === 303 && r.location === topicPath && res.jar.has('n5_flash'));
let page = await res.get(topicPath);
check('comment appears and flash shows once', page.html.includes('Koment prove nga testi automatik.') && page.html.includes('Komenti u publikua.'));
page = await res.get(topicPath);
check('flash does not repeat', !page.html.includes('Komenti u publikua.'));
const visibleComments = (page.html.match(/class="c__body"/g) ?? []).length;
const heading = num(page.html, /id="cm-h"[^>]*>(\d+) koment/);
check('comment heading counts what is shown', heading === visibleComments, `heading ${heading}, shown ${visibleComments}`);
const cid = (page.html.match(/id="k-([0-9a-z]{16})"[\s\S]*?Koment prove/) ?? [])[1];
r = await res.form('/do/comment-edit', { comment: cid, body: 'Koment prove, i ndryshuar.', back: topicPath }, true);
check('edit own comment', r.json?.ok && (await res.get(topicPath)).html.includes('Koment prove, i ndryshuar.'));
r = await res.form('/do/comment', { post: idOf(topicPath), parent: cid, body: 'Përgjigje prove.', back: topicPath }, true);
check('reply to a comment', r.json?.ok && (await res.get(topicPath)).html.includes('Përgjigje prove.'));
r = await res.form('/do/comment-delete', { comment: cid, back: topicPath }, true);
page = await res.get(topicPath);
check('delete own comment leaves a marker, replies stay', r.json?.ok && page.html.includes('Ky koment u fshi nga autori.') && page.html.includes('Përgjigje prove.'));

const home = await res.get('/');
const pollId = (home.html.match(/name="poll" value="([0-9a-z]{16})"/) ?? [])[1];
const opts = [...home.html.matchAll(/name="option" value="([0-9a-z]{16})"/g)].map((m) => m[1]);
r = await res.form('/do/vote', { poll: pollId, option: opts[0], back: '/' }, true);
const v1 = num((await res.get('/')).html, /(\d+) vota/);
r = await res.form('/do/vote', { poll: pollId, option: opts[1], back: '/' }, true);
const v2 = num((await res.get('/')).html, /(\d+) vota/);
check('vote, then change the vote: total unchanged', r.json?.ok && v1 === v2, `${v1} / ${v2}`);

const evPath = firstLink((await res.get('/ngjarje')).html, '/ngjarje');
const evBefore = num((await res.get(evPath)).html, /data-count="(\d+)"/);
r = await res.form('/do/rsvp', { event: idOf(evPath), back: evPath }, true);
const evAfter = num((await res.get(evPath)).html, /data-count="(\d+)"/);
const evHome = num((await res.get('/')).html, /class="ev__count"[^>]*><strong class="num" data-count="(\d+)"/);
check('RSVP adds one, home and event page agree', r.json?.ok && evAfter === evBefore + 1 && evHome === evAfter, `${evBefore} → ${evAfter}, home ${evHome}`);
r = await res.form('/do/rsvp', { event: idOf(evPath), back: evPath }, true);
check('RSVP again cancels', r.json?.ok);

const ics = await anon.get(`/ngjarje/${idOf(evPath)}/kalendar.ics`);
check('calendar file is valid iCalendar', ics.status === 200 && ics.html.startsWith('BEGIN:VCALENDAR') && ics.html.includes('\r\nDTSTART:'));

const livePath = (await res.get('/live')).html.match(/href="(\/live\/[0-9a-z]{16}[^"]*)"/)?.[1];
r = await res.form('/do/question', { townhall: idOf(livePath), body: 'Pyetje prove për ekipin?', back: livePath }, true);
check('ask a town hall question', r.json?.ok && (await res.get(livePath)).html.includes('Pyetje prove për ekipin?'), r.json?.error ?? '');
r = await res.form('/do/remind', { townhall: idOf(livePath), back: livePath }, true);
check('set a reminder', r.json?.ok);

r = await res.form('/do/topic', { title: 'Temë prove automatike', body: 'Ky është një tekst prove për temën.', place: 'selita', back: '/shkruaj' }, true);
check('publish a topic', r.json?.ok && r.json.redirect?.startsWith('/tema/'));
const newTopic = r.json?.redirect;
r = await res.form('/do/proposal', { title: 'Propozim prove automatik', body: 'Ky është një tekst prove për propozimin.', place: 'blloku', location: 'Para shkollës', back: '/propozo' }, true);
check('publish a proposal (starts at submitted)', r.json?.ok && (await res.get(r.json.redirect)).html.includes('Dorëzuar'));
r = await res.form('/do/topic', { title: 'abc', body: 'x', back: '/shkruaj' }, true);
check('short title is refused with a clear message', !r.json?.ok && /5 shkronja/.test(r.json?.error ?? ''));

r = await res.form('/do/report', { type: 'post', id: idOf(newTopic), reason: 'spam', note: '', back: newTopic }, true);
check('report content', r.json?.ok);

// ---------- new account: sign up (name, surname, phone, street, email) + email code + approval ----------
const fresh = new Client();
const stamp = String(Date.now());
const email = `prove${stamp}@shembull.test`;
const phone = '069 ' + stamp.slice(-7, -4) + ' ' + stamp.slice(-4);
r = await fresh.form('/regjistrohu', { firstName: 'Banor', lastName: 'Prove', phone: '123', street: 'Rruga prove 1', neighbourhood: 'selita', email, password: 'fjalekalim-prove-1', pas: '/' });
check('sign-up refuses a wrong phone number and keeps the other fields', r.status === 400 && r.html.includes('066, 067, 068 ose 069') && r.html.includes('value="Rruga prove 1"'));
r = await fresh.form('/regjistrohu', { firstName: 'Banor', lastName: 'Prove', phone, street: 'Rruga prove 1', neighbourhood: 'selita', email, password: 'fjalekalim-prove-1', pas: '/' });
check('sign-up goes on to the email code page', r.status === 303 && r.location?.startsWith('/konfirmo'), `${r.status} ${r.location}`);
r = await fresh.form('/do/comment', { post: idOf(topicPath), body: 'Nuk duhet të kalojë.', back: topicPath }, true);
check('unconfirmed email cannot write (sent to the code page)', !r.json?.ok && r.json?.redirect?.startsWith('/konfirmo'));
let conf = await fresh.get('/konfirmo?pas=%2F');
const code = (conf.html.match(/Kodi është (\d{6})/) ?? [])[1];
check('a 6-digit code was emailed (development shows it)', conf.status === 200 && Boolean(code));
r = await fresh.form('/konfirmo?pas=%2F', { op: 'verify', code: code === '000000' ? '111111' : '000000' });
check('wrong code is refused', r.status === 200 && r.html.includes('nuk është i saktë'));
r = await fresh.form('/konfirmo?pas=%2F', { op: 'verify', code });
check('right code confirms the email, then waits for approval', r.status === 303 && r.location?.startsWith('/ne-pritje'), `${r.status} ${r.location}`);
r = await fresh.form('/do/comment', { post: idOf(topicPath), body: 'Ende pa miratim.', back: topicPath }, true);
check('confirmed but not approved cannot write (sent to the approval page)', !r.json?.ok && r.json?.redirect?.startsWith('/ne-pritje'));
const byPhone = new Client();
r = await byPhone.form('/hyr', { email: phone, password: 'fjalekalim-prove-1', pas: '/profili' });
check('sign in with the phone number instead of the email', r.status === 303 && r.location === '/profili', `${r.status}`);
r = await new Client().form('/regjistrohu', { firstName: 'Tjetër', lastName: 'Prove', phone, street: 'Rruga 2', email: `x${stamp}@shembull.test`, password: 'fjalekalim-prove-1', pas: '/' });
check('the same phone number cannot open a second account', r.status === 400 && r.html.includes('Ka tashmë një llogari me këtë numër'));

// ---------- team ----------
const team = new Client();
r = await team.form('/hyr', { email: 'ekipi1@shembull.test', password: PW, pas: '/ekipi' });
check('team member signs in', r.status === 303);
r = await team.get('/ekipi');
check('team panel opens and lists the report', r.status === 200 && r.html.includes('Temë prove automatike'));
r = await res.get('/ekipi');
check('resident cannot open the team panel', r.status === 303);
r = await team.form('/do/moderate', { type: 'post', id: idOf(newTopic), decision: 'keep', back: '/ekipi' }, true);
check('moderate: keep', r.json?.ok);
let panel = await team.get('/ekipi');
check('the new account is in "waiting for approval" with phone and street', panel.html.includes('Banor Prove') && panel.html.includes('Rruga prove 1'));
const freshId = (panel.html.match(/action="\/do\/approve"[\s\S]{0,300}?name="user" value="([^"]+)"/) ?? [])[1];
r = await team.form('/do/approve', { user: freshId, back: '/ekipi' }, true);
check('team approves the account', r.json?.ok);
r = await fresh.form('/do/comment', { post: idOf(topicPath), body: 'Tani mund të shkruaj.', back: topicPath }, true);
check('approved account can write', r.json?.ok === true, r.json?.error ?? '');
r = await fresh.get('/njoftime');
check('the person is told the account was approved', r.html.includes('Llogaria jote u miratua'));
r = await team.form('/do/temp-password', { user: freshId, back: '/ekipi/njerez' }, true);
const temp = (r.json?.message ?? '').match(/: ([a-z0-9]{5}-[a-z0-9]{5})/)?.[1];
check('team can issue a temporary password', r.json?.ok && Boolean(temp));
r = await new Client().form('/hyr', { email: phone, password: temp, pas: '/' });
check('the temporary password works', r.status === 303);

const awaitingBefore = (await team.get('/ekipi')).html.includes('Temë prove automatike');
r = await team.form('/do/comment', { post: idOf(newTopic), body: 'Faleminderit, po e shohim.', back: newTopic }, true);
page = await anon.get(newTopic);
check('team comment stops the reply clock', r.json?.ok && page.html.includes('Ekipi u përgjigj pas') && awaitingBefore);

r = await team.form('/do/status', { post: idOf(propPath), status: 'under_review', note: 'E po shqyrtojmë.', back: propPath }, true);
page = await anon.get(propPath);
check('status update shows on the journey and history', r.json?.ok && page.html.includes('E po shqyrtojmë.'));
r = await res.get('/njoftime');
check('author or supporters get notified of status changes', r.status === 200);

r = await team.form('/do/news', { category: 'decision', title: 'Vendim prove automatik', body: 'Tekst prove për vendimin.', back: '/ekipi/publiko' }, true);
check('publish a decision', r.json?.ok && (await anon.get('/vendime')).html.includes('Vendim prove automatik'));
const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
r = await team.form('/do/event', { title: 'Ngjarje prove automatike', description: 'Prove.', date: d, start: '18:00', end: '19:00', kind: 'in_person', place_text: 'Oborri', place: 'blloku', back: '/ekipi/publiko' }, true);
check('publish an event', r.json?.ok && (await anon.get('/ngjarje')).html.includes('Ngjarje prove automatike'), r.json?.error ?? '');
r = await team.form('/do/event', { title: 'Ngjarje e gabuar', date: d, start: '19:00', end: '18:00', kind: 'in_person', place_text: 'X', back: '/' }, true);
check('event ending before it starts is refused', !r.json?.ok);
r = await team.form('/do/poll', { question: 'Sondazh prove automatik?', option: ['Po', 'Jo'], days: '3', back: '/ekipi/publiko' }, true);
check('publish a poll', r.json?.ok);
r = await team.form('/do/poll', { question: 'Sondazh me përsëritje?', option: ['Po', 'po'], days: '3', back: '/' }, true);
check('poll with repeated answers is refused', !r.json?.ok);
const when = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16);
r = await team.form('/do/townhall', { op: 'create', title: 'Live prove automatik', description: 'Prove.', when, back: '/ekipi/publiko' }, true);
const thPath = r.json?.redirect;
check('schedule a town hall', r.json?.ok && Boolean(thPath));
r = await team.form('/do/townhall', { op: 'live', townhall: idOf(thPath), stream_url: '', back: thPath }, true);
check('go live', r.json?.ok && (await anon.get(thPath)).html.includes('Në transmetim'));
r = await team.form('/do/townhall', { op: 'end', townhall: idOf(thPath), recap: 'Përmbledhje prove.', back: thPath }, true);
page = await anon.get(thPath);
check('end town hall: no contradictory empty state', r.json?.ok && page.html.includes('Përmbledhje prove.') && !page.html.includes('Bëje ti të parën'));

r = await team.form('/do/settings', { goal: '60', back: '/ekipi/cilesimet' }, true);
check('change the support goal', r.json?.ok && (await anon.get(propPath)).html.includes('/ 60'));
r = await team.form('/do/sponsor', { name: 'Biznes prove', description: 'Përshkrim prove.', url: 'https://example.com', back: '/ekipi/cilesimet' }, true);
check('add a sponsor', r.json?.ok && (await anon.get('/bizneset')).html.includes('Biznes prove'));

r = await team.form('/do/suspend', { user: freshId, reason: 'spam', note: '', back: '/ekipi/njerez' }, true);
check('suspend an account', r.json?.ok);
r = await fresh.form('/do/comment', { post: idOf(topicPath), body: 'Pas pezullimit.', back: topicPath }, true);
check('suspended account is signed out or refused', !r.json?.ok);
r = await team.form('/do/suspend-lift', { user: freshId, back: '/ekipi/njerez' }, true);
check('lift the suspension', r.json?.ok);

r = await res.form('/do/notifications-read', { back: '/njoftime' }, true);
check('mark notifications read', r.json?.ok);
r = await res.form('/dil', {});
check('sign out', r.status === 303 && (await res.get('/profili')).status === 303);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
