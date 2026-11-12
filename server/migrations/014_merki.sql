-- One Merki line per trigger per day. Speech is generated on the server and cached.
CREATE TABLE IF NOT EXISTS merki_lines (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  trigger    TEXT NOT NULL,
  band       TEXT NOT NULL DEFAULT 'mid',
  line       TEXT NOT NULL,
  pose       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, trigger, band)
);
