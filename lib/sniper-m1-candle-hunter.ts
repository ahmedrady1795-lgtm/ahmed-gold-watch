import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';

/**
 * A new, read-only, one-minute OCO-style watch on EACH closed candle.
 * BUY STOP and SELL STOP are independent hypothetical breakout levels, NOT
 * broker orders or a profitable trading strategy. No intrabar lookahead.
 */
export type CandleHunterSide='BUY'|'SELL';
export type CandleHunterLevel={
  side:CandleHunterSide;trigger:number;target:number;stop:number
};
export type CandleHunter={
  ready:boolean;reason:string;issuedAt:number|null;expiresAt:number|null;
  candleTime:number|null;atr:number|null;
  buy:CandleHunterLevel|null;sell:CandleHunterLevel|null;tradeEligible:false
};
export type HunterOutcome='NO_TRIGGER'|'TARGET_TOUCHED'|'STOP_TOUCHED'|
  'AMBIGUOUS'|'OPEN_GAP_UNKNOWN'|'TRIGGERED_PENDING';
export type HunterScore={
  observed:number;targetTouches:number;stopTouches:number;
  ambiguous:number;openGapUnknown:number;noTrigger:number;pending:number
};
const round=(v:number)=>Number(v.toFixed(6));
const empty=(reason:string):CandleHunter=>({
  ready:false,reason,issuedAt:null,expiresAt:null,candleTime:null,atr:null,
  buy:null,sell:null,tradeEligible:false
});
const continuous=(rows:M1Bar[])=>rows.every((r,i)=>i===0||r.time-rows[i-1].time===60000);
export function buildCandleHunter(args:{
  bars:readonly M1Bar[];now:number;sourceReady:boolean;marketOpen:boolean;
  providerTransition?:boolean
}):CandleHunter{
  const {now}=args;
  if(!args.marketOpen)return empty('السوق مغلق؛ لا رصد M1 حي');
  if(!args.sourceReady||args.providerTransition)return empty('مصدر الشموع غير حديث أو قيد التبديل');
  const rows=closedM1ChartBars(args.bars,now,72);
  const last=rows.at(-1);
  if(!last||rows.length<21||!continuous(rows.slice(-21)))
    return empty('نحتاج 21 شمعة M1 مغلقة ومتجاورة من نفس المصدر');
  const issuedAt=last.time+60000,expiresAt=issuedAt+60000;
  if(now<issuedAt||now>=expiresAt)
    return empty('انتهى وقت القنص لهذه الشمعة؛ انتظار إغلاق M1 التالية');
  const tail=rows.slice(-15);
  const trueRanges=tail.slice(1).map((r,i)=>Math.max(r.high-r.low,
    Math.abs(r.high-tail[i].close),Math.abs(r.low-tail[i].close)));
  const atr=trueRanges.reduce((a,b)=>a+b,0)/trueRanges.length;
  if(!Number.isFinite(atr)||atr<=0||atr>last.close*.04)
    return empty('تقلب M1 غير صالح؛ لا مستويات آمنة للعرض');
  // Both levels are fixed to the most recently CLOSED M1 bar. The next
  // full M1 bar is the only observation interval. No tick repaints them.
  const buffer=Math.max(.000001,atr*.08);
  const buyTrigger=round(last.high+buffer),sellTrigger=round(last.low-buffer);
  const buy:CandleHunterLevel={side:'BUY',trigger:buyTrigger,
    target:round(buyTrigger+atr*.72),stop:round(buyTrigger-atr*.82)};
  const sell:CandleHunterLevel={side:'SELL',trigger:sellTrigger,
    target:round(sellTrigger-atr*.72),stop:round(sellTrigger+atr*.82)};
  if(buy.stop<=0||sell.target<=0)
    return empty('الأسعار المستهدفة غير صالحة');
  return {ready:true,reason:'مراقبة كسر قمة أو قاع آخر شمعة M1 مغلقة لمدة دقيقة واحدة؛ لا تفعيل تلقائي',
    issuedAt,expiresAt,candleTime:last.time,atr:round(atr),buy,sell,
    tradeEligible:false};
}

