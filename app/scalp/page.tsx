'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowRight,Clock3,RefreshCw,ShieldAlert} from 'lucide-react';
import ScalpDesk from '../../components/ScalpDesk';

function GoldLeadAudit({audit}:{audit:any}){
  if(!audit)return <section className="panel" aria-label="قياس اقتناص الذهب" style={{padding:16}}>
    <strong>قياس الاقتناص · الذهب</strong>
    <p>لم تبدأ عينة التوقيت بعد. لا توجد نسبة نجاح يمكن اعتمادها.</p>
  </section>;
  const lanes=[{key:'m1',name:'M1 · 60 ثانية'},{key:'m5',name:'M5 · 5 دقائق'}];
  return <section className="panel" aria-label="قياس اقتناص الذهب" style={{padding:16,marginBottom:14}}>
    <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:10,alignItems:'center'}}>
      <strong>قياس اقتناص الحركة · الذهب</strong>
      <span style={{fontSize:12,opacity:.76}}>مراقبة الاتجاه بعد الإشارة · ليست صفقات أو نسبة ربح</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(215px,1fr))',gap:12,marginTop:12}}>
      {lanes.map(({key,name})=>{
        const a=audit[key]||{},seen=Number(a.resolved||0);
        const sources=Object.keys(a.bySource||{});
        const exnessOnly=sources.length>0&&sources.every(s=>s.startsWith('Exness/MT5'));
        return <article key={key} style={{padding:14,border:'1px solid var(--border, rgba(160,165,180,.25))',borderRadius:12}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
            <strong>{name}</strong>
            <span style={{fontSize:12,opacity:.76}}>{a.pending?'رصد جارٍ':'رصد فقط'}</span>
          </div>
          <p style={{margin:'10px 0',fontSize:21,fontWeight:750}}>
            {seen>0?String(a.observedFavorablePct)+'%':'لا توجد عينة مكتملة'}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            حركة مؤيدة {a.favorableFirst||0} · عكسية {a.adverseFirst||0} · بلا حسم {a.noThreshold||0} · مجهولة {a.unknown||0}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            تحضير مبكر 55–69: {a.earlyWatchCohort?.total??0} حالة مرصودة
            {' · '}مؤيدة {a.earlyWatchCohort?.favorable??0} · عكسية {a.earlyWatchCohort?.adverse??0}
            {' · '}مجهولة {a.earlyWatchCohort?.unknown??0}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            زمن الحركة المؤيدة: {a.meanTimeToFavorableMs!=null?
              (Number(a.meanTimeToFavorableMs)/1000).toFixed(1)+' ثانية':'غير متاح'}
          </p>
          {!a.persisted&&<p style={{fontSize:12,margin:'6px 0',opacity:.85}}>
            {a.storage==='EPHEMERAL'?
              'الرصد محفوظ مؤقتًا داخل التشغيل الحالي؛ إعادة إنشاء Render تمسح السجل':
              'الرصد غير محفوظ على تخزين دائم؛ النتائج قد تضيع عند إعادة التشغيل'}
          </p>}
          <p style={{fontSize:12,opacity:.72,margin:'5px 0'}}>
            المصدر: {sources.length?(exnessOnly?'Exness/MT5':'أسعار مرجعية / مصدر مختلط'):'قيد الانتظار'}
            {' · '}{seen<50?'عينة غير كافية':'نتائج رصد فقط'}
          </p>
        </article>;
      })}
    </div>
    <p style={{margin:'10px 0 0',fontSize:12,opacity:.76}}>
      معدل الحركة المؤيدة يُحسب من أول حركة سعرية مرصودة بعد الإشارة، ولا يشمل الحالات المجهولة.
      لا يثبت الدخول قبل صناع السوق أو الربحية. قياس Ambush على أسعار Exness يبدأ بعد ربط MT5.
    </p>
  </section>;
}

