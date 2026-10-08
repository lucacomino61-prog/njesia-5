-- Njësia 5: the forum's own tables. Times are integer milliseconds (UTC). Counts are never
-- stored: every number on a page is computed from the rows (the reference site showed
-- "4 comments" on a list and 2 on the page).

-- Places residents tag their posts with: the unit's neighbourhoods first, then landmarks.
CREATE TABLE place (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lagje' CHECK (kind IN ('lagje', 'landmark')),
  -- how the place reads after a preposition: "në Selitë", "te Liceu Petro Nini Luarasi"
  phrase_sq TEXT NOT NULL,
  phrase_en TEXT NOT NULL,
  shape TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  created_at INTEGER NOT NULL
);

-- Topics (residents' threads), team posts (news & decisions), and proposals share one table so
-- the forum list, reports, comments and moderation treat them alike.
CREATE TABLE post (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('topic', 'news', 'proposal')),
  category TEXT CHECK (category IS NULL OR category IN ('decision', 'news', 'activity', 'success_story', 'new_business', 'neighbor')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES "user"(id),
  place_id TEXT REFERENCES place(id),
  pinned INTEGER NOT NULL DEFAULT 0,
  image_id TEXT,
  -- proposals only
  status TEXT CHECK (status IS NULL OR status IN ('submitted', 'under_review', 'planned', 'completed', 'rejected')),
  goal INTEGER,
  lat REAL,
  lng REAL,
  location_label TEXT,
  -- visible | review (auto-hidden by reports) | removed (by the team) | deleted (by the author) | sample-hidden
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'review', 'removed', 'deleted')),
  -- first reply from the team (comment or status update): the "answered after N hours" badge
  team_reply_at INTEGER,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  activity_at INTEGER NOT NULL
);
CREATE INDEX post_kind_state ON post (kind, state, activity_at DESC);
CREATE INDEX post_place ON post (place_id, state);
CREATE INDEX post_author ON post (author_id);

CREATE TABLE proposal_update (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'planned', 'completed', 'rejected')),
  note TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES "user"(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX proposal_update_post ON proposal_update (post_id, created_at);

-- Support for a proposal, upvote for a topic: one row per person.
CREATE TABLE support (
  post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE upvote (
  post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE comment (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comment(id),
  author_id TEXT NOT NULL REFERENCES "user"(id),
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'review', 'removed', 'deleted')),
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX comment_post ON comment (post_id, state, created_at);

CREATE TABLE poll (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES "user"(id),
  place_id TEXT REFERENCES place(id),
  -- when the team may see who chose what; votes cast before this stay anonymous to the team
  named_since INTEGER,
  closes_at INTEGER,
  closed_at INTEGER,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'review', 'removed', 'deleted')),
  created_at INTEGER NOT NULL
);
CREATE TABLE poll_option (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort INTEGER NOT NULL
);
CREATE TABLE poll_vote (
  poll_id TEXT NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_option(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'in_person' CHECK (kind IN ('in_person', 'online')),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  place_text TEXT NOT NULL DEFAULT '',
  place_id TEXT REFERENCES place(id),
  online_url TEXT,
  image_id TEXT,
  author_id TEXT NOT NULL REFERENCES "user"(id),
  named_since INTEGER,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'review', 'removed', 'deleted')),
  created_at INTEGER NOT NULL
);
CREATE INDEX event_starts ON event (state, starts_at);
CREATE TABLE rsvp (
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  checked_in_at INTEGER,
  checked_in_by TEXT,
  reminded_at INTEGER,
  PRIMARY KEY (event_id, user_id)
);

-- Live town halls: scheduled → live → ended; questions are upvoted by residents.
CREATE TABLE town_hall (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  stream_url TEXT,
  live_at INTEGER,
  ended_at INTEGER,
  recap TEXT,
  host_id TEXT NOT NULL REFERENCES "user"(id),
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'removed')),
  created_at INTEGER NOT NULL
);
CREATE TABLE question (
  id TEXT PRIMARY KEY,
  town_hall_id TEXT NOT NULL REFERENCES town_hall(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES "user"(id),
  body TEXT NOT NULL,
  answered_at INTEGER,
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'review', 'removed', 'deleted')),
  created_at INTEGER NOT NULL
);
CREATE TABLE question_vote (
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, user_id)
);
CREATE TABLE reminder (
  town_hall_id TEXT NOT NULL REFERENCES town_hall(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  PRIMARY KEY (town_hall_id, user_id)
);

-- Anonymous reports. The reporter id is kept so the same person cannot report twice and so
-- repeated unfounded reporters stop counting towards auto-hiding; moderators never see it.
CREATE TABLE report (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'poll', 'event', 'question')),
  target_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'off_topic', 'false_info', 'other')),
  note TEXT NOT NULL DEFAULT '',
  counted INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('kept', 'removed')),
  UNIQUE (target_type, target_id, reporter_id)
);
CREATE INDEX report_open ON report (resolved_at, target_type, target_id);

-- Every moderation and team decision: who, what, when.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_log_time ON audit_log (created_at DESC);

CREATE TABLE suspension (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  by_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  lifted_at INTEGER,
  lifted_by TEXT
);

CREATE TABLE notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id TEXT,
  target_type TEXT,
  target_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX notification_user ON notification (user_id, created_at DESC);

CREATE TABLE user_pref (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  email_decisions INTEGER NOT NULL DEFAULT 0,
  email_live INTEGER NOT NULL DEFAULT 0,
  email_inactive INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER
);

CREATE TABLE sponsor (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT,
  phone TEXT,
  address TEXT,
  image_id TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Per-day counters; the browser keeps a same-day "seen" note so a person counts once a day.
CREATE TABLE sponsor_stat (
  sponsor_id TEXT NOT NULL REFERENCES sponsor(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sponsor_id, day)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image')),
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Development only: where mail and SMS go when no provider is configured (never in production).
CREATE TABLE dev_outbox (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('mail', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
