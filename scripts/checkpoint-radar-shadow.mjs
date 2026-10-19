import fs from 'node:fs/promises';
import {sanitizeShadowLedger,radarShadowScore,newLedger,mergeRadarShadowArchives}
 from '../lib/radar-shadow-score.ts';
/** Hourly public Coinbase paper-evidence snapshot. Runs in GitHub Actions.
 * Only merging unchanged capture facts; no fake results, PII, tokens, orders.
 */
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/radar-shadow-score?archive=1';
const backup='archive/radar-shadow.json',maxBytes=6_000_000;
async function readJson(url){
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const body=await response.text();
 if(body.length>maxBytes)throw Error('BACKUP_TOO_LARGE');
 return JSON.parse(body);
}
async function main(){
 const now=Date.now();
 let local=newLedger();
 try{local=sanitizeShadowLedger(JSON.parse(await fs.readFile(backup,'utf8')),now);}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const remote=sanitizeShadowLedger(await readJson(endpoint+'&t='+now),now);
 // A live service error never replaces the previously saved paper evidence.
 if(!remote.events.length){
  console.log('[RADAR-BACKUP] no new observations; retain',local.events.length);
  return;
 }
 const combined=mergeRadarShadowArchives(local,remote,now);
 const oldCount=local.events.length,newCount=combined.events.length;
 // Checkpoints are event-driven: do not commit the same records just because
 // the hourly scheduler ran at a later clock timestamp.
 const observation=(x)=>JSON.stringify(x.events.map(e=>[e.id,e.m1,e.m15]));
 if(observation(local)===observation(combined)){
   console.info('[RADAR-BACKUP] unchanged evidence',oldCount);return;
 }
 const scored=radarShadowScore(combined);
 await fs.mkdir('archive',{recursive:true});
 const payload=JSON.stringify(combined)+'\n';
 if(payload.length>maxBytes)throw Error('BACKUP_TOO_LARGE');
 const old=await fs.readFile(backup,'utf8').catch(()=>'');
 if(old===payload){console.log('[RADAR-BACKUP] Unchanged');return;}
 await fs.writeFile(backup,payload);
 console.log('[RADAR-BACKUP] preserved events',oldCount,'=>',newCount,
   'M1 scored',scored.m1.samples,'M15 scored',scored.m15.samples);
}
main().catch(e=>{console.error('[RADAR-BACKUP]',e.message);process.exitCode=1});
