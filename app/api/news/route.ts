import {getNewsCalendarFeed} from '../../../lib/market-hub';
import {mergeAdpEvents,verifiedAdpToday} from '../../../lib/news-adp-pulse';
import type {Event} from '../../../lib/engine';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// The economic calendar must stay usable when the AI analysis snapshot is
// warming up or temporarily degraded. Only real provider timestamps qualify.
// Include the nearest confirmed release even if today has no events.
const WINDOW_MS=7*24*60*60*1000;
// The BLS calendar event remains available all day after publication time,
// even while upstream providers have not yet sent the actual result.
const AGE_MS=24*60*60*1000;
const CACHE_MS=15*1000;
let cached:{at:number;body:any}|null=null;
let pending:Promise<any>|null=null;

const relevant=(name:string,importance:number)=>
  importance>=2||/CPI|PCE|PPI|inflation|price index|nonfarm|payroll|employment|unemployment|jobless|claims|JOLTS|GDP|retail sales|ISM|PMI|consumer confidence|durable goods|industrial production|FOMC|Fed\b|Powell|interest rate|rate decision|Treasury|yield/i.test(name);

async function load(){
  const now=Date.now();
  const market=await getNewsCalendarFeed(now);
  const events=(market.events||[])
    .filter(e=>Number.isFinite(Number(e.time))&&Boolean(e.exactTime)&&
      e.time>=now-AGE_MS&&e.time<=now+WINDOW_MS&&
      relevant(String(e.name||''),Number(e.importance||1)))
    .sort((a,b)=>a.time-b.time)
    .map(e=>({
      id:e.id,name:e.name,time:e.time,importance:e.importance,
      actual:e.actual||'',forecast:e.forecast||'',previous:e.previous||'',
      source:e.source||'',exactTime:true
    }));
  return {ok:true,checkedAt:Date.now(),newsReady:market.newsReady,
    events,sourceStatus:market.newsReady?'ready':'unavailable',
    warning:market.newsReady?'':'مصادر التقويم الاقتصادي غير متاحة حالياً'};
}
export async function GET(){
  const now=Date.now();
  if(cached&&now-cached.at<CACHE_MS){
    return Response.json(cached.body,{headers:{'Cache-Control':'no-store'}});
  }
  try{
    if(!pending)pending=load().finally(()=>{pending=null;});
    // A provider can take longer than the browser's deadline. Return verified
    // releases and recent cached calendar entries rather than an empty screen.
    let timer:ReturnType<typeof setTimeout>|undefined;
    const fallback=new Promise<any>(resolve=>{
      timer=setTimeout(()=>{
        const events:Event[]=(cached?.body.events||[]).filter((e:Event)=>e.time>=Date.now()-AGE_MS&&e.time<=Date.now()+WINDOW_MS).map((e:Event)=>({...e}));
        mergeAdpEvents(events,verifiedAdpToday(Date.now()),Date.now());
        resolve({ok:true,checkedAt:Date.now(),events:events.sort((a,b)=>a.time-b.time),newsReady:events.length>0,sourceStatus:'stale',warning:'مصدر التقويم متأخر؛ عرض البيانات المؤكدة وآخر تقويم محفوظ'});
      },5500);
    });
    let body:any;
    try{body=await Promise.race([pending,fallback]);}finally{if(timer)clearTimeout(timer);}
    if(body.sourceStatus==='ready')cached={at:Date.now(),body};
    return Response.json(body,{headers:{'Cache-Control':'no-store'}});
  }catch{
    if(cached&&Date.now()-cached.at<30*60*1000){
      return Response.json({...cached.body,sourceStatus:'stale',warning:'المصدر لا يستجيب؛ عرض آخر تقويم محفوظ'},
        {headers:{'Cache-Control':'no-store'}});
    }
    return Response.json({ok:false,newsReady:false,events:[],
      message:'تعذر تحديث التقويم الاقتصادي من المصادر الفعلية'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
