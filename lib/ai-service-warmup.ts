import {aiRetryAt,recordAiResponse} from './ai-service-backoff';
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
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000),
   headers:{'User-Agent':'Qannas-AI-Health-Recovery/1.0'}});
  recordAiResponse(base.trim(),r.status,r.headers.get('retry-after'));
  if(r.status===429){
    // Prediction and health clients share the same service budget.
    nextAllowedAt=Math.max(nextAllowedAt,Date.now()+300000);
  }
  await r.arrayBuffer();
  if(!r.ok)console.warn('[AI-HEALTH] HTTP',r.status,url.hostname);
 })).then(()=>{}).finally(()=>{running=null;});
 return running;
}
