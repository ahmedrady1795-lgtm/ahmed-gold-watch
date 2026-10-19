'use client';
import {useEffect,useState} from 'react';
import {OrderFlowRadar as Engine,type RadarView} from '../lib/order-flow-radar';
const labels={WARMUP:'تجهيز نافذة 30 ثانية',OFFLINE:'تدفق غير مكتمل',WATCH:'مراقبة',PREPARE:'استعداد مبكر',CONFIRMED:'تأكيد حركة',INVALIDATED:'أُلغي بكسر المستوى',EXPIRED:'انتهت صلاحية الرصد'};
export default function OrderFlowRadar({asset,onView,compact=false}:{asset:'GOLD'|'BTC';onView?:(v:RadarView|null)=>void;compact?:boolean}){
  const [view,setView]=useState<RadarView>(()=>new Engine().view);
  const [shadow,setShadow]=useState<{
   events:number;m1:{directional:number;accuracy:number|null;pairedN:number;
     pairedRadarRate:number|null;baselineRate:number|null;missing:number};
   m15:{directional:number;accuracy:number|null;pairedN:number;
     pairedRadarRate:number|null;baselineRate:number|null;missing:number}
  }|null>(null);
  useEffect(()=>{
    if(asset!=='BTC'){setShadow(null);return}
    let alive=true;
    const load=async()=>{
      try{
        const r=await fetch('/api/radar-shadow-score',{cache:'no-store',
          signal:AbortSignal.timeout(7000)});
        if(!r.ok)throw Error('unavailable');
        const v=await r.json();
        if(alive&&v?.source==='Coinbase BTC-USD WS'&&v.m1&&v.m15)
          setShadow({events:Number(v.events)||0,m1:v.m1,m15:v.m15});
        else if(alive)setShadow(null);
      }catch{if(alive)setShadow(null)}
    };
    void load();const timer=setInterval(()=>void load(),120000);
    return()=>{alive=false;clearInterval(timer)};
  },[asset]);

  const [scoreOpen,setScoreOpen]=useState(false);
  const [shadow,setShadow]=useState<null|{
    events:number;storage:string;modelQualified:false;
    m1:{samples:number;directional:number;correct:number;
      pairedN:number;accuracy:number|null;baselineRate:number|null};
    m15:{samples:number;directional:number;correct:number;
      pairedN:number;accuracy:number|null;baselineRate:number|null};
  }>(null);
  useEffect(()=>{
    if(asset!=='BTC'){setShadow(null);setScoreOpen(false);return;}
    let active=true;const controller=new AbortController();
    const poll=async()=>{
      try{
        const response=await fetch('/api/radar-shadow-score',{
          cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('shadow_score_unavailable');
        const data=await response.json();
        if(active&&data?.ok&&data?.m1&&data?.m15)setShadow(data);
      }catch{if(active)setShadow(null);}
    };
    void poll();const interval=setInterval(()=>{void poll();},90000);
    return ()=>{active=false;controller.abort();clearInterval(interval);};
  },[asset]);
  useEffect(()=>{
    if(asset!=='BTC'){onView?.(null);return;}
    let lastBroadcast='';
    const publish=(next:RadarView)=>{
      // The full candle SVG is expensive: re-render it for radar state/level
      // changes only, not every 1s volume-delta tick.
      const active=['PREPARE','CONFIRMED','INVALIDATED','EXPIRED'].includes(next.phase);
      const signature=[next.phase,next.side,next.confirm,next.invalidate,
        active?next.since:0].join('|');
      if(signature!==lastBroadcast){lastBroadcast=signature;onView?.({...next});}
    };
    let engine=new Engine(),ws:WebSocket|null=null,stopped=false,connectedAt=0,retry:ReturnType<typeof setTimeout>|undefined;
    function connect(){
      if(stopped)return;
      engine=new Engine();connectedAt=Date.now();setView(engine.view);publish(engine.view);
      ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');
      ws.onopen=()=>ws?.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['level2_batch','matches','heartbeat']}));
      ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='error'){engine.broken=true;ws?.close();return;}engine.ingest(m);}catch{engine.broken=true;}};
      ws.onerror=()=>ws?.close();
      ws.onclose=()=>{engine.broken=true;const offline=engine.evaluate();setView({...offline});publish(offline);if(!stopped)retry=setTimeout(connect,5000);};
    }
    connect();
    const timer=setInterval(()=>{const next=engine.evaluate();setView({...next});publish(next);if(engine.broken||(next.phase==='OFFLINE'&&Date.now()-connectedAt>10000&&Date.now()>=engine.quarantineUntil))ws?.close();},1000);
    return()=>{stopped=true;clearInterval(timer);clearTimeout(retry);if(ws){ws.onclose=null;ws.close();}};
  },[asset,onView]);
  const fmt=(n:number|null)=>n==null?'—':n.toLocaleString('en-US',{maximumFractionDigits:2});
  if(asset!=='BTC')return compact?null:
    <small>رادار الأوامر: الذهب يحتاج مصدر دفتر أوامر وصفقات فعلية.</small>;
  const micro=view.micro;
  const scoreHint=shadow?
    'تقييم ظلّي مستقل: M1 '+shadow.m1.directional+' حالة واضحة، M15 '+
    shadow.m15.directional+' حالة، مفقود M1 '+shadow.m1.missing+
    ' وM15 '+shadow.m15.missing+
    (shadow.m1.pairedN>=40&&shadow.m1.pairedRadarRate!=null&&
     shadow.m1.baselineRate!=null?
     ' | M1 الرادار '+Math.round(shadow.m1.pairedRadarRate*100)+
     '% مقابل المرجع '+Math.round(shadow.m1.baselineRate*100)+
     '%، عينة '+shadow.m1.pairedN:'')+
    '. لا يثبت دقة تنبؤية أو ربحًا بعد التكاليف.':
    'التقييم الزمني لم يجمع عينات موثوقة كافية بعد.';
  const hint=[scoreHint,
    'Coinbase BTC-USD فقط؛ دفتر معلن وليس هوية صناع السوق',
    'دلتا تنفيذ '+view.delta.toFixed(0)+'%',
    'اختلال العمق '+view.imbalance.toFixed(0)+'%',
    micro?.ready?'طلبات معلنة '+Math.round(micro.bidDepthUsd)+
      ' USD، عروض معلنة '+Math.round(micro.askDepthUsd)+' USD':
      'تجهيز العمق: '+String(micro?.reason||'انتظار'),
    micro?.bidPersistent?'جدار طلب مستمر مرصود':'',
    micro?.askPersistent?'جدار عرض مستمر مرصود':'',
    micro?.possibleBidPull?'تراجع عمق الطلب محتمل، السبب غير محسوم':'',
    micro?.possibleAskPull?'تراجع عمق العرض محتمل، السبب غير محسوم':'',
    shadow?'سجل الخادم: '+shadow.events+
       ' إشارة؛ نتائج M1 '+shadow.m1.samples+
       ' وM15 '+shadow.m15.samples:'تقييم النتائج قيد التجميع',
    'الرادار رصد فقط ولا يغير TP أو SL'
  ].filter(Boolean).join(' | ');
  if(compact)return <>
    <button type="button" className={'sniper-flow-radar-chip '+
      (micro?.status==='POSSIBLE_PULL'?'warn':
       view.phase==='CONFIRMED'?'confirmed':'neutral')}
      onClick={()=>setScoreOpen(v=>!v)} aria-expanded={scoreOpen}
      title={hint} aria-label={'رادار الأوامر: '+labels[view.phase]+'. اضغط لعرض نتائج M1 وM15. '+hint}>
      <b>{view.phase==='OFFLINE'||view.phase==='WARMUP'?'تدفق: تجهيز':
        view.phase==='PREPARE'?'تدفق: استعداد':
        view.phase==='CONFIRMED'?'تدفق: تأكيد':
        micro?.possibleBidPull?'سحب طلب؟':
        micro?.possibleAskPull?'سحب عرض؟':
        micro?.bidPersistent?'طلب مستمر':
        micro?.askPersistent?'عرض مستمر':'تدفق: رصد'}
        {shadow?.events?' · n'+shadow.events:''}</b>
    </button>
    {scoreOpen&&<aside className="sniper-flow-score-detail" dir="rtl">
      <strong>اختبار رادار Coinbase · متابعة فقط</strong>
      <div>إشارات محفوظة على الخادم: {shadow?.events??'بانتظار البيانات'}</div>
      <div>M1: {shadow?.m1.samples??0} نتيجة · M15: {shadow?.m15.samples??0} نتيجة</div>
      {shadow&&shadow.m1.directional>=70&&shadow.m1.pairedN>=50?
        <div>دقة M1 التاريخية {Math.round((shadow.m1.accuracy??0)*100)}%
          · المرجع {Math.round((shadow.m1.baselineRate??0)*100)}%
          · عينات متطابقة {shadow.m1.pairedN}</div>:
        <div>مقارنة M1: عينات مستقلة غير كافية</div>}
      {shadow&&shadow.m15.directional>=70&&shadow.m15.pairedN>=50?
        <div>دقة M15 التاريخية {Math.round((shadow.m15.accuracy??0)*100)}%
          · المرجع {Math.round((shadow.m15.baselineRate??0)*100)}%
          · عينات متطابقة {shadow.m15.pairedN}</div>:
        <div>مقارنة M15: عينات مستقلة غير كافية</div>}
      <small>رصد سيرفر Coinbase فقط، لا يُثبت ربحية أو قدرة مؤكدة على التنبؤ.
        حفظ الخادم: {shadow?.storage==='PERSISTENT_VOLUME'?'تخزين دائم':
          'مؤقت مع نسخ دورية'}</small>
    </aside>}
  </>;
  const fresh=!['OFFLINE','WARMUP'].includes(view.phase);
  return <div aria-label="رادار السيولة والامتصاص" style={{display:'flex',flexWrap:'wrap',gap:'6px 16px',alignItems:'center',padding:'8px 12px',border:'1px solid #334155',borderRadius:8,fontSize:12}}>
    <strong>رادار السيولة · {labels[view.phase]}</strong>
    <span>{view.side==='BUY'?'امتصاص بيع محتمل':view.side==='SELL'?'امتصاص شراء محتمل':'لا اتجاه مؤكد'}</span>
    {fresh&&<span>صافي التنفيذ {view.delta.toFixed(0)}% · توازن العمق {view.imbalance.toFixed(0)}%</span>}
    {micro?.ready&&<span>عمق طلبات معلنة {Math.round(micro.bidDepthUsd)} USD · عروض معلنة {Math.round(micro.askDepthUsd)} USD</span>}
    {view.confirm!=null&&<span>تأكيد <b dir="ltr">{fmt(view.confirm)}</b> · إلغاء <b dir="ltr">{fmt(view.invalidate)}</b></span>}
    <small title="تغير دفتر Level 2 قد يكون تنفيذًا أو إلغاءً، وليس إثبات التلاعب أو هوية مشارك. الرادار رصد فقط.">Coinbase BTC-USD · يتطلب رصد M1 لاحقًا · ليس نسبة نجاح</small>
  </div>;
}
