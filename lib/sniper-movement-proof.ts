/**
 * Forward-only, browser-persisted observer for the independent M1 movement radar.
 * Records what the user could see WHEN issued; never rewrites levels after the fact.
 * Outcomes use later, complete M1 candles from the same market data provider.
 * Neither this scorecard nor any alert permits broker execution.
 */
type Side='BUY'|'SELL';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type MovementProof={
 id:string;asset:'GOLD'|'BTC';source:string;kind:'EARLY'|'BREAK'|'OPEN'|'FOLLOW'|'CLOSE';
 side:Side;sourceAt:number;issuedAt:number;priceAt:number;
 quality?:'SETUP'|'COUNTERTREND'|'OBSERVATION';
 setupType?:'REVERSAL'|'CONTINUATION';
 trigger:number|null;invalidation:number|null;target:number|null;
 status:'PENDING'|'TARGET'|'STOP'|'TIMEOUT'|'AMBIGUOUS'|'UNKNOWN'|'NO_TARGET';
 resolvedAt:number|null;detectedAfterMs:number;leadSeconds:number|null;
 // Next complete M5 candle after issuance, scored only when it has closed.
 // Old records without this field remain unscored, never retroactively relabeled.
 m5Outcome?:'PENDING'|'CORRECT'|'WRONG'|'FLAT'|'UNKNOWN';
 m5ResolvedAt?:number|null;
};
type Opportunity={phase:string;side:string;sourceAt:number|null;
 trigger:number|null;invalidation:number|null;targets:number[];
 quality?:'SETUP'|'COUNTERTREND'|'OBSERVATION'};
const horizon=60*60000;
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const good=(x:any):x is Bar=>x&&[x.time,x.open,x.high,x.low,x.close].every(valid)&&
 x.time>0&&x.time%60000===0&&x.low>0&&x.high>=Math.max(x.open,x.close)&&
 x.low<=Math.min(x.open,x.close);
