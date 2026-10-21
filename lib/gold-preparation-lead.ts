import {trustedSpotGoldSource} from './gold-liquidity-radar.ts';
import type {GoldBar} from './gold-liquidity-radar.ts';
import {acceptGoldPulse} from './gold-tick-quality.ts';

/** Forward-only, price-based preparation. No volume, order identities or GC
 * lead is inferred from spot OHLC. Observation levels are not order fills. */
export const GOLD_PREPARATION_VERSION='GOLD_PREBREAK_V1';
const MIN=60000,COOLDOWN=15*MIN;
export type LeadSide='BUY'|'SELL';
export type LeadStatus='ARMED'|'BREAKOUT'|'TARGET'|'STOP'|'NO_BREAK'|
 'INVALIDATED'|'TIMEOUT'|'TIMING_UNPROVEN'|'AMBIGUOUS'|'UNKNOWN';
export type GoldPreparationPlan={
 version:typeof GOLD_PREPARATION_VERSION;id:string;issuedAt:number;contextAt:number;
 source:string;quoteSource:string;quoteAt:number;price:number;spread:number|null;
 side:LeadSide;setup:'PRESSURE_COIL'|'SWEEP_RECLAIM';
 trigger:number;target:number;invalidate:number;armUntil:number;reason:string;
 evidence:string[];method:'SPOT_PRICE_PREPARATION';
};
export type GoldLeadEvent=GoldPreparationPlan&{
 status:LeadStatus;breakoutBarAt:number|null;leadMinSeconds:number|null;
 leadMaxSeconds:number|null;evaluatedThrough:number;resolvedAt:number|null;note:string;
 issuanceBar:GoldBar|null;breakoutBar:GoldBar|null;
};
export type GoldLeadLedger={schema:'gold-preparation-lead-v1';updatedAt:number;events:GoldLeadEvent[]};
export const emptyGoldLeadLedger=():GoldLeadLedger=>({schema:'gold-preparation-lead-v1',updatedAt:0,events:[]});
const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const stamp=(x:unknown):x is number=>positive(x)&&Number.isSafeInteger(x);
const active=(s:LeadStatus)=>s==='ARMED'||s==='BREAKOUT';
export const goldQuoteMatchesCandles=(quoteSource:string,candleSource:string)=>
 (candleSource==='Biquote · MT5 XAUUSD candles'&&quoteSource==='Biquote · MT5 XAUUSD')||
 (candleSource==='Massive · C:XAUUSD'&&quoteSource==='Massive · XAUUSD institutional FX')||
 (candleSource==='Twelve Data · XAU/USD'&&quoteSource==='Twelve Data')||
 (/^Exness\/MT5 · [A-Za-z0-9_.-]+$/.test(candleSource)&&quoteSource===candleSource);
function validBar(b:GoldBar){return b&&stamp(b.time)&&b.time%MIN===0&&
 [b.open,b.high,b.low,b.close].every(positive)&&
 b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);}

