/** Immutable-provider M15 candle collection.
 * Each source is kept in its OWN ledger to avoid spot/futures or venue mixing.
 */
export type StoredM15={time:number;open:number;high:number;low:number;close:number;volume?:number};
export type StoredSource={source:string;bars:StoredM15[];updatedAt:number};
export type SourceLedger={schema:'qannas-m15-v1';asset:'GOLD'|'BTC';
 feeds:StoredSource[];savedAt:number};
const P=900000;
export function validArchiveM15(raw:unknown,now:number,limit=18000):StoredM15[]{
 if(!Array.isArray(raw))return [];
 const seen=new Map<number,StoredM15>();
 for(const b of raw){
  if(!b||![b.time,b.open,b.high,b.low,b.close].every(
    v=>typeof v==='number'&&Number.isFinite(v)))continue;
  if(b.time%P||b.time+P>now||b.time<now-12*365*86400000||
     b.open<=0||b.low<=0||b.high<Math.max(b.open,b.close)||
     b.low>Math.min(b.open,b.close))continue;
  seen.set(b.time,{time:b.time,open:b.open,high:b.high,
    low:b.low,close:b.close,volume:Number.isFinite(b.volume)?Math.max(0,b.volume):0});
 }
 return [...seen.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
export function acceptedArchiveSource(asset:'GOLD'|'BTC',src:unknown){
 if(typeof src!=='string'||src.length>160)return false;
 if(asset==='GOLD')return /^Biquote · MT5 XAUUSD candles$|^Twelve Data · XAU\/USD$|^Massive · C:XAUUSD$|^Exness\/MT5 · XAUUSD[a-z0-9._-]*$/i.test(src);
 return src.trim().length>6&&!/proxy|futures|comex|simulat/i.test(src);
}
export function appendSourceM15(input:{old:unknown;asset:'GOLD'|'BTC';
 source:string;rows:unknown;now:number}):{ledger:SourceLedger;added:number;conflicts:number}{
 const {asset,source,now}=input;
 if(!acceptedArchiveSource(asset,source))throw Error('unsafe_or_proxy_source');
 const incoming=validArchiveM15(input.rows,now,2400);
 if(incoming.length<12)throw Error('insufficient_closed_source_bars');
 const old=input.old as Partial<SourceLedger>|null;
 const ledger:SourceLedger={
  schema:'qannas-m15-v1',asset,feeds:[],savedAt:now
 };
 if(old?.schema==='qannas-m15-v1'&&old.asset===asset&&
    Array.isArray(old.feeds)){
  ledger.feeds=old.feeds.filter(x=>x&&acceptedArchiveSource(asset,x.source))
    .slice(-6).map(x=>({source:x.source,updatedAt:x.updatedAt,
       bars:validArchiveM15(x.bars,now,18000)}));
 }
 const prev=ledger.feeds.find(x=>x.source===source);
 if(!prev){ledger.feeds.push({source,updatedAt:now,bars:incoming});
  return {ledger,added:incoming.length,conflicts:0};}
 const map=new Map(prev.bars.map(b=>[b.time,b]));
 let conflicts=0,added=0;
 for(const b of incoming){
  const existing=map.get(b.time);
  if(existing){
   const tolerance=Math.max(b.close*.000015,.02);
   if(Math.abs(existing.open-b.open)>tolerance||
      Math.abs(existing.close-b.close)>tolerance||
      Math.abs(existing.high-b.high)>tolerance||
      Math.abs(existing.low-b.low)>tolerance){
      conflicts++;continue;
   }
  }else{map.set(b.time,b);added++;}
 }
 // Reject the entire update if an upstream provider silently revised prices.
 if(conflicts)return {ledger:{...ledger,savedAt:old?.savedAt??now},
   added:0,conflicts};
 prev.bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-18000);
 prev.updatedAt=now;
 return {ledger,added,conflicts:0};
}
export function verifiedM15Archive(input:{ledger:unknown;asset:'GOLD'|'BTC';
 source:string;now:number;live:unknown}){
 const {ledger,asset,source,now}=input;
 const live=validArchiveM15(input.live,now,300);
 const empty=(reason:string)=>({ready:false,reason,rows:[] as StoredM15[],
  storedBars:0,years:0,source});
 const obj=ledger as SourceLedger|null;
 if(!acceptedArchiveSource(asset,source)||obj?.schema!=='qannas-m15-v1'||
   obj.asset!==asset||!Array.isArray(obj.feeds))return empty('NO_VERIFIED_ARCHIVE');
 const entry=obj.feeds.find(x=>x.source===source);
 if(!entry)return empty('NO_MATCHING_PROVIDER');
 const rows=validArchiveM15(entry.bars,now,18000);
 if(rows.length<80)return empty('NOT_ENOUGH_ARCHIVED_BARS');
 if(live.length<12)return empty('NO_FRESH_LIVE_OVERLAP');
 const lookup=new Map(rows.map(b=>[b.time,b]));
 const common=live.filter(b=>lookup.has(b.time)).slice(-20);
 // Compare at least 6 *unchanged* OHLC bars, not just current quote.
 if(common.length<6)return empty('NO_PROVIDER_OVERLAP');
 const matching=common.every(b=>{
  const old=lookup.get(b.time)!;
  const tol=Math.max(b.close*.000015,.02);
  return Math.abs(b.open-old.open)<=tol&&Math.abs(b.close-old.close)<=tol&&
   Math.abs(b.high-old.high)<=tol&&Math.abs(b.low-old.low)<=tol;
 });
 if(!matching)return empty('PROVIDER_BARS_CONFLICT');
 const spanYears=(rows.at(-1)!.time-rows[0].time)/(365.25*86400000);
 return {ready:true,reason:'VERIFIED_IDENTICAL_OHLC_SOURCE',
   rows,storedBars:rows.length,years:Math.max(0,spanYears),source};
}
