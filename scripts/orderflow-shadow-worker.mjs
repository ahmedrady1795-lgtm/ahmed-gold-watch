/** Independent server-side Coinbase market-observation worker.
 * It does NOT rely on the user keeping a browser tab open and cannot trade.
 * Render Free may suspend the process: any unresolved observations become
 * unscorable on reconnect / restart rather than being invented winners.
 */
import fs from 'node:fs';
import path from 'node:path';
import {OrderFlowRadar} from '../lib/order-flow-radar.ts';
import {blankShadow,restoreShadow,addShadowSignal,advanceShadow,
 interruptShadow} from '../lib/sniper-flow-shadow.mjs';
const primary='/data/sniper-flow-shadow-v1.json';
const fallback='/tmp/sniper-flow-shadow-v1.json';
const storage=fs.existsSync('/data')?primary:fallback;
let shadow=blankShadow(),lastTradeId=0,lastSave=0;
try{
 for(const candidate of [primary,fallback]){
  if(!fs.existsSync(candidate))continue;
  shadow=restoreShadow(JSON.parse(fs.readFileSync(candidate,'utf8')));
  console.info('[FLOW-SHADOW] Restored',shadow.records.length,
    'events from',candidate===primary?'volume':'ephemeral');
  break;
 }
}catch(e){console.warn('[FLOW-SHADOW] Restore failed',e.message);}
const persist=()=>{
 try{
  const temp=storage+'.tmp';fs.writeFileSync(temp,JSON.stringify(shadow),{mode:0o600});
  fs.renameSync(temp,storage);lastSave=Date.now();
 }catch(e){console.warn('[FLOW-SHADOW] Write failed',e.message);}
};
if(interruptShadow(shadow,Date.now()))persist();
let active=null,timer=null,retry=null,stopping=false;
function connect(){
 if(stopping)return;
 const brain=new OrderFlowRadar();let socket,closed=false;
 try{socket=new WebSocket('wss://ws-feed.exchange.coinbase.com');}
 catch(e){console.warn('[FLOW-SHADOW] Socket failed',e.message);
   retry=setTimeout(connect,8000);return;}
 active={socket,brain};
 const terminate=(reason)=>{
  if(closed)return;
  closed=true;if(timer)clearInterval(timer);timer=null;
  if(interruptShadow(shadow,Date.now()))persist();
  console.warn('[FLOW-SHADOW] Stream ended',reason);
  try{socket.close();}catch{}
  if(!stopping)retry=setTimeout(connect,5000);
 };
 socket.addEventListener('open',()=>{
  socket.send(JSON.stringify({type:'subscribe',
    product_ids:['BTC-USD'],channels:['level2_batch','matches','heartbeat']}));
  timer=setInterval(()=>{
   if(closed)return;
   const now=Date.now(),view=brain.evaluate(now);
   if(brain.broken||(view.phase==='OFFLINE'&&now-brain.snapshotAt>10000)){
    terminate('STALE_OR_GAP');return;
   }
   const tape=brain.trades,last=tape.at(-1);
   if(!last||now-last.at>3000)return;
   const oldest=tape.find(t=>last.at-t.at>=15000);
   const baseline=oldest?(last.price>oldest.price?'BUY':
     last.price<oldest.price?'SELL':'WAIT'):'WAIT';
   const event=addShadowSignal(shadow,{
    at:now,sourceAt:last.at,price:last.price,baselineSide:baseline,view});
   if(event){persist();console.info('[FLOW-SHADOW] Captured',
     event.phase,event.side,event.at);}
  },1000);
 });
 socket.addEventListener('message',(e)=>{
  if(closed)return;
  let data;
  try{data=JSON.parse(String(e.data));}catch{return;}
  if(data?.type==='error'){terminate('EXCHANGE_ERROR');return;}
  const now=Date.now();
  brain.ingest(data,now);
  if(brain.broken){terminate('INVALID_EXCHANGE_EVENT');return;}
  if(data.type==='match'){
   const last=brain.trades.at(-1);
   if(last&&last.id!==lastTradeId&&last.at>=now-3000){
    lastTradeId=last.id;
    if(advanceShadow(shadow,{at:last.at,price:last.price,
      connected:true}))persist();
   }
  }
 });
 socket.addEventListener('error',()=>terminate('NETWORK_ERROR'));
 socket.addEventListener('close',()=>terminate('CLOSED'));
}
connect();
const stop=()=>{
 stopping=true;clearTimeout(retry);clearInterval(timer);
 if(active?.socket)try{active.socket.close();}catch{}
 if(interruptShadow(shadow,Date.now()))persist();
 process.exit(0);
};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
console.info('[FLOW-SHADOW] Coinbase read-only worker starting; persistence',
 storage===primary?'volume':'ephemeral');