export function readGoldPreparation(input:{now:number;source:string;bars:readonly GoldBar[];
 quote:any;marketOpen:boolean}):{ready:boolean;reason:string;plan:GoldPreparationPlan|null}{
 const none=(reason:string)=>({ready:false,reason,plan:null});
 const {now,source,quote,marketOpen}=input;
 if(!marketOpen)return none('سوق الذهب مغلق');
 if(!trustedSpotGoldSource(source)||!goldQuoteMatchesCandles(String(quote?.source||''),source))
  return none('السعر والشموع ليسا من نفس مصدر الذهب الفوري');
 const pulse=acceptGoldPulse(quote,now);
 if(!pulse||quote?.ok!==true)return none('لا يوجد سعر مصدر حديث خلال 10 ثوانٍ');
 if(pulse.bid!=null&&pulse.ask!=null&&(pulse.ask<pulse.bid||
  pulse.price<pulse.bid||pulse.price>pulse.ask))return none('سعر أو سبريد غير متسق');
 // Caller supplies completed bars only. Reject a forming/future bar, rather
 // than silently letting it influence levels or historical destinations.
 const bars=[...input.bars].sort((a,b)=>a.time-b.time).slice(-180);
 if(bars.length<48||bars.some((b,i)=>!validBar(b)||b.time+MIN>now-3000||
  (i>0&&b.time-bars[i-1].time!==MIN)))return none('تاريخ M1 مغلق ومتصل غير كافٍ');
 const last=bars.at(-1)!,contextAt=last.time+MIN;
 if(now-contextAt>90000||pulse.sourceTime<contextAt)return none('سياق الدقيقة أو توقيت السعر قديم');
 const ranges=bars.slice(-25).map((b,i,a)=>i?Math.max(b.high-b.low,
  Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close)):b.high-b.low).slice(1).sort((a,b)=>a-b);
 const atr=ranges[Math.floor(ranges.length/2)];
 if(!(atr>0)||atr>last.close*.012||Math.abs(pulse.price-last.close)>atr*1.5)
  return none('صدمة سعرية أو تقلب غير قابل للقياس');
 const pad=Math.max(atr*.12,last.close*.000012);
 const spread=pulse.bid!=null&&pulse.ask!=null&&pulse.ask>=pulse.bid?pulse.ask-pulse.bid:null;
 if(spread!=null&&spread>atr*.35)return none('السبريد أوسع من نطاق التحضير');
 const box=bars.slice(-8),prior=bars.slice(-15,-1),tail=bars.slice(-4);
 const top=Math.max(...box.map(b=>b.high)),bottom=Math.min(...box.map(b=>b.low));
 const range=last.high-last.low,pos=range?(last.close-last.low)/range:.5;
 let side:LeadSide,setup:GoldPreparationPlan['setup'],trigger:number,invalidate:number,evidence:string[];
 const sweepBuy=last.low<Math.min(...prior.map(b=>b.low))-pad&&pos>=.65&&
  last.close>Math.min(...prior.map(b=>b.low))&&last.close>last.open;
 const sweepSell=last.high>Math.max(...prior.map(b=>b.high))+pad&&pos<=.35&&
  last.close<Math.max(...prior.map(b=>b.high))&&last.close<last.open;
 const rising=tail.slice(1).filter((b,i)=>b.low>tail[i].low).length;
 const falling=tail.slice(1).filter((b,i)=>b.high<tail[i].high).length;
 const width=top-bottom,position=width?(last.close-bottom)/width:.5;
 const compressed=width>=atr*1.2&&width<=atr*3.5;
 const coilBuy=compressed&&position>=.68&&rising>=2&&
  tail.at(-1)!.low-tail[0].low>=atr*.2;
 const coilSell=compressed&&position<=.32&&falling>=2&&
  tail[0].high-tail.at(-1)!.high>=atr*.2;
 if(sweepBuy&&!sweepSell){
  side='BUY';setup='SWEEP_RECLAIM';trigger=last.high+pad;invalidate=last.low-pad;
  evidence=['سحب قاع سابق ثم استرداده','إغلاق في أعلى شمعة الرفض'];
 }else if(sweepSell&&!sweepBuy){
  side='SELL';setup='SWEEP_RECLAIM';trigger=last.low-pad;invalidate=last.high+pad;
  evidence=['سحب قمة سابقة ثم فقدها','إغلاق في أسفل شمعة الرفض'];
 }else if(coilBuy&&!coilSell){
  side='BUY';setup='PRESSURE_COIL';trigger=top+pad;
  invalidate=Math.min(...tail.map(b=>b.low))-pad;
  evidence=['نطاق M1 مضغوط','قيعان صاعدة وضغط قرب سقف النطاق'];
 }else if(coilSell&&!coilBuy){
  side='SELL';setup='PRESSURE_COIL';trigger=bottom-pad;
  invalidate=Math.max(...tail.map(b=>b.high))+pad;
  evidence=['نطاق M1 مضغوط','قمم هابطة وضغط قرب قاع النطاق'];
 }else return {ready:true,reason:'لا يوجد تحضير قبل الكسر مستوفٍ للشروط',plan:null};
 const sign=side==='BUY'?1:-1;
 const leadingPrice=side==='BUY'?(pulse.ask??pulse.price):(pulse.bid??pulse.price);
 if(sign*(trigger-leadingPrice)<=0||sign*(pulse.price-invalidate)<=0||
  sign*(trigger-pulse.price)>atr*1.2)return none('السعر عبر التفعيل بالفعل أو بعيد عن التحضير');
 const risk=sign*(trigger-invalidate);
 if(risk<atr*.6||risk>atr*4||spread!=null&&risk<spread*4)
  return none('مستوى الإبطال غير مناسب لضوضاء السعر');
 // Destinations must already exist as historical swing levels. Never extend
 // a target to manufacture a reward ratio. Exclude the current setup box.
 const history=bars.slice(0,-8),destinations:number[]=[];
 for(let i=2;i<history.length-2;i++){
  const b=history[i],window=history.slice(i-2,i+3);
  if(side==='BUY'&&window.every(x=>b.high>=x.high))destinations.push(b.high);
  if(side==='SELL'&&window.every(x=>b.low<=x.low))destinations.push(b.low);
 }
 const target=destinations.filter(p=>sign*(p-trigger)>=risk*1.35&&
  sign*(p-trigger)<=atr*6&&(spread==null||sign*(p-trigger)>spread*3))
  .sort((a,b)=>sign*(a-b))[0];
 if(!positive(target))return none('لا توجد وجهة تاريخية قريبة بعائد مناسب');
 const reason=setup==='PRESSURE_COIL'?'ضغط سعري قبل عبور النطاق':'استرداد مستوى؛ انتظار عبور شمعة الرفض';
 const plan:GoldPreparationPlan={version:GOLD_PREPARATION_VERSION,
  id:[GOLD_PREPARATION_VERSION,source,contextAt,side,setup].join(':'),
  issuedAt:now,contextAt,source,quoteSource:quote.source,quoteAt:pulse.sourceTime,
  price:pulse.price,spread,side,setup,trigger,target,invalidate,
  armUntil:Math.ceil(now/MIN)*MIN+5*MIN,reason,
  evidence:[...evidence,'السعر المرصود لم يعبر التفعيل وقت الإصدار'],method:'SPOT_PRICE_PREPARATION'};
 return {ready:true,reason,plan};
}

