import {getMarketData} from '../../../lib/market-hub';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// The economic calendar must stay usable when the AI analysis snapshot is
// warming up or temporarily degraded. Only real provider timestamps qualify.
const WINDOW_MS=8*60*60*1000;
const AGE_MS=10*60*1000;
const CACHE_MS=90*1000;
let cached:{at:number;body:any}|null=null;
let pending:Promise<any>|null=null;

const relevant=(name:string,importance:number)=>
  importance>=2||/CPI|PCE|PPI|inflation|price index|nonfarm|payroll|employment|unemployment|jobless|claims|JOLTS|GDP|retail sales|ISM|PMI|consumer confidence|durable goods|industrial production|FOMC|Fed\b|Powell|interest rate|rate decision|Treasury|yield/i.test(name);

async function load(){
  const now=Date.now();
  const market=await getMarketData();
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
    const body=await pending;
    cached={at:Date.now(),body};
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
