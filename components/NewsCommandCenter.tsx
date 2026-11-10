'use client';
import {useEffect,useState} from 'react';
import {Clock3,Newspaper} from 'lucide-react';
import {economicNewsTimeline} from '../lib/news-alert-window';
import {classifyMacroNews} from '../lib/news-impact-outlook';
import {buildPreNewsGoldLean} from '../lib/pre-news-gold-lean';

function timeLeft(ts:number,now:number){
  const minutes=Math.max(0,Math.ceil((ts-now)/60000));
  if(minutes===0)return 'يصدر الآن';
  const hours=Math.floor(minutes/60),mins=minutes%60;
  return hours?hours+'س '+mins+'د':minutes+'د';
}
const dateLabel=(ts:number)=>new Date(ts).toLocaleString('ar-AE',{
  timeZone:'Asia/Dubai',weekday:'short',day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'
});
function conditionalImpact(e:any){
  const name=String(e?.name||'');
  if(/claims|unemployment rate|jobless|continuing claims/i.test(name))
    return 'أعلى من المتوقع: احتمال دعم الذهب بسبب ضعف التوظيف؛ أقل من المتوقع: احتمال ضغط على الذهب.';
  if(/CPI|PCE|PPI|inflation|average hourly|earnings|payroll|employment change|GDP|PMI|ISM|retail|consumer confidence|JOLTS|job openings/i.test(name))
    return 'قراءة أعلى من المتوقع قد تدعم الدولار والعوائد وتضغط على الذهب؛ الأقل قد تدعم الذهب.';
  if(/FOMC|Powell|Fed Chair|minutes|interest rate|rate decision/i.test(name))
    return 'لغة فدرالية متشددة قد تضغط على الذهب؛ تيسيرية قد تدعمه. اتّجاه BTC قد يختلف.';
  return 'النتيجة واتجاه الدولار والعوائد والسعر هي التي تحدد الاستجابة، وليس اسم الحدث وحده.';
}
function NewsEventCard({event,now}:any){
  const importance=Number(event.importance)||1;
  return <article className={'news-eight-hour-item '+(importance>=3?'news-high-impact':'')}
    key={event.id||event.name+event.time}>
    <div className="news-eight-hour-top">
      <span>{importance>=3?'تأثير قوي':importance===2?'تأثير متوسط':'تأثير منخفض'}</span>
      <strong><Clock3 size={14}/> {timeLeft(Number(event.time),now)}</strong>
    </div>
    <b>{event.name}</b>
    <small>{dateLabel(Number(event.time))} · الإمارات</small>
    <p>توقع السوق: <strong>{event.forecast||'غير متوفر'}</strong> · السابق: {event.previous||'غير متوفر'}</p>
    <p>{conditionalImpact(event)}</p>
    {/^https:\/\//.test(String(event.source||''))&&<a href={event.source} target="_blank" rel="noopener noreferrer">مصدر الخبر ↗</a>}
  </article>;
}
export default function NewsCommandCenter({events=[],now=Date.now(),featuredEvent=null,
  goldCandles=[],goldSource='',goldProviderTransition=false}:any){
  const [feed,setFeed]=useState<any>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let closed=false,inFlight=false;
    const load=async()=>{
      if(closed||inFlight||document.visibilityState!=='visible')return;
      inFlight=true;
      try{
        const response=await fetch('/api/news?ts='+Date.now(),
          {cache:'no-store',signal:AbortSignal.timeout(20000)});
        const value=await response.json();
        if(!response.ok||!value?.ok||!value.newsReady||!Array.isArray(value.events))
          throw new Error('news feed unavailable');
        if(!closed){setFeed(value);setError(value.sourceStatus!=='ready');}
      }catch{if(!closed)setError(true);}
      finally{inFlight=false;}
    };
    void load();
    const interval=setInterval(()=>{void load();},90000);
    const visibility=()=>{if(document.visibilityState==='visible')void load();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{closed=true;clearInterval(interval);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  const {upcoming,alerts,recent}=economicNewsTimeline(feed?.events??events,feed?null:featuredEvent,now);
  const dubaiDay=(at:number)=>new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(at));
  const today=dubaiDay(now);
  // The 8-hour alert still exists, but a release later TODAY must stay
  // visible from early morning. No fabricated event if the provider is empty.
  const todayUpcoming=upcoming.filter(e=>dubaiDay(Number(e.time))===today);
  const ranked=(xs:typeof alerts)=>[...xs].sort((a,b)=>
    Number(b.importance||1)-Number(a.importance||1)||Number(a.time)-Number(b.time));
  const highlighted=ranked(alerts)[0]??ranked(todayUpcoming)[0]??
    [...recent].sort((a,b)=>Number(b.importance||1)-Number(a.importance||1)||
      Number(b.time)-Number(a.time))[0];
  const released=Boolean(highlighted&&Number(highlighted.time)<now);
  const actualReady=Boolean(released&&String(highlighted?.actual||'').trim());
  const eventState=released?(actualReady?'النتيجة صدرت':'نتيجة الخبر قيد التحديث'):
    highlighted?'بعد '+timeLeft(Number(highlighted.time),now):'';
  const next=alerts[0];
  // The featured release is already prominent above; do not repeat it below.
  const remainingAlerts=alerts.filter(e=>e!==highlighted);
  const outlook=classifyMacroNews(highlighted?.name);
  const preLean=highlighted&&Number(highlighted.time)>now
    ?buildPreNewsGoldLean({eventTime:Number(highlighted.time),now,
      candles:goldCandles,source:String(goldSource),
      providerTransition:Boolean(goldProviderTransition)}):null;
  const preLabel=preLean?.side==='UP'?'↑ ميل صعود':preLean?.side==='DOWN'?'↓ ميل هبوط':'↔ غير محسوم';
  return <details className="news-ticker-shell" aria-label="أهم أخبار اليوم وتأثيرها المحتمل على الذهب">
    <summary className="news-ticker-line" title={highlighted?outlook.disclaimer:'متابعة أهم أخبار اليوم'}>
      <span className="news-ticker-tag">خبر اليوم</span>
      <span className="news-ticker-countdown">{highlighted?eventState:error?'التحديث متأخر':'لا أخبار قادمة'}</span>
      <strong className="news-ticker-title">{highlighted?.name||'لا يوجد خبر اقتصادي مؤكد اليوم'}</strong>
      {preLean?.visible&&<span className={'news-ticker-prebias news-ticker-prebias-'+preLean.side.toLowerCase()}
        title="حركة السعر قبل الخبر؛ لا تتنبأ بنتيجة الإعلان أو اتجاهه المؤكد بعد الصدور">
        {preLabel}</span>}
      {highlighted&&<span className="news-ticker-forecast">{actualReady?'فعلي: '+String(highlighted.actual):
         'توقع: '+String(highlighted.forecast||'غير متوفر')}</span>}
      {highlighted&&<span className={'news-ticker-impact '+(outlook.kind==='UNCERTAIN'?'news-ticker-uncertain':'')}>
        {outlook.higher} <span className="news-ticker-divider">/</span> {outlook.lower}
      </span>}
      <span className="news-ticker-expand">التفاصيل ▾</span>
    </summary>
    <div className="panel newscommand standalone-news home-news-compact news-ticker-details">
    <header className="standalone-news-head">
      <div><span className="eyebrow">NEWS · TODAY · UAE</span>
        <h2><Newspaper size={16}/> رادار الأخبار</h2></div>
      <small>{feed?'آخر جلب: '+new Date(feed.checkedAt).toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'}):'جارٍ قراءة التقويم'}</small>
    </header>
    {error&&<p role="status" className="news-eight-empty">تعذر تأكيد تحديث التقويم الآن؛ بيانات الأخبار قد تكون قديمة.</p>}
    {highlighted?<div className="news-headline">
      <span className="news-headline-meta">
        <strong>{Number(highlighted.importance)>=3?'أهم خبر مرتفع التأثير':'خبر اقتصادي قادم'}</strong>
        <small><Clock3 size={13}/> {eventState}</small>
      </span>
      <strong className="news-headline-title">{highlighted.name}</strong>
      <span className="news-headline-numbers">الفعلي {actualReady?String(highlighted.actual):'لم يتم تأكيده بعد'} · المتوقع {String(highlighted.forecast||'—')} · السابق {String(highlighted.previous||'—')}</span>
      <small>{dateLabel(Number(highlighted.time))} · السيناريو مرتبط بالنتيجة الفعلية، لا توجد نسبة اتجاه مؤكدة.</small>
    </div>:<p className="news-eight-empty">{error?'لم نتمكن من تأكيد الأحداث القادمة.':'لا يوجد خبر اقتصادي مؤكد اليوم في المصدر.'}</p>}
    {preLean?.visible&&<div className={'news-prebias-detail news-prebias-'+preLean.side.toLowerCase()} role="status">
      <div className="news-prebias-top">
        <strong>ترجيح الذهب قبل الخبر بـ{preLean.minutesLeft} دقيقة: {preLabel}</strong>
        <small>{preLean.quality==='STRONG'?'توافق حركة مرتفع':preLean.quality==='MEDIUM'?'توافق حركة متوسط':'بيانات غير كافية'}</small>
      </div>
      <p>{preLean.reason} · {preLean.evidence}</p>
      <small>ترجيح من حركة XAUUSD قبل الإصدار، وليس توقعًا لرقم الخبر أو ضمانًا لحركة الذهب بعده. لا يستخدم Actual المستقبلي ولا يفعّل صفقة.</small>
    </div>}
    {remainingAlerts.length>0&&<details className="news-all-details">
      <summary>باقي أخبار الـ8 ساعات ({remainingAlerts.length}) {next&&highlighted!==next?'· أقرب خبر بعد '+timeLeft(Number(next.time),now):''}</summary>
      <div className="news-eight-hour">
        {remainingAlerts.map((e:any)=><NewsEventCard key={e.id||e.name+e.time} event={e} now={now}/>)}
      </div>
    </details>}
    {recent.filter(e=>e!==highlighted).length>0&&<details className="news-all-details">
       <summary>أخبار اليوم بعد موعد صدورها ({recent.filter(e=>e!==highlighted).length})</summary>
       <div className="news-post-release">{recent.filter(e=>e!==highlighted).map((e:any)=><span key={e.id||e.name+e.time}>
         {e.name}: الفعلي {e.actual||'قيد التحديث'} · المتوقع {e.forecast||'—'}
       </span>)}</div>
     </details>}
    <p className="news-ticker-caveat">{outlook.disclaimer}</p>
    </div>
  </details>;
}
