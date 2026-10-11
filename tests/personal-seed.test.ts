import './setup.ts';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {sql} from '@aihot/backend/db';
import {seedTopics} from '@aihot/backend/publication/topics';
after(async()=>{await sql.end();});
test('the personal topic pack can be seeded into the actual database and rerun without duplicates',async()=>{
 await seedTopics();await seedTopics();
 const rows=await sql`SELECT slug,name FROM topics WHERE slug IN ('global_affairs','china_coverage','technology','games','public_affairs','east-asia')`;
 assert.equal(rows.length,6);
});
