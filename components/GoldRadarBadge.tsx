'use client';
import {useEffect,useState} from 'react';
import {goldPreparation} from '../lib/institutional-preparation-radar';
import type {Mt5GoldDomReading} from '../lib/gold-mt5-dom';
import type {GcFuturesSnapshot} from '../lib/gc-futures-feed';
import type {goldLeadScore,GoldLeadEvent} from '../lib/gold-preparation-lead';

type Side='BUY'|'SELL'|'WAIT';
type Reading={ready:boolean;phase:string;side:Side;
 setupSide?:Side;setupAt?:number|null;confirmedAt?:number|null;
 label:string;reason:string;source?:string;eventAt?:number|null;price?:number|null;
 confirm?:number|null;invalidate?:number|null;evidence?:string[]};
type Score={scored:number;directional:number;correct:number;paired:number;
 pairedBaselineRate:number|null;pairedRadarRate:number|null;pending:number;noData:number;ready:boolean};
type BrokerDom=Mt5GoldDomReading;
type LeadScore=ReturnType<typeof goldLeadScore>&{status:string;observation:{
 checkedAt?:number;reason:string;source?:string;quoteSource?:string;
 quoteAt?:number;price?:number}};
type Status={ok:boolean;status:string;radar:Reading;events:number;
 updatedAt:number;m1:Score;m15:Score;brokerDom?:BrokerDom;preparationLead?:LeadScore};
