import {assessM5CandleLean} from './sniper-m5-candle-lean.ts';
import {goldQuoteMatchesCandles} from './gold-preparation-lead.ts';
import {acceptGoldPulse} from './gold-tick-quality.ts';
import {goldMarketSession} from './gold-market-session.ts';

export type GoldOpeningCall={target:number;issued:number;side:'BUY'|'SELL';reason:string;
  source:string;quoteSource:string;quoteAt:number;priceAt:number};
export const openingWindowMs=30000;
export function validOpeningCall(value:unknown,now:number):value is GoldOpeningCall{
 const p=value as GoldOpeningCall;
 return Boolean(p&&Number.isSafeInteger(p.target)&&p.target%300000===0&&
   Number.isSafeInteger(p.issued)&&p.issued<=now&&p.target>p.issued&&p.target-p.issued<=openingWindowMs&&
   now<p.target+300000&&(p.side==='BUY'||p.side==='SELL')&&typeof p.reason==='string'&&
   goldQuoteMatchesCandles(p.quoteSource,p.source)&&Number.isFinite(p.priceAt)&&p.priceAt>0&&
   Number.isSafeInteger(p.quoteAt)&&p.quoteAt<=p.issued&&p.issued-p.quoteAt<=10000);
}
export function nextGoldOpeningCall(previous:GoldOpeningCall|null,now:number,
 chart:{fresh?:boolean;candleSource?:string;chartCandles?:unknown;chartHigherFrames?:{m5?:unknown}}|null,
 quote:any):GoldOpeningCall|null{
 const target=(Math.floor(now/300000)+1)*300000;
 if(previous?.target===target&&validOpeningCall(previous,now))return previous;
 if(target-now>openingWindowMs||!goldMarketSession(now).open||!goldMarketSession(target).open||
    !chart?.fresh||!chart.candleSource||!quote?.ok||quote.status!=='live'||
    !goldQuoteMatchesCandles(quote.source,chart.candleSource))return null;
 const tick=acceptGoldPulse(quote,now);
 if(!tick||tick.sourceTime>now)return null;
 const lean=assessM5CandleLean({now,price:tick.price,sourceReady:true,
   m1:chart.chartCandles,m5:chart.chartHigherFrames?.m5});
 if(lean.phase!=='CLOSE'||lean.side==='WAIT')return null;
 return {target,issued:now,side:lean.side,reason:lean.reason,source:chart.candleSource,
   quoteSource:quote.source,quoteAt:tick.sourceTime,priceAt:tick.price};
}
