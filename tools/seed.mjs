// Sample content for local previews (the user chose to launch with sample content "like the
// original"). Everything here is SAMPLE: residents are fictional (first name + initial), the
// businesses are placeholders, and no municipal decision is claimed. Numbers agree everywhere
// because every count on the site is computed from these rows.
//
// Run: node tools/seed.mjs            (local D1: wipes the forum tables and the @shembull.test accounts)
// Sign-in for sample accounts: any seeded email + DEV_SEED_PASSWORD from .dev.vars
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const PASSWORD = vars.DEV_SEED_PASSWORD;
if (!PASSWORD) throw new Error('DEV_SEED_PASSWORD missing in .dev.vars');

const NOW = Date.now();
const H = 3_600_000;
const D = 24 * H;
const ago = (ms) => NOW - ms;

/* ---------- helpers ---------- */
const ALPHA = '0123456789abcdefghjkmnpqrstvwxyz';
let seq = 0;
function id(t = NOW) {
  let x = t;
  let head = '';
  for (let i = 0; i < 8; i++) {
    head = ALPHA[x % 32] + head;
    x = Math.floor(x / 32);
  }
  let tail = '';
  const n = seq++;
  const r = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) tail += ALPHA[(r[i] + n) % 32];
  return head + tail;
}
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = [];
const ins = (table, row) =>
  sql.push(`INSERT INTO ${table} (${Object.keys(row).map((k) => `"${k}"`).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`);

async function pbkdf2(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
  const b64 = (b) => Buffer.from(b).toString('base64');
  return `pbkdf2$sha256$100000$${b64(salt)}$${b64(bits)}`;
}
const iso = (t) => new Date(t).toISOString();

/* ---------- wipe ---------- */
for (const t of [
  'dev_outbox', 'setting', 'media', 'sponsor_stat', 'sponsor', 'user_pref', 'notification', 'suspension', 'audit_log', 'report',
  'reminder', 'question_vote', 'question', 'town_hall', 'rsvp', 'event', 'poll_vote', 'poll_option', 'poll', 'comment', 'upvote',
  'support', 'proposal_update', 'post', 'place', 'rateLimit', 'verification',
])
  sql.push(`DELETE FROM ${t};`);
// only sample and test accounts (all @shembull.test) go; real accounts, such as the owner's
// superadmin made with tools/make-super.mjs, survive a reseed
const SAMPLE = `SELECT id FROM "user" WHERE email LIKE '%@shembull.test'`;
sql.push(`DELETE FROM session WHERE userId IN (${SAMPLE});`, `DELETE FROM account WHERE userId IN (${SAMPLE});`, `DELETE FROM "user" WHERE email LIKE '%@shembull.test';`);

/* ---------- places (real neighbourhoods of Njësia 5; landmarks from public sources) ---------- */
const places = [
  { slug: 'blloku', name: 'Blloku', kind: 'lagje', phrase_sq: 'në Bllok', phrase_en: 'in Blloku' },
  { slug: 'selita', name: 'Selita', kind: 'lagje', phrase_sq: 'në Selitë', phrase_en: 'in Selita' },
  { slug: 'tirana-e-re', name: 'Tirana e Re', kind: 'lagje', phrase_sq: 'në Tiranën e Re', phrase_en: 'in Tirana e Re' },
  { slug: 'liceu-petro-nini-luarasi', name: 'Liceu Petro Nini Luarasi', kind: 'landmark', phrase_sq: 'te Liceu Petro Nini Luarasi', phrase_en: 'at Petro Nini Luarasi High School' },
  { slug: 'shkolla-besnik-sykja', name: 'Shkolla Besnik Sykja', kind: 'landmark', phrase_sq: 'te shkolla Besnik Sykja', phrase_en: 'at Besnik Sykja school' },
];
const P = {};
places.forEach((p, i) => {
  P[p.slug] = id(ago(400 * D));
  ins('place', { id: P[p.slug], ...p, shape: null, sort: i, hidden: 0, lat: null, lng: null, created_at: ago(400 * D) });
});

