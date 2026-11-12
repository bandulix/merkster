-- Probeprüfung. One paper can be shared across a plan. Each student's result stays on their row.
CREATE TABLE IF NOT EXISTS mock_exams (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT,
  test_id     TEXT NOT NULL,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mock_exams_plan ON mock_exams (plan_id);

CREATE TABLE IF NOT EXISTS mock_attempts (
  id          TEXT PRIMARY KEY,
  exam_id     TEXT NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       DOUBLE PRECISION NOT NULL,
  grade       TEXT NOT NULL,
  weak        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mock_attempts_user ON mock_attempts (user_id, created_at DESC);
