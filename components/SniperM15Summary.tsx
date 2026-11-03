type Side='BUY'|'SELL'|'WAIT';
type Level={stage:number;price:number};
type Candle={open:number;close:number};
type Props={
  asset:'GOLD'|'BTC';ready:boolean;saved:boolean;paused:boolean;detached:boolean;
  marketOpen:boolean;providerTransition:boolean;fresh:boolean;side:Side;
  price:number|null;trigger:number|null;upper:number|null;lower:number|null;
  stop:number|null;targets:Level[];nextBar:Candle|null;signal:string|null;
};
const fmt=(v:number|null|undefined)=>v!=null&&Number.isFinite(v)&&v>0?
  v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

export default function SniperM15Summary(p:Props){
  const label=p.side==='BUY'?'صعود':p.side==='SELL'?'هبوط':'انتظار';
  const validSide=p.side!=='WAIT';
  const title=p.ready?'سيناريو M15 · '+label:
    p.saved?'سيناريو محفوظ · غير نشط':
    validSide&&p.fresh?'مراقبة مبكرة · '+label:'انتظار سيناريو M15';
  const status=p.ready?'12 شمعة مشروطة':
    p.saved?'توقع سابق':
    !p.marketOpen?'السوق مغلق':
    p.providerTransition?'المصدر قيد التبديل':'لا يوجد توقع معتمد';
  const message=p.ready&&p.nextBar?
    'الشمعة الأولى افتراضية: '+(p.nextBar.close>=p.nextBar.open?'صعود':'هبوط')+
      ' · إغلاق توضيحي '+fmt(p.nextBar.close):
    p.saved?p.detached?'السعر ابتعد عن التوقع المحفوظ؛ ليس توقعًا حيًا':
      p.paused?'التوقع محفوظ لكن البيانات متأخرة':
      'السيناريو القديم محفوظ للمراجعة وليس للدخول':
    !p.marketOpen?'آخر بيانات فقط · لا توجد إشارة حية':
    p.providerTransition?'ننتظر اكتمال تغيير مصدر الأسعار':
    !p.fresh?'الشموع غير حديثة أو شروط M15 غير مكتملة':
    p.signal??'نراقب شروط الكسر قبل إصدار توقع شموع جديد';
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
  </section>;
}
