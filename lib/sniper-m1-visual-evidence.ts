/** Read-only presentation audit of the ALREADY-ISSUED next-M1 hypothesis.
 * The current minute's quote may warn that the movement disagrees, but it
 * cannot retrospectively reverse, re-score or repaint the issued direction.
 * None of these labels authorizes a broker order or a paper fill.
 */
export type M1DisplaySide='BUY'|'SELL'|'WAIT';
export type M1VisualEvidence={
  side:M1DisplaySide;pressure:number;weak:boolean;
  improved:boolean;checked:number;checkHits:number;simpleCheckHits:number;
  quoteTrusted:boolean;lastClosedPrice:number|null;currentPrice:number|null;
  atr:number|null
};
export type M1VisualJudgment={
  label:string;status:'NONE'|'WEAK'|'RESEARCH'|'CAUSAL_SUPPORT';
  showPriorityStar:boolean;liveConflict:boolean;reason:string
};
const finite=(n:number|null):n is number=>
  n!==null&&Number.isFinite(n);
export function auditM1VisualEvidence(x:M1VisualEvidence):M1VisualJudgment{
  if(x.side==='WAIT'||!Number.isFinite(x.pressure))
    return {label:'بانتظار توقع جديد بعد إغلاق M1',
      status:'NONE',showPriorityStar:false,liveConflict:false,
      reason:'لم تصدر فرضية اتجاه صالحة بعد'};
  const dir=x.side==='BUY'?1:-1;
  const labelSide=x.side==='BUY'?'صعود ↑':'هبوط ↓';
  // The 0-100 pressure score measures indicator magnitude, NOT win odds.
  // 12 prior checks are far too few to label a forecast independently proven.
  const low=Boolean(x.weak)||x.pressure<60;
  const enoughCheck=x.checked>=30&&x.checkHits>=Math.ceil(x.checked*.70)&&
    x.checkHits-x.simpleCheckHits>=3;
  const supported=!low&&x.improved&&enoughCheck;
  const liveConflict=Boolean(x.quoteTrusted&&
    finite(x.lastClosedPrice)&&finite(x.currentPrice)&&
    finite(x.atr)&&x.atr>0&&
    dir*(x.currentPrice-x.lastClosedPrice)<-x.atr*.25);
  return {
    label:supported?'ترجيح بحثي مدعوم: '+labelSide:
      low?'ميل أولي ضعيف: '+labelSide:
      'توقع تجريبي غير مؤكد: '+labelSide,
    status:supported?'CAUSAL_SUPPORT':low?'WEAK':'RESEARCH',
    // A star signifies audited directional evidence, NEVER an order or
    // a guarantee. In today's 12-bar check it must stay off.
    showPriorityStar:supported,
    liveConflict,
    reason:low?'ضغط الاتجاه أقل من حد العرض الواضح، أو أدلة الشمعة ضعيفة':
      supported?'تحسن تاريخي سببي ضمن عينات سابقة، لا يعني ربحًا معتمدًا':
      'الاختبار الزمني السابق لا يثبت تفوقًا كافيًا لترجيح دخول'
  };
}
