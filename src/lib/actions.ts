// Every write on the site. Each handler checks who may act, validates input, writes in one
// batch where it can, and returns a message in the visitor's language.
import { all, batch, getSetting, newId, now, one, run, setSetting, stmt } from './db';
import { notify, notifyTeam } from './notify';
import { canWrite, isSuper, isTeam } from './auth';
import { t as tr, href } from '../i18n';
import { postPath, eventPath, townHallPath } from './paths';
import { fromTiranaWall, HOUR } from './time';
import { pollIsOpen } from './queries';
import { hashPassword } from './password';
import { normalizePhone } from './phone';

export type Result = { ok: boolean; message?: string; error?: string; redirect?: string; status?: number };
type F = FormData;
type Ctx = { user: SessionUser | null; lang: Lang; form: F; back: string };

const str = (f: F, k: string, max = 5000) => String(f.get(k) ?? '').trim().slice(0, max);
const AUTO_HIDE_REPORTS = 3;
const STATUSES = ['submitted', 'under_review', 'planned', 'completed', 'rejected'];
const CATEGORIES = ['decision', 'news', 'activity', 'success_story', 'new_business', 'neighbor'];

function gate(c: Ctx, need: 'write' | 'team' | 'super' | 'signed' = 'write'): Result | null {
  const t = tr(c.lang);
  const u = c.user;
  if (!u) return { ok: false, error: t.errors.signIn, redirect: href(c.lang, '/hyr') + `?pas=${encodeURIComponent(c.back)}`, status: 401 };
  if (need === 'signed') return null;
  if (u.closedAt) return { ok: false, error: t.errors.closed, status: 403 };
  if (u.suspendedAt) return { ok: false, error: t.errors.suspended, status: 403 };
  if (need === 'team' && !isTeam(u)) return { ok: false, error: t.errors.forbidden, status: 403 };
  if (need === 'super' && !isSuper(u)) return { ok: false, error: t.errors.forbidden, status: 403 };
  if (need === 'write' && !canWrite(u)) {
    const confirm = !u.emailVerified && !isTeam(u);
    return {
      ok: false,
      error: confirm ? t.errors.confirmEmail : t.errors.verifyPhone,
      redirect: href(c.lang, confirm ? '/konfirmo' : '/ne-pritje') + `?pas=${encodeURIComponent(c.back)}`,
      status: 403,
    };
  }
  return null;
}

/* ======================= approval ======================= */

/** What a waiting resident tells the team (team-only; cleared once the team decides). */
async function joinNote(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  const note = str(c.form, 'note', 500) || null;
  const hood = str(c.form, 'neighbourhood', 80) || null;
  const street = str(c.form, 'street', 120) || null;
  const rawPhone = str(c.form, 'phone', 30);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (hood && !(await one("SELECT 1 FROM place WHERE slug = ? AND kind = 'lagje'", hood))) return { ok: false, error: t.errors.invalid };
  if (rawPhone && !phone) return { ok: false, error: t.errors.INVALID_PHONE_NUMBER };
  if (phone && (await one('SELECT 1 FROM "user" WHERE phoneNumber = ? AND id != ?', phone, c.user!.id))) return { ok: false, error: t.errors.PHONE_NUMBER_EXIST };
  await run(
    'UPDATE "user" SET joinNote = ?, neighbourhood = COALESCE(?, neighbourhood), street = COALESCE(?, street), phoneNumber = COALESCE(?, phoneNumber) WHERE id = ? AND approvedAt IS NULL',
    note, hood, street, phone, c.user!.id,
  );
  return { ok: true, message: t.flash.saved };
}

async function decide(c: Ctx, approve: boolean): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'user', 64);
  const target = await one<{ id: string; approvedAt: number | null }>('SELECT id, approvedAt FROM "user" WHERE id = ?', id);
  if (!target) return { ok: false, error: t.errors.notFound, status: 404 };
  const ts = now();
  await batch([
    approve
      ? stmt('UPDATE "user" SET approvedAt = ?, approvedBy = ?, declinedAt = NULL, joinNote = NULL WHERE id = ?', ts, c.user!.id, id)
      : stmt('UPDATE "user" SET declinedAt = ?, approvedAt = NULL, approvedBy = NULL, joinNote = NULL WHERE id = ?', ts, id),
    audit(c.user!.id, approve ? 'approve' : 'decline', 'user', id),
  ]);
  await notify([id], approve ? 'account_approved' : 'account_declined', c.user!.id, 'user', id, '');
  return { ok: true, message: t.flash.saved };
}

