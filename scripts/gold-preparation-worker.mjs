import {combineGoldLiquidity} from '../lib/gold-liquidity-meter.ts';
import {mergeOpeningAudit} from '../lib/gold-opening-audit.ts';
import fs from 'node:fs/promises';
import {nextGoldOpeningCall,validOpeningCall} from '../lib/gold-opening-call.ts';
import {sidecarWorkAllowed} from '../lib/render-free-viewer-lease.ts';
import {goldMarketSession} from '../lib/gold-market-session.ts';
import {trustedSpotGoldSource} from '../lib/gold-liquidity-radar.ts';
import {emptyGoldLeadLedger,safeGoldLeadLedger,mergeGoldLeadLedger,
 readGoldPreparation,appendGoldLead,settleGoldLead,goldLeadScore}
 from '../lib/gold-preparation-lead.ts';

const paths=['/data/qannas-gold-preparation-v1.json','/tmp/qannas-gold-preparation-v1.json'];
const statusPath='/tmp/gold-preparation-observation.json';
const checkpoint='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/gold-preparation-lead.json';
const base='http://127.0.0.1:'+(process.env.PORT||'10000');
let path=paths[1],ledger=emptyGoldLeadLedger(),busy=false,finished=false;
const openingPath='/tmp/qannas-gold-m5-opening.json';
let openingCall=null;
try{
 const saved=JSON.parse(await fs.readFile(openingPath,'utf8'));
 if(validOpeningCall(saved,Date.now()))openingCall=saved;
}catch{}
// Forward-only M5 opening evaluation. Keep unproven and flat outcomes
// separate from directional hits; a hit is NOT a profitable trade.
const openingAuditPath='/tmp/qannas-gold-m5-opening-audit.json';
let openingAudit=[];
try{
 const saved=JSON.parse(await fs.readFile(openingAuditPath,'utf8'));
 openingAudit=mergeOpeningAudit(Date.now(),saved);
}catch{}
if(openingCall&&!openingAudit.some(e=>e.call.target===openingCall.target))
 openingAudit.push({call:openingCall,outcome:'PENDING'});
