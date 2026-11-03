export type NeuralPrediction={
  ok:boolean;version?:string;status?:string;ready?:boolean;
  side?:'BUY'|'SELL'|'WAIT';leanSide?:'BUY'|'SELL';
  probUp?:number;probDown?:number;probNoise?:number;
  confidence?:number;edge?:number;samples?:number;metrics?:any;
  snapshotAgeMs?:number;reason?:string;latencyMs?:number;pricePath?:{status?:string;ready?:boolean;side?:'BUY'|'SELL';currentPrice?:number;expectedPrice?:number;firstTarget?:number;rangeHigh?:number;rangeLow?:number;expectedMoveBps?:number;upExcursionBps?:number;downExcursionBps?:number;firstHitSeconds?:number;horizonSeconds?:number;metrics?:any};
};

let cache:{at:number;value:NeuralPrediction}|null=null;

// The external service is not trusted to declare itself trade-ready.
// A malformed, contradictory, or stale prediction remains shadow-only.
export function validateNeuralPrediction(payload:unknown):NeuralPrediction{
  const reject=(reason:string):NeuralPrediction=>({
    ok:false,status:'INVALID',ready:false,side:'WAIT',reason
  });
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    return reject('Neural response is not an object');
  const data=payload as NeuralPrediction;
  if(data.ok!==true)return {
    ok:false,status:String(data.status||'UNAVAILABLE'),ready:false,side:'WAIT',
    reason:String(data.reason||'Neural service not ready')
  };
  if(typeof data.ready!=='boolean')return reject('Neural readiness is not boolean');
  if(!data.ready)return {...data,ready:false,side:'WAIT'};
  const probability=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
  if(data.side!=='BUY'&&data.side!=='SELL')
    return reject('Neural direction missing or invalid');
  if(!probability(data.probUp)||!probability(data.probDown)||
     (data.probNoise!==undefined&&!probability(data.probNoise)))
    return reject('Neural probabilities out of range');
  const directionalSum=data.probUp!+data.probDown!;
  const totalWithNoise=directionalSum+(data.probNoise??0);
  if(Math.abs(directionalSum-1)>.05&&Math.abs(totalWithNoise-1)>.05)
    return reject('Neural probabilities do not sum to one');
  if(typeof data.confidence!=='number'||!Number.isFinite(data.confidence)||
     data.confidence<0||data.confidence>100)
    return reject('Neural confidence invalid');
  if(data.edge!==undefined&&(!Number.isFinite(data.edge)||typeof data.edge!=='number'))
    return reject('Neural edge invalid');
  if(data.samples!==undefined&&(!Number.isInteger(data.samples)||data.samples<0))
    return reject('Neural sample count invalid');
  if(data.snapshotAgeMs!==undefined&&(!Number.isFinite(data.snapshotAgeMs)||
     data.snapshotAgeMs<0||data.snapshotAgeMs>300000))
    return reject('Neural prediction snapshot is stale');
  if(data.pricePath?.ready){
    const path=data.pricePath;
    if(!Number.isFinite(path.currentPrice)||!(path.currentPrice!>0)||
       !Number.isFinite(path.expectedPrice)||!(path.expectedPrice!>0)||
       !Number.isFinite(path.horizonSeconds)||!(path.horizonSeconds!>0))
      return reject('Neural price path invalid');
  }
  return {...data,ready:true};
}

export async function getNeuralPrediction(now=Date.now()):Promise<NeuralPrediction>{
  // An unqualified model must be fully detachable without deleting its model files.
  // Apply this BEFORE the cache so disabling cannot replay a previous prediction.
  if(process.env.NEURAL_ENABLED==='0')
    return {ok:false,status:'DISABLED',ready:false,side:'WAIT',reason:'Neural suspended by operator'};
  if(cache&&now-cache.at<2500)return cache.value;
  const url=String(process.env.NEURAL_ENGINE_URL||'').trim();
  if(!url)return {ok:false,status:'DISABLED',ready:false,side:'WAIT',reason:'NEURAL_ENGINE_URL missing'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2200);
  const started=Date.now();
  try{
    const r=await fetch(url.replace(/\/$/,'')+'/predict',{
      cache:'no-store',signal:controller.signal,
      headers:{'User-Agent':'AhmedGoldCommand-Neural/1.0'}
    });
    const j=await r.json().catch(()=>null);
    if(!r.ok||!j||typeof j!=='object'){
      return {ok:false,status:'ERROR',ready:false,side:'WAIT',reason:'Neural HTTP '+r.status,latencyMs:Date.now()-started};
    }
    const out=validateNeuralPrediction(j);
    out.latencyMs=Date.now()-started;
    cache={at:now,value:out};
    return out;
  }catch(e){
    return {ok:false,status:'UNAVAILABLE',ready:false,side:'WAIT',reason:e instanceof Error?e.message:'neural unavailable',latencyMs:Date.now()-started};
  }finally{
    clearTimeout(timer);
  }
}
