import fs from 'node:fs/promises';
import {getMt5GoldDomReading} from '../../../lib/market-hub';
import {peekScalpGold,getScalpDesk} from '../../../lib/scalp-desk';
import {emptyGoldLedger,safeGoldRadarLedger,goldRadarScore}
 from '../../../lib/gold-radar-shadow';
import {readGoldPreparationStore} from '../../../lib/gold-preparation-store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const paths=['/data/qannas-gold-radar-v1.json','/tmp/qannas-gold-radar-v1.json'];
// One lightweight GOLD-only source warmup at most every 30 seconds on a
// cache miss; this never starts optional ML/Neural or BTC external sources.
let lastGoldScoutAttempt=0;
async function readFile(path:string){try{return await fs.readFile(path,'utf8');}catch{return null;}}
export async function GET(request:Request){
 const now=Date.now();
 const preparation=await readGoldPreparationStore(now);
 if(new URL(request.url).searchParams.get('leadArchive')==='1')
  return Response.json(preparation.ledger,{headers:{'Cache-Control':'no-store'}});
 const text=(await readFile(paths[0]))??(await readFile(paths[1]));
 const ledger=text&&text.length<6e6?
   safeGoldRadarLedger(JSON.parse(text),now):emptyGoldLedger();
 if(new URL(request.url).searchParams.get('archive')==='1')
   return Response.json(ledger,{headers:{'Cache-Control':'no-store'}});
 const statusText=await readFile('/tmp/gold-radar-observation.json');
 let observation:any=null;
 try{if(statusText&&statusText.length<5000)observation=JSON.parse(statusText);}catch{}
 const fresh=observation?.checkedAt!=null&&now-observation.checkedAt<200000;
 // Reuse existing GOLD closed-M1 research. Following a Render restart its
 // in-memory cache can be empty even while the main XAU chart is active.
 // Recover with the independent GOLD-only engine at a bounded cadence.
 let desk=peekScalpGold(35000);
 if(!desk&&now-lastGoldScoutAttempt>=30000){
   lastGoldScoutAttempt=now;
   try{desk=await getScalpDesk('GOLD');}catch{desk=null;}
 }
 const gold=desk?.gold;
 const early=gold?.earlyExecution;
 const scalpEarly=gold?.asset==='GOLD'&&early?.status==='EARLY_WATCH'&&
   early?.evidenceClass==='CLOSED_M1_ONLY'?
   {status:early.status,side:early.side,score:early.score,
     evidenceClass:early.evidenceClass,
     issuedFromClosedM1At:early.issuedFromClosedM1At,
     checkedAt:early.checkedAt,quoteAt:gold.quote?.at??null,
     quotePrice:gold.quote?.price??null,
     quoteSource:String(early.quoteSource||''),
     candleSource:String(gold.candleSource||''),
     reason:String(early.reason||'رصد سعر M1 فقط')}:null;

 return Response.json({ok:true,asset:'GOLD',
  status:fresh?'OBSERVING':'STALE_OR_STARTING',
  brokerDom:getMt5GoldDomReading(now),
  preparationLead:preparation.view,
  scalpEarly,
  updatedAt:now,storage:text?text===null?'NONE':(await readFile(paths[0]))?'VOLUME':'EPHEMERAL':'NONE',
  radar:fresh?observation:{ready:false,phase:'UNAVAILABLE',
    label:'الذهب: تجهيز',reason:'بيانات الرادار غير حديثة'},
  ...goldRadarScore(ledger),recent:ledger.events.slice(-6).reverse().map(e=>({
    at:e.at,source:e.source,side:e.side,label:e.reason,
    m1:e.m1.status,m15:e.m15.status}))},
  {headers:{'Cache-Control':'no-store, private'}});
}
