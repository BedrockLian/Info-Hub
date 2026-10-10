-- Conservative USD charge: reserve before sending, settle using peak-rate token estimates.
-- Unknown or unpriced outcomes retain the reservation; retries reserve independently.
ALTER TABLE receipt_attempts ADD COLUMN budget_charge_usd numeric(16,8) NOT NULL DEFAULT 0 CHECK (budget_charge_usd >= 0);
UPDATE budgets SET per_minute=10, per_hour=100, per_day=500, note='Info-Hub 保守请求次数上限；另有 USD 金额熔断' WHERE service IN ('llm','deepseek');
