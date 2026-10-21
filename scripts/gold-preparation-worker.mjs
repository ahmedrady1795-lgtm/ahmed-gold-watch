import fs from 'node:fs/promises';
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
let chart=null,chartAt=0;
async function atomic(file,obj){
 const tmp=file+'.writing-'+process.pid;
 await fs.writeFile(tmp,JSON.stringify(obj),{mode:0o600});await fs.rename(tmp,file);
}
async function init(){
 for(const file of paths)try{
  ledger=safeGoldLeadLedger(JSON.parse(await fs.readFile(file,'utf8')),Date.now());
  path=file;return;
 }catch{}
 try{
  const r=await fetch(checkpoint+'?restore='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(6500)});
  if(r.ok){const text=await r.text();if(text.length<6e6)
   ledger=mergeGoldLeadLedger(ledger,JSON.parse(text),Date.now());}
 }catch{}
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
  const refresh=!chart||Date.now()-chartAt>=30000;
  if(refresh)try{chart=await json('/api/chart-history?asset=GOLD&preparation='+Date.now());
   chartAt=Date.now();}catch{}
  // Request the quote AFTER history, so a slow history warm-up cannot age
  // the quote beyond the ten-second source freshness gate before issuance.
  const quote=await json('/api/quote').catch(()=>null);
  const now=Date.now();
  const g=chart?.gold,source=String(g?.candleSource||'');
  const m1=Array.isArray(g?.chartCandles)?g.chartCandles.filter(b=>b?.time+60000<=now-3000):[];
  let next=ledger;
  if(trustedSpotGoldSource(source))next=settleGoldLead(next,now,source,m1);
  else if(next.events.some(e=>e.status==='ARMED'||e.status==='BREAKOUT')){
   const prior=next.events.at(-1);next=settleGoldLead(next,now,prior.source,[]);
  }
  const q=quote,session=goldMarketSession(now).open;
  const feedFresh=g?.fresh===true&&now-chartAt<45000;
  const reading=session&&!feedFresh?{ready:false,plan:null,
   reason:'سياق شموع الذهب غير متاح أو قديم؛ لا إنذار جديد'}:
   readGoldPreparation({now,source,bars:m1,quote:q,marketOpen:session});
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
const timer=setInterval(()=>{void observe();},15000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 if(finished)return;finished=true;clearInterval(timer);
 const close=setInterval(()=>{if(!busy){clearInterval(close);process.exit(0);}},100);
 setTimeout(()=>process.exit(0),13000).unref();
});