/* ---------- people ---------- */
const hash = await pbkdf2(PASSWORD);
const first = ['Arta', 'Gentian', 'Elona', 'Dritan', 'Ilir', 'Mirela', 'Besmir', 'Anisa', 'Klajdi', 'Rozafa', 'Ardit', 'Joana', 'Ervin', 'Sokol', 'Valbona', 'Erion', 'Teuta', 'Altin', 'Brikena', 'Fation', 'Jonida', 'Kristi', 'Lindita', 'Mentor', 'Nertila', 'Olsi', 'Pranvera', 'Redon', 'Sidorela', 'Tedi', 'Vjosa', 'Xhulio', 'Ylli', 'Zamira', 'Andi', 'Blerta', 'Denis', 'Enkelejda', 'Florian', 'Gerta', 'Herion', 'Iva', 'Juli', 'Kleda', 'Luan', 'Marsida', 'Nikolin', 'Orjeta', 'Petrit', 'Romina', 'Saimir', 'Tea', 'Uran', 'Vesa', 'Ergys', 'Ana', 'Bujar', 'Dorina', 'Emiljano', 'Fjona'];
const initials = 'KMDHBSTRPLQVZNAGFEIJ';
const hoods = ['blloku', 'selita', 'tirana-e-re'];
const users = [];
function person(name, role, i, created) {
  const uid = id(created);
  const email = role === 'resident' ? `banor${i + 1}@shembull.test` : `ekipi${i + 1}@shembull.test`;
  ins('"user"', {
    id: uid, name, email, emailVerified: 1, image: null, createdAt: iso(created), updatedAt: iso(created),
    phoneNumber: `+3556${7 + (i % 3)}${String(1000000 + (role === 'resident' ? i : 900 + i) * 7919).slice(-7)}`, phoneNumberVerified: 1,
    role, neighbourhood: role === 'resident' ? hoods[i % 3] : null, locale: 'sq', suspendedAt: null, closedAt: null,
    approvedAt: created + 6 * H, approvedBy: null, declinedAt: null, joinNote: null,
    firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '), street: null,
  });
  ins('account', { id: id(created), accountId: uid, providerId: 'credential', userId: uid, password: hash, createdAt: iso(created), updatedAt: iso(created) });
  ins('user_pref', { user_id: uid, email_decisions: 0, email_live: 0, email_inactive: 0, last_seen_at: null });
  return { id: uid, name, email };
}
const team = person('Ekipi i Forumit', 'superadmin', 0, ago(120 * D));
const team2 = person('Moderatori i Forumit', 'admin', 1, ago(100 * D));
first.forEach((f, i) => users.push(person(`${f} ${initials[i % initials.length]}.`, 'resident', i, ago((90 - i) * D))));
const U = (i) => users[i];

/* ---------- settings ---------- */
ins('setting', { key: 'proposal_goal', value: '50', updated_at: ago(60 * D), updated_by: team.id });

/* ---------- content ---------- */
function post(o) {
  const pid = id(o.created);
  ins('post', {
    id: pid, kind: o.kind, category: o.category ?? null, title: o.title, body: o.body, author_id: o.author, place_id: o.place ? P[o.place] : null,
    pinned: o.pinned ? 1 : 0, image_id: null, status: o.status ?? null, goal: null, lat: null, lng: null, location_label: o.location ?? null,
    state: 'visible', team_reply_at: o.teamReply ?? null, created_at: o.created, edited_at: null, activity_at: o.activity ?? o.created,
  });
  return pid;
}
function comment(postId, author, body, at, parent = null) {
  const cid = id(at);
  ins('comment', { id: cid, post_id: postId, parent_id: parent, author_id: author, body, state: 'visible', created_at: at, edited_at: null });
  return cid;
}
const supporters = (postId, n, from, span) => {
  for (let i = 0; i < n; i++) ins('support', { post_id: postId, user_id: U(i).id, created_at: from + Math.floor((span * i) / Math.max(1, n)) });
};
const upvoters = (postId, n, offset, from) => {
  for (let i = 0; i < n; i++) ins('upvote', { post_id: postId, user_id: U((i + offset) % users.length).id, created_at: from + i * 37 * 60_000 });
};

// Topics
const t1c = ago(3 * D + 4 * H);
const T1 = post({
  kind: 'topic', place: 'selita', author: U(0).id, created: t1c, teamReply: t1c + 5 * H, activity: ago(20 * H),
  title: 'Shkallët e Selitës mbeten në errësirë pas orës 22',
  body: 'Shkallët që lidhin rrugën kryesore me pallatet e reja fiken herët dhe natën mbeten në errësirë. Të moshuarit dhe fëmijët i shmangin. A mund të kërkojmë që dritat të qëndrojnë ndezur deri në mëngjes?',
});
comment(T1, team.id, 'Faleminderit, Arta. E kemi shënuar dhe do ta sjellim në takimin e hapur të Selitës. Nëse keni foto natën, ndajini këtu: ndihmojnë shumë.', t1c + 5 * H);
comment(T1, U(3).id, 'E njëjta gjë edhe te hyrja e dytë, afër dyqanit. Bëhet shumë errët.', t1c + 26 * H);
comment(T1, U(9).id, 'Dakord. Unë kaloj aty çdo mbrëmje me qenin dhe përdor dritën e telefonit.', ago(20 * H));
upvoters(T1, 12, 0, t1c + H);

