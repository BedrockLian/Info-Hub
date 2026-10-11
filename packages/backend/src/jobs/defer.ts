import { BudgetExceededError, ReceiptBusyError } from '../providers/receipts.ts';
/** A time/budget wait is deferred work, never a failed event or an exhausted queue retry. */
export async function runDeferred<T>(run:()=>Promise<T>,defer:(seconds:number)=>Promise<unknown>):Promise<T|{deferred:true}> {
  try {return await run();} catch(error) {
    if(!(error instanceof BudgetExceededError || error instanceof ReceiptBusyError))throw error;
    await defer(error instanceof BudgetExceededError ? error.retryAfterSeconds : 60);
    return {deferred:true};
  }
}
