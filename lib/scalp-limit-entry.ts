/**
 * Frozen pending LIMIT plan for reference scalp trades.
 * Bid/ask are mandatory: midpoint crossing cannot prove a fill or a broker
 * order, and an order is never repriced to chase the market.
 */
import type {ScalpPlan,ScalpQuote} from './scalp-opportunities';
import {requiredScalpNetR} from './scalp-risk-policy';
export type ScalpLimitIntent={
  type:'BUY_LIMIT'|'SELL_LIMIT';price:number;expiresAt:number;
  quoteSource:string;initialExecutable:number;netRR:number
};
const down=(x:number)=>Math.floor(x*100+1e-7)/100;
const up=(x:number)=>Math.ceil(x*100-1e-7)/100;
export function planScalpLimit(plan:ScalpPlan,quote:ScalpQuote,now:number):ScalpLimitIntent|null{
  if(plan.status!=='ARMED'||(plan.side!=='BUY'&&plan.side!=='SELL')||
    plan.entry==null||plan.stop==null||plan.targets[0]?.price==null||
    ![plan.entry,plan.stop,plan.targets[0].price,plan.cost,quote.bid,quote.ask,quote.at]
      .every(x=>x!=null&&Number.isFinite(x))||
    quote.at==null||quote.at<=0||now-quote.at<0||now-quote.at>10000||
    quote.bid==null||quote.ask==null||quote.bid<=0||quote.ask<=quote.bid||
    plan.cost<=0||now>=plan.expiresAt||!quote.source)return null;
  const dir=plan.side==='BUY'?1:-1;
  const refRisk=dir*(plan.entry-plan.stop);
  const spread=quote.ask-quote.bid;
  if(refRisk<=0||spread>plan.cost||!Number.isFinite(spread))return null;
  // Use the technical plan's price when already limit-side. If it is an
  // above-market breakout, use a nearby better retest price, NOT a stop order
  // or market order. Reject any move >35% of the original structural risk.
  const gap=Math.max(.02,spread*.5);
  const price=dir===1?down(Math.min(plan.entry,quote.bid-gap)):
    up(Math.max(plan.entry,quote.ask+gap));
  const deviation=dir*(plan.entry-price);
  const risk=dir*(price-plan.stop),reward=dir*(plan.targets[0].price-price);
  const netRR=(reward-plan.cost)/(risk+plan.cost);
  const expiry=Math.min(plan.expiresAt,now+45_000);
  if(price<=0||deviation<0||deviation>refRisk*.35||risk<=spread||
    reward<=plan.cost||!Number.isFinite(netRR)||
    netRR<requiredScalpNetR(plan)||expiry-now<5000)return null;
  if(dir===1&&price>=quote.ask||dir===-1&&price<=quote.bid)return null;
  return {type:dir===1?'BUY_LIMIT':'SELL_LIMIT',price,expiresAt:expiry,
    quoteSource:quote.source,initialExecutable:dir===1?quote.ask:quote.bid,
    netRR:Number(netRR.toFixed(3))};
}
export function limitTouch(trade:{plan:Pick<ScalpPlan,'side'|'entry'|'stop'>;
    limitType?:string|null;limitSource?:string|null;
    lastExecutable?:number|null;limitExpiresAt?:number|null},
    quote:ScalpQuote,now:number):'WAIT'|'FILLED'|'EXPIRED'|'UNKNOWN'|'INVALID'{
  const entry=trade.plan.entry,stop=trade.plan.stop;
  if(!entry||!stop||!trade.limitExpiresAt||!trade.limitType||
    (trade.limitType!=='BUY_LIMIT'&&trade.limitType!=='SELL_LIMIT'))return 'INVALID';
  if(now>trade.limitExpiresAt)return 'EXPIRED';
  const at=quote.at;
  if(at==null||at<=0||now-at<0||now-at>10000||
    quote.source!==trade.limitSource)return 'UNKNOWN';
  const buy=trade.limitType==='BUY_LIMIT',px=buy?quote.ask:quote.bid;
  if(px==null||!Number.isFinite(px)||px<=0||
    !Number.isFinite(Number(trade.lastExecutable)))return 'UNKNOWN';
  const wasOutside=buy?Number(trade.lastExecutable)>entry:
    Number(trade.lastExecutable)<entry;
  // If the first available sample is already at/past the stop, the within-gap
  // order sequence cannot be reconstructed, so never claim a profitable fill.
  if((buy&&px<=stop)||(!buy&&px>=stop))return 'UNKNOWN';
  if(wasOutside&&(buy?px<=entry:px>=entry)){
    if(Math.abs(px-entry)>Math.abs(entry-stop)*.35)return 'UNKNOWN';
    return 'FILLED';
  }
  return 'WAIT';
}
