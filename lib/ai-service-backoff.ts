/** Shared per-origin throttle budget for inference, readiness and warmup.
 * Transport recovery never changes a model's qualification. State is shared
 * across module copies in one server process (not across Render instances). */
type Budget={until:number;failures:number};
const shared=globalThis as typeof globalThis & {__qannasAiBackoff?:Map<string,Budget>};
const budgets=shared.__qannasAiBackoff ||= new Map<string,Budget>();
const key=(url:string)=>{try{return new URL(url).origin;}catch{return url.trim();}};
export function aiRetryAt(url:string):number{return budgets.get(key(url))?.until||0;}
export function recordAiResponse(url:string,status:number,retryAfter:string|null,now=Date.now()){
 const id=key(url),old=budgets.get(id);
 if(status===429){
  const failures=(old?.failures||0)+1,raw=(retryAfter||'').trim();
  const seconds=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
  const specified=Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-now;
  // Never shorten a provider's Retry-After, including HTTP-date headers.
  const fallback=Math.min(900000,60000*2**Math.min(failures-1,4));
  const wait=Math.max(fallback,Number.isFinite(specified)?specified:0);
  budgets.set(id,{until:Math.max(old?.until||0,now+wait),failures});
 }else if(status>=200&&status<300&&(!old||now>=old.until))budgets.delete(id);
}