type Watch={ready:boolean;upper:{price:number}[];lower:{price:number}[]};
const fmt=(v:unknown)=>{
 const n=Number(v);
 return v!==null&&v!==undefined&&Number.isFinite(n)&&n>0?
   n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
};
const clock=(at:number)=>new Date(at).toLocaleTimeString('en-GB',{
 timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const leadLabel=(e:GoldLeadEvent)=>({ARMED:'إنذار ثابت · انتظار التحقق من السبق',BREAKOUT:'كسر لاحق مرصود',
 TARGET:'لمس الهدف قبل الإبطال',STOP:'إبطال بعد الكسر',NO_BREAK:'انتهت المهلة بلا كسر',
 INVALIDATED:'إبطال قبل الكسر',TIMEOUT:'انتهت مهلة الهدف',TIMING_UNPROVEN:'الأسبقية غير محسومة',
 AMBIGUOUS:'ترتيب اللمسات غير معلوم',UNKNOWN:'بيانات غير كافية'})[e.status];
/**
 * On-screen GOLD radar: historical price action / optional BROKER DOM, not
 * privileged institutional orders, a probability, or automated trading.
 * Its side never modifies M15 forecast candles, targets or execution.
 */
export default function GoldRadarBadge({now,marketFresh,watch}:{
 now:number;marketFresh:boolean;watch:Watch
}){
 const [state,setState]=useState<Status|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [gc,setGc]=useState<GcFuturesSnapshot|null>(null);
 useEffect(()=>{
  let alive=true;
  const poll=async()=>{
   if(document.visibilityState!=='visible')return;
   try{
    const response=await fetch('/api/gc-futures',{cache:'no-store',
      signal:AbortSignal.timeout(8500)});
    if(!response.ok)throw Error('gc_unavailable');
    const next=await response.json();
    if(alive)setGc(next);
   }catch{if(alive)setGc(null);}
  };
  void poll();
  const id=setInterval(()=>{void poll();},60000);
  const visible=()=>{if(document.visibilityState==='visible')void poll();};
  document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;clearInterval(id);
    document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{
  let alive=true;
  const poll=async()=>{
   if(document.visibilityState!=='visible')return;
   try{
    const response=await fetch('/api/gold-radar',{cache:'no-store',
      signal:AbortSignal.timeout(8500)});
    if(!response.ok)throw Error('radar_offline');
    const data=await response.json();
    if(alive)setState(data?.ok?data:null);
   }catch{if(alive)setState(null);}
  };
  void poll();
  const id=setInterval(()=>{void poll();},15000);
  const visible=()=>{if(document.visibilityState==='visible')void poll();};
  document.addEventListener('visibilitychange',visible);
  return ()=>{alive=false;clearInterval(id);
   document.removeEventListener('visibilitychange',visible);};
 },[]);
 const radar=state?.radar;
 const eventAt=Number(radar?.eventAt||0);
 const eventFresh=eventAt>0&&eventAt<=now+1500&&now-eventAt<=115000;
 const current=Boolean(marketFresh&&state?.status==='OBSERVING'&&
   radar?.ready&&eventFresh);
 const signal=Boolean(current&&radar?.phase==='CONFIRMED'&&
   (radar?.side==='BUY'||radar?.side==='SELL')&&
   radar?.confirm!=null&&radar?.invalidate!=null&&
   Number.isFinite(Number(radar?.confirm))&&
   Number.isFinite(Number(radar?.invalidate)));
 const dom=state?.brokerDom;
 const label=!marketFresh?'السعر غير حي':
   !current?'انتظار شموع M1':
   signal?(radar?.side==='BUY'?'اتفعّل · صعود مشروط':'اتفعّل · هبوط مشروط'):
   radar?.phase==='INVALIDATED'?'السيناريو اتلغى':
   radar?.phase==='EXPIRED'?'انتهت مهلة التأكيد':
   radar?.phase==='COMPRESSION'?'انضغاط · انتظار الكسر':
   radar?.phase==='WATCH'?'منتظر تأكيد':'توازن · لا ترجيح';
 const direction=signal?(radar?.side==='BUY'?'BUY':'SELL'):'WAIT';
 const upper=watch?.ready?watch.upper.find(x=>x.price>0)?.price:null;
 const lower=watch?.ready?watch.lower.find(x=>x.price>0)?.price:null;
 const source=radar?.source||'مصدر M1 غير متاح';
 const domReady=Boolean(dom?.available&&Number(dom.samples)>=4);
 const prep=goldPreparation({fresh:marketFresh,dom,
   radarFresh:current,radarSide:radar?.side??'WAIT',
   radarPhase:radar?.phase});
 const preparationStatus=prep.available?prep.label:
   'تحضير مؤسسي: عمق MT5 غير جاهز';
 const lead=state?.preparationLead,early=lead?.current,obs=lead?.observation;
 const earlyDeadline=early?.breakoutBarAt!=null?early.breakoutBarAt+16*60000:early?.armUntil??0;
 const earlyCurrent=Boolean(marketFresh&&lead?.status==='OBSERVING'&&early&&
  obs?.checkedAt!=null&&obs.checkedAt<=now+2000&&now-obs.checkedAt<45000&&
  obs.source===early.source&&obs.quoteSource===early.quoteSource&&
  obs.quoteAt!=null&&obs.quoteAt<=now+2000&&now-obs.quoteAt<20000&&
  early.issuedAt<=now&&now<earlyDeadline);
 const touchedNow=Boolean(earlyCurrent&&early&&obs?.price!=null&&
  (early.side==='BUY'?obs.price>=early.trigger:obs.price<=early.trigger));
 const invalidNow=Boolean(earlyCurrent&&early&&obs?.price!=null&&
  (early.side==='BUY'?obs.price<=early.invalidate:obs.price>=early.invalidate));
 const earlyHeading=earlyCurrent&&early?
  (early.side==='BUY'?'تحضير صعود':'تحضير هبوط')+' · '+
  (invalidNow?'لمس الإبطال · جارٍ التحقق':early.status==='BREAKOUT'?'كسر لاحق مرصود':
   touchedNow?'لمس التفعيل · جارٍ التحقق':'قبل الكسر · تجريبي'):
  'إنذار قبل الكسر · '+(lead?.status==='OBSERVING'?'انتظار فرصة مؤهلة':'انتظار التغذية');
 const latestLead=earlyCurrent?early:lead?.recent?.[0];
 const gcAge=gc?.quoteAt!=null?Math.max(0,now-gc.quoteAt):null;
 const gcReady=Boolean(gc?.available&&gcAge!=null&&gcAge<=90*60000);
 const gcState=gcReady?(gc!.status==='LIVE'?'سعر عقد مباشر':'بيانات متأخرة'):'غير متاح';
 const gcHeading=gcReady?'GC '+fmt(gc?.price)+' · '+gcState:'GC · غير متاح';
 const freshness=current?Math.round((now-eventAt)/1000):null;
 const score=(s:Score|undefined)=>!s?'قيد القياس':
   s.ready&&s.paired>0?
     'تقييم مقارن '+s.paired+' حالة · الرادار '+Math.round((s.pairedRadarRate||0)*100)+
     '% مقابل المرجع '+Math.round((s.pairedBaselineRate||0)*100)+'%':
     'تجميع '+s.scored+' نتيجة، '+s.pending+' معلقة';
 return <aside className={'sniper-gold-radar-widget'+(signal?' active':'')}
   dir="rtl" aria-label="رادار السيولة للذهب M1">
   <button type="button" className="sniper-gold-radar-toggle"
     aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
     title="تفاصيل الرادار ومصدره وسجل معايرة الإشارات">
     <span className="sniper-gold-radar-top">
       <strong>◈ رادار الذهب</strong>
       <small>{earlyHeading} {expanded?'▴':'▾'}</small>
     </span>
     {earlyCurrent&&early&&<span className="sniper-gold-preparation-levels">
       تفعيل {fmt(early.trigger)} · هدف {fmt(early.target)} · إبطال {fmt(early.invalidate)}
     </span>}
   </button>
   {expanded&&<section className="sniper-gold-radar-expanded"
     aria-label="تفاصيل قراءة رادار الذهب">
     <strong>إنذار التحضير قبل الكسر · تجريبي</strong>
     <span>{earlyHeading}</span>
     {latestLead&&<>
       <span>آخر إنذار: {leadLabel(latestLead)} · {latestLead.side==='BUY'?'صعود':'هبوط'}
         {' '}· صدر {clock(latestLead.issuedAt)} بتوقيت دبي</span>
       <span>مستويات ثابتة: تفعيل {fmt(latestLead.trigger)} · هدف تاريخي {fmt(latestLead.target)}
         {' '}· إبطال {fmt(latestLead.invalidate)}</span>
       <span>{latestLead.reason} · {latestLead.note}</span>
       <span>مهلة التفعيل حتى {clock(latestLead.armUntil)} بتوقيت دبي</span>
       <span>المصدر: {latestLead.source}</span>
       {latestLead.leadMinSeconds!=null&&<span>الكسر بعد الإنذار بنطاق
         {' '}{latestLead.leadMinSeconds}–{latestLead.leadMaxSeconds} ثانية</span>}
     </>}
     {!earlyCurrent&&<span>{obs?.reason||'لا يوجد إنذار جديد مستوفٍ للشروط'}</span>}
     <span>السجل الجديد: {lead?.events??0} إنذار · {lead?.pending??0} معلق
       {' '}· {lead?.evaluated??0} محسوم · {lead?.excluded??0} غير محسوم</span>
     <span>كسر لاحق مثبت: {lead?.provenBreakouts??0}
       {' '}· هدف قبل الإبطال: {lead?.targetBeforeStop??0}/{lead?.evaluated??0}
       {lead?.targetRate!=null?' ('+Math.round(lead.targetRate*100)+'%)':''}</span>
     <small>النسبة تشمل الإنذارات التي انتهت بلا كسر والإبطالات. أي لمس في دقيقة إصدار
       الإنذار أو ترتيب ملتبس يُعرض كغير محسوم. هذه لمسات سعرية قبل تكاليف التنفيذ.</small>
     <small>التحضير من السعر الفوري؛ لا يكشف أوامر صناع السوق. لم تثبت دقته خارج العينة بعد.</small>
     <span>{preparationStatus} · {gcHeading}</span>
     <strong>عقود الذهب GC · {gcState}</strong>
     <span dir="ltr">{gcReady?gc!.symbol+'  '+fmt(gc!.price):'GC=F —'}</span>
     {gcReady&&<span>تحرك 5 دقائق (تاريخي):
       {' '}{gc?.change5mPct==null?'—':gc.change5mPct.toFixed(3)+'%'}</span>}
     <span>المصدر: {gc?.source||'غير متصل'}</span>
     <span>وقت تسعير العقد: {gc?.quoteAt?
       new Date(gc.quoteAt).toLocaleTimeString('en-GB',{
         timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}</span>
     <small>GC=F مؤشر للعقد القريب المتداول وليس عقد تسليم محدد.
       أسعار GC المتأخرة لا تصلح لقياس من يقود حركة XAUUSD لحظيًا.</small>
     <small>قيادة العقود للسبوت: غير مثبتة؛ تحتاج أسعارًا وتنفيذات متزامنة
       من COMEX والسبوت. لا يوجد دفتر GC أو Iceberg مؤكد.</small>
     <strong>رادار التحضير المؤسسي · {prep.label}</strong>
     <span>{prep.source}</span>
     {prep.observations.length?
       prep.observations.map((note,i)=><span key={'prep-'+i}>• {note}</span>):
       <span>لا يوجد دليل مبكر من دفتر أوامر موثوق حاليًا.</span>}
     <small>ICEBERG: غير قابل للتأكيد من دفتر MT5 وحده،
       لأن تنفيذات العقود الفعلية غير متاحة.</small>
     <small>خداع الأوامر: {prep.withdrawalWarning?
       'اختفاء عمق معلن غير مفسَّر؛ ليس إثبات تلاعب أو أوامر وهمية':
       'لا توجد بصمة سحب غير مفسر مرصودة'}.</small>
     <small>مقارنة القيادة بين GC وXAUUSD: معلّقة حتى وصول
       تغذية عقود وتوقيت سبوت متزامنين؛ القراءة المتأخرة مرجع فقط.</small>
     <strong>قراءة السيولة · ليست كشفًا لأوامر البنوك</strong>
     <b className={'sniper-gold-radar-state '+(signal?direction.toLowerCase():'')}>
       {label}</b>
     <span className="sniper-gold-radar-prices" dir="ltr">
       <span>↑ {fmt(upper)}</span><span>↓ {fmt(lower)}</span>
     </span>
     <span className="sniper-gold-radar-confirm" dir="rtl">
       {current&&radar?.confirm!=null&&radar?.invalidate!=null?
         'إغلاق '+(radar.setupSide==='BUY'?'فوق ':'تحت ')+fmt(radar.confirm)+' · إبطال '+fmt(radar.invalidate):
         'لا دخول · انتظار تأكيد'}
     </span>
     <span className="sniper-gold-radar-source">
       {domReady?'DOM وسيط MT5 · رصد سعري':'شموع سعر · DOM غير متاح'}
       {current?' · M1 منذ '+freshness+' ثانية':''}
     </span>
     <span>{current?radar?.reason:'لا توجد قراءة مؤهلة حديثة؛ الاتجاه انتظار'}</span>
     {current&&radar?.evidence?.map((item,i)=><span key={i}>• {item}</span>)}
     <span>المصدر: {source}</span>
     <span>إغلاق الشمعة: {current?new Date(eventAt).toLocaleTimeString('en-GB',
       {hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'}):'—'}</span>
     <span>مستويات مراقبة علوية {fmt(upper)} · سفلية {fmt(lower)}</span>
     <span>{domReady?'عمق وسيط MT5 مرصود، وليس السوق العالمي':
       'دفتر أوامر MT5 غير متاح أو غير مؤهل'}</span>
     {domReady&&<span>عمق طلب {dom?.bidDepthLots??'—'} · عرض {dom?.askDepthLots??'—'}
       {' '}· اختلال {dom?.imbalancePct??'—'}%</span>}
     <small>النتائج التالية تشمل سجل الرادار السابق؛ ليست قياسًا مستقلًا لمنطق التأكيد الجديد.</small>
     <span>نتائج M1: {score(state?.m1)}</span>
     <span>نتائج M15: {score(state?.m15)}</span>
     <small>الرصد من شموع مغلقة؛ المستويات أهداف مراقبة وليست أسعار تنفيذ
       أو توقعات مؤكدة. الأداء يحتاج اختبارًا خارج العينة.</small>
   </section>}
 </aside>;
}
