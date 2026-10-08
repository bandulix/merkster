-- Merkster initial schema
CREATE SEQUENCE IF NOT EXISTS sync_rev;

-- Sign-in is Google only. We keep the minimum: Google's stable account id, name, e-mail, avatar URL.
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,          -- OpenID Connect "sub" claim (never changes for a Google account)
  email         TEXT,
  name          TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,  -- synced from ADMIN_EMAILS on every sign-in
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE auth_sessions (
  token_hash  TEXT PRIMARY KEY,                -- HMAC(APP_SECRET, token); the raw token only lives in the cookie
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  user_agent  TEXT
);
CREATE INDEX auth_sessions_user ON auth_sessions (user_id);

-- per-user settings, streak and stats (one JSON document)
CREATE TABLE profiles (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  BIGINT NOT NULL DEFAULT 0,       -- client clock (ms) – last-write-wins
  rev         BIGINT NOT NULL DEFAULT nextval('sync_rev')
);

CREATE TABLE tests (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,                  -- client-generated id
  name         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  foreign_lang TEXT,
  native_lang  TEXT,
  test_date    DATE NOT NULL,
  format       TEXT NOT NULL DEFAULT 'mixed',
  articles     BOOLEAN NOT NULL DEFAULT FALSE,
  created_day  DATE,
  days         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- days on which the student practised this test
  result       JSONB,                           -- exam result entered after the test {system, value, max, enteredAt, note}
  result_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   BIGINT NOT NULL,
  deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  rev          BIGINT NOT NULL DEFAULT nextval('sync_rev'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX tests_user_rev ON tests (user_id, rev);

CREATE TABLE cards (
  user_id      BIGINT NOT NULL,
  id           TEXT NOT NULL,
  test_id      TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'pair',   -- pair | qa | cloze | mc
  term         TEXT NOT NULL,
  meaning      TEXT NOT NULL,
  example      TEXT NOT NULL DEFAULT '',
  distractors  JSONB NOT NULL DEFAULT '[]'::jsonb,
  state        JSONB NOT NULL DEFAULT '{}'::jsonb, -- review / scheduling state
  updated_at   BIGINT NOT NULL,
  deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  rev          BIGINT NOT NULL DEFAULT nextval('sync_rev'),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, test_id) REFERENCES tests (user_id, id) ON DELETE CASCADE
);
CREATE INDEX cards_user_rev ON cards (user_id, rev);
CREATE INDEX cards_test ON cards (user_id, test_id);

-- finished practice sessions (history)
CREATE TABLE practice_sessions (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  day         DATE NOT NULL,
  cards       INTEGER NOT NULL DEFAULT 0,
  first_try   INTEGER NOT NULL DEFAULT 0,
  ms          INTEGER NOT NULL DEFAULT 0,       -- wall time
  active_ms   INTEGER NOT NULL DEFAULT 0,       -- active practice time (idle gaps excluded) – basis for minutes stats
  correct     INTEGER NOT NULL DEFAULT 0,       -- correct recalls (XP basis)
  ended_at    BIGINT,                           -- client timestamp (ms)
  test_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rev         BIGINT NOT NULL DEFAULT nextval('sync_rev'),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX practice_sessions_user_rev ON practice_sessions (user_id, rev);

-- AI usage (rate limiting + admin overview). No images or card text are stored.
CREATE TABLE ai_requests (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok          BOOLEAN NOT NULL DEFAULT FALSE,
  images      INTEGER NOT NULL DEFAULT 0,
  cards       INTEGER NOT NULL DEFAULT 0,
  ms          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ai_requests_user_time ON ai_requests (user_id, created_at);
