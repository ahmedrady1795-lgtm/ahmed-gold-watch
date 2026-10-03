'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity,BarChart3,Bell,ChartCandlestick,FlaskConical,HeartPulse,
  LayoutDashboard,Newspaper,RefreshCw,Settings2,ShieldCheck,Wifi,WifiOff
} from 'lucide-react';
import CommandCenter from '../components/CommandCenter';
import SignalFlow from '../components/SignalFlow';
import NewsCommandCenter from '../components/NewsCommandCenter';
import StrategyLab from '../components/StrategyLab';
import PerformanceCenter from '../components/PerformanceCenter';
import HealthCenter from '../components/HealthCenter';
import AICommandCenter from '../components/AICommandCenter';
import TradingViewGold from '../components/TradingViewGold';
import {analyze,defaults,type Rules} from '../lib/engine';

type Snapshot={ok:boolean;checkedAt:number;market:any;quote:any;mt5:any;analysis:any};
type Tab='dashboard'|'ai'|'chart'|'news'|'lab'|'performance'|'health';
const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const goldMarketOpen=(now:number)=>{const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours()+d.getUTCMinutes()/60;if(day===6)return false;if(day===0&&h<22)return false;if(day===5&&h>=21)return false;if(day>=1&&day<=4&&h>=21&&h<22)return false;return true;};

