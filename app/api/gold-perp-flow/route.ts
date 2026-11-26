import {readBybitGoldPerp,readBinanceGoldPerp,type PaxgFlow} from '../../../lib/paxg-flow';
import {newVenueHistory,updateVenueHistory,observeBook,compareGoldVenues,observeLeadLag,type LeadPoint,type FlowPrint,type VenueEvidence,recordDepthFrame,readDepthHeatmap,observeGoldDepthPreparation,type DepthFrame} from '../../../lib/gold-flow-history';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
export const runtime='nodejs';
let cache:PaxgFlow|null=null;
let pending:Promise<PaxgFlow>|null=null;
type Venue='bybit'|'binance';
const retryAt={bybit:{book:0,tape:0},binance:{book:0,tape:0}};
const failures:Record<string,string>={};
async function json(venue:Venue,url:string){
 const kind=url.includes('orderbook?')||url.includes('depth?')?'book':'tape';
 const key=venue+':'+kind;
 if(Date.now()<retryAt[venue][kind])throw Error('cooldown '+key);
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(4000),
   headers:{Accept:'application/json'}});
 if(!r.ok){
   retryAt[venue][kind]=Math.max(retryAt[venue][kind],Date.now()+
     (r.status===429||r.status===418?Math.max(60000,spotBackoffMs(r.status,r.headers.get('retry-after'))):60000));
   failures[key]='HTTP_'+r.status;
   throw Error('public data unavailable');
 }
 const data=await r.json();
 if(venue==='bybit'&&data?.retCode!==0){
   retryAt[venue][kind]=Math.max(retryAt[venue][kind],Date.now()+60000);
   failures[key]='API_'+String(data?.retCode);
   throw Error('Bybit market data unavailable');
 }
 delete failures[key];
 return data;
}
const get=(r:PromiseSettledResult<any>)=>r.status==='fulfilled'?r.value:null;
const histories={bybit:newVenueHistory(),binance:newVenueHistory()};
const points:LeadPoint[]=[];
let lastReport=0;
const depthHistory:{bybit:DepthFrame[];binance:DepthFrame[]}={bybit:[],binance:[]};
async function venueSample(venue:Venue):Promise<{flow:PaxgFlow;evidence:VenueEvidence}|null>{
 const by=venue==='bybit',base=by?'https://api.bybit.com/v5/market/':'https://fapi.binance.com/fapi/v1/';
 const [b,t]=await Promise.allSettled([
   json(venue,base+(by?'orderbook?category=linear&symbol=XAUUSDT&limit=25':'depth?symbol=XAUUSDT&limit=20')),
   json(venue,base+(by?'recent-trade?category=linear&symbol=XAUUSDT&limit=200':'aggTrades?symbol=XAUUSDT&limit=200'))
 ]);
 const book=get(b),trades=get(t),now=Date.now();
 if(b.status==='rejected'&&!failures[venue+':book'])failures[venue+':book']=String(b.reason?.name||'FETCH_FAILED');
 if(t.status==='rejected'&&!failures[venue+':tape'])failures[venue+':tape']=String(t.reason?.name||'FETCH_FAILED');
 const d=by&&book?.retCode===0&&book.result?.s==='XAUUSDT'?book.result:null;
 const rawDepth=by?{bids:d?.b,asks:d?.a}:book;
 const bookAt=Number(by?d?.cts??d?.ts:book?.T??book?.E);
 recordDepthFrame(depthHistory[venue],rawDepth,bookAt,now);
 const flow=by?readBybitGoldPerp(book,trades,now):readBinanceGoldPerp(book,trades,now);
 if(flow.side==='UNAVAILABLE'){
   return null;
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
 const depth=observeBook(rawDepth,bookAt,now);
 const evidence=updateVenueHistory(histories[venue],flow.source!,now,prints,depth);
 return {flow,evidence};
}
async function sample():Promise<PaxgFlow>{
 // Parallel independent snapshots, bounded cadence, independent cooldowns.
 const [a,b]=await Promise.all([venueSample('bybit'),venueSample('binance')]);
 const now=Date.now();
 const fresh=[a,b].filter((x):x is NonNullable<typeof x>=>Boolean(x&&now-x.flow.tradeAt<=15000&&now-x.flow.observedAt<=12000));
 if(now-lastReport>=30000){lastReport=now;console.info('[GOLD-PERP-SOURCES]',JSON.stringify({failures,bybit:a?.flow?{count:a.flow.count,tradeAt:a.flow.tradeAt}:null,binance:b?.flow?{count:b.flow.count,tradeAt:b.flow.tradeAt}:null}));}
 const av=a?.evidence,bv=b?.evidence;
 if(av&&bv&&av.mid!=null&&bv.mid!=null&&av.bookAt!=null&&bv.bookAt!=null&&
    Math.abs(av.bookAt-bv.bookAt)<=2000&&now-Math.min(av.bookAt,bv.bookAt)<=8000){
   const at=Math.floor(Math.min(av.bookAt,bv.bookAt)/5000)*5000;
   if(!points.length||at>points.at(-1)!.at)points.push({at,a:av.mid,b:bv.mid});
 }
 while(points.length&&(points.length>61||now-points[0].at>300000))points.shift();
 const lead=observeLeadLag(points,now);
 const primary=fresh[0]?.flow??{side:'UNAVAILABLE' as const,observedAt:now,tradeAt:0,count:0,source:'Gold perpetual unavailable'};
 return {...primary,venueSamples:fresh.map(x=>x.flow),crossFlow:{venues:fresh.map(x=>x.evidence),
   heatmaps:[readDepthHeatmap(depthHistory.bybit,'Bybit XAUUSDT perpetual',now),
     readDepthHeatmap(depthHistory.binance,'Binance XAUUSDT perpetual',now)].filter((v):v is NonNullable<typeof v>=>v!==null),
   preparation:[observeGoldDepthPreparation(depthHistory.bybit,a?.flow??null,now),
     observeGoldDepthPreparation(depthHistory.binance,b?.flow??null,now)].filter((v):v is NonNullable<typeof v>=>v!==null),
   consensus:compareGoldVenues(a?.flow??null,b?.flow??null,now),
   ...lead,actionable:false}};
}
export async function GET(){
 if(!cache||Date.now()-cache.observedAt>=3000){
   pending??=sample().then(v=>cache=v).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
