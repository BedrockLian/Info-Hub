-- Opaque personal subscription tokens; only a SHA-256 digest is persisted.
CREATE TABLE read_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL
);
