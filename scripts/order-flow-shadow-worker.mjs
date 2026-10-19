import fs from 'node:fs/promises';
import {OrderFlowRadar} from '../lib/order-flow-radar.ts';
import {emptyFlowLedger,validateFlowLedger,mergeFlowLedgers,
 addRadarObservation,applyExchangeMatch,expireMissingFlow,
 flowScorecard} from '../lib/order-flow-shadow-evaluation.mjs';

const dest='/tmp/qannas-flow-shadow-v1.json';
const restore='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/order-flow-shadow.json';
let ledger=emptyFlowLedger(),savedAt=0,dirty=false,shutdown=false;
async function load(){
 let remote=null,local=null;
 try{
  const response=await fetch(restore+'?t='+Date.now(),{
   signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(response.ok){
   const body=await response.text();
   if(body.length<7_000_000)remote=validateFlowLedger(JSON.parse(body));
  }
 }catch(e){console.warn('[FLOW-SHADOW] remote restoration unavailable',e.message)}
 try{local=validateFlowLedger(JSON.parse(await fs.readFile(dest,'utf8')))}
 catch{}
 ledger=mergeFlowLedgers(remote,local||emptyFlowLedger());
 await save(true);
 console.info('[FLOW-SHADOW] restored observations',ledger.records.length);
}
async function save(force=false){
 if(!dirty&&!force)return;
 const payload=JSON.stringify(ledger);
 if(payload.length>7_000_000)throw Error('flow shadow size cap reached');
 const tmp=dest+'.tmp';
 await fs.writeFile(tmp,payload,{mode:0o600});
 await fs.rename(tmp,dest);
 savedAt=Date.now();dirty=false;
}
await load();
let socket=null,radar=new OrderFlowRadar(),connected=false,
 retryMs=3000,lastObservedId=0;
function connect(){
 if(shutdown)return;
 radar=new OrderFlowRadar();lastObservedId=0;
 if(typeof WebSocket!=='function'){
  console.error('[FLOW-SHADOW] Node runtime has no native WebSocket');
  setTimeout(connect,30000);return;
 }
 try{socket=new WebSocket('wss://ws-feed.exchange.coinbase.com')}catch{
  setTimeout(connect,Math.min(30000,retryMs));return;
 }
 socket.addEventListener('open',()=>{
  connected=true;retryMs=3000;
  socket.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],
   channels:['level2_batch','matches','heartbeat']}));
 });
 socket.addEventListener('message',ev=>{
  let m;
  try{m=JSON.parse(String(ev.data))}catch{return}
  if(m?.type==='error'){socket.close();return}
  const now=Date.now();
  // Only accepted exchange-side matches are used for scoring. This is a
  // separate server connection, not replayed browser user submissions.
  radar.ingest(m,now);
  if(m?.type!=='match'||m.product_id!=='BTC-USD'||
     radar.broken||now<radar.quarantineUntil)return;
  const id=Number(m.trade_id),at=Date.parse(String(m.time)),
    price=Number(m.price);
  if(!Number.isSafeInteger(id)||id<=lastObservedId||
     !Number.isFinite(at)||at>now+2000||now-at>5000||
     !Number.isFinite(price)||price<=0)return;
  lastObservedId=id;
  if(applyExchangeMatch(ledger,{at,price,now}))dirty=true;
 });
 socket.addEventListener('close',()=>{
  connected=false;radar.broken=true;
  if(!shutdown)setTimeout(connect,Math.min(30000,retryMs));
  retryMs=Math.min(30000,retryMs*1.7);
 });
 socket.addEventListener('error',()=>{try{socket.close()}catch{}});
}
connect();
const loop=setInterval(async()=>{
 const now=Date.now();
 try{
  if(connected){
   const observation=radar.evaluate(now);
   const latest=radar.trades.at(-1);
   const first=radar.trades.find(t=>now-t.at>=20000&&now-t.at<=30000);
   const baselineSide=!latest||!first?'WAIT':
     (latest.price-first.price)/first.price*10000>1?'BUY':
     (latest.price-first.price)/first.price*10000< -1?'SELL':'WAIT';
   if(latest&&addRadarObservation(ledger,{
      now,radar:observation,tradeAt:latest.at,price:latest.price,baselineSide
    }))dirty=true;
  }
  if(expireMissingFlow(ledger,now))dirty=true;
  if(dirty&&now-savedAt>4000)await save();
 }catch(e){console.error('[FLOW-SHADOW] tick',e.message)}
},1000);
loop.unref?.();
const diagnostics=setInterval(()=>{
 const stats=flowScorecard(ledger);
 console.info('[FLOW-SHADOW]',JSON.stringify({
  connected,observations:ledger.records.length,
  pending:stats.cohorts.reduce((n,c)=>n+c.pending,0),
  evaluated:stats.cohorts.map(c=>[c.phase,c.horizonMs,c.evaluated])
 }));
},300000);
diagnostics.unref?.();
async function finish(){
 if(shutdown)return;
 shutdown=true;clearInterval(loop);clearInterval(diagnostics);
 try{socket?.close()}catch{}
 await save(true).catch(e=>console.error('[FLOW-SHADOW] flush',e.message));
 process.exit(0);
}
process.on('SIGTERM',finish);process.on('SIGINT',finish);
