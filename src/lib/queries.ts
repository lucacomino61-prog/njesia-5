// Reads. Every count is computed from rows at read time, with the same SQL fragment wherever it
// appears, so a number can never disagree between two pages.
import { all, getSetting, one } from './db';
import { DAY } from './time';

export interface Place {
  id: string;
  slug: string;
  name: string;
  kind: 'lagje' | 'landmark';
  phrase_sq: string;
  phrase_en: string;
  shape: string | null;
  lat: number | null;
  lng: number | null;
}

export const placePhrase = (p: Pick<Place, 'phrase_sq' | 'phrase_en'>, lang: Lang) =>
  lang === 'sq' ? p.phrase_sq : p.phrase_en;

export const listPlaces = () =>
  all<Place>('SELECT id, slug, name, kind, phrase_sq, phrase_en, shape, lat, lng FROM place WHERE hidden = 0 ORDER BY sort, name');

export const proposalGoal = () => getSetting<number>('proposal_goal', 50);

/* shared count fragments */
const C_COMMENTS = "(SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id AND c.state = 'visible')";
const C_UPVOTES = '(SELECT COUNT(*) FROM upvote u WHERE u.post_id = p.id)';
const C_SUPPORT = '(SELECT COUNT(*) FROM support s WHERE s.post_id = p.id)';

export interface FeedPost {
  id: string;
  kind: 'topic' | 'news' | 'proposal';
  category: string | null;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  author_role: string | null;
  place_slug: string | null;
  place_name: string | null;
  place_phrase_sq: string | null;
  place_phrase_en: string | null;
  pinned: number;
  image_id: string | null;
  status: string | null;
  goal: number | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  state: string;
  team_reply_at: number | null;
  created_at: number;
  edited_at: number | null;
  activity_at: number;
  comments: number;
  upvotes: number;
  supports: number;
  mine_upvoted: number;
  mine_supported: number;
}

const POST_COLUMNS = `p.id, p.kind, p.category, p.title, p.body, p.author_id, u.name AS author_name, u.role AS author_role,
  pl.slug AS place_slug, pl.name AS place_name, pl.phrase_sq AS place_phrase_sq, pl.phrase_en AS place_phrase_en,
  p.pinned, p.image_id, p.status, p.goal, p.location_label, p.lat, p.lng, p.state, p.team_reply_at,
  p.created_at, p.edited_at, p.activity_at,
  ${C_COMMENTS} AS comments, ${C_UPVOTES} AS upvotes, ${C_SUPPORT} AS supports,
  EXISTS (SELECT 1 FROM upvote x WHERE x.post_id = p.id AND x.user_id = ?1) AS mine_upvoted,
  EXISTS (SELECT 1 FROM support x WHERE x.post_id = p.id AND x.user_id = ?1) AS mine_supported`;

const POST_FROM = `FROM post p JOIN "user" u ON u.id = p.author_id LEFT JOIN place pl ON pl.id = p.place_id`;

export type FeedType = 'all' | 'topics' | 'proposals' | 'delivered' | 'polls';

export async function feedPosts(opts: { type: FeedType; place?: string | null; viewer?: string | null; limit?: number; before?: number | null }) {
  const where = ["p.state = 'visible'", 'u.closedAt IS NULL'];
  const args: unknown[] = [opts.viewer ?? ''];
  if (opts.type === 'topics') where.push("p.kind = 'topic'");
  else if (opts.type === 'proposals') where.push("p.kind = 'proposal' AND p.status NOT IN ('completed', 'rejected')");
  else if (opts.type === 'delivered') where.push("p.kind = 'proposal' AND p.status = 'completed'");
  else where.push("p.kind IN ('topic', 'proposal')");
  if (opts.place) {
    args.push(opts.place);
    where.push(`pl.slug = ?${args.length}`);
  }
  if (opts.before) {
    args.push(opts.before);
    where.push(`p.activity_at < ?${args.length}`);
  }
  args.push(opts.limit ?? 20);
  return all<FeedPost>(
    `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE ${where.join(' AND ')} ORDER BY p.pinned DESC, p.activity_at DESC LIMIT ?${args.length}`,
    ...args,
  );
}

