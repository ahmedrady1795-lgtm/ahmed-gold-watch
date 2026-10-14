import fs from 'node:fs';
import {ARCHIVE_URL,cleanArchive} from '../scripts/sniper-archive.mjs';
type Status={savedAt:number;records:number;restoredAt:number;checkedAt:number;reachable:boolean};
let cache:Status={savedAt:0,records:0,restoredAt:0,checkedAt:0,reachable:false};
let pending:Promise<Status>|null=null;
export async function sniperArchiveStatus(now=Date.now()):Promise<Status>{
  if(cache.checkedAt&&now-cache.checkedAt<60000)return cache;
  if(pending)return pending;
  pending=(async()=>{
    try{const local=JSON.parse(fs.readFileSync('/tmp/sniper-archive-checkpoint.json','utf8'));
      if(Number(local.savedAt)>cache.savedAt)cache={...cache,...local};}catch{}
    try{
      const r=await fetch(ARCHIVE_URL+'?checkpoint='+Math.floor(now/60000),{signal:AbortSignal.timeout(4000),cache:'no-store'});
      if(!r.ok)throw Error('HTTP');
      const text=await r.text();if(text.length>12_000_000)throw Error('size');
      const archive=cleanArchive(JSON.parse(text),now);
      // A delayed CDN response must never roll a verified checkpoint backwards.
      cache={...cache,...(archive.savedAt>=cache.savedAt?
        {savedAt:archive.savedAt,records:archive.records.length}:{}),checkedAt:now,reachable:true};
    }catch{cache={...cache,checkedAt:now,reachable:false};}
    return cache;
  })();
  try{return await pending;}finally{pending=null;}
}
