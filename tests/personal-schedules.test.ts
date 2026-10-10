import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {SCHEDULES} from '../apps/worker/src/schedules.ts';
import {catchUpReports} from '@aihot/backend/reports/compose';
import {sql} from '@aihot/backend/db';
import {stopBoss} from '@aihot/backend/jobs/queue';
after(async()=>{await stopBoss();await sql.end();});
test('removed modules never schedule paid work, daily reporting remains',()=>{
 const names=SCHEDULES.map(s=>s.name);
 for(const removed of ['content.translate','reports.weekly','reports.monthly','leaderboard.round','monitor.tick','monitor.lookback'])assert.ok(!names.includes(removed),removed);
 assert.ok(names.includes('reports.daily'));
});
test('catch-up also respects disabled period reports',async()=>{
 assert.deepEqual(await catchUpReports(new Date('2026-10-10T04:00:00Z'),0),{generated:[]});
});
