'use client';
import {Clock3,Newspaper} from 'lucide-react';

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

export default function NewsCommandCenter({analysis,events=[],now=Date.now()}:any){
  const upcoming=[...events]
    .filter((e:any)=>{const t=Number(e?.time),hasActual=Boolean(String(e?.actual||'').trim());return t<=now+30*86400000&&(t>=now||(hasActual&&t>=now-10*60000)||(!hasActual&&t>=now-15*60000));})
    .sort((a:any,b:any)=>Number(a.time)-Number(b.time));
  const active=analysis?.news?.event;
  return <section className="panel newscommand">
    <div className="panelhead"><div><span className="eyebrow">UPCOMING MACRO RADAR</span><h2>الأخبار القادمة · توقيت الإمارات</h2></div><Newspaper/></div>
    {active&&<div className="newsclock"><Clock3/><strong>{active.name}</strong><span>{timeLeft(Number(active.time),now)}</span></div>}
    {!upcoming.length&&<p>لا توجد أحداث قادمة وصلت من المصادر الحالية.</p>}
    {upcoming.map((e:any,index:number)=>{
      const b=macroBias(e),impact=Number(e?.importance)||1;
      return <article key={e.id||e.name+e.time} className="rule compact" style={{display:'block'}}>
        <strong>#{index+1} · {e.name} · {impact===3?'🔥 مرتفع':impact===2?'⚠️ متوسط':'منخفض'}</strong>
        <p><b>موعد الخبر (الإمارات): {dateLabel(Number(e.time))}</b> · <b>{timeLeft(Number(e.time),now)}</b></p>
        {(e.forecast||e.previous||e.actual)&&<p>Actual: {e.actual||'لم يصدر'} · Forecast: {e.forecast||'—'} · Previous: {e.previous||'—'}</p>}
        <div className="levels">
          <div><small>التأثير المرجح على الذهب · {dirLabel(b.gold)}</small><strong>↑ {b.goldUp} / ↓ {b.goldDown}</strong></div>
          <div><small>BTC · ميل ماكرو</small><strong>↑ {b.btcUp} / ↓ {b.btcDown}</strong></div>
        </div>
        <p>{b.why}</p>
        {/^https:\/\//.test(String(e.source||''))&&<a href={e.source} target="_blank" rel="noreferrer">المصدر الرسمي/التقويم</a>}
      </article>;
    })}
    <p className="muted">ميزان ↑/↓ هو ترجيح اتجاهي من بيانات الخبر وليس نسبة نجاح أو ضمانًا للصفقة؛ بعد صدور الخبر يعطي رد فعل السعر أولوية أعلى.</p>
  </section>;
}
