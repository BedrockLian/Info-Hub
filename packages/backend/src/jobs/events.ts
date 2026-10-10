import { runDeferred } from "./defer.ts";
// Event jobs: serial grouping, debounced digests.
import type { PgBoss } from "pg-boss";
import { groupArticle } from "../events/group.ts";
import { composeStoryDigest } from "../events/digest.ts";
import { BudgetExceededError, ReceiptBusyError } from "../providers/receipts.ts";
import { settleNonEditorial } from "./content.ts";
import { ensureQueue, enqueue, QUEUES } from "./queue.ts";

const groupOptions = { localConcurrency: 1, pollingIntervalSeconds: 0.5, includeMetadata: true } as const;
const digestOptions = { localConcurrency: 3, pollingIntervalSeconds: 5, includeMetadata: true } as const;

export async function registerEventJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.group);
  // Serial on purpose: two reports of the same new fact must not both create it.
  await boss.work<{ articleId: string; signalOnly?: boolean; force?: boolean }, unknown, typeof groupOptions>(QUEUES.group, groupOptions, async ([job]) => {
    if (!job) return;
    return runDeferred(async () => {
      // A discussion post comes here straight from collection: record it first (settleNonEditorial).
      if (job.data.signalOnly && !job.data.force && !(await settleNonEditorial(job.data.articleId)).group) return { verdict: "skipped" };
      const result = await groupArticle(job.data.articleId, { signalOnly: job.data.signalOnly, force: job.data.force });
      if (result.storyId && !result.verdict.startsWith("signal")) {
        await enqueue(QUEUES.digest, { storyId: result.storyId }, { singletonKey: `story:${result.storyId}`, startAfter: 60 });
      }
      return result;
    }, seconds => enqueue(QUEUES.group, job.data, {singletonKey:job.singletonKey ?? job.data.articleId, startAfter:seconds, priority:job.priority}));
  });
  await ensureQueue(QUEUES.digest);
  await boss.work<{ storyId: number; afterCorrection?: boolean }, unknown, typeof digestOptions>(QUEUES.digest, digestOptions, async ([job]) => {
    if (!job) return;
    return runDeferred(() => composeStoryDigest(job.data.storyId, { afterCorrection: job.data.afterCorrection }), seconds => enqueue(QUEUES.digest, job.data, {singletonKey:job.singletonKey ?? `story:${job.data.storyId}`, startAfter:seconds, priority:job.priority}));
  });
}
