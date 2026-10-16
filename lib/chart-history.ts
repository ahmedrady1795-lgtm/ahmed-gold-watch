/** A lightweight, read-only chart feed independent of the slow AI inference.
 * Only genuine, fully closed OHLC candles are allowed; no synthetic prices. */
type Frame='m1'|'m5'|'m15'|'h1';
export type ChartCandle={time:number;open:number;high:number;low:number;close:number;volume?:number;volumeBasis?:'REAL'|'TICK'|'NONE'};
const positive=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
function dateMs(v:unknown){
  const n=positive(v);
  if(n==null)return null;
  return n>=1e12?n:n>=1e9?n*1000:null;
}
export function closedChartBars(rows:unknown,periodMs:number,now:number,limit=260):ChartCandle[]{
  if(!Array.isArray(rows))return [];
  const seen=new Map<number,ChartCandle>();
  for(const v of rows){
    const time=dateMs(v?.time),open=positive(v?.open),high=positive(v?.high),
      low=positive(v?.low),close=positive(v?.close);
    if(time==null||open==null||high==null||low==null||close==null||
       time+periodMs>now||time<now-9*86400000||time%periodMs!==0||
       high<Math.max(open,close)||low>Math.min(open,close))continue;
    const real=positive(v?.realVolume),tick=positive(v?.tickVolume),
      vol=real??tick??positive(v?.volume)??0;
    seen.set(time,{time,open,high,low,close,volume:vol,
      volumeBasis:real!=null?'REAL':tick!=null?'TICK':'NONE'});
  }
  return [...seen.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
export function chartAssetFromMarket(market:any,now:number){
  if(!market)return null;
  const chartCandles=closedChartBars(market.c1,60000,now,600);
  const chartHigherFrames={
    m5:closedChartBars(market.c5,300000,now,110),
    m15:closedChartBars(market.c15,900000,now,160),
    h1:closedChartBars(market.c60,3600000,now,130)
  };
  const latest=chartCandles.at(-1);
  return {chartCandles,chartHigherFrames,candleSource:String(market.priceSource??market.source??'unavailable'),
    lastClosedAt:latest?latest.time+60000:null,
    fresh:Boolean(latest&&now-(latest.time+60000)<=180000),
    frameCounts:{m1:chartCandles.length,m5:chartHigherFrames.m5.length,
      m15:chartHigherFrames.m15.length,h1:chartHigherFrames.h1.length}};
}
