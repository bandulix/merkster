-- A picture the student chose, or the choice to have none, must survive the next Google login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_custom BOOLEAN NOT NULL DEFAULT FALSE;
