-- Lookups added with shared plans, reminders and companions.
CREATE INDEX IF NOT EXISTS shared_plan_members_user_active
  ON shared_plan_members (user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS shared_plan_members_plan_active
  ON shared_plan_members (plan_id, joined_at) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS merki_lines_user_created
  ON merki_lines (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_subs_user
  ON push_subs (user_id);
CREATE INDEX IF NOT EXISTS push_prefs_enabled
  ON push_prefs (user_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS companion_grants_user
  ON companion_grants (user_id) WHERE NOT hidden;