/**
 * Keep the most recent CLOSED-candle watch visible as a REFERENCE if the
 * upstream historical feed is one or two minutes behind the wall clock.
 * This never extends its one-minute validity or authorizes an entry.
 * A reference is unavailable after 3 minutes, on source changes/stale feeds,
 * or when there are fewer than 21 contiguous closed bars.
 */
export type CandleHunterDisplay={
  kind:'LIVE'|'EXPIRED_REFERENCE'|'NONE';
  plan:CandleHunter;
  reason:string
};
export function displayCandleHunter(args:Parameters<typeof buildCandleHunter>[0]):CandleHunterDisplay{
  const live=buildCandleHunter(args);
  if(live.ready)return {kind:'LIVE',plan:live,reason:live.reason};
  if(!args.marketOpen||!args.sourceReady||args.providerTransition)
    return {kind:'NONE',plan:live,reason:live.reason};
  const closed=closedM1ChartBars(args.bars,args.now,72);
  const last=closed.at(-1);
  if(!last)return {kind:'NONE',plan:live,reason:live.reason};
  const issuedAt=last.time+60000;
  // A fresh watch always expires after exactly 60s. Never call these levels
  // current after expiry, and never display stale prices indefinitely.
  if(args.now<issuedAt+60000||args.now>issuedAt+3*60000)
    return {kind:'NONE',plan:live,reason:live.reason};
  const reference=buildCandleHunter({...args,now:issuedAt+1});
  if(!reference.ready)return {kind:'NONE',plan:live,reason:live.reason};
  return {kind:'EXPIRED_REFERENCE',plan:reference,
    reason:'آخر مستويات قنص محسوبة من شمعة M1 مغلقة؛ انتهت صلاحيتها. بانتظار إغلاق أحدث من مصدر الشموع'};
}

/** OHLC alone cannot establish fill order or actual broker execution. */
export function scoreNextClosedM1(setup:CandleHunter,next:M1Bar):HunterOutcome{
  if(!setup.ready||!setup.buy||!setup.sell)return 'NO_TRIGGER';
  const {buy,sell}=setup;
  if(next.time!==setup.issuedAt)return 'AMBIGUOUS';
  const up=next.high>=buy.trigger,down=next.low<=sell.trigger;
  if(up&&down)return 'AMBIGUOUS';
  if(!up&&!down)return 'NO_TRIGGER';
  const selected=up?buy:sell;
  // A gap through the trigger at bar open has unknown actual fill price.
  if(up?next.open>=selected.trigger:next.open<=selected.trigger)
    return 'OPEN_GAP_UNKNOWN';
  const hitTarget=up?next.high>=selected.target:next.low<=selected.target;
  const hitStop=up?next.low<=selected.stop:next.high>=selected.stop;
  if(hitTarget&&hitStop)return 'AMBIGUOUS';
  if(hitTarget)return 'TARGET_TOUCHED';
  if(hitStop)return 'AMBIGUOUS'; // Cannot determine whether SL preceded entry within M1.
  return 'TRIGGERED_PENDING';
}
export function auditCandleHunter(bars:readonly M1Bar[],now:number,limit=48):HunterScore{
  const closed=closedM1ChartBars(bars,now,72);
  const result:HunterScore={observed:0,targetTouches:0,stopTouches:0,
    ambiguous:0,openGapUnknown:0,noTrigger:0,pending:0};
  for(let i=Math.max(20,closed.length-Math.max(1,Math.min(limit,48))-1);i<closed.length-1;i++){
    const asOf=closed[i].time+60000;
    const setup=buildCandleHunter({bars:closed.slice(0,i+1),now:asOf,
      marketOpen:true,sourceReady:true});
    if(!setup.ready)continue;
    result.observed++;
    const outcome=scoreNextClosedM1(setup,closed[i+1]);
    if(outcome==='TARGET_TOUCHED')result.targetTouches++;
    else if(outcome==='STOP_TOUCHED')result.stopTouches++;
    else if(outcome==='AMBIGUOUS')result.ambiguous++;
    else if(outcome==='OPEN_GAP_UNKNOWN')result.openGapUnknown++;
    else if(outcome==='TRIGGERED_PENDING')result.pending++;
    else result.noTrigger++;
  }
  return result;
}