const t2c = ago(5 * D + 2 * H);
const T2 = post({
  kind: 'topic', place: 'blloku', author: U(1).id, created: t2c, teamReply: t2c + 9 * H, activity: ago(2 * D),
  title: 'Zhurma nga lokalet pas mesnate në fundjavë',
  body: 'Të premten dhe të shtunën muzika dëgjohet fort deri në orën 2. Nuk kërkojmë të mbyllen lokalet, por të respektohet orari i qetësisë. Si mund ta ngremë këtë bashkërisht?',
});
comment(T2, team.id, 'Po mbledhim adresat ku zhurma është më e fortë, që ta paraqesim si listë konkrete. Shkruani këtu rrugën dhe orarin.', t2c + 9 * H);
comment(T2, U(14).id, 'Edhe te ne ndodh e njëjta gjë. Gjatë javës është shumë më mirë.', ago(2 * D));
upvoters(T2, 8, 10, t2c + 2 * H);

const t3c = ago(6 * H);
const T3 = post({
  kind: 'topic', place: 'tirana-e-re', author: U(2).id, created: t3c, activity: t3c,
  title: 'Koshat te këndi i lojërave mbushen që në mëngjes',
  body: 'Koshat pranë këndit të lojërave janë plot që në orën 9 dhe mbeturinat bien përtokë. Ndoshta duhet një kosh më shumë ose një tjetër orar grumbullimi.',
});
upvoters(T3, 3, 20, t3c + H);

const t4c = ago(9 * D);
const T4 = post({
  kind: 'topic', place: 'blloku', author: U(3).id, created: t4c, teamReply: t4c + 3 * H, activity: ago(6 * D),
  title: 'Vijat e kalimit të këmbësorëve janë fshirë te kryqëzimi',
  body: 'Vijat e bardha pothuajse nuk shihen më. Makinat nuk ndalojnë dhe fëmijët e shkollës kalojnë me frikë, sidomos në mëngjes.',
});
comment(T4, team.id, 'Faleminderit, Dritan. Kjo është kthyer në propozim të veçantë me firma: shiko propozimin për rilyerjen e vijave.', t4c + 3 * H);
comment(T4, U(5).id, 'Shumë e nevojshme. Unë e kaloj çdo ditë me vajzën.', ago(6 * D));
upvoters(T4, 15, 30, t4c + H);

// Proposals
const p1c = ago(12 * D);
const P1 = post({
  kind: 'proposal', place: 'selita', author: U(5).id, created: p1c, status: 'under_review', teamReply: p1c + 7 * H, activity: ago(1 * D),
  title: 'Stola dhe hije te këndi i lojërave',
  body: 'Prindërit dhe gjyshërit qëndrojnë në këmbë nën diell. Propozojmë katër stola dhe dy tenda hijeje pranë këndit të lojërave.',
  location: 'Këndi i lojërave, Selitë',
});
ins('proposal_update', { id: id(p1c), post_id: P1, status: 'submitted', note: 'Propozimi u dorëzua nga Mirela S.', author_id: team.id, created_at: p1c });
ins('proposal_update', { id: id(p1c + 7 * H), post_id: P1, status: 'under_review', note: 'E po shqyrtojmë bashkë me banorët e Selitës. Kur të arrijë qëllimin e mbështetjes, e çojmë te Njësia me firmat e mbledhura.', author_id: team.id, created_at: p1c + 7 * H });
supporters(P1, 23, p1c + H, 11 * D);
comment(P1, U(11).id, 'Edhe një çezmë uji do të ishte shumë e mirë.', ago(1 * D));

