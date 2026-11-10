/** Rebuild ONLY fully closed 15-minute XAUUSD OHLC from three actual,
 * consecutive five-minute candles from the SAME market-data provider.
 * This is a gap repair, not interpolation, and never mixes venues.
 * Native M15 values are immutable; if aggregation disagrees with any
 * recent overlapping native bar, no gap repair is trusted. */
export type GoldOHLC={
  time:number;open:number;high:number;low:number;close:number;
  tickVolume?:number;realVolume?:number;
};
export type GoldM15Repair={
  bars:GoldOHLC[];added:number;verifiedOverlaps:number;
  status:'REPAIRED'|'UNCHANGED'|'NOT_ENOUGH_OVERLAP'|'SOURCE_CONFLICT';
};
const M5=300000,M15=900000;
const valid=(b:GoldOHLC,period:number,now:number)=>b!=null&&
  [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
  Number.isSafeInteger(b.time)&&b.time>0&&b.time%period===0&&
  b.time+period<=now&&b.open>0&&b.low>0&&
  b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
const closeEnough=(a:GoldOHLC,b:GoldOHLC)=>{
  // A tiny floating-point/rounding tolerance, NOT a cross-venue bridge.
  const tolerance=Math.max(.07,Math.max(a.close,b.close)*.000025);
  return Math.abs(a.open-b.open)<=tolerance&&
    Math.abs(a.close-b.close)<=tolerance&&
    Math.abs(a.high-b.high)<=tolerance&&
    Math.abs(a.low-b.low)<=tolerance;
};
export function repairGoldM15FromM5(
  m5:readonly GoldOHLC[],native:readonly GoldOHLC[],now:number
):GoldM15Repair{
  const unchanged=(status:GoldM15Repair['status'],verifiedOverlaps=0):GoldM15Repair=>
    ({bars:[...(native||[])],added:0,verifiedOverlaps,status});
  if(!Array.isArray(m5)||!Array.isArray(native)||!Number.isFinite(now))
    return unchanged('NOT_ENOUGH_OVERLAP');
  const nativeByTime=new Map<number,GoldOHLC>();
  for(const bar of native)if(valid(bar,M15,now))nativeByTime.set(bar.time,bar);
  const groups=new Map<number,GoldOHLC[]>();
  for(const bar of m5){
    if(!valid(bar,M5,now))continue;
    const at=Math.floor(bar.time/M15)*M15;
    const rows=groups.get(at)||[];
    if(!rows.some(b=>b.time===bar.time))rows.push(bar);
    groups.set(at,rows);
  }
  const completed=new Map<number,GoldOHLC>();
  for(const [at,rows] of groups){
    const ordered=rows.sort((a,b)=>a.time-b.time);
    if(ordered.length!==3||ordered.some((b,i)=>b.time!==at+i*M5)||
      at+M15>now)continue;
    const validVolume=(k:'tickVolume'|'realVolume')=>
      ordered.every(b=>typeof b[k]==='number'&&Number.isFinite(b[k])&&b[k]!>=0);
    const bar:GoldOHLC={time:at,open:ordered[0].open,close:ordered[2].close,
      high:Math.max(...ordered.map(b=>b.high)),
      low:Math.min(...ordered.map(b=>b.low))};
    if(validVolume('tickVolume'))
      bar.tickVolume=ordered.reduce((sum,b)=>sum+(b.tickVolume||0),0);
    if(validVolume('realVolume'))
      bar.realVolume=ordered.reduce((sum,b)=>sum+(b.realVolume||0),0);
    completed.set(at,bar);
  }
  // Only compare SAME-SESSION, recently observed overlaps. A one-bar
  // match cannot establish same-venue price identity.
  const overlap=[...completed.entries()].filter(([at])=>nativeByTime.has(at))
    .sort((a,b)=>b[0]-a[0]).slice(0,24);
  if(overlap.length<5)return unchanged('NOT_ENOUGH_OVERLAP',overlap.length);
  if(overlap.some(([at,bar])=>!closeEnough(bar,nativeByTime.get(at)!)))
    return unchanged('SOURCE_CONFLICT',overlap.length);
  let added=0;
  const merged=new Map<number,GoldOHLC>();
  for(const bar of native)if(valid(bar,M15,now))merged.set(bar.time,bar);
  for(const [at,bar] of completed)if(!merged.has(at)){
    merged.set(at,bar);added++;
  }
  if(!added)return unchanged('UNCHANGED',overlap.length);
  return {bars:[...merged.values()].sort((a,b)=>a.time-b.time),
    added,verifiedOverlaps:overlap.length,status:'REPAIRED'};
}
