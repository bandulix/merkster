-- Incentives count only from a "valid as of" moment. Past entries before that
-- date do not earn. Existing rules keep today's behaviour (valid_as_of = created_at).
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS valid_as_of TIMESTAMPTZ;
UPDATE reward_rules SET valid_as_of = created_at WHERE valid_as_of IS NULL;
ALTER TABLE reward_rules ALTER COLUMN valid_as_of SET DEFAULT now();
ALTER TABLE reward_rules ALTER COLUMN valid_as_of SET NOT NULL;
