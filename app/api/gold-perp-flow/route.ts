import {readPaxgFlow,readBybitGoldPerp,readBinanceGoldPerp,readOkxGoldPerp,okxGoldPrints,type PaxgFlow} from '../../../lib/paxg-flow';
import {independentFlowSlot,collectIndependentFlow,newVenueHistory,updateVenueHistory,observeBook,compareGoldVenues,observeLeadLag,type LeadPoint,type FlowPrint,type VenueEvidence,recordDepthFrame,readDepthHeatmap,observeGoldDepthPreparation,type DepthFrame} from '../../../lib/gold-flow-history';
import {goldStreamSnapshot,type GoldStreamVenue} from '../../../lib/gold-perp-stream';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Venue='bybit'|'binance'|'okx';
const retryAt={bybit:{book:0,tape:0},binance:{book:0,tape:0},okx:{book:0,tape:0}};
const failures:Record<string,string>={};
async function json(venue:Venue,url:string){
 const kind=url.includes('orderbook?')||url.includes('depth?')||url.includes('/books?')?'book':'tape';
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
 if(venue==='okx'&&data?.code!=='0'){
   retryAt[venue][kind]=Date.now()+60000;failures[key]='API_'+String(data?.code);throw Error('OKX market data unavailable');
 }
 if(venue==='bybit'&&data?.retCode!==0){
   retryAt[venue][kind]=Math.max(retryAt[venue][kind],Date.now()+60000);
   failures[key]='API_'+String(data?.retCode);
   throw Error('Bybit market data unavailable');
 }
 delete failures[key];
 return data;
}
const get=(r:PromiseSettledResult<any>)=>r.status==='fulfilled'?r.value:null;
const histories={bybit:newVenueHistory(),binance:newVenueHistory(),okx:newVenueHistory()};
const points:LeadPoint[]=[];
let lastReport=0;
const depthHistory:{bybit:DepthFrame[];binance:DepthFrame[];okx:DepthFrame[]}={bybit:[],binance:[],okx:[]};
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
async function okxSample():Promise<{flow:PaxgFlow;evidence:VenueEvidence}|null>{
 const base='https://www.okx.com/api/v5/market/';
 const [b,t]=await Promise.allSettled([json('okx',base+'books?instId=XAU-USDT-SWAP&sz=25'),json('okx',base+'trades?instId=XAU-USDT-SWAP&limit=200')]);
 const book=get(b),trades=get(t),now=Date.now();
 if(b.status==='rejected'&&!failures['okx:book'])failures['okx:book']=String(b.reason?.name||'FETCH_FAILED');
 if(t.status==='rejected'&&!failures['okx:tape'])failures['okx:tape']=String(t.reason?.name||'FETCH_FAILED');
 const depth=book?.code==='0'?book.data?.[0]:null,at=Number(depth?.ts);
 recordDepthFrame(depthHistory.okx,depth,at,now);
 const flow=readOkxGoldPerp(book,trades,now);
 if(flow.side==='UNAVAILABLE')return null;
 const evidence=updateVenueHistory(histories.okx,flow.source!,now,okxGoldPrints(trades,now),observeBook(depth,at,now));
 return {flow,evidence};
}
const freshVenue=(v:{flow:PaxgFlow},now:number)=>v.flow.tradeAt<=now&&v.flow.observedAt<=now&&
 now-v.flow.tradeAt<=10000&&now-v.flow.observedAt<=12000;
const slots=[independentFlowSlot(()=>venueSample('bybit'),freshVenue,3000),
 independentFlowSlot(()=>venueSample('binance'),freshVenue,3000),independentFlowSlot(okxSample,freshVenue,5000)];
const streamHistories={bybit:newVenueHistory(),okx:newVenueHistory()};
function streamSample(venue:GoldStreamVenue,now:number){
 const stream=goldStreamSnapshot(venue,now),source=venue==='bybit'?'Bybit XAUUSDT perpetual':'OKX XAUUSDT perpetual';
 const report={status:stream.status,ageMs:stream.ageMs,count:stream.rows.length};
 if(!stream.usable)return {report,sample:null};
 // The REST book is independent of stream executions; reuse it only while
 // the original exchange timestamp is valid. No synthetic depth.
 const frame=depthHistory[venue].at(-1);
 const depth=frame&&frame.at<=now&&now-frame.at<=8000?{
   bids:frame.levels.filter(l=>l.side==='BID').map(l=>[l.price,l.qty]),
   asks:frame.levels.filter(l=>l.side==='ASK').map(l=>[l.price,l.qty])}:null;
 const flow={...readPaxgFlow(depth,stream.rows.map((t,i)=>({a:i,T:t.at,p:t.price,q:t.qty,m:!t.buy})),now),source};
 if(flow.side==='UNAVAILABLE')return {report,sample:null};
 const evidence=updateVenueHistory(streamHistories[venue],source,now,stream.rows,observeBook(depth,frame?.at??0,now));
 return {report,sample:{flow,evidence}};
}
async function sample():Promise<PaxgFlow>{
 const started=Date.now(),by=streamSample('bybit',started),ok=streamSample('okx',started);
 // When a streaming tape is ready, REST still warms depth/fallback but
 // cannot delay the available execution tape. Exactly one vote per venue.
 const [ar,b,cr]=by.sample||ok.sample?slots.map(slot=>{void slot.refresh(started);return slot.read(started);}):await collectIndependentFlow(slots);
 const a=by.sample??ar,c=ok.sample??cr;
 const now=Date.now();
 const fresh=[a,b,c].filter((x):x is NonNullable<typeof x>=>Boolean(x&&now-x.flow.tradeAt<=15000&&now-x.flow.observedAt<=12000));
 if(now-lastReport>=30000){lastReport=now;console.info('[GOLD-PERP-SOURCES]',JSON.stringify({failures,streams:{bybit:by.report,okx:ok.report},bybit:a?.flow?{count:a.flow.count,tradeAt:a.flow.tradeAt}:null,binance:b?.flow?{count:b.flow.count,tradeAt:b.flow.tradeAt}:null,okx:c?.flow?{count:c.flow.count,tradeAt:c.flow.tradeAt}:null}));}
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
     readDepthHeatmap(depthHistory.binance,'Binance XAUUSDT perpetual',now),readDepthHeatmap(depthHistory.okx,'OKX XAUUSDT perpetual',now)].filter((v):v is NonNullable<typeof v>=>v!==null),
   preparation:[observeGoldDepthPreparation(depthHistory.bybit,a?.flow??null,now),
     observeGoldDepthPreparation(depthHistory.binance,b?.flow??null,now),observeGoldDepthPreparation(depthHistory.okx,c?.flow??null,now)].filter((v):v is NonNullable<typeof v>=>v!==null),
   consensus:fresh.length>=2&&fresh.some((x,i)=>fresh.slice(i+1).some(y=>compareGoldVenues(x.flow,y.flow,now)==='CONFLICT'))?'CONFLICT':compareGoldVenues(fresh[0]?.flow??null,fresh[1]?.flow??null,now),
   ...lead,actionable:false}};
}
export async function GET(){
 return Response.json(await sample(),{headers:{'Cache-Control':'no-store'}});
}
