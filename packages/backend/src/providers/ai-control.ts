import type { AiRuntimeStatus } from '@aihot/contracts/ai-control';
import { config } from '../config.ts';
import { sql, type Db } from '../db.ts';
import { BudgetExceededError } from './receipts.ts';

/** No process cache: API writes must be visible to worker admission immediately. */
export async function aiRuntimeStatus(db: Db = sql): Promise<AiRuntimeStatus> {
  const [row] = await db<{ value: { enabled?: boolean }; updated_at: Date }[]>`SELECT value, updated_at FROM settings WHERE key='runtime.ai'`;
  const enabled = row ? row.value?.enabled === true : true;
  return { enabled, deploymentEnabled: config.modelCallsEnabled, effectiveEnabled: enabled && config.modelCallsEnabled, updatedAt: row?.updated_at.toISOString() ?? null };
}

/** Uses the existing deferred-work path, without consuming article or queue failure retries. */
export class AiPausedError extends BudgetExceededError {
  constructor() {
    super('models', 'AI paused', 60);
    this.message = 'AI modules are paused; waiting for the administrator to resume';
  }
}

export async function assertAiEnabled(db: Db = sql): Promise<void> {
  if (!config.modelCallsEnabled || !(await aiRuntimeStatus(db)).effectiveEnabled) throw new AiPausedError();
}
