import {parseYahooGC,parseLicensedGC,type GcFuturesSnapshot}
 from '../../../lib/gc-futures-feed';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const yahoo='https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d';
let cached:{at:number;data:GcFuturesSnapshot}|null=null;
let inFlight:Promise<GcFuturesSnapshot>|null=null;
async function query(){
 const now=Date.now();
 // Optional licensed source: this URL is configured SERVER-SIDE only.
 // Contract: {exchange:'COMEX',symbol:'GCZ26',price:...,at:epochMs}.
 const configured=process.env.GC_FUTURES_FEED_URL?.trim();
 if(configured){
  try{
   const u=new URL(configured);
   if(u.protocol==='https:'&&u.username===''&&u.password===''&&
     !['localhost','127.0.0.1','::1'].includes(u.hostname)){
    const headers:Record<string,string>={'Accept':'application/json'};
    const token=process.env.GC_FUTURES_FEED_TOKEN;
    if(token)headers['Authorization']='Bearer '+token;
    const r=await fetch(u.toString(),{cache:'no-store',headers,
       signal:AbortSignal.timeout(4500)});
    if(r.ok&&Number(r.headers.get('content-length')||0)<70000){
     const snap=parseLicensedGC(await r.json(),Date.now());
     if(snap.available)return snap;
    }
   }
  }catch{}
 }
 try{
  const r=await fetch(yahoo,{cache:'no-store',
    signal:AbortSignal.timeout(4900),headers:{
    'Accept':'application/json',
    'User-Agent':'Mozilla/5.0 QannasReference/1.0'
  }});
  if(!r.ok||Number(r.headers.get('content-length')||0)>400000)
   throw Error('provider_unavailable');
  const result=parseYahooGC(await r.json(),Date.now());
  return result;
 }catch{
  // Never keep old successful prices when upstream turns unavailable.
  return {available:false,symbol:'GC',exchange:'COMEX',
    source:'GC futures reference',status:'UNAVAILABLE' as const,
    contract:null,price:null,previous:null,change5mPct:null,
    quoteAt:null,checkedAt:Date.now(),ageSeconds:null,
    directContract:false,orderBook:false as const,executedTrades:false as const,
    eligibleForLead:false,reason:'مصدر GC غير متاح الآن؛ لا يوجد سعر مباشر مؤكد'};
 }
}
export async function GET(){
 const now=Date.now();
 if(!cached||now-cached.at>30000){
   if(!inFlight)inFlight=query().finally(()=>{inFlight=null;});
   const data=await inFlight;
   cached={at:Date.now(),data};
 }
 return Response.json(cached.data,
   {headers:{'Cache-Control':'private, no-store'}});
}
