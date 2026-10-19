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
 baseline:Direction|'WAIT';phase:'CONFIRMED';l2Snapshots:number;
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
 function horizon(key:'m1'|'m15'){
  const finished=ledger.events.filter(e=>e[key].status==='SCORED');
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
    pairedN:paired.length,pairedRadarCorrect,pairedBaselineCorrect,
    pairedRadarRate:paired.length?round(pairedRadarCorrect/paired.length):null,
    baselineRate:paired.length?round(baselineCorrect/paired.length):null,
    pending:ledger.events.filter(e=>e[key].status==='PENDING').length,
    missing:ledger.events.filter(e=>e[key].status==='NO_DATA').length,
    edgeProven:false,qualified:false,
    reason:ready?'تقييم ظلي فقط؛ التفوق والربح لم يثبتا باختبار مستقل':
      'جمع عينات لاحقة ومنفصلة؛ لا توجد نسبة نجاح معتمدة'};
 }
 return {source:'Coinbase BTC-USD WS',mode:'SHADOW' as const,
   events:ledger.events.length,updatedAt:ledger.updatedAt,
   m1:horizon('m1'),m15:horizon('m15'),
   tradingEnabled:false,modelQualified:false};
}
export function sanitizeShadowLedger(data:unknown,now:number):ShadowLedger{
 const x=data as ShadowLedger;
 if(x?.schema!=='qannas-radar-shadow-v1'||!Array.isArray(x.events))
  return newLedger();
 const events=x.events.slice(-2400).filter(e=>e&&
   typeof e.id==='string'&&/^CB-\d+-(BUY|SELL)$/.test(e.id)&&
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
     prior.invalidate!==event.invalidate||prior.baseline!==event.baseline)
   continue; // immutable observation mismatch
  const choose=(a:ShadowOutcome,b:ShadowOutcome)=>{
   if(a.status!=='PENDING')return a;
   return b.status==='PENDING'?a:b;
  };
  map.set(event.id,{...prior,
    m1:choose(prior.m1,event.m1),m15:choose(prior.m15,event.m15)});
 }
 const events=[...map.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
   .slice(-2400);
 return {schema:'qannas-radar-shadow-v1',
  updatedAt:Math.max(previous.updatedAt,current.updatedAt,now),events};
}
