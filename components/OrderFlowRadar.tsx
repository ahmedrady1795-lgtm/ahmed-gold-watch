'use client';
import {useEffect,useState} from 'react';
import {OrderFlowRadar as Engine,type RadarView} from '../lib/order-flow-radar';
const labels={WARMUP:'تجهيز نافذة 30 ثانية',OFFLINE:'تدفق غير مكتمل',WATCH:'مراقبة',PREPARE:'استعداد مبكر',CONFIRMED:'تأكيد حركة',INVALIDATED:'أُلغي بكسر المستوى',EXPIRED:'انتهت صلاحية الرصد'};
export default function OrderFlowRadar({asset,onView}:{asset:'GOLD'|'BTC';onView?:(v:RadarView|null)=>void}){
  const [view,setView]=useState<RadarView>(()=>new Engine().view);
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
  if(asset!=='BTC')return <small>رادار الأوامر: الذهب يحتاج مصدر دفتر أوامر وصفقات فعلية.</small>;
  const fresh=!['OFFLINE','WARMUP'].includes(view.phase);
  return <div aria-label="رادار السيولة والامتصاص" style={{display:'flex',flexWrap:'wrap',gap:'6px 16px',alignItems:'center',padding:'8px 12px',border:'1px solid #334155',borderRadius:8,fontSize:12}}>
    <strong>رادار السيولة · {labels[view.phase]}</strong>
    <span>{view.side==='BUY'?'امتصاص بيع محتمل':view.side==='SELL'?'امتصاص شراء محتمل':'لا اتجاه مؤكد'}</span>
    {fresh&&<span>صافي التنفيذ {view.delta.toFixed(0)}% · توازن العمق {view.imbalance.toFixed(0)}%</span>}
    {view.confirm!=null&&<span>تأكيد <b dir="ltr">{fmt(view.confirm)}</b> · إلغاء <b dir="ltr">{fmt(view.invalidate)}</b></span>}
    <small title="التجدد استدلال بعد التنفيذ. بيانات Level 2 لا تفصل إلغاء الأوامر عن تنفيذها بدقة. الرادار لا يرسل أوامر تداول ولا يغيّر أهداف السيناريو.">Coinbase BTC-USD · أول شمعة تتطلب إغلاق M1 متوافقًا · ليس نسبة نجاح</small>
  </div>;
}
