import {load} from 'cheerio';

// Read serialized data only. Never evaluate the page's JavaScript or follow its script URLs.
function flights(html){
 const values=[];
 for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)){
  const payload=/^\s*self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?\s*$/.exec(match[1]);
  if(!payload)continue;
  try{const value=JSON.parse(payload[1]);if(value[0]===1&&typeof value[1]==='string')values.push(value[1]);}catch{}
 }
 return values;
}

function arrayAt(text,start){
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"')quoted=true;
  else if(c==='['||c==='{')depth++;
  else if(c===']'||c==='}'){
   depth--;if(depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{return null;}}
  }
 }
 return null;
}

export function taipeiDate(value){
 if(typeof value!=='string'||!value.trim())return null;
 const text=value.trim();
 const iso=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(text);
 const english=/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
 if(!iso&&!english)return null;
 const parts=iso?text.split(/[- T:]/).map(Number):[Number(english[3]),'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(english[1])+1,Number(english[2]),Number(english[4]),Number(english[5]),Number(english[6]??0)];
 const [year,month,day,hour,minute,second=0]=parts,calendar=new Date(Date.UTC(year,month-1,day,hour,minute,second));
 if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||calendar.getUTCHours()!==hour||calendar.getUTCMinutes()!==minute||calendar.getUTCSeconds()!==second)return null;
 return new Date(calendar.getTime()-8*3600000);
}

export function parseListing(html){
 const items=new Map();
 for(const text of flights(html))for(const match of text.matchAll(/"items"\s*:\s*\[/g)){
  const records=arrayAt(text,match.index+match[0].lastIndexOf('['));
  if(!Array.isArray(records))continue;
  for(const record of records){
   if(!record||!Number.isSafeInteger(record.News_sn)||record.News_sn<=0||typeof record.News_title!=='string'||!record.News_title.trim())continue;
   const pubDate=taipeiDate(record.Release_strat_datetime);
   if(!pubDate||items.has(record.News_sn))continue;
   items.set(record.News_sn,{title:record.News_title.trim(),link:`https://www.taiwannews.com.tw/en/news/${record.News_sn}`,pubDate,description:record.Sub_title??'',category:record.Category_name?[record.Category_name]:[]});
  }
 }
 if(!items.size)throw Error('No dated Taiwan News articles in the public Next.js listing');
 return [...items.values()].sort((a,b)=>b.pubDate-a.pubDate||a.link.localeCompare(b.link));
}

export function parseArticle(html){
 const $=load(html),title=$('h1').first().text().trim();
 const pubDate=taipeiDate($('meta[property="article:published_time"]').attr('content'));
 if(!pubDate)throw Error('Missing Taiwan News article date');
 // The public server stream contains the article's HTML as a text chunk. Ignore framework JSON,
 // navigation, arbitrary JS and small teaser strings; a missing body remains an explicit failure.
 const chunks=flights(html),bytes=Buffer.from(chunks.join(''),'utf8'),wire=bytes.toString('latin1'),records=[];
 const headers=/(?:^|\n)[0-9a-f]+:T([0-9a-f]+),/g;let framed=false;
 for(const match of wire.matchAll(headers)){
  framed=true;
  const start=match.index+match[0].length,end=start+Number.parseInt(match[1],16);
  if(end<=bytes.length)records.push(bytes.subarray(start,end).toString('utf8'));
 }
 // A text record may share a chunk with imports or span several pushes. Its length is bytes,
 // not JS characters; never include the next record or use a truncated fragment as a full body.
 const bodies=framed?records:[...chunks];
 // Next.js inlines shorter text in component props and streams longer text separately.
 for(const text of chunks)for(const match of text.matchAll(/"content"\s*:\s*("(?:[^"\\]|\\.)*")/g)){
  try{bodies.push(JSON.parse(match[1]));}catch{}
 }
 const description=[...new Set(bodies.filter(text=>/^\s*<(?:p|div|figure|h[1-6])\b/i.test(text)&&load(text).text().trim().length>=200))].join('\n');
 if(!title||!description)throw Error('No public Taiwan News article body');
 return {title,pubDate,description};
}
