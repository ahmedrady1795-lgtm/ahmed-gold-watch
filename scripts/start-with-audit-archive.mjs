import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {ARCHIVE_URL,cleanArchive,restoredState} from './sniper-archive.mjs';
try{
  const response=await fetch(ARCHIVE_URL+'?restore='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw Error('Archive HTTP '+response.status);
  const text=await response.text();if(text.length>12_000_000)throw Error('Archive too large');
  const archive=cleanArchive(JSON.parse(text)),restored=restoredState(archive);
  // Only initialize missing ephemeral storage; never replace an existing local ledger.
  const files=['/data/predator-sniper-audit-v1.json','/tmp/predator-sniper-audit-v1.json'];
  const exists=await Promise.all(files.map(f=>fs.access(f).then(()=>true,()=>false)));
  if(!exists.some(Boolean)){
    const dataExists=await fs.access('/data').then(()=>true,()=>false);
    await fs.writeFile(files[dataExists?0:1],JSON.stringify(restored),{flag:'wx',mode:0o600});
  }
  await fs.writeFile('/tmp/sniper-archive-checkpoint.json',JSON.stringify({savedAt:archive.savedAt,records:archive.records.length,restoredAt:Date.now()}));
  console.info('[SNIPER-ARCHIVE] Restored checkpoint',archive.savedAt,'records',archive.records.length);
}catch(e){console.warn('[SNIPER-ARCHIVE] Restore unavailable:',e.message);}
const child=spawn('npm',['start'],{stdio:'inherit',env:process.env});
// Nonblocking post-startup Spot proof. This also warms the market-data
// cache before a user opens /spot and reports the actual failing stage.
void (async()=>{
  const port=Number(process.env.PORT)||3000;
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<12;i++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    try{
      const ready=await fetch(base+'/api/live',{signal:AbortSignal.timeout(3000)});
      if(!ready.ok)continue;
      const r=await fetch(base+'/api/spot-radar',
        {signal:AbortSignal.timeout(58000),cache:'no-store'});
      const j=await r.json().catch(()=>null);
      console.info('[SPOT-RADAR-STARTUP]',JSON.stringify({
        httpStatus:r.status,ok:Boolean(j?.ok),source:j?.source??null,
        scanned:j?.scanned??0,candidates:j?.candidates?.length??0,
        detail:j?.detail??null,gateway:j?.gateway??null,
        failedStage:j?.failedStage??null
      }));
      return;
    }catch(e){
      if(i===11)console.warn('[SPOT-RADAR-STARTUP] Probe unavailable:',
        String(e instanceof Error?e.message:e).slice(0,220));
    }
  }
})();

const radar=spawn('node',['scripts/radar-shadow-worker.mjs'],{
 stdio:'inherit',env:process.env
});
radar.on('error',e=>console.warn('[RADAR-SHADOW] recorder unavailable',e.message));
radar.on('exit',(code,signal)=>{
 if(code!==0&&!signal)console.warn('[RADAR-SHADOW] recorder stopped',code);
});
const goldRadar=spawn('node',['scripts/gold-radar-worker.mjs'],{
 stdio:'inherit',env:process.env
});
goldRadar.on('error',e=>console.warn('[GOLD-RADAR] worker unavailable',e.message));
goldRadar.on('exit',(code,signal)=>{
 if(code!==0&&!signal)console.warn('[GOLD-RADAR] recorder stopped',code);
});
const preparation=spawn('node',['scripts/gold-preparation-worker.mjs'],{
 stdio:'inherit',env:process.env
});
preparation.on('error',e=>console.warn('[GOLD-PREPARATION] worker unavailable',e.message));
preparation.on('exit',(code,signal)=>{
 if(code!==0&&!signal)console.warn('[GOLD-PREPARATION] worker stopped',code);
});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 child.kill(signal);radar.kill(signal);goldRadar.kill(signal);preparation.kill(signal);
});
child.on('exit',(code,signal)=>{
 radar.kill('SIGTERM');goldRadar.kill('SIGTERM');preparation.kill('SIGTERM');
 process.exitCode=code??(signal?1:0);
});
