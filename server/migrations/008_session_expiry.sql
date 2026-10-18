-- Expired session rows are deleted on the next sign-in. The index keeps that delete off a full scan.
CREATE INDEX IF NOT EXISTS auth_sessions_expires ON auth_sessions (expires_at);
