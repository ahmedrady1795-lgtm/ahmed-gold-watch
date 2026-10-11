'use client';
import {Clock3,Newspaper} from 'lucide-react';
import {economicNewsTimeline} from '../lib/news-alert-window';

const macroNumber=(v:any)=>{
  const s=String(v??'').trim().replace(/,/g,'');
  const m=s.match(/^(-?\d+(?:\.\d+)?)\s*([KMB%]?)$/i);
  if(!m)return null;
  const base=Number(m[1]);if(!Number.isFinite(base))return null;
  const u=m[2].toUpperCase();
  return base*(u==='K'?1e3:u==='M'?1e6:u==='B'?1e9:1);
};

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

type Dir='up'|'down'|'mixed';
function macroBias(e:any){
  const name=String(e?.name||'');
  const actual=macroNumber(e?.actual),forecast=macroNumber(e?.forecast),previous=macroNumber(e?.previous);
  const higherGoldBullish=/claims|unemployment rate|jobless|continuing claims/i.test(name);
  const higherGoldBearish=/CPI|PCE|PPI|inflation|average hourly|earnings|payroll|employment change|GDP|PMI|ISM|retail|consumer confidence|JOLTS|job openings|fed funds|interest rate|rate decision/i.test(name);
  const baseA=actual!=null&&forecast!=null?actual:forecast,baseB=actual!=null&&forecast!=null?forecast:previous;
  const diff=baseA!=null&&baseB!=null?baseA-baseB:null;
  let gold:Dir='mixed',why='لا توجد أرقام كافية قبل الإصدار لتكوين ميل رقمي.';
  if(diff!=null&&Math.abs(diff)>1e-12){
    if(higherGoldBullish){
      gold=diff>0?'up':'down';
      why=diff>0?'قراءة أضعف لسوق العمل تميل للضغط على الدولار والعوائد ودعم الذهب.':'قراءة أقوى لسوق العمل تميل لدعم الدولار والضغط على الذهب.';
    }else if(higherGoldBearish){
      gold=diff>0?'down':'up';
      why=diff>0?'قراءة أقوى/أعلى تميل لدعم الدولار أو العوائد والضغط على الذهب.':'قراءة أهدأ/أضعف تميل لتخفيف ضغط الدولار والعوائد ودعم الذهب.';
    }
  }
  if(/FOMC|Powell|Fed Chair|minutes/i.test(name)&&gold==='mixed')why='حدث فدرالي: النبرة المتشددة تميل للهبوط على الذهب، والتيسيرية تميل للصعود.';
  const importance=Math.max(1,Math.min(3,Number(e?.importance)||1));
  const actualKnown=actual!=null&&forecast!=null;
  const strength=gold==='mixed'?50:Math.min(76,(actualKnown?62:56)+importance*4);
  const goldUp=gold==='up'?strength:gold==='down'?100-strength:50,goldDown=100-goldUp;
  const btcStrength=gold==='mixed'?50:Math.max(54,strength-7);
  const btcUp=gold==='up'?btcStrength:gold==='down'?100-btcStrength:50,btcDown=100-btcUp;
  return {gold,why,goldUp,goldDown,btcUp,btcDown,actualKnown};
}
const dirLabel=(d:Dir)=>d==='up'?'صعود':d==='down'?'هبوط':'محايد';

export default function NewsCommandCenter({events=[],now=Date.now(),featuredEvent=null}:any){
  // Event times must come from a real feed. Do not generate placeholder dates
  // or present an approximate/narrative event as an exact scheduled release.
  const {upcoming,alerts,recent}=economicNewsTimeline(events,featuredEvent,now);
  return <section className="panel newscommand standalone-news" aria-label="الأخبار القادمة خلال 8 ساعات فقط">
    <header className="standalone-news-head">
      <div><span className="eyebrow">NEWS · 8H</span>
        <h2><Newspaper size={17}/> الأخبار الاقتصادية القادمة</h2></div>
      <small>الموعد بتوقيت الإمارات · لا يظهر الحدث قبل دخوله نافذة 8 ساعات</small>
    </header>
    <div className="news-eight-hour" aria-live="polite">
      {alerts.length?alerts.map((e:any)=>{
        const high=Number(e.importance)>=3;
        return <article className={'news-eight-hour-item '+(high?'news-high-impact':'')} key={e.id||e.name+e.time}>
          <div className="news-eight-hour-top">
            <span>{high?'تأثير مرتفع':Number(e.importance)===2?'تأثير متوسط':'تأثير منخفض'}</span>
            <strong><Clock3 size={15}/> {timeLeft(Number(e.time),now)}</strong>
          </div>
          <b>{e.name}</b>
          <small>الموعد: {dateLabel(Number(e.time))}</small>
          {(e.forecast||e.previous)&&<p>المتوقع: {e.forecast||'—'} · السابق: {e.previous||'—'}</p>}
          <p>الأثر السعري غير مضمون. يحدد رد الفعل بعد الإعلان وليس التوقع المسبق وحده.</p>
          {/^https:\/\//.test(String(e.source||''))&&<a href={e.source} target="_blank" rel="noopener noreferrer">مصدر الموعد ↗</a>}
        </article>;
      }):<p className="news-eight-empty">لا يوجد خبر بموعد معلوم خلال الثماني ساعات القادمة. الأحداث البعيدة غير ظاهرة هنا.</p>}
    </div>
  </section>;
}
