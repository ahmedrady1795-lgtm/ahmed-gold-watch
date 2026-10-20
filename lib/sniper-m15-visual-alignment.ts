/**
 * Visual safety gate only. Frozen forecast OHLC stays in the audit ledger.
 * Never shift or rewrite predictions to follow new live quotes.
 */
export type M15AlignmentBar={open:number;high:number;low:number;close:number};
export function assessM15FrozenChartAlignment(input:{
  original:readonly M15AlignmentBar[];historical:readonly M15AlignmentBar[];
  live:number|null;atr:number|null;elapsedSteps:number
}):{visible:boolean;reason:'ALIGNED'|'MOVED_AWAY'|'NO_LIVE';difference:number;limit:number}{
  const first=input.original[0];
  if(!first||!Number.isFinite(input.live)||input.live==null||input.live<=0)
    return {visible:false,reason:'NO_LIVE',difference:0,limit:0};
  const bars=input.original,idx=Math.max(0,Math.min(bars.length,
    Math.floor(input.elapsedSteps)));
  const reference=idx===0?first.open:bars[idx-1].close;
  const lengths=input.historical.slice(-20).map(b=>b.high-b.low)
    .filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
  const ordinary=lengths.length?lengths[Math.floor(lengths.length/2)]:0;
  const atr=Number.isFinite(input.atr)&&input.atr!>0?input.atr!:0;
  const limit=Math.max(reference*.0004,ordinary*2.0,atr*1.8,.02);
  const difference=Math.abs(input.live-reference);
  const visible=difference<=limit;
  return {visible,reason:visible?'ALIGNED':'MOVED_AWAY',difference,limit};
}
