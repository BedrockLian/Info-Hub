-- Reuse is backed by durable validated receipts; this table records lookups, not duplicate payloads.
CREATE TABLE model_result_cache_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  receipt_id bigint NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  subject text,
  template_hash text NOT NULL,
  content_hash text NOT NULL,
  target_language text NOT NULL,
  reused boolean NOT NULL
);
CREATE INDEX model_result_cache_events_time_purpose ON model_result_cache_events(created_at,purpose);
