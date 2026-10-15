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
