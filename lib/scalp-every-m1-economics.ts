// Paper-only economics for the uncensored every-M1 research lane.
// Prices are hypothetical reference LIMITs, not broker execution instructions.
export const EVERY_M1_EDGE_V2='EVERY_M1_EDGE_V2';
export const EVERY_M1_EDGE_V3='EVERY_M1_ADAPTIVE_DIRECTION_V3';
export const EVERY_M1_EDGE_V4='EVERY_M1_FORWARD_LEARNER_V4';
export const EVERY_M1_EDGE_V5='EVERY_M1_TICK_CONFIRMED_LIMIT_V5';
export const EVERY_M1_MIN_NET_R=.55;
export type EveryM1Economics={
  side:'BUY'|'SELL';entry:number;stop:number;tp:number;
  extraCost:number;spread:number;risk:number;grossTargetMove:number;
  netRewardR:number;breakEvenWinPct:number;retestDepth:number
};
const lo=(v:number)=>Math.floor(v*100+1e-7)/100;
const hi=(v:number)=>Math.ceil(v*100-1e-7)/100;
const round=(v:number)=>Number(v.toFixed(3));

/** Strict quote feasibility, but NO score/technical entry gate:
 * every valid minute is forecast even if the quote cannot fund a real trade.
 * Bid/Ask at entry and exit already include spread; the additional
 * estimated slippage/fees are charged exactly ONCE, on closing.
 */
export function priceEveryM1Limit(input:{
  side:'BUY'|'SELL';bid:number;ask:number;atr:number;
  cost:number;previousOpen:number;previousClose:number
}):EveryM1Economics|null{
  const {side,bid,ask,atr,cost,previousOpen,previousClose}=input;
  if(![bid,ask,atr,cost,previousOpen,previousClose].every(Number.isFinite)||
    bid<=0||ask<=bid||atr<=0||cost<=0||
    previousOpen<=0||previousClose<=0)return null;
  const spread=ask-bid;
  if(spread>cost+.01)return null;
  const extra=Math.max(0,cost-spread);
  // Re-enter on a pullback into the last closed candle's body, rather than
  // immediately chasing the current quote. Bound depth to avoid stale orders.
  const offset=Math.max(.02,spread*.5,atr*.04);
  const bodyMid=(previousOpen+previousClose)/2;
  const buy=side==='BUY';
  // Pending LIMIT should have a realistic chance of reaching a pullback in M1.
  const maxRetest=atr*.32;
  if(offset>maxRetest||spread>atr*.24)return null;
  const targetBuy=Math.max(bid-maxRetest,Math.min(bid-offset,bodyMid));
  const targetSell=Math.min(ask+maxRetest,Math.max(ask+offset,bodyMid));
  const entry=buy?lo(targetBuy):hi(targetSell);
  // A tight stop still has to clear normal quote noise and the live spread.
  const nominalRisk=Math.max(atr*.55,spread*2,.14);
  const stop=buy?lo(entry-nominalRisk):hi(entry+nominalRisk);
  const risk=Math.abs(entry-stop);
  const grossMove=extra+EVERY_M1_MIN_NET_R*(risk+extra);
  const tp=buy?hi(entry+grossMove):lo(entry-grossMove);
  const reward=buy?tp-entry:entry-tp;
  const netRewardR=(reward-extra)/(risk+extra);
  // One completed minute of risk may need >1 ATR to clear the spread.
  // Allow up to 1.35 recent ATR, never promise a target far beyond it.
  // This *only* makes the attempt cost-unviable; the prediction is retained.
  if(entry<=0||stop<=0||tp<=0||risk<=0||reward<=extra||
    grossMove>atr*1.35||netRewardR+1e-9<EVERY_M1_MIN_NET_R||
    buy&&entry>=bid||!buy&&entry<=ask)return null;
  return {side,entry,stop,tp,extraCost:round(extra),
    spread:round(spread),risk:round(risk),grossTargetMove:round(reward),
    netRewardR:round(netRewardR),
    breakEvenWinPct:round(100/(1+netRewardR)),
    retestDepth:round(buy?bid-entry:entry-ask)};
}
