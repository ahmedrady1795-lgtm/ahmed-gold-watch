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
  /** Only protect real M1 geometry on the interactive chart.
   * Future-stage OHLC remain plotted at unmodified prices and may fall
   * outside the viewport, exactly as distant TP levels do. */
  protectRealRange?:boolean;
}):PriceViewport{
  const valid=(b:PriceBar)=>b!=null&&Number.isFinite(b.low)&&
    Number.isFinite(b.high)&&b.low>0&&b.high>=b.low;
  const real=(input.real||[]).filter(valid).flatMap(b=>[b.low,b.high]);
  const illustrated=(input.illustrative||[]).filter(valid).flatMap(b=>[b.low,b.high]);
  const ref=Number.isFinite(input.reference)&&Number(input.reference)>0?
    Number(input.reference):real.length?real[real.length-1]:
    illustrated.length?illustrated[illustrated.length-1]:1;
  const floor=Math.max(ref*.000025,
    Number.isFinite(input.atr)&&Number(input.atr)>0?Number(input.atr)*3:0,.01);
  // Do not let an 18/96-step hypothetical price drift resize all the
  // observed M1 bodies to one-pixel streaks. Prices themselves remain
  // untouched; distant illustrative bars simply clip at the viewport edge.
  const realLow=real.length?Math.min(...real):ref*.9999;
  const realHigh=real.length?Math.max(...real):ref*1.0001;
  const realSpan=Math.max(realHigh-realLow,floor);
  const maxExtra=Math.max(realSpan*(input.focus===false?.75:.40),
    Number.isFinite(input.atr)&&Number(input.atr)>0?Number(input.atr)*1.5:0);
  const boundedIllustration=input.protectRealRange&&real.length?
    illustrated.map(value=>Math.max(realLow-maxExtra,
      Math.min(realHigh+maxExtra,value))):illustrated;
  const prices=[...real,...boundedIllustration];
  const min=prices.length?Math.min(...prices):ref*.9999;
  const max=prices.length?Math.max(...prices):ref*1.0001;
  // Minimal padding for doji-only M1 stretches. It is deliberately much
  // smaller than a forced BTC price-percentage span, which made M1 look flat.
  const core=Math.max(max-min,floor);
  const extra=core*(input.focus===false?.24:.14);
  const midpoint=(min+max)/2;
  const low=Math.max(.000001,midpoint-core/2-extra);
  const high=midpoint+core/2+extra;
  return {low,high,span:high-low};
}

/** A one-pixel doji marker, rather than a fabricated multi-pixel price body. */
export function candleBodyGeometry(openY:number,closeY:number){
  const distance=Math.abs(closeY-openY);
  const minPixel=1;
  return {
    y:distance<minPixel?(openY+closeY-minPixel)/2:Math.min(openY,closeY),
    height:Math.max(minPixel,distance),
    nearDoji:distance<minPixel
  };
}

/** Hold the axis between closed-history revisions. Only real wick excursions
 * can expand it; moving hypothetical candles never resize the observed bars. */
export function stabilizeChartViewport(previous:PriceViewport|null,candidate:PriceViewport,
  real:readonly PriceBar[]):PriceViewport{
  if(!previous)return candidate;
  const valid=real.filter(b=>Number.isFinite(b.low)&&Number.isFinite(b.high)&&b.low>0&&b.high>=b.low);
  if(!valid.length)return previous;
  const low=Math.min(...valid.map(b=>b.low)),high=Math.max(...valid.map(b=>b.high));
  const margin=previous.span*.04;
  if(low>=previous.low+margin&&high<=previous.high-margin)return previous;
  const padding=Math.max(previous.span*.12,(high-low)*.12,.01);
  const nextLow=Math.max(.000001,Math.min(previous.low,low-padding));
  const nextHigh=Math.max(previous.high,high+padding);
  return {low:nextLow,high:nextHigh,span:nextHigh-nextLow};
}
