/** Prevent BTC exchange changes from stitching OHLC candles across venues.
 * A provider may replace the chart as soon as it supplies 36 consecutive,
 * fully closed, fresh M1 bars. The whole chart is replaced atomically; no
 * Coinbase and Kraken candles are ever blended. Invalid feeds remain blocked.
 */
type Candle={time:number;open:number;high:number;low:number;close:number};
type Chart={chartCandles:Candle[];candleSource:string;providerTransition?:boolean;pendingProvider?:string};
export type BtcProviderGate={
 accepted:string;candidate:string;lastCandidateClose:number;newCloses:number;
};
export function reconcileBtcChartProvider(
 previous:Chart|null,incoming:Chart|null,
 gate:BtcProviderGate|null,now:number
):{chart:Chart|null;gate:BtcProviderGate|null}{
 if(!incoming)return {chart:previous,gate};
 const source=String(incoming.candleSource||'').trim();
 const rows=Array.isArray(incoming.chartCandles)?incoming.chartCandles:[];
 const recent=rows.slice(-36),end=recent.at(-1);
 const valid=Boolean(source&&recent.length===36&&end&&end.time+60000<=now&&
  now-(end.time+60000)<=90000&&recent.every((b,i)=>Number.isFinite(b.time)&&
  Number.isFinite(b.open)&&Number.isFinite(b.close)&&Number.isFinite(b.high)&&
  Number.isFinite(b.low)&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
  b.low<=Math.min(b.open,b.close)&&
  (i===0||b.time-recent[i-1].time===60000)));
 const prior=gate?.accepted||String(previous?.candleSource||'');
 if(!prior){return {chart:incoming,gate:valid?{
   accepted:source,candidate:'',lastCandidateClose:0,newCloses:0}:null};}
 if(source===prior){
   return {chart:incoming,gate:{accepted:source,candidate:'',lastCandidateClose:0,newCloses:0}};
 }
 // The candidate contains a complete, contiguous, recent same-venue
 // history. Replace the entire series atomically instead of freezing the UI
 // for two extra polling cycles; never merge bars from different exchanges.
 if(valid)return {chart:incoming,gate:{accepted:source,candidate:'',
   lastCandidateClose:0,newCloses:0}};
 const updated:BtcProviderGate={accepted:prior,candidate:source,
   lastCandidateClose:end?.time||0,newCloses:0};
 return {chart:previous?{...previous,providerTransition:true,pendingProvider:source}:
   {...incoming,providerTransition:true,pendingProvider:source},gate:updated};
}
