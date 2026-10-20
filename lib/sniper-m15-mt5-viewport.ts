/**
 * MT5-style candle viewport and visual-only compact target continuation.
 *
 * Focus zoom must never change recorded OHLC, simulated OHLC, target prices,
 * or the backtest. Only the drawing viewport and the number of illustrative
 * (non-timed, non-scored) bodies change.
 */
export type DrawingM15={open:number;high:number;low:number;close:number};
const good=(b:DrawingM15)=>b&&[b.open,b.high,b.low,b.close].every(Number.isFinite)&&
 b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
export function compactM15TargetDrawing(
 bars:readonly DrawingM15[],timedCount:number,maxExtension=15
):DrawingM15[]{
 if(!Array.isArray(bars)||!bars.length||bars.some(b=>!good(b)))return [];
 if(!Number.isInteger(timedCount)||timedCount<1||timedCount>bars.length)return [];
 const main=bars.slice(0,timedCount).map(b=>({...b}));
 const extra=bars.slice(timedCount);
 if(!extra.length)return main;
 const chunks=Math.max(1,Math.min(extra.length,Math.floor(maxExtension)||15));
 const output=[...main];
 for(let i=0;i<chunks;i++){
  const from=Math.floor(i*extra.length/chunks),to=Math.floor((i+1)*extra.length/chunks);
  const group=extra.slice(from,to);
  if(!group.length)continue;
  output.push({open:group[0].open,close:group[group.length-1].close,
   high:Math.max(...group.map(b=>b.high)),low:Math.min(...group.map(b=>b.low))});
 }
 return output;
}

export type ViewportRange={lo:number;hi:number;zoomed:boolean};
export function mt5M15Viewport(input:{
 mode:'FOCUS'|'ALL';allLow:number;allHigh:number;lastPrice:number|null;
 history:readonly DrawingM15[];forecast:readonly DrawingM15[];
 atr?:number|null
}):ViewportRange{
 const {allLow,allHigh,lastPrice}=input;
 const validFull=Number.isFinite(allLow)&&Number.isFinite(allHigh)&&
   allLow>0&&allHigh>=allLow;
 const pivot=lastPrice!=null&&Number.isFinite(lastPrice)&&lastPrice>0?lastPrice:
   input.history.at(-1)?.close??1;
 const range=(low:number,high:number,zoomed:boolean):ViewportRange=>{
  const spread=Math.max(high-low,pivot*.0003,input.atr??0,1);
  return {lo:Math.max(.000001,low-spread*.075),
    hi:high+spread*.075,zoomed};
 };
 if(input.mode==='ALL')return range(validFull?allLow:pivot,
   validFull?allHigh:pivot,false);
 // Use the last OBSERVED 30 M15 bars plus the original time-bounded
 // model, not remote objectives / large conditional target bridges.
 const original=[...input.history.slice(-30),...input.forecast.slice(0,12)]
   .filter(b=>good(b));
 const prices=original.flatMap(b=>[b.low,b.high]);
 if(pivot>0)prices.push(pivot);
 if(prices.length<4)return range(validFull?allLow:pivot,validFull?allHigh:pivot,false);
 const lo=Math.min(...prices),hi=Math.max(...prices);
 return range(lo,hi,true);
}
