import {validOpeningCall,type GoldOpeningCall} from './gold-opening-call.ts';

type Outcome='PENDING'|'HIT'|'MISS'|'FLAT'|'UNKNOWN';
type Row={call:GoldOpeningCall;outcome:Outcome;open?:number;close?:number;settledAt?:number};
export function mergeOpeningAudit(now:number,...sources:unknown[]):Row[]{
 const rows=new Map<number,Row>();
 for(const source of sources){
   if(!Array.isArray(source))continue;
   for(const row of source.slice(-576)){
     const c=row?.call;
     if(!validOpeningCall(c,c?.issued)||c.issued>now||!['PENDING','UNKNOWN','HIT','MISS','FLAT'].includes(row.outcome))continue;
     if(row.outcome!=='PENDING'){
       if(!Number.isSafeInteger(row.settledAt)||row.settledAt<c.target+300000||row.settledAt>now)continue;
       if(row.outcome!=='UNKNOWN'){
         if(![row.open,row.close].every(n=>Number.isFinite(n)&&n>0))continue;
         const move=(row.close-row.open)*(c.side==='BUY'?1:-1);
         if(row.outcome!==(move>0?'HIT':move<0?'MISS':'FLAT'))continue;
       }
     }
     const prev=rows.get(c.target);
     if(prev&&(prev.call.issued!==c.issued||prev.call.source!==c.source||
       prev.call.side!==c.side||prev.call.priceAt!==c.priceAt||prev.outcome!=='PENDING'))continue;
     rows.set(c.target,prev?{...row,call:prev.call}:row);
   }
 }
 return [...rows.values()].sort((a,b)=>a.call.target-b.call.target).slice(-576);
}
export function openingScore(rows:Row[]){
 const quality={issued:rows.length,pending:0,hits:0,misses:0,flat:0,unknown:0,hitPct:null as number|null};
 for(const row of rows){
   const key=({PENDING:'pending',HIT:'hits',MISS:'misses',FLAT:'flat',UNKNOWN:'unknown'} as const)[row.outcome];
   quality[key]++;
 }
 const n=quality.hits+quality.misses;
 if(n)quality.hitPct=100*quality.hits/n;
 return quality;
}


/** Settle frozen research and displayed forecasts identically, without
 * mixing their ledgers or inventing an outcome when the feed is missing. */
export function settleOpeningAudit(rows:Row[],now:number,source:string,bars:readonly any[]):Row[]{
 const map=new Map<number,any>();
 for(const b of bars){
   if(b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
      b.time%60000===0&&b.time+60000<=now-3000&&b.low>0&&
      b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))map.set(b.time,b);
 }
 return rows.map(e=>{
   if(e.outcome!=='PENDING'||now<e.call.target+303000)return e;
   const c=e.call;
   const window=Array.from({length:5},(_,i)=>map.get(c.target+i*60000));
   if(source!==c.source||window.some(b=>!b))return now>=c.target+900000?{...e,outcome:'UNKNOWN',settledAt:now}:e;
   const open=window[0].open,close=window[4].close,move=(close-open)*(c.side==='BUY'?1:-1);
   return {...e,outcome:move===0?'FLAT':move>0?'HIT':'MISS',open,close,settledAt:now};
 });
}
