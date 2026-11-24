/** Conditionally display macro surprise direction, never a pre-release trade signal. */
export type MacroImpact={kind:'DATA'|'LABOR_INVERSE'|'CENTRAL_BANK'|'UNCERTAIN';higher:string;lower:string;disclaimer:string};
export function classifyMacroNews(name:unknown):MacroImpact{
  const n=String(name||'');
  const caveat='سيناريو احتمالي بعد النتيجة، وليس توقعًا مؤكدًا قبل الخبر؛ BTC يحتاج تأكيد حركة السعر.';
  if(/claims|unemployment rate|jobless|continuing claims/i.test(n))
    return {kind:'LABOR_INVERSE',higher:'لو أعلى: USD ↓ · ذهب ↑',lower:'لو أقل: USD ↑ · ذهب ↓',disclaimer:caveat};
  if(/CPI|PCE|PPI|inflation|average hourly|earnings|payroll|employment change|GDP|PMI|ISM|retail|consumer confidence|JOLTS|job openings/i.test(n))
    return {kind:'DATA',higher:'لو أعلى: USD ↑ · ذهب ↓',lower:'لو أقل: USD ↓ · ذهب ↑',disclaimer:caveat};
  if(/FOMC|Powell|Fed Chair|minutes|interest rate|rate decision/i.test(n))
    return {kind:'CENTRAL_BANK',higher:'تشدد: USD ↑ · ذهب ↓',lower:'تيسير: USD ↓ · ذهب ↑',disclaimer:caveat};
  return {kind:'UNCERTAIN',higher:'USD ↕ · ذهب ↕',lower:'التأثير يتحدد بعد صدور الخبر',disclaimer:caveat};
}

// The forecast/previous comparison describes the expected macro backdrop,
// not the surprise at release, and must never authorize execution.
function macroNumber(v:unknown){
  const m=String(v??'').trim().replace(/,/g,'').match(/^([+-]?\d+(?:\.\d+)?)\s*([KMB%]?)$/i);
  if(!m)return null;
  const unit=m[2].toUpperCase();
  const value=Number(m[1])*(unit==='K'?1e3:unit==='M'?1e6:unit==='B'?1e9:1);
  return Number.isFinite(value)?{value,percent:unit==='%'}:null;
}
export function expectedMacroBackdrop(event:{name?:unknown;forecast?:unknown;previous?:unknown}|null){
  const a=macroNumber(event?.forecast),b=macroNumber(event?.previous);
  const kind=classifyMacroNews(event?.name).kind;
  if(!a||!b||a.percent!==b.percent||a.value===b.value||!['DATA','LABOR_INVERSE'].includes(kind))
    return {side:'WAIT' as const,label:'التوقع الاقتصادي غير محسوم',reason:'لا توجد مقارنة إجماعية اتجاهية قابلة للاستخدام'};
  const higher=a.value>b.value;
  const goldUp=kind==='LABOR_INVERSE'?higher:!higher;
  return {side:goldUp?'UP' as const:'DOWN' as const,
    label:goldUp?'توقع السوق: داعم للذهب ↑':'توقع السوق: ضاغط على الذهب ↓',
    reason:'مقارنة توقع السوق بالسابق فقط؛ قد يكون الأثر مسعّراً والنتيجة الفعلية قد تخالف التوقع'};
}
