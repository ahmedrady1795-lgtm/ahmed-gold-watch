import {aiRetryAt,recordAiResponse} from './ai-service-backoff';
import {certifyNeuralResponse} from './ai-model-certification';

export type NeuralPrediction={
  ok:boolean;version?:string;status?:string;ready?:boolean;
  side?:'BUY'|'SELL'|'WAIT';leanSide?:'BUY'|'SELL';
  probUp?:number;probDown?:number;probNoise?:number;
  confidence?:number;edge?:number;samples?:number;metrics?:any;
  snapshotAgeMs?:number;reason?:string;latencyMs?:number;pricePath?:{status?:string;ready?:boolean;side?:'BUY'|'SELL';currentPrice?:number;expectedPrice?:number;firstTarget?:number;rangeHigh?:number;rangeLow?:number;expectedMoveBps?:number;upExcursionBps?:number;downExcursionBps?:number;firstHitSeconds?:number;horizonSeconds?:number;metrics?:any};
};

let cache:{at:number;value:NeuralPrediction}|null=null;
let inflight:Promise<NeuralPrediction>|null=null;

async function runNeuralPrediction(now=Date.now()):Promise<NeuralPrediction>{
  // An unqualified model must be fully detachable without deleting its model files.
  // Apply this BEFORE the cache so disabling cannot replay a previous prediction.
  if(process.env.NEURAL_ENABLED==='0')
    return {ok:false,status:'DISABLED',ready:false,side:'WAIT',reason:'Neural suspended by operator'};
  if(cache&&now-cache.at<10000)return cache.value;
  const url=String(process.env.NEURAL_ENGINE_URL||'').trim();
  if(!url)return {ok:false,status:'DISABLED',ready:false,side:'WAIT',reason:'NEURAL_ENGINE_URL missing'};
  if(Date.now()<aiRetryAt(url))return {ok:false,status:'RATE_LIMITED',ready:false,side:'WAIT',reason:'Neural cooldown after HTTP 429'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  const started=Date.now();
  try{
    const r=await fetch(url.replace(/\/$/,'')+'/predict',{
      cache:'no-store',signal:controller.signal,
      headers:{'User-Agent':'AhmedGoldCommand-Neural/1.0'}
    });
    recordAiResponse(url,r.status,r.headers.get('retry-after'));
    const j=await r.json().catch(()=>null);
    if(r.status===429){
      return {ok:false,status:'RATE_LIMITED',ready:false,side:'WAIT',reason:'Neural HTTP 429; retry delayed',latencyMs:Date.now()-started};
    }
    if(!r.ok||!j||typeof j!=='object'){
      return {ok:false,status:'ERROR',ready:false,side:'WAIT',reason:'Neural HTTP '+r.status,latencyMs:Date.now()-started};
    }
    const out:NeuralPrediction={...certifyNeuralResponse(j),latencyMs:Date.now()-started};
    cache={at:now,value:out};
    return out;
  }catch(e){
    return {ok:false,status:'UNAVAILABLE',ready:false,side:'WAIT',reason:e instanceof Error?e.message:'neural unavailable',latencyMs:Date.now()-started};
  }finally{
    clearTimeout(timer);
  }
}


// Collapse concurrent requests; one live inference serves all callers.
export function getNeuralPrediction(now=Date.now()):Promise<NeuralPrediction>{
  if(process.env.NEURAL_ENABLED==='0')return runNeuralPrediction(now);
  if(inflight)return inflight;
  const task=runNeuralPrediction(now);
  inflight=task;
  void task.finally(()=>{if(inflight===task)inflight=null;});
  return task;
}
