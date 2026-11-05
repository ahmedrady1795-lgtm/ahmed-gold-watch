/**
 * Safety brakes for PAPER-REFERENCE M1 exploration only.
 * These guards never submit, change, or close broker orders.
 * A quote crossing a loss threshold may gap through it; always record
 * the actual observed Bid/Ask rather than claiming a guaranteed stop fill.
 */
export const M1_EARLY_LOSS_R=-0.5;
export const M1_LOSS_PAUSE_MS=10*60*1000;
export type M1ResearchClose={
 state:string;closedAt?:number|null;netR?:number|null
};
export function paperLossPauseUntil(rows:readonly M1ResearchClose[],now:number):number{
 let until=0;
 for(const t of rows){
  if((t.state!=='STOP'&&t.state!=='RISK_EXIT')||
    t.closedAt==null||!Number.isFinite(t.closedAt)||
    t.netR==null||!Number.isFinite(t.netR)||t.netR>=0||
    t.closedAt>now||now-t.closedAt>M1_LOSS_PAUSE_MS)continue;
  until=Math.max(until,t.closedAt+M1_LOSS_PAUSE_MS);
 }
 return until>now?until:0;
}
export function paperEarlyLossHit(netR:number):boolean{
 return Number.isFinite(netR)&&netR<=M1_EARLY_LOSS_R;
}