let chart=null,chartAt=0,chartAttempt=0,chartRefresh=null,previousQuotes=[];
let flowRefresh=null,flowAttempt=0,perpFlow=null,tokenFlow=null;
async function atomic(file,obj){
 const tmp=file+'.writing-'+process.pid;
 await fs.writeFile(tmp,JSON.stringify(obj),{mode:0o600});await fs.rename(tmp,file);
}
async function auditOpening(now,source,bars,opening){
 const next=openingAudit.map(e=>{
  if(e.outcome!=='PENDING'||now<e.call.target+303000)return e;
  const c=e.call;
  const map=new Map(bars.filter(b=>[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
    b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)).map(b=>[b.time,b]));
  const rows=Array.from({length:5},(_,i)=>map.get(c.target+i*60000));
  if(source!==c.source||rows.some(b=>!b)){
   return now>=c.target+900000?{...e,outcome:'UNKNOWN',settledAt:now}:e;
  }
  const open=rows[0].open,close=rows[4].close,move=close-open;
  const outcome=move===0?'FLAT':(c.side==='BUY'?move>0:move<0)?'HIT':'MISS';
  return {...e,outcome,open,close,settledAt:now};
 });
 if(opening&&!next.some(e=>e.call.target===opening.target)){
   next.push({call:opening,outcome:'PENDING'});
   console.info('[GOLD-M5-OPEN] ISSUED',JSON.stringify(opening));
 }
 if(JSON.stringify(next)!==JSON.stringify(openingAudit)){
   for(const e of next){
     const old=openingAudit.find(x=>x.call.target===e.call.target);
     if(old?.outcome==='PENDING'&&e.outcome!=='PENDING')
       console.info('[GOLD-M5-OPEN] SETTLED',JSON.stringify(e));
   }
   await atomic(openingAuditPath,next.slice(-576));
   openingAudit=next.slice(-576);
 }
}
async function init(){
 // Restore the packaged checkpoint even when GitHub is unavailable, then
 // merge newer evidence without reissuing any restored forecast.
 let packaged=null,remote=null;
 try{packaged=JSON.parse(await fs.readFile('archive/gold-preparation-lead.json','utf8'));}catch{}
 try{
   const r=await fetch(checkpoint+'?restore='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(6500)});
   if(r.ok){const text=await r.text();if(text.length<6e6)remote=JSON.parse(text);}
 }catch{}
 openingAudit=mergeOpeningAudit(Date.now(),packaged?.openingAudit,remote?.openingAudit,openingAudit);
 await atomic(openingAuditPath,openingAudit);
 for(const file of paths)try{
  ledger=safeGoldLeadLedger(JSON.parse(await fs.readFile(file,'utf8')),Date.now());
  path=file;return;
 }catch{}
 if(packaged)ledger=mergeGoldLeadLedger(ledger,packaged,Date.now());
 if(remote)ledger=mergeGoldLeadLedger(ledger,remote,Date.now());
 try{await fs.writeFile('/data/.gold-lead-probe','1');
  await fs.unlink('/data/.gold-lead-probe');path=paths[0];}catch{}
 await atomic(path,ledger);
}
async function json(url){
 const r=await fetch(base+url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('HTTP_'+r.status);return r.json();
}
async function observe(){
 if(busy||finished)return;busy=true;
 try{
  // Keep the heavy AI viewer budget unchanged. This small read-only worker
  // also runs a bounded pre-open window with no viewer, while the host is up.
  // Prewarm one minute ahead; allow settlement shortly after a boundary.
  const started=Date.now(),elapsed=started%300000;
  const due=openingAudit.some(e=>e.outcome==='PENDING'&&started>=e.call.target+303000);
  const openingWork=goldMarketSession(started).open&&elapsed>=240000;
  const settlementWork=due&&elapsed<45000;
  if(!(await sidecarWorkAllowed(started))&&!openingWork&&!settlementWork){
   previousQuotes=[];
   return;
  }
  // Sample the shared proxy endpoints only near the opening. Never delay a
  // price decision on a slow exchange; source timestamps enforce freshness.
  if(openingWork&&started-flowAttempt>=10000&&!flowRefresh){
    flowAttempt=started;
    flowRefresh=Promise.allSettled([
      json('/api/gold-perp-flow'),json('/api/paxg-flow')
    ]).then(([p,t])=>{
      if(p.status==='fulfilled')perpFlow=p.value;
      if(t.status==='fulfilled')tokenFlow=t.value;
    }).finally(()=>{flowRefresh=null;});
  }
  const refresh=Date.now()-chartAttempt>=15000&&(!chart||Date.now()-chartAt>=30000);
  if(refresh&&!chartRefresh){
    chartAttempt=Date.now();
    chartRefresh=json('/api/chart-history?asset=GOLD&preparation='+chartAttempt)
      .then(value=>{chart=value;chartAt=Date.now();})
      .catch(()=>{}).finally(()=>{chartRefresh=null;});
  }
  // While refreshing history, sample against the same usable context that
  // selected the quote venue. Recheck its age after the quote arrives.
  if(!chart?.gold?.fresh||Date.now()-chartAt>=45000)await chartRefresh;
  const g=chart?.gold,source=String(g?.candleSource||''),contextFetchedAt=chartAt;
  const quote=await json(source==='Deriv · XAUUSD'?'/api/gold-tick?venue=deriv':'/api/quote').catch(()=>null);
  const now=Date.now();
  const m1=Array.isArray(g?.chartCandles)?g.chartCandles.filter(b=>b?.time+60000<=now-3000):[];
  let next=ledger;
  if(trustedSpotGoldSource(source))next=settleGoldLead(next,now,source,m1);
  else if(next.events.some(e=>e.status==='ARMED'||e.status==='BREAKOUT')){
   const prior=next.events.at(-1);next=settleGoldLead(next,now,prior.source,[]);
  }
  const q=quote,session=goldMarketSession(now).open;
  const feedFresh=g?.fresh===true&&now-contextFetchedAt<45000;
  const flow=combineGoldLiquidity(perpFlow,tokenFlow,now,session);
  const opening=feedFresh?nextGoldOpeningCall(openingCall,now,g,q,previousQuotes,flow):null;
  if(opening&&opening!==openingCall){
    await atomic(openingPath,opening);
    openingCall=opening;
  }
  // Do not use an unrelated or stale candle source to score the call.
  await auditOpening(now,feedFresh?source:'',feedFresh?m1:[],openingCall);
  const reading=session&&!feedFresh?{ready:false,plan:null,
   reason:'سياق شموع الذهب غير متاح أو قديم؛ لا إنذار جديد'}:
   readGoldPreparation({now,source,bars:m1,quote:q,previousQuotes,marketOpen:session});
  const previous=previousQuotes.at(-1);
  if(!q?.ok||!session||!feedFresh||q.source!==previous?.source||q.sourceTime<previous?.sourceTime)
   previousQuotes=[];
  if(q?.ok&&session&&feedFresh&&q.sourceTime!==previousQuotes.at(-1)?.sourceTime)
   previousQuotes=[...previousQuotes.slice(-1),q];
  if(reading.plan)next=appendGoldLead(next,reading.plan);
  if(next!==ledger){
   const added=next.events.length>ledger.events.length;
   ledger=next;await atomic(path,ledger);
   if(added){const e=ledger.events.at(-1);
    console.info('[GOLD-PREPARATION] frozen pre-break alert',e.side,e.setup,
     new Date(e.issuedAt).toISOString(),'trigger',e.trigger,'target',e.target,'stop',e.invalidate);}
  }
  await atomic(statusPath,{checkedAt:now,ready:reading.ready,reason:reading.reason,
   source,quoteSource:q?.source??null,quoteAt:q?.sourceTime??null,price:q?.price??null,
   contextAt:m1.at(-1)?.time+60000||null,method:'SPOT_PRICE_PREPARATION',
   events:goldLeadScore(ledger).events});
 }catch(e){
  console.warn('[GOLD-PREPARATION] unavailable',String(e?.message||e).slice(0,120));
  await atomic(statusPath,{checkedAt:Date.now(),ready:false,reason:'توقفت تغذية التحضير؛ لا إنذار جديد'}).catch(()=>{});
 }finally{busy=false;}
}
await init();
console.info('[GOLD-PREPARATION] forward-only observer started',path,'restored',ledger.events.length);
setTimeout(()=>{void observe();},14000);
const timer=setInterval(()=>{void observe();},5000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 if(finished)return;finished=true;clearInterval(timer);
 const close=setInterval(()=>{if(!busy){clearInterval(close);process.exit(0);}},100);
 setTimeout(()=>process.exit(0),13000).unref();
});
