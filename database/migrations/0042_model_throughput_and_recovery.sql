-- Keep the existing minute/hour pace, while removing the premature 500-call day gate.
-- Money reservations still enforce USD limits before every send. Respect custom limits/stops.
WITH adjusted AS (
  UPDATE budgets SET per_day = 2400,
    note = 'Info-Hub 速率保护：10/min、100/h、2400/24h；开支另受 USD 金额熔断'
  WHERE service IN ('llm', 'deepseek')
    AND per_minute = 10 AND per_hour = 100 AND per_day = 500
  RETURNING service
)
UPDATE articles SET processing_retry_at = NULL, processing_queued_at = NULL
WHERE processing_state = 'new' AND processing_error LIKE 'Budget for llm exhausted (day)%'
  AND EXISTS (SELECT 1 FROM adjusted WHERE service = 'llm');

-- Balance is now available: retry earlier explicit 402 refusals through the normal guarded queue.
-- Do not retry other failures, review decisions, or outcomes that might already have been billed.
UPDATE articles SET processing_state = 'new', processing_attempts = 0,
  processing_retry_at = NULL, processing_queued_at = NULL, processing_error = NULL
WHERE processing_state = 'failed' AND processing_error LIKE 'HTTP 402:%';
