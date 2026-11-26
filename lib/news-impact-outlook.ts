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


/** Observed XAU price response, distinct from the macro surprise. Only complete,
 * contiguous M1 candles at the exact minute-aligned release are used. */
export function observedNewsGoldReaction(input:{eventTime:number;now:number;candles:unknown;source:string;providerTransition:boolean}){
  const {eventTime,now,source,providerTransition}=input;
  const waiting={side:'WAIT' as const,label:'رد فعل الذهب: بانتظار قراءة سعر مؤكدة'};
  if(providerTransition||!source||/proxy|GC=F|COMEX/i.test(source)||!Number.isFinite(eventTime)||
    !Number.isFinite(now)||eventTime%60000!==0||now<eventTime+60000||now-eventTime>30*60000||
    !Array.isArray(input.candles))return waiting;
  const end=Math.min(Math.floor(now/60000)*60000,eventTime+5*60000);
  const count=(end-eventTime)/60000;
  const bars=new Map<number,{time:number;open:number;high:number;low:number;close:number}>();
  for(const b of input.candles){
    if(b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
      b.time>=eventTime&&b.time+60000<=end&&b.time%60000===0&&
      b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
      bars.set(b.time,b);
  }
  const first=bars.get(eventTime),last=bars.get(end-60000);
  if(!first||!last||bars.size!==count)return waiting;
  const change=last.close-first.open;
  const side=change>0?'UP' as const:change<0?'DOWN' as const:'WAIT' as const;
  return {side,label:'رد فعل الذهب '+count+'د: '+(side==='UP'?'صعود ↑':side==='DOWN'?'هبوط ↓':'ثبات')+
    ' ('+(change>0?'+':'')+change.toFixed(2)+'$)'};
}
