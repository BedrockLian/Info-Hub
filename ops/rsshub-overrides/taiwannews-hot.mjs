import {t as got} from './got-CzLN7yeY.mjs';
import {t as cache} from './cache-CtYX8KBG.mjs';
import {parseListing,parseArticle} from './infohub-taiwannews-parser.mjs';

// These relative utility names deliberately match the pinned RSSHub base image, not latest.
export const route={
 path:'/hot/:lang?',categories:['traditional-media'],example:'/taiwannews/hot/en',
 parameters:{lang:'Only en is supported by this verified public-page override'},
 features:{requireConfig:false,requirePuppeteer:false,antiCrawler:false,supportBT:false,supportPodcast:false,supportScihub:false},
 name:'Hot News',maintainers:['TonyRL'],
 async handler(ctx){
  if((ctx.req.param('lang')??'en')!=='en')throw Error('The verified Taiwan News override supports en only');
  const base='https://www.taiwannews.com.tw/';
  const listing=await got(base);
  const requested=Number(ctx.req.query('limit')??20),limit=Number.isFinite(requested)?Math.max(1,Math.min(20,Math.floor(requested))):20;
  const candidates=parseListing(listing.data).slice(0,limit),items=[];
  // Keep network and parsing peaks small on the two-gigabyte host.
  for(const candidate of candidates){
   try{
    const details=await cache.tryGet(`infohub:twnews:next:v1:${candidate.link}`,async()=>{
     const response=await got(candidate.link);return parseArticle(response.data);
    });
    items.push({...candidate,...details});
   }catch{items.push(candidate);}
  }
  return {title:'Taiwan News · Hot News',link:base,language:'en',item:items};
 }
};
