import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import {assessM1DirectionalPriority} from './sniper-m1-priority';

/** A causal BUY/SELL hypothesis for EVERY adjacent, freshly closed minute.
 * Unlike the certified entry engine, low-pressure minutes are NOT discarded:
 * they receive a directional guess plus an explicit LOW_EVIDENCE warning.
 * Scores are signed pressure magnitudes, never calibrated win percentages.
 */
export type EveryM1Direction={
  issuedAt:number;side:'BUY'|'SELL';pressure:number;weak:boolean;
  atr:number;anchorTime:number;pattern:'SWEEP_REJECTION'|'MOMENTUM';
  directionReason:string
};
export function everyM1Direction(raw:readonly M1Bar[],now:number):EveryM1Direction|null{
  const rows=closedM1ChartBars(raw,now,72),last=rows.at(-1);
  if(rows.length<21||!last||now-last.time-60000<0||
    now-last.time-60000>=60000)return null;
  // One-minute research cannot claim a new signal from a stitched,
  // discontinuous candle feed. A missing minute is missing evidence.
  const window=rows.slice(-21);
  if(window.some((bar,i)=>i>0&&bar.time-window[i-1].time!==60000))
    return null;
  const p=assessM1DirectionalPriority(rows,now);
  if(!p.ready)return null;
  const ranges=rows.slice(-15).map((b,i,a)=>i===0?b.high-b.low:
    Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
      Math.abs(b.low-a[i-1].close)));
  const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;
  if(!Number.isFinite(atr)||atr<=0)return null;
  const prior=rows.slice(-7,-1);
  const priorHigh=Math.max(...prior.map(x=>x.high));
  const priorLow=Math.min(...prior.map(x=>x.low));
  const candleRange=Math.max(atr*.08,last.high-last.low);
  const upperWick=last.high-Math.max(last.open,last.close);
  const lowerWick=Math.min(last.open,last.close)-last.low;
  // Closed-bar sweep followed by a rejection is a genuinely new reason
  // to prefer a reversal over lagging EMA momentum. No future candle/tick.
  const rejectHigh=last.high>priorHigh+atr*.03&&
    last.close<priorHigh-atr*.05&&
    upperWick/candleRange>=.38&&last.close<last.open;
  const rejectLow=last.low<priorLow-atr*.03&&
    last.close>priorLow+atr*.05&&
    lowerWick/candleRange>=.38&&last.close>last.open;
  const reversal:EveryM1Direction['side']|null=
    rejectHigh&&!rejectLow?'SELL':rejectLow&&!rejectHigh?'BUY':null;
  const signed=.48*p.emaSpreadAtr+.30*p.impulseAtr+.15*p.closeLocation;
  const prev=rows.at(-2)!;
  const momentum:EveryM1Direction['side']=p.side!=='WAIT'?p.side:
    signed>0?'BUY':signed<0?'SELL':
      last.close>last.open?'BUY':last.close<last.open?'SELL':
        last.close>=prev.close?'BUY':'SELL';
  const side=reversal||momentum;
  const weak=p.side==='WAIT'||(reversal!=null&&reversal!==momentum);
  return {issuedAt:last.time+60000,side,pressure:p.pressureScore,
    weak,atr,anchorTime:last.time,
    pattern:reversal?'SWEEP_REJECTION':'MOMENTUM',
    directionReason:reversal?'رفض كسر قمة/قاع بعد سحب سيولة في شمعة مغلقة':
      'ترجيح من إغلاق وزخم شموع ماضية فقط'};
}
