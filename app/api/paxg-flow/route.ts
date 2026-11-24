import {readPaxgFlow,readKrakenPaxgFlow,type PaxgFlow} from '../../../lib/paxg-flow';
import {newVenueHistory,updateVenueHistory,type FlowPrint} from '../../../lib/gold-flow-history';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
export const runtime='nodejs';
// Independent source cooldowns. Never treat a new HTTP fetch as a new trade.
let cache:PaxgFlow|null=null;
let sampledAt=0;
let binanceRetryAt=0,krakenRetryAt=0;
let pending:Promise<PaxgFlow>|null=null;
const tape={binance:newVenueHistory(),kraken:newVenueHistory()};
const unavailable=(now:number):PaxgFlow=>({
  side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0,
  source:'Binance / Kraken PAXG proxy unavailable'
});
async function readBinance(path:string){
 const response=await fetch('https://data-api.binance.vision/api/v3/'+path,{
   cache:'no-store',signal:AbortSignal.timeout(4500)});
 if(!response.ok){
   binanceRetryAt=Math.max(binanceRetryAt,Date.now()+
     (spotBackoffMs(response.status,response.headers.get('retry-after'))||30000));
   throw new Error('Binance unavailable');
 }
 const serverTime=Date.parse(response.headers.get('date')||'');
 if(!Number.isFinite(serverTime)||Math.abs(Date.now()-serverTime)>10000)
   throw new Error('Old Binance snapshot');
 return response.json();
}
async function readKraken(path:string){
 const response=await fetch('https://api.kraken.com/0/public/'+path,{
   cache:'no-store',signal:AbortSignal.timeout(5000),
   headers:{Accept:'application/json','User-Agent':'AlQannas-Proxy-Research/1.0'}});
 if(!response.ok){
   const cooldown=response.status===429||response.status>=500?
     (spotBackoffMs(response.status,response.headers.get('retry-after'))||30000):60000;
   krakenRetryAt=Math.max(krakenRetryAt,Date.now()+cooldown);
   throw new Error('Kraken unavailable');
 }
 const serverTime=Date.parse(response.headers.get('date')||'');
 if(!Number.isFinite(serverTime)||Math.abs(Date.now()-serverTime)>15000)
   throw new Error('Old Kraken HTTP snapshot');
 const data=await response.json();
 if(!data||!Array.isArray(data.error)||data.error.length||
    !data.result||typeof data.result!=='object')
   throw new Error('Invalid Kraken response');
 return data.result as Record<string,unknown>;
}
async function binanceSample():Promise<PaxgFlow|null>{
 const now=Date.now();
 if(now<binanceRetryAt)return null;
 if(now>=binanceRetryAt){
   try{
     const [book,trades]=await Promise.allSettled([
       readBinance('depth?symbol=PAXGUSDT&limit=5'),
       readBinance('aggTrades?symbol=PAXGUSDT&limit=100')
     ]);
     const now=Date.now(),raw=trades.status==='fulfilled'?trades.value:null;
     const flow=readPaxgFlow(book.status==='fulfilled'?book.value:null,raw,now);
     const rows:FlowPrint[]=Array.isArray(raw)?raw.filter(t=>Number.isSafeInteger(t?.a)&&typeof t.m==='boolean'&&Number(t.p)>0)
       .map(t=>({id:String(t.a),at:Number(t.T),qty:Number(t.q),buy:!t.m})):[];
     const executionHistory=updateVenueHistory(tape.binance,'Binance PAXG/USDT proxy',now,rows,null);
     if(flow.side!=='UNAVAILABLE')return {...flow,executionHistory};
   }catch{/* Try independent Kraken spot market instead. */}
 }
 // Sparse trades are not a transport failure; retain the normal poll cadence.
 return null;
}
async function krakenSample():Promise<PaxgFlow>{
 // Independent token market; never broker XAUUSD executions.
 if(Date.now()<krakenRetryAt)return unavailable(Date.now());
 try{
   const [depth,history]=await Promise.allSettled([
     readKraken('Depth?pair=PAXGUSD&count=5'),
     readKraken('Trades?pair=PAXGUSD&count=100')
   ]);
   const book=Object.values(depth.status==='fulfilled'?depth.value:{}).find(v=>v&&typeof v==='object'&&
     Array.isArray((v as any).bids)&&Array.isArray((v as any).asks));
   const trades=Object.values(history.status==='fulfilled'?history.value:{}).find(Array.isArray);
   if(!trades)throw new Error('Missing Kraken PAXG/USD trades');
   const now=Date.now(),flow=readKrakenPaxgFlow(book,trades,now);
   const rows:FlowPrint[]=trades.filter(t=>Array.isArray(t)&&Number(t[0])>0&&(t[3]==='b'||t[3]==='s'))
     .map(t=>({id:t[6]!=null?'trade:'+String(t[6]):[t[0],t[1],t[2],t[3]].join(':'),
       at:Math.floor(Number(t[2])*1000),qty:Number(t[1]),buy:t[3]==='b'}));
   const executionHistory=updateVenueHistory(tape.kraken,'Kraken PAXG/USD proxy',now,rows,null);
   return {...flow,executionHistory};
 }catch{
   // In particular, an absent/renamed pair is an unavailable proxy,
   // never a substitute synthetic BUY/SELL signal.
   krakenRetryAt=Math.max(krakenRetryAt,Date.now()+15000);
   return unavailable(Date.now());
 }
}
async function sample():Promise<PaxgFlow>{
 const [a,b]=await Promise.all([binanceSample(),krakenSample()]);
 const now=Date.now();
 const fresh=[a,b].filter((v):v is PaxgFlow=>Boolean(v&&v.side!=='UNAVAILABLE'&&v.tradeAt<=now&&now-v.tradeAt<=15000));
 return {...(fresh[0]??unavailable(now)),venueSamples:fresh};
}
export async function GET(){
 if(!cache||Date.now()-sampledAt>=5000){
   pending??=sample().then(result=>{sampledAt=Date.now();return cache=result;}).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
