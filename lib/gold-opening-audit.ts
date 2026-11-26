import {validOpeningCall,type GoldOpeningCall,type GoldRegime,type OpeningEvidence,type OpeningSide} from './gold-opening-call.ts';

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


const models=['baseline','ml','neural','flow'] as const;
type Model=typeof models[number];
const isSide=(v:unknown):v is 'BUY'|'SELL'=>v==='BUY'||v==='SELL';
const lower95=(hits:number,n:number)=>{
 if(!n)return 0;
 const p=hits/n,z=1.96;
 return (p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n);
};
function eligibleEvidence(row:Row){
 const e=row.call.evidence;
 return Boolean(e&&Number.isSafeInteger(e.recordedAt)&&e.recordedAt>=row.call.issued&&e.recordedAt<row.call.target);
}
function compareModel(rows:Row[],model:Model){
 let n=0,modelHits=0,originalHits=0,onlyModel=0,onlyOriginal=0;
 for(const r of rows){
   const s=r.call.evidence?.[model];
   if(!eligibleEvidence(r)||!isSide(s)||(r.outcome!=='HIT'&&r.outcome!=='MISS'))continue;
   n++;
   const original=r.outcome==='HIT',hit=s===r.call.side?original:!original;
   if(original)originalHits++;if(hit)modelHits++;
   if(hit&&!original)onlyModel++;if(original&&!hit)onlyOriginal++;
 }
 const disagreement=onlyModel+onlyOriginal;
 return {n,modelHits,originalHits,onlyModel,onlyOriginal,pairedLower95:lower95(onlyModel,disagreement),
  qualified:n>=40&&disagreement>=20&&modelHits>originalHits&&lower95(onlyModel,disagreement)>.5};
}
/** Same source, same regime, only outcomes known before issuance. Candidate
 * models remain research-only; the original trade path is never changed. */
export function openingAdaptiveChoice(rows:Row[],source:string,regime:GoldRegime,issued:number,evidence:Pick<OpeningEvidence,Model>):
 {adaptive:OpeningSide;adaptiveModel:string}{
 const prior=rows.filter(r=>r.call.source===source&&r.call.evidence?.regime===regime&&
  r.call.target+300000<=issued&&Number.isFinite(r.settledAt)&&r.settledAt!<=issued);
 const ranked=models.filter(m=>isSide(evidence[m])).map(model=>({model,...compareModel(prior,model)}))
  .filter(v=>v.qualified).sort((a,b)=>b.pairedLower95-a.pairedLower95||b.n-a.n);
 const best=ranked[0];
 return best?{adaptive:evidence[best.model],adaptiveModel:best.model}:{adaptive:'WAIT',adaptiveModel:'COLLECTING'};
}
export function openingRegimeReport(rows:Row[]){
 const grouped=new Map<string,Row[]>();
 for(const row of rows){
   if(!eligibleEvidence(row))continue;
   const key=row.call.evidence!.regime,group=grouped.get(key)??[];group.push(row);grouped.set(key,group);
 }
 return [...grouped].map(([regime,group])=>{
   const losses=group.filter(r=>r.outcome==='MISS');
   return {regime,quality:openingScore(group),paired:models.map(model=>({model,...compareModel(group,model)})),
     lossContext:{opposedFlow:losses.filter(r=>isSide(r.call.evidence!.flow)&&r.call.evidence!.flow!==r.call.side).length,
       noStrongFlow:losses.filter(r=>r.call.evidence!.flow==='WAIT').length,
       slowQuote:losses.filter(r=>r.call.evidence!.quoteAgeMs>=5000).length},
     adaptiveResearch:group.filter(r=>isSide(r.call.evidence!.adaptive)).reduce((a,r)=>{
       if(r.outcome==='HIT'||r.outcome==='MISS'){a.n++;if((r.call.evidence!.adaptive===r.call.side)===(r.outcome==='HIT'))a.hits++;}
       return a;
     },{n:0,hits:0})};
 });
}
