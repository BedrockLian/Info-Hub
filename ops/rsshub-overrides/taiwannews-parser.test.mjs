import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseListing,parseArticle,taipeiDate} from './taiwannews-parser.mjs';

const flight=value=>`<script>self.__next_f.push(${JSON.stringify([1,value])})</script>`;
const record={News_sn:123,News_title:'A public news headline',Sub_title:'A verified news description',Category_name:'Politics',Release_strat_datetime:'2026-10-17 10:55:23',WriterList:[{Writer_sn:4}],TagList:[{Tag_name:'A bracket ] and an escaped " quote'}]};
test('Next.js listing preserves nested arrays, escaped text and the original timestamp',()=>{
 const items=parseListing(flight(`a:${JSON.stringify({items:[record]})}`));
 assert.equal(items.length,1);assert.equal(items[0].link,'https://www.taiwannews.com.tw/en/news/123');
 assert.equal(items[0].pubDate.toISOString(),'2026-10-17T02:55:23.000Z');assert.equal(items[0].title,record.News_title);
});
test('repeated carousel items are unique and invalid records cannot become articles',()=>{
 const html=flight(JSON.stringify({items:[record,record,{...record,News_sn:'../../escape'},{...record,News_sn:124,Release_strat_datetime:'invalid'}]}));
 assert.deepEqual(parseListing(html).map(i=>i.link),['https://www.taiwannews.com.tw/en/news/123']);
});
test('a menu or an obsolete layout fails visibly instead of inventing a feed',()=>{
 assert.throws(()=>parseListing('<nav><a href="/en/news/123">Menu</a></nav>'),/No dated/);
});
test('public article HTML comes only from JSON flight strings, with its own headline and date',()=>{
 const body='<p>'+('Public article facts. '.repeat(20))+'</p>';
 const html='<h1>Article headline</h1><meta property="article:published_time" content="Oct. 17, 2026 10:55">'+flight(body);
 const result=parseArticle(html);
 assert.equal(result.title,'Article headline');assert.equal(result.description,body);assert.equal(result.pubDate.toISOString(),'2026-10-17T02:55:00.000Z');
});
test('scripts are treated as data and unrelated strings never become article content',()=>{
 globalThis.taiwanFixtureExecuted=false;
 const html='<h1>Headline</h1><meta property="article:published_time" content="Oct. 17, 2026 10:55"><script>globalThis.taiwanFixtureExecuted=true;</script>'+flight('not article content');
 assert.throws(()=>parseArticle(html),/No public/);assert.equal(globalThis.taiwanFixtureExecuted,false);
 delete globalThis.taiwanFixtureExecuted;
});
test('short articles embedded in framework props retain their body instead of falling back to a teaser',()=>{
 const body='<p>'+('A short factual update. '.repeat(15))+'</p>';
 const html='<h1>Short update</h1><meta property="article:published_time" content="Oct. 17, 2026 10:55">'+flight(`a:${JSON.stringify({children:['$',null,{itemProp:'articleBody',content:body}]})}`);
 assert.equal(parseArticle(html).description,body);
});
test('coalesced and split Flight text records use UTF-8 byte lengths and exclude following framework data',()=>{
 const body='<p>'+('台湾公开事实报道。'.repeat(40))+'</p>';
 const wire='a:I["module"]\n26:T'+Buffer.byteLength(body).toString(16)+','+body+'\n27:{"content":"unrelated"}';
 const html='<h1>Headline</h1><meta property="article:published_time" content="Oct. 17, 2026 10:55">'+flight(wire.slice(0,50))+flight(wire.slice(50));
 assert.equal(parseArticle(html).description,body);
});
test('a missing article date is not replaced with the current time',()=>{
 assert.throws(()=>parseArticle('<h1>Headline</h1>'+flight('<p>'+('Text. '.repeat(50))+'</p>')),/date/);
 assert.equal(taipeiDate('2026-99-99 99:99'),null);
 assert.equal(taipeiDate('2026-02-30 10:55'),null);
});
