import type {Candle} from './engine';
import type {ScalpPlan,ScalpQuote} from './scalp-opportunities';

export type ScalpCostContext={
 asset:'GOLD'|'BTC';quoteVenue:'PUBLIC_SPOT'|'BROKER_FEED'|'UNVERIFIED';
 quoteSource:string;costMode:'ESTIMATED_NOT_BROKER_VERIFIED';
 costPerUnit:number|null;spreadPerUnit:number|null;
 medianObservedM1Range:number|null;costToRange:number|null;
 estimatedMovementHeadroom:number|null;
 feasibility:'NO_DATA'|'COST_DOMINATED'|'MARGINAL'|'OBSERVATION_ONLY';
 brokerExecutionVerified:false;
 note:string
};
/** A real source/fee disclaimer, never a manufactured spread or a permit
 * to trade. Closed-M1 high-low is an optimistic TOTAL observed excursion;
 * a passive LIMIT's actual reachable take-profit can be much smaller.
 */
export function describeScalpCostContext(input:{
 asset:'GOLD'|'BTC';quote:ScalpQuote;plans:readonly ScalpPlan[];
 bars:readonly Candle[];now:number
}):ScalpCostContext{
 const {asset,quote,plans,bars,now}=input,source=quote.source||'unavailable';
 const quoteVenue=/\b(Coinbase|Kraken)\b/i.test(source)?'PUBLIC_SPOT':
   /\b(MT5|MetaTrader|Exness)\b/i.test(source)?'BROKER_FEED':'UNVERIFIED';
 const cost=plans[0]?.cost;
 const bid=quote.bid,ask=quote.ask;
 const spread=typeof bid==='number'&&typeof ask==='number'&&
   Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?ask-bid:null;
 const closed=bars.filter(b=>Number.isSafeInteger(b.time)&&
   b.time%60000===0&&b.time+60000<=now&&
   [b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 const recent=closed.slice(-30);
 const consecutive=recent.length===30&&recent.every((b,i)=>
   i===0||b.time-recent[i-1].time===60000)&&
   now-(recent.at(-1)!.time+60000)<120000;
 const ranges=consecutive?recent.map(x=>x.high-x.low).sort((a,b)=>a-b):[];
 const median=ranges.length?(ranges[14]+ranges[15])/2:null;
 const total=typeof cost==='number'&&Number.isFinite(cost)&&cost>0?cost:null;
 const ratio=median!=null&&median>0&&total!=null?total/median:null;
 const feasibility:ScalpCostContext['feasibility']=ratio==null?'NO_DATA':
   ratio>=1?'COST_DOMINATED':ratio>=.5?'MARGINAL':'OBSERVATION_ONLY';
 return {asset,quoteVenue,quoteSource:source,
   costMode:'ESTIMATED_NOT_BROKER_VERIFIED',
   costPerUnit:total!=null?Number(total.toFixed(4)):null,
   spreadPerUnit:spread!=null?Number(spread.toFixed(4)):null,
   medianObservedM1Range:median!=null?Number(median.toFixed(4)):null,
   costToRange:ratio!=null?Number(ratio.toFixed(3)):null,
   estimatedMovementHeadroom:median!=null&&total!=null?
     Number((median-total).toFixed(4)):null,
   feasibility,brokerExecutionVerified:false,
   note:quoteVenue==='PUBLIC_SPOT'?
     'Spot exchange quote and assumed fees are research proxies, NOT observed Exness/MT5 BTC execution. Broker symbol-specific spread, commissions, and slippage must be measured separately.':
     quoteVenue==='BROKER_FEED'?
       'Broker quote may be sourced from MT5; fees/slippage remain estimates until actual account execution is measured.':
       'Quote venue or account execution economics are unverified; never infer Exness fills from paper results.'};
}
