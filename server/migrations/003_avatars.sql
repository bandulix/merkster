-- Profile pictures are cached server-side (downloaded from Google on every sign-in) and served from
-- /api/avatars/:id – no hotlinking of googleusercontent.com, keeps working when Google's URL expires,
-- and same-origin images don't taint the share-card canvas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_etag TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_fetched_at TIMESTAMPTZ;
