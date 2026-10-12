/** Causal structure/liquidity evidence from closed M1/M5 bars only.
 * A volume proxy is NOT evidence of institutional positioning or trade fills.
 * This module may veto a new entry, never turn a watch into an entry.
 */
export type LiquiditySide='BUY'|'SELL'|'WAIT';
export type LiquidityEvent={kind:'SWEEP_LOW'|'SWEEP_HIGH'|'BOS_UP'|'BOS_DOWN';confirmedAt:number;at:number;level:number};
export type LiquidityContext={
  ready:boolean;side:LiquiditySide;volumeBasis?:'REAL'|'TICK'|'NONE';events?:LiquidityEvent[];
};
const sideOf=(kind:LiquidityEvent['kind']):LiquiditySide=>
  kind==='SWEEP_LOW'||kind==='BOS_UP'?'BUY':'SELL';
const labelOf=(kind:LiquidityEvent['kind'])=>
  kind==='SWEEP_LOW'?'سحب قاع ثم استرداد':kind==='SWEEP_HIGH'?'سحب قمة ثم رفض':
  kind==='BOS_UP'?'كسر هيكل صاعد':'كسر هيكل هابط';
export function assessLiquidityFoundation(input:{
  context?:LiquidityContext|null;now:number;side:LiquiditySide
}){
  const {context,now,side}=input;
  const inactive={ready:false,opposing:false,event:null as LiquidityEvent|null,
    volumeLabel:'مصدر الحجم غير مؤكد',evidence:'لا توجد قراءة سيولة هيكلية حديثة كافية',
    reason:'غياب دليل السيولة لا يتحول إلى تأكيد دخول'};
  if(!context?.ready||!Number.isFinite(now)||now<=0)return inactive;
  const basis=context.volumeBasis;
  const volumeLabel=basis==='REAL'?'حجم حقيقي من الشموع':basis==='TICK'?
    'Tick volume · مؤشر نشاط فقط وليس تدفق أوامر':'لا تتوفر بيانات حجم معتمدة';
  const recent=(Array.isArray(context.events)?context.events:[])
    .filter(e=>e&&['SWEEP_LOW','SWEEP_HIGH','BOS_UP','BOS_DOWN'].includes(e.kind)&&
      Number.isFinite(e.confirmedAt)&&Number.isFinite(e.at)&&Number.isFinite(e.level)&&
      e.confirmedAt>=e.at&&e.confirmedAt<=now&&e.at<=now&&e.level>0&&
      now-e.confirmedAt<=60*60000)
    .sort((a,b)=>a.confirmedAt-b.confirmedAt);
  const latestSweep=recent.filter(e=>e.kind==='SWEEP_LOW'||e.kind==='SWEEP_HIGH').at(-1);
  const latestBreak=recent.filter(e=>e.kind==='BOS_UP'||e.kind==='BOS_DOWN').at(-1);
  const freshSweep=latestSweep&&now-latestSweep.confirmedAt<=30*60000?latestSweep:null;
  const freshBreak=latestBreak&&now-latestBreak.confirmedAt<=45*60000?latestBreak:null;
  // Only a *paired*, fresh opposing sweep + close-confirmed structure break
  // can veto a new qualified trade; a lone wick or stale event never does.
  const conflict=side!=='WAIT'&&context.side!=='WAIT'&&context.side!==side&&
    Boolean(freshSweep&&freshBreak&&sideOf(freshSweep.kind)!==side&&
      sideOf(freshBreak.kind)!==side);
  const last=recent.at(-1)??null;
  const details=[freshSweep?labelOf(freshSweep.kind):null,freshBreak?labelOf(freshBreak.kind):null]
    .filter(Boolean).join(' · ');
  const evidence=details||'لم يتأكد سحب سيولة أو كسر هيكل حديث';
  return {ready:true,opposing:Boolean(conflict),event:last,volumeLabel,evidence,
    reason:conflict?'سحب سيولة وكسر هيكل حديثان ضد الاتجاه على قراءة الأربع ساعات':
      context.side==='WAIT'?'السوق متوازن: مراقبة السيولة بدون ترجيح قاطع':
      context.side!==side&&side!=='WAIT'?'اختلاف ميل الأربع ساعات؛ ننتظر دليلًا أحدث':
      'السيولة والهيكل عوامل مساندة فقط؛ لا تؤهل الدخول وحدها'};
}
