'use client';
import {useEffect,useState} from 'react';
type Reading={ready:boolean;phase:string;side:'BUY'|'SELL'|'WAIT';
 label:string;reason:string;source?:string;eventAt?:number;price?:number;
 evidence?:string[]};
type FrameScore={scored:number;directional:number;correct:number;
 paired:number;accuracy:number|null;pairedBaselineRate:number|null;
 pairedRadarRate:number|null;noData:number;pending:number;ready:boolean};
type Status={ok:boolean;status:string;radar:Reading;events:number;
 m1:FrameScore;m15:FrameScore;storage:string;recent?:unknown[]};
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
   aria-label={'رادار الذهب السعري: '+status+'. اضغط لتفاصيل M1 وM15'}
   title={(radar?.reason||'انتظار شموع XAUUSD حقيقية مغلقة')+
      ' · لا يوجد دفتر أوامر بنوك أو حجم منفذ مؤكد'}>
    {status}{state?.events?' · n'+state.events:''}
  </button>
  {expanded&&<aside className="sniper-flow-score-detail sniper-gold-radar-detail" dir="rtl">
    <strong>رادار الذهب XAUUSD · شموع M1 مغلقة</strong>
    <div>{radar?.reason||'البيانات غير متاحة حاليًا'}</div>
    <div>المصدر: {radar?.source||'بانتظار مصدر الذهب الفوري'}</div>
    <div>إشارات الرصد المسجلة: {state?.events??0}</div>
    <div>M1: {state?.m1?format(state.m1):'جاري القياس'}</div>
    <div>M15: {state?.m15?format(state.m15):'جاري القياس'}</div>
    <small>سيولة سعرية ورفض شموع وليست أوامر فعلية أو كشف هوية صانع سوق.
      لا أوامر تداول تلقائية، ولا نسبة نجاح مؤكدة قبل نتائج مستقلة كافية.</small>
  </aside>}
 </>;
}
