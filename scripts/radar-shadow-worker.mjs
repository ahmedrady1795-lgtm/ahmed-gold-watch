import fs from 'node:fs/promises';
import {OrderFlowRadar} from '../lib/order-flow-radar.ts';
import {newLedger,sanitizeShadowLedger,recordRadarSignal,
 settleRadarOutcomes,baselineAt,validShadowBars,radarShadowScore}
 from '../lib/radar-shadow-score.ts';

const CHANNEL='wss://ws-feed.exchange.coinbase.com';
const CHECKPOINT='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/radar-shadow.json';
const candidates=['/data/qannas-radar-shadow-v1.json','/tmp/qannas-radar-shadow-v1.json'];
let target=candidates[1],ledger=newLedger(),engine=new OrderFlowRadar(),ws=null;
let reconnect=null,connected=false,finishing=false,inFlight=false;
let m1=[],m15=[],lastHistoryPoll=0,lastRecordedSince=0,lastSave=0;
async function store(){
 const raw=JSON.stringify(ledger);
 const temp=target+'.writing-'+process.pid;
 await fs.writeFile(temp,raw,{mode:0o600});
 await fs.rename(temp,target);
 lastSave=Date.now();
}
async function init(){
 for(const file of candidates){
  try{
   await fs.access(file);const raw=await fs.readFile(file,'utf8');
   ledger=sanitizeShadowLedger(JSON.parse(raw),Date.now());
   target=file;console.info('[RADAR-SHADOW] restored local',ledger.events.length,file);
   return;
  }catch(e){if(e?.code!=='ENOENT')console.warn('[RADAR-SHADOW] local unreadable',file);}
 }
 try{
  const r=await fetch(CHECKPOINT+'?t='+Date.now(),{
   signal:AbortSignal.timeout(7000),cache:'no-store'});
  if(r.ok){
   const raw=await r.text();
   if(raw.length<6_000_000)ledger=sanitizeShadowLedger(JSON.parse(raw),Date.now());
   console.info('[RADAR-SHADOW] restored GitHub checkpoint',ledger.events.length);
  }
 }catch(e){console.info('[RADAR-SHADOW] checkpoint not yet available');}
 try{
  await fs.access('/data');await fs.writeFile('/data/.radar-check','test');
  await fs.unlink('/data/.radar-check');target=candidates[0];
 }catch{target=candidates[1];}
 await store();
}
function reconnectSoon(){
 if(finishing||reconnect)return;
 reconnect=setTimeout(()=>{reconnect=null;connect();},5500);
}
function connect(){
 if(finishing)return;
 if(typeof WebSocket!=='function'){
  console.error('[RADAR-SHADOW] Node WebSocket unavailable; no events recorded');
  return;
 }
 engine=new OrderFlowRadar();connected=false;
 try{
  ws=new WebSocket(CHANNEL);
  ws.addEventListener('open',()=>{
   connected=true;
   ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],
     channels:['level2_batch','matches','heartbeat']}));
  });
  ws.addEventListener('message',(ev)=>{
   try{
    const m=JSON.parse(String(ev.data));
    if(m.type==='error'){engine.broken=true;ws.close();return;}
    engine.ingest(m,Date.now());
   }catch{engine.broken=true;}
  });
  ws.addEventListener('error',()=>{connected=false;});
  ws.addEventListener('close',()=>{connected=false;reconnectSoon();});
 }catch{connected=false;reconnectSoon();}
}
function normalizeCandles(raw,period,now){
 if(!Array.isArray(raw))return [];
 return validShadowBars(raw.filter(x=>Array.isArray(x)&&x.length>=5)
   .map(x=>({time:Math.round(Number(x[0])*1000),
      low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),close:Number(x[4])})),
   period,now);
}
async function getHistory(period,now){
 const end=Math.ceil(now/period)*period;
 const start=end-Math.min(240,period===60000?180:100)*period;
 const u=new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles');
 u.searchParams.set('granularity',String(period/1000));
 u.searchParams.set('start',new Date(start).toISOString());
 u.searchParams.set('end',new Date(end).toISOString());
 const res=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(6000),
   headers:{'Accept':'application/json','User-Agent':'QannasShadow/1.0'}});
 if(!res.ok)throw Error('CB_CANDLES_'+res.status);
 return normalizeCandles(await res.json(),period,Date.now());
}
async function pollHistory(now){
 if(inFlight||now-lastHistoryPoll<65000)return;
 inFlight=true;lastHistoryPoll=now;
 try{
  const [a,b]=await Promise.all([getHistory(60000,now),getHistory(900000,now)]);
  if(a.length<10||b.length<3)throw Error('TOO_FEW_EXCHANGE_CANDLES');
  m1=a;m15=b;
  const settled=settleRadarOutcomes({ledger,now:Date.now(),m1,m15});
  if(settled.changed){ledger=settled.ledger;await store();
   console.info('[RADAR-SHADOW] scored',settled.changed,
    'm1',radarShadowScore(ledger).m1.samples,
    'm15',radarShadowScore(ledger).m15.samples);}
 }catch(e){console.warn('[RADAR-SHADOW] candle assessment delayed:',String(e.message).slice(0,90));}
 finally{inFlight=false;}
}
async function tick(){
 if(finishing)return;
 const now=Date.now();
 await pollHistory(now);
 if(!connected||engine.broken)return;
 const view=engine.evaluate(now);
 const last=engine.trades.at(-1);
 if(view.phase!=='CONFIRMED'||!view.micro?.ready||
   view.micro.snapshots<5||!last||now-last.at>4000||
   last.price<=0||!view.confirm||!view.invalidate||
   !['BUY','SELL'].includes(view.side)||view.since===lastRecordedSince)return;
 // Strict server-observed signal. No POST / client-submitted directional claim.
 lastRecordedSince=view.since;
 const baseline=baselineAt(m1,now);
 const next=recordRadarSignal({ledger,now,sourceAt:last.at,side:view.side,
   price:last.price,confirm:view.confirm,invalidate:view.invalidate,
   l2Snapshots:view.micro.snapshots,baseline});
 if(next.recorded){
  ledger=next.ledger;await store();
  console.info('[RADAR-SHADOW] CONFIRMED paper radar',view.side,
   'as-of',new Date(last.at).toISOString(),'n',ledger.events.length);
 }
}
await init();
connect();
let busy=false;
const timer=setInterval(async()=>{
 if(busy)return;busy=true;
 try{await tick();}catch(e){console.warn('[RADAR-SHADOW] tick',String(e.message).slice(0,100));}
 finally{busy=false;}
},2500);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 finishing=true;clearInterval(timer);clearTimeout(reconnect);
 try{ws?.close();}catch{}
 void store().finally(()=>process.exit(0));
});
console.info('[RADAR-SHADOW] started server-only Coinbase book recorder; storage',target);
