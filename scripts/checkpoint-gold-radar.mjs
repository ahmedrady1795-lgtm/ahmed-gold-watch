import fs from 'node:fs/promises';
import {safeGoldRadarLedger,emptyGoldLedger,mergeGoldRadarLedger,goldRadarScore}
 from '../lib/gold-radar-shadow.ts';
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/gold-radar?archive=1';
const path='archive/gold-radar-shadow.json',max=6000000;
async function main(){
 const now=Date.now();
 let current=emptyGoldLedger();
 try{current=safeGoldRadarLedger(JSON.parse(await fs.readFile(path,'utf8')),now);}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(endpoint+'&t='+now,{cache:'no-store',
  signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('gold_radar_http_'+response.status);
 const body=await response.text();
 if(body.length>max)throw Error('gold_shadow_archive_too_large');
 const remote=safeGoldRadarLedger(JSON.parse(body),now);
 if(!remote.events.length){
  console.log('[GOLD-RADAR-BACKUP] No remote signals yet, leave existing archive');
  return;
 }
 const merged=mergeGoldRadarLedger(current,remote,now);
 const identity=x=>JSON.stringify(x.events.map(e=>[e.id,e.price,e.m1,e.m15]));
 if(identity(current)===identity(merged)){
  console.log('[GOLD-RADAR-BACKUP] Same signals, no commit');return;
 }
 await fs.mkdir('archive',{recursive:true});
 const content=JSON.stringify(merged)+'\n';
 if(content.length>max)throw Error('gold_shadow_archive_too_large');
 await fs.writeFile(path,content);
 const score=goldRadarScore(merged);
 console.log('[GOLD-RADAR-BACKUP]',score.events,'signals',
   'M1',score.m1.scored,'M15',score.m15.scored);
}
main().catch(e=>{console.error('[GOLD-RADAR-BACKUP]',e.message);process.exitCode=1;});
