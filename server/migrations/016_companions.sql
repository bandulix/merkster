-- Custom companions. Merki stays the default (active_companion_id is null).
-- A shared companion is the owner's row: edits show up for everyone who still has it.
CREATE TABLE IF NOT EXISTS companions (
  id           TEXT PRIMARY KEY,
  owner_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  personality  TEXT NOT NULL,
  preset       TEXT,
  picture      BYTEA,
  picture_type TEXT,
  picture_etag TEXT,
  shared       BOOLEAN NOT NULL DEFAULT FALSE,
  share_code   TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companions_owner ON companions (owner_id);

CREATE TABLE IF NOT EXISTS companion_grants (
  companion_id TEXT NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden       BOOLEAN NOT NULL DEFAULT FALSE,
  reported     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (companion_id, user_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_companion_id TEXT REFERENCES companions(id) ON DELETE SET NULL;

-- A line is also cached per companion, so switching who speaks does not reuse yesterday's voice.
ALTER TABLE merki_lines ADD COLUMN IF NOT EXISTS companion_id TEXT NOT NULL DEFAULT '';
ALTER TABLE merki_lines DROP CONSTRAINT IF EXISTS merki_lines_pkey;
ALTER TABLE merki_lines ADD CONSTRAINT merki_lines_pkey PRIMARY KEY (user_id, day, trigger, band, companion_id);
