import fs from 'node:fs/promises';
import {readGoldLiquidityRadar,trustedSpotGoldSource}
 from '../lib/gold-liquidity-radar.ts';
import {goldMarketSession} from '../lib/gold-market-session.ts';
import {emptyGoldLedger,safeGoldRadarLedger,mergeGoldRadarLedger,
 appendGoldRadarEvent,settleGoldRadar,goldRadarScore}
 from '../lib/gold-radar-shadow.ts';

const storage=['/data/qannas-gold-radar-v1.json','/tmp/qannas-gold-radar-v1.json'];
const STATUS='/tmp/gold-radar-observation.json';
const checkpoint='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/gold-radar-shadow.json';
const intervalMs=62000;
let path=storage[1],ledger=emptyGoldLedger(),busy=false,lastClosed=0,finished=false;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function atomic(filepath,obj){
 const tmp=filepath+'.writing-'+process.pid;
 await fs.writeFile(tmp,JSON.stringify(obj),{mode:0o600});
 await fs.rename(tmp,filepath);
}
async function init(){
 for(const loc of storage)try{
  const src=await fs.readFile(loc,'utf8');
  ledger=safeGoldRadarLedger(JSON.parse(src),Date.now());path=loc;
  console.info('[GOLD-RADAR] restored local events',ledger.events.length);return;
 }catch{}
 try{
  const response=await fetch(checkpoint+'?t='+Date.now(),{
    signal:AbortSignal.timeout(6500),cache:'no-store'});
  if(response.ok){
   const text=await response.text();
   if(text.length<6e6)ledger=mergeGoldRadarLedger(
     ledger,JSON.parse(text),Date.now());
   console.info('[GOLD-RADAR] restored checkpoint events',ledger.events.length);
  }
 }catch{console.info('[GOLD-RADAR] no checkpoint yet');}
 try{await fs.access('/data');await fs.writeFile('/data/.gold-probe','1');
   await fs.unlink('/data/.gold-probe');path=storage[0];}catch{}
 await atomic(path,ledger);
}
function baseline(history){
 const bars=history.slice(-7);
 if(bars.length<7)return 'WAIT';
 const move=bars.at(-1).close-bars[0].close;
 const spans=bars.map(b=>b.high-b.low).sort((a,b)=>a-b);
 const threshold=spans[Math.floor(spans.length/2)]*.42;
 return move>threshold?'BUY':move< -threshold?'SELL':'WAIT';
}
function bars(raw,period,now){
 if(!Array.isArray(raw))return [];
 return raw.filter(b=>b&&Number.isFinite(b.time)&&b.time%period===0&&
   b.time+period<=now-3000&&b.low>0&&
   [b.open,b.high,b.low,b.close].every(Number.isFinite)&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
   .sort((a,b)=>a.time-b.time);
}
async function observe(){
 if(busy||finished)return;busy=true;
 const now=Date.now();
 try{
  const url='http://127.0.0.1:'+(process.env.PORT||'10000')+
   '/api/chart-history?gold_radar='+now;
  const response=await fetch(url,{cache:'no-store',
   signal:AbortSignal.timeout(19000)});
  if(!response.ok)throw Error('CHART_HTTP_'+response.status);
  const data=await response.json();
  const g=data?.gold,source=String(g?.candleSource||'');
  const m1=bars(g?.chartCandles,60000,now),m15=bars(g?.chartHigherFrames?.m15,900000,now);
  const latest=m1.at(-1);
  const sourceReady=trustedSpotGoldSource(source)&&g?.fresh===true&&
    latest&&now-(latest.time+60000)<=90000;
  const session=goldMarketSession(now).open;
  const reading=readGoldLiquidityRadar({now,source,
    bars:sourceReady?m1:[],marketOpen:session});
  const lastStatus={checkedAt:now,source,ready:reading.ready,
   phase:reading.phase,side:reading.side,label:reading.label,
   reason:reading.reason,method:reading.method,
   eventAt:reading.eventAt,price:reading.price,confirm:reading.confirm,
   invalidate:reading.invalidate,evidence:reading.evidence,
   noExchangeL2:true,volumeIsNotOrderFlow:true};
  await atomic(STATUS,lastStatus);
  if(!sourceReady||!session)return;
  // The score is settled ONLY from identical source and actual completed bars.
  const next=settleGoldRadar({ledger,now,source,m1,m15});
  if(next.updated){ledger=next.ledger;await atomic(path,ledger);
    console.info('[GOLD-RADAR] outcomes resolved',next.updated,
     'M1',goldRadarScore(ledger).m1.scored,'M15',goldRadarScore(ledger).m15.scored);}
  if(!reading.ready||reading.phase!=='CONFIRMED'||reading.side==='WAIT'||
    reading.eventAt===null||reading.eventAt===lastClosed)return;
  lastClosed=reading.eventAt;
  const seen=appendGoldRadarEvent({ledger,now,
   closedAt:reading.eventAt,source,side:reading.side,
   price:reading.price,reason:reading.reason,
   confirm:reading.confirm,invalidate:reading.invalidate,
   baseline:baseline(m1)});
  if(seen.added){
   ledger=seen.ledger;await atomic(path,ledger);
   console.info('[GOLD-RADAR] closed-M1 paper signal',source,
    reading.side,new Date(now).toISOString(),'n',ledger.events.length);
  }
 }catch(error){
  console.warn('[GOLD-RADAR] source unavailable',
   String(error?.message||error).slice(0,120));
  await atomic(STATUS,{checkedAt:now,ready:false,phase:'UNAVAILABLE',
   side:'WAIT',label:'الذهب: بيانات غير متاحة',
   reason:'لم يصل تاريخ XAUUSD مغلق موثوق؛ لا ننشئ إشارة',
   noExchangeL2:true}).catch(()=>{});
 }finally{busy=false;}
}
await init();
console.info('[GOLD-RADAR] server-only spot M1 observation started',path);
await sleep(12000);void observe();
const timer=setInterval(()=>{void observe();},intervalMs);
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{
 if(finished)return;finished=true;clearInterval(timer);
 void atomic(path,ledger).finally(()=>process.exit(0));
});
