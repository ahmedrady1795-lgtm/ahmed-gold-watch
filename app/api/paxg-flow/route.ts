import {readPaxgFlow,readKrakenPaxgFlow,type PaxgFlow} from '../../../lib/paxg-flow';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
export const runtime='nodejs';
// Independent source cooldowns. Never treat a new HTTP fetch as a new trade.
let cache:PaxgFlow|null=null;
let binanceRetryAt=0,krakenRetryAt=0;
let pending:Promise<PaxgFlow>|null=null;
const unavailable=(now:number):PaxgFlow=>({
  side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0,
  source:'Binance / Kraken PAXG proxy unavailable'
});
async function readBinance(path:string){
 const response=await fetch('https://data-api.binance.vision/api/v3/'+path,{
   cache:'no-store',signal:AbortSignal.timeout(4500)});
 if(!response.ok){
   binanceRetryAt=Math.max(binanceRetryAt,Date.now()+
     spotBackoffMs(response.status,response.headers.get('retry-after')));
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
     spotBackoffMs(response.status,response.headers.get('retry-after')):60000;
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
async function sample():Promise<PaxgFlow>{
 const now=Date.now();
 if(now>=binanceRetryAt){
   try{
     const [book,trades]=await Promise.allSettled([
       readBinance('depth?symbol=PAXGUSDT&limit=5'),
       readBinance('aggTrades?symbol=PAXGUSDT&limit=100')
     ]);
     const flow=readPaxgFlow(book.status==='fulfilled'?book.value:null,
       trades.status==='fulfilled'?trades.value:null,Date.now());
     if(flow.side!=='UNAVAILABLE')return flow;
   }catch{/* Try independent Kraken spot market instead. */}
 }
 // No Kraken poll on a healthy Binance sample. A single Kraken snapshot
 // supplies book+executed trades only for PAXG/USD, never the Exness XAU book.
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
   return readKrakenPaxgFlow(book,trades,Date.now());
 }catch{
   // In particular, an absent/renamed pair is an unavailable proxy,
   // never a substitute synthetic BUY/SELL signal.
   krakenRetryAt=Math.max(krakenRetryAt,Date.now()+15000);
   return unavailable(Date.now());
 }
}
export async function GET(){
 if(!cache||Date.now()-cache.observedAt>=5000){
   pending??=sample().then(result=>cache=result).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