function GoldQuickResults({gold}:{gold:any}){
  const lanes=([1,5] as const).map(h=>{
    const stats=gold?.ledger?.lanes?.find((x:any)=>x.horizon===h)?.stats;
    const proof=stats?.quickProof;
    return {h,proof,fast:Number(stats?.exitCauses?.quickTargets||0)};
  });
  return <section className="panel" aria-label="نتائج جني الربح السريع للذهب"
    style={{padding:16,marginBottom:14}}>
    <strong>قنص المكسب الصغير · خروج خلال دقيقة أو دقيقتين</strong>
    <p style={{fontSize:12,opacity:.78,margin:'7px 0'}}>
      الصافي بعد تكلفة تقديرية · رصد ورقي مش أرباح Exness. يشمل الربح والوقف وخروج الوقت.
    </p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>
      {lanes.map(({h,proof,fast})=><div key={h}
        style={{border:'1px solid var(--border, rgba(160,165,180,.25))',padding:12,borderRadius:10}}>
        <b>GOLD M{h}</b>
        <p style={{margin:'7px 0'}}>
          خروج سريع {fast} · عينة {proof?.samples??0}/50
        </p>
        <small>الصافي {proof?.samples&&Number.isFinite(proof.netR)?proof.netR+'R':'لم يبدأ الإثبات'}
          {' · '}{proof?.status==='POSITIVE_PAPER_SAMPLE'?'أدلة ورقية أولية':
            proof?.status==='NOT_VALIDATED'?'لم تثبت الأفضلية':'جمع نتائج'}
        </small>
      </div>)}
    </div>
  </section>;
}

function GoldEveryCandle({data}:{data:any}){
  const latest=data?.latest;
  const stateLabel=(v:string)=>({
    NO_BID_ASK:'لا توجد أسعار Bid/Ask حديثة بعد التوقع',
    COST_UNVIABLE:'التكلفة أكبر من الحركة المرجحة · بدون Limit',
    PENDING:'LIMIT معلّق · مستني لمس السعر',
    ACTIVE:'تم لمس LIMIT ورقي · متابعة الخروج',
    QUICK_TP:'هدف مكسب صغير مرصود',
    STOP:'وقف مرصود',
    TIME_EXIT:'خروج وقت',
    EXPIRED:'انتهى LIMIT دون لمس',
    UNKNOWN:'نتيجة مجهولة'
  } as Record<string,string>)[v]||'بانتظار أول شمعة';
  const fmt=(x:any)=>Number.isFinite(Number(x))&&x!=null?
    Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  return <section className="panel" aria-label="قنص كل شمعة M1 ورقي"
    style={{padding:16,marginBottom:14}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <strong>كل شمعة M1 · توقع واتجاه ومحاولة LIMIT</strong>
      <span style={{fontSize:12,opacity:.82}}>ورقي بحثي فقط · لا ينفّذ على Exness</span>
    </div>
    <p style={{fontSize:12,opacity:.80,margin:'8px 0'}}>
      توقع لكل دقيقة مؤهلة؛ دخول LIMIT على تراجع داخل شمعة مغلقة، بهدف
      صافي نظري ≥0.45R بعد تكلفة إضافية تقديرية. أي فرصة لا تصلح للتنفيذ
      تفضل متسجلة كتوقع، من غير تزوير دخول أو نجاح. مفيش ضمان للربح.
    </p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'8px 0 12px',fontSize:12}}>
      <span>توقعات {data?.proposals??0}</span>
      <span>فرص مكلفة متروكة {data?.costUnviable??0}</span>
      <span>توقعات ضعيفة {data?.weakCount??0}</span>
      <span>أوامر معلقة {data?.pending??0}</span>
      <span>لمسات ورقية {data?.filled??0}</span>
      <span>مكاسب صغيرة {data?.quickWins??0}</span>
      <span>وقف {data?.stops??0}</span>
      <span>انتهت {data?.expired??0}</span>
      <span>مجهولة {data?.unknown??0}</span>
      <span>انعكاسات سيولة {data?.reversalSetups??0}</span>
      <span>عينات قديمة منفصلة {data?.legacyResults??0}</span>
      <span>V2 نتائج محسومة {data?.resolved??0}</span>
      <span>V2 نسبة رابحة {data?.observedWinPct!=null?data.observedWinPct+'%':'لا توجد عينة'}</span>
      <span>رفض قمة/قاع: {data?.byPattern?.reversal?.resolved??0} نتيجة / صافي {data?.byPattern?.reversal?.netR??0}R</span>
      <span>متابعة زخم: {data?.byPattern?.momentum?.resolved??0} نتيجة / صافي {data?.byPattern?.momentum?.netR??0}R</span>
    </div>
    {latest?<div style={{border:'1px solid var(--border, rgba(160,165,180,.25))',
      padding:12,borderRadius:10}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <b>{latest.side==='BUY'?'↑ توقع صعود / BUY LIMIT':'↓ توقع هبوط / SELL LIMIT'}</b>
        <small>{latest.weak?'توقع ضعيف · محسوب ضمن الأخطاء':'ضغط اتجاهي مرصود'}
          {' · '}{latest.pressure}/100 مش نسبة نجاح
          {' · '}{latest.pattern==='SWEEP_REJECTION'?'رفض كسر سيولة':'متابعة زخم'}</small>
      </div>
      <p style={{margin:'6px 0',fontSize:13}}>
        دخول {fmt(latest.entry)} · هدف {fmt(latest.tp)} · وقف {fmt(latest.stop)}
        {latest.targetNetR!=null?' · عائد نظري '+latest.targetNetR+'R':''}
      </p>
      <small>{stateLabel(latest.state)} · {latest.note}</small>
    </div>:<p>بانتظار شمعة M1 مكتملة جديدة وسعر مرجعي حديث.</p>}
    {Array.isArray(data?.recent)&&data.recent.length>1&&
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,fontSize:12}}>
        {data.recent.slice(1,7).map((t:any)=>
          <span key={t.id} style={{padding:'5px 8px',borderRadius:6,
            border:'1px solid var(--border, rgba(160,165,180,.25))'}}>
            {t.side==='BUY'?'↑':'↓'} {stateLabel(t.state)}
            {t.netR!=null?' · '+t.netR+'R':''}
          </span>)}
      </div>}
    <small style={{display:'block',opacity:.72,marginTop:10}}>
      {data?.storage==='VOLUME'?'النتائج محفوظة على قرص الخدمة':
       'تخزين مؤقت؛ إعادة إنشاء الخدمة قد تمسح النتائج'}.
      {' '}مجموع الصافي الورقي {fmt(data?.netR)}R،
      {' '}من {data?.resolved??0} نتيجة قابلة للحساب بعد تكلفة تقديرية،
      {' '}متوسط الصافي {data?.meanNetR!=null?fmt(data.meanNetR)+'R':'غير محسوب'}،
      {' '}العائد المستهدف مش نسبة نجاح. نقطة التعادل النظرية عند
      مكسب 0.45R مقابل خسارة 1R حوالي 69% صفقات رابحة قبل تفاوت التنفيذ،
      وما نعتبرش استراتيجية V2 ناجحة إلا بعينة مستقلة كافية.
      {' '}مش دليل ربح حقيقي ولا نسبة نجاح معتمدة.
    </small>
  </section>;
}