export default function Home(){
  const [snap,setSnap]=useState<Snapshot|null>(null);
  const [health,setHealth]=useState<any>(null);
  const [aiData,setAiData]=useState<any>(null);
  const [aiError,setAiError]=useState('');
  const [tab,setTab]=useState<Tab>('dashboard');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [monitor,setMonitor]=useState(false);
  const [notice,setNotice]=useState('');
  const [btc,setBtc]=useState<number|null>(null);
  const [btcSource,setBtcSource]=useState('Coinbase');
  const [btcAt,setBtcAt]=useState(0),[goldTick,setGoldTick]=useState<any>(null);
  const seenSignal=useRef('');
  const [rules,setRules]=useState<Rules>(defaults);
  const [now,setNow]=useState(Date.now());
  const first=useRef(true);

  const load=async(silent=false)=>{
    if(!silent)setBusy(true);
    try{
      const r=await fetch('/api/snapshot',{cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!j?.ok)throw new Error(j?.message||'تعذر جلب لقطة السوق');
      setSnap(j); setError(''); setNow(Date.now());
    }catch(e){
      setError(e instanceof Error?e.message:'تعذر الاتصال بالسوق');
    }finally{if(!silent)setBusy(false);}
  };
  const loadHealth=async()=>{try{const r=await fetch('/api/health',{cache:'no-store'});setHealth(await r.json());}catch{setHealth({status:'halted'});}};
  const loadAi=async()=>{try{const r=await fetch('/api/ai-analysis',{cache:'no-store'}),j=await r.json();if(!r.ok||!j?.ok)throw new Error(j?.message||'تعذر تشغيل محرك AI');setAiData(j);setAiError('');}catch(e){setAiError(e instanceof Error?e.message:'تعذر تشغيل محرك AI');}};

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('ahmed-gold-rules')||'null');
      if(saved)setRules({...defaults,...saved});
      setMonitor(localStorage.getItem('ahmed-gold-monitor')==='true');
    }catch{}
    void load(); void loadHealth(); void loadAi();
    const clock=setInterval(()=>setNow(Date.now()),1000);
    const market=setInterval(()=>{if(document.visibilityState==='visible')void load(true);},15000);
    const hs=setInterval(()=>{if(document.visibilityState==='visible')void loadHealth();},30000);
    const aiTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadAi();},3000);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
    return()=>{clearInterval(clock);clearInterval(market);clearInterval(hs);clearInterval(aiTimer);};
  },[]);

  useEffect(()=>{
    let closed=false;
    const loadBtc=async()=>{try{
      const r=await fetch('/api/btc?source=coinbase',{cache:'no-store'}),j=await r.json();
      const p=Number(j?.price),at=Number(j?.fetchedAt)||Date.now();
      if(!closed&&r.ok&&j?.ok&&Number.isFinite(p)&&p>0){setBtc(p);setBtcAt(at);setBtcSource(String(j?.source||'Coinbase'));}
      else if(!closed&&!r.ok){setBtc(null);setBtcAt(0);setBtcSource('Coinbase unavailable');}
    }catch{if(!closed){setBtc(null);setBtcAt(0);setBtcSource('Coinbase unavailable');}}};
    void loadBtc();
    const restTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadBtc();},1500);
    return()=>{closed=true;clearInterval(restTimer);};
  },[]);

  useEffect(()=>{
    let closed=false,ws:WebSocket|null=null,t:ReturnType<typeof setTimeout>|undefined;
    const open=()=>{if(closed)return;ws=new WebSocket('wss://fstream.binance.com/ws/xauusdt@bookTicker');
      ws.onmessage=e=>{try{const x=JSON.parse(e.data),bid=Number(x.b),ask=Number(x.a),at=Number(x.E);if(x.s!=='XAUUSDT'||!Number.isFinite(at)||at>Date.now()+10000||Date.now()-at>15000||bid<=0||ask<bid)return;setGoldTick({ok:true,price:(bid+ask)/2,bid,ask,spread:ask-bid,sourceTime:at,status:'live',source:'Binance Futures · XAUUSDT proxy'});}catch{}};
      ws.onerror=()=>ws?.close();ws.onclose=()=>{if(!closed)t=setTimeout(open,3000);};};
    open();return()=>{closed=true;clearTimeout(t);ws?.close();};
  },[]);
  useEffect(()=>{
    if(!monitor||!snap)return;const a=snap.analysis,id=a?.signal?.id||a?.state+':'+a?.reason;
    if(!id||id===seenSignal.current)return;seenSignal.current=id;
    if('Notification'in window&&Notification.permission==='granted'&&'serviceWorker'in navigator){
      navigator.serviceWorker.getRegistration().then(reg=>reg?.showNotification('مرصد الذهب — '+(a?.title||'تغيّر الحالة'),{body:a?.reason||'راجع البيانات',tag:'gold-state'})).catch(()=>setNotice('تعذر إرسال إشعار الجهاز.'));
    }
  },[snap,monitor]);
  useEffect(()=>{
    if(!monitor)return;
    const pulse=()=>fetch('/api/telegram/pulse',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules})
    }).catch(()=>{});
    void pulse(); const t=setInterval(pulse,15000); return()=>clearInterval(t);
  },[monitor,rules]);

  useEffect(()=>{if(first.current){first.current=false;return;}try{localStorage.setItem('ahmed-gold-rules',JSON.stringify(rules));}catch{}},[rules]);

  const toggleMonitor=()=>setMonitor(v=>{const n=!v;try{localStorage.setItem('ahmed-gold-monitor',String(n));}catch{}return n;});
  const checkTelegram=async()=>{setNotice('جارٍ التحقق من البوت دون إرسال رسائل…');try{const r=await fetch('/api/telegram/status',{cache:'no-store'}),j=await r.json();setNotice(j.message||'تعذر التحقق');}catch{setNotice('تعذر الاتصال بفحص Telegram');}};
  const testTelegram=async()=>{
    setNotice('جارٍ إرسال اختبار Telegram...');
    try{const r=await fetch('/api/telegram/test',{method:'POST'}),j=await r.json();setNotice(r.ok&&j?.ok?'✅ تم إرسال رسالة الاختبار إلى Telegram':j?.message||'تعذر إرسال Telegram');}
    catch{setNotice('تعذر الاتصال بخدمة Telegram');}
  };
  const enablePush=async()=>{
    if(!('Notification'in window)){setNotice('الإشعارات غير مدعومة هنا. على iPhone أضف الموقع للشاشة الرئيسية وافتحه من الأيقونة.');return;}
    const p=await Notification.requestPermission();setNotice(p==='granted'?'✅ إشعارات الجهاز مفعلة':'لم يتم منح إذن الإشعارات.');
  };
  const updateRule=(k:keyof Rules,v:number)=>setRules(r=>({...r,[k]:v}));

  const mt5Active=Boolean(snap?.mt5?.fresh);
  const streamed=goldTick&&now-goldTick.sourceTime<15000;
  const quote=mt5Active?snap?.quote:streamed?goldTick:snap?.quote;
  const m=snap?.market;
  const analysis=m?analyze(m.c1,m.c5,m.c15,m.c60,m.events,Boolean(m.newsReady&&now-m.checkedAt<120000),now,rules):null;
  const market=snap?.market;
  const mt5Fresh=Boolean(snap?.mt5?.fresh);
  const source=mt5Fresh?'MT5 / Exness':quote?.source||market?.priceSource||'بانتظار المصدر';
  const score=analysis?.score?Math.max(analysis.score.long,analysis.score.short):0;
  const aiBtcPrice=Number(aiData?.bitcoin?.livePulse?.price);
  const aiBtcAt=Number(aiData?.bitcoin?.livePulse?.sourceTime)||0;
  const shownBtc=btc??(Number.isFinite(aiBtcPrice)&&aiBtcPrice>0?aiBtcPrice:null);
  const shownBtcAt=btcAt||aiBtcAt;
  const latestM1=market?.c1?.filter((c:any)=>c.time+60000<=Date.now()).at(-1)||null;
  const quoteAge=quote?.sourceTime?Math.max(0,Date.now()-quote.sourceTime):null;
  const marketOpen=goldMarketOpen(now);
  const live=marketOpen&&!error&&quote?.status==='live'&&quoteAge!=null&&quoteAge<120000;
  const priceState=!marketOpen?'MARKET CLOSED':live?'PRICE LIVE':quote?.status==='delayed'?'PRICE DELAYED':'PRICE NOT READY';

  const tabs=[
    ['dashboard','القيادة',LayoutDashboard],['ai','AI',Activity],['chart','الرسم',ChartCandlestick],['news','الأخبار',Newspaper],
    ['lab','المختبر',FlaskConical],['performance','الأداء',BarChart3],['health','الصحة',HeartPulse]
  ] as const;

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">AG</div>
        <div><span>AHMED GOLD · MASTER 3.1</span><strong>COMMAND</strong></div>
      </div>
      <div className="tickerstrip">
        <div><small>{source.includes('Binance')?'XAUUSDT · عقد بديل':'XAU/USD'}</small><b>{fmt(quote?.price)}</b><em className={live?'up':'muted'}>{!marketOpen?'CLOSED':live?'LIVE':'WAIT'}</em></div>
        <div><small>BTC/USD · {btcSource.includes('Coinbase')?'COINBASE':'WAIT'}</small><b>{fmt(btc,2)}</b><em>{btcAt&&now-btcAt<5000?'LIVE':'WAIT'}</em></div>
        <div><small>SCORE</small><b>{score||'—'}</b><em>/100</em></div>
      </div>
      <button className="refresh" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'spin':''}/><span>{busy?'تحديث':'تحديث'}</span></button>
    </header>

    <section className="statusrail">
      <span className={live?'pill ok':!marketOpen?'pill neutral':'pill bad'}>{live?<Wifi size={14}/>:<WifiOff size={14}/>} {priceState}</span>
      <span className={market?.pricesReady?'pill ok':'pill bad'}><Activity size={14}/> CANDLES {market?.pricesReady?'READY':'WAIT'}</span>
      <span className={mt5Fresh?'pill ok':'pill neutral'}><ShieldCheck size={14}/> {mt5Fresh?'MT5 READY':'MT5 OFFLINE'}</span>
      <span className={monitor?'pill watch':'pill neutral'}><Bell size={14}/> TELEGRAM {monitor?'MONITORING':'PAUSED'}</span>
      <button className="refresh" onClick={()=>void checkTelegram()}>فحص ربط Telegram</button><span className="source">المصدر: <b>{source}</b></span>
    </section>

    <nav className="tabs">
      {tabs.map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={tab===id?'active':''}><Icon size={17}/>{label}</button>)}
    </nav>

    {error&&<div className="fatal"><WifiOff size={18}/><div><strong>Fail-closed</strong><span>{error}</span></div></div>}

    <div className="workspace">
      <section className="content">
        {tab==='dashboard'&&<><section className="sidecard"><strong>حزمة الماستر وجسر MT5</strong><p>مؤشرات M1/M5/M15/H1، مختبر وسجل، وبث عقد XAUUSDT عند اتصال Binance. ليس سعر تنفيذ Exness. الجسر تجريبي افتراضيًا؛ لا تداول حي قبل ربط التخزين والتحقق على الديمو.</p><a href="/downloads/GoldWatch-MT5-Windows.zip" download>تنزيل جسر Windows / MT5</a></section>
          <CommandCenter analysis={analysis} quote={quote} events={market?.events||[]} background={market?.background||[]} now={now} health={health}/>
          <SignalFlow analysis={analysis} health={health} quote={quote} rules={rules}/>
          <div className="dashboardgrid">
            <NewsCommandCenter analysis={analysis} events={market?.events||[]} background={market?.background||[]} quote={quote} now={now}/>
            <section className="panel quickpanel">
              <div className="panelhead"><div><span className="eyebrow">LIVE CONTROLS</span><h2>التحكم السريع</h2></div><Settings2/></div>
              <button className={monitor?'primary danger':'primary'} onClick={toggleMonitor}><Bell size={17}/>{monitor?'إيقاف مراقبة Telegram':'تشغيل مراقبة Telegram'}</button>
              <button className="secondary" onClick={testTelegram}>اختبار Telegram</button>
              <button className="secondary" onClick={enablePush}>تفعيل إشعارات الجهاز</button>
              <div className="safetybox"><ShieldCheck/><p><b>التنفيذ الحقيقي مقفول افتراضيًا.</b><br/>MT5_AUTOTRADE_ENABLED=false وKill Switch مفعّل حتى اختبار Demo.</p></div>
            </section>
          </div>
          <section className="panel">
            <div className="panelhead"><div><span className="eyebrow">RULE ENGINE</span><h2>إعدادات الدخول</h2></div><span className="tag">محلية على جهازك</span></div>
            <div className="rulecontrols">
              <label>أقل Score<select value={rules.minScore} onChange={e=>updateRule('minScore',+e.target.value)}>{[72,76,80,84].map(v=><option key={v}>{v}</option>)}</select></label>
              <label>أقل ADX<select value={rules.adx} onChange={e=>updateRule('adx',+e.target.value)}>{[20,22,25].map(v=><option key={v}>{v}</option>)}</select></label>
              <label>حد ATR<select value={rules.spike} onChange={e=>updateRule('spike',+e.target.value)}>{[1.5,2,2.5].map(v=><option key={v}>{v}</option>)}</select></label>
              <label>قبل الخبر<select value={rules.before} onChange={e=>updateRule('before',+e.target.value)}>{[5,15,30].map(v=><option key={v}>{v} دقيقة</option>)}</select></label>
              <label>بعد الخبر<select value={rules.after} onChange={e=>updateRule('after',+e.target.value)}>{[5,15,30].map(v=><option key={v}>{v} دقيقة</option>)}</select></label>
            </div>
          </section>
        </>}

        {tab==='ai'&&<AICommandCenter data={aiData} error={aiError} now={now}/>} 
        {tab==='chart'&&<TradingViewGold/>}
        {tab==='news'&&<NewsCommandCenter analysis={analysis} events={market?.events||[]} background={market?.background||[]} quote={quote} now={now}/>}
        {tab==='lab'&&<StrategyLab signal={analysis?.signal||null} regime={analysis?.regime} quotePrice={quote?.price} quoteLive={live} latestM1={latestM1} rules={rules}/>}
        {tab==='performance'&&<PerformanceCenter/>}
        {tab==='health'&&<HealthCenter/>}
      </section>

      <aside className="sidebar">
        <div className="sidecard">
          <span className="eyebrow">SYSTEM</span>
          <h3>{health?.status==='healthy'?'جاهز للمراقبة':health?.status==='degraded'?'يعمل جزئيًا':'بانتظار الفحص'}</h3>
          <div className="kv"><span>Price</span><b className={live?'green':!marketOpen?'amber':'red'}>{!marketOpen?'CLOSED':live?'LIVE':'WAIT'}</b></div>
          <div className="kv"><span>Candles</span><b className={market?.pricesReady?'green':'red'}>{market?.pricesReady?'READY':'WAIT'}</b></div>
          <div className="kv"><span>News</span><b className={market?.newsReady?'green':'amber'}>{market?.newsReady?'READY':'OPTIONAL'}</b></div>
          <div className="kv"><span>Telegram</span><b className={health?.services?.telegram?.configured?'green':'amber'}>{health?.services?.telegram?.configured?'READY':'TOKEN NEEDED'}</b></div>
          <div className="kv"><span>MT5</span><b className={mt5Fresh?'green':'amber'}>{mt5Fresh?'LIVE':'WAITING VPS'}</b></div>
        </div>
        <div className="sidecard">
          <span className="eyebrow">PRINCIPLE</span>
          <p>درجة التوافق ليست نسبة نجاح. النظام لا يفتح صفقة عند بيانات ناقصة أو Tick قديم.</p>
        </div>
        <div className="sidecard risk">
          <span className="eyebrow">RISK LOCK</span>
          <h3>LIVE EXECUTION OFF</h3>
          <p>لن يتحول أي Signal لأمر حقيقي قبل تفعيل MT5 يدويًا بعد اختبار Demo.</p>
        </div>
      </aside>
    </div>

    {notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}</div>}
    <footer>Ahmed Gold Command · Rule-Based Market Engine · لا توجد صفقات مضمونة</footer>
  </main>;
}
