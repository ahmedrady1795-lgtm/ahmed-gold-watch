import type {M15WatchGuide} from '../lib/sniper-m15-watch-guide';
type Side='BUY'|'SELL'|'WAIT';
type Level={stage:number;price:number};
type Candle={open:number;close:number};
type Props={
  asset:'GOLD'|'BTC';ready:boolean;saved:boolean;paused:boolean;detached:boolean;
  marketOpen:boolean;providerTransition:boolean;fresh:boolean;side:Side;
  price:number|null;trigger:number|null;upper:number|null;lower:number|null;
  stop:number|null;targets:Level[];nextBar:Candle|null;signal:string|null;
  noForecastReason?:string|null;
  watchGuide?:M15WatchGuide|null;
};
const fmt=(v:number|null|undefined)=>v!=null&&Number.isFinite(v)&&v>0?
  v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

export default function SniperM15Summary(p:Props){
  const label=p.side==='BUY'?'صعود':p.side==='SELL'?'هبوط':'انتظار';
  const validSide=p.side!=='WAIT';
  const title=p.ready?'رصد M15 محفوظ · '+label:
    p.saved?'سيناريو محفوظ · غير نشط':
    validSide&&p.fresh?'مراقبة مبكرة · '+label:'خريطة سيولة M15';
  const status=p.ready?'قراءة محفوظة للقياس':
    p.saved?'قراءة تاريخية':
    !p.marketOpen?'السوق مغلق':
    p.providerTransition?'المصدر قيد التبديل':'مستويات مراقبة';
  const message=p.ready?
    'قراءة M15 محفوظة للمراجعة والقياس، وليست مسار شموع مستقبلية':
    p.saved?p.detached?'السعر ابتعد عن القراءة السابقة؛ ليست إشارة حية':
      p.paused?'القراءة محفوظة لكن البيانات متأخرة':
      'قراءة محفوظة للمقارنة، وليست توصية دخول':
    !p.marketOpen?'آخر بيانات فقط · لا توجد إشارة حية':
    p.providerTransition?'ننتظر اكتمال تغيير مصدر الأسعار':
    !p.fresh?'شموع M15 غير حديثة أو غير مكتملة':
    p.watchGuide?.ready?'مراقبة مستويات M15 من إغلاقات فعلية':
    p.signal??'نراقب مستويات القمم والقيعان قبل إصدار ترجيح جديد';
  return <section className={'sniper-m15-scenario-summary '+(p.ready?'is-ready':p.saved?'is-saved':'is-watch')}
    aria-label="السيناريو الأساسي ظاهر دائمًا">
    <div className="sniper-m15-summary-head">
      <div><small>القناص · {p.asset==='GOLD'?'الذهب':'البيتكوين'} · M15</small>
        <h2>{title}</h2></div>
      <span>{status}</span>
    </div>
    <div className="sniper-m15-summary-levels">
      <span><small>السعر</small><b dir="ltr">{fmt(p.price)}</b></span>
      <span><small>التفعيل المشروط</small><b dir="ltr">{fmt(p.trigger)!=='—'?fmt(p.trigger):
        p.upper!=null&&p.lower!=null?'↑ '+fmt(p.upper)+' / ↓ '+fmt(p.lower):'—'}</b></span>
      <span><small>الإبطال</small><b dir="ltr">{fmt(p.stop)}</b></span>
      {p.targets.slice(0,3).map((g,i)=><span key={'forecast-goal-'+g.stage}>
        <small>{p.ready?'هدف مشروط ':p.saved?'هدف محفوظ ':'هدف مراقبة '}{i+1}</small>
        <b dir="ltr">{fmt(g.price)}</b></span>)}
    </div>
    <p className="sniper-m15-summary-reason">{message}
      <small> · متابعة مشروطة، وليست أمر تداول.</small></p>
    {!p.ready&&p.noForecastReason&&<details className="sniper-m15-unavailable-details">
      <summary>تفاصيل شروط الرصد</summary>
      <p>{p.noForecastReason}</p>
    </details>}
  </section>;
}
