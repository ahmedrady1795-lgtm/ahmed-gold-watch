'use client';
import {useEffect,useState} from 'react';
type Reading={ready:boolean;phase:string;side:'BUY'|'SELL'|'WAIT';
 label:string;reason:string;source?:string;eventAt?:number;price?:number;
 evidence?:string[]};
type FrameScore={scored:number;directional:number;correct:number;
 paired:number;accuracy:number|null;pairedBaselineRate:number|null;
 pairedRadarRate:number|null;noData:number;pending:number;ready:boolean};
type BrokerDom={available:boolean;status:string;reason:string;
 symbol:string|null;samples:number;spanMs:number;
 bidDepthLots:number|null;askDepthLots:number|null;imbalancePct:number|null;
 bidWall:number|null;askWall:number|null;bidPersistent:boolean;
 askPersistent:boolean;possibleBidWithdrawal:boolean;
 possibleAskWithdrawal:boolean;source:string;actionable:false};
type Status={ok:boolean;status:string;radar:Reading;events:number;
 m1:FrameScore;m15:FrameScore;storage:string;recent?:unknown[];
 brokerDom?:BrokerDom};
export default function GoldRadarBadge(){
 const [state,setState]=useState<Status|null>(null),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  let alive=true;
  const get=async()=>{
   try{
    const response=await fetch('/api/gold-radar',{cache:'no-store',
     signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('unavailable');
    const data=await response.json();
    if(alive)setState(data.ok?data:null);
   }catch{if(alive)setState(null);}
  };
  void get();const t=setInterval(()=>void get(),65000);
  return ()=>{alive=false;clearInterval(t)};
 },[]);
 const radar=state?.radar;
 const status=radar?.ready?radar.label:'ذهب: رصد';
 const dom=state?.brokerDom;
 const tint=radar?.ready&&radar.phase==='CONFIRMED'?'confirmed':'neutral';
 const format=(a:FrameScore)=>{
  if(!a)return 'جاري التجميع';
  if(!a.ready)return a.scored+' مكتملة · '+a.pending+' معلقة · '+a.noData+' مفقودة';
  return Math.round((a.pairedRadarRate??0)*100)+'% للرادار مقابل '+
    Math.round((a.pairedBaselineRate??0)*100)+'% مرجع · n='+a.paired;
 };
 return <>
  <button className={'sniper-flow-radar-chip sniper-gold-radar-chip '+tint}
   type="button" onClick={()=>setExpanded(v=>!v)}
   aria-expanded={expanded}
   aria-label={'رادار الذهب: '+status+'. عمق MT5 '+(dom?.available?'متاح':'غير متاح')+
      '. اضغط للتفاصيل'}
   title={(radar?.reason||'انتظار شموع XAUUSD حقيقية مغلقة')+
      ' · عمق الوسيط: '+(dom?.available?'MT5 مباشر من الوسيط، غير مجمع':
        'غير متاح حتى توصيل جسر MT5 ومصدر عمق صحيح')}>
    {dom?.available?'MT5 عمق ✓ · ':''}{status}{state?.events?' · n'+state.events:''}
  </button>
  {expanded&&<aside className="sniper-flow-score-detail sniper-gold-radar-detail" dir="rtl">
    <strong>رادار الذهب XAUUSD · شموع M1 مغلقة</strong>
    <div>{radar?.reason||'البيانات غير متاحة حاليًا'}</div>
    <div>المصدر: {radar?.source||'بانتظار مصدر الذهب الفوري'}</div>
    <div>دفتر أوامر الوسيط: {dom?.available?'متصل ومتكرر':'غير متاح أو غير مؤهل'}</div>
    {dom?.available?<>
      <div>رمز الوسيط: {dom.symbol} · عينات مستقلة: {dom.samples}</div>
      <div>العمق المعلن (وحدات الوسيط، ليس تداولات منفذة):
        طلب {dom.bidDepthLots??'—'} · عرض {dom.askDepthLots??'—'}</div>
      <div>اختلال الحجم المعلن: {dom.imbalancePct??'—'}%</div>
      {(dom.possibleBidWithdrawal||dom.possibleAskWithdrawal)&&
        <div>تراجع عمق محتمل — لا يمكن تحديد إن كان إلغاءً أم تنفيذًا.</div>}
    </>:<div>حالة MT5 DOM: {dom?.reason||'لم تصل بيانات عمق حديثة من الوسيط'}</div>}
    <div>إشارات الرصد المسجلة: {state?.events??0}</div>
    <div>M1: {state?.m1?format(state.m1):'جاري القياس'}</div>
    <div>M15: {state?.m15?format(state.m15):'جاري القياس'}</div>
    <small>رادار الشموع السعري مستقل عن دفتر الوسيط. عمق MT5 ليس
      دفتر COMEX ولا يثبت هوية المؤسسات أو تنفيذ أوامرها.
      لا تداول آلي ولا نسب نجاح معتمدة حتى يُختبر الأداء.</small>
  </aside>}
 </>;
}
