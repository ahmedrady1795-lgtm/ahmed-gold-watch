/**
 * Browser-only storage payload for previously OBSERVED, fully-closed OHLC.
 * No synthetic candle and no stale feed is ever promoted to LIVE or used
 * to certify BUY/SELL. In particular gold/GC/PAXG sources never mix.
 */
export const CHART_LAST_GOOD_KEY='qannas-chart-last-closed-v1';
export const CHART_LAST_GOOD_MAX_AGE_MS=72*3600000;
type Frame='m1'|'m5'|'m15'|'h1';
type Bar={time:number;open:number;high:number;low:number;close:number;volume?:number;volumeBasis?:string};
export type StoredChart={
 chartCandles:Bar[];
 chartHigherFrames:{m5:Bar[];m15:Bar[];h1:Bar[]};
 candleSource:string;lastClosedAt:number;fresh:false;historicalOnly:true;
 providerTransition:true;historyRecoveredAt:number;
};
type StoredPayload={version:1;storedAt:number;gold?:StoredChart;bitcoin?:StoredChart};
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
function bars(value:unknown,period:number,now:number,limit:number):Bar[]{
 if(!Array.isArray(value)||value.length>1000)return [];
 const result:Bar[]=[];
 let previous=0;
 for(const b of value.slice(-limit)){
  if(!b||!Number.isSafeInteger(b.time)||b.time%period!==0||
     b.time+period>now+1500||b.time<=previous||
     ![b.open,b.high,b.low,b.close].every(valid)||
     b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))return [];
  previous=b.time;
  result.push({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,
    volume:Number.isFinite(b.volume)&&b.volume>=0?b.volume:0,
    volumeBasis:['REAL','TICK','NONE'].includes(b.volumeBasis)?b.volumeBasis:'NONE'});
 }
 return result;
}
export function historicalChartAsset(asset:'gold'|'bitcoin',value:any,now:number):StoredChart|null{
 if(!value||typeof value!=='object'||!Number.isSafeInteger(now))return null;
 const candleSource=String(value.candleSource||'');
 if(!candleSource||candleSource.length>160||/unavailable|unknown|proxy unavailable/i.test(candleSource))return null;
 if(asset==='gold'&&!/XAU|MT5|COMEX|GC=F/i.test(candleSource))return null;
 if(asset==='bitcoin'&&!/BTC|Coinbase|Kraken|Binance|OKX/i.test(candleSource))return null;
 const chartCandles=bars(value.chartCandles,60000,now,480);
 const h=value.chartHigherFrames||{};
 const m5=bars(h.m5,300000,now,110);
 const m15=bars(h.m15,900000,now,160);
 const h1=bars(h.h1,3600000,now,120);
 if(chartCandles.length<8||m5.length<8||m15.length<8||h1.length<4)return null;
 const last=chartCandles.at(-1)!;
 if(last.time+60000>now+1500||now-(last.time+60000)>CHART_LAST_GOOD_MAX_AGE_MS)return null;
 // No cross-asset or cross-market unit drift can be smuggled into saved frames.
 const anchor=last.close;
 if(asset==='gold'&&(anchor<100||anchor>25000))return null;
 if(asset==='bitcoin'&&(anchor<500||anchor>1000000))return null;
 if(Math.abs(m5.at(-1)!.close-anchor)>anchor*.12||
    Math.abs(m15.at(-1)!.close-anchor)>anchor*.18)return null;
 return {chartCandles,chartHigherFrames:{m5,m15,h1},candleSource,
   lastClosedAt:last.time+60000,fresh:false,historicalOnly:true,
   providerTransition:true,historyRecoveredAt:now};
}
export function prepareChartHistorySave(chart:any,now:number):string|null{
 if(!chart||!Number.isSafeInteger(now))return null;
 const gold=historicalChartAsset('gold',chart.gold,now);
 const bitcoin=historicalChartAsset('bitcoin',chart.bitcoin,now);
 // Never save historical replay as if it was a recent observed data refresh.
 const liveGold=gold&&!chart.gold?.historicalOnly&&gold.lastClosedAt>=now-180000?gold:null;
 const liveBtc=bitcoin&&!chart.bitcoin?.historicalOnly&&bitcoin.lastClosedAt>=now-180000?bitcoin:null;
 if(!liveGold&&!liveBtc)return null;
 return JSON.stringify({version:1,storedAt:now,
   ...(gold?{gold}:{}),...(bitcoin?{bitcoin}:{})});
}
export function restoreChartHistory(raw:string|null,now:number){
 if(!raw||raw.length>800000||!Number.isSafeInteger(now))return null;
 try{
  const j=JSON.parse(raw) as StoredPayload;
  if(j.version!==1||!Number.isSafeInteger(j.storedAt)||
     j.storedAt>now+1500||now-j.storedAt>CHART_LAST_GOOD_MAX_AGE_MS)return null;
  const gold=j.gold?historicalChartAsset('gold',j.gold,now):null;
  const bitcoin=j.bitcoin?historicalChartAsset('bitcoin',j.bitcoin,now):null;
  if(!gold&&!bitcoin)return null;
  return {gold,bitcoin,checkedAt:j.storedAt,ok:true,historicalOnly:true};
 }catch{return null;}
}
export function retainChartDuringOutage(previous:any,returned:any,now:number){
 const choose=(asset:'gold'|'bitcoin')=>{
  const incoming=returned?.[asset];
  if(incoming?.chartCandles?.length>=8&&incoming?.chartHigherFrames?.m5?.length>=8&&
     !incoming.historicalOnly&&incoming.fresh===true)return incoming;
  const old=historicalChartAsset(asset,previous?.[asset],now);
  const serverHistorical=incoming?.historicalOnly?
    historicalChartAsset(asset,incoming,now):null;
  return serverHistorical&&(!old||serverHistorical.lastClosedAt>old.lastClosedAt)?
    serverHistorical:old;
 };
 const gold=choose('gold'),bitcoin=choose('bitcoin');
 if(!gold&&!bitcoin)return null;
 return {ok:true,checkedAt:Number(previous?.checkedAt||now),
   gold,bitcoin,structuralAudit:null,historyOnly:!returned?.ok};
}
