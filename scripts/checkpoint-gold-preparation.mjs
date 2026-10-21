import fs from 'node:fs/promises';
import {emptyGoldLeadLedger,safeGoldLeadLedger,mergeGoldLeadLedger,goldLeadScore}
 from '../lib/gold-preparation-lead.ts';
const path='archive/gold-preparation-lead.json',max=6000000;
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/gold-radar?leadArchive=1';
async function main(){
 const now=Date.now();let local=emptyGoldLeadLedger();
 try{local=safeGoldLeadLedger(JSON.parse(await fs.readFile(path,'utf8')),now);}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(endpoint+'&t='+now,{cache:'no-store',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('preparation_http_'+response.status);
 const text=await response.text();if(text.length>max)throw Error('preparation_archive_too_large');
 const raw=JSON.parse(text);
 if(raw?.schema!=='gold-preparation-lead-v1')throw Error('preparation_archive_wrong_schema');
 const remote=safeGoldLeadLedger(raw,now);
 if(!remote.events.length){console.log('[GOLD-PREPARATION-BACKUP] No new alerts; keep existing evidence');return;}
 const merged=mergeGoldLeadLedger(local,remote,now);
 if(JSON.stringify(local.events)===JSON.stringify(merged.events))return;
 const content=JSON.stringify(merged)+'\n';if(content.length>max)throw Error('preparation_archive_too_large');
 await fs.mkdir('archive',{recursive:true});await fs.writeFile(path,content);
 const score=goldLeadScore(merged);
 console.log('[GOLD-PREPARATION-BACKUP]',score.events,'alerts',score.evaluated,'resolved',score.excluded,'excluded');
}
main().catch(e=>{console.error('[GOLD-PREPARATION-BACKUP]',e.message);process.exitCode=1;});