async function tooFast(table: 'post' | 'comment' | 'question', userId: string, windowMs: number, max: number) {
  const col = 'author_id';
  const r = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ? AND created_at > ?`, userId, now() - windowMs);
  return (r?.n ?? 0) >= max;
}

const audit = (actor: string, action: string, type: string, id: string, detail = '') =>
  stmt('INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), actor, action, type, id, detail, now());

/* ======================= residents ======================= */

async function support(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'post', 32);
  const p = await one<{ id: string; status: string; state: string }>("SELECT id, status, state FROM post WHERE id = ? AND kind = 'proposal'", id);
  if (!p || p.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  if (!['submitted', 'under_review', 'planned'].includes(p.status)) return { ok: false, error: t.errors.proposalClosed };
  const had = await one('SELECT 1 FROM support WHERE post_id = ? AND user_id = ?', id, c.user!.id);
  if (had) await run('DELETE FROM support WHERE post_id = ? AND user_id = ?', id, c.user!.id);
  else await run('INSERT OR IGNORE INTO support (post_id, user_id, created_at) VALUES (?, ?, ?)', id, c.user!.id, now());
  return { ok: true, message: had ? t.flash.unsupported : t.flash.supported };
}

async function upvote(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'post', 32);
  const p = await one<{ state: string }>("SELECT state FROM post WHERE id = ? AND kind = 'topic'", id);
  if (!p || p.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  const had = await one('SELECT 1 FROM upvote WHERE post_id = ? AND user_id = ?', id, c.user!.id);
  if (had) await run('DELETE FROM upvote WHERE post_id = ? AND user_id = ?', id, c.user!.id);
  else await run('INSERT OR IGNORE INTO upvote (post_id, user_id, created_at) VALUES (?, ?, ?)', id, c.user!.id, now());
  return { ok: true };
}

async function vote(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const pollId = str(c.form, 'poll', 32);
  const optionId = str(c.form, 'option', 32);
  const poll = await one<{ closes_at: number | null; closed_at: number | null; state: string }>('SELECT closes_at, closed_at, state FROM poll WHERE id = ?', pollId);
  if (!poll || poll.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  if (!pollIsOpen(poll)) return { ok: false, error: t.errors.pollClosed };
  const opt = await one('SELECT 1 FROM poll_option WHERE id = ? AND poll_id = ?', optionId, pollId);
  if (!opt) return { ok: false, error: t.errors.invalid };
  await run(
    'INSERT INTO poll_vote (poll_id, user_id, option_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at',
    pollId,
    c.user!.id,
    optionId,
    now(),
  );
  return { ok: true, message: t.flash.voted };
}

async function rsvp(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'event', 32);
  const e = await one<{ title: string; ends_at: number; state: string }>('SELECT title, ends_at, state FROM event WHERE id = ?', id);
  if (!e || e.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  if (e.ends_at < now()) return { ok: false, error: t.errors.eventPast };
  const had = await one('SELECT 1 FROM rsvp WHERE event_id = ? AND user_id = ?', id, c.user!.id);
  if (had) await run('DELETE FROM rsvp WHERE event_id = ? AND user_id = ?', id, c.user!.id);
  else {
    await run('INSERT OR IGNORE INTO rsvp (event_id, user_id, created_at) VALUES (?, ?, ?)', id, c.user!.id, now());
    if (!isTeam(c.user)) await notifyTeam('team_rsvp', c.user!.id, 'event', id, e.title);
  }
  return { ok: true, message: had ? t.flash.unrsvp : t.flash.rsvp };
}

async function comment(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const postId = str(c.form, 'post', 32);
  const parentId = str(c.form, 'parent', 32) || null;
  const body = str(c.form, 'body', 3000);
  if (body.length < 2) return { ok: false, error: t.errors.invalid };
  if (!isTeam(c.user) && (await tooFast('comment', c.user!.id, 60_000, 6))) return { ok: false, error: t.errors.rateLimited, status: 429 };
  const p = await one<{ id: string; kind: string; title: string; author_id: string; state: string; team_reply_at: number | null; author_role: string | null }>(
    'SELECT p.id, p.kind, p.title, p.author_id, p.state, p.team_reply_at, u.role AS author_role FROM post p JOIN "user" u ON u.id = p.author_id WHERE p.id = ?',
    postId,
  );
  if (!p || p.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  let parentAuthor: string | null = null;
  if (parentId) {
    const parent = await one<{ author_id: string; parent_id: string | null }>('SELECT author_id, parent_id FROM comment WHERE id = ? AND post_id = ?', parentId, postId);
    if (!parent) return { ok: false, error: t.errors.notFound };
    parentAuthor = parent.author_id;
  }
  const id = newId();
  const ts = now();
  const team = isTeam(c.user);
  const firstTeamReply = team && !p.team_reply_at && p.kind !== 'news' && !(p.author_role === 'admin' || p.author_role === 'superadmin');
  await batch([
    stmt('INSERT INTO comment (id, post_id, parent_id, author_id, body, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, postId, parentId, c.user!.id, body, 'visible', ts),
    stmt(`UPDATE post SET activity_at = ?${firstTeamReply ? ', team_reply_at = ?' : ''} WHERE id = ?`, ...(firstTeamReply ? [ts, ts, postId] : [ts, postId])),
  ]);
  if (parentAuthor) await notify([parentAuthor], 'comment_reply', c.user!.id, 'post', postId, p.title);
  if (p.author_id !== parentAuthor)
    await notify([p.author_id], p.kind === 'proposal' ? 'new_comment_proposal' : 'new_comment_post', c.user!.id, 'post', postId, p.title);
  if (!team) await notifyTeam('team_comment', c.user!.id, 'post', postId, p.title);
  return { ok: true, message: t.flash.commented };
}

async function commentEdit(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'comment', 32);
  const body = str(c.form, 'body', 3000);
  if (body.length < 2) return { ok: false, error: t.errors.invalid };
  const cm = await one<{ author_id: string; state: string }>('SELECT author_id, state FROM comment WHERE id = ?', id);
  if (!cm || cm.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  if (cm.author_id !== c.user!.id) return { ok: false, error: t.errors.forbidden, status: 403 };
  await run('UPDATE comment SET body = ?, edited_at = ? WHERE id = ?', body, now(), id);
  return { ok: true, message: t.flash.saved };
}

async function commentDelete(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'comment', 32);
  const cm = await one<{ author_id: string; state: string }>('SELECT author_id, state FROM comment WHERE id = ?', id);
  if (!cm) return { ok: false, error: t.errors.notFound, status: 404 };
  if (cm.author_id === c.user!.id) {
    await run("UPDATE comment SET state = 'deleted' WHERE id = ?", id);
  } else if (isTeam(c.user)) {
    await batch([stmt("UPDATE comment SET state = 'removed' WHERE id = ?", id), audit(c.user!.id, 'remove', 'comment', id)]);
  } else return { ok: false, error: t.errors.forbidden, status: 403 };
  return { ok: true, message: t.flash.saved };
}

const REPORT_TABLE: Record<string, string> = { post: 'post', comment: 'comment', poll: 'poll', event: 'event', question: 'question' };

async function report(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const type = str(c.form, 'type', 16);
  const id = str(c.form, 'id', 32);
  const reason = str(c.form, 'reason', 20);
  const note = str(c.form, 'note', 1000);
  const table = REPORT_TABLE[type];
  if (!table || !['spam', 'abuse', 'off_topic', 'false_info', 'other'].includes(reason)) return { ok: false, error: t.errors.invalid };
  const target = await one<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id);
  if (!target) return { ok: false, error: t.errors.notFound, status: 404 };
  // reporters whose last three reports were all found unfounded stop counting toward auto-hiding
  const history = await all<{ resolution: string | null }>(
    'SELECT resolution FROM report WHERE reporter_id = ? AND resolution IS NOT NULL ORDER BY resolved_at DESC LIMIT 3',
    c.user!.id,
  );
  const counted = history.length === 3 && history.every((h) => h.resolution === 'kept') ? 0 : 1;
  await run(
    'INSERT OR IGNORE INTO report (id, target_type, target_id, reporter_id, reason, note, counted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    newId(),
    type,
    id,
    c.user!.id,
    reason,
    note,
    counted,
    now(),
  );
  const open = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM report WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL AND counted = 1',
    type,
    id,
  );
  if ((open?.n ?? 0) >= AUTO_HIDE_REPORTS && target.state === 'visible') await run(`UPDATE ${table} SET state = 'review' WHERE id = ?`, id);
  await notifyTeam('team_report', c.user!.id, type, id, '');
  return { ok: true, message: t.report.thanks };
}

async function question(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const th = str(c.form, 'townhall', 32);
  const body = str(c.form, 'body', 500);
  if (body.length < 5) return { ok: false, error: t.errors.bodyShort };
  const row = await one<{ title: string; ended_at: number | null; starts_at: number; state: string }>('SELECT title, ended_at, starts_at, state FROM town_hall WHERE id = ?', th);
  if (!row || row.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  if (row.ended_at || row.starts_at < now() - 6 * HOUR) return { ok: false, error: t.live.closed };
  if (await tooFast('question', c.user!.id, 10 * 60_000, 3)) return { ok: false, error: t.errors.rateLimited, status: 429 };
  await run('INSERT INTO question (id, town_hall_id, author_id, body, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), th, c.user!.id, body, 'visible', now());
  if (!isTeam(c.user)) await notifyTeam('team_question', c.user!.id, 'town_hall', th, body.slice(0, 120));
  return { ok: true, message: t.flash.asked };
}

async function questionVote(c: Ctx): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'question', 32);
  const q = await one<{ state: string; answered_at: number | null }>('SELECT state, answered_at FROM question WHERE id = ?', id);
  if (!q || q.state !== 'visible') return { ok: false, error: t.errors.notFound, status: 404 };
  const had = await one('SELECT 1 FROM question_vote WHERE question_id = ? AND user_id = ?', id, c.user!.id);
  if (had) await run('DELETE FROM question_vote WHERE question_id = ? AND user_id = ?', id, c.user!.id);
  else await run('INSERT OR IGNORE INTO question_vote (question_id, user_id, created_at) VALUES (?, ?, ?)', id, c.user!.id, now());
  return { ok: true };
}

async function remind(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'townhall', 32);
  const row = await one<{ live_at: number | null; ended_at: number | null }>('SELECT live_at, ended_at FROM town_hall WHERE id = ?', id);
  if (!row || row.ended_at) return { ok: false, error: t.errors.notFound, status: 404 };
  const had = await one('SELECT 1 FROM reminder WHERE town_hall_id = ? AND user_id = ?', id, c.user!.id);
  if (had) await run('DELETE FROM reminder WHERE town_hall_id = ? AND user_id = ?', id, c.user!.id);
  else await run('INSERT OR IGNORE INTO reminder (town_hall_id, user_id, created_at) VALUES (?, ?, ?)', id, c.user!.id, now());
  return { ok: true, message: had ? undefined : t.flash.reminded };
}

async function createPost(c: Ctx, kind: 'topic' | 'proposal'): Promise<Result> {
  const g = gate(c);
  if (g) return g;
  const t = tr(c.lang);
  const title = str(c.form, 'title', 140);
  const body = str(c.form, 'body', 6000);
  const placeSlug = str(c.form, 'place', 80);
  const location = str(c.form, 'location', 140) || null;
  if (title.length < 5) return { ok: false, error: t.errors.titleShort };
  if (body.length < 10) return { ok: false, error: t.errors.bodyShort };
  if (!isTeam(c.user) && (await tooFast('post', c.user!.id, 10 * 60_000, 3))) return { ok: false, error: t.errors.rateLimited, status: 429 };
  const place = placeSlug ? await one<{ id: string }>('SELECT id FROM place WHERE slug = ? AND hidden = 0', placeSlug) : null;
  const id = newId();
  const ts = now();
  const stmts = [
    stmt(
      'INSERT INTO post (id, kind, title, body, author_id, place_id, status, location_label, state, created_at, activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      kind,
      title,
      body,
      c.user!.id,
      place?.id ?? null,
      kind === 'proposal' ? 'submitted' : null,
      kind === 'proposal' ? location : null,
      'visible',
      ts,
      ts,
    ),
  ];
  if (kind === 'proposal')
    stmts.push(stmt('INSERT INTO proposal_update (id, post_id, status, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), id, 'submitted', '', c.user!.id, ts));
  await batch(stmts);
  if (!isTeam(c.user)) await notifyTeam(kind === 'proposal' ? 'team_proposal' : 'team_thread', c.user!.id, 'post', id, title);
  return { ok: true, message: t.compose.published, redirect: href(c.lang, postPath({ kind, id, title })) };
}

async function postDelete(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'post', 32);
  const p = await one<{ author_id: string; kind: string }>('SELECT author_id, kind FROM post WHERE id = ?', id);
  if (!p) return { ok: false, error: t.errors.notFound, status: 404 };
  if (p.author_id === c.user!.id) {
    // once others have engaged, only the team can remove it (keeps conversations intact)
    const engaged = await one<{ n: number }>(
      "SELECT (SELECT COUNT(*) FROM comment WHERE post_id = ?1 AND author_id != ?2 AND state = 'visible') + (SELECT COUNT(*) FROM support WHERE post_id = ?1 AND user_id != ?2) AS n",
      id,
      c.user!.id,
    );
    if ((engaged?.n ?? 0) > 0 && !isTeam(c.user)) return { ok: false, error: t.errors.forbidden, status: 403 };
    await run("UPDATE post SET state = 'deleted' WHERE id = ?", id);
  } else if (isTeam(c.user)) {
    await batch([stmt("UPDATE post SET state = 'removed' WHERE id = ?", id), audit(c.user!.id, 'remove', 'post', id)]);
  } else return { ok: false, error: t.errors.forbidden, status: 403 };
  return { ok: true, message: t.flash.saved, redirect: href(c.lang, p.kind === 'news' ? '/vendime' : '/forumi') };
}

async function notificationsRead(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  await run('UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), c.user!.id);
  return { ok: true };
}

async function profile(c: Ctx): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  const name = str(c.form, 'name', 80);
  const hood = str(c.form, 'neighbourhood', 80) || null;
  const street = str(c.form, 'street', 120) || null;
  const rawPhone = str(c.form, 'phone', 30);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (name.length < 2) return { ok: false, error: t.errors.invalid };
  if (rawPhone && !phone) return { ok: false, error: t.errors.INVALID_PHONE_NUMBER };
  if (phone && (await one('SELECT 1 FROM "user" WHERE phoneNumber = ? AND id != ?', phone, c.user!.id))) return { ok: false, error: t.errors.PHONE_NUMBER_EXIST };
  if (hood && !(await one("SELECT 1 FROM place WHERE slug = ? AND kind = 'lagje'", hood))) return { ok: false, error: t.errors.invalid };
  await batch([
    stmt('UPDATE "user" SET name = ?, neighbourhood = ?, street = ?, phoneNumber = COALESCE(?, phoneNumber), updatedAt = ? WHERE id = ?', name, hood, street, phone, new Date().toISOString(), c.user!.id),
    stmt(
      'INSERT INTO user_pref (user_id, email_decisions, email_live) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET email_decisions = ?2, email_live = ?3',
      c.user!.id,
      c.form.get('email_decisions') ? 1 : 0,
      c.form.get('email_live') ? 1 : 0,
    ),
  ]);
  return { ok: true, message: t.flash.saved };
}

async function accountClose(c: Ctx, reopen: boolean): Promise<Result> {
  const g = gate(c, 'signed');
  if (g) return g;
  const t = tr(c.lang);
  if (!reopen && isSuper(c.user)) {
    const supers = await one<{ n: number }>("SELECT COUNT(*) AS n FROM \"user\" WHERE role = 'superadmin' AND closedAt IS NULL");
    if ((supers?.n ?? 0) <= 1) return { ok: false, error: t.errors.forbidden };
  }
  await run('UPDATE "user" SET closedAt = ?, updatedAt = ? WHERE id = ?', reopen ? null : now(), new Date().toISOString(), c.user!.id);
  // hide or restore what they wrote (only what the close itself hid)
  await batch([
    stmt(reopen ? "UPDATE post SET state = 'visible' WHERE author_id = ? AND state = 'deleted' AND edited_at = -1" : "UPDATE post SET state = 'deleted', edited_at = -1 WHERE author_id = ? AND state = 'visible'", c.user!.id),
    stmt(reopen ? "UPDATE comment SET state = 'visible', edited_at = NULL WHERE author_id = ? AND state = 'deleted' AND edited_at = -1" : "UPDATE comment SET state = 'deleted', edited_at = -1 WHERE author_id = ? AND state = 'visible'", c.user!.id),
  ]);
  if (reopen) await run('UPDATE post SET edited_at = NULL WHERE author_id = ? AND edited_at = -1', c.user!.id);
  return { ok: true, message: t.flash.saved };
}

/* ======================= team ======================= */

async function proposalStatus(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'post', 32);
  const status = str(c.form, 'status', 20);
  const note = str(c.form, 'note', 2000);
  if (!STATUSES.includes(status)) return { ok: false, error: t.errors.invalid };
  const p = await one<{ title: string; author_id: string; team_reply_at: number | null }>("SELECT title, author_id, team_reply_at FROM post WHERE id = ? AND kind = 'proposal'", id);
  if (!p) return { ok: false, error: t.errors.notFound, status: 404 };
  const ts = now();
  await batch([
    stmt('INSERT INTO proposal_update (id, post_id, status, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), id, status, note, c.user!.id, ts),
    stmt('UPDATE post SET status = ?, activity_at = ?, team_reply_at = COALESCE(team_reply_at, ?) WHERE id = ?', status, ts, ts, id),
    audit(c.user!.id, 'status:' + status, 'post', id, note.slice(0, 200)),
  ]);
  const label = t.proposal.status[status];
  await notify([p.author_id], 'proposal_status_mine', c.user!.id, 'post', id, p.title, label);
  const backers = await all<{ user_id: string }>('SELECT user_id FROM support WHERE post_id = ? AND user_id != ?', id, p.author_id);
  await notify(backers.map((b) => b.user_id), 'proposal_status_supported', c.user!.id, 'post', id, p.title, label);
  return { ok: true, message: t.flash.saved };
}

async function moderate(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const type = str(c.form, 'type', 16);
  const id = str(c.form, 'id', 32);
  const decision = str(c.form, 'decision', 10);
  const table = REPORT_TABLE[type];
  if (!table || !['keep', 'remove', 'restore'].includes(decision)) return { ok: false, error: t.errors.invalid };
  const state = decision === 'remove' ? 'removed' : 'visible';
  const ts = now();
  await batch([
    stmt(`UPDATE ${table} SET state = ? WHERE id = ?`, state, id),
    stmt('UPDATE report SET resolved_at = ?, resolution = ? WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL', ts, decision === 'remove' ? 'removed' : 'kept', type, id),
    audit(c.user!.id, decision, type, id),
  ]);
  return { ok: true, message: t.flash.saved };
}

async function publishNews(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const title = str(c.form, 'title', 160);
  const body = str(c.form, 'body', 10000);
  const category = str(c.form, 'category', 30);
  if (title.length < 5 || body.length < 10 || !CATEGORIES.includes(category)) return { ok: false, error: t.errors.invalid };
  const id = newId();
  const ts = now();
  const pinned = c.form.get('pinned') ? 1 : 0;
  await batch([
    ...(pinned ? [stmt("UPDATE post SET pinned = 0 WHERE kind = 'news'")] : []),
    stmt('INSERT INTO post (id, kind, category, title, body, author_id, pinned, state, created_at, activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'news', category, title, body, c.user!.id, pinned, 'visible', ts, ts),
    audit(c.user!.id, 'publish', 'post', id),
  ]);
  return { ok: true, message: t.compose.published, redirect: href(c.lang, postPath({ kind: 'news', id, title })) };
}

async function createEvent(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const title = str(c.form, 'title', 140);
  const description = str(c.form, 'description', 4000);
  const date = str(c.form, 'date', 10);
  const starts = fromTiranaWall(`${date}T${str(c.form, 'start', 5)}`);
  const ends = fromTiranaWall(`${date}T${str(c.form, 'end', 5)}`);
  const kind = str(c.form, 'kind', 12) === 'online' ? 'online' : 'in_person';
  const placeText = str(c.form, 'place_text', 140);
  const onlineUrl = str(c.form, 'online_url', 300) || null;
  const placeSlug = str(c.form, 'place', 80);
  if (title.length < 5 || !starts || !ends || ends <= starts || (kind === 'in_person' && !placeText)) return { ok: false, error: t.errors.invalid };
  if (onlineUrl && !/^https:\/\//.test(onlineUrl)) return { ok: false, error: t.errors.invalid };
  const place = placeSlug ? await one<{ id: string }>('SELECT id FROM place WHERE slug = ?', placeSlug) : null;
  const id = newId();
  await batch([
    stmt(
      'INSERT INTO event (id, title, description, kind, starts_at, ends_at, place_text, place_id, online_url, author_id, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, title, description, kind, starts, ends, placeText, place?.id ?? null, onlineUrl, c.user!.id, 'visible', now(),
    ),
    audit(c.user!.id, 'publish', 'event', id),
  ]);
  return { ok: true, message: t.compose.published, redirect: href(c.lang, eventPath({ id, title })) };
}

async function createPoll(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const question = str(c.form, 'question', 200);
  const options = c.form.getAll('option').map((o) => String(o).trim().slice(0, 120)).filter(Boolean);
  const days = Math.min(60, Math.max(0, Number(str(c.form, 'days', 3)) || 0));
  const unique = new Set(options.map((o) => o.toLowerCase()));
  if (question.length < 5 || options.length < 2 || unique.size !== options.length) return { ok: false, error: t.errors.invalid };
  const id = newId();
  const ts = now();
  await batch([
    stmt('INSERT INTO poll (id, question, author_id, closes_at, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, question, c.user!.id, days ? ts + days * 24 * HOUR : null, 'visible', ts),
    ...options.map((label, i) => stmt('INSERT INTO poll_option (id, poll_id, label, sort) VALUES (?, ?, ?, ?)', newId(), id, label, i)),
    audit(c.user!.id, 'publish', 'poll', id),
  ]);
  return { ok: true, message: t.compose.published, redirect: href(c.lang, '/forumi?lloji=sondazhe') };
}

async function closePoll(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const id = str(c.form, 'poll', 32);
  await batch([stmt('UPDATE poll SET closed_at = ? WHERE id = ? AND closed_at IS NULL', now(), id), audit(c.user!.id, 'close', 'poll', id)]);
  return { ok: true, message: tr(c.lang).flash.saved };
}

async function townHall(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const op = str(c.form, 'op', 12);
  const id = str(c.form, 'townhall', 32);
  const ts = now();
  if (op === 'create') {
    const title = str(c.form, 'title', 140);
    const description = str(c.form, 'description', 2000);
    const starts = fromTiranaWall(str(c.form, 'when', 16));
    if (title.length < 5 || !starts) return { ok: false, error: t.errors.invalid };
    const nid = newId();
    await batch([
      stmt('INSERT INTO town_hall (id, title, description, starts_at, host_id, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', nid, title, description, starts, c.user!.id, 'visible', ts),
      audit(c.user!.id, 'publish', 'town_hall', nid),
    ]);
    return { ok: true, message: t.compose.published, redirect: href(c.lang, townHallPath({ id: nid, title })) };
  }
  const row = await one<{ title: string }>('SELECT title FROM town_hall WHERE id = ?', id);
  if (!row) return { ok: false, error: t.errors.notFound, status: 404 };
  if (op === 'live') {
    const url = str(c.form, 'stream_url', 300) || null;
    if (url && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|facebook\.com|fb\.watch)\//.test(url)) return { ok: false, error: t.errors.invalid };
    await run('UPDATE town_hall SET live_at = ?, stream_url = ? WHERE id = ?', ts, url, id);
    const waiting = await all<{ user_id: string }>('SELECT user_id FROM reminder WHERE town_hall_id = ?', id);
    await notify(waiting.map((w) => w.user_id), 'town_hall_live', c.user!.id, 'town_hall', id, row.title);
  } else if (op === 'end') {
    await run('UPDATE town_hall SET ended_at = ?, recap = ? WHERE id = ?', ts, str(c.form, 'recap', 3000) || null, id);
  } else if (op === 'answer') {
    const q = str(c.form, 'question', 32);
    const qr = await one<{ author_id: string; answered_at: number | null }>('SELECT author_id, answered_at FROM question WHERE id = ? AND town_hall_id = ?', q, id);
    if (!qr) return { ok: false, error: t.errors.notFound };
    await run('UPDATE question SET answered_at = ? WHERE id = ?', qr.answered_at ? null : ts, q);
    if (!qr.answered_at) await notify([qr.author_id], 'question_answered', c.user!.id, 'town_hall', id, row.title);
  } else return { ok: false, error: t.errors.invalid };
  return { ok: true, message: t.flash.saved };
}

async function role(c: Ctx): Promise<Result> {
  const g = gate(c, 'super');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'user', 64);
  const r = str(c.form, 'role', 20);
  if (!['resident', 'admin', 'superadmin'].includes(r) || id === c.user!.id) return { ok: false, error: t.errors.invalid };
  await batch([stmt('UPDATE "user" SET role = ? WHERE id = ?', r, id), audit(c.user!.id, 'role:' + r, 'user', id)]);
  return { ok: true, message: t.flash.saved };
}

async function suspend(c: Ctx, lift: boolean): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'user', 64);
  const target = await one<{ role: string | null }>('SELECT role FROM "user" WHERE id = ?', id);
  if (!target || id === c.user!.id || target.role === 'superadmin') return { ok: false, error: t.errors.forbidden };
  const ts = now();
  if (lift) {
    await batch([
      stmt('UPDATE "user" SET suspendedAt = NULL WHERE id = ?', id),
      stmt('UPDATE suspension SET lifted_at = ?, lifted_by = ? WHERE user_id = ? AND lifted_at IS NULL', ts, c.user!.id, id),
      audit(c.user!.id, 'lift', 'user', id),
    ]);
  } else {
    const reason = str(c.form, 'reason', 30) || 'other';
    await batch([
      stmt('UPDATE "user" SET suspendedAt = ? WHERE id = ?', ts, id),
      stmt('INSERT INTO suspension (id, user_id, by_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), id, c.user!.id, reason, str(c.form, 'note', 500), ts),
      stmt('DELETE FROM session WHERE userId = ?', id),
      audit(c.user!.id, 'suspend', 'user', id, reason),
    ]);
  }
  return { ok: true, message: t.flash.saved };
}

async function settings(c: Ctx): Promise<Result> {
  const g = gate(c, 'super');
  if (g) return g;
  const t = tr(c.lang);
  const goal = Number(str(c.form, 'goal', 5));
  if (!Number.isInteger(goal) || goal < 5 || goal > 5000) return { ok: false, error: t.errors.invalid };
  await setSetting('proposal_goal', goal, c.user!.id);
  return { ok: true, message: t.flash.saved };
}

async function sponsorSave(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'sponsor', 32);
  const op = str(c.form, 'op', 10);
  if (op === 'pause' || op === 'resume') {
    await run('UPDATE sponsor SET paused = ? WHERE id = ?', op === 'pause' ? 1 : 0, id);
    return { ok: true, message: t.flash.saved };
  }
  const name = str(c.form, 'name', 80);
  const description = str(c.form, 'description', 240);
  const url = str(c.form, 'url', 300) || null;
  if (name.length < 2 || description.length < 5 || (url && !/^https:\/\//.test(url))) return { ok: false, error: t.errors.invalid };
  await run(
    'INSERT INTO sponsor (id, name, description, url, phone, address, starts_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    newId(), name, description, url, str(c.form, 'phone', 30) || null, str(c.form, 'address', 140) || null, now(), now(),
  );
  return { ok: true, message: t.flash.saved };
}

/** A temporary password the team reads out to someone who cannot reset by email (phone accounts). */
async function tempPassword(c: Ctx): Promise<Result> {
  const g = gate(c, 'team');
  if (g) return g;
  const t = tr(c.lang);
  const id = str(c.form, 'user', 64);
  const target = await one<{ role: string | null }>('SELECT role FROM "user" WHERE id = ?', id);
  if (!target || (target.role === 'superadmin' && id !== c.user!.id)) return { ok: false, error: t.errors.forbidden, status: 403 };
  const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const pw = [...bytes].map((b) => ALPHA[b % ALPHA.length]).join('').replace(/(.{5})/, '$1-');
  const hash = await hashPassword(pw);
  const ts = new Date().toISOString();
  const has = await one('SELECT 1 FROM account WHERE userId = ? AND providerId = ?', id, 'credential');
  await batch([
    has
      ? stmt("UPDATE account SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'", hash, ts, id)
      : stmt("INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)", newId(), id, id, hash, ts, ts),
    stmt('DELETE FROM session WHERE userId = ?', id),
    audit(c.user!.id, 'temp-password', 'user', id),
  ]);
  return {
    ok: true,
    message:
      c.lang === 'sq'
        ? `Fjalëkalimi i përkohshëm: ${pw}. Thuaja personit; e ndryshon te profili pasi të hyjë.`
        : `Temporary password: ${pw}. Tell the person; they change it in their profile after signing in.`,
  };
}

export const ACTIONS: Record<string, (c: Ctx) => Promise<Result>> = {
  support,
  upvote,
  vote,
  rsvp,
  comment,
  'comment-edit': commentEdit,
  'comment-delete': commentDelete,
  report,
  question,
  'question-vote': questionVote,
  remind,
  topic: (c) => createPost(c, 'topic'),
  proposal: (c) => createPost(c, 'proposal'),
  'post-delete': postDelete,
  'notifications-read': notificationsRead,
  profile,
  'account-close': (c) => accountClose(c, false),
  'account-reopen': (c) => accountClose(c, true),
  status: proposalStatus,
  moderate,
  news: publishNews,
  event: createEvent,
  poll: createPoll,
  'poll-close': closePoll,
  townhall: townHall,
  role,
  suspend: (c) => suspend(c, false),
  'suspend-lift': (c) => suspend(c, true),
  settings,
  sponsor: sponsorSave,
  'join-note': joinNote,
  approve: (c) => decide(c, true),
  'temp-password': tempPassword,
  decline: (c) => decide(c, false),
};

export { getSetting };
