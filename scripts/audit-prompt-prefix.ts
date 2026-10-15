// Offline diagnostics only. Input stays local; output contains no prompt text or credentials.
import {readFileSync} from 'node:fs';
import {auditPrompt,comparePromptPrefixes} from '../packages/backend/src/providers/prompt-audit.ts';

const file=process.argv[2];
if(!file){console.error('Usage: node scripts/audit-prompt-prefix.ts <local-requests.json>');process.exit(1);}
try{
 const requests:unknown=JSON.parse(readFileSync(file,'utf8'));
 if(!Array.isArray(requests)||!requests.length)throw Error();
 const messages=requests.map(r=>{if(!r||!Array.isArray(r.messages))throw Error();return r.messages;});
 const audited=messages.map((m,index)=>({index,...auditPrompt(m),comparisonToFirst:comparePromptPrefixes(messages[0]!,m)}));
 console.log(JSON.stringify({characterUnit:'UTF-16, not provider tokens',requests:audited},null,2));
}catch{console.error('Prompt audit failed: expected a readable JSON array of requests with one system and one text user message.');process.exit(1);}
