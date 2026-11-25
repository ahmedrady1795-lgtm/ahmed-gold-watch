import {assessM5CandleLean} from './sniper-m5-candle-lean.ts';
import {goldQuoteMatchesCandles,readGoldPreparation} from './gold-preparation-lead.ts';
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
 quote:any,previousQuotes:readonly any[]=[]):GoldOpeningCall|null{
 const target=(Math.floor(now/300000)+1)*300000;
 if(previous?.target===target&&validOpeningCall(previous,now))return previous;
 if(target-now>openingWindowMs||!goldMarketSession(now).open||!goldMarketSession(target).open||
    !chart?.fresh||!chart.candleSource||!quote?.ok||quote.status!=='live'||
    !goldQuoteMatchesCandles(quote.source,chart.candleSource))return null;
 const tick=acceptGoldPulse(quote,now);
 if(!tick||tick.sourceTime>now)return null;
 // Prefer a causal setup that is still BEFORE its trigger. A price-only
 // continuation is a separately labelled watch, not verified order flow.
 const closed=Array.isArray(chart.chartCandles)?
   chart.chartCandles.filter(b=>b?.time+60000<=now-3000):[];
 const preparation=readGoldPreparation({now,source:chart.candleSource,bars:closed,
   quote,previousQuotes,marketOpen:true}).plan;
 if(preparation){
   return {target,issued:now,side:preparation.side,
     reason:'تحضير قبل الكسر · '+preparation.reason+' · توقع افتتاح غير مؤكد (سعري)',
     source:chart.candleSource,quoteSource:quote.source,
     quoteAt:tick.sourceTime,priceAt:tick.price};
 }
 // Reserve the first half of the preparation window for an actual
 // unbroken setup; otherwise a weak momentum fallback freezes the side
 // before fresh rejection/compression evidence has time to arrive.
 if(target-now>15000)return null;
 const lean=assessM5CandleLean({now,price:tick.price,sourceReady:true,
   m1:chart.chartCandles,m5:chart.chartHigherFrames?.m5});
 if(lean.phase!=='CLOSE'||lean.side==='WAIT')return null;
 return {target,issued:now,side:lean.side,reason:'ترجيح افتتاح سعري؛ ليس إشارة كسر مبكر · '+lean.reason,source:chart.candleSource,
   quoteSource:quote.source,quoteAt:tick.sourceTime,priceAt:tick.price};
}
