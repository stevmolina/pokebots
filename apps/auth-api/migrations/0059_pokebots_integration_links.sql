CREATE TABLE pokebots_integration_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('brain', 'rooms')),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, audience),
  UNIQUE (audience, issuer, subject)
);