export async function newsPosts(opts: { category?: string | null; viewer?: string | null; limit?: number }) {
  const args: unknown[] = [opts.viewer ?? ''];
  let extra = '';
  if (opts.category) {
    args.push(opts.category);
    extra = ` AND p.category = ?${args.length}`;
  }
  args.push(opts.limit ?? 30);
  return all<FeedPost>(
    `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.kind = 'news' AND p.state = 'visible'${extra} ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?${args.length}`,
    ...args,
  );
}

export const getPost = (id: string, viewer?: string | null) =>
  one<FeedPost>(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = ?2`, viewer ?? '', id);

export interface CommentRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  author_role: string | null;
  body: string;
  state: string;
  created_at: number;
  edited_at: number | null;
}

export const listComments = (postId: string) =>
  all<CommentRow>(
    `SELECT c.id, c.parent_id, c.author_id, u.name AS author_name, u.role AS author_role, c.body, c.state, c.created_at, c.edited_at
     FROM comment c JOIN "user" u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at`,
    postId,
  );

export interface UpdateRow {
  id: string;
  status: string;
  note: string;
  author_name: string;
  created_at: number;
}
export const listUpdates = (postId: string) =>
  all<UpdateRow>(
    `SELECT pu.id, pu.status, pu.note, u.name AS author_name, pu.created_at FROM proposal_update pu JOIN "user" u ON u.id = pu.author_id WHERE pu.post_id = ? ORDER BY pu.created_at`,
    postId,
  );

/* ---------- polls ---------- */
export interface PollRow {
  id: string;
  question: string;
  closes_at: number | null;
  closed_at: number | null;
  named_since: number | null;
  created_at: number;
  place_slug: string | null;
  place_name: string | null;
  votes: number;
  mine: string | null;
  options: { id: string; label: string; votes: number }[];
}

export async function listPolls(opts: { viewer?: string | null; open?: boolean; limit?: number; place?: string | null }) {
  const args: unknown[] = [opts.viewer ?? '', Date.now()];
  const where = ["pl0.state = 'visible'"];
  if (opts.open) where.push('pl0.closed_at IS NULL AND (pl0.closes_at IS NULL OR pl0.closes_at > ?2)');
  if (opts.place) {
    args.push(opts.place);
    where.push(`pc.slug = ?${args.length}`);
  }
  args.push(opts.limit ?? 10);
  const polls = await all<Omit<PollRow, 'options'>>(
    `SELECT pl0.id, pl0.question, pl0.closes_at, pl0.closed_at, pl0.named_since, pl0.created_at, pc.slug AS place_slug, pc.name AS place_name,
       (SELECT COUNT(*) FROM poll_vote v WHERE v.poll_id = pl0.id) AS votes,
       (SELECT option_id FROM poll_vote v WHERE v.poll_id = pl0.id AND v.user_id = ?1) AS mine
     FROM poll pl0 LEFT JOIN place pc ON pc.id = pl0.place_id
     WHERE ${where.join(' AND ')} AND (?2 > 0) ORDER BY pl0.created_at DESC LIMIT ?${args.length}`,
    ...args,
  );
  if (!polls.length) return [] as PollRow[];
  const opts2 = await all<{ poll_id: string; id: string; label: string; votes: number }>(
    `SELECT o.poll_id, o.id, o.label, (SELECT COUNT(*) FROM poll_vote v WHERE v.option_id = o.id) AS votes
     FROM poll_option o WHERE o.poll_id IN (${polls.map(() => '?').join(',')}) ORDER BY o.sort`,
    ...polls.map((p) => p.id),
  );
  return polls.map((p) => ({ ...p, options: opts2.filter((o) => o.poll_id === p.id) }));
}

export const pollIsOpen = (p: Pick<PollRow, 'closed_at' | 'closes_at'>, now = Date.now()) =>
  !p.closed_at && (!p.closes_at || p.closes_at > now);

/* ---------- events ---------- */
export interface EventRow {
  id: string;
  title: string;
  description: string;
  kind: 'in_person' | 'online';
  starts_at: number;
  ends_at: number;
  place_text: string;
  place_slug: string | null;
  place_name: string | null;
  online_url: string | null;
  going: number;
  mine: number;
}
const EVENT_COLUMNS = `e.id, e.title, e.description, e.kind, e.starts_at, e.ends_at, e.place_text, pc.slug AS place_slug, pc.name AS place_name, e.online_url,
  (SELECT COUNT(*) FROM rsvp r WHERE r.event_id = e.id) AS going,
  EXISTS (SELECT 1 FROM rsvp r WHERE r.event_id = e.id AND r.user_id = ?1) AS mine`;

export async function listEvents(opts: { viewer?: string | null; when: 'upcoming' | 'past'; place?: string | null; limit?: number }) {
  const args: unknown[] = [opts.viewer ?? '', Date.now()];
  const where = ["e.state = 'visible'", opts.when === 'upcoming' ? 'e.ends_at >= ?2' : 'e.ends_at < ?2'];
  if (opts.place) {
    args.push(opts.place);
    where.push(`pc.slug = ?${args.length}`);
  }
  args.push(opts.limit ?? 30);
  return all<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM event e LEFT JOIN place pc ON pc.id = e.place_id WHERE ${where.join(' AND ')}
     ORDER BY e.starts_at ${opts.when === 'upcoming' ? 'ASC' : 'DESC'} LIMIT ?${args.length}`,
    ...args,
  );
}

