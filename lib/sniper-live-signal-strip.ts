import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M1Priority} from './sniper-m1-priority';
import type {EveryM1Direction} from './sniper-m1-every-direction';

export type VisibleSignal={
  kind:'OFFLINE'|'WAIT'|'BIAS'|'FORECAST'|'PREPARE'|'TESTING'|'BREAK'|'EXPIRED';
  side:'BUY'|'SELL'|'WAIT';title:string;description:string;
  trigger:number|null;invalidation:number|null;targets:number[];
  score:number|null;sourceAt:number|null;executionConfirmed:false;
};

export function visibleSniperSignal(input:{
  now:number;marketOpen:boolean;priceFresh:boolean;providerTransition:boolean;
  opportunity:LiveOpportunity;priority:M1Priority;minute:EveryM1Direction|null;
}):VisibleSignal{
  const {opportunity:o,priority:p}=input;
  const base={trigger:null,invalidation:null,targets:[] as number[],
    score:null,sourceAt:null,executionConfirmed:false as const};
  const wait=(kind:'OFFLINE'|'WAIT'|'EXPIRED',title:string,description:string):VisibleSignal=>
    ({...base,kind,side:'WAIT',title,description});
  if(!input.marketOpen)return wait('OFFLINE','السوق مغلق',
    'آخر قراءة محفوظة فقط؛ لا توجد إشارة تداول حية');
  if(input.providerTransition)return wait('OFFLINE','تغيير مصدر الأسعار',
    'بانتظار مصدر موحد؛ ممنوع إظهار إشارة قديمة كأنها جديدة');
  if(!input.priceFresh||o.phase==='OFFLINE')return wait('OFFLINE',
    'البيانات غير جاهزة',o.reason||'بيانات السعر أو الشموع غير حديثة');
  const minute=input.minute;
  // A prediction belongs to exactly the minute beginning at issuedAt.
  // Later browser ticks cannot reissue an old prediction as fresh.
  const freshMinute=Boolean(minute&&minute.issuedAt<=input.now&&
    input.now-minute.issuedAt<60000);
  const forecast=():VisibleSignal|null=>{
    if(!freshMinute||!minute)return null;
    return {...base,kind:'FORECAST',side:minute.side,
      title:(minute.side==='BUY'?'↑ صعود':'↓ هبوط')+
        (minute.weak?' · توقع ضعيف':' · توقع الدقيقة'),
      description:minute.directionReason+
        ' · قراءة صادرة عند بداية الدقيقة من شموع مغلقة وليست أمر دخول',
      score:minute.pressure,sourceAt:minute.issuedAt};
  };
  // Old or invalidated breakouts may be archived, but they must never
  // monopolize the main live signal while a NEW M1 forecast is available.
  const eventAge=o.sourceAt!=null?input.now-o.sourceAt:Infinity;
  if(o.phase==='CANCELLED'){
    const newMinute=o.sourceAt!=null&&minute&&
      minute.issuedAt>=o.sourceAt+60000;
    if(newMinute)return forecast()??wait('EXPIRED','الكسر السابق أُلغي',
      o.reason||'تم إبطال الرصد السابق');
    return wait('EXPIRED','الكسر السابق أُلغي',
      o.reason||'تم إبطال الرصد السابق');
  }
  const activeSide=o.side==='BUY'||o.side==='SELL'?o.side:null;
  if(activeSide&&(o.phase==='BREAK_CONFIRMED'||o.phase==='PREPARE'||o.phase==='TESTING')){
    if(o.sourceAt==null||eventAge<0||eventAge>120000)
      return forecast()??wait('EXPIRED','كسر سابق · مش إشارة جديدة',
        'آخر كسر M1 تجاوز دقيقتين؛ نراقب حدوث تأكيد جديد');
    const kind=o.phase==='BREAK_CONFIRMED'?'BREAK':o.phase;
    const direction=activeSide==='BUY'?'شراء BUY':'بيع SELL';
    return {
      kind,side:activeSide,
      title:kind==='BREAK'?direction+' · كسر M1 مرصود':
        kind==='TESTING'?direction+' · اختبار الكسر':direction+' · تحضير مبكر',
      description:o.reason,trigger:o.trigger,invalidation:o.invalidation,
      targets:o.targets.slice(0,2),score:o.strength,sourceAt:o.sourceAt,
      executionConfirmed:false
    };
  }
  // A lower-confidence hypothesis still receives a side for every valid
  // new minute. This is an explicit directional GUESS, never trade approval.
  const newForecast=forecast();
  if(newForecast)return newForecast;
  // A valid M1 directional priority is a visible watch, NOT an entry.
  if(p.ready&&(p.side==='BUY'||p.side==='SELL'))
    return {...base,kind:'BIAS',side:p.side,
      title:(p.side==='BUY'?'شراء BUY':'بيع SELL')+' · ترجيح M1',
      description:p.reason+'؛ لا يوجد كسر دخول مؤكد',
      score:p.pressureScore,sourceAt:p.anchorTime};
  return wait('WAIT','انتظار إشارة M1',
    o.reason||p.reason||'لا يوجد تحضير أو كسر صالح الآن');
}
