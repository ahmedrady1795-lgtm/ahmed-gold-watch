/**
 * Partial one-minute candle from timestamped quotes observed in THIS browser.
 * The first sampled tick is NOT a proven exchange-minute open and highs/lows
 * cover observed ticks only. Never backfill missing ticks or mix venues.
 */
export type SampledLiveCandle={
 time:number;open:number;high:number;low:number;close:number;
 lastAt:number;count:number;sourceKey:string;matchedVenue:boolean
};
export type TickInput={now:number;at:number;price:number;sourceKey:string;
  historicalSource:string;lastClosedAt:number};
export function sourceVenue(s:string){
 const v=String(s||'').toLowerCase();
 return /coinbase/.test(v)?'COINBASE':/kraken|xbt\/usd/.test(v)?'KRAKEN':
   /biquote/.test(v)?'BIQUOTE':/exness/.test(v)?'EXNESS':
   /yahoo|comex|gc=f/.test(v)?'YAHOO':'UNKNOWN';
}
export function updateSampledLiveCandle(prev:SampledLiveCandle|null,q:TickInput):SampledLiveCandle|null{
 const {now,at,price,sourceKey,historicalSource,lastClosedAt}=q;
 if(![now,at,price,lastClosedAt].every(Number.isFinite)||price<=0||!sourceKey||
   at>now+1000||now-at>10000||at<=0)return null;
 const minute=Math.floor(now/60000)*60000;
 if(Math.floor(at/60000)*60000!==minute||
   lastClosedAt>minute||lastClosedAt<minute-60000)return null;
 const observedVenue=sourceVenue(sourceKey),histVenue=sourceVenue(historicalSource);
 const matchedVenue=observedVenue!=='UNKNOWN'&&observedVenue===histVenue;
 const fullKey=[sourceKey,historicalSource].join('|');
 if(!prev||prev.sourceKey!==fullKey||prev.time!==minute)
   return {time:minute,open:price,high:price,low:price,close:price,
     lastAt:at,count:1,sourceKey:fullKey,matchedVenue};
 if(at<=prev.lastAt)return prev;
 return {...prev,high:Math.max(prev.high,price),low:Math.min(prev.low,price),
   close:price,lastAt:at,count:prev.count+1,matchedVenue};
}
export function visibleSampledLiveCandle(prev:SampledLiveCandle|null,now:number,
  lastClosedAt:number,sourceKey:string,historicalSource:string){
 if(!prev||!Number.isFinite(now)||!Number.isFinite(lastClosedAt)||
   prev.time!==Math.floor(now/60000)*60000||
   now-prev.lastAt>10000||prev.lastAt>now+1000||
   lastClosedAt<prev.time-60000||lastClosedAt>prev.time||
   prev.sourceKey!==[sourceKey,historicalSource].join('|'))return null;
 return prev;
}
