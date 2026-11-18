CREATE TABLE pokebots_integration_grants (
  grant_hash TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  auth_session_hash TEXT NOT NULL,
  auth_epoch INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX pokebots_integration_grants_expiry ON pokebots_integration_grants(expires_at);
CREATE INDEX pokebots_integration_grants_session ON pokebots_integration_grants(session_id, expires_at);
