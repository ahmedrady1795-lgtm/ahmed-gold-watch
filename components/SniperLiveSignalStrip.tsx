import type {LiveOpportunity} from '../lib/sniper-live-opportunity';
import type {M1Priority} from '../lib/sniper-m1-priority';
import type {EveryM1Direction} from '../lib/sniper-m1-every-direction';
import type {CandleHunter} from '../lib/sniper-m1-candle-hunter';
import {visibleSniperSignal} from '../lib/sniper-live-signal-strip';

const fmt=(n:number|null|undefined)=>n!=null&&Number.isFinite(n)&&n>0?
  n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

export default function SniperLiveSignalStrip(p:{
  now:number;marketOpen:boolean;priceFresh:boolean;providerTransition:boolean;
  opportunity:LiveOpportunity;priority:M1Priority;minute:EveryM1Direction|null;plan?:CandleHunter|null;
}){
  const s=visibleSniperSignal(p);
  const directions=s.side!=='WAIT';
  return <section className={'sniper-m15-live-signal-strip signal-'+s.kind.toLowerCase()+
       (s.side==='BUY'?' signal-buy':s.side==='SELL'?' signal-sell':'')}
     role="status" aria-live="polite" aria-label="إشارة القناص M1 بشكل واضح">
    <div className="sniper-m15-live-signal-head">
      <span>اتجاه الدقيقة · M1</span>
      <strong>{s.title}</strong>
      <b>{s.kind==='BREAK'?'كسر مرصود':s.kind==='TESTING'?'اختبار':
        s.kind==='PREPARE'?'إنذار مبكر':s.kind==='FORECAST'?'توقع للمراقبة':s.kind==='BIAS'?'ترجيح فقط':
        s.kind==='EXPIRED'?'ملغاة/قديمة':s.kind==='OFFLINE'?'غير متاحة':'انتظار'}</b>
    </div>
    <p>{s.description}</p>
    <div className="sniper-m15-live-signal-levels">
      <span><small>{s.levelsAreWatchOnly?'مستوى كسر للمراقبة':'التفعيل'}</small><b dir="ltr">{directions?fmt(s.trigger):'—'}</b></span>
      <span><small>{s.levelsAreWatchOnly?'إبطال مرجعي':'الإبطال'}</small><b dir="ltr">{directions?fmt(s.invalidation):'—'}</b></span>
      <span><small>{s.levelsAreWatchOnly?'هدف مرجعي M1':'أقرب مستوى'}</small><b dir="ltr">{directions?fmt(s.targets[0]):'—'}</b></span>
      <span><small>قوة القراءة</small><b dir="ltr">{s.score!=null?s.score+'/100':'—'}</b></span>
    </div>
    <small className="sniper-m15-live-signal-disclaimer">
      {s.kind==='BREAK'?'كسر مؤكّد بالإغلاق فقط؛ ليس تأكيد تنفيذ أو دخول LIMIT.':
       s.kind==='FORECAST'?'توقع اتجاه الشمعة الحالية من الشمعة السابقة، وقد يخطئ؛ ليس BUY/SELL لتنفيذ صفقة.':
       s.kind==='BIAS'?'اتجاه رصد من شموع مغلقة؛ ليس إشارة تنفيذ.':
       'مراقبة مشروطة، وليست أمر تداول.'}
      {' '}{s.levelsAreWatchOnly&&s.referenceR!=null?
       'عائد/وقف مرجعي قبل التكلفة '+s.referenceR.toFixed(2)+'R · ':''}
      قوة القراءة ليست نسبة نجاح.
    </small>
  </section>;
}
