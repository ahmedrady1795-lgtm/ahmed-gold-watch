/** Read-only, server-observed Coinbase BTC-USD radar experiment.
 * Outcomes are scored on the FIRST WHOLE bar AFTER the event, never an
 * in-progress candle. No trading, no calibrated win probabilities.
 */
export type Direction='BUY'|'SELL';
export type ShadowBar={time:number;open:number;high:number;low:number;close:number};
export type ShadowOutcome={status:'PENDING'|'SCORED'|'NO_DATA';
 barAt:number;checkedAt:number|null;direction:Direction|'FLAT'|null;
 correct:boolean|null;moveBps:number|null};
export type ShadowEvent={
 id:string;source:'Coinbase BTC-USD WS';at:number;side:Direction;
 price:number;confirm:number;invalidate:number;
 baseline:Direction|'WAIT';phase:'CONFIRMED'|'OBSERVED';l2Snapshots:number;
 // OBSERVED is an early pressure fingerprint, NOT a radar-confirmed signal.
 fingerprint?:'BID_ABSORPTION'|'ASK_ABSORPTION';
 aggressiveUsd?:number;defendedDepthUsd?:number;midMoveBps?:number;
 m1:ShadowOutcome;m15:ShadowOutcome
};
export type ShadowLedger={schema:'qannas-radar-shadow-v1';updatedAt:number;
 events:ShadowEvent[]};
const H1=60000,H15=900000;
const validTime=(t:number)=>Number.isSafeInteger(t)&&t>0;
const round=(x:number)=>Number(x.toFixed(3));
export const newLedger=():ShadowLedger=>({schema:'qannas-radar-shadow-v1',
 updatedAt:0,events:[]});
export function validShadowBars(raw:unknown,period:number,now:number):ShadowBar[]{
 if(!Array.isArray(raw))return [];
 const map=new Map<number,ShadowBar>();
 for(const x of raw){
  const b=x as ShadowBar;
  if(!b||![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||
    !validTime(b.time)||b.time%period||b.time+period>now-3000||
    b.time<now-4*86400000||b.low<=0||b.open<=0||
    b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))
    continue;
  if(!map.has(b.time))map.set(b.time,{time:b.time,open:b.open,high:b.high,
    low:b.low,close:b.close});
 }
 return [...map.values()].sort((a,b)=>a.time-b.time).slice(-900);
}
function targetAt(at:number,period:number){
 return (Math.floor(at/period)+1)*period;
}
export function baselineAt(raw:readonly ShadowBar[],at:number):Direction|'WAIT'{
 const valid=raw.filter(b=>b&&b.time+H1<=at-3000&&b.time%H1===0)
    .sort((a,b)=>a.time-b.time).slice(-6);
 if(valid.length<6||valid.some((b,i)=>i>0&&b.time-valid[i-1].time!==H1))
  return 'WAIT';
 const first=valid[0].close,last=valid.at(-1)!.close;
 return Math.abs((last-first)/first*10000)<=2?'WAIT':
   last>first?'BUY':'SELL';
}
function pending(at:number,period:number):ShadowOutcome{
 return {status:'PENDING',barAt:targetAt(at,period),checkedAt:null,
  direction:null,correct:null,moveBps:null};
}
export function recordRadarSignal(a:{
 ledger:ShadowLedger;now:number;sourceAt:number;
 side:Direction;price:number;confirm:number;invalidate:number;
 l2Snapshots:number;baseline:Direction|'WAIT';
}):{ledger:ShadowLedger;recorded:boolean;reason:string}{
 const {ledger,now,sourceAt,side,price,confirm,invalidate,l2Snapshots}=a;
 if(!validTime(now)||!validTime(sourceAt)||
  now-sourceAt<0||now-sourceAt>5000||price<=0||
  ![price,confirm,invalidate].every(Number.isFinite)||
  confirm<=0||invalidate<=0||l2Snapshots<5||
  (side==='BUY'?confirm<=invalidate:confirm>=invalidate)||
  !['BUY','SELL'].includes(side))
  return {ledger,recorded:false,reason:'UNVERIFIED_INPUT'};
 const prev=ledger.events.at(-1);
 // Only one non-overlapping M15 cohort: prevents burst/repeated correlation.
 if(prev&&now-prev.at<15*60000)
  return {ledger,recorded:false,reason:'M15_COHORT_COOLDOWN'};
 const id='CB-'+sourceAt+'-'+side;
 if(ledger.events.some(x=>x.id===id))
  return {ledger,recorded:false,reason:'DUPLICATE'};
 const event:ShadowEvent={id,source:'Coinbase BTC-USD WS',
   at:sourceAt,side,price:round(price),confirm:round(confirm),
   invalidate:round(invalidate),baseline:a.baseline,
   phase:'CONFIRMED',l2Snapshots,
   m1:pending(sourceAt,H1),m15:pending(sourceAt,H15)};
 return {ledger:{schema:'qannas-radar-shadow-v1',updatedAt:now,
   events:[...ledger.events,event].slice(-2400)},
   recorded:true,reason:'SERVER_OBSERVED'};
}
/** Freeze a strictly pre-break Coinbase footprint on SERVER only.
 * Hypothesis: resilient displayed BID following aggressive SELL may precede
 * upward movement; resilient ASK following aggressive BUY may precede DOWN.
 * Scores later distinguish outcomes from confirmed-flow signals.
 */
