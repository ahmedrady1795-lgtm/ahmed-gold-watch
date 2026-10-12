import {promises as fs} from 'node:fs';
import path from 'node:path';
import {promises as dns} from 'node:dns';
import net from 'node:net';

type Asset='GOLD'|'BTC';
type ToolName='WEB_FETCH'|'WEB_SEARCH_RSS'|'STATE_READ'|'CODE_WRITE'|'GITHUB_POLICY_WRITE';
type ToolUse={tool:ToolName;ok:boolean;target:string;at:number;detail:string};
export type AutonomousToolCycle={
  ok:boolean;checkedAt:number;asset:Asset;
  capabilities:{
    publicWeb:boolean;stateRead:boolean;codeWrite:boolean;runtimePromotion:boolean;
    githubPolicyWrite:boolean;githubCredentialPresent:boolean;
  };
  tools:ToolUse[];
  research:{query:string;items:{title:string;link:string|null;publishedAt:number|null}[];summary:string[]};
  storage:string|null;
};

const ROOT=process.env.RAILWAY_VOLUME_MOUNT_PATH||'/data';
const DIR=path.join(ROOT,'autonomous-tools');
const cache=new Map<Asset,{at:number;value:AutonomousToolCycle}>();
const CACHE_MS=5*60*1000;
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function enabled(name:string,def=true){
  const v=String(process.env[name]??(def?'1':'0')).toLowerCase();
  return !['0','false','off','no'].includes(v);
}
function privateIp(ip:string){
  if(net.isIPv4(ip)){
    const [a,b]=ip.split('.').map(Number);
    return a===10||a===127||a===0||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224;
  }
  const x=ip.toLowerCase();
  return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:')||x.startsWith('::ffff:127.')||x.startsWith('::ffff:10.')||x.startsWith('::ffff:192.168.');
}
async function validatePublicUrl(raw:string){
  const u=new URL(raw);
  if(!['https:','http:'].includes(u.protocol))throw new Error('unsupported_protocol');
  if(u.username||u.password)throw new Error('embedded_credentials_blocked');
  const h=u.hostname.toLowerCase();
  if(!h||h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h==='0.0.0.0')throw new Error('private_host_blocked');
  if(net.isIP(h)){
    if(privateIp(h))throw new Error('private_ip_blocked');
  }else{
    const rows=await dns.lookup(h,{all:true,verbatim:true});
    if(!rows.length||rows.some(x=>privateIp(x.address)))throw new Error('private_resolution_blocked');
  }
  return u;
}
function stripHtml(v:string){
  return String(v||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<!\[CDATA\[|\]\]>/g,'')
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim();
}
async function publicFetchText(raw:string){
  let current=await validatePublicUrl(raw);
  for(let i=0;i<4;i++){
    const r=await fetch(current,{redirect:'manual',cache:'no-store',headers:{'User-Agent':'PredatorAutonomousResearch/1.0'},signal:AbortSignal.timeout(7000)});
    if(r.status>=300&&r.status<400){
      const loc=r.headers.get('location');if(!loc)throw new Error('redirect_without_location');
      current=await validatePublicUrl(new URL(loc,current).toString());continue;
    }
    if(!r.ok)throw new Error('HTTP_'+r.status);
    const type=String(r.headers.get('content-type')||'');
    if(!/text|json|xml|rss|atom/i.test(type))throw new Error('unsupported_content_type');
    const reader=r.body?.getReader();if(!reader)return '';
    const chunks:Uint8Array[]=[];let total=0;
    while(true){
      const {done,value}=await reader.read();if(done)break;
      if(value){total+=value.byteLength;if(total>800_000)break;chunks.push(value);}
    }
    const all=new Uint8Array(chunks.reduce((n,c)=>n+c.byteLength,0));let off=0;
    for(const c of chunks){all.set(c,off);off+=c.byteLength;}
    return new TextDecoder().decode(all);
  }
  throw new Error('too_many_redirects');
}
function feedItems(xml:string){
  const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,12).map(x=>x[2]);
  return blocks.map(b=>{
    const pick=(tag:string)=>{
      const m=b.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));
      return stripHtml(m?.[1]||'');
    };
    const title=pick('title');
    const rawLink=(b.match(/<link[^>]+href=["']([^"']+)["']/i)||[])[1]||pick('link')||'';
    const date=pick('pubDate')||pick('updated')||pick('published');
    const ts=Date.parse(date);
    return {title,link:rawLink||null,publishedAt:Number.isFinite(ts)?ts:null};
  }).filter(x=>x.title);
}
function queryFor(asset:Asset,context:any){
  const regime=String(context?.regime||'').replace(/_/g,' ');
  const side=String(context?.side||context?.intentSide||'').toLowerCase();
  if(asset==='GOLD')return ['gold price','Federal Reserve','inflation','US yields',regime,side].filter(Boolean).join(' ');
  return ['bitcoin','BTC','ETF','liquidations','crypto market',regime,side].filter(Boolean).join(' ');
}
async function rssSearch(asset:Asset,context:any,uses:ToolUse[]){
  const query=queryFor(asset,context);
  const url='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=en-US&gl=US&ceid=US:en';
  try{
    const xml=await publicFetchText(url),items=feedItems(xml).slice(0,8);
    uses.push({tool:'WEB_SEARCH_RSS',ok:true,target:url,at:Date.now(),detail:'items='+items.length});
    return {query,items};
  }catch(e){
    uses.push({tool:'WEB_SEARCH_RSS',ok:false,target:url,at:Date.now(),detail:e instanceof Error?e.message:String(e)});
    return {query,items:[] as {title:string;link:string|null;publishedAt:number|null}[]};
  }
}
async function writeResearch(asset:Asset,payload:any,uses:ToolUse[]){
  if(!enabled('AUTONOMOUS_CODE_WRITE',true))return null;
  try{
    await fs.mkdir(DIR,{recursive:true});
    const file=path.join(DIR,asset.toLowerCase()+'-research.json');
    const tmp=file+'.tmp';
    await fs.writeFile(tmp,JSON.stringify(payload,null,2));await fs.rename(tmp,file);
    uses.push({tool:'CODE_WRITE',ok:true,target:file,at:Date.now(),detail:'research/state persisted'});
    return file;
  }catch(e){
    uses.push({tool:'CODE_WRITE',ok:false,target:DIR,at:Date.now(),detail:e instanceof Error?e.message:String(e)});
    return null;
  }
}
async function maybeWriteGithubPolicy(asset:Asset,policy:any,uses:ToolUse[]){
  const allowed=enabled('AUTONOMOUS_PRODUCTION_SOURCE_WRITE',false);
  const token=process.env.GITHUB_TOKEN||process.env.AUTONOMOUS_GITHUB_TOKEN||'';
  const repo=process.env.AUTONOMOUS_GITHUB_REPO||'';
  const branch=process.env.AUTONOMOUS_GITHUB_BRANCH||'railway';
  if(!allowed||!token||!repo||!policy)return false;
  const target='autonomous/generated/'+asset.toLowerCase()+'-policy.json';
  try{
    const api='https://api.github.com/repos/'+repo+'/contents/'+target;
    const get=await fetch(api+'?ref='+encodeURIComponent(branch),{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'PredatorAutonomousResearch/1.0'},signal:AbortSignal.timeout(7000)});
    const old=get.ok?await get.json():null;
    const body={message:'Autonomous policy update '+asset,content:Buffer.from(JSON.stringify(policy,null,2)).toString('base64'),branch,...(old?.sha?{sha:old.sha}:{})};
    const put=await fetch(api,{method:'PUT',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'PredatorAutonomousResearch/1.0'},body:JSON.stringify(body),signal:AbortSignal.timeout(7000)});
    if(!put.ok)throw new Error('HTTP_'+put.status);
    uses.push({tool:'GITHUB_POLICY_WRITE',ok:true,target:target,at:Date.now(),detail:'policy committed'});
    return true;
  }catch(e){
    uses.push({tool:'GITHUB_POLICY_WRITE',ok:false,target:target,at:Date.now(),detail:e instanceof Error?e.message:String(e)});
    return false;
  }
}
export async function runAutonomousToolCycle(args:{asset:Asset;context?:any;policy?:any;now?:number}):Promise<AutonomousToolCycle>{
  const now=Number(args.now||Date.now()),hit=cache.get(args.asset);
  if(hit&&now-hit.at<CACHE_MS)return hit.value;
  const uses:ToolUse[]=[];
  const publicWeb=enabled('AUTONOMOUS_PUBLIC_WEB',true);
  let search={query:queryFor(args.asset,args.context),items:[] as {title:string;link:string|null;publishedAt:number|null}[]};
  if(publicWeb)search=await rssSearch(args.asset,args.context,uses);
  uses.push({tool:'STATE_READ',ok:true,target:args.asset,at:now,detail:'market/evolution context read'});
  const summary=search.items.slice(0,5).map(x=>x.title);
  const research={query:search.query,items:search.items,summary};
  const storage=await writeResearch(args.asset,{asset:args.asset,checkedAt:now,research,context:args.context||null},uses);
  await maybeWriteGithubPolicy(args.asset,args.policy,uses);
  const githubCredentialPresent=Boolean(process.env.GITHUB_TOKEN||process.env.AUTONOMOUS_GITHUB_TOKEN);
  const value:AutonomousToolCycle={
    ok:true,checkedAt:now,asset:args.asset,
    capabilities:{
      publicWeb,stateRead:true,codeWrite:enabled('AUTONOMOUS_CODE_WRITE',true),
      runtimePromotion:enabled('AUTONOMOUS_RUNTIME_PROMOTION',true),
      githubPolicyWrite:enabled('AUTONOMOUS_PRODUCTION_SOURCE_WRITE',false)&&githubCredentialPresent,
      githubCredentialPresent
    },
    tools:uses,research,storage
  };
  cache.set(args.asset,{at:now,value});return value;
}
