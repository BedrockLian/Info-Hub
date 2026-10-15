import {INTELLIGENCE} from '@aihot/industry/intelligence';
export interface AttentionCandidate {id:string;selected:boolean;score:number|null;latestAt:string;sourceCount:number;category:string|null}
export function attentionOrder(a:AttentionCandidate,b:AttentionCandidate):number{
 return Number(b.selected)-Number(a.selected)||(b.score??-Infinity)-(a.score??-Infinity)||b.latestAt.localeCompare(a.latestAt)||b.sourceCount-a.sourceCount||a.id.localeCompare(b.id);
}
export function diverseAttention<T extends AttentionCandidate>(input:T[],limit:number=INTELLIGENCE.hotLimit):T[]{
 const strongest=new Map<string,T>();for(const entry of [...input].sort(attentionOrder))if(!strongest.has(entry.id))strongest.set(entry.id,entry);
 const entries=[...strongest.values()];
 const result:T[]=[],counts=new Map<string,number>();
 for(const entry of entries){const category=entry.category??'other';if((counts.get(category)??0)>=INTELLIGENCE.hotCategorySoftLimit)continue;result.push(entry);counts.set(category,(counts.get(category)??0)+1);if(result.length===limit)return result;}
 for(const entry of entries){if(result.some(e=>e.id===entry.id))continue;result.push(entry);if(result.length===limit)break;}
 return result.sort(attentionOrder);
}
