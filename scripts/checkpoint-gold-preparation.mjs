import {mergeOpeningAudit} from '../lib/gold-opening-audit.ts';
import {mergeMarketMemory,mergeBtcMarketMemory} from '../lib/gold-market-memory.ts';
import fs from 'node:fs/promises';
import {emptyGoldLeadLedger,safeGoldLeadLedger,mergeGoldLeadLedger,goldLeadScore}
 from '../lib/gold-preparation-lead.ts';
const path='archive/gold-preparation-lead.json',max=6000000;
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/gold-radar?leadArchive=1';
async function main(){
 const now=Date.now();let local=emptyGoldLeadLedger(),savedRows=[],savedWithheld=[],savedMemory=[],savedBtcMemory=[];
 try{const saved=JSON.parse(await fs.readFile(path,'utf8'));local=safeGoldLeadLedger(saved,now);savedRows=mergeOpeningAudit(now,saved.openingAudit);savedWithheld=mergeOpeningAudit(now,saved.withheldAudit);savedMemory=mergeMarketMemory(now,saved.marketMemory);savedBtcMemory=mergeBtcMarketMemory(now,saved.btcMarketMemory);}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(endpoint+'&t='+now,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('preparation_http_'+response.status);
 const text=await response.text();if(text.length>max)throw Error('preparation_archive_too_large');
 const raw=JSON.parse(text);
 if(raw?.schema!=='gold-preparation-lead-v1')throw Error('preparation_archive_wrong_schema');
 const remote=safeGoldLeadLedger(raw,now);
 const merged=mergeGoldLeadLedger(local,remote,now);
 let openingAudit=savedRows,withheldAudit=savedWithheld,marketMemory=savedMemory,btcMarketMemory=savedBtcMemory;
 try{
   const res=await fetch(new URL('/api/gold-opening?archive=1',endpoint),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('opening_http_'+res.status);
   const packet=await res.json();
   if(packet.schema!=='gold-opening-audit-v1')throw Error('opening_schema');
   openingAudit=mergeOpeningAudit(Date.now(),savedRows,packet.rows);
   withheldAudit=mergeOpeningAudit(Date.now(),savedWithheld,packet.withheldAudit);
   marketMemory=mergeMarketMemory(Date.now(),savedMemory,packet.marketMemory);
 }catch(e){console.warn('[GOLD-OPENING-BACKUP]',e.message);}
 try{
   const res=await fetch(new URL('/api/btc-opening?archive=1',endpoint),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('btc_memory_http_'+res.status);
   const packet=await res.json();
   if(packet.schema!=='btc-opening-memory-v1')throw Error('btc_memory_schema');
   btcMarketMemory=mergeBtcMarketMemory(Date.now(),savedBtcMemory,packet.rows);
 }catch(e){console.warn('[BTC-OPENING-BACKUP]',e.message);}
 if(JSON.stringify(local.events)===JSON.stringify(merged.events)&&JSON.stringify(savedRows)===JSON.stringify(openingAudit)&&JSON.stringify(savedWithheld)===JSON.stringify(withheldAudit)&&JSON.stringify(savedMemory)===JSON.stringify(marketMemory)&&JSON.stringify(savedBtcMemory)===JSON.stringify(btcMarketMemory))return;
 const content=JSON.stringify({...merged,openingAudit,withheldAudit,marketMemory,btcMarketMemory})+'\n';if(content.length>max)throw Error('preparation_archive_too_large');
 await fs.mkdir('archive',{recursive:true});await fs.writeFile(path,content);
 const score=goldLeadScore(merged);
 console.log('[GOLD-PREPARATION-BACKUP]',score.events,'alerts',score.evaluated,'resolved',score.excluded,'excluded');
}
main().catch(e=>{console.error('[GOLD-PREPARATION-BACKUP]',e.message);process.exitCode=1;});
