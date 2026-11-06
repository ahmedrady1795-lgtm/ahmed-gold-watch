/**
 * Experimental, nonexecuting M1 challenger. It is evaluated on chronologically
 * frozen outcomes only; never swaps the live/paper Limit direction itself.
 * A 16-observation, same-regime train/check comparison can suggest testing
 * reversal sooner than the established 24+12 *execution-neutral* learner.
 * Promotion needs new independent forward outcomes, not this selection test.
 */
export type ShadowM1Side='BUY'|'SELL';
export type ShadowM1Row={
  issuedAt:number;side:ShadowM1Side;originalSide?:ShadowM1Side;
  pattern?:string;weak:boolean;chartSource?:string;
  directionObserved?:'BUY'|'SELL'|'FLAT'|'UNKNOWN'|null;
  directionEvaluatedAt?:number|null
};
export type ShadowM1Selection={
  side:ShadowM1Side;model:'BASELINE_SHADOW'|'REVERSAL_SHADOW';
  prior:number;trainHits:number;checkedHits:number;
  trainTotal:number;checkedTotal:number;reason:string
};
export const M1_SHADOW_TRAIN=8;
export const M1_SHADOW_CHECK=8;
export const M1_SHADOW_MAX_AGE_MS=90*60_000;
const reverse=(x:ShadowM1Side):ShadowM1Side=>x==='BUY'?'SELL':'BUY';
const validSide=(s:unknown):s is ShadowM1Side=>s==='BUY'||s==='SELL';
export function chooseM1ShadowExpert(signal:{
  issuedAt:number;side:ShadowM1Side;pattern:string;weak:boolean
},history:readonly ShadowM1Row[],chartSource?:string):ShadowM1Selection{
  const prepared=history.filter(r=>
    Number.isFinite(r.issuedAt)&&r.issuedAt<signal.issuedAt&&
    r.issuedAt>=signal.issuedAt-M1_SHADOW_MAX_AGE_MS&&
    Number.isFinite(r.directionEvaluatedAt)&&
    r.directionEvaluatedAt!>=r.issuedAt+60_000&&
    r.directionEvaluatedAt!<=signal.issuedAt&&
    validSide(r.directionObserved)&&
    validSide(r.originalSide??r.side)&&
    r.weak===signal.weak&&r.pattern===signal.pattern&&
    (!chartSource||r.chartSource===chartSource))
    .sort((a,b)=>a.issuedAt-b.issuedAt);
  const sample=prepared.slice(-(M1_SHADOW_TRAIN+M1_SHADOW_CHECK));
  const empty=(reason:string):ShadowM1Selection=>({
    side:signal.side,model:'BASELINE_SHADOW',prior:prepared.length,
    trainHits:0,checkedHits:0,trainTotal:0,checkedTotal:0,reason
  });
  if(sample.length<M1_SHADOW_TRAIN+M1_SHADOW_CHECK)
    return empty('عدد نتائج الاتجاه المجمدة من نفس النمط لم يصل 16 بعد');
  const hit=(r:ShadowM1Row)=>(r.originalSide??r.side)===r.directionObserved;
  const train=sample.slice(0,M1_SHADOW_TRAIN);
  const check=sample.slice(M1_SHADOW_TRAIN);
  const trainHits=train.filter(hit).length,checkedHits=check.filter(hit).length;
  // Require independent chronological failure in BOTH halves: <=2/8.
  // This is a shadow hypothesis, not evidence of real-money profitability.
  const suggestReverse=trainHits<=2&&checkedHits<=2;
  return {side:suggestReverse?reverse(signal.side):signal.side,
    model:suggestReverse?'REVERSAL_SHADOW':'BASELINE_SHADOW',
    prior:prepared.length,trainHits,checkedHits,
    trainTotal:train.length,checkedTotal:check.length,
    reason:suggestReverse?
      'منافس بحثي يعكس الاتجاه بعد إخفاق متكرر في 8 تدريب + 8 مراجعة؛ دون تغيير أمر Limit':
      'لا يوجد فشل سببي كافٍ لتبرير تجربة اتجاه عكسي'};
}
export function auditM1ShadowExpert(rows:readonly (ShadowM1Row&{
  shadowSide?:ShadowM1Side;shadowModel?:ShadowM1Selection['model']
})[]){
  const issued=rows.filter(r=>validSide(r.shadowSide)&&
    (r.shadowModel==='REVERSAL_SHADOW'||r.shadowModel==='BASELINE_SHADOW'));
  const flipped=issued.filter(r=>r.shadowModel==='REVERSAL_SHADOW');
  const graded=issued.filter(r=>validSide(r.directionObserved));
  const flippedGraded=graded.filter(r=>r.shadowModel==='REVERSAL_SHADOW');
  const compare=(a:typeof graded)=>({
    graded:a.length,
    shadowHits:a.filter(r=>r.shadowSide===r.directionObserved).length,
    liveHits:a.filter(r=>r.side===r.directionObserved).length
  });
  return {issued:issued.length,proposedFlips:flipped.length,
    all:compare(graded),flipped:compare(flippedGraded),
    unknown:issued.filter(r=>r.directionObserved==='UNKNOWN').length,
    waiting:issued.filter(r=>r.directionObserved==null).length,
    note:'منافس ورقي فقط؛ لا يغيّر التوقع أو Limit الفعلي، ولا تثبت 16 شمعة ربحية النموذج'};
}
