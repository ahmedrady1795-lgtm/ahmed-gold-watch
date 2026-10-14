'use client';
import {useEffect,useState} from 'react';
import {Clock3,Newspaper} from 'lucide-react';
import {economicNewsTimeline} from '../lib/news-alert-window';

function timeLeft(ts:number,now:number){
  const d=ts-now;
  if(d<=0&&d>-60000)return 'يصدر الآن';
  if(d<0)return `صدر منذ ${Math.max(1,Math.floor(Math.abs(d)/60000))}د`;
  const totalMin=Math.floor(d/60000),days=Math.floor(totalMin/1440),hours=Math.floor((totalMin%1440)/60),mins=totalMin%60;
  if(days>0)return `متبقي ${days}ي ${hours}س`;
  if(hours>0)return `متبقي ${hours}س ${mins}د`;
  return `متبقي ${Math.max(1,mins)}د`;
}
function dateLabel(ts:number){
  return new Date(ts).toLocaleString('ar-AE',{timeZone:'Asia/Dubai',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function conditionalImpact(e:any){
  const name=String(e?.name||'');
  if(/claims|unemployment rate|jobless|continuing claims/i.test(name)){
    return 'إذا جاءت القراءة الفعلية أعلى من المتوقع فقد تدعم الذهب عبر ضعف سوق العمل؛ وإذا جاءت أقل فقد تضغط عليه. البيتكوين يتأثر أيضًا بشهية المخاطرة.';
  }
  if(/CPI|PCE|PPI|inflation|average hourly|earnings|payroll|employment change|GDP|PMI|ISM|retail|consumer confidence|JOLTS|job openings/i.test(name)){
    return 'قراءة فعلية أعلى من المتوقع قد تعزز الدولار أو العوائد وتضغط على الذهب؛ القراءة الأقل قد تدعمه. أثر البيتكوين مشروط بالعوائد والسيولة.';
  }
  if(/FOMC|Powell|Fed Chair|minutes|interest rate|rate decision/i.test(name)){
    return 'نبرة أكثر تشددًا من المتوقع قد تضغط على الذهب، ونبرة أيسر قد تدعمه؛ لا يمكن حسم الاتجاه قبل الإعلان ورد الفعل.';
  }
  return 'التأثير الاتجاهي غير محسوم مسبقًا؛ تتم المقارنة بالقراءة الفعلية ثم حركة الدولار والعوائد والسعر.';
}

export default function NewsCommandCenter({events=[],now=Date.now(),featuredEvent=null}:any){
  // Fetch independently of the expensive AI snapshot so upcoming releases are
  // visible on the homepage even when the main forecast is still warming up.
  const [live,setLive]=useState<any>(null);
  const [feedError,setFeedError]=useState(false);
  useEffect(()=>{
    let closed=false,inFlight=false;
    const load=async()=>{
      if(closed||inFlight||document.visibilityState!=='visible')return;
      inFlight=true;
      try{
        const response=await fetch('/api/news?ts='+Date.now(),{
          cache:'no-store',signal:AbortSignal.timeout(20000)
        });
        const data=await response.json();
        if(!response.ok||!data?.ok||!data.newsReady||!Array.isArray(data.events)){
          throw new Error('Economic calendar unavailable');
        }
        if(!closed){setLive(data);setFeedError(data.sourceStatus==='stale');}
      }catch{if(!closed)setFeedError(true);}
      finally{inFlight=false;}
    };
    void load();
    const timer=setInterval(()=>{void load();},90000);
    const onVisibility=()=>{if(document.visibilityState==='visible')void load();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{closed=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
  },[]);
  // AI events are a fallback only, never pretend the stale data is new.
  const displayedEvents=live?.events??events;
  const displayedFeatured=live?null:featuredEvent;
  const {alerts,recent}=economicNewsTimeline(displayedEvents,displayedFeatured,now);
  return <section className="panel newscommand standalone-news" aria-label="الأخبار القادمة خلال 8 ساعات فقط">
    <header className="standalone-news-head">
      <div><span className="eyebrow">NEWS · 8H</span>
        <h2><Newspaper size={17}/> الأخبار الاقتصادية القادمة</h2></div>
      <small>بتوقيت الإمارات · تحديث تلقائي كل 90 ثانية · الأحداث تظهر قبل موعدها بـ8 ساعات</small>
    </header>
    {feedError&&<p className="news-eight-empty" role="status">تعذر تحديث مصدر الأخبار الآن؛ {live?'آخر تقويم محفوظ ظاهر أدناه.':'نعرض بيانات التحليل المتوفرة لحين استعادة التقويم.'}</p>}
    <div className="news-eight-hour" aria-live="polite">
      {alerts.length?alerts.map((e:any)=>{
        const high=Number(e.importance)>=3;
        const scenario=conditionalImpact(e);
        return <article className={'news-eight-hour-item '+(high?'news-high-impact':'')} key={e.id||e.name+e.time}>
          <div className="news-eight-hour-top">
            <span>{high?'تأثير مرتفع':Number(e.importance)===2?'تأثير متوسط':'تأثير منخفض'}</span>
            <strong><Clock3 size={15}/> {timeLeft(Number(e.time),now)}</strong>
          </div>
          <b>{e.name}</b>
          <small>الموعد: {dateLabel(Number(e.time))}</small>
          <p>توقع السوق (Forecast): <strong>{e.forecast||'غير متاح'}</strong> · السابق: {e.previous||'غير متاح'}</p>
          <p><strong>سيناريو تأثير الخبر:</strong> {scenario}</p>
          <p>هذه احتمالات مشروطة وليست توصية تداول أو توقعًا مؤكدًا؛ يلزم انتظار القراءة الفعلية وتأكيد السعر.</p>
          {/^https:\/\//.test(String(e.source||''))&&<a href={e.source} target="_blank" rel="noopener noreferrer">مصدر الموعد ↗</a>}
        </article>;
      }):<p className="news-eight-empty">{feedError&&!live?'لا توجد مواعيد مؤكدة متاحة حتى الآن بسبب مشكلة المصدر.':'لا يوجد خبر بموعد مؤكد خلال الثماني ساعات القادمة.'}</p>}
    </div>
    {recent.length>0&&<div className="news-post-release">
      <strong>صدر مؤخرًا</strong>
      {recent.map((e:any)=><span key={e.id||e.name+e.time}>{e.name}: الفعلي {e.actual||'—'} · المتوقع {e.forecast||'—'}</span>)}
    </div>}
  </section>;
}
