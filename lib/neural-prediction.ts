export type NeuralPrediction={
  ok:boolean;version?:string;status?:string;ready?:boolean;
  side?:'BUY'|'SELL'|'WAIT';leanSide?:'BUY'|'SELL';
  probUp?:number;probDown?:number;probNoise?:number;
  confidence?:number;edge?:number;samples?:number;metrics?:any;
  snapshotAgeMs?:number;reason?:string;latencyMs?:number;
};

let cache:{at:number;value:NeuralPrediction}|null=null;

export async function getNeuralPrediction(now=Date.now()):Promise<NeuralPrediction>{
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
    const out:NeuralPrediction={...j,latencyMs:Date.now()-started};
    cache={at:now,value:out};
    return out;
  }catch(e){
    return {ok:false,status:'UNAVAILABLE',ready:false,side:'WAIT',reason:e instanceof Error?e.message:'neural unavailable',latencyMs:Date.now()-started};
  }finally{
    clearTimeout(timer);
  }
}
