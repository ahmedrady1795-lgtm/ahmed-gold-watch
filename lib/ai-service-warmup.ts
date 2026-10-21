/** Cold starts are slow; health recovery never runs inside market inference. */
let running:Promise<void>|null=null;
export function warmAiServices():Promise<void>{
 if(running)return running;
 const urls=[process.env.ML_ENGINE_URL,
  process.env.NEURAL_ENABLED==='0'?null:process.env.NEURAL_ENGINE_URL]
  .filter((v):v is string=>Boolean(v?.trim()));
 running=Promise.allSettled(urls.map(async base=>{
  const url=new URL(base.trim());
  if(!['http:','https:'].includes(url.protocol))return;
  url.pathname=url.pathname.replace(/\/$/,'')+'/health';
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000),
   headers:{'User-Agent':'Qannas-AI-Health-Recovery/1.0'}});
  await r.arrayBuffer();
  // No health result can certify a model or override its OOS quality gates.
  if(!r.ok)console.warn('[AI-HEALTH] HTTP',r.status,url.hostname);
 })).then(()=>{}).finally(()=>{running=null;});
 return running;
}
