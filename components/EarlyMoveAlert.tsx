'use client';

import {useEffect,useRef,useState} from 'react';

/**
 * Lightweight, read-only preview of VERIFIED pre-move pressure.
 * No execution. Price-tick proxies may be watched but NEVER advertised as DOM.
 */
type Lead={
  asset?:string;stage?:string;side?:'BUY'|'SELL'|'WAIT';mode?:string;
  armed?:boolean;source?:string;sourceAt?:number;score?:number;
  evidence?:string[];reason?:string;ageMs?:number;
};
type LastAlert={side:'BUY'|'SELL';at:number;score:number;kind:'VERIFIED'|'PRICE_WATCH'};

export default function EarlyMoveAlert({now,marketOpen=true,asset='GOLD'}:{now:number;marketOpen?:boolean;asset?:'GOLD'|'BTC'}){
  const [lead,setLead]=useState<Lead|null>(null);
  const [connected,setConnected]=useState(false);
  const [last,setLast]=useState<LastAlert|null>(null);
  const [notifications,setNotifications]=useState(false);
  const notifyRef=useRef(false);
  const sent=useRef<{side:string;at:number;kind:string}>({side:'',at:0,kind:''});

  useEffect(()=>{
    setConnected(false);setLead(null);
    if(!marketOpen)return;
    let closed=false;
    const onReading=(next:Lead)=>{
      if(closed||next.asset!==asset)return;
      try{
        setLead(next);setConnected(true);
        const t=Date.now(),sourceAt=Number(next.sourceAt||0);
        const verified=next.armed===true&&next.stage==='ARMED'&&
          next.mode===(asset==='GOLD'?'DOM':'CROSS_EXCHANGE')&&(next.side==='BUY'||next.side==='SELL')&&
          sourceAt>0&&sourceAt<=t+1500&&t-sourceAt<=5000;
        // A separate, explicitly unverified price watch may be shown and
        // notified. It is never a DOM alert or an order-entry signal.
        const priceWatch=asset==='GOLD'&&next.mode==='MICRO_FLOW'&&
          next.source==='Gold live price-tick watch · no broker DOM'&&
          next.stage==='BUILDING'&&next.armed===false&&
          (next.side==='BUY'||next.side==='SELL')&&
          Number(next.score)>=45&&sourceAt>0&&
          sourceAt<=t+1500&&t-sourceAt<=5000;
        if(!verified&&!priceWatch)return;
        const side=next.side as 'BUY'|'SELL';
        const kind:LastAlert['kind']=verified?'VERIFIED':'PRICE_WATCH';
        // Differentiate true depth alerts from price-only research watches.
        if(sent.current.side===side&&sent.current.kind===kind&&
          t-sent.current.at<(priceWatch?90000:45000))return;
        sent.current={side,at:t,kind};
        setLast({side,at:t,score:Math.round(Number(next.score||0)),kind});
        if(notifyRef.current&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
          try{
            new Notification(priceWatch?
              (side==='BUY'?'القناص · ترقب سعري شراء':'القناص · ترقب سعري بيع'):
              (side==='BUY'?'القناص · تنبيه شراء مبكر':'القناص · تنبيه بيع مبكر'),{
              body:priceWatch?'رصد سعري من تيكات متتابعة، دون عمق أوامر Exness؛ ليس إشارة دخول.':
                asset==='GOLD'?'ضغط DOM وسيط قبل تسارع السعر؛ ليست صفقة مضمونة.':
                'ضغط سيولة متعدد المنصات قبل تسارع السعر؛ ليس أمر دخول.',
              tag:asset.toLowerCase()+(priceWatch?'-price-watch':'-verified-premove')
            });
          }catch{}
        }
      }catch{}
    };
    // BTC already has a validated exchange liquidity endpoint. Poll only while
    // the panel is visible, with no overlapping or hidden-tab requests.
    if(asset==='BTC'){
      let timer:ReturnType<typeof setTimeout>|undefined;
      let request:AbortController|undefined;
      const poll=async()=>{
        if(closed)return;
        if(!document.hidden){
          request=new AbortController();
          const timeout=setTimeout(()=>request?.abort(),8000);
          try{
            const response=await fetch('/api/market-lead?asset=BTC',{cache:'no-store',signal:request.signal});
            if(!response.ok)throw Error('BTC lead HTTP '+response.status);
            onReading(await response.json());
          }catch{if(!closed)setConnected(false);}
          finally{clearTimeout(timeout);request=undefined;}
        }else setConnected(false);
        if(!closed)timer=setTimeout(()=>{void poll();},4000);
      };
      void poll();
      return()=>{closed=true;clearTimeout(timer);request?.abort();};
    }
    // EventSource may be interrupted by a sleeping Render instance or mobile
    // network proxy. Fall back to the SAME read-only Gold endpoint while SSE
    // reconnects; never infer a BUY/SELL on the client or poll in a hidden tab.
    let fallbackTimer:ReturnType<typeof setTimeout>|undefined;
    let fallbackRequest:AbortController|undefined;
    let fallbackBusy=false;
    let source:EventSource;
    const fallbackPoll=async()=>{
      fallbackTimer=undefined;
      if(closed||source.readyState===EventSource.OPEN)return;
      if(!document.hidden&&!fallbackBusy){
        fallbackBusy=true;
        const controller=new AbortController();
        fallbackRequest=controller;
        const timeout=setTimeout(()=>controller.abort(),6500);
        try{
          const response=await fetch('/api/market-lead?asset=GOLD',{
            cache:'no-store',signal:controller.signal});
          if(!response.ok)throw Error('GOLD lead HTTP '+response.status);
          onReading(await response.json());
        }catch{
          if(!closed&&source.readyState!==EventSource.OPEN)setConnected(false);
        }finally{
          clearTimeout(timeout);fallbackBusy=false;
          if(fallbackRequest===controller)fallbackRequest=undefined;
        }
      }
      if(!closed&&source.readyState!==EventSource.OPEN)
        fallbackTimer=setTimeout(()=>{void fallbackPoll();},6000);
    };
    const onLead=(event:MessageEvent)=>{try{onReading(JSON.parse(String(event.data)));}catch{}};
    try{
      source=new EventSource('/api/market-lead/stream');
    }catch{
      // No native SSE: REST poll still reports genuine server observations.
      source={readyState:2,close:()=>{}} as EventSource;
      fallbackTimer=setTimeout(()=>{void fallbackPoll();},0);
      return()=>{closed=true;clearTimeout(fallbackTimer);fallbackRequest?.abort();};
    }
    source.addEventListener('lead',onLead as EventListener);
    source.onopen=()=>{
      clearTimeout(fallbackTimer);fallbackTimer=undefined;
      fallbackRequest?.abort();
    };
    source.onerror=()=>{
      if(closed)return;
      setConnected(false);
      if(!fallbackTimer&&!fallbackBusy)
        fallbackTimer=setTimeout(()=>{void fallbackPoll();},350);
    };
    return()=>{
      closed=true;clearTimeout(fallbackTimer);fallbackRequest?.abort();
      source.removeEventListener('lead',onLead as EventListener);
      source.close();
    };
  },[marketOpen,asset]);

  const activate=async()=>{
    if(typeof Notification==='undefined')return;
    try{
      const permission=await Notification.requestPermission();
      const granted=permission==='granted';
      notifyRef.current=granted;setNotifications(granted);
    }catch{notifyRef.current=false;setNotifications(false);}
  };
  const sourceAt=Number(lead?.sourceAt||0);
  const fresh=Boolean(lead?.asset===asset&&marketOpen&&connected&&sourceAt>0&&sourceAt<=now+1500&&now-sourceAt<=5000);
  const armed=Boolean(fresh&&lead?.armed===true&&lead?.stage==='ARMED'&&lead?.mode===(asset==='GOLD'?'DOM':'CROSS_EXCHANGE')&&
    (lead?.side==='BUY'||lead?.side==='SELL'));
  const building=Boolean(fresh&&lead?.stage==='BUILDING');
  const priceWatch=Boolean(asset==='GOLD'&&building&&lead?.mode==='MICRO_FLOW'&&
    lead?.source==='Gold live price-tick watch · no broker DOM'&&
    (lead?.side==='BUY'||lead?.side==='SELL'));
  const direction=lead?.side==='BUY'?'شراء':lead?.side==='SELL'?'بيع':'';
  const title=!marketOpen?'سوق الذهب مغلق · الإنذار متوقف':armed?'إنذار مبكر: '+direction:
    priceWatch?'رصد سعري محتمل: '+direction:
    building?'ضغط يتكوّن · '+(direction||'مراقبة'):
    fresh&&lead?.stage==='RELEASED'?'الحركة بدأت · لا يُحتسب تنبيهًا مبكرًا':
    fresh&&lead?.stage==='REJECTED'?'الضغط انعكس · إلغاء التوقع':
    'رادار الحركة المبكرة · مراقبة';
  const headline=!marketOpen?'آخر إشارة محفوظة للمراجعة، لا يوجد تنبيه تداول حي أثناء الإغلاق':armed?'ضغط دفتر أوامر الوسيط قبل تسارع السعر':
    priceWatch?'سعر هادئ نسبيًا مع بداية تسارع؛ دون إثبات DOM أو دخول':
    building&&lead?.mode==='DOM'?'عمق الوسيط تحت الفحص؛ لم يثبت التنبيه بعد':
    building?'حركة سعر فقط؛ بدون تأكيد من دفتر أوامر حقيقي':
    !fresh?'لا توجد قراءة ميكروهيكل حديثة وموثوقة':
    'لا يوجد اتجاه مبكر مؤهل حاليًا';
  // Keep BTC compact and explicit: the cross-exchange read is not the
  // chart venue's execution feed and is not a qualified trade.
  if(asset==='BTC')return <section dir="rtl" role={armed?'alert':'status'}
    aria-label="رادار البيتكوين المبكر" title={lead?.reason||'بانتظار قراءة حديثة'}
    style={{padding:'4px 9px',fontSize:12,color:armed||building?(lead?.side==='BUY'?'#6cdeb1':'#f39ba6'):'#aebbc8'}}>
    <strong>{armed?'تنبيه مبكر '+direction:building?'ضغط مبكر '+direction:title}</strong>
    {' · '+(fresh?'سيولة متعددة المنصات · ليس دخولًا':'المصدر غير حديث')}
    {last&&now-last.at<180000&&<small>{' · آخر تنبيه '+(last.side==='BUY'?'شراء':'بيع')+' '+new Date(last.at).toLocaleTimeString('ar-EG')}</small>}
    {typeof Notification!=='undefined'&&!notifications&&<button type="button" onClick={()=>{void activate();}} style={{marginInlineStart:6,fontSize:11}}>تفعيل التنبيه</button>}
  </section>;
  const tint=armed||priceWatch?(lead?.side==='BUY'?'#6cdeb1':'#f39ba6'):'#b7c9d8';
  return <section dir="rtl" aria-label="تنبيه القناص قبل الحركة" role={armed?'alert':'status'}
    style={{margin:'6px 0 10px',padding:'8px 11px',border:'1px solid rgba(132,165,191,.25)',
      borderInlineStart:armed?'3px solid '+tint:undefined,borderRadius:8,
      background:'rgba(8,20,31,.54)',fontSize:12,color:'#b7c9d8'}}>
    <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'5px 13px'}}>
      <strong style={{fontSize:14,color:tint}}>{title}</strong>
      <span>{headline}</span>
      {armed&&<b style={{color:tint}}>قوة الأدلة {Math.round(Number(lead?.score||0))}/100</b>}
      {priceWatch&&<b style={{color:tint}}>قوة الرصد {Math.round(Number(lead?.score||0))}/100 · ليست نسبة نجاح</b>}
      <span style={{fontSize:11,opacity:.85}}>{fresh?(lead?.mode==='DOM'?'MT5 DOM الوسيط':'تتبّع السعر فقط'):'OFFLINE'}</span>
      {marketOpen&&typeof Notification!=='undefined'&&
        <button type="button" onClick={()=>{void activate();}} disabled={notifications}
          style={{marginInlineStart:'auto',fontSize:11,color:'#d8e8f1',background:'transparent',
            border:'1px solid rgba(160,190,213,.3)',borderRadius:5,padding:'4px 7px',cursor:notifications?'default':'pointer'}}>
          {notifications?'إشعارات المتصفح مفعّلة':'تفعيل إشعارات المتصفح'}
        </button>}
    </div>
    {armed&&Array.isArray(lead?.evidence)&&lead!.evidence!.length>0&&
      <div style={{marginTop:4,fontSize:11}}>السبب: {lead!.evidence!.slice(0,2).join(' · ')}</div>}
    {last&&now-last.at<180000&&<div style={{marginTop:4,fontSize:11,opacity:.8}}>
      {last.kind==='PRICE_WATCH'?'آخر رصد سعري':'آخر إنذار موثق'}: {last.side==='BUY'?'شراء':'بيع'} · {new Date(last.at).toLocaleTimeString('ar-EG')} ·
      درجة قراءة {last.score}/100 · سُجّل وقت ظهوره، وليس بعد الحركة
    </div>}
    <div style={{fontSize:10,opacity:.75,marginTop:3}}>
      إنذار DOM يحتاج عمق وسيط موثقًا؛ الرصد السعري منفصل وأقل موثوقية، وليس ضغط أوامر أو ضمان ربح أو أمرًا تلقائيًا.
    </div>
  </section>;
}
