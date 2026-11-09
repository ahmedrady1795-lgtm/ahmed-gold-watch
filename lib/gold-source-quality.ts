/**
 * Read-only public spot-gold fallback quality. Broker quote execution is
 * separate; an external quote must never be interpreted as Exness depth,
 * traded volume, an executable bid/ask, or a valid MT5 trade signal.
 */
export type GoldQuoteCandidate={
  price:number;sourceTime:number|null;status:string;
  bid?:number|null;ask?:number|null;
};
export type QuoteGrade={kind:'LIVE'|'DELAYED'|'REJECTED';ageMs:number|null;reason:string};
const MINUTE=60000;
export function gradeGoldQuote(q:GoldQuoteCandidate,now:number):QuoteGrade{
  if(!Number.isFinite(now)||!Number.isFinite(q.price)||q.price<=0)
    return {kind:'REJECTED',ageMs:null,reason:'BAD_PRICE'};
  const bid=q.bid,ask=q.ask;
  if(bid!=null&&ask!=null&&(!Number.isFinite(bid)||!Number.isFinite(ask)||
    bid<=0||ask<bid))return {kind:'REJECTED',ageMs:null,reason:'BAD_SPREAD'};
  const at=q.sourceTime;
  if(at==null||!Number.isFinite(at)||at<=0||at>now+2000)
    return {kind:'REJECTED',ageMs:null,reason:'MISSING_OR_FUTURE_SOURCE_TIME'};
  const ageMs=now-at;
  if(ageMs< -2000||ageMs>20*MINUTE)
    return {kind:'REJECTED',ageMs,reason:'QUOTE_TOO_OLD'};
  if(q.status==='live'&&ageMs<=15000)
    return {kind:'LIVE',ageMs,reason:'FRESH_PROVIDER_QUOTE'};
  // Slow/closed/unknown quotes may explain history, never tick-by-tick flow.
  return {kind:'DELAYED',ageMs,reason:'HISTORICAL_REFERENCE_ONLY'};
}
type BarTime={time:number};
export function freshGoldCandleSet(c1:readonly BarTime[],c5:readonly BarTime[],
 c15:readonly BarTime[],c60:readonly BarTime[],now:number,marketOpen:boolean){
  const groups=[
    {rows:c1,maxAgeMs:4*MINUTE},
    {rows:c5,maxAgeMs:20*MINUTE},
    {rows:c15,maxAgeMs:50*MINUTE},
    {rows:c60,maxAgeMs:180*MINUTE}
  ];
  // During a closed gold session, the final real close is historical.
  return groups.every(({rows,maxAgeMs})=>{
    const last=rows.at(-1);
    if(!last||!Number.isFinite(last.time)||last.time<=0||
      last.time>now+2000)return false;
    return !marketOpen||now-last.time<=maxAgeMs;
  });
}
