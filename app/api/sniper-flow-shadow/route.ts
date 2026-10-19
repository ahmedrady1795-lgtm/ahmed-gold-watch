import fs from 'node:fs/promises';
import {emptyFlowLedger,validateFlowLedger,flowScorecard}
 from '../../../lib/order-flow-shadow-evaluation.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const source='/tmp/qannas-flow-shadow-v1.json';
export async function GET(request:Request){
 const now=Date.now(),exportAll=new URL(request.url).searchParams.get('archive')==='1';
 try{
  const raw=await fs.readFile(source,'utf8');
  if(raw.length>7_000_000)throw Error('size');
  const ledger=validateFlowLedger(JSON.parse(raw),now);
  if(exportAll)return Response.json(ledger,{headers:{'Cache-Control':'no-store'}});
  return Response.json({ok:true,status:ledger.records.length?'COLLECTING':'NO_EVENTS',
    updatedAt:ledger.updatedAt,source:ledger.source,
    warning:'Observations collected only while the Render worker is awake and connected. Missing horizons are unobserved, not losses or wins.',
    scorecard:flowScorecard(ledger),
    recent:ledger.records.slice(-7).map(r=>({id:r.id,phase:r.phase,
      at:r.at,side:r.side,results:r.results.map(x=>({horizonMs:x.horizonMs,status:x.status}))}))
   },{headers:{'Cache-Control':'private, no-store'}});
 }catch{
  const empty=emptyFlowLedger(now);
  return Response.json({ok:false,status:'NOT_COLLECTING',
   source:empty.source,scorecard:flowScorecard(empty),
   warning:'Flow observer has no saved genuine events; no success rate is available.'
  },{headers:{'Cache-Control':'private, no-store'}});
 }
}
