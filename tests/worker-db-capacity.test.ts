import "./setup.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("deployed worker pool can make progress while event and report locks reserve connections", async () => {
  const compose = readFileSync(new URL("../ops/rsshub.compose.yml", import.meta.url), "utf8");
  const maximum = /DATABASE_POOL_MAX:\s*'([0-9]+)'/.exec(compose.split("  worker:")[1]!)?.[1];
  assert.ok(maximum, "the worker must have an explicit connection capacity");
  // Three concurrent digests and a daily report can hold connections while
  // their callbacks need another connection for materials or paid receipts. A pool of four stalls.
  const script = `
    import {sql,closeDb} from '@aihot/backend/db';
    const held=[];
    try {
      for(let i=0;i<4;i++)held.push(await sql.reserve());
      await sql\`SELECT 1\`;
      console.log('worker-progress');
    } finally { for(const connection of held)connection.release();await closeDb(); }
  `;
  const result = await new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: new URL("..", import.meta.url), env: { ...process.env, DATABASE_POOL_MAX: maximum, MODEL_CALLS_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", timedOut = false;
    child.stdout.on("data", (part) => { output += part; });
    child.stderr.on("data", (part) => { output += part; });
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 5000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code) => { clearTimeout(timeout); resolve({ code, output, timedOut }); });
  });
  assert.equal(result.timedOut, false, "worker starved its nested database work behind held locks");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /worker-progress/);
});
