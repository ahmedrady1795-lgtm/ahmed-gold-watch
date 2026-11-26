import {assessM5CandleLean,detectWaveEnd} from './sniper-m5-candle-lean.ts';
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
 const waveEnd=detectWaveEnd({now,price:tick.price,quoteAt:tick.sourceTime,
   sourceReady:true,m1:closed});
 const preparation=readGoldPreparation({now,source:chart.candleSource,bars:closed,
   quote,previousQuotes,marketOpen:true}).plan;
 if(preparation){
   if(waveEnd&&waveEnd.side!==preparation.side)return null;
   // A coil records a conditional breakout. Only promote it to an opening
   // forecast when two independent quotes show an approach to its trigger.
   if(preparation.setup==='PRESSURE_COIL'){
     const previousQuote=previousQuotes.at(-1);
     const prior=previousQuote?.ok&&previousQuote.source===quote.source&&
       previousQuote.status==='live'?acceptGoldPulse(previousQuote,now):null;
     const sign=preparation.side==='BUY'?1:-1;
     const spread=tick.bid!=null&&tick.ask!=null?tick.ask-tick.bid:0;
     if(!prior||prior.sourceTime>=tick.sourceTime||
       sign*(tick.price-prior.price)<=Math.max(spread/2,tick.price*.000001))return null;
   }
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
 if(lean.phase!=='CLOSE'||lean.side==='WAIT'||(waveEnd&&waveEnd.side!==lean.side))return null;
 // Closed-candle momentum alone is not enough to freeze an opening call.
 // Demand two distinct recent same-source quotes and reject live reversal.
 const prior=previousQuotes.slice(-2).filter(q=>q?.ok===true&&q.status==='live'&&
   q.source===quote.source&&q.fetchedAt<=now&&q.sourceTime<tick.sourceTime)
   .map(q=>acceptGoldPulse(q,q.fetchedAt))
   .filter(t=>t!==null&&t.sourceTime<=now&&now-t.sourceTime<=15000);
 const lastTick=prior.at(-1);
 if(!lastTick||tick.sourceTime-lastTick.sourceTime>10000)return null;
 const bars=closed.slice().sort((a,b)=>a.time-b.time);
 const last=bars.at(-1);
 if(!last)return null;
 const direction=lean.side==='BUY'?1:-1;
 const tolerance=Math.max((last.high-last.low)*.08,tick.price*.000002);
 // For a continuation call the quotes must actually advance. An unchanged
 // midpoint or a small adverse move used to count as positive confirmation.
 const spread=tick.ask!=null&&tick.bid!=null?tick.ask-tick.bid:0;
 const minAdvance=Math.max(spread/2,(last.high-last.low)*.02,tick.price*.000001);
 if(direction*(tick.price-lastTick.price)<minAdvance||
    direction*(tick.price-last.close)<-Math.max(tolerance,(last.high-last.low)*.35))return null;
 // Once a six-minute move exceeds three typical minute ranges, require a
 // recent counter-move and a subsequent recovery before following it.
 const recent=bars.slice(-15);
 const ranges=recent.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-recent[i].close),Math.abs(b.low-recent[i].close))).sort((a,b)=>a-b);
 const typical=ranges[Math.floor(ranges.length/2)];
 const leg=recent.slice(-6);
 if(leg.length===6&&typical>0&&direction*(tick.price-leg[0].open)>=3*typical){
   const reset=leg.slice(-3).some((bar,i)=>{
     const before=leg[i+2];
     return direction*(before.close-bar.close)>=typical*.4&&
       direction*(tick.price-before.close)>=minAdvance;
   });
   if(!reset)return null;
 }
 return {target,issued:now,side:lean.side,reason:'ترجيح افتتاح سعري مع تحقق اتجاه آخر سعرين؛ ليس إشارة كسر مبكر · '+lean.reason,source:chart.candleSource,
   quoteSource:quote.source,quoteAt:tick.sourceTime,priceAt:tick.price};
}
