import fs from 'node:fs/promises';
import {mergeBtcMarketMemory,marketMemoryReport} from '../../../lib/gold-market-memory';
import {btcOpeningSummary,validBtcOpeningCall,type BtcOpeningRow} from '../../../lib/btc-opening-memory';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const now=Date.now();let raw:unknown=[];
 try{raw=JSON.parse(await fs.readFile('/tmp/qannas-btc-opening-memory.json','utf8'));}catch{}
 const rows=mergeBtcMarketMemory(now,raw) as BtcOpeningRow[];
 const clean=rows.map(r=>r.candidate&&(!validBtcOpeningCall(r.candidate,r.candidate.issued)||r.candidate.target!==r.target||r.candidate.source!==r.source||r.candidate.issued!==r.observedAt)?
   {...r,candidate:undefined,published:false}:r);
 const headers={'Cache-Control':'private, no-store'};
 if(new URL(request.url).searchParams.get('archive')==='1')return Response.json({schema:'btc-opening-memory-v1',rows:clean},{headers});
 return Response.json({...btcOpeningSummary(clean,now),marketMemory:marketMemoryReport(clean)},{headers});
}
