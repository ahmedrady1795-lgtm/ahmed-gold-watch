'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowRight,Clock3,RefreshCw,ShieldAlert} from 'lucide-react';
import ScalpDesk from '../../components/ScalpDesk';

export default function ScalpWorkspace(){
  const [desk,setDesk]=useState<any>(null);
  const [now,setNow]=useState(Date.now());
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [asset,setAsset]=useState<'ALL'|'GOLD'|'BTC'>('ALL');
  const inFlight=useRef(false);
  const load=async()=>{
    if(inFlight.current)return;
    inFlight.current=true;
    setLoading(true);
    try{
      const r=await fetch('/api/scalp?ts='+Date.now(),{
        cache:'no-store',signal:AbortSignal.timeout(12000)
      });
      const result=await r.json();
      if(!r.ok||!result?.ok)throw Error(result?.message||'تعذر تحديث السكالب');
      setDesk(result);setError('');
    }catch(e){
      setError(e instanceof Error?e.message:'تعذر الاتصال');
    }finally{inFlight.current=false;setLoading(false);}
  };
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(document.visibilityState==='visible')await load();
      if(active)timer=setTimeout(poll,2500);
    };
    void poll();
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{active=false;clearTimeout(timer);clearInterval(clock)};
  },[]);
  const age=desk?.checkedAt!=null?Math.max(0,Math.round((now-desk.checkedAt)/1000)):null;
  return <main className="shell modern-workspace scalp-workspace">
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">AG</div>
        <div><span>GOLD WATCH · DESKTOP DESK</span><strong>SCALP LAB</strong></div>
      </div>
      <div className="topbar-actions">
        <Link href="/" className="scalp-back-link"><ArrowRight size={16}/> رجوع للقناص</Link>
        <button type="button" className="refresh" onClick={()=>void load()} disabled={loading}>
          <RefreshCw size={16} className={loading?'spin':''}/> تحديث
        </button>
      </div>
    </header>
    <div className="scalp-lab-intro">
      <div><span className="eyebrow">SEPARATE WORKSPACE / M1 + M5</span>
        <h1>سكالب الثواني <span>· صفحة مستقلة</span></h1>
        <p>فرص وتجارب ورقية سريعة؛ محرك السكالب مستقل عن أهداف القناص الهيكلية.</p></div>
      <div className="scalp-lab-status">
        <Clock3 size={16}/><strong>{age==null?'جاري الاتصال':age<=15?'بيانات حديثة':'بيانات قديمة'}</strong>
        <span>{age==null?'—':age+' ثانية منذ آخر تحديث'}</span>
      </div>
    </div>
    <div className="workspace-toolbar scalp-lab-toolbar">
      <div className="asset-switch" role="group" aria-label="اختيار الأصل">
        {([{id:'ALL',label:'الكل'},{id:'GOLD',label:'الذهب'},{id:'BTC',label:'البيتكوين'}] as const)
          .map(item=><button key={item.id} aria-pressed={asset===item.id}
            onClick={()=>setAsset(item.id)} type="button">{item.label}</button>)}
      </div>
      <span className="scalp-paper-label"><ShieldAlert size={14}/> تجريبي فقط · غير متصل بأوامر MT5</span>
    </div>
    {error&&<div className="fatal"><ShieldAlert size={16}/><div><strong>الاتصال غير مستقر</strong>
      <span>{error} · لا تعتمد على الأسعار المعروضة قبل عودة البيانات الحديثة.</span></div></div>}
    <section className="content lite-content" aria-label="منصة سكالب مستقلة">
      <div className={'dashboardgrid market-pair-grid '+(asset!=='ALL'?'single-asset':'')}>
        {asset!=='BTC'&&(desk?.gold?<ScalpDesk desk={desk.gold} now={now}/>:
          <div className="panel workspace-loading"><Activity size={16}/> جاري قراءة سكالب الذهب…</div>)}
        {asset!=='GOLD'&&(desk?.bitcoin?<ScalpDesk desk={desk.bitcoin} now={now}/>:
          <div className="panel workspace-loading"><Activity size={16}/> جاري قراءة سكالب البيتكوين…</div>)}
      </div>
    </section>
    <div className="scalp-lab-footer">
      <ShieldAlert size={16}/>
      إشارات السكالب هنا ورقية ولا تنفذ أوامر على Exness/MT5. الاتصال الآلي بالمنصة يحتاج إعدادات وتنفيذ منفصل على اللابتوب.
    </div>
    <footer><Link href="/">القناص بعيد المدى ←</Link> · Gold Watch Scalp Lab</footer>
  </main>;
}
