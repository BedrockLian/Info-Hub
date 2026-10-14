import {z} from 'zod';
import {stableJson} from '../lib/ids.ts';

/** Keep task rules/schema ahead of per-article dates, IDs and text. Never normalize source material. */
export function stablePrompt(system:string,user:string,purpose:string,schema:z.ZodType,json:boolean){
  const boundary=purpose==='summarize_article'&&system.trim()===''?user.indexOf('【时间锚点】'):-1;
  const fixed=boundary>=0?user.slice(0,boundary):system;
  const material=boundary>=0?user.slice(boundary):user;
  const contract=json?'【固定结果结构】\n'+stableJson(z.toJSONSchema(schema,{unrepresentable:'any'})):'';
  return {system:[fixed.replace(/\r\n?/g,'\n').trim(),contract].filter(Boolean).join('\n\n'),user:material};
}
