'use client';
import {useEffect,useState} from 'react';
import {Clock3,Newspaper} from 'lucide-react';
import {economicNewsTimeline} from '../lib/news-alert-window';
import {classifyMacroNews,expectedMacroBackdrop,observedNewsGoldReaction} from '../lib/news-impact-outlook';
import {adpWeeklyTrend,buildNewsIntelligence} from '../lib/news-intelligence';
import {buildPreNewsMultiFrame} from '../lib/pre-news-gold-lean';

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
const impactStrength=(e:any)=>Number(e?.importance)>=3?'تأثير قوي':Number(e?.importance)===2?'تأثير متوسط':'تأثير منخفض';
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
    <p>{expectedMacroBackdrop(event).label} · {conditionalImpact(event)}</p>
    {/^https:\/\//.test(String(event.source||''))&&<a href={event.source} target="_blank" rel="noopener noreferrer">مصدر الخبر ↗</a>}
  </article>;
}
export default function NewsCommandCenter({events=[],now=Date.now(),featuredEvent=null,
  goldCandles=[],goldM5=[],goldSource='',goldProviderTransition=false}:any){
  const [feed,setFeed]=useState<any>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let closed=false,inFlight=false;let initial:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      if(closed||inFlight||document.visibilityState!=='visible')return;
      inFlight=true;
      try{
        const response=await fetch('/api/news?ts='+Date.now(),
          {cache:'no-store',signal:AbortSignal.timeout(8500)});
        const value=await response.json();
        if(!response.ok||!value?.ok||!value.newsReady||!Array.isArray(value.events))
          throw new Error('news feed unavailable');
        if(!closed){setFeed(value);setError(value.sourceStatus!=='ready');}
      }catch{if(!closed)setError(true);}
      finally{inFlight=false;}
    };
    // Give the independent real M5 chart and quote feed startup priority.
    initial=setTimeout(()=>{void load();},1800);
    const interval=setInterval(()=>{void load();},15000);
    const visibility=()=>{if(document.visibilityState==='visible')void load();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{closed=true;clearTimeout(initial);clearInterval(interval);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  const {upcoming,alerts,recent}=economicNewsTimeline(feed?.events??events,feed?null:featuredEvent,now);
  const ranked=(xs:typeof alerts)=>[...xs].sort((a,b)=>
    Number(b.importance||1)-Number(a.importance||1)||Number(a.time)-Number(b.time));
  const next=upcoming[0];
  // Keep a just-due release visible while waiting for Actual, independently of the next event.
  const newlyReleased=recent.filter(e=>now-Number(e.time)<=30*60000);
  const highlighted=ranked(newlyReleased)[0]??next??ranked(recent)[0];
  const released=Boolean(highlighted&&Number(highlighted.time)<now);
  const actualReady=Boolean(released&&String(highlighted?.actual||'').trim());
  const eventState=released?(actualReady?'النتيجة صدرت':'نتيجة الخبر قيد التحديث'):
    highlighted?'بعد '+timeLeft(Number(highlighted.time),now):'';
  // The featured release is already prominent above; do not repeat it below.
  const remainingAlerts=alerts.filter(e=>e!==highlighted);
  const outlook=classifyMacroNews(highlighted?.name);
  const adpTrend=actualReady?adpWeeklyTrend(String(highlighted?.name),highlighted?.actual,highlighted?.previous,highlighted?.forecast):null;
  const macroBackdrop=!released&&highlighted?expectedMacroBackdrop(highlighted):null;
  const releaseSignal=actualReady&&highlighted?buildNewsIntelligence('GOLD',[highlighted as any],now):null;
  const actualImpact=actualReady?(releaseSignal?.side==='BUY'?'ذهب ↑ صعود محتمل · USD ↓':releaseSignal?.side==='SELL'?'ذهب ↓ هبوط محتمل · USD ↑':adpTrend?(adpTrend==='UP'?'ذهب ↑ صعود محتمل':'ذهب ↓ هبوط محتمل')+' · مقابل السابق فقط':'ذهب ↔ أثر غير محسوم'):
    released?'النتيجة قيد التحديث · لا اتجاه مؤكد':null;
  const feedStale=Boolean(error||feed&&now-Number(feed.checkedAt)>60000);
  const impactLabel=actualImpact??(macroBackdrop?.side!=='WAIT'?macroBackdrop?.label:null);
  const preLean=highlighted&&Number(highlighted.time)>now
    ?buildPreNewsMultiFrame({eventTime:Number(highlighted.time),now,
      candles:goldCandles,m5:goldM5,source:String(goldSource),
      providerTransition:Boolean(goldProviderTransition)}):null;
  const preLabel=preLean?.side==='UP'?'↑ ميل صعود':preLean?.side==='DOWN'?'↓ ميل هبوط':'↔ غير محسوم';
  const disagreement=Boolean(preLean?.visible&&preLean.side!=='WAIT'&&macroBackdrop&&macroBackdrop.side!=='WAIT'&&preLean.side!==macroBackdrop.side);
  const reaction=released&&highlighted?observedNewsGoldReaction({eventTime:Number(highlighted.time),now,candles:goldCandles,source:String(goldSource),providerTransition:Boolean(goldProviderTransition)}):null;
  const nextBackdrop=next?expectedMacroBackdrop(next):null;
  const nextOutlook=next?classifyMacroNews(next.name):null;
  return <details className="news-ticker-shell" aria-label="أهم أخبار اليوم وتأثيرها المحتمل على الذهب">
    <summary className="news-ticker-line" style={{flexWrap:'wrap',whiteSpace:'normal',overflow:'visible'}} title={highlighted?outlook.disclaimer:'متابعة أهم أخبار اليوم'}>
      <span className="news-ticker-tag">{released?'آخر إصدار':'أقرب خبر'}</span>
      <span className="news-ticker-countdown">{highlighted?eventState:error?'التحديث متأخر':!feed?'جاري تحديث الأخبار':'لا أخبار قادمة'}</span>
      <strong className="news-ticker-title" style={{whiteSpace:'normal',overflow:'visible',maxWidth:'none',flex:'1 1 160px'}}>{highlighted?.name||(!feed&&!error?'جاري فحص التقويم':'لا يوجد خبر مؤكد في المصدر')}</strong>
      {highlighted&&<span style={{whiteSpace:'normal',fontSize:11}}>{dateLabel(Number(highlighted.time))} · الإمارات · {impactStrength(highlighted)}</span>}
      {preLean?.visible&&<span className={'news-ticker-prebias news-ticker-prebias-'+preLean.side.toLowerCase()}
        title="حركة السعر قبل الخبر؛ لا تتنبأ بنتيجة الإعلان أو اتجاهه المؤكد بعد الصدور">
        {disagreement?'↔ تعارض التوقع والحركة':preLabel}</span>}
      {macroBackdrop&&!preLean?.visible&&<span className={'news-ticker-prebias news-ticker-prebias-'+macroBackdrop.side.toLowerCase()} title={macroBackdrop.reason}>{macroBackdrop.label}</span>}
      {highlighted&&<span className="news-ticker-forecast">{actualReady?'فعلي: '+String(highlighted.actual):
         'توقع: '+String(highlighted.forecast||'غير متوفر')}</span>}
      {highlighted&&<span style={{display:'inline',whiteSpace:'normal',flex:'1 1 160px',color:released&&releaseSignal?.side==='SELL'?'#fa92a4':undefined}} className={'news-ticker-impact '+(outlook.kind==='UNCERTAIN'?'news-ticker-uncertain':'')}>
        {feedStale?'بيانات غير محدثة · ':''}{released?actualImpact:<>{outlook.higher} <span className="news-ticker-divider">/</span> {outlook.lower}</>}
      </span>}
      {reaction&&<span role="status" style={{fontSize:11,color:reaction.side==='UP'?'#62e6b0':reaction.side==='DOWN'?'#fa92a4':undefined}}>{reaction.label}</span>}
      {next&&next!==highlighted&&<span data-nearest-news="true" style={{display:'block',flex:'1 0 100%',whiteSpace:'normal',fontSize:12}}><b>أقرب خبر: {next.name}</b> · {dateLabel(Number(next.time))} الإمارات · بعد {timeLeft(Number(next.time),now)} · {impactStrength(next)} · {nextBackdrop?.side!=='WAIT'?nextBackdrop?.label:(nextOutlook?.higher+' / '+nextOutlook?.lower)}</span>}
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
        <strong>{Number(highlighted.importance)>=3?'تأثير قوي':Number(highlighted.importance)===2?'تأثير متوسط':'تأثير منخفض'}</strong>
        <small><Clock3 size={13}/> {eventState}</small>
      </span>
      <strong className="news-headline-title">{highlighted.name}</strong>
      <span className="news-headline-numbers">الفعلي {actualReady?String(highlighted.actual):'لم يتم تأكيده بعد'} · المتوقع {String(highlighted.forecast||'—')} · السابق {String(highlighted.previous||'—')}</span>
      <small>{dateLabel(Number(highlighted.time))} · الإمارات · السيناريو مرتبط بالنتيجة الفعلية، لا توجد نسبة اتجاه مؤكدة.</small>
      {impactLabel&&<strong role="status">{feedStale?'آخر قراءة · ':''}{impactLabel}</strong>}
      {macroBackdrop&&<small>{macroBackdrop.reason}</small>}
      {reaction&&<small>{reaction.label} · قياس أول خمس دقائق من السعر وليس إثباتًا أن الخبر سبب الحركة.</small>}
      {released&&releaseSignal?.directional&&<small>الأثر الاقتصادي من الفعلي مقابل المتوقع، وليس اتجاه السعر المؤكد. BTC يحتاج تأكيد السعر والسيولة.</small>}
      {next&&next!==highlighted&&<small>أقرب خبر قادم: {next.name} · {dateLabel(Number(next.time))} · {timeLeft(Number(next.time),now)}</small>}
      {disagreement&&<small>التوقع الاقتصادي وحركة الذهب متعارضان؛ لا يُفرض اتجاه.</small>}
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
      <summary>باقي أخبار الـ24 ساعة ({remainingAlerts.length}) {next&&highlighted!==next?'· أقرب خبر بعد '+timeLeft(Number(next.time),now):''}</summary>
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
