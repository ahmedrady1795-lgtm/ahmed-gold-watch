import {ARCHIVE_URL,cleanArchive,mergeArchives} from './sniper-archive.mjs';
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=='ahmedrady1795-lgtm/ahmed-gold-watch'||!process.env.GITHUB_TOKEN)throw Error('Expected repository and Actions token');
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/sniper-audit?archive=1';
const response=await fetch(endpoint,{signal:AbortSignal.timeout(45000),headers:{'Cache-Control':'no-cache'}});
if(!response.ok)throw Error('Live audit HTTP '+response.status);
const text=await response.text();if(text.length>12_000_000)throw Error('Live archive too large');
const live=cleanArchive(JSON.parse(text));
if(!live.sourceUpdatedAt||Date.now()-live.sourceUpdatedAt>10*60000)throw Error('Audit is stale; preserving previous checkpoint');
const api=`https://api.github.com/repos/${repo}/contents/data/sniper-audit.json`;
const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const existing=await fetch(api+'?ref=sniper-audit-data',{headers});
let previous=null,sha;
if(existing.ok){const file=await existing.json();sha=file.sha;
  if(file.encoding==='base64'&&file.content)previous=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
  else{const raw=await fetch(ARCHIVE_URL,{signal:AbortSignal.timeout(15000)});if(!raw.ok)throw Error('Previous archive body unavailable');previous=await raw.json();}
}
else if(existing.status!==404)throw Error('Previous archive HTTP '+existing.status);
const merged=mergeArchives(previous,live);
const saved=await fetch(api,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({message:'Checkpoint public paper-scenario audit',branch:'sniper-audit-data',sha,
    content:Buffer.from(JSON.stringify(merged)).toString('base64')})});
if(!saved.ok)throw Error('Checkpoint write HTTP '+saved.status);
console.info('Archived',merged.records.length,'paper records at',new Date(merged.savedAt).toISOString());
