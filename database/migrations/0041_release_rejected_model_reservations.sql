-- HTTP 402 explicitly rejected these requests without producing billable output.
-- Unknown outcomes and received responses retain their existing budget charge.
UPDATE receipt_attempts
SET budget_charge_usd = 0
WHERE service = 'llm' AND origin = 'live' AND status = 'failed'
  AND error LIKE 'HTTP 402:%' AND usage IS NULL AND cost IS NULL;
