CREATE TABLE pokebots_integration_link_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  auth_session_hash TEXT NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('brain', 'rooms')),
  issuer TEXT NOT NULL,
  callback TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX pokebots_integration_link_flows_session ON pokebots_integration_link_flows(auth_session_hash);
CREATE INDEX pokebots_integration_link_flows_expiry ON pokebots_integration_link_flows(expires_at);
