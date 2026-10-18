-- Class groups. The creator owns the name, motto and cover. Members invite classmates
-- and share tests as a card snapshot, so the next student does not scan the same page.
-- Practice, results and XP stay on each student's own account.

CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  motto       TEXT NOT NULL DEFAULT '',
  cover_data  BYTEA,
  cover_type  TEXT,
  cover_etag  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_members (
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX class_members_user ON class_members (user_id);

CREATE TABLE class_invites (
  id          BIGSERIAL PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  max_uses    INTEGER NOT NULL DEFAULT 30 CHECK (max_uses BETWEEN 1 AND 40),
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX class_invites_class ON class_invites (class_id);

CREATE TABLE class_shares (
  id              TEXT PRIMARY KEY,
  class_id        TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  author_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_test_id  TEXT NOT NULL,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  foreign_lang    TEXT,
  native_lang     TEXT NOT NULL,
  test_date       DATE NOT NULL,
  format          TEXT NOT NULL,
  articles        BOOLEAN NOT NULL DEFAULT FALSE,
  card_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, author_id, source_test_id)
);
CREATE INDEX class_shares_class ON class_shares (class_id, updated_at DESC);

CREATE TABLE class_share_cards (
  share_id     TEXT NOT NULL REFERENCES class_shares(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  type         TEXT NOT NULL,
  term         TEXT NOT NULL,
  meaning      TEXT NOT NULL,
  example      TEXT NOT NULL DEFAULT '',
  distractors  JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (share_id, position)
);

-- which of my tests came from a share (so the button can say "already added")
CREATE TABLE class_share_takes (
  share_id   TEXT NOT NULL REFERENCES class_shares(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id    TEXT NOT NULL,
  taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, user_id)
);
