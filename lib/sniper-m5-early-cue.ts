import type {PreMovePressure} from './pre-move-pressure';
import type {M1ReclaimWatch} from './sniper-m1-reclaim-watch';
import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M5CandleLean} from './sniper-m5-candle-lean';

type Side='BUY'|'SELL'|'WAIT';
export type M5EarlyCue={
 stage:'OFFLINE'|'NONE'|'PREBREAK'|'TESTING'|'BREAK_OBSERVED'|
   'M1_DIRECTION_WATCH'|'M5_FOLLOWING'|'LATE';
 side:Side;headline:string;detail:string;asOf:number|null;
 trigger:number|null;invalidation:number|null;
 futureTradeAuthorized:false;flowVerified:false;
};

/** Independent quick M1/M5 research label for the real M5 chart.
 * No evidence from a historical M15 model is required merely to DISPLAY a
 * pending watch. A NO_DEMONSTRATED_EDGE M15 result cannot erase an M1 watch,
 * but neither a prior rally nor incomplete ticks may create a BUY/SELL call.
 * All price levels are already produced from closed bars upstream.
 */
export function chartM5EarlyCue(a:{
 now:number;price:number|null;marketOpen:boolean;priceFresh:boolean;
 providerTransition:boolean;preMove:PreMovePressure|null;
 opportunity:LiveOpportunity|null;lean:M5CandleLean|null;
 reclaim?:M1ReclaimWatch|null;
 m5Follow?:{ready:boolean;side:Side;reason:string}|null
}):M5EarlyCue{
 const base:M5EarlyCue={stage:'NONE',side:'WAIT',
  headline:'لا توجد تهيئة جديدة',detail:'السوق قيد القراءة',
  trigger:null,invalidation:null,asOf:null,
  futureTradeAuthorized:false,flowVerified:false};
 const result=(stage:M5EarlyCue['stage'],side:Side,headline:string,
   detail:string,trigger:number|null=null,invalidation:number|null=null,
   asOf:number|null=null):M5EarlyCue=>
  ({...base,stage,side,headline,detail,trigger,invalidation,asOf});
 if(!Number.isFinite(a.now)||a.price==null||!Number.isFinite(a.price)||
   a.price<=0||!a.marketOpen||!a.priceFresh||a.providerTransition)
  return result('OFFLINE','WAIT','البيانات أو السوق غير جاهز',
   !a.marketOpen?'السوق مغلق':'تغذية السعر/الشموع غير حديثة أو تغيّر مصدر البيانات');
 const {price,now}=a;
 const within=(t:number|null|undefined,maxAge:number)=>{
  return typeof t==='number'&&Number.isSafeInteger(t)&&t>0&&
    now>=t&&now-t<=maxAge;
 };
 const valid=(side:Side,trigger:number|null|undefined,
   stop:number|null|undefined)=>{
  return side!=='WAIT'&&typeof trigger==='number'&&
   typeof stop==='number'&&Number.isFinite(trigger)&&
   Number.isFinite(stop)&&trigger>0&&stop>0&&
   (side==='BUY'?trigger>stop:trigger<stop);
 };
 const before=(side:Side,trigger:number,stop:number)=>{
  const ahead=side==='BUY'?trigger-price:price-trigger;
  const available=Math.abs(trigger-stop);
  // A quote already touching or crossing a trigger is NOT 'before the move'.
  return ahead>Math.max(price*.000001,available*.012)&&
    ahead<=available*1.2&&
    (side==='BUY'?price>stop:price<stop);
 };
 const o=a.opportunity;
 if(o&&(o.phase==='PREPARE'||o.phase==='TESTING')&&
   valid(o.side,o.trigger,o.invalidation)&&within(o.sourceAt,90000)){
  const trigger=o.trigger!,stop=o.invalidation!;
  if(before(o.side,trigger,stop))
   return result('PREBREAK',o.side,o.side==='BUY'?'ترقب شراء قبل الكسر':'ترقب بيع قبل الكسر',
     'إعداد M1/M5 سابق للكسر · ليس تصريح دخول',trigger,stop,o.sourceAt);
 }

 // The dedicated closed-M1 compression/sweep detector can be displayed
 // BEFORE M15 has a proven historical edge. This is a WATCH only.
 const p=a.preMove;
 if(p?.ok&&(p.stage==='ARMED'||p.stage==='BUILDING')&&
   valid(p.side,p.trigger,p.invalidation)&&within(p.sourceAt,75000)&&
   p.status==='CONDITIONAL_WATCH'&&p.readiness>=43){
  if(before(p.side,p.trigger!,p.invalidation!))
   return result('PREBREAK',p.side,p.side==='BUY'?'تهيئة شراء مبكرة':'تهيئة بيع مبكرة',
    'شموع M1/M5 مغلقة · ضغط قبل تجاوز المستوى · مراقبة وليست صفقة',
    p.trigger,p.invalidation,p.sourceAt);
 }

 // Independent pullback/reclaim setups catch continuation after a short
 // retracement, where a compressed-range-only detector stays in WAIT.
 // This is a pre-trigger research WATCH, never confirmed broker flow.
 const r=a.reclaim;
 if(r&&within(r.asOf,75000)&&valid(r.side,r.trigger,r.invalidation)&&
   before(r.side,r.trigger,r.invalidation))
  return result('PREBREAK',r.side,
    r.side==='BUY'?'ترقب شراء بعد استرداد M1':'ترقب بيع بعد رفض M1',
    'عودة الاتجاه بعد تصحيح قصير · شموع M1/M5 مغلقة · تدفق تنفيذ حقيقي غير مؤكد',
    r.trigger,r.invalidation,r.asOf);
 // A fresh independent pre-break hypothesis takes priority over a past crossing.
 // Previously crossed levels are still shown when no fresh pre-break candidate qualifies.
 if(o&&(o.phase==='PREPARE'||o.phase==='TESTING')&&
   valid(o.side,o.trigger,o.invalidation)&&within(o.sourceAt,90000)){
  const trigger=o.trigger!,stop=o.invalidation!;
  if(o.phase==='TESTING'&&
      (o.side==='BUY'?price>=trigger&&price<=trigger+Math.abs(trigger-stop)*.25:
       price<=trigger&&price>=trigger-Math.abs(trigger-stop)*.25))
   return result('TESTING',o.side,o.side==='BUY'?'اختبار كسر صاعد':'اختبار كسر هابط',
    'الكسر بدأ · ننتظر إغلاقًا جديدًا، ليس إنذارًا قبل الحركة',
    trigger,stop,o.sourceAt);
  return result('LATE','WAIT','الحركة سبقت نقطة التفعيل',
   'لا مطاردة لشمعة اخترقت المستوى أو انعكست قبل تأكيد الاختبار');
 }
 if(o?.phase==='BREAK_CONFIRMED'&&
   valid(o.side,o.trigger,o.invalidation)&&within(o.sourceAt,60000)){
  const advance=o.side==='BUY'?price-o.trigger!:o.trigger!-price;
  const risk=Math.abs(o.trigger!-o.invalidation!);
  if(advance>=0&&advance<=risk*.55)
   return result('BREAK_OBSERVED',o.side,
     o.side==='BUY'?'كسر صاعد مرصود':'كسر هابط مرصود',
     'الكسر مؤكد بعد بدايته · ليست إشارة قبل الحركة أو تنفيذ',
     o.trigger,o.invalidation,o.sourceAt);
  return result('LATE','WAIT','الحركة خرجت عن نطاق القنص المبكر',
   'لن نصنّف موجة بدأت بالفعل كشراء أو بيع مبكر');
 }
 const lean=a.lean;
 if(lean&&lean.side!=='WAIT'&&
   ['OPEN','CLOSE'].includes(lean.phase)&&within(lean.issuedFor,60000)){
  return result('M1_DIRECTION_WATCH',lean.side,
   lean.side==='BUY'?'رصد ميل شراء M1':'رصد ميل بيع M1',
   'ترجيح من إغلاقات دقيقة سابقة · ليس دخولًا ولا إثباتًا للسبق',
   null,null,lean.issuedFor);
 }
 if(a.m5Follow?.ready&&a.m5Follow.side!=='WAIT')
  return result('M5_FOLLOWING',a.m5Follow.side,
   a.m5Follow.side==='BUY'?'متابعة صعود M5':'متابعة هبوط M5',
   'الحركة بدأت في شموع M5 المغلقة · لا تُعرض كفرصة قنص مبكرة');
 return base;
}
