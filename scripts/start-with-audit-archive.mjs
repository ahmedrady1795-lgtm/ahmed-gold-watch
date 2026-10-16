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
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
