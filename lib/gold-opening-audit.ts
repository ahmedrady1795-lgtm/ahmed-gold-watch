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
