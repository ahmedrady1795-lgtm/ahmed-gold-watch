/** Causal, research-only arbitration for pressure vs last-candle direction.
 * Historical observations must be split into older train and later check.
 * Never use the current (unclosed) minute, target touch or simulated fills.
 * A switch here still needs new frozen forward M1 evidence to prove value.
 */
export type M1ConflictResult={pressure:'BUY'|'SELL';follow:'BUY'|'SELL';actual:'BUY'|'SELL'};
export type M1ConflictProof={useFollow:boolean;trainN:number;trainFollowHits:number;
 checkN:number;checkFollowHits:number;reason:string};
export function assessM1Conflict(train:readonly M1ConflictResult[],
 check:readonly M1ConflictResult[]):M1ConflictProof{
 const valid=(r:M1ConflictResult)=>r.pressure!==r.follow&&
   (r.actual==='BUY'||r.actual==='SELL');
 const older=train.filter(valid),later=check.filter(valid);
 const a=older.filter(r=>r.follow===r.actual).length,
  b=later.filter(r=>r.follow===r.actual).length;
 // Multiple compared candidates and short serially correlated samples still
 // cause selection bias; this is an experimental hypothesis only.
 const useFollow=older.length>=9&&later.length>=5&&
   a>=Math.ceil(older.length*.75)&&b>=Math.ceil(later.length*.80);
 return {useFollow,trainN:older.length,trainFollowHits:a,
   checkN:later.length,checkFollowHits:b,
   reason:useFollow?
     'آخر اتجاه مغلق تفوّق على ضغط السوق عند اختلافهما في عينتين زمنيتين؛ ترجيح تجريبي':
     'لا يوجد تفوّق تاريخي واضح يسمح بتغيير اتجاه الضغط'};
}