export function recordAbsorptionFingerprint(a:{
 ledger:ShadowLedger;now:number;sourceAt:number;side:Direction;
 fingerprint:'BID_ABSORPTION'|'ASK_ABSORPTION';
 price:number;aggressiveUsd:number;defendedDepthUsd:number;
 midMoveBps:number;l2Snapshots:number;baseline:Direction|'WAIT'
}):{ledger:ShadowLedger;recorded:boolean;reason:string}{
 const ok=a.fingerprint==='BID_ABSORPTION'?a.side==='BUY':a.side==='SELL';
 if(!ok||!validTime(a.now)||!validTime(a.sourceAt)||
    a.now-a.sourceAt<0||a.now-a.sourceAt>4000||
    ![a.price,a.aggressiveUsd,a.defendedDepthUsd,a.midMoveBps].
      every(Number.isFinite)||
    a.price<=0||a.aggressiveUsd<75000||a.defendedDepthUsd<110000||
    Math.abs(a.midMoveBps)>2||a.l2Snapshots<5||
    !['BUY','SELL','WAIT'].includes(a.baseline))
   return {ledger:a.ledger,recorded:false,reason:'NO_AUTHENTIC_FOOTPRINT'};
 const prev=[...a.ledger.events].reverse().find(e=>e.phase==='OBSERVED');
 // Keep a 15-minute disjoint cohort: no rapid-fire multiple correlated
 // snapshots counted as independent evidence.
 if(prev&&a.now-prev.at<15*60000)
   return {ledger:a.ledger,recorded:false,reason:'ABSORPTION_COHORT_COOLDOWN'};
 const id='CA-'+a.sourceAt+'-'+a.side;
 if(a.ledger.events.some(e=>e.id===id))
   return {ledger:a.ledger,recorded:false,reason:'DUPLICATE'};
 const event:ShadowEvent={id,source:'Coinbase BTC-USD WS',
   at:a.sourceAt,side:a.side,price:round(a.price),
   confirm:round(a.price),invalidate:round(a.price),
   baseline:a.baseline,phase:'OBSERVED',fingerprint:a.fingerprint,
   aggressiveUsd:Math.round(a.aggressiveUsd),
   defendedDepthUsd:Math.round(a.defendedDepthUsd),
   midMoveBps:round(a.midMoveBps),l2Snapshots:a.l2Snapshots,
   m1:pending(a.sourceAt,H1),m15:pending(a.sourceAt,H15)};
 return {ledger:{schema:'qannas-radar-shadow-v1',updatedAt:a.now,
   events:[...a.ledger.events,event].slice(-2400)},
   recorded:true,reason:'SERVER_OBSERVED_FOOTPRINT'};
}
export function settleRadarOutcomes(a:{
 ledger:ShadowLedger;now:number;m1:readonly ShadowBar[];
 m15:readonly ShadowBar[];
}):{ledger:ShadowLedger;changed:number}{
 const {ledger,now}=a;let changed=0;
 const make=(o:ShadowOutcome,bars:readonly ShadowBar[],period:number,
  e:ShadowEvent)=>{
   if(o.status!=='PENDING')return o;
   const expected=targetAt(e.at,period);
   if(now<expected+period+3000)return o;
   const actual=bars.find(b=>b.time===expected&&
     b.time+period<=now-3000);
   if(!actual){
     // Do not substitute a later candle or invent outcomes for missing feed.
     if(now<expected+period+6*3600000)return o;
     changed++;return {...o,status:'NO_DATA' as const,checkedAt:now};
   }
   const move=(actual.close-e.price)/e.price*10000;
   const direction=Math.abs(move)<=2?'FLAT' as const:
     move>0?'BUY' as const:'SELL' as const;
   changed++;
   return {...o,status:'SCORED' as const,checkedAt:now,
     direction,correct:direction===e.side,moveBps:round(move)};
 };
 const events=ledger.events.map(e=>({
   ...e,m1:make(e.m1,a.m1,H1,e),m15:make(e.m15,a.m15,H15,e)
 }));
 return {ledger:changed?{...ledger,events,updatedAt:now}:ledger,changed};
}
function wilson(k:number,n:number){
 if(!n)return 0;
 const z=1.96,p=k/n,v=z*z;
 return round(Math.max(0,(p+v/(2*n)-
   z*Math.sqrt(p*(1-p)/n+v/(4*n)))/(1+v/n)));
}
export function radarShadowScore(ledger:ShadowLedger){
 function horizon(key:'m1'|'m15',kind:'RADAR'|'ABSORPTION'='RADAR'){
  const subset=ledger.events.filter(e=>kind==='RADAR'?
    e.phase==='CONFIRMED':e.phase==='OBSERVED');
  const finished=subset.filter(e=>e[key].status==='SCORED');
  const directional=finished.filter(e=>e[key].direction!=='FLAT');
  const right=directional.filter(e=>e[key].correct===true).length;
  const paired=directional.filter(e=>e.baseline!=='WAIT');
  const baselineCorrect=paired.filter(e=>e.baseline===e[key].direction).length;
  const pairedRadarCorrect=paired.filter(e=>e[key].correct).length;
  const ready=paired.length>=50&&directional.length>=70;
  return {status:ready?'SHADOW' as const:'COLLECTING' as const,
    samples:finished.length,directional:directional.length,correct:right,
    accuracy:directional.length?round(right/directional.length):null,
    wilsonLower:directional.length?wilson(right,directional.length):null,
    pairedN:paired.length,pairedRadarCorrect,pairedBaselineCorrect:baselineCorrect,
    pairedRadarRate:paired.length?round(pairedRadarCorrect/paired.length):null,
    baselineRate:paired.length?round(baselineCorrect/paired.length):null,
    pending:subset.filter(e=>e[key].status==='PENDING').length,
    missing:subset.filter(e=>e[key].status==='NO_DATA').length,
    edgeProven:false,qualified:false,
    reason:ready?'تقييم ظلي فقط؛ التفوق والربح لم يثبتا باختبار مستقل':
      'جمع عينات لاحقة ومنفصلة؛ لا توجد نسبة نجاح معتمدة'};
 }
 const absorption=ledger.events.filter(e=>e.phase==='OBSERVED');
 const confirmed=ledger.events.filter(e=>e.phase==='CONFIRMED');
 return {source:'Coinbase BTC-USD WS',mode:'SHADOW' as const,
   events:confirmed.length,updatedAt:ledger.updatedAt,
   m1:horizon('m1'),m15:horizon('m15'),
   absorption:{events:absorption.length,m1:horizon('m1','ABSORPTION'),
     m15:horizon('m15','ABSORPTION'),status:'EXPERIMENTAL' as const,
     qualified:false,
     note:'بصمات امتصاص Coinbase التجريبية؛ دقتها ليست أداء تداول'},
   tradingEnabled:false,modelQualified:false};
}
export function sanitizeShadowLedger(data:unknown,now:number):ShadowLedger{
 const x=data as ShadowLedger;
 if(x?.schema!=='qannas-radar-shadow-v1'||!Array.isArray(x.events))
  return newLedger();
 const events=x.events.slice(-2400).filter(e=>e&&
   typeof e.id==='string'&&/^C[BA]-\d+-(BUY|SELL)$/.test(e.id)&&
   (e.id.startsWith('CB-')?
     e.phase==='CONFIRMED':
     e.phase==='OBSERVED'&&
     (e.fingerprint==='BID_ABSORPTION'&&e.side==='BUY'||
       e.fingerprint==='ASK_ABSORPTION'&&e.side==='SELL')&&
     Number.isFinite(e.aggressiveUsd)&&e.aggressiveUsd!>=75000&&
     Number.isFinite(e.defendedDepthUsd)&&e.defendedDepthUsd!>=110000&&
     Number.isFinite(e.midMoveBps)&&Math.abs(e.midMoveBps!)<=2)&&
   e.source==='Coinbase BTC-USD WS'&&validTime(e.at)&&
   now-e.at>=0&&now-e.at<180*86400000&&
   ['BUY','SELL'].includes(e.side)&&e.price>0&&
   Number.isFinite(e.price)&&e.l2Snapshots>=5&&
   e.m1&&e.m15&&e.m1.barAt===targetAt(e.at,H1)&&
   e.m15.barAt===targetAt(e.at,H15));
 return {schema:'qannas-radar-shadow-v1',
   updatedAt:Number.isFinite(x.updatedAt)?x.updatedAt:0,
   events};
}

