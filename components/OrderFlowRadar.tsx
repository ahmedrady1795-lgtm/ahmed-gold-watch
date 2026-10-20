'use client';
import {useEffect,useState} from 'react';
import {OrderFlowRadar as Engine,type RadarView} from '../lib/order-flow-radar';
const labels={WARMUP:'تجهيز نافذة 30 ثانية',OFFLINE:'تدفق غير مكتمل',WATCH:'مراقبة',PREPARE:'استعداد مبكر',CONFIRMED:'تأكيد حركة',INVALIDATED:'أُلغي بكسر المستوى',EXPIRED:'انتهت صلاحية الرصد'};
export default function OrderFlowRadar({asset,onView,compact=false}:{asset:'GOLD'|'BTC';onView?:(v:RadarView|null)=>void;compact?:boolean}){
  const [view,setView]=useState<RadarView>(()=>new Engine().view);
  const [scoreOpen,setScoreOpen]=useState(false);
  const [shadow,setShadow]=useState<null|{
    events:number;storage:string;modelQualified:false;
    m1:{samples:number;directional:number;correct:number;
      pairedN:number;accuracy:number|null;pairedRadarRate:number|null;baselineRate:number|null;missing:number};
    m15:{samples:number;directional:number;correct:number;
      pairedN:number;accuracy:number|null;pairedRadarRate:number|null;baselineRate:number|null;missing:number};
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
  const hint=[
    'Coinbase BTC-USD فقط؛ دفتر معلن وليس هوية صناع السوق',
    'دلتا تنفيذ '+view.delta.toFixed(0)+'%',
    'اختلال العمق '+view.imbalance.toFixed(0)+'%',
    micro?.ready?'طلبات معلنة '+Math.round(micro.bidDepthUsd)+
      ' USD، عروض معلنة '+Math.round(micro.askDepthUsd)+' USD':
      'تجهيز العمق: '+String(micro?.reason||'انتظار'),
    micro?.bidPersistent?'جدار طلب مستمر مرصود':'',
    micro?.askPersistent?'جدار عرض مستمر مرصود':'',
    micro?.ready&&micro.possibleBidPull?'تراجع عمق الطلب محتمل، السبب غير محسوم':'',
    micro?.ready&&micro.possibleAskPull?'تراجع عمق العرض محتمل، السبب غير محسوم':'',
    micro?.ready&&micro.possibleBidAbsorption?
      'امتصاص بيع محتمل: بيع منفذ '+Math.round(micro.executedSellUsd)+
      ' USD مع ثبات السعر وعمق طلب مستمر':'',
    micro?.ready&&micro.possibleAskAbsorption?
      'امتصاص شراء محتمل: شراء منفذ '+Math.round(micro.executedBuyUsd)+
      ' USD مع ثبات السعر وعمق عرض مستمر':'',
    micro?.ready&&micro.midMoveBps!=null?
      'حركة منتصف السعر '+micro.midMoveBps.toFixed(2)+' نقطة أساس':'',
    shadow?'سجل الخادم: '+shadow.events+
       ' إشارة؛ نتائج M1 '+shadow.m1.samples+
       ' وM15 '+shadow.m15.samples:'تقييم النتائج قيد التجميع',
    'الرادار رصد فقط ولا يغير TP أو SL'
  ].filter(Boolean).join(' | ');
  if(compact)return <>
    <button type="button" className={'sniper-flow-radar-chip '+
      (micro?.status==='POSSIBLE_PULL'||micro?.status==='POSSIBLE_ABSORPTION'?'warn':
       view.phase==='CONFIRMED'?'confirmed':'neutral')}
      onClick={()=>setScoreOpen(v=>!v)} aria-expanded={scoreOpen}
      title={hint} aria-label={'رادار الأوامر: '+labels[view.phase]+'. اضغط لعرض نتائج M1 وM15. '+hint}>
      <b>{view.phase==='OFFLINE'||view.phase==='WARMUP'?'تدفق: تجهيز':
        view.phase==='PREPARE'?'تدفق: استعداد':
        view.phase==='CONFIRMED'?'تدفق: تأكيد':
        micro?.ready&&micro.possibleBidPull?'سحب طلب؟':
        micro?.ready&&micro.possibleAskPull?'سحب عرض؟':
        micro?.ready&&micro.possibleBidAbsorption?'بصمة: امتصاص بيع؟':
        micro?.ready&&micro.possibleAskAbsorption?'بصمة: امتصاص شراء؟':
        micro?.bidPersistent?'طلب مستمر':
        micro?.askPersistent?'عرض مستمر':'تدفق: رصد'}
        {shadow?.events?' · n'+shadow.events:''}</b>
    </button>
    {scoreOpen&&<aside className="sniper-flow-score-detail" dir="rtl">
      <strong>بصمة دفتر الأوامر · Coinbase BTC-USD فقط</strong>
      {micro?.ready&&micro.possibleBidAbsorption&&<div>
        بيع هجومي منفذ {fmt(micro.executedSellUsd)} USD دون تقدم هابط
        واضح، مع استمرار عمق الطلب · امتصاص بيع محتمل لا أكثر.
      </div>}
      {micro?.ready&&micro.possibleAskAbsorption&&<div>
        شراء هجومي منفذ {fmt(micro.executedBuyUsd)} USD دون تقدم صاعد
        واضح، مع استمرار عمق العرض · امتصاص شراء محتمل لا أكثر.
      </div>}
      {(micro?.ready&&micro.possibleBidPull||micro?.ready&&micro.possibleAskPull)&&<div>
        اختفاء عمق مرصود؛ قد يكون إلغاء أو تنفيذًا غير مرصود.
        ليس إثبات spoofing ولا هوية فاعل بعينه.
      </div>}
      {micro?.ready&&<div>تغير منتصف السعر:
        {' '+fmt(micro.midMoveBps)} نقطة أساس ·
        آخر نافذة {' '+micro.spanSeconds.toFixed(0)} ثوانٍ ·
        {micro.snapshots} عينات L2.</div>}
      <strong>اختبار إحصائي لاحق · متابعة فقط</strong>
      <div>إشارات محفوظة على الخادم: {shadow?.events??'بانتظار البيانات'}</div>
      <div>M1: {shadow?.m1.samples??0} نتيجة · M15: {shadow?.m15.samples??0} نتيجة</div>
      <div>بيانات لم تكتمل: M1 {shadow?.m1.missing??0} · M15 {shadow?.m15.missing??0}</div>
      {shadow&&shadow.m1.directional>=70&&shadow.m1.pairedN>=50?
        <div>دقة M1 التاريخية {Math.round((shadow.m1.pairedRadarRate??0)*100)}%
          · المرجع {Math.round((shadow.m1.baselineRate??0)*100)}%
          · عينات متطابقة {shadow.m1.pairedN}</div>:
        <div>مقارنة M1: عينات مستقلة غير كافية</div>}
      {shadow&&shadow.m15.directional>=70&&shadow.m15.pairedN>=50?
        <div>دقة M15 التاريخية {Math.round((shadow.m15.pairedRadarRate??0)*100)}%
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
    {micro?.ready&&micro.possibleBidAbsorption&&<span>امتصاص بيع محتمل · تنفيذات SELL {fmt(micro.executedSellUsd)} USD وثبات السعر</span>}
    {micro?.ready&&micro.possibleAskAbsorption&&<span>امتصاص شراء محتمل · تنفيذات BUY {fmt(micro.executedBuyUsd)} USD وثبات السعر</span>}
    {view.confirm!=null&&<span>تأكيد <b dir="ltr">{fmt(view.confirm)}</b> · إلغاء <b dir="ltr">{fmt(view.invalidate)}</b></span>}
    <small title="تغير دفتر Level 2 قد يكون تنفيذًا أو إلغاءً، وليس إثبات التلاعب أو هوية مشارك. الرادار رصد فقط.">Coinbase BTC-USD · يتطلب رصد M1 لاحقًا · ليس نسبة نجاح</small>
  </div>;
}
