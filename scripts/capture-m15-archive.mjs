/** GitHub Actions only: public OHLC archive collector for Sniper M15.
 * No credential is sent to the trading service. Historical provider changes
 * are split into separate ledgers; fake COMEX-XAU spot never gets archived.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
const period=900000,endpoint='https://ahmed-gold-watch-free.onrender.com/api/chart-history';
const safe=(a,source)=>typeof source==='string'&&source.length<150&&
  (a==='GOLD'?/^(Biquote · MT5 XAUUSD candles|Twelve Data · XAU\/USD|Massive · C:XAUUSD|Exness\/MT5 · XAUUSD[a-z0-9._-]*)$/i.test(source):
   source.trim().length>6&&!/proxy|comex|futures|synthetic/i.test(source));
export function bars(raw,now){
 if(!Array.isArray(raw))return [];
 const map=new Map();
 for(const b of raw){
  if(!b||![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||
   b.time%period!==0||b.time+period>now||b.time<now-12*365*86400000||
   b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))continue;
  map.set(b.time,{time:b.time,open:b.open,high:b.high,low:b.low,
    close:b.close,volume:Number.isFinite(b.volume)?Math.max(0,b.volume):0});
 }
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
export function append(ledger,asset,source,incoming,now){
 if(!safe(asset,source))throw Error('provider_is_not_spot_or_verified');
 const rows=bars(incoming,now);
 if(rows.length<12)throw Error('not_enough_closed_m15');
 const old=ledger?.schema==='qannas-m15-v1'&&ledger.asset===asset?ledger:null;
 const feeds=Array.isArray(old?.feeds)?old.feeds.filter(x=>safe(asset,x.source))
   .slice(-6).map(x=>({...x,bars:bars(x.bars,now).slice(-18000)})):[];
 let feed=feeds.find(x=>x.source===source);
 if(!feed){feed={source,updatedAt:now,bars:rows};feeds.push(feed);
   return {ledger:{schema:'qannas-m15-v1',asset,savedAt:now,feeds},added:rows.length};}
 const map=new Map(feed.bars.map(b=>[b.time,b]));
 let added=0;
 for(const b of rows){
  const old=map.get(b.time);
  if(old){
   const tol=Math.max(b.close*.000015,.02);
   for(const col of ['open','close','high','low'])
    if(Math.abs(b[col]-old[col])>tol)throw Error('provider_revised_'+col+'_at_'+b.time);
  }else {map.set(b.time,b);added++;}
 }
 feed.bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-18000);
 feed.updatedAt=now;
 return {ledger:{schema:'qannas-m15-v1',asset,savedAt:now,feeds},added};
}
async function main(){
 const response=await fetch(endpoint+'?archive='+Date.now(),{cache:'no-store',
   signal:AbortSignal.timeout(30000),headers:{'Accept':'application/json'}});
 if(!response.ok)throw Error('market_feed_http_'+response.status);
 const body=await response.json(),now=Date.now();
 let successful=0;
 for(const [asset,key] of [['GOLD','gold'],['BTC','bitcoin']]){
  const data=body[key],source=data?.candleSource;
  if(!safe(asset,source)){
   console.info('[M15-ARCHIVE]',asset,'skipped source',String(source).slice(0,90));continue;
  }
  const dest=path.join('archive','m15-'+asset+'.json');
  const incoming=data?.chartHigherFrames?.m15;
  let previous=null;
  try{previous=JSON.parse(await fs.readFile(dest,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
  try{
   const {ledger,added}=append(previous,asset,source,incoming,now);
   await fs.mkdir('archive',{recursive:true});
   if(added)await fs.writeFile(dest,JSON.stringify(ledger)+'\n','utf8');
   successful++;
   const matched=ledger.feeds.find(x=>x.source===source);
   console.info('[M15-ARCHIVE]',asset,source,'added',added,
     'source-bars',matched.bars.length);
  }catch(e){console.warn('[M15-ARCHIVE]',asset,'not stored',e.message);}
 }
 if(!successful)throw Error('no_verified_market_source_saved');
}
if(process.argv[1]&&url.pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{console.error('[M15-ARCHIVE]',e.message);process.exitCode=1});
}
