/**
 * Prospective M1 signal-quality gate; no broker execution and no lookahead.
 * Closed-bar forecasts still exist for EVERY observed minute. Weak forecasts
 * must show directional continuation in NEW bid/ask ticks before a resting
 * paper LIMIT can be created. Don't count no-edge as profitable/failed trade.
 */
export type M1Evidence={side:'BUY'|'SELL';pressure:number;weak:boolean;
  atr:number;directionModel?:string};
export type TickEvidence={bid:number;ask:number;at:number;source:string};
export type SeedEvidence={mid:number;at:number;source:string};
export type TickDecision='WAIT'|'CONFIRM'|'REJECT'|'UNKNOWN';
export const M1_CONFIRM_WINDOW_MS=24000;
export const M1_EXECUTION_EDGE_V4='EVERY_M1_TICK_CONFIRM_V4';
export const requiresM1TickConfirmation=(p:M1Evidence):boolean=>
  p.weak||p.pressure<35;
export function m1BidAskEvidence(signal:M1Evidence,seed:SeedEvidence,
  q:TickEvidence):TickDecision{
  if(!Number.isFinite(signal.atr)||signal.atr<=0||
    !Number.isFinite(seed.mid)||seed.mid<=0||
    !Number.isFinite(seed.at)||seed.at<=0||!seed.source||
    ![q.bid,q.ask,q.at].every(Number.isFinite)||
    q.bid<=0||q.ask<=q.bid||q.source!==seed.source||
    q.at<=seed.at||q.at-seed.at>M1_CONFIRM_WINDOW_MS)return 'UNKNOWN';
  const mid=(q.bid+q.ask)/2,spread=q.ask-q.bid;
  const move=(signal.side==='BUY'?1:-1)*(mid-seed.mid);
  const minimum=Math.max(.04,spread*.8,signal.atr*.055);
  const adverse=Math.max(signal.atr*.12,spread*1.25);
  // The movement must be meaningfully directional but can't be an already
  // spent M1 impulse. A later retrace should place LIMIT, not chase MARKET.
  if(move<=-adverse||move>=signal.atr*.38)return 'REJECT';
  if(move>=minimum)return 'CONFIRM';
  return 'WAIT';
}
