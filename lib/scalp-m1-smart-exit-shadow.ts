/**
 * M1 quick-exit COUNTERFACTUAL, not an order and not the strategy's result.
 * Keeps the original paper TP/SL outcome untouched for an unbiased comparison.
 * Once filled on a paper LIMIT, only later, distinct, same-feed executable
 * bid/ask observations can support a grace-period exit hypothesis.
 */
export const M1_SMART_EXIT_SHADOW_V1='M1_QUICK_EXIT_GRACE_V1';
export type SoftExitReason='ADVERSE_PRESSURE'|'PROFIT_FADE';
export type SmartExitShadow={
  version:typeof M1_SMART_EXIT_SHADOW_V1;
  bestExit:number;lastAt:number;candidate:SoftExitReason|null;
  candidateAt:number|null;streak:number;
  exitAt:number|null;exitPrice:number|null;netR:number|null;
  reason:SoftExitReason|null;
};
export type SmartExitInput={
  previous:SmartExitShadow|null|undefined;
  side:'BUY'|'SELL';entry:number;stop:number;
  filledAt:number;atr:number;cost:number;extraCost?:number;
  executableExit:number;at:number;
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const round=(n:number)=>Number(n.toFixed(3));
export function advanceSmartExitShadow(p:SmartExitInput):SmartExitShadow|null{
  if(![p.entry,p.stop,p.filledAt,p.atr,p.cost,p.executableExit,p.at].every(finite)||
    p.entry<=0||p.stop<=0||p.filledAt<=0||p.atr<=0||
    p.cost<0||p.executableExit<=0||p.at<p.filledAt||
    (p.extraCost!=null&&(!finite(p.extraCost)||p.extraCost<0)))return p.previous??null;
  const old=p.previous;
  if(old?.exitAt!=null||old&&p.at<=old.lastAt)return old;
  const better=p.side==='BUY'?Math.max:Math.min;
  const best=old?better(old.bestExit,p.executableExit):p.executableExit;
  const next:SmartExitShadow={
    version:M1_SMART_EXIT_SHADOW_V1,bestExit:best,lastAt:p.at,
    candidate:null,candidateAt:null,streak:0,
    exitAt:null,exitPrice:null,netR:null,reason:null
  };
  // Minimum five seconds after observed paper fill: don't panic at entry.
  if(p.at-p.filledAt<5000)return next;
  const direction=p.side==='BUY'?1:-1;
  const move=direction*(p.executableExit-p.entry);
  const bestMove=direction*(best-p.entry);
  const pullback=direction*(best-p.executableExit);
  const adverse=move<=-Math.max(p.atr*.09,p.cost*.70);
  const fade=bestMove>Math.max(p.cost,p.atr*.18)&&
    pullback>=Math.max(p.atr*.13,p.cost*.65);
  const candidate:SoftExitReason|null=adverse?'ADVERSE_PRESSURE':
    fade?'PROFIT_FADE':null;
  if(!candidate)return next;
  const consecutive=old?.candidate===candidate&&
    old.candidateAt!=null&&p.at-old.lastAt>=500&&
    p.at-old.lastAt<=6000;
  next.candidate=candidate;
  next.candidateAt=p.at;
  next.streak=consecutive?old!.streak+1:1;
  if(next.streak<2)return next;
  // This is an observed quote-based shadow close, never a guaranteed fill.
  const extra=p.extraCost??p.cost;
  const risk=Math.abs(p.entry-p.stop);
  next.exitAt=p.at;next.exitPrice=p.executableExit;
  next.netR=round((move-extra)/Math.max(.01,risk+extra));
  next.reason=candidate;
  return next;
}
export type SmartExitAuditRow={
  shadowVersion?:string;
  filledAt:number|null;netR:number|null;
  state:string;shadowExit?:SmartExitShadow|null
};
export function auditSmartExitShadow(rows:readonly SmartExitAuditRow[]){
  const cohort=rows.filter(x=>x.shadowVersion===M1_SMART_EXIT_SHADOW_V1);
  const filled=cohort.filter(x=>x.filledAt!=null);
  // Only comparable, known closed trades qualify. Unknown feed gaps are NOT
  // silently treated as stopped, avoided, flat or profitable trades.
  const comparable=filled.filter(x=>x.netR!=null&&finite(x.netR)&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(x.state));
  const early=comparable.filter(x=>x.shadowExit?.exitAt!=null&&
    x.shadowExit.netR!=null&&finite(x.shadowExit.netR));
  const original=comparable.reduce((s,x)=>s+Number(x.netR),0);
  const shadow=comparable.reduce((s,x)=>s+Number(
    x.shadowExit?.netR??x.netR),0);
  const wins=(values:number[])=>values.filter(v=>v>0).length;
  return {
    cohort:cohort.length,filled:filled.length,comparable:comparable.length,
    unknown:filled.filter(x=>x.state==='UNKNOWN').length,
    unresolved:filled.length-comparable.length-
      filled.filter(x=>x.state==='UNKNOWN').length,
    earlyExits:early.length,
    earlierProfit:early.filter(x=>Number(x.shadowExit!.netR)>0).length,
    originalWins:wins(comparable.map(x=>Number(x.netR))),
    shadowWins:wins(comparable.map(x=>Number(x.shadowExit?.netR??x.netR))),
    originalNetR:round(original),shadowNetR:round(shadow),
    deltaNetR:round(shadow-original),
    enoughEvidence:comparable.length>=50,
    note:'مقارنة ورقية مقابلة للواقع بعد سعر Bid/Ask والتكلفة المقدرة؛ لا تعني تنفيذ خروج فعلي، والعينة الصغيرة ليست إثباتًا.'
  };
}
