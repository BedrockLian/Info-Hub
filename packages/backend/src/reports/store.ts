import {sql} from '../db.ts';
export async function saveReport(kind:'daily'|'weekly'|'monthly',key:string,start:Date,end:Date,content:Record<string,unknown>,reason:string,model:string|null,origin:'model'|'rule'='model'){
 await sql.begin(async tx=>{
  const [existing]=await tx<{id:number;revision:number;content:unknown;generated_at:Date}[]>`SELECT id,revision,content,generated_at FROM reports WHERE kind=${kind} AND key=${key} FOR UPDATE`;
  if(existing){
   await tx`INSERT INTO report_revisions (report_id,revision,content,generated_at,reason) VALUES (${existing.id},${existing.revision},${tx.json(existing.content as never)},${existing.generated_at},${reason}) ON CONFLICT DO NOTHING`;
   await tx`UPDATE reports SET content=${tx.json(content as never)},window_start=${start},window_end=${end},generated_at=now(),model=${model},origin=${origin},revision=revision+1,updated_at=now() WHERE id=${existing.id}`;
  }else await tx`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,model,origin) VALUES (${kind},${key},${start},${end},${tx.json(content as never)},now(),${model},${origin})`;
 });
}