export function appendGoldLead(ledger:GoldLeadLedger,plan:GoldPreparationPlan):GoldLeadLedger{
 if(ledger.events.some(e=>active(e.status)||e.id===plan.id||plan.issuedAt-e.issuedAt<COOLDOWN))return ledger;
 const event:GoldLeadEvent={...plan,status:'ARMED',breakoutBarAt:null,
  leadMinSeconds:null,leadMaxSeconds:null,evaluatedThrough:Math.floor(plan.issuedAt/MIN)*MIN,
  resolvedAt:null,issuanceBar:null,breakoutBar:null,
  note:'إنذار تجريبي مثبت قبل الكسر؛ ننتظر شموعًا لاحقة للتحقق'};
 return {...ledger,updatedAt:plan.issuedAt,events:[...ledger.events,event].slice(-2500)};
}

/** Only FULL future M1 bars prove advance timing. The issuance minute must
 * remain inside trigger/stop, otherwise it is impossible to know whether
 * its extreme occurred before or after this server-issued alert. */
export function settleGoldLead(ledger:GoldLeadLedger,now:number,source:string,raw:readonly GoldBar[]):GoldLeadLedger{
 const map=new Map(raw.filter(b=>validBar(b)&&b.time+MIN<=now-3000).map(b=>[b.time,b]));
 let changed=false;
 const events=ledger.events.map(original=>{
  if(!active(original.status))return original;
  const e={...original};
  const finish=(status:LeadStatus,note:string,at:number)=>{
   e.status=status;e.note=note;e.resolvedAt=at;return e;
  };
  if(source!==e.source){changed=true;return finish('UNKNOWN','تغيّر مصدر الشموع أثناء الرصد',now);}
  const sign=e.side==='BUY'?1:-1;
  const triggerHit=(b:GoldBar)=>e.side==='BUY'?b.high>=e.trigger:b.low<=e.trigger;
  const stopHit=(b:GoldBar)=>e.side==='BUY'?b.low<=e.invalidate:b.high>=e.invalidate;
  const targetHit=(b:GoldBar)=>e.side==='BUY'?b.high>=e.target:b.low<=e.target;
  // Continue after the last fully observed bar, including after restarts.
  // A provider's later revision cannot repaint an already saved crossing.
  const start=e.evaluatedThrough;
  const until=Math.min(Math.floor((now-3000)/MIN)*MIN,
   e.breakoutBarAt==null?e.armUntil:e.breakoutBarAt+16*MIN);
  let broke:number|null=e.breakoutBarAt;
  for(let at=start;at<until;at+=MIN){
   const b=map.get(at);
   if(!b){
    if(now>=at+MIN+180000){changed=true;return finish('UNKNOWN','فجوة M1؛ ترتيب اللمسات غير معلوم',now);}
    return original;
   }
   const end=at+MIN;
   if(at<e.issuedAt&&(triggerHit(b)||stopHit(b))){
    changed=true;return finish('TIMING_UNPROVEN','حدث لمس داخل دقيقة إصدار الإنذار؛ لا نثبت أسبقية منه',end);
   }
   e.evaluatedThrough=end;
   const snapshot={time:b.time,open:b.open,high:b.high,low:b.low,close:b.close};
   if(at<e.issuedAt){e.issuanceBar=snapshot;continue;}
   // An opening gap can skip the trigger/target without an observed passage.
   if(broke==null&&sign*(b.open-e.trigger)>0){
    changed=true;return finish('UNKNOWN','افتتاح بعد مستوى التفعيل؛ توقيت العبور غير مرصود',end);
   }
   if(broke==null){
    if(end>e.armUntil)break;
    if(triggerHit(b)&&stopHit(b)){
     changed=true;return finish('AMBIGUOUS','التفعيل والإبطال في دقيقة واحدة؛ ترتيب غير معلوم',end);
    }
    if(stopHit(b)){changed=true;return finish('INVALIDATED','وصل الإبطال قبل رصد الكسر',end);}
    if(!triggerHit(b))continue;
    broke=at;e.status='BREAKOUT';e.breakoutBarAt=at;
    e.breakoutBar=snapshot;
    e.leadMinSeconds=Math.max(0,Math.floor((at-e.issuedAt)/1000));
    e.leadMaxSeconds=Math.ceil((end-e.issuedAt)/1000);
    e.note='الكسر في دقيقة لاحقة؛ السبق نطاق زمني وليس توقيت تنفيذ';
   }
   if(stopHit(b)&&targetHit(b)){
    changed=true;return finish('AMBIGUOUS','الهدف والإبطال في دقيقة واحدة؛ لا نعدّها نجاحًا',end);
   }
   if(stopHit(b)){changed=true;return finish('STOP','الإبطال بعد الكسر وقبل الهدف',end);}
   if(targetHit(b)){changed=true;return finish('TARGET','لمس الهدف بعد الكسر دون لمس الإبطال قبله',end);}
   if(broke!=null&&end>=broke+16*MIN){
    changed=true;return finish('TIMEOUT','انتهت 15 دقيقة بعد دقيقة الكسر دون حسم',end);
   }
  }
  if(broke==null&&e.evaluatedThrough>=e.armUntil){
   changed=true;return finish('NO_BREAK','انتهت مهلة التحضير دون كسر',e.armUntil);
  }
  if(JSON.stringify(e)!==JSON.stringify(original))changed=true;
  return e;
 });
 return changed?{...ledger,updatedAt:now,events}:ledger;
}

