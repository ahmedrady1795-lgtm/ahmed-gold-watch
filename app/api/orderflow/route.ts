import {buildBtcOrderflow,normalizeCoinbaseTrades,
  type ExecutedTrade} from '../../../lib/btc-orderflow';

export const dynamic='force-dynamic';
// Render's single server process accumulates a bounded rolling observed sample.
// A process restart clears it. Missing polls may skip trades; NEVER call this
// whole-session volume or a complete M1 footprint.
let cache:{at:number;payload:ReturnType<typeof buildBtcOrderflow>}|null=null;
let inFlight:Promise<ReturnType<typeof buildBtcOrderflow>>|null=null;
let tape:ExecutedTrade[]=[];
let lastFetchAt=0;

async function snapshot(){
 const now=Date.now();
 const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000',{
  cache:'no-store',signal:AbortSignal.timeout(3200),
  headers:{'User-Agent':'AlQannas/1.0','Accept':'application/json'}
 });
 if(!r.ok)throw new Error('HTTP '+r.status);
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
export async function GET(){
 const now=Date.now();
 try{
  if(cache&&now-cache.at<=4500){
   // Update freshness on the next calculation instead of resetting the
   // last exchange event timestamp to the HTTP response time.
   const payload=buildBtcOrderflow(tape,now,1000);
   return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
  }
  if(!inFlight)inFlight=snapshot().finally(()=>{inFlight=null;});
  const payload=await inFlight;
  cache={at:Date.now(),payload};
  return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
 }catch{
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
