import {cleanScalpResearch,mergeScalpResearch} from './scalp-research-archive.mjs';
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
if(repo!=='ahmedrady1795-lgtm/ahmed-gold-watch'||!token)
 throw Error('Research checkpoint requires repository Actions token');
const endpoint='https://ahmed-gold-watch-free.onrender.com/api/scalp-research';
// This endpoint is read-only. An idle Render worker must not invent or
// backfill a winning historical signal just to satisfy an archive job.
let live;
for(let i=0;i<2;i++){
 try{
  const r=await fetch(endpoint,{signal:AbortSignal.timeout(50000),
   headers:{'Cache-Control':'no-cache','User-Agent':'Qannas-M1-Checkpoint/1.0'}});
  if(!r.ok)throw Error('Live research HTTP '+r.status);
  const body=await r.text();
  if(body.length>2_700_000)throw Error('Live research exceeds size limit');
  live=cleanScalpResearch(JSON.parse(body));
  break;
 }catch(e){
  if(i===1)throw e;
 }
}
if(!live.records.length&&!live.earlyObservations.length&&
   !live.goldEarlyObservations.length){
 console.info('No live M1 research observations: previous archive left unchanged');
 process.exit(0);
}
const api='https://api.github.com/repos/'+repo+
 '/contents/data/scalp-research-v1.json';
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
 'X-GitHub-Api-Version':'2022-11-28'};
const r=await fetch(api+'?ref=sniper-audit-data',{headers,
 signal:AbortSignal.timeout(20000)});
let previous=null,sha;
if(r.ok){
 const file=await r.json();sha=file.sha;
 let bytes;
 if(file.encoding==='base64'&&file.content)
  bytes=Buffer.from(file.content,'base64').toString('utf8');
 else{
  const raw=await fetch('https://raw.githubusercontent.com/'+repo+
   '/sniper-audit-data/data/scalp-research-v1.json',{
    signal:AbortSignal.timeout(20000)});
  if(!raw.ok)throw Error('Raw prior checkpoint HTTP '+raw.status);
  bytes=await raw.text();
 }
 if(bytes.length>2_700_000)throw Error('Previous M1 archive too large');
 previous=cleanScalpResearch(JSON.parse(bytes));
}else if(r.status!==404)throw Error('Existing checkpoint HTTP '+r.status);
const merged=mergeScalpResearch(previous,live);
const updated=await fetch(api,{method:'PUT',headers:{...headers,
 'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),
 body:JSON.stringify({message:'Checkpoint frozen BTC/GOLD M1 paper observations',
  branch:'sniper-audit-data',...(sha?{sha}:{}),
  content:Buffer.from(JSON.stringify(merged)).toString('base64')})});
if(!updated.ok)throw Error('Checkpoint write HTTP '+updated.status);
console.info('M1 research archived',merged.records.filter(r=>r.asset==='BTC').length,
 'BTC',merged.records.filter(r=>r.asset==='GOLD').length,'GOLD',
 'BTC early flow',merged.earlyObservations.length,'GOLD early flow',
 merged.goldEarlyObservations.length,'paper-only outcomes; not broker fills');