const statuses:LeadStatus[]=['ARMED','BREAKOUT','TARGET','STOP','NO_BREAK','INVALIDATED',
 'TIMEOUT','TIMING_UNPROVEN','AMBIGUOUS','UNKNOWN'];
export function safeGoldLeadLedger(value:any,now:number):GoldLeadLedger{
 const out=emptyGoldLeadLedger();
 if(value?.schema!==out.schema||!Array.isArray(value.events))return out;
 const ids=new Set<string>();
 for(const x of value.events.slice(-2500)){
  if(!x||x.version!==GOLD_PREPARATION_VERSION||!stamp(x.issuedAt)||x.issuedAt>now+2000||
   !stamp(x.contextAt)||x.contextAt>x.issuedAt||x.issuedAt-x.contextAt>90000||
   !stamp(x.quoteAt)||x.quoteAt>x.issuedAt+2000||x.issuedAt-x.quoteAt>10000||
   !trustedSpotGoldSource(String(x.source))||!goldQuoteMatchesCandles(x.quoteSource,x.source)||
   (x.side!=='BUY'&&x.side!=='SELL')||!['PRESSURE_COIL','SWEEP_RECLAIM'].includes(x.setup)||
   ![x.price,x.trigger,x.target,x.invalidate].every(positive)||
   x.method!=='SPOT_PRICE_PREPARATION'||!statuses.includes(x.status)||
   x.armUntil!==Math.ceil(x.issuedAt/MIN)*MIN+5*MIN||
   typeof x.reason!=='string'||!Array.isArray(x.evidence)||x.evidence.some((z:unknown)=>typeof z!=='string')||
   x.id!==[GOLD_PREPARATION_VERSION,x.source,x.contextAt,x.side,x.setup].join(':')||ids.has(x.id))continue;
  const sign=x.side==='BUY'?1:-1;
  if(sign*(x.trigger-x.price)<=0||sign*(x.price-x.invalidate)<=0||
   sign*(x.target-x.trigger)<sign*(x.trigger-x.invalidate)*1.35)continue;
  if(x.breakoutBarAt!=null&&(!stamp(x.breakoutBarAt)||x.breakoutBarAt%MIN!==0||
   x.breakoutBarAt<x.issuedAt||x.breakoutBarAt+MIN>x.armUntil||
   x.leadMinSeconds!==Math.floor((x.breakoutBarAt-x.issuedAt)/1000)||
   x.leadMaxSeconds!==Math.ceil((x.breakoutBarAt+MIN-x.issuedAt)/1000)))continue;
  if(['BREAKOUT','TARGET','STOP','TIMEOUT'].includes(x.status)&&x.breakoutBarAt==null)continue;
  if(x.breakoutBarAt!=null){
   const b=x.breakoutBar,issue=x.issuanceBar;
   if(!validBar(b)||b.time!==x.breakoutBarAt||b.time+MIN>now||
    (x.side==='BUY'?b.high<x.trigger||b.low<=x.invalidate:
     b.low>x.trigger||b.high>=x.invalidate))continue;
   if(x.issuedAt%MIN!==0&&(!validBar(issue)||issue.time!==Math.floor(x.issuedAt/MIN)*MIN||
    (x.side==='BUY'?issue.high>=x.trigger||issue.low<=x.invalidate:
     issue.low<=x.trigger||issue.high>=x.invalidate)))continue;
  }
  if(x.spread!==null&&(typeof x.spread!=='number'||!Number.isFinite(x.spread)||x.spread<0))continue;
  if(typeof x.note!=='string'||x.note.length>1000)continue;
  if(active(x.status)?x.resolvedAt!==null:!stamp(x.resolvedAt)||x.resolvedAt<x.issuedAt||x.resolvedAt>now+2000)continue;
  if(!stamp(x.evaluatedThrough)||x.evaluatedThrough>now||x.evaluatedThrough<Math.floor(x.issuedAt/MIN)*MIN)continue;
  ids.add(x.id);out.events.push({...x,evidence:x.evidence.slice(0,8)});
 }
 out.events.sort((a,b)=>a.issuedAt-b.issuedAt);
 out.updatedAt=Math.min(now,Number(value.updatedAt)||0);return out;
}
const immutable=(e:GoldLeadEvent)=>JSON.stringify([e.version,e.id,e.issuedAt,e.contextAt,
 e.source,e.quoteSource,e.quoteAt,e.price,e.spread,e.side,e.setup,e.trigger,e.target,
 e.invalidate,e.armUntil,e.reason,e.evidence,e.method]);
