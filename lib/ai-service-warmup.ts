import {aiRetryAt} from './ai-service-backoff';
import {healthProbe} from './ai-readiness';
/** Cold-start health recovery outside inference. Never hammer a throttled
 * Render service: one attempt per 2 minutes, at least 5 minutes after 429.
 * Health checks do not certify model quality or produce trading signals. */
let running:Promise<void>|null=null;
let nextAllowedAt=0;
export function warmAiServices():Promise<void>{
 if(running)return running;
 if(Date.now()<nextAllowedAt)return Promise.resolve();
 const urls=[process.env.ML_ENGINE_URL,
  process.env.NEURAL_ENABLED==='0'?null:process.env.NEURAL_ENGINE_URL]
  .filter((v):v is string=>Boolean(v?.trim()));
 if(!urls.length)return Promise.resolve();
 nextAllowedAt=Date.now()+120000;
 running=Promise.allSettled(urls.map(async base=>{
  if(Date.now()<aiRetryAt(base.trim()))return;
  const url=new URL(base.trim());
  if(!['http:','https:'].includes(url.protocol))return;
  url.pathname=url.pathname.replace(/\/$/,'')+'/health';
  const status=await healthProbe(base.trim(),45000);
  if(status?.status==='RATE_LIMITED'){
    nextAllowedAt=Math.max(nextAllowedAt,Date.now()+300000);
  }
  if(status?.ok===true){
    const role=base===process.env.ML_ENGINE_URL?'ML':'NEURAL';
    const qualified=role==='ML'?
      Boolean(status.readiness?.m1||status.readiness?.m5):
      Boolean(status.prediction?.ready);
    console.info('[AI-HEALTH-RECOVERY]',JSON.stringify({
      role,transport:'HTTP_200',modelQualified:qualified,
      status:String(status.status||status.prediction?.status||'UNKNOWN').slice(0,50),
      snapshots:role==='NEURAL'?Number(status.storedSnapshots||0):null,
      note:'HTTP health is not statistical certification'
    }));
  }
  if(!status?.ok)console.warn('[AI-HEALTH]',String(status?.status||'UNAVAILABLE'),url.hostname);
 })).then(()=>{}).finally(()=>{running=null;});
 return running;
}
