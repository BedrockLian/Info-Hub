import assert from 'node:assert/strict';
import {test} from 'node:test';
import {attentionOrder,diverseAttention} from '../packages/backend/src/events/attention-policy.ts';
import {dailyWindow,selectDaily,dailyInputHash} from '../packages/backend/src/reports/daily-policy.ts';

test('attention prefers selection then known score, updates, coverage and stable IDs; a single source remains eligible',()=>{
 const entries=[{id:'b',selected:false,score:99,latestAt:'2026-10-15T04:00:00Z',sourceCount:8,category:'technology'},{id:'a',selected:true,score:70,latestAt:'2026-10-15T03:00:00Z',sourceCount:1,category:'games'}];
 assert.equal(entries.sort(attentionOrder)[0]!.id,'a');
 assert.deepEqual(diverseAttention(entries,10).map(e=>e.id),['a','b']);
 assert.ok(attentionOrder({...entries[0]!,score:0},{...entries[0]!,score:null})<0,'missing score is not invented as zero');
});
test('category cap is soft and the board never repeats an event',()=>{
 const entries=Array.from({length:12},(_,i)=>({id:String(i).padStart(2,'0'),selected:true,score:100-i,latestAt:'2026-10-15T04:00:00Z',sourceCount:1,category:i<10?'global_affairs':'games'}));
 const result=diverseAttention([...entries,entries[0]!],10);
 assert.equal(result.length,10);assert.equal(new Set(result.map(e=>e.id)).size,10);assert.equal(result.filter(e=>e.category==='games').length,2);
});
test('duplicate event inputs keep the strongest representative rather than the last row',()=>{
 const common={id:'event',selected:true,latestAt:'2026-10-15T04:00:00Z',sourceCount:1,category:'games'};
 assert.equal(diverseAttention([{...common,score:50},{...common,score:90}])[0]!.score,90);
});
test('daily covers the morning window, accumulates until 22:00 and never looks into the future',()=>{
 assert.deepEqual(dailyWindow('2026-10-15',new Date('2026-10-15T00:00:00Z')),{start:new Date('2026-10-14T00:00:00Z'),end:new Date('2026-10-15T00:00:00Z'),status:'updating'});
 assert.equal(dailyWindow('2026-10-15',new Date('2026-10-15T05:00:00Z')).end.toISOString(),'2026-10-15T05:00:00.000Z');
 assert.equal(dailyWindow('2026-10-15',new Date('2026-10-15T15:00:00Z')).end.toISOString(),'2026-10-15T14:00:00.000Z');
 assert.equal(dailyWindow('2026-10-15',new Date('2026-10-15T14:00:00Z')).status,'final');
});
const candidate=(i:number,selected=true,category='technology')=>({itemId:String(i),factKey:'f'+i,storyPublicId:'s'+i,selected,category,score:90-i,publishedAt:'2026-10-15T01:00:00Z',revision:1,title:'title '+i,summary:'summary'});
test('daily focus stays selected, briefs have category bounds, events deduplicate and total is bounded',()=>{
 const all=[...Array.from({length:9},(_,i)=>candidate(i)),...Array.from({length:20},(_,i)=>candidate(i+20,false,i%2?'games':'global_affairs')),candidate(50,false,'technology')];
 all.push({...candidate(99),storyPublicId:'s0'});
 const result=selectDaily(all);
 assert.equal(result.focus.length,5);assert.ok(result.focus.every(e=>e.selected));assert.equal(result.briefs.length,6);
 assert.ok(result.focus.length+result.briefs.length<=15);
 assert.equal(new Set([...result.focus,...result.briefs].map(e=>e.storyPublicId)).size,result.focus.length+result.briefs.length);
});
test('daily hash is order independent, ignores refresh time, and changes with published material revision',()=>{
 const all=[candidate(1),candidate(2)];assert.equal(dailyInputHash(all),dailyInputHash([...all].reverse()));
 assert.notEqual(dailyInputHash(all),dailyInputHash([{...all[0]!,revision:2},all[1]!]));
});
