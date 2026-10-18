-- Sharing every reward is a lasting pair, not a one-time copy.
-- a < b so each pair is stored once. New rewards pick up the pair automatically.

CREATE TABLE IF NOT EXISTS reward_sync (
  student_id  BIGINT NOT NULL,
  a           BIGINT NOT NULL,
  b           BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, a, b),
  CHECK (a < b),
  FOREIGN KEY (student_id, a) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, b) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);

ALTER TABLE invites ADD COLUMN IF NOT EXISTS share_all BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS inviter_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
