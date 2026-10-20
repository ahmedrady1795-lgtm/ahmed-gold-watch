import fs from 'node:fs/promises';
import {getMt5GoldDomReading} from '../../../lib/market-hub';
import {emptyGoldLedger,safeGoldRadarLedger,goldRadarScore}
 from '../../../lib/gold-radar-shadow';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const paths=['/data/qannas-gold-radar-v1.json','/tmp/qannas-gold-radar-v1.json'];
async function readFile(path:string){try{return await fs.readFile(path,'utf8');}catch{return null;}}
export async function GET(request:Request){
 const now=Date.now();
 const text=(await readFile(paths[0]))??(await readFile(paths[1]));
 const ledger=text&&text.length<6e6?
   safeGoldRadarLedger(JSON.parse(text),now):emptyGoldLedger();
 if(new URL(request.url).searchParams.get('archive')==='1')
   return Response.json(ledger,{headers:{'Cache-Control':'no-store'}});
 const statusText=await readFile('/tmp/gold-radar-observation.json');
 let observation:any=null;
 try{if(statusText&&statusText.length<5000)observation=JSON.parse(statusText);}catch{}
 const fresh=observation?.checkedAt!=null&&now-observation.checkedAt<200000;
 return Response.json({ok:true,asset:'GOLD',
  status:fresh?'OBSERVING':'STALE_OR_STARTING',
  brokerDom:getMt5GoldDomReading(now),
  updatedAt:now,storage:text?text===null?'NONE':(await readFile(paths[0]))?'VOLUME':'EPHEMERAL':'NONE',
  radar:fresh?observation:{ready:false,phase:'UNAVAILABLE',
    label:'الذهب: تجهيز',reason:'بيانات الرادار غير حديثة'},
  ...goldRadarScore(ledger),recent:ledger.events.slice(-6).reverse().map(e=>({
    at:e.at,source:e.source,side:e.side,label:e.reason,
    m1:e.m1.status,m15:e.m15.status}))},
  {headers:{'Cache-Control':'no-store, private'}});
}
