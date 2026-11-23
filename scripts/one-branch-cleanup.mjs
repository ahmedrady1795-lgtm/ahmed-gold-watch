/**
 * One-time branch consolidation. Never invoke outside GitHub Actions.
 * User requested only render-free. Requires:
 *  - render-free is GitHub default branch (admin-set separately)
 *  - verified complete Git bundle uploaded as an Actions artifact
 *  - both checkpoint datasets moved to render-free
 * No live trading code or Render deployment is changed by this script.
 */
const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(repo!=='ahmedrady1795-lgtm/ahmed-gold-watch'||
   !token||process.env.QANNAS_BRANCH_CLEANUP_BUNDLE_VERIFIED!=='yes')
 throw Error('Denied: expected repository, token and verified bundle');
const headers={
 Authorization:'Bearer '+token,
 Accept:'application/vnd.github+json',
 'X-GitHub-Api-Version':'2022-11-28'
};
async function api(path,method='GET',optional=false){
 const r=await fetch('https://api.github.com/'+path,{method,headers,
   signal:AbortSignal.timeout(30000)});
 if(optional&&r.status===404)return null;
 if(!r.ok){
   const body=await r.text().catch(()=>null);
   throw Error(method+' '+path+' HTTP '+r.status+' '+String(body).slice(0,150));
 }
 if(r.status===204)return null;
 return r.json();
}
const metadata=await api('repos/'+repo);
if(metadata.default_branch!=='render-free')
 throw Error('Not deleting: default branch is '+metadata.default_branch);
async function checkpoint(path,branch,optional=false){
 const file=await api('repos/'+repo+'/contents/'+path+
  '?ref='+encodeURIComponent(branch),'GET',optional);
 if(!file)return null;
 if(file.encoding!=='base64'||typeof file.content!=='string')
  throw Error('Checkpoint not ordinary JSON: '+path+' '+branch);
 const data=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
 if(data.schema!==1||!Number.isSafeInteger(data.savedAt)||!Array.isArray(data.records))
  throw Error('Invalid checkpoint schema: '+path+' '+branch);
 return data;
}
for(const path of ['data/sniper-audit.json','data/scalp-research-v1.json']){
 const current=await checkpoint(path,'render-free');
 const legacy=await checkpoint(path,'sniper-audit-data',true);
 if(legacy&&legacy.savedAt>current.savedAt)
  throw Error('Legacy checkpoint is newer: '+path+'; sync it before deleting any branch');
 console.log('Preserved',path,'records',current.records.length,'savedAt',current.savedAt);
}
const branches=[];
for(let page=1;page<=10;page++){
 const batch=await api('repos/'+repo+'/branches?per_page=100&page='+page);
 branches.push(...batch);
 if(batch.length<100)break;
}
if(branches.length<2||branches.length>400)
 throw Error('Unexpected branch inventory '+branches.length);
const archived=Number(process.env.QANNAS_ARCHIVED_REF_COUNT);
if(!Number.isSafeInteger(archived)||archived<branches.length-1)
 throw Error('Git bundle missing some remote refs: '+archived+' vs '+branches.length);
const candidate=branches.filter(b=>b.name!=='render-free');
console.log('Verified bundle refs',archived,'branches to delete',candidate.length);
let done=0;
const failures=[];
for(const b of candidate){
 if(b.protected){failures.push(b.name+' (protected)');continue;}
 const suffix=b.name.split('/').map(encodeURIComponent).join('/');
 const refPath='repos/'+repo+'/git/ref/heads/'+suffix;
 const deletePath='repos/'+repo+'/git/refs/heads/'+suffix;
 try{
   const ref=await api(refPath);
   if(ref?.object?.sha!==b.commit.sha){
     failures.push(b.name+' (head changed since inventory)');
     continue;
   }
   await api(deletePath,'DELETE');
   done++;
   console.log('Deleted',done+'/'+candidate.length,b.name);
 }catch(e){
   failures.push(b.name+' ('+String(e instanceof Error?e.message:e).slice(0,160)+')');
 }
}
const remaining=[];
for(let page=1;page<=10;page++){
 const batch=await api('repos/'+repo+'/branches?per_page=100&page='+page);
 remaining.push(...batch.map(x=>x.name));
 if(batch.length<100)break;
}
console.log('Final branches:',remaining.join(', '));
if(failures.length||remaining.length!==1||remaining[0]!=='render-free'){
 console.error('Unremoved branches',JSON.stringify(failures));
 throw Error('Branch consolidation incomplete. Original git bundle was uploaded first.');
}
console.log('SUCCESS: only render-free remains; no bot or live trading changed');
