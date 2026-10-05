'use client';
import {useEffect,useState} from 'react';
import {Activity,RefreshCw,ShieldCheck,ShieldX,MinusCircle} from 'lucide-react';

type HealthState='ok'|'bad'|'neutral';
type HealthItem={label:string;state:HealthState;text:string};

export default function HealthCenter(){
  const [h,setH]=useState<any>(null),[busy,setBusy]=useState(false);
  const load=async()=>{setBusy(true);try{const r=await fetch('/api/health',{cache:'no-store'});setH(await r.json());}finally{setBusy(false);}};
  useEffect(()=>{void load();const t=setInterval(load,30000);return()=>clearInterval(t);},[]);

  const goldClosed=h?.session?.goldOpen===false;
  const mt5=h?.services?.mt5Bridge;
  const bg=h?.services?.background;
  const items:HealthItem[]=[
    {label:'Price',state:h?.services?.quote?.ok?'ok':'bad',text:h?.services?.quote?.ok?(goldClosed?'LAST PRICE':'OK'):'NOT READY'},
    {label:'Candles/Market',state:h?.services?.market?.ok?'ok':goldClosed?'neutral':'bad',text:h?.services?.market?.ok?'OK':goldClosed?'MARKET CLOSED':'NOT READY'},
    {label:'Journal',state:h?.services?.journal?'ok':'bad',text:h?.services?.journal?'OK':'NOT READY'},
    {label:'Backtest · Binance',state:h?.services?.backtest?.configured?'ok':'bad',text:h?.services?.backtest?.configured?'OK':'NOT READY'},
    {label:'MT5 Tick',state:!mt5?.configured?'neutral':mt5?.fresh?'ok':'bad',text:!mt5?.configured?'OPTIONAL':mt5?.fresh?'LIVE':'NOT READY'},
    {label:'MT5 Candles',state:!mt5?.configured?'neutral':mt5?.candlesFresh?'ok':'bad',text:!mt5?.configured?'OPTIONAL':mt5?.candlesFresh?'LIVE':'NOT READY'},
    {label:'Background DXY/Yields',state:!bg?.configured?'neutral':'ok',text:!bg?.configured?'OPTIONAL':'OK'}
  ];

  const banner=h?.status==='healthy'
    ?(goldClosed?'النظام سليم · الذهب مغلق حاليًا':'النظام سليم')
    :h?.status==='degraded'?'النظام يعمل جزئيًا':'Fail-closed / متوقف بأمان';

  return <section className="panel">
    <div className="panelhead">
      <div><span className="eyebrow">SYSTEM HEALTH</span><h2>المراقبة والتعافي</h2></div>
      <button className="iconbutton" onClick={load} disabled={busy}><RefreshCw size={16}/>فحص</button>
    </div>
    <div className={`healthbanner ${h?.status||'halted'}`}><Activity/><strong>{banner}</strong></div>
    <div className="healthgrid">
      {items.map(item=>{
        const Icon=item.state==='ok'?ShieldCheck:item.state==='bad'?ShieldX:MinusCircle;
        return <div key={item.label} className={item.state==='ok'?'healthok':item.state==='bad'?'healthbad':'healthneutral'}>
          <Icon/><span>{item.label}</span><b>{item.text}</b>
        </div>;
      })}
    </div>
    <div className="rule compact"><ShieldCheck/>مصدر السعر يتحول تلقائيًا من MT5 إلى المصادر الخارجية عند قدم Tick.</div>
    <div className="rule compact"><ShieldCheck/>إغلاق سوق الذهب أو عدم ربط MT5 لا يُحسب عطلًا في النظام.</div>
    <div className="rule compact"><ShieldCheck/>فشل البيانات المطلوبة لا يتحول إلى إشارة؛ التنفيذ يتوقف Fail-closed.</div>
    <div className="rule compact"><ShieldCheck/>DXY/Yields تأكيد اختياري ولا يوقف التحليل عند عدم ربطه.</div>
    <div className="rule compact"><ShieldCheck/>Kill Switch الإداري أعلى من الاستراتيجية وMT5.</div>
  </section>;
}