export function mergeGoldLeadLedger(a:GoldLeadLedger,b:unknown,now:number):GoldLeadLedger{
 const merged=new Map(safeGoldLeadLedger(a,now).events.map(e=>[e.id,e]));
 for(const e of safeGoldLeadLedger(b,now).events){
  const old=merged.get(e.id);
  if(!old){merged.set(e.id,e);continue;}
  if(immutable(old)!==immutable(e))continue;
  if(!active(old.status)&&!active(e.status)&&old.status!==e.status){
   merged.set(e.id,{...old,status:'UNKNOWN',note:'تعارض نتائج الأرشيف؛ مستبعد من القياس'});continue;
  }
  if(active(old.status)&&(!active(e.status)||e.evaluatedThrough>old.evaluatedThrough))merged.set(e.id,e);
 }
 return {schema:'gold-preparation-lead-v1',updatedAt:now,
  events:[...merged.values()].sort((a,b)=>a.issuedAt-b.issuedAt).slice(-2500)};
}
export function goldLeadScore(ledger:GoldLeadLedger){
 const events=ledger.events,pending=events.filter(e=>active(e.status)).length;
 const unresolved=new Set<LeadStatus>(['TIMING_UNPROVEN','AMBIGUOUS','UNKNOWN']);
 const excluded=events.filter(e=>unresolved.has(e.status)).length;
 const evaluated=events.length-pending-excluded;
 const successes=events.filter(e=>e.status==='TARGET').length;
 const proven=events.filter(e=>e.breakoutBarAt!=null&&!unresolved.has(e.status));
 const mins=proven.map(e=>e.leadMinSeconds!).sort((a,b)=>a-b);
 return {version:GOLD_PREPARATION_VERSION,method:'CLOSED_M1_FORWARD_INTERVAL',
  events:events.length,pending,evaluated,excluded,targetBeforeStop:successes,
  targetRate:evaluated?successes/evaluated:null,provenBreakouts:proven.length,
  noBreak:events.filter(e=>e.status==='NO_BREAK').length,
  invalidated:events.filter(e=>e.status==='INVALIDATED').length,
  stopped:events.filter(e=>e.status==='STOP').length,
  timedOut:events.filter(e=>e.status==='TIMEOUT').length,
  timingUnproven:events.filter(e=>e.status==='TIMING_UNPROVEN').length,
  ambiguous:events.filter(e=>e.status==='AMBIGUOUS').length,
  medianLeadLowerBoundSeconds:mins.length?mins[Math.floor(mins.length/2)]:null,
  sampleReady:evaluated>=70,modelQualified:false,tradingEnabled:false,
  outcomeBasis:'GROSS_PRICE_LEVELS_NOT_EXECUTED_PNL',
  current:events.findLast(e=>active(e.status))??null,recent:events.slice(-6).reverse()};
}
