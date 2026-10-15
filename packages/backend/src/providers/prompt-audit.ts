import {sha256,stableJson} from '../lib/ids.ts';

type TextMessage={role:string;content:string};
export const PROMPT_AUDIT_VERSION='prompt-audit-v1';

/** Inspect the actual editorial wire messages; persist only hashes and character counts. */
export function auditPrompt(messages:TextMessage[]){
 if(messages.length!==2||messages[0]?.role!=='system'||messages[1]?.role!=='user'||messages.some(m=>typeof m.content!=='string'))throw Error('Prompt audit requires a leading system and one user message');
 const [fixed,material]=messages as [TextMessage,TextMessage];
 let recordCount:number|null=null;
 try{const parsed=JSON.parse(material.content);if(Array.isArray(parsed))recordCount=parsed.length;}catch{/* Source text is preserved verbatim. */}
 return {version:PROMPT_AUDIT_VERSION,prefixHash:sha256(stableJson(fixed)),prefixChars:fixed.content.length,
  materialHash:sha256(material.content),materialChars:material.content.length,recordCount};
}

/** Diagnostic positions are UTF-16 characters, never provider tokens or source excerpts. */
export function comparePromptPrefixes(a:TextMessage[],b:TextMessage[]){
 const aa=auditPrompt(a),bb=auditPrompt(b),x=a[0]!.content,y=b[0]!.content;
 let commonPrefixChars=0;while(commonPrefixChars<Math.min(x.length,y.length)&&x[commonPrefixChars]===y[commonPrefixChars])commonPrefixChars++;
 const sameFixedPrefix=aa.prefixHash===bb.prefixHash;
 return {sameFixedPrefix,commonPrefixChars,firstDifference:sameFixedPrefix?null:commonPrefixChars};
}

export function privateUserText(value:unknown):string{
 if(typeof value==='string')return value;
 const text=stableJson(value);if(typeof text!=='string')throw Error('Unsupported prompt material');return text;
}
