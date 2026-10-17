import type {Candle} from './engine';
import {certifyMlResponse} from './ai-model-certification';

type Side='BUY'|'SELL'|'WAIT';
export type MlHorizon={
  side:Side;leanSide:Exclude<Side,'WAIT'>;probUp:number;probDown:number;
  confidence:number;edge:number;ready:boolean;metrics:any;component:any;
};
export type MlPrediction={
  ok:boolean;version?:string;status?:string;trainedAt?:number;source?:string;historyRows?:number;
  oneMinute?:MlHorizon;fiveMinute?:MlHorizon;
  consensus?:{side:'BUY'|'SELL';aligned:boolean;confidence:number;ready:boolean};
  shadow?:boolean;reason?:string;latencyMs?:number;
};

let cache:{at:number;key:string;value:MlPrediction}|null=null;

// Verify a continuous, closed, reasonably fresh M1 window before requesting
// any neural/boosted model inference. A good HTTP response is not market proof.
export function prepareMlCandles(c:Candle[],now:number){
  const unique=new Map<number,Candle>(),conflictingTimes=new Set<number>();
  for(const x of Array.isArray(c)?c:[]){
    const t=Number(x?.time),o=Number(x?.open),h=Number(x?.high),
      l=Number(x?.low),close=Number(x?.close);
    if(![t,o,h,l,close].every(Number.isFinite)||t<=0||t%60000!==0||
      l<=0||h<Math.max(o,close)||l>Math.min(o,close)||
      t+60000>now)continue;
    const prior=unique.get(t);
    if(prior&&[prior.open,prior.high,prior.low,prior.close].some((v,i)=>
      Number(v)!==[o,h,l,close][i]))conflictingTimes.add(t);
    unique.set(t,x);
  }
  const rows=[...unique.values()].sort((a,b)=>a.time-b.time).slice(-420);
  const last=rows.at(-1);
  if(rows.length<220||!last)return {ready:false,rows:[] as Candle[],reason:'insufficient valid closed M1 history'};
  if(rows.some(c=>conflictingTimes.has(c.time)))return {ready:false,rows:[] as Candle[],reason:'conflicting duplicate M1 observations'};
  if(now-(last.time+60000)>120000)return {ready:false,rows:[] as Candle[],reason:'stale BTC M1 history'};
  const tail=rows.slice(-40);
  if(tail.some((x,i)=>i>0&&x.time-tail[i-1].time!==60000))
    return {ready:false,rows:[] as Candle[],reason:'gapped M1 history near inference'};
  return {ready:true,rows,reason:''};
}
function volume(c:Candle){
  const x=Number(c.realVolume??c.tickVolume??0);
  return Number.isFinite(x)&&x>=0?x:0;
}

export async function getMlPrediction(c1:Candle[],now=Date.now()):Promise<MlPrediction>{
  const url=String(process.env.ML_ENGINE_URL||'').trim();
  if(!url)return {ok:false,status:'DISABLED',reason:'ML_ENGINE_URL missing',shadow:true};
  const candleCheck=prepareMlCandles(c1,now);
  if(!candleCheck.ready)return {ok:false,status:'WAIT',reason:candleCheck.reason,shadow:true};
  const rows=candleCheck.rows,last=rows.at(-1)!;
  // A provider correction to an older candle must invalidate cached AI output.
  // Last-close-only keys silently replay predictions from superseded features.
  const cacheKey=rows.map(c=>[c.time,c.open,c.high,c.low,c.close,volume(c)].join(':')).join('|');
  if(cache&&now-cache.at<4000&&cache.key===cacheKey)return cache.value;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  const started=Date.now();
  try{
    const r=await fetch(url.replace(/\/$/,'')+'/predict',{
      method:'POST',cache:'no-store',signal:controller.signal,
      headers:{'Content-Type':'application/json','User-Agent':'AhmedGoldCommand-ML/1.0'},
      body:JSON.stringify({candles:rows.map(c=>({
        time:c.time,open:c.open,high:c.high,low:c.low,close:c.close,volume:volume(c)
      }))})
    });
    const j=await r.json().catch(()=>null);
    if(!r.ok||!j||typeof j!=='object'){
      return {ok:false,status:'ERROR',reason:'ML HTTP '+r.status,shadow:true,latencyMs:Date.now()-started};
    }
    const out:MlPrediction={...certifyMlResponse(j),latencyMs:Date.now()-started};
    cache={at:now,key:cacheKey,value:out};
    return out;
  }catch(e){
    return {ok:false,status:'UNAVAILABLE',reason:e instanceof Error?e.message:'ml unavailable',shadow:true,latencyMs:Date.now()-started};
  }finally{
    clearTimeout(timer);
  }
}
