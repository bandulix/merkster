-- Learning-goal programmes, shared worksheets, and exam grades the student enters.
-- Family supporters, reward promises and report-card (Zeugnis) uploads are removed.
-- Existing rows are dropped with the tables; the app no longer reads them.
-- DROP ... IF EXISTS is safe on databases that never had those tables.

-- These three tables reference each other (invite ↔ supporter link ↔ reward rule).
-- CASCADE drops the foreign keys that point at them. It does not drop unrelated tables.
DROP TABLE IF EXISTS reward_sync;
DROP TABLE IF EXISTS reward_rule_members;
DROP TABLE IF EXISTS rewards_earned;
DROP TABLE IF EXISTS result_verifications;
DROP TABLE IF EXISTS result_photos;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS reward_rules CASCADE;
DROP TABLE IF EXISTS supporter_links CASCADE;
DROP TABLE IF EXISTS report_card_photos;
DROP TABLE IF EXISTS report_cards;

ALTER TABLE users DROP COLUMN IF EXISTS is_supporter;
ALTER TABLE users DROP COLUMN IF EXISTS supporters_see_each_other;

-- programme metadata (goals, method, shared plan id). Personal card state stays in cards.state.
ALTER TABLE tests ADD COLUMN IF NOT EXISTS study JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS study JSONB;

-- who may see this student's grades. Conservative default: rate and trend, not each mark.
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_privacy TEXT NOT NULL DEFAULT 'summary';
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_targets JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS grades (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  test_id     TEXT,
  subject     TEXT NOT NULL,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  taken_on    DATE NOT NULL,
  system      TEXT NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  score       DOUBLE PRECISION NOT NULL,
  mood        TEXT,
  note        TEXT NOT NULL DEFAULT '',
  adherence   INTEGER,
  with_plan   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  BIGINT NOT NULL,
  deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS grades_user ON grades (user_id, taken_on);

-- One generated programme per worksheet fingerprint. Members keep their own cards and schedule.
CREATE TABLE IF NOT EXISTS shared_plans (
  id          TEXT PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  title       TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  tokens      JSONB NOT NULL,
  exam_date   DATE,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_plans_lookup ON shared_plans (kind, subject, created_at DESC);

CREATE TABLE IF NOT EXISTS shared_plan_members (
  plan_id      TEXT NOT NULL REFERENCES shared_plans(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  test_id      TEXT NOT NULL,
  exam_date    DATE NOT NULL,
  hidden       BOOLEAN NOT NULL DEFAULT FALSE,
  left_at      TIMESTAMPTZ,
  progress     JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_plan_events (
  id         BIGSERIAL PRIMARY KEY,
  plan_id    TEXT NOT NULL REFERENCES shared_plans(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_plan_events_plan ON shared_plan_events (plan_id, id DESC);
