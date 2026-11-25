import {aggregateGoldBars,completeGoldBars} from './gold-chart-frames';
import type {QuoteData} from './market-hub';

const symbol='frxXAUUSD';
const source='Deriv · XAUUSD';
const url='wss://api.derivws.com/trading/v1/options/ws/public';

// Reuse the handshake across chart refreshes and quote polls. Disconnect
// idle clients and reject all outstanding reads if the connection drops.
let channel:WebSocket|null=null;
let sequence=0;
let idle:ReturnType<typeof setTimeout>|undefined;
const waiting=new Map<number,{send:()=>void;finish:(packet?:any)=>void}>();
function connection(){
  if(channel&&(channel.readyState===WebSocket.CONNECTING||channel.readyState===WebSocket.OPEN))return channel;
  const ws=new WebSocket(url);
  channel=ws;
  ws.onopen=()=>{for(const job of waiting.values())job.send();};
  ws.onmessage=event=>{
    try{const packet=JSON.parse(String(event.data));waiting.get(packet.req_id)?.finish(packet);}
    catch{/* The individual request deadline handles malformed responses. */}
  };
  ws.onerror=()=>ws.close();
  ws.onclose=()=>{
    if(channel!==ws)return;
    channel=null;
    for(const job of waiting.values())job.finish();
  };
  return ws;
}
function request(payload:Record<string,unknown>,type:'tick'|'candles'):Promise<any>{
  return new Promise((resolve,reject)=>{
    const ws=connection(),id=++sequence;
    clearTimeout(idle);
    const finish=(packet?:any)=>{
      waiting.delete(id);
      clearTimeout(timer);
      if(!waiting.size)idle=setTimeout(()=>{if(channel===ws)ws.close();},30000);
      if(packet?.msg_type===type&&!packet.error&&
         (packet.echo_req?.ticks_history??packet.echo_req?.ticks)===symbol)resolve(packet[type]);
      else reject(new Error('Deriv market data unavailable'));
    };
    const timer=setTimeout(finish,10000);
    const send=()=>{try{ws.send(JSON.stringify({...payload,req_id:id}));}catch{finish();}};
    waiting.set(id,{send,finish});
    if(ws.readyState===WebSocket.OPEN)send();
  });
}
export async function derivGoldFrames(){
  const bars=await request({ticks_history:symbol,end:'latest',style:'candles',granularity:60,count:1500},'candles');
  if(!Array.isArray(bars))throw new Error('Missing Deriv candles');
  const now=Date.now();
  const history=completeGoldBars(bars.map(b=>({...b,time:b.epoch*1000})),60000,now);
  return {c1:history.slice(-340),c5:aggregateGoldBars(history,60000,300000,now),
    c15:aggregateGoldBars(history,60000,900000,now),c60:aggregateGoldBars(history,60000,3600000,now)};
}

let cached:QuoteData|null=null;
let pending:Promise<QuoteData>|null=null;
export async function derivGoldQuote():Promise<QuoteData>{
  if(cached&&Date.now()-cached.fetchedAt<1500&&Date.now()-Number(cached.sourceTime)<8000)return cached;
  if(pending)return pending;
  pending=request({ticks:symbol},'tick').then(t=>{
    const now=Date.now(),at=t?.epoch*1000;
    if(t?.symbol!==symbol||!Number.isSafeInteger(at)||at>now+1500||now-at>10000||
      ![t.bid,t.ask,t.quote].every(n=>Number.isFinite(n)&&n>0)||t.bid>t.quote||t.quote>t.ask)
      throw new Error('Stale or invalid Deriv XAUUSD tick');
    cached={ok:true,symbol:'XAU/USD',source,price:t.quote,sourceTime:at,fetchedAt:now,
      status:'live',bid:t.bid,ask:t.ask,spread:t.ask-t.bid,previousClose:null,change:null,percentChange:null};
    return cached;
  });
  try{return await pending;}finally{pending=null;}
}
