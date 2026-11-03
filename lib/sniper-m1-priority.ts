import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import {buildCandleHunter,type CandleHunter,type CandleHunterSide} from './sniper-m1-candle-hunter';

/**
 * A directional RESEARCH hypothesis from CLOSED M1 candles only.
 * Unlike grid stops, it prioritizes ONE hypothetical direction or WAIT.
 * The pressure score is NOT a calibrated probability or broker permission.
 */
export type M1Priority={
  ready:boolean;side:CandleHunterSide|'WAIT';pressureScore:number;
  anchorTime:number|null;reason:string;
  emaSpreadAtr:number;impulseAtr:number;closeLocation:number;
};
const clamp=(x:number)=>Math.max(-1,Math.min(1,x));
const wait=(reason:string):M1Priority=>({
  ready:false,side:'WAIT',pressureScore:0,anchorTime:null,reason,
  emaSpreadAtr:0,impulseAtr:0,closeLocation:0
});
const ema=(values:number[],span:number)=>{
  const weight=2/(span+1);
  let estimate=values[0];
  for(const value of values.slice(1))estimate+=weight*(value-estimate);
  return estimate;
};
export function assessM1DirectionalPriority(bars:readonly M1Bar[],now:number):M1Priority{
  const recent=closedM1ChartBars(bars,now,72);
  if(recent.length<21)return wait('نحتاج 21 شمعة دقيقة مغلقة ومتجاورة');
  const rows=recent.slice(-21),last=rows.at(-1)!;
  const closedAt=last.time+60000;
  if(now<closedAt||now-closedAt>=60000)
    return wait('لا يوجد إغلاق M1 حديث يصلح لترجيح الدقيقة الجارية');
  const trueRanges=rows.slice(-15).slice(1).map((b,i,tail)=>
    Math.max(b.high-b.low,
      Math.abs(b.high-rows[rows.length-15+i].close),
      Math.abs(b.low-rows[rows.length-15+i].close)));
  const atr=trueRanges.reduce((a,b)=>a+b,0)/Math.max(trueRanges.length,1);
  if(!(Number.isFinite(atr)&&atr>0&&atr<last.close*.04))
    return wait('تقلب M1 غير صالح للترجيح');
  const closes=rows.map(b=>b.close);
  const emaSpreadAtr=(ema(closes,5)-ema(closes,13))/atr;
  const impulseAtr=(last.close-rows[rows.length-4].close)/(3*atr);
  const barRange=Math.max(last.high-last.low,atr*.08);
  const closeLocation=clamp(2*(last.close-last.low)/barRange-1);
  const upperWick=Math.max(0,last.high-Math.max(last.open,last.close));
  const lowerWick=Math.max(0,Math.min(last.open,last.close)-last.low);
  const rejection=clamp((lowerWick-upperWick)/barRange);
  const pressure=0.48*clamp(emaSpreadAtr)+0.30*clamp(impulseAtr)+
    0.15*closeLocation+0.07*rejection;
  const side=pressure>=0.22?'BUY':pressure<=-0.22?'SELL':'WAIT';
  return {ready:true,side,pressureScore:Math.round(Math.abs(pressure)*100),
    anchorTime:last.time,emaSpreadAtr,impulseAtr,closeLocation,
    reason:side==='WAIT'?'الإغلاقات لا ترجّح كسرًا واحدًا؛ مراقبة الاتجاهين دون أولوية':
      side==='BUY'?'المتوسطات وزخم الإغلاق يرجّحان مراقبة كسر القمة أولًا':
        'المتوسطات وزخم الإغلاق يرجّحان مراقبة كسر القاع أولًا'};
}

export type PriorityOutcome='NO_TRIGGER'|'TARGET_TOUCHED'|
  'STOP_ORDER_AMBIGUOUS'|'BOTH_BREAKOUTS_AMBIGUOUS'|'GAP_UNKNOWN'|'UNRESOLVED';
/**
 * Single-side OHLC observation. A stop could happen before the chosen
 * trigger on the same candle, so it is NEVER treated as a known stop fill.
 */
export function scorePrioritizedNextM1(plan:CandleHunter,side:CandleHunterSide,
  next:M1Bar):PriorityOutcome{
  if(!plan.ready||!plan.buy||!plan.sell||next.time!==plan.issuedAt)
    return 'UNRESOLVED';
  const preferred=side==='BUY'?plan.buy:plan.sell;
  const other=side==='BUY'?plan.sell:plan.buy;
  const touched=side==='BUY'?next.high>=preferred.trigger:
    next.low<=preferred.trigger;
  if(!touched)return 'NO_TRIGGER';
  // Both breaks in a single OHLC candle have unknowable ordering.
  if(side==='BUY'?next.low<=other.trigger:next.high>=other.trigger)
    return 'BOTH_BREAKOUTS_AMBIGUOUS';
  if(side==='BUY'?next.open>=preferred.trigger:next.open<=preferred.trigger)
    return 'GAP_UNKNOWN';
  const target=side==='BUY'?next.high>=preferred.target:next.low<=preferred.target;
  const stop=side==='BUY'?next.low<=preferred.stop:next.high>=preferred.stop;
  if(stop)return 'STOP_ORDER_AMBIGUOUS';
  if(target)return 'TARGET_TOUCHED';
  return 'UNRESOLVED';
}
export type PriorityAudit={
  observed:number;prioritized:number;balanced:number;targetTouches:number;
  noTrigger:number;ambiguous:number;gapUnknown:number;unresolved:number;
};
export function auditPrioritizedM1(bars:readonly M1Bar[],now:number,limit=48):PriorityAudit{
  const closed=closedM1ChartBars(bars,now,72);
  const out:PriorityAudit={observed:0,prioritized:0,balanced:0,targetTouches:0,
    noTrigger:0,ambiguous:0,gapUnknown:0,unresolved:0};
  const begin=Math.max(20,closed.length-1-Math.max(1,Math.min(48,Math.floor(limit))));
  for(let i=begin;i<closed.length-1;i++){
    const rows=closed.slice(0,i+1),asOf=closed[i].time+60000;
    const plan=buildCandleHunter({bars:rows,now:asOf,sourceReady:true,marketOpen:true});
    if(!plan.ready)continue;
    const priority=assessM1DirectionalPriority(rows,asOf);
    if(!priority.ready)continue;
    out.observed++;
    if(priority.side==='WAIT'){out.balanced++;continue;}
    out.prioritized++;
    const result=scorePrioritizedNextM1(plan,priority.side,closed[i+1]);
    if(result==='TARGET_TOUCHED')out.targetTouches++;
    else if(result==='NO_TRIGGER')out.noTrigger++;
    else if(result==='GAP_UNKNOWN')out.gapUnknown++;
    else if(result==='UNRESOLVED')out.unresolved++;
    else out.ambiguous++;
  }
  return out;
}
export const grossBreakEvenPct=():number=>100*.82/(.82+.72);
