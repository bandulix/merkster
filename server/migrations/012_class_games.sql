-- Class boss fights and 1v1 vocab clashes.
-- Boss HP drops when classmates practise a taken shared deck.
-- Clash scores are graded on the server against the share snapshot.

CREATE TABLE class_bosses (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  share_id    TEXT NOT NULL REFERENCES class_shares(id) ON DELETE CASCADE,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL DEFAULT '',
  max_hp      INTEGER NOT NULL CHECK (max_hp BETWEEN 10 AND 100000),
  hp          INTEGER NOT NULL CHECK (hp >= 0),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'cancelled')),
  ends_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  won_at      TIMESTAMPTZ
);
CREATE INDEX class_bosses_class ON class_bosses (class_id, status);
CREATE UNIQUE INDEX class_bosses_one_open ON class_bosses (class_id) WHERE status = 'open';

CREATE TABLE class_boss_hits (
  id          BIGSERIAL PRIMARY KEY,
  boss_id     TEXT NOT NULL REFERENCES class_bosses(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  damage      INTEGER NOT NULL CHECK (damage > 0 AND damage <= 80),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (boss_id, user_id, session_id)
);
CREATE INDEX class_boss_hits_boss ON class_boss_hits (boss_id);

CREATE TABLE class_clashes (
  id             TEXT PRIMARY KEY,
  class_id       TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  share_id       TEXT NOT NULL REFERENCES class_shares(id) ON DELETE CASCADE,
  challenger_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'done', 'declined', 'expired')),
  card_count     INTEGER NOT NULL DEFAULT 8 CHECK (card_count BETWEEN 3 AND 15),
  seed           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  CHECK (challenger_id <> opponent_id)
);
CREATE INDEX class_clashes_class ON class_clashes (class_id, created_at DESC);
CREATE INDEX class_clashes_people ON class_clashes (challenger_id, opponent_id, status);

CREATE TABLE class_clash_plays (
  clash_id     TEXT NOT NULL REFERENCES class_clashes(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct      INTEGER NOT NULL DEFAULT 0,
  answers      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ms           INTEGER NOT NULL DEFAULT 0,
  finished_at  TIMESTAMPTZ,
  PRIMARY KEY (clash_id, user_id)
);
