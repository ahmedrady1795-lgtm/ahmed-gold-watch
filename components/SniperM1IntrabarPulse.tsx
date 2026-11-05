'use client';

import {useEffect,useState} from 'react';
import type {EveryM1Direction} from '../lib/sniper-m1-every-direction';
import {
  freshM1QuoteForWatch,updateSampledLiveCandle,visibleSampledLiveCandle,
  type SampledLiveCandle
} from '../lib/sampled-live-candle';
import {inspectM1Intrabar,type IntrabarPulseStatus} from '../lib/sniper-m1-intrabar-pulse';

type Quote={ok?:boolean;price?:number;source?:string;sourceTime?:number}|null|undefined;
type Props={
  forecast:EveryM1Direction|null;anchorClose:number|null;
  historicalSource:string;quote:Quote;now:number;
  marketOpen:boolean;sourceReady:boolean;providerTransition:boolean
};
const labels:Record<IntrabarPulseStatus,string>={
  UNAVAILABLE:'لا توجد قراءة لحظية موثوقة',
  FIRST_TICK:'بداية الرصد · تيك واحد',
  NOISE:'حركة صغيرة · غير محسومة',
  ALIGNED:'الحركة الحالية مع التوقع',
  COUNTER:'الحركة الحالية عكس التوقع',
  FADING:'اندفاع ثم تراجع مرصود'
};
const sideText=(s:'BUY'|'SELL'|'FLAT'|null)=>
  s==='BUY'?'صعود ↑':s==='SELL'?'هبوط ↓':s==='FLAT'?'محايد':'غير متاح';
const num=(n:number)=>n.toLocaleString('en-US',{
  minimumFractionDigits:2,maximumFractionDigits:2
});
export default function SniperM1IntrabarPulse(p:Props){
  const [sample,setSample]=useState<SampledLiveCandle|null>(null);
  const issuedAt=p.forecast?.issuedAt??0;
  const price=Number(p.quote?.price),at=Number(p.quote?.sourceTime);
  const source=String(p.quote?.source||'');
  const usable=Boolean(p.forecast&&p.marketOpen&&p.sourceReady&&
    !p.providerTransition&&
    freshM1QuoteForWatch(p.quote,p.historicalSource,p.now,issuedAt));
  useEffect(()=>{
    if(!usable){setSample(null);return;}
    setSample(prev=>updateSampledLiveCandle(prev,{
      now:p.now,at,price,sourceKey:source,
      historicalSource:p.historicalSource,lastClosedAt:issuedAt
    }));
  },[usable,p.now,at,price,source,p.historicalSource,issuedAt]);
  const visible=usable?visibleSampledLiveCandle(
    sample,p.now,issuedAt,source,p.historicalSource):null;
  const reading=inspectM1Intrabar({
    forecast:p.forecast,sampled:visible,anchorClose:p.anchorClose,now:p.now
  });
  const signed=reading.sampledMove;
  const color=reading.status==='COUNTER'||reading.status==='FADING'?'is-warning':
    reading.status==='ALIGNED'?'is-aligned':'is-watching';
  return <section className={'sniper-m1-pulse '+color}
    aria-label="قراءة حركة التيكات داخل شمعة الدقيقة بشكل منفصل عن توقع ما قبل افتتاحها">
    <div className="sniper-m1-pulse-column">
      <small>توقع ثابت · صدر من الشمعة المغلقة السابقة</small>
      <strong>{p.forecast?sideText(p.forecast.side):'بانتظار توقع الدقيقة التالية'}</strong>
      <span>{p.forecast?
        'بداية '+new Date(p.forecast.issuedAt).toLocaleTimeString('en-GB',{
          hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'
        })+' · ضغط '+p.forecast.pressure+'/100 (ليس احتمال نجاح)':
        'لا نعتمد أي توقع بعد انتهاء صلاحيته'}</span>
    </div>
    <div className="sniper-m1-pulse-column">
      <small>رادار الشمعة الحية · تيكات فعلية مرصودة</small>
      <strong>{labels[reading.status]}</strong>
      <span>{reading.observedSide!=null?'ميل السعر: '+sideText(reading.observedSide)+' · ':''}
        {reading.ticks>0?reading.ticks+' تيك · ':''}
        {signed!=null?'تغير مرصود '+(signed>=0?'+':'')+num(signed):'بانتظار سعر حديث من نفس المصدر'}
      </span>
    </div>
    <small className="sniper-m1-pulse-note">
      {reading.reason}. القراءة الحية تقديرية من تيكات المتصفح فقط؛
      لا تغيّر توقع ما قبل الافتتاح، ولا تُحسب إصابة قبل إغلاق M1،
      ولا تعني تنفيذ Limit أو ربحًا بعد السبريد.
    </small>
  </section>;
}