export const getEvent = (id: string, viewer?: string | null) =>
  one<EventRow & { state: string }>(
    `SELECT ${EVENT_COLUMNS}, e.state FROM event e LEFT JOIN place pc ON pc.id = e.place_id WHERE e.id = ?2`,
    viewer ?? '',
    id,
  );

/* ---------- town halls ---------- */
export interface TownHallRow {
  id: string;
  title: string;
  description: string;
  starts_at: number;
  stream_url: string | null;
  live_at: number | null;
  ended_at: number | null;
  recap: string | null;
  host_name: string;
  questions: number;
  reminders: number;
  mine_reminder: number;
}
const TH_COLUMNS = `t.id, t.title, t.description, t.starts_at, t.stream_url, t.live_at, t.ended_at, t.recap, u.name AS host_name,
  (SELECT COUNT(*) FROM question q WHERE q.town_hall_id = t.id AND q.state = 'visible') AS questions,
  (SELECT COUNT(*) FROM reminder r WHERE r.town_hall_id = t.id) AS reminders,
  EXISTS (SELECT 1 FROM reminder r WHERE r.town_hall_id = t.id AND r.user_id = ?1) AS mine_reminder`;

export const listTownHalls = (viewer?: string | null) =>
  all<TownHallRow>(
    `SELECT ${TH_COLUMNS} FROM town_hall t JOIN "user" u ON u.id = t.host_id WHERE t.state = 'visible' ORDER BY t.starts_at DESC LIMIT 40`,
    viewer ?? '',
  );

export const getTownHall = (id: string, viewer?: string | null) =>
  one<TownHallRow>(
    `SELECT ${TH_COLUMNS} FROM town_hall t JOIN "user" u ON u.id = t.host_id WHERE t.id = ?2 AND t.state = 'visible'`,
    viewer ?? '',
    id,
  );

export interface QuestionRow {
  id: string;
  body: string;
  author_name: string;
  answered_at: number | null;
  created_at: number;
  votes: number;
  mine: number;
}
export const listQuestions = (townHallId: string, viewer?: string | null) =>
  all<QuestionRow>(
    `SELECT q.id, q.body, u.name AS author_name, q.answered_at, q.created_at,
       (SELECT COUNT(*) FROM question_vote v WHERE v.question_id = q.id) AS votes,
       EXISTS (SELECT 1 FROM question_vote v WHERE v.question_id = q.id AND v.user_id = ?1) AS mine
     FROM question q JOIN "user" u ON u.id = q.author_id WHERE q.town_hall_id = ?2 AND q.state = 'visible'
     ORDER BY (q.answered_at IS NOT NULL), votes DESC, q.created_at`,
    viewer ?? '',
    townHallId,
  );

export function townHallPhase(t: Pick<TownHallRow, 'live_at' | 'ended_at' | 'starts_at'>, now = Date.now()) {
  if (t.ended_at) return 'ended' as const;
  if (t.live_at) return 'live' as const;
  if (t.starts_at < now - 6 * 3_600_000) return 'ended' as const; // never went live; treat as past
  return 'scheduled' as const;
}

