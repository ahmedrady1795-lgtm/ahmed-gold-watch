import fs from 'node:fs/promises';
import {validOpeningCall} from '../../../lib/gold-opening-call';

export const dynamic='force-dynamic';
export async function GET(){
 let call=null;
 const quality={issued:0,pending:0,hits:0,misses:0,flat:0,unknown:0,hitPct:null as number|null};
 try{
  const saved=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-opening.json','utf8'));
  if(validOpeningCall(saved,Date.now()))call=saved;
 }catch{}
 try{
  const rows=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-opening-audit.json','utf8'));
  const seen=new Set<number>();
  if(Array.isArray(rows))for(const row of rows.slice(-576)){
   const c=row?.call;
   if(!c||!validOpeningCall(c,c.issued)||seen.has(c.target))continue;
   if(!['PENDING','HIT','MISS','FLAT','UNKNOWN'].includes(row.outcome))continue;
   seen.add(c.target);quality.issued++;
   if(row.outcome==='PENDING')quality.pending++;
   else if(row.outcome==='HIT')quality.hits++;
   else if(row.outcome==='MISS')quality.misses++;
   else if(row.outcome==='FLAT')quality.flat++;
   else quality.unknown++;
  }
  const n=quality.hits+quality.misses;
  if(n)quality.hitPct=100*quality.hits/n;
 }catch{}
 return Response.json({call,quality,storage:'TEMPORARY',scope:'M5_DIRECTION_NOT_TRADE_PROFIT'},{headers:{'Cache-Control':'private, no-store'}});
}
