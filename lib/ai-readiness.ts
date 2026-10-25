export type ModelReadiness={configured:boolean;serviceOk:boolean;ready:boolean;status:string;reason:string;version?:string};

export function summarizeAiReadiness(ml:any,neural:any,mlConfigured=true,neuralConfigured=true){
  const horizon=(key:'oneMinute'|'fiveMinute'):ModelReadiness=>{
    const name=key==='oneMinute'?'ML M1':'ML M5';
    const ready=Boolean(mlConfigured&&ml?.ok&&ml?.[key]?.ready);
    return {configured:mlConfigured,serviceOk:Boolean(ml?.ok),ready,status:ready?'READY':!mlConfigured?'DISABLED':String(ml?.status||'UNAVAILABLE'),
      reason:ready?'':!mlConfigured?`${name}: service not configured`:ml?.[key]?.reason||ml?.reason||`${name}: independent validation not qualified`,version:ml?.version};
  };
  const neuralReady=Boolean(neuralConfigured&&neural?.ok&&neural?.ready);
  const models={mlM1:horizon('oneMinute'),mlM5:horizon('fiveMinute'),neural:{
    configured:neuralConfigured,serviceOk:Boolean(neural?.ok),ready:neuralReady,
    status:neuralReady?'READY':!neuralConfigured?'DISABLED':String(neural?.status||'UNAVAILABLE'),
    reason:neuralReady?'':!neuralConfigured?'Neural: service not configured':neural?.reason||'Neural: independent validation not qualified',version:neural?.version
  } satisfies ModelReadiness};
  const reasons=Object.values(models).filter(m=>!m.ready).map(m=>m.reason);
  const configuredCount=Object.values(models).filter(m=>m.configured).length;
  const readyCount=Object.values(models).filter(m=>m.ready).length;
  const activeFailures=Object.values(models).filter(m=>m.configured&&!m.ready).map(m=>m.reason);
  return {ready:reasons.length===0,status:reasons.length?'degraded':'healthy',models,reasons,
    mode:configuredCount===0?'TECHNICAL_ONLY':readyCount===3?'FULL':'PARTIAL',
    configuredCount,readyCount,activeFailures,
    nextAction:configuredCount===0?'التحليل المحلي يعمل؛ خدمات ML وNeural المنفصلة غير مربوطة بهذه النسخة.':
      readyCount<configuredCount?'راجع اتصال النماذج وتقييمها المستقل قبل اعتماد إشاراتها.':
      readyCount<3?'بعض النماذج اختيارية وغير مربوطة.':'النماذج مؤهلة؛ تنفيذ الصفقة يظل مشروطًا بجودة السعر والتكلفة والتأكيد.'};
}

const HEALTH_CACHE_MS=60_000;
const healthCache=new Map<string,{at:number;value:any}>();
const healthInflight=new Map<string,Promise<any>>();

async function healthProbe(url:string|undefined){
  if(!url)return {ok:false,status:'DISABLED',reason:'service not configured'};
  const key=url.replace(/\/$/,'');
  const cached=healthCache.get(key);
  if(cached&&Date.now()-cached.at<HEALTH_CACHE_MS)return cached.value;
  const pending=healthInflight.get(key);
  if(pending)return pending;
  const task=(async()=>{
  try{
    const r=await fetch(url.replace(/\/$/,'')+'/health',{cache:'no-store',signal:AbortSignal.timeout(2200)});
    if(!r.ok)return {ok:false,status:'ERROR',reason:`service HTTP ${r.status}`};
    return await r.json();
  }catch(e){return {ok:false,status:'UNAVAILABLE',reason:e instanceof Error?e.message:'service unavailable'};}
  })();
  healthInflight.set(key,task);
  try{const value=await task;healthCache.set(key,{at:Date.now(),value});return value;}
  finally{healthInflight.delete(key);}
}

export async function getAiReadiness(){
  const neuralEnabled=process.env.NEURAL_ENABLED!=='0';
  const [ml,neural]=await Promise.all([healthProbe(process.env.ML_ENGINE_URL),
    neuralEnabled?healthProbe(process.env.NEURAL_ENGINE_URL):Promise.resolve({ok:false,status:'DISABLED',reason:'Neural suspended by operator'})]);
  return summarizeAiReadiness({...ml,
    oneMinute:{ready:Boolean(ml?.readiness?.m1)},fiveMinute:{ready:Boolean(ml?.readiness?.m5)}
  },{...neural,ready:Boolean(neural?.prediction?.ready),status:neural?.prediction?.status,reason:neural?.prediction?.reason},
    Boolean(process.env.ML_ENGINE_URL),neuralEnabled&&Boolean(process.env.NEURAL_ENGINE_URL));
}
