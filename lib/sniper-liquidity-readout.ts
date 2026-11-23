/**
 * Compact, causal price/liquidity reading for the existing M5 chart rail.
 * "Accumulation" and "distribution" describe observed/possible price action,
 * NEVER hidden institutions or a verified MT5/crypto order book.
 * No future/forming candles, execution orders, or win probabilities.
 */
type Side='BUY'|'SELL'|'WAIT';
export type LiquiditySignal={
 state:'ACCUMULATION'|'DISTRIBUTION'|'BALANCE'|'UNAVAILABLE';
 label:string;source:'M15_CLOSED'|'M1_M5_CLOSED'|'NONE';
 aheadSide:Side;trigger:number|null;reason:string;
};
type Context={label:string;low:number;high:number;historical:boolean}|null;
type PreMove={ok:boolean;status:string;stage:string;side:Side;
 sourceAt:number;trigger:number|null;invalidation:number|null;
 compression:number;sweep:'LOWER'|'UPPER'|'NONE';readiness:number;reason:string}|null;
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function describeLiquidityBeforeMove(input:{
 now:number;price:number|null;marketFresh:boolean;
 context:Context;preMove:PreMove;
}):LiquiditySignal{
 const none=(label:string,reason:string,state:LiquiditySignal['state']='UNAVAILABLE'):LiquiditySignal=>({
  state,label,source:'NONE',aheadSide:'WAIT',trigger:null,reason
 });
 const {now,price,context,preMove:p}=input;
 if(!input.marketFresh||!valid(now)||!valid(price))
  return none('السيولة: مصدر متأخر','السعر الحي أو اتصال الشموع غير مؤهل');
 // A prospective M1/M5 pattern is given priority over a historical M15
 // context, but only while its ORIGINAL trigger is still ahead of price.
 const recent=p?.ok===true&&p.status==='CONDITIONAL_WATCH'&&
  (p.stage==='ARMED'||p.stage==='BUILDING')&&
  Number.isSafeInteger(p.sourceAt)&&p.sourceAt>0&&p.sourceAt<=now&&
  now-p.sourceAt<=90000&&p.readiness>=43&&
  (p.side==='BUY'||p.side==='SELL')&&valid(p.trigger)&&
  valid(p.invalidation)&&p.compression>=20;
 const ahead=recent&&p!.side==='BUY'?
  p!.trigger!>price&&p!.invalidation!<price&&p!.invalidation!<p!.trigger!:
  recent&&p!.side==='SELL'?
  p!.trigger!<price&&p!.invalidation!>price&&p!.invalidation!>p!.trigger!:false;
 if(ahead){
  const buy=p!.side==='BUY';
  const opposing=Boolean(context&&!context.historical&&
   ((context.label.includes('تصريف')&&buy)||
    (context.label.includes('تجميع')&&!buy)));
  if(opposing)return none('السيولة: إشارات متعارضة',
   'رصد ضغط M1 يعارض قراءة منطقة M15؛ لا نجزم باتجاه السيولة','BALANCE');
  return {state:buy?'ACCUMULATION':'DISTRIBUTION',
   label:buy?'تجميع سعري محتمل ↑':'تصريف سعري محتمل ↓',
   source:'M1_M5_CLOSED',aheadSide:p!.side,trigger:p!.trigger,
   reason:'قراءة ضغط/انضغاط من شموع M1/M5 مغلقة قبل الكسر؛ ليست أوامر مؤسسات ولا إذن دخول'};
 }
 if(context&&!context.historical&&valid(context.low)&&
   valid(context.high)&&context.high>=context.low&&
   price>=context.low&&price<=context.high){
  const state=context.label.includes('تجميع')?'ACCUMULATION':
   context.label.includes('تصريف')?'DISTRIBUTION':'BALANCE';
  return {state,source:'M15_CLOSED',aheadSide:'WAIT',trigger:null,
   label:state==='ACCUMULATION'?'تجميع سعري مرصود':
    state==='DISTRIBUTION'?'تصريف سعري مرصود':'توازن داخل منطقة سيولة',
   reason:'منطقة M15 مغلقة؛ لا دليل على حجم الأوامر المؤسسية أو اتجاه الشمعة التالية'};
 }
 if(context?.historical)return none('السيولة: منطقة سابقة',
   'منطقة M15 تاريخية أو خرج السعر من حدودها؛ لا نزعم أنها جارية','BALANCE');
 return none('السيولة: غير محسوم',
  'لم تتشكل دلائل متصلة كافية لتصنيف تجميع أو تصريف حالي','BALANCE');
}
