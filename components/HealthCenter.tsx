'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,RefreshCw,ShieldCheck,ShieldX,MinusCircle} from 'lucide-react';

type HealthState='ok'|'bad'|'neutral';
type HealthItem={label:string;state:HealthState;text:string};

export default function HealthCenter(){
  const [h,setH]=useState<any>(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch('/api/health',{cache:'no-store',signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const value=await r.json();
      if(!value?.services||!value?.checkedAt)throw new Error('Invalid health response');
      if(active.current===controller){setH(value);setError('');}
    }catch{
      if(active.current===controller)setError('تعذّر تحديث الفحص. البيانات السابقة إن وجدت ليست تأكيدًا للحالة الحالية.');
    }finally{
      clearTimeout(timer);
      if(active.current===controller){active.current=null;setBusy(false);}
    }
  },[]);
  useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);return()=>{
    clearInterval(t);const controller=active.current;active.current=null;controller?.abort();
  };},[load]);

  const goldClosed=h?.session?.goldOpen===false;
  const mt5=h?.services?.mt5Bridge;
  const bg=h?.services?.background;
  const ai=h?.services?.ai?.models;
  const items:HealthItem[]=[
    ...(['mlM1','mlM5','neural'] as const).map(key=>({
      label:key==='mlM1'?'ML M1':key==='mlM5'?'ML M5':'Neural AI',
      state:(ai?.[key]?.ready?'ok':!ai?.[key]?.configured?'neutral':'bad') as HealthState,
      text:ai?.[key]?.ready?'READY':ai?.[key]?.status||'NOT READY'
    })),
    {label:'Price',state:h?.services?.quote?.ok?'ok':'bad',text:h?.services?.quote?.ok?(goldClosed?'LAST PRICE':'OK'):'NOT READY'},
    {label:'Candles/Market',state:h?.services?.market?.ok?'ok':goldClosed?'neutral':'bad',text:h?.services?.market?.ok?'OK':goldClosed?'MARKET CLOSED':'NOT READY'},
    {label:'Journal',state:h?.services?.journal?'ok':'bad',text:h?.services?.journal?'OK':'NOT READY'},
    {label:'Backtest · Binance',state:h?.services?.backtest?.configured?'ok':'bad',text:h?.services?.backtest?.configured?'OK':'NOT READY'},
    {label:'MT5 Tick',state:!mt5?.configured?'neutral':mt5?.fresh?'ok':'bad',text:!mt5?.configured?'OPTIONAL':mt5?.fresh?'LIVE':'NOT READY'},
    {label:'MT5 Candles',state:!mt5?.configured?'neutral':mt5?.candlesFresh?'ok':'bad',text:!mt5?.configured?'OPTIONAL':mt5?.candlesFresh?'LIVE':'NOT READY'},
    {label:'Background DXY/Yields',state:!bg?.configured?'neutral':'ok',text:!bg?.configured?'OPTIONAL':'OK'}
  ];

  const banner=error?'حالة الاتصال غير مؤكدة':!h?'جارٍ فحص النظام':h?.status==='healthy'
    ?(goldClosed?'النظام سليم · الذهب مغلق حاليًا':'النظام سليم')
    :h?.status==='degraded'?'النظام يعمل جزئيًا':'Fail-closed / متوقف بأمان';

  return <section className="panel">
    <div className="panelhead">
      <div><span className="eyebrow">SYSTEM HEALTH</span><h2>المراقبة والتعافي</h2></div>
      <button className="iconbutton" onClick={load} disabled={busy}><RefreshCw size={16}/>فحص</button>
    </div>
    <div className={`healthbanner ${h?.status||'halted'}`}><Activity/><strong>{banner}</strong></div>
    {error&&<div role="alert" className="rule compact">{error}</div>}
    {h?.services?.ai?.nextAction&&<div className="rule compact">{h.services.ai.nextAction}</div>}
    {h?.checkedAt&&<div className="rule compact">آخر فحص: {new Date(h.checkedAt).toLocaleTimeString('ar-AE')}</div>}
    {h?.services?.ai?.reasons?.length>0&&<details className="rule compact"><summary>تفاصيل جاهزية النماذج</summary><div>{h.services.ai.reasons.join(" · ")}</div></details>}
    <div className="healthgrid">
      {items.map(item=>{
        const Icon=item.state==='ok'?ShieldCheck:item.state==='bad'?ShieldX:MinusCircle;
        return <div key={item.label} className={item.state==='ok'?'healthok':item.state==='bad'?'healthbad':'healthneutral'}>
          <Icon/><span>{item.label}</span><b>{item.text}</b>
        </div>;
      })}
    </div>
    <details><summary>قواعد الحماية ومصادر البيانات</summary>
    <div className="rule compact"><ShieldCheck/>مصدر السعر يتحول تلقائيًا من MT5 إلى المصادر الخارجية عند قدم Tick.</div>
    <div className="rule compact"><ShieldCheck/>إغلاق سوق الذهب أو عدم ربط MT5 لا يُحسب عطلًا في النظام.</div>
    <div className="rule compact"><ShieldCheck/>فشل البيانات المطلوبة لا يتحول إلى إشارة؛ التنفيذ يتوقف Fail-closed.</div>
    <div className="rule compact"><ShieldCheck/>DXY/Yields تأكيد اختياري ولا يوقف التحليل عند عدم ربطه.</div>
    <div className="rule compact"><ShieldCheck/>Kill Switch الإداري أعلى من الاستراتيجية وMT5.</div>
    </details>
  </section>;
}