const p2c = ago(20 * D);
const P2 = post({
  kind: 'proposal', place: 'blloku', author: U(4).id, created: p2c, status: 'planned', teamReply: p2c + 4 * H, activity: ago(3 * D),
  title: 'Rilyerja e vijave të këmbësorëve para shkollës',
  body: 'Vijat para shkollës janë fshirë. Propozojmë rilyerjen e tyre dhe një tabelë “Kujdes, fëmijë” në të dy anët e rrugës.',
  location: 'Kryqëzimi para shkollës, Blloku',
});
ins('proposal_update', { id: id(p2c), post_id: P2, status: 'submitted', note: 'Propozimi u dorëzua nga Ilir B.', author_id: team.id, created_at: p2c });
ins('proposal_update', { id: id(p2c + 4 * H), post_id: P2, status: 'under_review', note: 'Mbështetje e fortë që në ditët e para. E po përgatisim për ta paraqitur.', author_id: team.id, created_at: p2c + 4 * H });
ins('proposal_update', { id: id(ago(3 * D)), post_id: P2, status: 'planned', note: 'Arriti 50 mbështetës. Ekipi do ta paraqesë me firmat në takimin e radhës me Njësinë dhe do të shkruajë këtu përgjigjen.', author_id: team.id, created_at: ago(3 * D) });
supporters(P2, 50, p2c + H, 16 * D);
comment(P2, U(7).id, 'Faleminderit që e çuat përpara. Prindërit e shkollës janë të gjithë dakord.', ago(3 * D) + 2 * H);

const p3c = ago(35 * D);
const P3 = post({
  kind: 'proposal', place: 'tirana-e-re', author: U(6).id, created: p3c, status: 'completed', teamReply: p3c + 10 * H, activity: ago(7 * D),
  title: 'Mbajtëse biçikletash te hyrja e parkut',
  body: 'Biçikletat lidhen te pemët dhe te shtyllat. Propozojmë disa mbajtëse metalike te hyrja e parkut.',
  location: 'Hyrja e parkut, Tirana e Re',
});
ins('proposal_update', { id: id(p3c), post_id: P3, status: 'submitted', note: 'Propozimi u dorëzua nga Besmir T.', author_id: team.id, created_at: p3c });
ins('proposal_update', { id: id(p3c + 10 * H), post_id: P3, status: 'under_review', note: 'Po kërkojmë vendin më të mirë bashkë me banorët.', author_id: team.id, created_at: p3c + 10 * H });
ins('proposal_update', { id: id(ago(20 * D)), post_id: P3, status: 'planned', note: 'Arriti qëllimin. Dy biznese të lagjes ofruan të mbulojnë koston.', author_id: team.id, created_at: ago(20 * D) });
ins('proposal_update', { id: id(ago(7 * D)), post_id: P3, status: 'completed', note: 'Mbajtëset u vendosën. Faleminderit të gjithëve që e mbështetët.', author_id: team.id, created_at: ago(7 * D) });
supporters(P3, 52, p3c + H, 14 * D);

const p4c = ago(2 * D);
const P4 = post({
  kind: 'proposal', place: 'selita', author: U(7).id, created: p4c, status: 'submitted', teamReply: p4c + 6 * H, activity: p4c + 6 * H,
  title: 'Një kënd leximi për fëmijët në bibliotekën e lagjes',
  body: 'Shumë fëmijë nuk kanë ku të lexojnë pasdite. Propozojmë një kënd leximi me libra të dhuruar nga banorët, të hapur dy pasdite në javë.',
});
ins('proposal_update', { id: id(p4c), post_id: P4, status: 'submitted', note: 'Propozimi u dorëzua nga Anisa R.', author_id: team.id, created_at: p4c });
comment(P4, team.id, 'Ide e bukur. Kush ka libra për të dhuruar, mund ta shkruajë këtu.', p4c + 6 * H);
supporters(P4, 6, p4c + H, D);

