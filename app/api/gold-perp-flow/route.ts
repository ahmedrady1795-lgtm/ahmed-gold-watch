import {readBybitGoldPerp,readBinanceGoldPerp,type PaxgFlow} from '../../../lib/paxg-flow';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
export const runtime='nodejs';
let cache:PaxgFlow|null=null;
let pending:Promise<PaxgFlow>|null=null;
const retryAt={bybit:0,binance:0};
type Venue=keyof typeof retryAt;
async function json(venue:Venue,url:string){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(4000),
   headers:{Accept:'application/json'}});
 if(!r.ok){
   retryAt[venue]=Math.max(retryAt[venue],Date.now()+
     (r.status===429||r.status===418?Math.max(60000,spotBackoffMs(r.status,r.headers.get('retry-after'))):60000));
   throw Error('public data unavailable');
 }
 const data=await r.json();
 if(venue==='bybit'&&data?.retCode!==0){
   retryAt[venue]=Math.max(retryAt[venue],Date.now()+60000);
   throw Error('Bybit market data unavailable');
 }
 return data;
}
const get=(r:PromiseSettledResult<any>)=>r.status==='fulfilled'?r.value:null;
async function sample():Promise<PaxgFlow>{
 // Only one venue at a time; never sum unrelated instrument quantities.
 if(Date.now()>=retryAt.bybit){
   const base='https://api.bybit.com/v5/market/';
   const [b,t]=await Promise.allSettled([
     json('bybit',base+'orderbook?category=linear&symbol=XAUUSDT&limit=25'),
     json('bybit',base+'recent-trade?category=linear&symbol=XAUUSDT&limit=200')
   ]);
   const flow=readBybitGoldPerp(get(b),get(t),Date.now());
   if(flow.side!=='UNAVAILABLE')return flow;
   retryAt.bybit=Math.max(retryAt.bybit,Date.now()+15000);
 }
 if(Date.now()>=retryAt.binance){
   const base='https://fapi.binance.com/fapi/v1/';
   const [b,t]=await Promise.allSettled([
     json('binance',base+'depth?symbol=XAUUSDT&limit=20'),
     json('binance',base+'aggTrades?symbol=XAUUSDT&limit=200')
   ]);
   const flow=readBinanceGoldPerp(get(b),get(t),Date.now());
   if(flow.side!=='UNAVAILABLE')return flow;
   retryAt.binance=Math.max(retryAt.binance,Date.now()+15000);
 }
 return {side:'UNAVAILABLE',observedAt:Date.now(),tradeAt:0,count:0,source:'Gold perpetual unavailable'};
}
export async function GET(){
 if(!cache||Date.now()-cache.observedAt>=5000){
   pending??=sample().then(v=>cache=v).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
