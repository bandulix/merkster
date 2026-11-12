-- Lines are cached per age band too, so switching Klasse the same day gets a new voice.
ALTER TABLE merki_lines ADD COLUMN IF NOT EXISTS band TEXT NOT NULL DEFAULT 'mid';
ALTER TABLE merki_lines DROP CONSTRAINT IF EXISTS merki_lines_pkey;
ALTER TABLE merki_lines ADD CONSTRAINT merki_lines_pkey PRIMARY KEY (user_id, day, trigger, band);
