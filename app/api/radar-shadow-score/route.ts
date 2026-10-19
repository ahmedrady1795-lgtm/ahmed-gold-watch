import fs from 'node:fs/promises';
import {radarShadowScore,sanitizeShadowLedger}
 from '../../../lib/radar-shadow-score';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const paths=['/data/qannas-radar-shadow-v1.json','/tmp/qannas-radar-shadow-v1.json'];
export async function GET(request:Request){
 try{
  let raw:string|null=null,storage='NOT_RUNNING';
  for(const path of paths){
   try{raw=await fs.readFile(path,'utf8');storage=path.startsWith('/data/')?
     'PERSISTENT_VOLUME':'EPHEMERAL_FILE';break;}catch{}
  }
  if(!raw)return Response.json({ok:true,status:'NOT_COLLECTING',
   storage:'NONE',modelQualified:false,tradingEnabled:false,
   reason:'خادم رصد Coinbase لم يحفظ إشارة بعد؛ لا توجد نسبة نجاح'},{headers:{'Cache-Control':'no-store'}});
  if(raw.length>8_000_000)throw Error('ledger_too_large');
  const ledger=sanitizeShadowLedger(JSON.parse(raw),Date.now());
  if(new URL(request.url).searchParams.get('archive')==='1')
    return Response.json(ledger,{headers:{'Cache-Control':'no-store'}});
  const score=radarShadowScore(ledger);
  return Response.json({ok:true,status:'SHADOW_COLLECTING',
   storage,...score,recent:ledger.events.slice(-8).reverse().map(e=>({
    at:e.at,side:e.side,price:e.price,baseline:e.baseline,
    m1:e.m1.status,m15:e.m15.status
   }))},{headers:{'Cache-Control':'no-store, private'}});
 }catch{return Response.json({ok:false,status:'UNAVAILABLE',
   modelQualified:false,tradingEnabled:false,
   reason:'فشل قراءة سجل الرادار؛ لا تعرض نسبًا أو بيانات قديمة'},
   {status:503,headers:{'Cache-Control':'no-store'}});}
}
