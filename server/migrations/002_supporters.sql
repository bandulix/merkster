-- Supporters (parents, grandparents, coaches …) who cheer a student on.
-- A user can be student and supporter at the same time. Supporters only ever see stats and results the
-- student chose to share – never cards, card content or photos – and they cannot change anything.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN NOT NULL DEFAULT FALSE;

-- invite links created by a student. Only HMAC(APP_SECRET, token) is stored; the raw token is shown once.
CREATE TABLE invites (
  id          BIGSERIAL PRIMARY KEY,
  student_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  relation    TEXT NOT NULL DEFAULT 'other',      -- mum | dad | grandma | grandpa | aunt | uncle | coach | other
  label       TEXT NOT NULL DEFAULT '',           -- what the student calls them ("Oma Gisela")
  max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 5),
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invites_student ON invites (student_id);

-- the student ↔ supporter link, with what the supporter may see
CREATE TABLE supporter_links (
  student_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supporter_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation      TEXT NOT NULL DEFAULT 'other',
  label         TEXT NOT NULL DEFAULT '',
  show_results  BOOLEAN NOT NULL DEFAULT TRUE,    -- exam results + results dashboard
  show_practice BOOLEAN NOT NULL DEFAULT TRUE,    -- level, streak, badges, practice minutes, upcoming tests
  invite_id     BIGINT REFERENCES invites(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, supporter_id),
  CHECK (student_id <> supporter_id)
);
CREATE INDEX supporter_links_supporter ON supporter_links (supporter_id);

-- reactions: a fixed emoji set or a preset message (no free text). One of each kind per supporter and target.
-- Removing a supporter removes their reactions (FK cascade on the link).
CREATE TABLE reactions (
  id            BIGSERIAL PRIMARY KEY,
  student_id    BIGINT NOT NULL,
  supporter_id  BIGINT NOT NULL,
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('result', 'level', 'badge', 'streak')),
  target_id     TEXT NOT NULL,                    -- test id | level number | badge id | streak milestone
  reaction      TEXT NOT NULL,                    -- emoji or 'msg:<preset>'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at       TIMESTAMPTZ,                      -- when the student saw it in the activity feed
  UNIQUE (student_id, supporter_id, target_kind, target_id, reaction),
  FOREIGN KEY (student_id, supporter_id) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);
CREATE INDEX reactions_student ON reactions (student_id, created_at DESC);
