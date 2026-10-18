/** Prevent an unannounced BTC exchange switch from resetting a frozen M1
 * target ladder, or stitching OHLC candles across different exchanges.
 * A candidate provider must supply TWO fresh, successive NEW closed M1 bars
 * before it can replace the last accepted provider's historical chart.
 * During the handoff the old chart is historical-only; no scenario can run.
 * This guard does not rewrite either provider's genuine OHLC values.
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
 const candidate=gate?.candidate===source?gate:null;
 const freshNew=Boolean(valid&&candidate&&end!.time>candidate.lastCandidateClose);
 const updated:BtcProviderGate={accepted:prior,candidate:source,
   lastCandidateClose:valid?(end?.time||0):(candidate?.lastCandidateClose||0),
   newCloses:freshNew?(candidate!.newCloses+1):0};
 if(updated.newCloses>=2&&valid)
   return {chart:incoming,gate:{accepted:source,candidate:'',lastCandidateClose:0,newCloses:0}};
 return {chart:previous?{...previous,providerTransition:true,pendingProvider:source}:
   {...incoming,providerTransition:true,pendingProvider:source},gate:updated};
}
