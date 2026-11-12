-- Web Push. Off until the student opts in. At most one reminder a day, never after quiet hours.
CREATE TABLE IF NOT EXISTS push_subs (
  id         TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_prefs (
  user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  hour         INT NOT NULL DEFAULT 16,
  quiet_after  INT NOT NULL DEFAULT 20,
  quiet_before INT NOT NULL DEFAULT 7,
  last_day     DATE
);
