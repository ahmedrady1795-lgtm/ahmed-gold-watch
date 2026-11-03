import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import {assessM1DirectionalPriority} from './sniper-m1-priority';
export type CandleTapeMark={
  time:number;predicted:'BUY'|'SELL'|'WAIT';observed:'BUY'|'SELL'|'FLAT';
  aligned:boolean|null;open:number;close:number;
};
export type CandleTape={marks:CandleTapeMark[];graded:number;aligned:number};
/**
 * Strictly causal, minute-by-minute direction check.
 * Before candle C closes, derive a WATCH from candles preceding C only.
 * A directional match is NOT a profitable trade or a confirmed TP fill.
 */
export function buildM1CandleTape(history:readonly M1Bar[],now:number,max=9):CandleTape{
  const closed=closedM1ChartBars(history,now,72);
  const marks:CandleTapeMark[]=[];
  const start=Math.max(21,closed.length-Math.max(1,Math.min(12,Math.floor(max))));
  for(let i=start;i<closed.length;i++){
    const candle=closed[i],previous=closed[i-1];
    if(candle.time-previous.time!==60000)continue;
    const priority=assessM1DirectionalPriority(closed.slice(0,i),candle.time);
    if(!priority.ready)continue;
    const observed=candle.close>candle.open?'BUY':
      candle.close<candle.open?'SELL':'FLAT';
    const aligned=priority.side==='WAIT'||observed==='FLAT'?null:
      priority.side===observed;
    marks.push({time:candle.time,predicted:priority.side,
      observed,aligned,open:candle.open,close:candle.close});
  }
  return {marks,graded:marks.filter(x=>x.aligned!==null).length,
    aligned:marks.filter(x=>x.aligned===true).length};
}
