-- Report cards (Zeugnisse): confirmed by the student after review (AI extraction or manual entry).
-- Lines keep the original grade + the normalised score; subjects are canonical ids or the student's own (c_…).
CREATE TABLE report_cards (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_year  TEXT NOT NULL DEFAULT '',
  term         TEXT NOT NULL CHECK (term IN ('h1', 'final', 'custom')),
  term_label   TEXT NOT NULL DEFAULT '',
  issued_on    TEXT NOT NULL,                       -- YYYY-MM-DD
  system       TEXT NOT NULL,
  lines        JSONB NOT NULL,                      -- [{subjectId, name, value, score}]
  avg_score    NUMERIC(6,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- = confirmation time (rewards only count cards confirmed after a rule exists)
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX report_cards_user ON report_cards (user_id, issued_on);

CREATE TABLE report_card_photos (
  card_id  BIGINT PRIMARY KEY REFERENCES report_cards(id) ON DELETE CASCADE,
  data     BYTEA NOT NULL,
  type     TEXT NOT NULL
);

-- supporters can cheer on report cards too
ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_target_kind_check;
ALTER TABLE reactions ADD CONSTRAINT reactions_target_kind_check CHECK (target_kind IN ('result', 'level', 'badge', 'streak', 'report'));

-- privacy between relatives: supporters only see their OWN rules and amounts unless the student allows otherwise
ALTER TABLE users ADD COLUMN IF NOT EXISTS supporters_see_each_other BOOLEAN NOT NULL DEFAULT FALSE;

-- which report card / subject a reward was earned for
ALTER TABLE rewards_earned ADD COLUMN IF NOT EXISTS card_id BIGINT REFERENCES report_cards(id) ON DELETE SET NULL;
ALTER TABLE rewards_earned ADD COLUMN IF NOT EXISTS subject_id TEXT;
