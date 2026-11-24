import {buildBtcOrderflow,normalizeCoinbaseTrades,normalizeKrakenTrades,compareBtcTapes,
  type ExecutedTrade} from '../../../lib/btc-orderflow';

export const dynamic='force-dynamic';
// Render's single server process accumulates a bounded rolling observed sample.
// A process restart clears it. Missing polls may skip trades; NEVER call this
// whole-session volume or a complete M1 footprint.
let cache:{at:number;payload:ReturnType<typeof buildBtcOrderflow>}|null=null;
let inFlight:Promise<ReturnType<typeof buildBtcOrderflow>>|null=null;
let tape:ExecutedTrade[]=[];
let lastFetchAt=0;
// Each market has its own genuine trade tape, cache, concurrency and clock.
// Never merge Kraken BTC/USD prints with Coinbase maker-side trade records.
let krakenCache:{at:number;payload:ReturnType<typeof buildBtcOrderflow>}|null=null;
let krakenInFlight:Promise<ReturnType<typeof buildBtcOrderflow>>|null=null;
let krakenTape:ExecutedTrade[]=[];
let lastKrakenFetchAt=0;
let coinbaseRetryAt=0,krakenRetryAt=0;

async function snapshot(){
 const now=Date.now();
 const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000',{
  cache:'no-store',signal:AbortSignal.timeout(3200),
  headers:{'User-Agent':'AlQannas/1.0','Accept':'application/json'}
 });
 if(!r.ok){
   const raw=r.headers.get('retry-after'),secs=raw?Number(raw):NaN;
   coinbaseRetryAt=Date.now()+Math.max(r.status===429?60000:10000,Number.isFinite(secs)?Math.max(0,secs)*1000:0);
   throw new Error('HTTP '+r.status);
 }
 const raw=await r.json();
 if(!Array.isArray(raw))throw new Error('Invalid exchange trade schema');
 const incoming=normalizeCoinbaseTrades(raw,Date.now());
 if(!incoming.length)throw new Error('No valid timestamped Coinbase fills');
 const tradeById=new Map<number,ExecutedTrade>();
 const time=Date.now();
 for(const t of [...tape,...incoming]){
  if(time-t.time<=12*60000&&time>=t.time-2000)tradeById.set(t.id,t);
 }
 tape=[...tradeById.values()].sort((a,b)=>a.time-b.time||a.id-b.id).slice(-4200);
 lastFetchAt=time;
 return buildBtcOrderflow(tape,time,1000);
}
async function krakenSnapshot(){
 const r=await fetch('https://api.kraken.com/0/public/Trades?pair=XBTUSD&count=1000',{
   cache:'no-store',signal:AbortSignal.timeout(4500),
   headers:{'User-Agent':'AlQannas/1.0','Accept':'application/json'}
 });
 if(!r.ok){
   const raw=r.headers.get('retry-after'),secs=raw?Number(raw):NaN;
   krakenRetryAt=Date.now()+Math.max(r.status===429?60000:10000,Number.isFinite(secs)?Math.max(0,secs)*1000:0);
   throw new Error('Kraken public trades HTTP '+r.status);
 }
 const raw=await r.json();
 if(!raw||!Array.isArray(raw.error)||raw.error.length)
   throw new Error('Kraken trades returned errors or invalid schema');
 const rows=Array.isArray(raw.result?.XXBTZUSD)?raw.result.XXBTZUSD:
   Array.isArray(raw.result?.XBTUSD)?raw.result.XBTUSD:null;
 if(!rows)throw new Error('Kraken BTC/USD trade tape unavailable');
 const now=Date.now(),incoming=normalizeKrakenTrades(rows,now);
 if(!incoming.length)throw new Error('No valid timestamped Kraken taker trades');
 const trades=new Map<number,ExecutedTrade>(),conflicts=new Set<number>();
 for(const t of [...krakenTape,...incoming]){
   if(now-t.time>12*60000||t.time>now+2000||conflicts.has(t.id))continue;
   const prior=trades.get(t.id);
   if(prior&&(prior.time!==t.time||prior.price!==t.price||
     prior.size!==t.size||prior.aggressor!==t.aggressor)){
     trades.delete(t.id);conflicts.add(t.id);
   }else trades.set(t.id,t);
 }
 krakenTape=[...trades.values()].sort((a,b)=>a.time-b.time||a.id-b.id).slice(-4200);
 lastKrakenFetchAt=now;
 return buildBtcOrderflow(krakenTape,now,1000,'Kraken XBT/USD');
}
export async function GET(request:Request):Promise<Response>{
 const now=Date.now();
 const venue=new URL(request.url).searchParams.get('venue');
 if(venue==='compare'){
   // Reuse the same per-venue caches and in-flight requests as the existing
   // chart. No extra copy of the tape and no upstream request fan-out per user.
   const read=async(v:string):Promise<unknown>=>{
     const url=new URL(request.url);url.searchParams.set('venue',v);
     return (await GET(new Request(url))).json();
   };
   const [a,b]=await Promise.allSettled([read('coinbase'),read('kraken')]);
   return Response.json(compareBtcTapes(a.status==='fulfilled'?a.value:null,b.status==='fulfilled'?b.value:null,Date.now()),
     {headers:{'Cache-Control':'private, no-store'}});
 }
 if(venue==='kraken'){
   try{
     if(krakenCache&&now-krakenCache.at<=4500)
       return Response.json(buildBtcOrderflow(krakenTape,now,1000,'Kraken XBT/USD'),
         {headers:{'Cache-Control':'private, no-store'}});
     if(now<krakenRetryAt)throw new Error('Kraken cooldown');
     if(!krakenInFlight)krakenInFlight=krakenSnapshot().finally(()=>{krakenInFlight=null;});
     const payload=await krakenInFlight;
     krakenCache={at:Date.now(),payload};
     return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
    }catch{
     krakenRetryAt=krakenRetryAt>now?krakenRetryAt:Date.now()+10000;
     return Response.json({ok:false,source:'Kraken XBT/USD',
       fetchedAt:Date.now(),asOf:lastKrakenFetchAt||0,status:'UNAVAILABLE',
       reason:'تعذر جلب صفقات Kraken المنفذة؛ لا يتم استبدالها ببيانات Coinbase',
       coverage:{from:null,to:null,trades:0,seconds:0,completeSession:false,
         completeMinutes:false,maxPerRequest:1000},
       profile:null,footprint:[],flow:null,actionable:false,venueComplete:false},
       {headers:{'Cache-Control':'private, no-store'}});
   }
 }
 try{
  if(cache&&now-cache.at<=4500){
   // Update freshness on the next calculation instead of resetting the
   // last exchange event timestamp to the HTTP response time.
   const payload=buildBtcOrderflow(tape,now,1000);
   return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
  }
  if(now<coinbaseRetryAt)throw new Error('Coinbase cooldown');
  if(!inFlight)inFlight=snapshot().finally(()=>{inFlight=null;});
  const payload=await inFlight;
  cache={at:Date.now(),payload};
  return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
 }catch{
  coinbaseRetryAt=coinbaseRetryAt>now?coinbaseRetryAt:Date.now()+10000;
  // An unavailable exchange is not a "live" green volume profile.
  // Note we intentionally do not supply prior tape as if freshly fetched.
  return Response.json({ok:false,source:'Coinbase Exchange BTC-USD',
   fetchedAt:Date.now(),asOf:lastFetchAt||0,status:'UNAVAILABLE',
   reason:'تعذر جلب الصفقات المنفذة من Coinbase الآن؛ تم إيقاف الأوردر فلو',
   coverage:{from:null,to:null,trades:0,seconds:0,completeSession:false,
     completeMinutes:false,maxPerRequest:1000},
   profile:null,footprint:[],flow:null,actionable:false,venueComplete:false},
   {headers:{'Cache-Control':'private, no-store'}});
 }
}
