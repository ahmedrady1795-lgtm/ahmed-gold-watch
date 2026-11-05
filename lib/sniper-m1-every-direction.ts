import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import {assessM1DirectionalPriority} from './sniper-m1-priority';

/** A causal BUY/SELL hypothesis for EVERY adjacent, freshly closed minute.
 * Unlike the certified entry engine, low-pressure minutes are NOT discarded:
 * they receive a directional guess plus an explicit LOW_EVIDENCE warning.
 * Scores are signed pressure magnitudes, never calibrated win percentages.
 */
export type EveryM1Direction={
  issuedAt:number;side:'BUY'|'SELL';pressure:number;weak:boolean;
  atr:number;anchorTime:number
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
  const signed=.48*p.emaSpreadAtr+.30*p.impulseAtr+.15*p.closeLocation;
  const prev=rows.at(-2)!;
  const side:EveryM1Direction['side']=p.side!=='WAIT'?p.side:
    signed>0?'BUY':signed<0?'SELL':
      last.close>last.open?'BUY':last.close<last.open?'SELL':
        last.close>=prev.close?'BUY':'SELL';
  const ranges=rows.slice(-15).map((b,i,a)=>i===0?b.high-b.low:
    Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
      Math.abs(b.low-a[i-1].close)));
  const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;
  if(!Number.isFinite(atr)||atr<=0)return null;
  return {issuedAt:last.time+60000,side,pressure:p.pressureScore,
    weak:p.side==='WAIT',atr,anchorTime:last.time};
}