export default function ScalpWorkspace(){
  const [desk,setDesk]=useState<any>(null);
  const [now,setNow]=useState(Date.now());
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [asset,setAsset]=useState<'ALL'|'GOLD'|'BTC'>('GOLD');
  const assetRef=useRef<'ALL'|'GOLD'|'BTC'>('GOLD');
  assetRef.current=asset;
  const inFlight=useRef(false);
  const load=async()=>{
    if(inFlight.current)return;
    inFlight.current=true;
    setLoading(true);
    try{
      const requestedAsset=assetRef.current;
      const r=await fetch('/api/scalp?asset='+(requestedAsset==='GOLD'?'GOLD':'ALL')+'&ts='+Date.now(),{
        cache:'no-store',headers:{'X-Qannas-Viewer':'1'},
        signal:AbortSignal.timeout(12000)
      });
      const result=await r.json();
      if(!r.ok||!result?.ok)throw Error(result?.message||'تعذر تحديث السكالب');
      // Do not overwrite a switched-to-ALL view with an older GOLD-only answer.
      if(requestedAsset===assetRef.current)setDesk(result);
      setError('');
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
    {asset!=='BTC'&&<GoldEveryCandle data={desk?.gold?.everyCandle}/>}
    {asset!=='BTC'&&<GoldLeadAudit audit={desk?.gold?.leadAudit}/>}
    {asset!=='BTC'&&<GoldQuickResults gold={desk?.gold}/>}
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
