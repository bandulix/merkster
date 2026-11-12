-- One cooperative challenge per shared plan per week. Contributions are counts, not a ranking.
CREATE TABLE IF NOT EXISTS plan_challenges (
  id         TEXT PRIMARY KEY,
  plan_id    TEXT NOT NULL REFERENCES shared_plans(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  target     INT NOT NULL DEFAULT 20,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, week)
);

CREATE TABLE IF NOT EXISTS challenge_progress (
  challenge_id TEXT NOT NULL REFERENCES plan_challenges(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  units        INT NOT NULL DEFAULT 0,
  opted_out    BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (challenge_id, user_id)
);