/* ---------- sponsors ---------- */
export interface SponsorRow {
  id: string;
  name: string;
  description: string;
  url: string | null;
  phone: string | null;
  address: string | null;
  image_id: string | null;
}
export const listSponsors = () =>
  all<SponsorRow>(
    `SELECT id, name, description, url, phone, address, image_id FROM sponsor
     WHERE paused = 0 AND starts_at <= ?1 AND (ends_at IS NULL OR ends_at > ?1) ORDER BY created_at`,
    Date.now(),
  );

/* ---------- notifications ---------- */
export const unreadCount = async (userId: string) =>
  (await one<{ n: number }>('SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND read_at IS NULL', userId))?.n ?? 0;

/* ---------- the week, for the live sentence ---------- */
export interface WeekStats {
  people: number;
  topics: number;
  topPlace: Pick<Place, 'slug' | 'name' | 'phrase_sq' | 'phrase_en'> | null;
  medianReplyHours: number | null;
  supports: number;
  /** all proposals ever delivered, not just this week's */
  delivered: number;
}

export async function weekStats(): Promise<WeekStats> {
  const now = Date.now();
  const since = now - 7 * DAY;
  // D1 caps compound SELECTs, so the week's participants are gathered table by table.
  const activeIds = Promise.all(
    [
      "SELECT author_id AS id FROM post WHERE created_at >= ? AND state = 'visible'",
      "SELECT author_id AS id FROM comment WHERE created_at >= ? AND state = 'visible'",
      'SELECT user_id AS id FROM support WHERE created_at >= ?',
      'SELECT user_id AS id FROM upvote WHERE created_at >= ?',
      'SELECT user_id AS id FROM poll_vote WHERE updated_at >= ?',
      'SELECT user_id AS id FROM rsvp WHERE created_at >= ?',
    ].map((s) => all<{ id: string }>(s, since)),
  ).then(async (lists) => {
    const ids = [...new Set(lists.flat().map((r) => r.id))];
    if (!ids.length) return [] as { id: string; name: string }[];
    const people: { id: string; name: string }[] = [];
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      people.push(
        ...(await all<{ id: string; name: string }>(
          `SELECT id, name FROM "user" WHERE closedAt IS NULL AND COALESCE(role, 'resident') = 'resident' AND id IN (${chunk.map(() => '?').join(',')})`,
          ...chunk,
        )),
      );
    }
    return people;
  });
  const [people, topics, topPlace, replies, supports, delivered] = await Promise.all([
    activeIds,
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM post WHERE kind IN ('topic', 'proposal') AND state = 'visible' AND created_at >= ?",
      since,
    ),
    one<Pick<Place, 'slug' | 'name' | 'phrase_sq' | 'phrase_en'> & { n: number }>(
      `SELECT pl.slug, pl.name, pl.phrase_sq, pl.phrase_en, COUNT(*) AS n FROM post p JOIN place pl ON pl.id = p.place_id
       WHERE p.kind IN ('topic', 'proposal') AND p.state = 'visible' AND p.activity_at >= ? GROUP BY pl.id ORDER BY n DESC, pl.sort LIMIT 1`,
      since,
    ),
    all<{ h: number }>(
      `SELECT (team_reply_at - created_at) / 3600000.0 AS h FROM post WHERE kind IN ('topic', 'proposal') AND team_reply_at IS NOT NULL AND created_at >= ? ORDER BY h`,
      now - 30 * DAY,
    ),
    one<{ n: number }>('SELECT COUNT(*) AS n FROM support WHERE created_at >= ?', since),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM post WHERE kind = 'proposal' AND status = 'completed' AND state = 'visible'"),
  ]);
  let median: number | null = null;
  if (replies.length) {
    const m = replies.length >> 1;
    median = replies.length % 2 ? replies[m].h : (replies[m - 1].h + replies[m].h) / 2;
    median = Math.max(1, Math.round(median));
  }
  return {
    people: people.length,
    topics: topics?.n ?? 0,
    topPlace: topPlace ?? null,
    medianReplyHours: median,
    supports: supports?.n ?? 0,
    delivered: delivered?.n ?? 0,
  };
}
