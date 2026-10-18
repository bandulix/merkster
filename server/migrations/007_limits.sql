-- When a test was created on the server, and how many pictures that test has used.
-- created_at is the quota clock (a rolling 24h). Existing rows are backfilled from the
-- calendar day the student picked, at midnight UTC, so this migration does not stamp
-- them with now() and lock people who already have tests. A missing day is treated as
-- old. New inserts use DEFAULT now(); later updates must not touch the column.
-- Picture counts are per test id and are not refunded when the test is deleted.
-- The CHECK cap matches PICTURES_PER_TEST in shared/limits.ts.

ALTER TABLE tests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE tests
  SET created_at = COALESCE(created_day::timestamp AT TIME ZONE 'UTC', now() - interval '30 days')
  WHERE created_at IS NULL;
ALTER TABLE tests ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE tests ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS tests_user_created ON tests (user_id, created_at);

CREATE TABLE IF NOT EXISTS test_picture_uses (
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id  TEXT NOT NULL,
  pictures INTEGER NOT NULL DEFAULT 0 CHECK (pictures >= 0 AND pictures <= 10),
  PRIMARY KEY (user_id, test_id)
);