/** Retain previously witnessed outcomes across Render free restarts.
 * Never upgrade a missing event to a success, rewrite an issue price, or
 * count the same Coinbase event twice. Strict deduplication by frozen id.
 */
export function mergeRadarShadowArchives(oldRaw:unknown,newRaw:unknown,
 now=Date.now()):ShadowLedger{
 const previous=sanitizeShadowLedger(oldRaw,now);
 const current=sanitizeShadowLedger(newRaw,now);
 const map=new Map(previous.events.map(e=>[e.id,e]));
 for(const event of current.events){
  const prior=map.get(event.id);
  if(!prior){map.set(event.id,event);continue;}
  if(prior.at!==event.at||prior.side!==event.side||
     prior.price!==event.price||prior.confirm!==event.confirm||
     prior.invalidate!==event.invalidate||prior.baseline!==event.baseline||
     prior.phase!==event.phase||prior.fingerprint!==event.fingerprint||
     prior.aggressiveUsd!==event.aggressiveUsd||
     prior.defendedDepthUsd!==event.defendedDepthUsd||
     prior.midMoveBps!==event.midMoveBps)
   continue; // immutable observation mismatch
  const choose=(a:ShadowOutcome,b:ShadowOutcome)=>{
   const rank=(x:ShadowOutcome)=>x.status==='SCORED'?2:
      x.status==='NO_DATA'?1:0;
   return rank(b)>rank(a)?b:a; // no score is ever invented from an empty gap
  };
  map.set(event.id,{...prior,
    m1:choose(prior.m1,event.m1),m15:choose(prior.m15,event.m15)});
 }
 const events=[...map.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
   .slice(-2400);
 return {schema:'qannas-radar-shadow-v1',
  updatedAt:Math.max(previous.updatedAt,current.updatedAt,now),events};
}
