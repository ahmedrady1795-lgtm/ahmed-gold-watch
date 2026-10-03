'use client';
import {Clock3,Gauge,Newspaper,ShieldCheck} from 'lucide-react';
import {surprise} from '../lib/engine';
const n=(v:any,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
function scenario(name:string){
 if(/claims|unemployment rate/i.test(name))return 'أعلى من المتوقع: قد يضغط على الدولار والعوائد ويدعم الذهب؛ الأقل قد يعكس ذلك.';
 if(/CPI|PCE|PPI|inflation|earnings/i.test(name))return 'تضخم أعلى من المتوقع: قد يرفع العوائد والدولار ويضغط على الذهب؛ قراءة أهدأ قد تدعم الذهب.';
 if(/payroll|employment change|GDP|PMI|retail/i.test(name))return 'قراءة أقوى من المتوقع: قد تدعم الدولار والعوائد وتضغط على الذهب؛ الأضعف قد يعكس ذلك.';
 return 'لا اتجاه مسبق موثوق؛ ننتظر تفاصيل الإصدار ورد فعل الدولار والعوائد والسعر.';
}

function macroNumber(v:any){
 const s=String(v??'').trim().replace(/,/g,'');
 const m=s.match(/^(-?\d+(?:\.\d+)?)\s*([KMB%]?)$/i);
 if(!m)return null;
 const base=Number(m[1]);if(!Number.isFinite(base))return null;
 const u=m[2].toUpperCase();
 return base*(u==='K'?1e3:u==='M'?1e6:u==='B'?1e9:1);
}
function goldForecastBias(e:any){
 const name=String(e?.name||''),f=macroNumber(e?.forecast),p=macroNumber(e?.previous);
 const diff=f!=null&&p!=null?f-p:null;
 const higherBullish=/claims|unemployment rate|jobless|continuing claims/i.test(name);
 const higherBearish=/CPI|PCE|PPI|inflation|average hourly|earnings|payroll|employment change|GDP|PMI|ISM|retail|consumer confidence|JOLTS|job openings|fed funds|interest rate|rate decision/i.test(name);
 let dir:'up'|'down'|'mixed'='mixed',why='Forecast غير كافٍ لتحديد ميل مسبق موثوق.';
 if(diff!=null&&Math.abs(diff)>1e-12){
   if(higherBullish){dir=diff>0?'up':'down';why=diff>0?'Forecast أضعف لسوق العمل من السابق؛ ده يميل لدعم الذهب.':'Forecast أقوى لسوق العمل من السابق؛ ده يميل للضغط على الذهب.';}
   else if(higherBearish){dir=diff>0?'down':'up';why=diff>0?'Forecast أقوى/أعلى من السابق؛ ده يميل لدعم الدولار أو العوائد والضغط على الذهب.':'Forecast أهدأ/أضعف من السابق؛ ده يميل لتخفيف ضغط الدولار أو العوائد ودعم الذهب.';}
 }else if(/FOMC|Powell|Fed Chair|minutes/i.test(name)){why='حدث فدرالي عالي الحساسية؛ الاتجاه يعتمد على النبرة ورد فعل الدولار والعوائد.';}
 const label=dir==='up'?'⬆️ ميل صعود للذهب':dir==='down'?'⬇️ ميل هبوط للذهب':'↔️ غير محسوم';
 const directional=dir==='mixed'?0:1;
 const priority=(Number(e?.importance)||1)*100+directional*10;
 return {dir,label,why,priority};
}

function since(ms:number){const s=Math.round(ms/1000),a=Math.abs(s),m=Math.floor(a/60),r=a%60;return `${s>=0?'بعد':'منذ'} ${m?m+'د ':''}${r}ث`;}
export default function NewsCommandCenter({analysis,events=[],background=[],quote,now=Date.now()}:any){
 const high=events.filter((e:any)=>e.importance===3&&e.time>now-12*3600000).sort((a:any,b:any)=>Math.abs(a.time-now)-Math.abs(b.time-now))[0];
 const e=analysis?.news?.event||high,active=analysis?.news?.active;
 const b=(k:string)=>background.find((x:any)=>x.key===k);
 const upcoming=events.filter((x:any)=>x.time>=now&&x.time<=now+7*86400000).sort((a:any,b:any)=>{const A=goldForecastBias(a),B=goldForecastBias(b);return B.priority-A.priority||a.time-b.time;});
 return <section className="panel newscommand"><div className="panelhead"><div><span className="eyebrow">NEWS COMMAND CENTER</span><h2>{e?.name||(events.length?'لا يوجد خبر قوي داخل النافذة':'التقويم غير متاح — لا توجد تغطية أخبار مؤكدة')}</h2></div><Newspaper/></div>
  {e&&<><div className="newsclock"><Clock3/><strong>{since(e.time-now)}</strong><span>{active?analysis.news.phase==='released'?'POST-RELEASE':'ARMED':'CALENDAR'}</span></div><div className="levels"><div><small>Actual</small><strong>{e.actual||'لم يصدر'}</strong></div><div><small>Forecast</small><strong>{e.forecast||'—'}</strong></div><div><small>Previous</small><strong>{e.previous||'—'}</strong></div></div><p>{surprise(e)}</p></>}
  <div className="newschecks"><span><Gauge/>Spread <b>{n(quote?.spread,2)}</b></span><span><ShieldCheck/>M1 confirmation <b>{analysis?.signal?.mode==='news'?'YES':'WAIT'}</b></span><span>DXY <b>{n(b('dxy')?.value,2)}</b></span><span>US2Y <b>{n(b('us2y')?.value,3)}</b></span><span>US10Y <b>{n(b('us10y')?.value,3)}</b></span></div>
  <p className="muted">غياب الأحداث لا يعني خلو السوق من أخبار مهمة. <a href="https://www.bls.gov/schedule/" target="_blank" rel="noreferrer">جدول BLS الرسمي</a> · <a href="https://www.bea.gov/news/schedule" target="_blank" rel="noreferrer">جدول BEA الرسمي</a></p><p className="muted">DXY والعوائد عوامل تأكيد فقط. اتجاه صفقة الخبر لا يُستنتج من Actual وحده؛ يلزم رد فعل السعر وإغلاق M1 وسبريد قابل للتنفيذ.</p>
  <h3>سجل الأخبار القادمة · مرتبة حسب التأثير على الذهب · توقيت الإمارات</h3>
  {!upcoming.length&&<p>المصدر لم يوفر مواعيد قادمة في هذه النافذة. هذا لا يعني عدم وجود أخبار؛ يلزم تحديث التقويم.</p>}
  {upcoming.map((x:any,index:number)=><article key={x.id} className="rule compact" style={{display:'block'}}>
   <strong>#{index+1} · {x.name} · {x.importance===3?'🔥 تأثير مرتفع':x.importance===2?'⚠️ تأثير متوسط':'تأثير منخفض'}</strong>
   <p><b>{goldForecastBias(x).label}</b></p>
   <p><b>قادمة</b> · {new Date(x.time).toLocaleString('ar-AE',{timeZone:'Asia/Dubai'})} · Forecast: {x.forecast||'غير متاح'} · Previous: {x.previous||'غير متاح'}</p>
   <p>{goldForecastBias(x).why}</p>
   <p>{scenario(x.name)}</p>
   {/^https:\/\//.test(x.source)&&<a href={x.source} target="_blank" rel="noreferrer">مصدر الموعد</a>}
  </article>)}
  <p className="muted">السيناريوهات قواعد تفسير محلية مجانية وليست توقعًا مضمونًا. مصدر التقويم المجاني قد لا يوفر النتيجة الفعلية؛ يبقى تداول الخبر متوقفًا حتى وصولها وتأكيد السعر.</p>
 </section>;
}
