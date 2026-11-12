-- One explanation per card, style and age band. Shared across students: it is about the card, not the person.
CREATE TABLE IF NOT EXISTS explain_cache (
  item_key   TEXT NOT NULL,
  style      TEXT NOT NULL,
  band       TEXT NOT NULL,
  body       TEXT NOT NULL,
  sketch     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_key, style, band)
);
