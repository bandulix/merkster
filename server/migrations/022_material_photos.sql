-- Original worksheet and book-page uploads. The bytes exist only so a failed
-- read can be retried. A successful read deletes them at once. This statement
-- is safe to run again: it creates the table if needed and deletes anything
-- already past its time. Photos are not kept for model training.

CREATE TABLE IF NOT EXISTS material_photos (
  id        TEXT PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id   TEXT NOT NULL,
  bytes     BYTEA,
  mime      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS material_photos_purge ON material_photos (purge_at);

-- Grounded cards, keyed by language and the goal text. The article revision is inside the body.
CREATE TABLE IF NOT EXISTS material_cache (
  item_key   TEXT NOT NULL,
  lang       TEXT NOT NULL,
  body       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_key, lang)
);

DELETE FROM material_photos WHERE purge_at <= now();
