import type {Candle} from './engine';

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

let cache:{at:number;value:MlPrediction}|null=null;

function closedM1(c:Candle[],now:number){
  return c.filter(x=>x.time+60000<=now).slice(-420);
}
function volume(c:Candle){
  const x=Number(c.realVolume??c.tickVolume??0);
  return Number.isFinite(x)&&x>=0?x:0;
}

export async function getMlPrediction(c1:Candle[],now=Date.now()):Promise<MlPrediction>{
  if(cache&&now-cache.at<4000)return cache.value;
  const url=String(process.env.ML_ENGINE_URL||'').trim();
  if(!url)return {ok:false,status:'DISABLED',reason:'ML_ENGINE_URL missing',shadow:true};
  const rows=closedM1(c1,now);
  if(rows.length<220)return {ok:false,status:'WAIT',reason:'insufficient M1 history',shadow:true};
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
    // Never allow malformed external model output to become a trading vote.
    const validHorizon=(h:any)=>h&&typeof h==='object'&&
      ['BUY','SELL','WAIT'].includes(h.side)&&
      ['BUY','SELL'].includes(h.leanSide)&&
      [h.probUp,h.probDown,h.confidence,h.edge].every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&
      h.probUp>=0&&h.probUp<=1&&h.probDown>=0&&h.probDown<=1&&
      Math.abs(h.probUp+h.probDown-1)<0.03&&
      h.confidence>=0&&h.confidence<=100&&typeof h.ready==='boolean';
    if(j.ok!==true||!validHorizon(j.oneMinute)||!validHorizon(j.fiveMinute)){
      return {ok:false,status:'INVALID',reason:'ML response failed schema/probability validation',shadow:true,latencyMs:Date.now()-started};
    }
    const out:MlPrediction={...j,latencyMs:Date.now()-started};
    cache={at:now,value:out};
    return out;
  }catch(e){
    return {ok:false,status:'UNAVAILABLE',reason:e instanceof Error?e.message:'ml unavailable',shadow:true,latencyMs:Date.now()-started};
  }finally{
    clearTimeout(timer);
  }
}
