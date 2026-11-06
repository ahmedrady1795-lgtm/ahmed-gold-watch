/**
 * Read-only, causal validation of an M1 directional hypothesis.
 * One row is one FROZEN forecast issued BEFORE the candle it is graded on.
 * The previous observations are not broker fills, P&L or win probabilities.
 */
export type M1QualityRow={
  issuedAt:number;side:'BUY'|'SELL';originalSide?:'BUY'|'SELL';
  pattern?:string;weak:boolean;chartSource?:string;
  directionObserved?:'BUY'|'SELL'|'FLAT'|'UNKNOWN'|null;
  directionEvaluatedAt?:number|null
};
export type M1ForwardQuality={
  status:'COLLECTING'|'NO_EDGE'|'UNPROVEN'|'PROMISING';
  group:string;sample:number;hits:number;misses:number;
  flat:number;unknown:number;excluded:number;
  hitPct:number|null;lower95Pct:number|null;upper95Pct:number|null;
  pastOnly:true;tradeApproved:false;
  reason:string
};
export const M1_FORWARD_QUALITY_MIN=36;
export const M1_FORWARD_QUALITY_WINDOW=48;
const round=(n:number)=>Math.round(n*100)/100;
function wilson(hits:number,n:number):{lower:number;upper:number}{
  if(!n)return {lower:0,upper:1};
  const z=1.959963984540054,phat=hits/n,zz=z*z;
  const center=(phat+zz/(2*n))/(1+zz/n);
  const margin=z*Math.sqrt(phat*(1-phat)/n+zz/(4*n*n))/(1+zz/n);
  return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin)};
}
/**
 * Never include later, ungraded, duplicate, stale, opposite-source or
 * unmatched-regime rows. Do not backfill gaps as wins. Truncation is done
 * AFTER sorting so the newest previous results take priority.
 */
export function assessM1ForwardQuality(signal:{
 issuedAt:number;pattern:string;weak:boolean
},rows:readonly M1QualityRow[],chartSource?:string):M1ForwardQuality{
  const group=signal.pattern+':'+(signal.weak?'WEAK':'STRONG');
  const eligible=rows.filter(r=>r.issuedAt<signal.issuedAt&&
    r.issuedAt>=signal.issuedAt-24*60*60000&&
    Number.isFinite(r.issuedAt)&&
    r.pattern===signal.pattern&&r.weak===signal.weak&&
    (!chartSource||r.chartSource===chartSource)&&
    r.directionEvaluatedAt!=null&&Number.isFinite(r.directionEvaluatedAt)&&
    r.directionEvaluatedAt>=r.issuedAt+60000&&
    r.directionEvaluatedAt<=signal.issuedAt&&
    ['BUY','SELL','FLAT','UNKNOWN'].includes(String(r.directionObserved))&&
    (r.originalSide==='BUY'||r.originalSide==='SELL'||r.side==='BUY'||r.side==='SELL'))
    .sort((a,b)=>a.issuedAt-b.issuedAt);
  const dedup=new Map<number,M1QualityRow>();
  for(const row of eligible)if(!dedup.has(row.issuedAt))dedup.set(row.issuedAt,row);
  const selected=[...dedup.values()].slice(-M1_FORWARD_QUALITY_WINDOW);
  const observed=selected.filter(r=>r.directionObserved==='BUY'||r.directionObserved==='SELL');
  const n=observed.length;
  const hits=observed.filter(r=>(r.originalSide??r.side)===r.directionObserved).length;
  const interval=wilson(hits,n);
  const status:M1ForwardQuality['status']=n<M1_FORWARD_QUALITY_MIN?'COLLECTING':
    interval.upper<.55?'NO_EDGE':
    interval.lower>.50&&hits/n>=.62?'PROMISING':'UNPROVEN';
  const reason=status==='COLLECTING'?'عينة M1 الأمامية غير كافية للحكم على التوقع':
    status==='NO_EDGE'?'نتائج الاتجاه السابقة ضعيفة؛ تأكيد سعر مستقل مطلوب':
    status==='PROMISING'?'نتائج اتجاه سابقة مشجعة، لكنها ليست برهان ربح أو تنفيذ':
    'لا توجد أفضلية اتجاه مثبتة بما يكفي؛ تأكيد سعر مستقل مطلوب';
  return {status,group,sample:n,hits,misses:n-hits,
    flat:selected.filter(r=>r.directionObserved==='FLAT').length,
    unknown:selected.filter(r=>r.directionObserved==='UNKNOWN').length,
    excluded:rows.length-dedup.size,
    hitPct:n?round(hits/n*100):null,
    lower95Pct:n?round(interval.lower*100):null,
    upper95Pct:n?round(interval.upper*100):null,
    pastOnly:true,tradeApproved:false,reason};
}
