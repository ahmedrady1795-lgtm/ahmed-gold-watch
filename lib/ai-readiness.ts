export type ModelReadiness={configured:boolean;serviceOk:boolean;ready:boolean;status:string;reason:string;version?:string};

export function summarizeAiReadiness(ml:any,neural:any,mlConfigured=true,neuralConfigured=true){
  const horizon=(key:'oneMinute'|'fiveMinute'):ModelReadiness=>{
    const name=key==='oneMinute'?'ML M1':'ML M5';
    const ready=Boolean(mlConfigured&&ml?.ok&&ml?.[key]?.ready);
    return {configured:mlConfigured,serviceOk:Boolean(ml?.ok),ready,status:ready?'READY':!mlConfigured?'DISABLED':String(ml?.status||'UNAVAILABLE'),
      reason:ready?'':!mlConfigured?`${name}: service not configured`:ml?.reason||`${name}: independent validation not qualified`,version:ml?.version};
  };
  const neuralReady=Boolean(neuralConfigured&&neural?.ok&&neural?.ready);
  const models={mlM1:horizon('oneMinute'),mlM5:horizon('fiveMinute'),neural:{
    configured:neuralConfigured,serviceOk:Boolean(neural?.ok),ready:neuralReady,
    status:neuralReady?'READY':!neuralConfigured?'DISABLED':String(neural?.status||'UNAVAILABLE'),
    reason:neuralReady?'':!neuralConfigured?'Neural: service not configured':neural?.reason||'Neural: independent validation not qualified',version:neural?.version
  } satisfies ModelReadiness};
  const reasons=Object.values(models).filter(m=>!m.ready).map(m=>m.reason);
  return {ready:reasons.length===0,status:reasons.length?'degraded':'healthy',models,reasons};
}

async function healthProbe(url:string|undefined){
  if(!url)return {ok:false,status:'DISABLED',reason:'service not configured'};
  try{
    const r=await fetch(url.replace(/\/$/,'')+'/health',{cache:'no-store',signal:AbortSignal.timeout(2200)});
    if(!r.ok)return {ok:false,status:'ERROR',reason:`service HTTP ${r.status}`};
    return await r.json();
  }catch(e){return {ok:false,status:'UNAVAILABLE',reason:e instanceof Error?e.message:'service unavailable'};}
}

export async function getAiReadiness(){
  const [ml,neural]=await Promise.all([healthProbe(process.env.ML_ENGINE_URL),healthProbe(process.env.NEURAL_ENGINE_URL)]);
  return summarizeAiReadiness({...ml,
    oneMinute:{ready:Boolean(ml?.readiness?.m1)},fiveMinute:{ready:Boolean(ml?.readiness?.m5)}
  },{...neural,ready:Boolean(neural?.prediction?.ready),status:neural?.prediction?.status,reason:neural?.prediction?.reason},
    Boolean(process.env.ML_ENGINE_URL),Boolean(process.env.NEURAL_ENGINE_URL));
}
