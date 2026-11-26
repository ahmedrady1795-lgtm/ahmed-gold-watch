import fs from 'node:fs/promises';
import {validOpeningCall,GOLD_OPENING_VERSION} from '../../../lib/gold-opening-call';
import {mergeOpeningAudit,openingScore} from '../../../lib/gold-opening-audit';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 const now=Date.now(),headers={'Cache-Control':'private, no-store'};
 let call=null,raw=[],withheldRaw=[];
 try{
   const saved=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-opening.json','utf8'));
   if(validOpeningCall(saved,now))call=saved;
 }catch{}
 try{raw=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-opening-audit.json','utf8'));}catch{}
 try{withheldRaw=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-withheld-audit.json','utf8'));}catch{}
 const rows=mergeOpeningAudit(now,raw),withheld=mergeOpeningAudit(now,withheldRaw);
 if(new URL(request.url).searchParams.get('archive')==='1')
   return Response.json({schema:'gold-opening-audit-v1',rows,withheldAudit:withheld},{headers});
 const isPreparation=(r:typeof rows[number])=>r.call.reason.startsWith('تحضير قبل الكسر');
 return Response.json({call,recent:rows.slice(-36),quality:openingScore(rows),
   byMethod:{preparation:openingScore(rows.filter(isPreparation)),continuation:openingScore(rows.filter(r=>!isPreparation(r)))},
   currentVersion:GOLD_OPENING_VERSION,currentVersionQuality:openingScore(rows.filter(r=>r.call.version===GOLD_OPENING_VERSION)),
   withheldResearch:{quality:openingScore(withheld),currentVersionQuality:openingScore(withheld.filter(r=>r.call.version===GOLD_OPENING_VERSION)),scope:'RESEARCH_ONLY_NOT_SIGNALS'},
   retention:576,scope:'M5_DIRECTION_NOT_TRADE_PROFIT'},{headers});
}