// Team posts (news and decisions)
const n1c = ago(30 * D);
const N1 = post({
  kind: 'news', category: 'news', pinned: true, author: team.id, created: n1c,
  title: 'Si funksionon forumi: përgjigje brenda 24 orësh',
  body: 'Çdo temë dhe çdo propozim merr një përgjigje nga ekipi brenda 24 orësh. Te çdo temë shkruhet sa kohë na u desh. Propozimet që arrijnë qëllimin e mbështetjes i çojmë te Njësia me firmat e mbledhura dhe e shkruajmë këtu çdo hap.',
});
const n2c = ago(10 * D);
post({
  kind: 'news', category: 'decision', author: team.id, created: n2c,
  title: 'Vendim: tri propozime shkojnë në takimin e radhës me Njësinë',
  body: 'Ekipi vendosi të çojë në takimin e radhës me Njësinë Administrative nr. 5 propozimet që kanë arritur ose po i afrohen qëllimit: vijat e këmbësorëve para shkollës, stolat te këndi i lojërave dhe mbajtëset e biçikletave.',
});
post({
  kind: 'news', category: 'activity', author: team.id, created: ago(3 * D),
  title: 'Aksion pastrimi në Tiranën e Re: na duhen dorashka dhe qese',
  body: 'Aksioni i pastrimit bëhet pas nëntë ditësh te hyrja e parkut. Kush mund të sjellë dorashka, qese ose karroca dore, le ta shkruajë te ngjarja.',
});
comment(N1, U(12).id, 'Shumë mirë që shkruhet koha e përgjigjes.', n1c + 2 * D);

// Poll (open, anonymous to the team)
const pollId = id(ago(3 * D));
ins('poll', { id: pollId, question: 'Cili problem duhet zgjidhur i pari në Njësinë 5?', author_id: team.id, place_id: null, named_since: null, closes_at: NOW + 4 * D, closed_at: null, state: 'visible', created_at: ago(3 * D) });
const opts = [['Parkimi mbi trotuar', 9], ['Ndriçimi natën', 7], ['Zhurma pas mesnate', 4], ['Koshat dhe pastërtia', 6]];
let voter = 0;
opts.forEach(([label, n], i) => {
  const oid = id(ago(3 * D));
  ins('poll_option', { id: oid, poll_id: pollId, label, sort: i });
  for (let k = 0; k < n; k++) {
    const at = ago(3 * D) + voter * 2 * H;
    ins('poll_vote', { poll_id: pollId, user_id: U(voter).id, option_id: oid, created_at: at, updated_at: at });
    voter++;
  }
});

