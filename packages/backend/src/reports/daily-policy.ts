import {INTELLIGENCE} from '@aihot/industry/intelligence';
import {beijingMidnight} from '@aihot/contracts/time';
import {sha256,stableJson} from '../lib/ids.ts';
export interface DailyCandidate {itemId:string;factKey:string;storyPublicId:string|null;selected:boolean;category:string|null;score:number|null;publishedAt:string;revision:number;title:string;summary:string}
export function dailyWindow(date:string,now=new Date()):{start:Date;end:Date;status:'updating'|'final'}{
 const midnight=beijingMidnight(date).getTime();
 const start=new Date(midnight-(24-INTELLIGENCE.morningHour)*3600000),final=midnight+INTELLIGENCE.finalHour*3600000;
 const end=new Date(Math.min(now.getTime(),final));
 if(end<start)throw new Error('A daily report cannot precede its coverage window');
 return {start,end,status:now.getTime()>=final?'final':'updating'};
}
export function dailyOrder(a:DailyCandidate,b:DailyCandidate){return Number(b.selected)-Number(a.selected)||(b.score??-Infinity)-(a.score??-Infinity)||b.publishedAt.localeCompare(a.publishedAt)||a.itemId.localeCompare(b.itemId);}
export function selectDaily<T extends DailyCandidate>(input:T[]):{focus:T[];briefs:T[]}{
 const unique:T[]=[],seen=new Set<string>();
 for(const c of [...input].sort(dailyOrder)){const key=c.storyPublicId??c.factKey;if(seen.has(key))continue;seen.add(key);unique.push(c);}
 const focus=unique.filter(c=>c.selected).slice(0,INTELLIGENCE.dailyFocusLimit);
 const briefs:T[]=[],counts=new Map<string,number>();
 for(const c of unique){if(focus.includes(c))continue;const category=c.category??'other';if((counts.get(category)??0)>=INTELLIGENCE.dailyBriefsPerCategory)continue;briefs.push(c);counts.set(category,(counts.get(category)??0)+1);if(focus.length+briefs.length===INTELLIGENCE.dailyLimit)break;}
 return {focus,briefs};
}
export function dailyInputHash(candidates:DailyCandidate[]):string{return sha256(stableJson([...candidates].sort((a,b)=>a.itemId.localeCompare(b.itemId))));}
