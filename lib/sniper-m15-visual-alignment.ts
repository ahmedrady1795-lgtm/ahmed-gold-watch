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
  // Use ordinary range/ATR from closed M15 data, but do not give a
  // runaway last live candle two entire M15 ranges of visual leeway.
  // A saved analogue remains in the audit ledger; only its on-screen route
  // can be detached. There is no retroactive change to any OHLC or target.
  const limit=Math.max(reference*.00032,ordinary*1.3,atr*1.45,.02);
  const difference=Math.abs(input.live-reference);
  const predicted=bars[Math.min(idx,bars.length-1)];
  // A new impulse beyond the current predicted candle's extremum is a
  // stronger sign of divergence than the candle's closing-price error alone.
  const tolerance=Math.max(atr*.72,ordinary*.65,reference*.00015);
  const outside=predicted&&
    (input.live>predicted.high+tolerance||input.live<predicted.low-tolerance);
  const visible=difference<=limit&&!outside;
  return {visible,reason:visible?'ALIGNED':'MOVED_AWAY',difference,limit};
}
