/**
 * Prospective read-only early-exit competitor for PAPER M1 LIMIT touches.
 * Requires two distinct same-source adverse executable quotes after a short
 * grace. Never closes an order, modifies the actual STOP/TP or changes MT5.
 * The price is the observed opposite-side bid/ask, not candle OHLC or midpoint.
 */
export const M1_FAST_EXIT_SHADOW_V1='M1_FAST_EXIT_SHADOW_V1';
export const M1_FAST_EXIT_GRACE_MS=3_000;
export type ShadowExitObservation={
  adverseTicks:number;earlyExitAt:number|null;earlyExitPrice:number|null;
};
export type ShadowExitInput={
  side:'BUY'|'SELL';entry:number;stop:number;tp:number;
  filledAt:number;lastQuoteAt:number;now:number;quoteAt:number;
  bid:number;ask:number;quoteSource:string;fillSource:string;
  previous:ShadowExitObservation
};
export function watchM1FastExitShadow(x:ShadowExitInput):ShadowExitObservation{
  const prior=x.previous;
  if(prior.earlyExitAt!=null)return prior;
  if(![x.entry,x.stop,x.tp,x.filledAt,x.lastQuoteAt,x.now,
    x.quoteAt,x.bid,x.ask].every(Number.isFinite)||
    x.entry<=0||x.filledAt<=0||x.bid<=0||x.ask<=x.bid||
    !x.quoteSource||x.quoteSource!==x.fillSource||
    x.now<x.quoteAt||x.now-x.quoteAt>10000||
    x.quoteAt<=x.lastQuoteAt||x.quoteAt-x.lastQuoteAt>15000||
    x.quoteAt<=x.filledAt)return prior;
  if(x.quoteAt-x.filledAt<M1_FAST_EXIT_GRACE_MS)
    return {...prior,adverseTicks:0};
  const buy=x.side==='BUY';
  const risk=buy?x.entry-x.stop:x.stop-x.entry;
  const validTarget=buy?x.tp>x.entry:x.tp<x.entry;
  if(!validTarget||risk<=0)return prior;
  const px=buy?x.bid:x.ask,spread=x.ask-x.bid;
  // Observed stop/target always take precedence over a hypothetical
  // early exit on the same quote. No intratick barrier ordering invented.
  if(buy?(px<=x.stop||px>=x.tp):(px>=x.stop||px<=x.tp))
    return {...prior,adverseTicks:0};
  const adverse=buy?x.entry-px:px-x.entry;
  const threshold=Math.max(risk*.25,spread*1.15);
  const streak=adverse>=threshold?prior.adverseTicks+1:0;
  if(streak<2)return {...prior,adverseTicks:streak};
  return {adverseTicks:streak,earlyExitAt:x.quoteAt,earlyExitPrice:px};
}
export type FastExitShadowRow={
  strategyVersion?:string;filledAt?:number|null;state?:string;
  netR?:number|null;shadowExitVersion?:string;
  shadowEarlyExitNetR?:number|null
};
export function auditM1FastExitShadow(rows:readonly FastExitShadowRow[],version:string){
  const eligible=rows.filter(r=>r.strategyVersion===version&&
    r.shadowExitVersion===M1_FAST_EXIT_SHADOW_V1&&
    r.filledAt!=null&&Number.isFinite(r.netR)&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(r.state||''));
  const early=eligible.filter(r=>Number.isFinite(r.shadowEarlyExitNetR));
  const realNetR=eligible.reduce((n,r)=>n+Number(r.netR),0);
  const shadowNetR=eligible.reduce((n,r)=>n+Number(
    r.shadowEarlyExitNetR??r.netR),0);
  const rounded=(v:number)=>Math.round(v*1000)/1000;
  return {compared:eligible.length,earlyExits:early.length,
    baselineNetR:rounded(realNetR),shadowNetR:rounded(shadowNetR),
    shadowMinusBaselineR:rounded(shadowNetR-realNetR),
    note:'خروج بديل ورقي عند تيكين عكسيين بعد 3 ثوان؛ لا يؤثر في وقف حقيقي أو Limit. يقاس على نفس صفقات V5 الجديدة فقط.'};
}
