'use client';
import {useEffect,useState} from 'react';

type Side='BUY'|'SELL'|'WAIT';
type Reading={ready:boolean;phase:string;side:Side;
 setupSide?:Side;setupAt?:number|null;confirmedAt?:number|null;
 label:string;reason:string;source?:string;eventAt?:number|null;price?:number|null;
 confirm?:number|null;invalidate?:number|null;evidence?:string[]};
type Score={scored:number;directional:number;correct:number;paired:number;
 pairedBaselineRate:number|null;pairedRadarRate:number|null;pending:number;noData:number;ready:boolean};
type BrokerDom={available:boolean;status:string;reason:string;symbol:string|null;
 samples:number;bidDepthLots:number|null;askDepthLots:number|null;
 imbalancePct:number|null;source:string;actionable:false};
type Status={ok:boolean;status:string;radar:Reading;events:number;
 updatedAt:number;m1:Score;m15:Score;brokerDom?:BrokerDom};
type Watch={ready:boolean;upper:{price:number}[];lower:{price:number}[]};
const fmt=(v:unknown)=>{
 const n=Number(v);
 return v!==null&&v!==undefined&&Number.isFinite(n)&&n>0?
   n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
};
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
       <small>{current?label:'انتظار'} {expanded?'▴':'▾'}</small>
     </span>
   </button>
   {expanded&&<section className="sniper-gold-radar-expanded"
     aria-label="تفاصيل قراءة رادار الذهب">
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
