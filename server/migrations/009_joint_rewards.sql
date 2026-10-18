-- One reward can be promised together by parents, grandparents, an aunt and an uncle.
-- The rule still has one owner (reward_rules.supporter_id). Everyone on it is a member.
-- An invite can name that rule, so accepting the link joins the reward as well as the family.

CREATE TABLE IF NOT EXISTS reward_rule_members (
  rule_id      BIGINT NOT NULL REFERENCES reward_rules(id) ON DELETE CASCADE,
  student_id   BIGINT NOT NULL,
  supporter_id BIGINT NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, supporter_id),
  FOREIGN KEY (student_id, supporter_id) REFERENCES supporter_links (student_id, supporter_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS reward_rule_members_supporter ON reward_rule_members (supporter_id);

ALTER TABLE invites ADD COLUMN IF NOT EXISTS rule_id BIGINT REFERENCES reward_rules(id) ON DELETE SET NULL;

INSERT INTO reward_rule_members (rule_id, student_id, supporter_id)
SELECT id, student_id, supporter_id FROM reward_rules
ON CONFLICT DO NOTHING;
