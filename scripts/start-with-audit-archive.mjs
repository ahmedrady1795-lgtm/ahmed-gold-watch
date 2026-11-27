import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {renderFreeEcoEnabled} from '../lib/render-free-eco.ts';
import {ARCHIVE_URL,cleanArchive,restoredState} from './sniper-archive.mjs';
import {SCALP_RESEARCH_URL,restoredScalpResearch,
 restoredBtcEarlyForward,restoredGoldEarlyForward} from './scalp-research-archive.mjs';
// Both GitHub checkpoints are independent. Fetch them concurrently BEFORE
// Next.js/sidecar workers start, preserving restore-first safety without
// paying two consecutive network timeouts on every Render Free cold boot.
const restoreSniperArchive=async()=>{
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
};
// Render Free has no persistent disk by default. Restore the external
// forward-research checkpoint BEFORE both the dashboard and AI workers start.
// Never revive stale LIMIT orders; pending observations become UNKNOWN.
const restoreScalpArchive=async()=>{
try{
 const response=await fetch(SCALP_RESEARCH_URL+'?restore='+Date.now(),{
  cache:'no-store',signal:AbortSignal.timeout(8500)});
 if(!response.ok)throw Error('M1 checkpoint HTTP '+response.status);
 const payload=await response.text();
 if(payload.length>2_700_000)throw Error('M1 checkpoint is unexpectedly large');
 const archive=JSON.parse(payload);
 for(const asset of ['GOLD','BTC']){
  const local=asset==='GOLD'?
   ['/data/scalp-every-m1-v1.json','/tmp/scalp-every-m1-v1.json']:
   ['/data/scalp-every-m1-btc-v1.json','/tmp/scalp-every-m1-btc-v1.json'];
  const exists=await Promise.all(local.map(p=>fs.access(p).then(()=>true,()=>false)));
  if(exists.some(Boolean))continue;
  const restored=restoredScalpResearch(archive,asset);
  if(!restored.history.length)continue;
  await fs.writeFile(local[1],JSON.stringify(restored),{flag:'wx',mode:0o600});
  console.info('[M1-RESEARCH] Restored',asset,restored.history.length,
   'paper-only observations; old pending outcomes are UNKNOWN');
 }
 const early=restoredBtcEarlyForward(archive);
 const goldEarly=restoredGoldEarlyForward(archive);
 const earlyRows=early.lanes.BTC_EARLY_M1.history;
 const goldEarlyRows=goldEarly.lanes.GOLD_EARLY_M1.history;
 const earlyPaths=['/data/scalp-lead-audit-v1.json','/tmp/scalp-lead-audit-v1.json'];
 const earlyExists=await Promise.all(earlyPaths.map(p=>fs.access(p).then(()=>true,()=>false)));
 if(!earlyExists.some(Boolean)&&(earlyRows.length||goldEarlyRows.length)){
  // The lead audit's loader fills missing GOLD lanes with an empty state.
  // No old BTC limit or observer may be reactivated from GitHub history.
  await fs.writeFile(earlyPaths[1],JSON.stringify({version:1,lanes:{...early.lanes,...goldEarly.lanes}}),
    {flag:'wx',mode:0o600});
  console.info('[GOLD/BTC-EARLY] Restored',goldEarlyRows.length,'GOLD,',earlyRows.length,'BTC',
   'frozen forward observations; incomplete windows marked UNKNOWN');
 }
}catch(e){console.warn('[M1-RESEARCH] External checkpoint unavailable:',
 String(e instanceof Error?e.message:e).slice(0,180));}
};
await Promise.all([restoreSniperArchive(),restoreScalpArchive()]);
const child=spawn('npm',['start'],{stdio:'inherit',env:process.env});
// Nonblocking post-startup Spot proof. This also warms the market-data
// cache before a user opens /spot and reports the actual failing stage.
void (async()=>{
  // Real viewers load Spot directly; never force an unused market-wide
  // Binance scan on every cold-start of the free service.
  if(renderFreeEcoEnabled())return;
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
const btcOpening=spawn('node',['scripts/btc-opening-worker.mjs'],{stdio:'inherit',env:process.env});
btcOpening.on('error',e=>console.warn('[BTC-M5-OPEN] worker unavailable',e.message));
btcOpening.on('exit',(code,signal)=>{if(code!==0&&!signal)console.warn('[BTC-M5-OPEN] worker stopped',code);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 child.kill(signal);radar.kill(signal);goldRadar.kill(signal);preparation.kill(signal);btcOpening.kill(signal);
});
child.on('exit',(code,signal)=>{
 radar.kill('SIGTERM');goldRadar.kill('SIGTERM');preparation.kill('SIGTERM');btcOpening.kill('SIGTERM');
 process.exitCode=code??(signal?1:0);
});
