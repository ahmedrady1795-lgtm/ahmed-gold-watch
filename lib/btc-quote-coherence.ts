/** Browser BTC quotes must refer to the exact exchange whose CLOSED M1
 * candles are on screen. Never use arrival time instead of exchange time,
 * let an older REST reply overwrite a newer WebSocket tick, or retain a
 * Coinbase quote as LIVE after the chart changes to Kraken.
 */
export type BtcVenue='COINBASE'|'KRAKEN';
export type ObservedBtcQuote={at:number;venue:BtcVenue};
export function btcVenue(source:unknown):BtcVenue|null {
 const s=typeof source==='string'?source.toLowerCase():'';
 if(/kraken|xbt\/usd/.test(s))return 'KRAKEN';
 if(/coinbase|btc-usd.*extended/.test(s))return 'COINBASE';
 return null;
}
export function btcQuoteMatchesChart(chartSource:unknown,quoteSource:unknown){
 const c=btcVenue(chartSource),q=btcVenue(quoteSource);
 return c!=null&&q!=null&&c===q;
}
export function acceptBtcQuote(a:{
 chartSource:unknown;quoteSource:unknown;at:unknown;now:number;
 previous:ObservedBtcQuote|null;
}):ObservedBtcQuote|null {
 const venue=btcVenue(a.quoteSource);
 if(!venue||!btcQuoteMatchesChart(a.chartSource,a.quoteSource)||
   typeof a.at!=='number'||!Number.isFinite(a.at)||a.at<=0||
   !Number.isFinite(a.now)||a.at>a.now+2000||
   a.now-a.at>10000||a.now-a.at< -2000)
  return null;
 // Once same-source exchange timestamp has advanced, no older poll is
 // allowed to roll the UI back to a previous price or clear its LIVE age.
 if(a.previous?.venue===venue&&a.at<a.previous.at)
  return null;
 return {at:a.at,venue};
}
