-- Grading per test, supporter rewards (promises only – Merkster never moves money), result verification
-- by supporters and an optional photo of the graded test (visible only to supporters the student allows).
ALTER TABLE tests ADD COLUMN IF NOT EXISTS grading TEXT;                       -- per-test grading system (NULL = profile default)
ALTER TABLE supporter_links ADD COLUMN IF NOT EXISTS show_photos BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE reward_rules (
  id            BIGSERIAL PRIMARY KEY,
  student_id    BIGINT NOT NULL,
  supporter_id  BIGINT NOT NULL,
  trigger       JSONB NOT NULL,     -- {kind: grade|personal_best|improvement|streak|level, …} (grade thresholds stored as normalised score + original value)
  reward        JSONB NOT NULL,     -- {type: money, amount, currency} | {type: other, text}
  cap_per_month INTEGER CHECK (cap_per_month IS NULL OR cap_per_month BETWEEN 1 AND 100),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (student_id, supporter_id) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);
CREATE INDEX reward_rules_student ON reward_rules (student_id);

CREATE TABLE rewards_earned (
  id                BIGSERIAL PRIMARY KEY,
  rule_id           BIGINT REFERENCES reward_rules(id) ON DELETE SET NULL,   -- a deleted rule doesn't cancel what was already earned
  student_id        BIGINT NOT NULL,
  supporter_id      BIGINT NOT NULL,
  source_key        TEXT NOT NULL,     -- result:<testId> | streak:<days>:<startDay> | level:<n>
  test_id           TEXT,
  trigger           JSONB NOT NULL,    -- snapshot of the rule at the time it was earned
  reward            JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  earned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at           TIMESTAMPTZ,
  seen_student_at   TIMESTAMPTZ,
  seen_supporter_at TIMESTAMPTZ,
  UNIQUE (rule_id, source_key),
  FOREIGN KEY (student_id, supporter_id) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);
CREATE INDEX rewards_earned_student ON rewards_earned (student_id, earned_at DESC);
CREATE INDEX rewards_earned_supporter ON rewards_earned (supporter_id, earned_at DESC);

-- "I saw the test paper" – per supporter
CREATE TABLE result_verifications (
  student_id    BIGINT NOT NULL,
  supporter_id  BIGINT NOT NULL,
  test_id       TEXT NOT NULL,
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, supporter_id, test_id),
  FOREIGN KEY (student_id, supporter_id) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);

-- optional photo of the graded test (one per test, resized in the browser)
CREATE TABLE result_photos (
  student_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id     TEXT NOT NULL,
  data        BYTEA NOT NULL,
  type        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, test_id)
);