// Events
function tiranaWall(y, m, d, hh, mm) {
  // Tirana is UTC+2 until the last Sunday of October, then UTC+1
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const lastSunOct = (() => { const x = new Date(Date.UTC(y, 10, 0, 1)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.getTime(); })();
  const lastSunMar = (() => { const x = new Date(Date.UTC(y, 3, 0, 1)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.getTime(); })();
  const off = guess - 2 * H >= lastSunMar && guess - 2 * H < lastSunOct ? 2 * H : H;
  return guess - off;
}
function dayPlus(n) {
  const d = new Date(NOW + 2 * H + n * D);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}
function event(o) {
  const eid = id(o.created ?? ago(5 * D));
  ins('event', { id: eid, title: o.title, description: o.description, kind: o.kind ?? 'in_person', starts_at: o.starts, ends_at: o.ends, place_text: o.place_text, place_id: o.place ? P[o.place] : null, online_url: null, image_id: null, author_id: team.id, named_since: null, state: 'visible', created_at: o.created ?? ago(5 * D) });
  for (let i = 0; i < o.going; i++) ins('rsvp', { event_id: eid, user_id: U((i + (o.offset ?? 0)) % users.length).id, created_at: (o.created ?? ago(5 * D)) + i * H, checked_in_at: o.past ? o.starts + 10 * 60_000 : null, checked_in_by: o.past ? team.id : null, reminded_at: null });
  return eid;
}
const [y1, m1, d1] = dayPlus(2);
event({ title: 'Takim i hapur me banorët e Selitës', description: 'Flasim për ndriçimin e shkallëve, stolat te këndi i lojërave dhe çdo gjë që ju shqetëson. Sillni pyetjet tuaja.', starts: tiranaWall(y1, m1, d1, 18, 0), ends: tiranaWall(y1, m1, d1, 19, 30), place_text: 'Këndi i lojërave, Selitë', place: 'selita', going: 9, offset: 3 });
const [y2, m2, d2] = dayPlus(9);
event({ title: 'Aksion pastrimi në Tiranën e Re', description: 'Dy orë pastrim rreth hyrjes së parkut. Ekipi sjell qese; sillni dorashka nëse keni.', starts: tiranaWall(y2, m2, d2, 10, 0), ends: tiranaWall(y2, m2, d2, 12, 0), place_text: 'Hyrja e parkut, Tirana e Re', place: 'tirana-e-re', going: 14, offset: 12, created: ago(3 * D) });
const [y3, m3, d3] = dayPlus(-12);
event({ title: 'Takimi i parë i forumit', description: 'Prezantuam forumin dhe mblodhëm problemet e para të lagjes.', starts: tiranaWall(y3, m3, d3, 18, 0), ends: tiranaWall(y3, m3, d3, 20, 0), place_text: 'Oborri i shkollës, Blloku', place: 'blloku', going: 17, offset: 20, past: true, created: ago(25 * D) });

// Town halls
const th1 = id(ago(31 * D));
const [y4, m4, d4] = dayPlus(-31);
const th1s = tiranaWall(y4, m4, d4, 19, 0);
ins('town_hall', { id: th1, title: 'Live i parë: çfarë dëgjuam nga ju', description: 'Pyetje dhe përgjigje me ekipin për problemet e para të lagjes.', starts_at: th1s, stream_url: null, live_at: th1s, ended_at: th1s + 50 * 60_000, recap: 'Folëm për ndriçimin, parkimin mbi trotuar dhe koshat. Tri nga pyetjet u kthyen në tema në forum.', host_id: team.id, state: 'visible', created_at: ago(38 * D) });
[
  ['Kur do të ketë përgjigje për ndriçimin e shkallëve?', 5, true],
  ['A mund të bëhet një takim edhe në Tiranën e Re?', 4, true],
  ['Si mund të ndihmoj si vullnetar?', 3, true],
  ['A mund të shtohen kosha te stacioni i autobusit?', 2, false],
].forEach(([body, votes, answered], i) => {
  const qid = id(th1s);
  ins('question', { id: qid, town_hall_id: th1, author_id: U(i + 2).id, body, answered_at: answered ? th1s + (10 + i * 8) * 60_000 : null, state: 'visible', created_at: th1s - (i + 1) * H });
  for (let k = 0; k < votes; k++) ins('question_vote', { question_id: qid, user_id: U(k + 10).id, created_at: th1s - H });
});
const th2 = id(ago(2 * D));
const [y5, m5, d5] = dayPlus(6);
ins('town_hall', { id: th2, title: 'Live me ekipin: parkimi në lagje', description: 'Parkimi mbi trotuar është problemi i parë në sondazh. Dërgoni pyetjet që tani.', starts_at: tiranaWall(y5, m5, d5, 19, 0), stream_url: null, live_at: null, ended_at: null, recap: null, host_id: team.id, state: 'visible', created_at: ago(2 * D) });
[['A do të ketë vende parkimi për banorët?', 6], ['Kush i gjobit makinat mbi trotuar?', 3]].forEach(([body, votes], i) => {
  const qid = id(ago(D));
  ins('question', { id: qid, town_hall_id: th2, author_id: U(i + 15).id, body, answered_at: null, state: 'visible', created_at: ago((i + 1) * 5 * H) });
  for (let k = 0; k < votes; k++) ins('question_vote', { question_id: qid, user_id: U(k + 25).id, created_at: ago(4 * H) });
});
for (let i = 0; i < 5; i++) ins('reminder', { town_hall_id: th2, user_id: U(i + 30).id, created_at: ago(D), sent_at: null });

// Sponsors (placeholders: replace with real businesses before launch)
ins('sponsor', { id: id(ago(40 * D)), name: 'Furra e lagjes', description: 'Bukë e ngrohtë që në orën 6 dhe byrek me gjizë çdo të premte.', url: null, phone: null, address: null, image_id: null, starts_at: ago(40 * D), ends_at: null, paused: 0, created_at: ago(40 * D) });
ins('sponsor', { id: id(ago(30 * D)), name: 'Libraria e qoshes', description: 'Libra për fëmijë dhe të rritur, dhe një tryezë ku mund të lexosh me kafe.', url: null, phone: null, address: null, image_id: null, starts_at: ago(30 * D), ends_at: null, paused: 0, created_at: ago(30 * D) });

// Notifications for the team
ins('notification', { id: id(t3c), user_id: team.id, type: 'team_thread', actor_id: U(2).id, target_type: 'post', target_id: T3, title: 'Koshat te këndi i lojërave mbushen që në mëngjes', extra: '', read_at: null, created_at: t3c });

mkdirSync('tools/.out', { recursive: true });
writeFileSync('tools/.out/seed.sql', sql.join('\n') + '\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'njesia5', '--local', '--file=tools/.out/seed.sql', '-y'], { stdio: 'inherit', shell: true });
console.log(`Seeded ${users.length} sample residents, 2 team accounts. Sign in with any banorN@shembull.test or ekipi1@shembull.test and DEV_SEED_PASSWORD.`);
