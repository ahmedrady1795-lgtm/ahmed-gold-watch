/**
 * Price-true M1 viewport. Real candles and illustrative OHLC share one
 * linear Y axis. Far H1/H4 targets are NEVER permitted to squash candle
 * geometry: they live in the off-screen target rail with their true prices.
 *
 * Recompute at closed-M1 boundaries; a streaming quote updates its marker,
 * not the scale. Never magnify illustrated candles relative to real candles.
 */
type PriceBar={low:number;high:number};
export type PriceViewport={
  low:number;high:number;span:number;
};
export function chartPriceViewport(input:{
  real:readonly PriceBar[];
  illustrative?:readonly PriceBar[];
  focus?:boolean;
  reference?:number|null;
  atr?:number|null;
}):PriceViewport{
  const prices=[...(input.real||[]),...(input.illustrative||[])]
    .filter((b):b is PriceBar=>b!=null&&
      Number.isFinite(b.low)&&Number.isFinite(b.high)&&
      b.low>0&&b.high>=b.low)
    .flatMap(b=>[b.low,b.high]);
  const ref=Number.isFinite(input.reference)&&Number(input.reference)>0?
    Number(input.reference):prices.length?prices[prices.length-1]:1;
  const min=prices.length?Math.min(...prices):ref*.9999;
  const max=prices.length?Math.max(...prices):ref*1.0001;
  // Minimal padding for doji-only M1 stretches. It is deliberately much
  // smaller than a forced BTC price-percentage span, which made M1 look flat.
  const floor=Math.max(ref*.000025,
    Number.isFinite(input.atr)&&Number(input.atr)>0?Number(input.atr)*3:0,.01);
  const core=Math.max(max-min,floor);
  const extra=core*(input.focus===false?.24:.14);
  const midpoint=(min+max)/2;
  const low=Math.max(.000001,midpoint-core/2-extra);
  const high=midpoint+core/2+extra;
  return {low,high,span:high-low};
}