export function safeMovementProof(raw:unknown):MovementProof[]{
 if(!Array.isArray(raw))return [];
 return raw.filter((x:any)=>x&&typeof x.id==='string'&&x.id.length<220&&
  (x.asset==='GOLD'||x.asset==='BTC')&&typeof x.source==='string'&&x.source.length<150&&
  (x.kind==='EARLY'||x.kind==='BREAK'||x.kind==='OPEN'||x.kind==='FOLLOW'||x.kind==='CLOSE')&&(x.side==='BUY'||x.side==='SELL')&&
  valid(x.issuedAt)&&valid(x.sourceAt)&&valid(x.priceAt)&&x.priceAt>0&&
  (x.quality==null||['SETUP','COUNTERTREND','OBSERVATION'].includes(x.quality))&&
  (x.setupType==null||x.setupType==='REVERSAL'||x.setupType==='CONTINUATION')&&
  (x.m5Outcome==null||['PENDING','CORRECT','WRONG','FLAT','UNKNOWN'].includes(x.m5Outcome))&&
  ['PENDING','TARGET','STOP','TIMEOUT','AMBIGUOUS','UNKNOWN','NO_TARGET'].includes(x.status)&&
  (x.target==null||valid(x.target))&&(x.invalidation==null||valid(x.invalidation))
 ).slice(-2000).map((x:any)=>({...x,leadSeconds:valid(x.leadSeconds)?x.leadSeconds:null}));
}
export function advanceMovementProof(input:{
 prior:MovementProof[];now:number;asset:'GOLD'|'BTC';source:string;
 price:number|null;signal:Opportunity;bars:unknown;m5Bars?:unknown;
 candleLean?:{phase:'OPEN'|'FOLLOW'|'CLOSE'|'WAIT';side:'BUY'|'SELL'|'WAIT';issuedFor:number|null;reason?:string}
}):MovementProof[]{
 const {now,asset,source,signal}=input;
 if(!valid(now)||now<=0||!source)return input.prior;
 const rows=(Array.isArray(input.bars)?input.bars:[]).filter(good)
  .filter(x=>x.time+60000<=now).sort((a,b)=>a.time-b.time);
 const unique=[...new Map(rows.map(x=>[x.time,x])).values()].sort((a,b)=>a.time-b.time);
 const m5=(Array.isArray(input.m5Bars)?input.m5Bars:[]).filter(good)
  .filter(x=>x.time%300000===0&&x.time+300000<=now)
  .sort((a,b)=>a.time-b.time);
 const completeM5=new Map(m5.map(x=>[x.time,x]));
 let modified=false;
 let next=input.prior.map(item=>{
  if(item.asset!==asset||item.source!==source)return item;
  // Exactly the NEXT fully observable M5 candle; no unfinished or preceding OHLC.
  // This audit is distinct from target/stop outcomes and never implies P&L.
  if(item.m5Outcome==='PENDING'){
    const start=item.kind==='OPEN'||item.kind==='FOLLOW'||item.kind==='CLOSE'?
      Math.floor(item.issuedAt/300000)*300000:
      Math.ceil(item.issuedAt/300000)*300000;
    const closeAt=start+300000;
    if(now>=closeAt){
      const candle=completeM5.get(start);
      if(candle){
        const tolerance=Math.max(.01,item.priceAt*.000002);
        const move=item.side==='BUY'?candle.close-item.priceAt:
          item.priceAt-candle.close;
        item={...item,m5Outcome:Math.abs(move)<=tolerance?'FLAT':
          move>0?'CORRECT':'WRONG',m5ResolvedAt:closeAt};
        modified=true;
      }else if(now>closeAt+600000){
        item={...item,m5Outcome:'UNKNOWN',m5ResolvedAt:closeAt};
        modified=true;
      }
    }
  }
  if(item.status!=='PENDING')return item;
  const first=Math.ceil(item.issuedAt/60000)*60000;
  const end=item.issuedAt+horizon;
  const later=unique.filter(c=>c.time>=first&&c.time<end);
  let status:MovementProof['status']='PENDING',resolvedAt:number|null=null;
  let expected=first;
  for(const bar of later){
    if(bar.time!==expected){status='UNKNOWN';resolvedAt=bar.time+60000;break;}
    expected=bar.time+60000;
    const targetHit=item.target!=null&&(item.side==='BUY'?bar.high>=item.target:bar.low<=item.target);
    const stopHit=item.invalidation!=null&&(item.side==='BUY'?bar.low<=item.invalidation:bar.high>=item.invalidation);
    if(targetHit||stopHit){
      status=targetHit&&stopHit?'AMBIGUOUS':targetHit?'TARGET':'STOP';
      resolvedAt=bar.time+60000;break;
    }
  }
  if(status==='PENDING'&&now>=end+60000){
    status=expected>=end?'TIMEOUT':'UNKNOWN';
    resolvedAt=end;
  }
  if(status==='PENDING')return item;
  modified=true;return {...item,status,resolvedAt};
 });
 if((signal.phase==='PREPARE'||signal.phase==='BREAK_CONFIRMED')&&
   (signal.side==='SELL'||signal.side==='BUY')&&valid(input.price)&&input.price>0&&
   valid(signal.sourceAt)&&signal.sourceAt>0&&now>=signal.sourceAt&&
   now-signal.sourceAt<=120000){
   const kind:MovementProof['kind']=signal.phase==='PREPARE'?'EARLY':'BREAK';
   const id=[asset,source,kind,signal.side,signal.sourceAt].join(':');
   if(!next.some(x=>x.id===id)){
     const target=(Array.isArray(signal.targets)?signal.targets:[])
       .find(t=>valid(t)&&t>0&&(signal.side==='BUY'?t>input.price!:t<input.price!))??null;
     const invalidation=valid(signal.invalidation)&&signal.invalidation>0&&
       (signal.side==='BUY'?signal.invalidation<input.price:signal.invalidation>input.price)?
         signal.invalidation:null;
     const early=kind==='BREAK'?next.filter(x=>x.asset===asset&&x.source===source&&
       x.kind==='EARLY'&&x.side===signal.side&&x.trigger===signal.trigger&&
       x.invalidation===signal.invalidation&&x.issuedAt<signal.sourceAt!&&
       signal.sourceAt!-x.issuedAt<=30*60000).at(-1):undefined;
     next=[...next,{
       id,asset,source,kind,side:signal.side,sourceAt:signal.sourceAt,
       quality:signal.quality??'OBSERVATION',
       issuedAt:now,priceAt:input.price,
       trigger:valid(signal.trigger)?signal.trigger:null,
       invalidation,target,
       status:target==null?'NO_TARGET':'PENDING',resolvedAt:null,
       detectedAfterMs:Math.max(0,now-signal.sourceAt),
       leadSeconds:early?Math.round((signal.sourceAt-early.issuedAt)/1000):null,
       m5Outcome:'PENDING',m5ResolvedAt:null
     }];modified=true;
   }
 }
 // Record only when this phase really became visible; NEVER construct
 // entries retrospectively from later candles or the finished M5 outcome.
 const lean=input.candleLean;
 if(lean&&(lean.phase==='OPEN'||lean.phase==='FOLLOW'||lean.phase==='CLOSE')&&
   (lean.side==='BUY'||lean.side==='SELL')&&valid(input.price)&&
   input.price>0&&valid(lean.issuedFor)&&lean.issuedFor>0&&
   now>=lean.issuedFor&&now-lean.issuedFor<=90000){
   const candleStart=Math.floor(now/300000)*300000;
   if(Math.floor(lean.issuedFor/300000)===Math.floor(now/300000)){
     const setupType=lean.reason?.includes('انعكاس محتمل')?'REVERSAL':'CONTINUATION';
     const baseId=[asset,source,lean.phase,candleStart].join(':');
     // Include direction for new continuation waves. Legacy records remain
     // immutable, and one same-direction wave cannot spam every M5 candle.
     const id=baseId+':'+setupType+':'+lean.side;
     const already=next.some(x=>x.id===id||
       (x.asset===asset&&x.source===source&&x.kind===lean.phase&&
         x.side===lean.side&&x.setupType===setupType&&
         Math.floor(x.issuedAt/300000)===Math.floor(now/300000))||
       (setupType==='REVERSAL'&&x.id===baseId&&
         x.setupType==='REVERSAL'&&x.side===lean.side));
     // One marker per side per wave, not one marker per candle.
     // An opposite-direction wave can mark at its first observed minute.
     const lastContinuation=next.filter(x=>x.asset===asset&&x.source===source&&
       x.setupType==='CONTINUATION'&&
       (x.kind==='OPEN'||x.kind==='FOLLOW'||x.kind==='CLOSE')&&
       x.issuedAt<=now).sort((a,b)=>a.issuedAt-b.issuedAt).at(-1);
     const repeatedWave=setupType==='CONTINUATION'&&
       lastContinuation?.side===lean.side&&now-lastContinuation.issuedAt<15*60000;
     if(!already&&!repeatedWave){
       next.push({id,asset,source,kind:lean.phase,side:lean.side,
         setupType,
         quality:'OBSERVATION',sourceAt:lean.issuedFor,issuedAt:now,
         priceAt:input.price,trigger:null,invalidation:null,target:null,
         status:'NO_TARGET',resolvedAt:null,detectedAfterMs:now-lean.issuedFor,
         leadSeconds:null,m5Outcome:'PENDING',m5ResolvedAt:null});
       modified=true;
     }
   }
 }
 return modified?next.slice(-2000):input.prior;
}
export function movementProofScore(rows:MovementProof[],asset:'GOLD'|'BTC'){
 const all=rows.filter(x=>x.asset===asset);
 const breaks=all.filter(x=>x.kind==='BREAK');
 const hits=breaks.filter(x=>x.status==='TARGET');
 const settled=breaks.filter(x=>['TARGET','STOP','TIMEOUT'].includes(x.status));
 const qualified=breaks.filter(x=>x.quality==='SETUP');
 const qualifiedSettled=qualified.filter(x=>['TARGET','STOP','TIMEOUT'].includes(x.status));
 const qualifiedHits=qualifiedSettled.filter(x=>x.status==='TARGET');
 const m5Scored=breaks.filter(x=>x.m5Outcome==='CORRECT'||x.m5Outcome==='WRONG');
 const m5Correct=m5Scored.filter(x=>x.m5Outcome==='CORRECT');
 const earlyM5Scored=all.filter(x=>x.kind==='EARLY'&&
   (x.m5Outcome==='CORRECT'||x.m5Outcome==='WRONG'));
 const earlyM5Correct=earlyM5Scored.filter(x=>x.m5Outcome==='CORRECT');
 const opens=all.filter(x=>x.kind==='OPEN');
 const closes=all.filter(x=>x.kind==='CLOSE');
 const follows=all.filter(x=>x.kind==='FOLLOW');
 const scored=(rows:MovementProof[])=>rows.filter(x=>
   x.m5Outcome==='CORRECT'||x.m5Outcome==='WRONG');
 const openingScored=scored(opens),closingScored=scored(closes),followingScored=scored(follows);
 const reversal=all.filter(x=>x.setupType==='REVERSAL');
 const continuation=all.filter(x=>x.setupType==='CONTINUATION');
 const reversalScored=scored(reversal),continuationScored=scored(continuation);
 const reversalHits=reversalScored.filter(x=>x.m5Outcome==='CORRECT').length;
 const continuationHits=continuationScored.filter(x=>x.m5Outcome==='CORRECT').length;
 const openingHits=openingScored.filter(x=>x.m5Outcome==='CORRECT').length;
 const closingHits=closingScored.filter(x=>x.m5Outcome==='CORRECT').length;
 const lags=breaks.map(x=>x.detectedAfterMs/1000).filter(x=>valid(x)&&x>=0);
 const leads=breaks.map(x=>x.leadSeconds).filter(valid).filter(x=>x>=0);
 return {
  alerts:all.length,early:all.filter(x=>x.kind==='EARLY').length,breaks:breaks.length,
  followings:follows.length,followingScored:followingScored.length,
  followingHits:followingScored.filter(x=>x.m5Outcome==='CORRECT').length,
  reversals:reversal.length,reversalScored:reversalScored.length,reversalHits,
  continuations:continuation.length,continuationScored:continuationScored.length,
  continuationHits,
  openings:opens.length,openingScored:openingScored.length,
  openingHits,openingRate:openingScored.length?
    Math.round(100*openingHits/openingScored.length):null,
  closings:closes.length,closingScored:closingScored.length,
  closingHits,closingRate:closingScored.length?
    Math.round(100*closingHits/closingScored.length):null,
  hits:hits.length,settled:settled.length,
  qualified:qualified.length,qualifiedSettled:qualifiedSettled.length,
  qualifiedHits:qualifiedHits.length,
  qualifiedRate:qualifiedSettled.length?
    Math.round(100*qualifiedHits.length/qualifiedSettled.length):null,
  countertrend:breaks.filter(x=>x.quality==='COUNTERTREND').length,
  m5Scored:m5Scored.length,m5Correct:m5Correct.length,
  m5Rate:m5Scored.length?Math.round(100*m5Correct.length/m5Scored.length):null,
  earlyM5Scored:earlyM5Scored.length,earlyM5Correct:earlyM5Correct.length,
  earlyM5Rate:earlyM5Scored.length?
    Math.round(100*earlyM5Correct.length/earlyM5Scored.length):null,
  legacy:breaks.filter(x=>x.quality==null).length,
  stops:settled.filter(x=>x.status==='STOP').length,
  targetRate:settled.length?Math.round(100*hits.length/settled.length):null,
  pending:all.filter(x=>x.status==='PENDING').length,
  missingTarget:all.filter(x=>x.status==='NO_TARGET').length,
  unscored:all.filter(x=>x.status==='UNKNOWN'||x.status==='AMBIGUOUS').length,
  averageLagSeconds:lags.length?Math.round(lags.reduce((a,b)=>a+b,0)/lags.length):null,
  earlyLeads:leads.length,
  averageLeadSeconds:leads.length?Math.round(leads.reduce((a,b)=>a+b,0)/leads.length):null,
  statisticallyThin:settled.length<30
 };
}
