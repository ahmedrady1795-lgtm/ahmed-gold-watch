import type {Candle} from './engine';

// Separate read-only BTC/Exness CFD feed: never reuse XAU/USD market state,
// BTC-USD exchange fills, or the broker execution signal endpoint.
type ClosedSeries={c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]};
type BtcBrokerState={
  symbol:string;bid:number;ask:number;tickTimeMs:number;receivedAt:number;
  mode:'dry-run';candles:ClosedSeries|null;candlesReceivedAt:number|null;
};
let latest:BtcBrokerState|null=null;
const PERIODS={c1:60000,c5:300000,c15:900000,c60:3600000} as const;

function parseClosed(raw:unknown,intervalMs:number,now:number):Candle[]{
  if(!Array.isArray(raw)||raw.length>500)return [];
  const out:Candle[]=[];
  for(const row of raw){
    if(!row||typeof row!=='object')return [];
    const r=row as Record<string,unknown>;
    const time=Number(r.time),open=Number(r.open),high=Number(r.high);
    const low=Number(r.low),close=Number(r.close);
    if(![time,open,high,low,close].every(Number.isFinite)||
      !Number.isSafeInteger(time)||time<=0||time%intervalMs!==0||
      time+intervalMs>now||open<=0||low<=0||
      low>Math.min(open,close)||high<Math.max(open,close))return [];
    if(out.length&&time<=out[out.length-1].time)return [];
    const tickVolume=Number(r.tickVolume??0);
    out.push({time,open,high,low,close,
      tickVolume:Number.isFinite(tickVolume)&&tickVolume>=0?tickVolume:0});
  }
  return out;
}
function lastAge(bars:Candle[],periodMs:number,now:number){
  const last=bars.at(-1);
  return last?now-(last.time+periodMs):Infinity;
}
function completeCandles(series:ClosedSeries,now:number){
  return series.c1.length>=80&&series.c5.length>=220&&
    series.c15.length>=220&&series.c60.length>=220&&
    lastAge(series.c1,60000,now)<=90000&&
    lastAge(series.c5,300000,now)<=330000&&
    lastAge(series.c15,900000,now)<=1200000&&
    lastAge(series.c60,3600000,now)<=4500000;
}
export function setMt5BtcStatus(input:unknown,now=Date.now()){
  const b=input&&typeof input==='object'?input as Record<string,unknown>:{};
  const symbol=String(b.symbol??'');
  const bid=Number(b.bid),ask=Number(b.ask),tickTimeMs=Number(b.tickTimeMs);
  if(!/^BTCUSD[a-z0-9._-]*$/i.test(symbol)||!Number.isFinite(bid)||
    !Number.isFinite(ask)||bid<=0||ask<bid||
    !Number.isSafeInteger(tickTimeMs)||tickTimeMs<=0||
    tickTimeMs>now+10000||String(b.mode)!=='dry-run')
    throw new Error('invalid BTCUSD broker status');
  let candles=latest?.symbol===symbol?latest.candles:null;
  let candlesReceivedAt=latest?.symbol===symbol?latest.candlesReceivedAt:null;
  if(b.candles!==undefined){
    const inputBars=b.candles&&typeof b.candles==='object'?
      b.candles as Record<string,unknown>:{};
    const parsed:ClosedSeries={
      c1:parseClosed(inputBars.c1,PERIODS.c1,now),
      c5:parseClosed(inputBars.c5,PERIODS.c5,now),
      c15:parseClosed(inputBars.c15,PERIODS.c15,now),
      c60:parseClosed(inputBars.c60,PERIODS.c60,now)
    };
    // Do not treat partial or future bars as broker-verified context.
    if(completeCandles(parsed,now)){candles=parsed;candlesReceivedAt=now;}
  }
  latest={symbol,bid,ask,tickTimeMs,receivedAt:now,mode:'dry-run',
    candles,candlesReceivedAt};
  return getMt5BtcStatus(now);
}
export function getMt5BtcStatus(now=Date.now()){
  const s=latest;
  if(!s)return {connected:false,fresh:false,candlesFresh:false,
    tickAgeMs:null,bridgeAgeMs:null,candlesAgeMs:null,status:null};
  const tickAgeMs=now-s.tickTimeMs,bridgeAgeMs=now-s.receivedAt;
  const candlesAgeMs=s.candlesReceivedAt===null?null:now-s.candlesReceivedAt;
  const fresh=tickAgeMs>=0&&tickAgeMs<=8000&&
    bridgeAgeMs>=0&&bridgeAgeMs<=15000;
  const candlesFresh=Boolean(fresh&&s.candles&&
    candlesAgeMs!==null&&candlesAgeMs>=0&&candlesAgeMs<=45000&&
    completeCandles(s.candles,now));
  return {connected:true,fresh,candlesFresh,
    tickAgeMs,bridgeAgeMs,candlesAgeMs,
    status:{symbol:s.symbol,bid:s.bid,ask:s.ask,tickTimeMs:s.tickTimeMs,
      mode:s.mode,
      candleCounts:s.candles?{
        m1:s.candles.c1.length,m5:s.candles.c5.length,
        m15:s.candles.c15.length,h1:s.candles.c60.length
      }:null}};
}
