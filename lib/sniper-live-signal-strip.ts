import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M1Priority} from './sniper-m1-priority';

export type VisibleSignal={
  kind:'OFFLINE'|'WAIT'|'BIAS'|'PREPARE'|'TESTING'|'BREAK'|'EXPIRED';
  side:'BUY'|'SELL'|'WAIT';title:string;description:string;
  trigger:number|null;invalidation:number|null;targets:number[];
  score:number|null;sourceAt:number|null;executionConfirmed:false;
};

export function visibleSniperSignal(input:{
  now:number;marketOpen:boolean;priceFresh:boolean;providerTransition:boolean;
  opportunity:LiveOpportunity;priority:M1Priority;
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
  if(o.phase==='CANCELLED')return wait('EXPIRED','الإشارة السابقة أُلغيت',
    o.reason||'السعر أبطل الكسر المرصود');
  const activeSide=o.side==='BUY'||o.side==='SELL'?o.side:null;
  if(activeSide&&(o.phase==='BREAK_CONFIRMED'||o.phase==='PREPARE'||o.phase==='TESTING')){
    const age=o.sourceAt!=null?input.now-o.sourceAt:Infinity;
    if(o.phase==='BREAK_CONFIRMED'&&
      (!Number.isFinite(age)||age<0||age>120000))
      return wait('EXPIRED','كسر سابق · مش إشارة جديدة',
        'آخر كسر M1 تجاوز دقيقتين؛ نراقب حدوث تأكيد جديد');
    if(o.sourceAt==null||age<0||age>120000)
      return wait('WAIT','انتظار تجديد القراءة',
        'آخر تهيئة انتهت صلاحيتها؛ لا تُكرر نفس الإشارة');
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
  // A valid M1 directional priority is a visible watch, NOT an entry.
  if(p.ready&&(p.side==='BUY'||p.side==='SELL'))
    return {...base,kind:'BIAS',side:p.side,
      title:(p.side==='BUY'?'شراء BUY':'بيع SELL')+' · ترجيح M1',
      description:p.reason+'؛ لا يوجد كسر دخول مؤكد',
      score:p.pressureScore,sourceAt:p.anchorTime};
  return wait('WAIT','انتظار إشارة M1',
    o.reason||p.reason||'لا يوجد تحضير أو كسر صالح الآن');
}
