/**
 * Read-only, MT5-style minute chart derived from real, CLOSED OHLC bars.
 * Never invent bridging candles for a gap or use a future/partial bar as history.
 */
export type M1Bar={time:number;open:number;high:number;low:number;close:number};
const finitePrice=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export function validM1Bar(c:unknown):c is M1Bar{
  if(!c||typeof c!=='object')return false;
  const v=c as M1Bar;
  return Number.isSafeInteger(v.time)&&v.time>0&&v.time%60000===0&&
    finitePrice(v.open)&&finitePrice(v.high)&&finitePrice(v.low)&&finitePrice(v.close)&&
    v.high>=Math.max(v.open,v.close)&&v.low<=Math.min(v.open,v.close)&&v.low<=v.high;
}
export function closedM1ChartBars(input:readonly M1Bar[]|null|undefined,now:number,maxBars=36):M1Bar[]{
  if(!Array.isArray(input)||!Number.isFinite(now))return [];
  const n=Math.max(1,Math.min(72,Math.floor(maxBars)||36));
  // Preserve source order. A duplicate or backward timestamp is not a new bar.
  const accepted:M1Bar[]=[];
  for(const bar of input){
    if(!validM1Bar(bar)||bar.time+60000>now)continue;
    const previous=accepted.at(-1);
    if(previous&&bar.time<=previous.time)continue;
    accepted.push(bar);
  }
  // Never draw a missing minute as a contiguous candle. Start a new visual
  // run after each data-source gap instead of joining unrelated OHLC periods.
  let start=accepted.length?accepted.length-1:0;
  while(start>0&&accepted[start].time-accepted[start-1].time===60000)start--;
  return accepted.slice(Math.max(start,accepted.length-n));
}
export function fixedM1PriceRange(bars:readonly M1Bar[]):{low:number;high:number}{
  if(!bars.length)return {low:0,high:1};
  const low=Math.min(...bars.map(c=>c.low));
  const high=Math.max(...bars.map(c=>c.high));
  const anchor=bars.at(-1)!.close;
  const span=Math.max(high-low,anchor*.00025,.05);
  const center=(high+low)/2;
  return {low:center-span*.62,high:center+span*.62};
}
