import {readBybitGoldPerp,readBinanceGoldPerp,type PaxgFlow} from '../../../lib/paxg-flow';
import {newVenueHistory,updateVenueHistory,observeBook,compareGoldVenues,observeLeadLag,type LeadPoint,type FlowPrint,type VenueEvidence} from '../../../lib/gold-flow-history';
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
const histories={bybit:newVenueHistory(),binance:newVenueHistory()};
const points:LeadPoint[]=[];
async function venueSample(venue:Venue):Promise<{flow:PaxgFlow;evidence:VenueEvidence}|null>{
 if(Date.now()<retryAt[venue])return null;
 const by=venue==='bybit',base=by?'https://api.bybit.com/v5/market/':'https://fapi.binance.com/fapi/v1/';
 const [b,t]=await Promise.allSettled([
   json(venue,base+(by?'orderbook?category=linear&symbol=XAUUSDT&limit=25':'depth?symbol=XAUUSDT&limit=20')),
   json(venue,base+(by?'recent-trade?category=linear&symbol=XAUUSDT&limit=200':'aggTrades?symbol=XAUUSDT&limit=200'))
 ]);
 const book=get(b),trades=get(t),now=Date.now();
 const flow=by?readBybitGoldPerp(book,trades,now):readBinanceGoldPerp(book,trades,now);
 if(flow.side==='UNAVAILABLE'){
   retryAt[venue]=Math.max(retryAt[venue],now+15000);return null;
 }
 const rows=by?(trades?.retCode===0&&trades?.result?.category==='linear'?trades.result.list:[]):trades;
 const prints:FlowPrint[]=[];
 for(const q of Array.isArray(rows)?rows:[]){
   if(by&&(q?.symbol!=='XAUUSDT'||typeof q.execId!=='string'||!q.execId||
     q.isBlockTrade===true||(q.side!=='Buy'&&q.side!=='Sell')))continue;
   if(!by&&(!Number.isSafeInteger(q?.a)||typeof q.m!=='boolean'))continue;
   const price=Number(by?q.price:q.p);
   if(!Number.isFinite(price)||price<=0)continue;
   prints.push({id:by?q.execId:String(q.a),at:Number(by?q.time:q.T),
     qty:Number(by?q.size:q.q),buy:by?q.side==='Buy':!q.m});
 }
 const d=by&&book?.retCode===0&&book.result?.s==='XAUUSDT'?book.result:null;
 const depth=by?observeBook({bids:d?.b,asks:d?.a},Number(d?.cts??d?.ts),now):
   observeBook(book,Number(book?.T??book?.E),now);
 const evidence=updateVenueHistory(histories[venue],flow.source!,now,prints,depth);
 return {flow,evidence};
}
async function sample():Promise<PaxgFlow>{
 // Parallel independent snapshots, bounded cadence, independent cooldowns.
 const [a,b]=await Promise.all([venueSample('bybit'),venueSample('binance')]);
 const now=Date.now();
 const fresh=[a,b].filter((x):x is NonNullable<typeof x>=>Boolean(x&&now-x.flow.tradeAt<=15000&&now-x.flow.observedAt<=12000));
 const av=a?.evidence,bv=b?.evidence;
 if(av&&bv&&av.mid!=null&&bv.mid!=null&&av.bookAt!=null&&bv.bookAt!=null&&
    Math.abs(av.bookAt-bv.bookAt)<=2000&&now-Math.min(av.bookAt,bv.bookAt)<=8000){
   const at=Math.floor(Math.min(av.bookAt,bv.bookAt)/5000)*5000;
   if(!points.length||at>points.at(-1)!.at)points.push({at,a:av.mid,b:bv.mid});
 }
 while(points.length&&(points.length>61||now-points[0].at>300000))points.shift();
 const lead=observeLeadLag(points,now);
 const primary=fresh[0]?.flow??{side:'UNAVAILABLE' as const,observedAt:now,tradeAt:0,count:0,source:'Gold perpetual unavailable'};
 return {...primary,crossFlow:{venues:fresh.map(x=>x.evidence),
   consensus:compareGoldVenues(a?.flow??null,b?.flow??null,now),
   ...lead,actionable:false}};
}
export async function GET(){
 if(!cache||Date.now()-cache.observedAt>=5000){
   pending??=sample().then(v=>cache=v).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
