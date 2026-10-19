'use client';
import {useEffect,useMemo,useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {scenarioAsJournal} from '../lib/sniper-audit-view';
import ForecastIllustration from './ForecastIllustration';

// One calibrated surface: only scenarios actually recorded by the server
// ledger can show as ACTIVE. Browser refreshes cannot reset their targets.
export default function AICommandCenter({data,chartData,error,assetView='ALL',now=Date.now(),goldLive,btcLive}:any){
  // When inference is warming or fails, the real market chart remains available.
  // A candle refresh may replace chart HISTORY only, never model decisions,
  // qualifications, timestamps, targets or recommendation confidence.
  const displayData=useMemo(()=>{
  const attachHistory=(asset:'gold'|'bitcoin')=>{
    const modeled=data?.[asset]||{};
    const separate=chartData?.[asset];
    if(!separate?.chartCandles?.length)return modeled;
    const lastModelCandle=Number(modeled?.chartCandles?.at(-1)?.time||0);
    const lastFeedCandle=Number(separate?.chartCandles?.at(-1)?.time||0);
    if(lastModelCandle>=lastFeedCandle&&lastModelCandle>0&&!separate.providerTransition)return modeled;
    return {...modeled,chartCandles:separate.chartCandles,
      chartHigherFrames:separate.chartHigherFrames,
      candleSource:separate.candleSource,
      providerTransition:Boolean(separate.providerTransition),
      pendingProvider:separate.pendingProvider};
  };
  return (data||chartData)?{
    ...(data||{}),gold:attachHistory('gold'),bitcoin:attachHistory('bitcoin'),
    checkedAt:Number(data?.checkedAt||chartData?.checkedAt||0)
  }:null;
  },[data,chartData]);
  const generatedAt=Number(data?.checkedAt||chartData?.checkedAt||0);
  const [audit,setAudit]=useState<any>(null);
  const [auditError,setAuditError]=useState(false);
  const [openedAt]=useState(()=>Date.now());
  useEffect(()=>{
    let closed=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      try{
        if(document.visibilityState==='visible'){
          const response=await fetch('/api/sniper-audit',{cache:'no-store',
            signal:AbortSignal.timeout(5000)});
          const body=await response.json();
          if(!response.ok||body?.ok!==true)throw new Error('audit unready');
          if(!closed){setAudit(body);setAuditError(false);}
        }
      }catch{if(!closed)setAuditError(true);}
      if(!closed)timer=setTimeout(load,8000);
    };
    void load();
    return()=>{closed=true;clearTimeout(timer);};
  },[]);
  const chartAudit=chartData?.structuralAudit;
  // Chart updates carry a fresher ledger, but not remote checkpoint metadata.
  // Preserve the independently fetched archive status when choosing that ledger.
  const effectiveAudit=useMemo(()=>chartAudit?.ok&&Number(chartAudit.updatedAt||0)>Number(audit?.updatedAt||0)
    ?{...chartAudit,archive:audit?.archive}:audit,[chartAudit,audit]);
  const journal=useMemo(()=>({GOLD:scenarioAsJournal(effectiveAudit?.current?.GOLD),
    BTC:scenarioAsJournal(effectiveAudit?.current?.BTC)}),[effectiveAudit]);
  const observationAt=Number(chartData?.checkedAt||data?.checkedAt||0);
  const chartWatchFresh=Boolean(chartAudit?.ok&&now-observationAt<90000&&observationAt<=now+2000);
  const stale=generatedAt>0&&now-generatedAt>90000&&!chartWatchFresh;
  if(!displayData)return <div className="ai-clean renewed-ai"><section className="panel" role="status" aria-live="polite">
    <h2>{error?'تعذر تحميل القناص':now-openedAt>15000?'الاتصال بالسوق يستغرق وقتًا أطول':'جاري تحميل القناص'}</h2>
    <p>{error||'ننتظر أول بيانات من الخادم. لا توجد إشارة دخول قبل اكتمال التحميل والتحقق من حداثة الأسعار.'}</p>
  </section></div>;
  return <div className="ai-clean renewed-ai">
    {(Boolean(error&&!data)||stale||Boolean(auditError&&!chartWatchFresh))&&
      <div className="sniper-system-notice" role="status" aria-label="حالة تحديث القناص">
        <ShieldAlert size={17}/>
        <strong>{error&&!data?'مصدر التحليل يحتاج اتصالًا':
          stale?'تحليل AI يتجدد · الرسم يعرض آخر شموع مؤكدة':
          'تحديث سجل الأداء قيد المراجعة'}</strong>
        <details>
          <summary>تفاصيل الاتصال</summary>
          {error&&!data&&<p>{error}</p>}
          {stale&&<p>آخر تحليل منذ {Math.round((now-generatedAt)/1000)} ثانية · السيناريو القديم للمراجعة، ولا يفعّل دخولًا.</p>}
          {auditError&&!chartWatchFresh&&<p>سجل القناص غير متصل حاليًا؛ الأهداف الجديدة لا تُعتمد حتى عودته.</p>}
        </details>
      </div>}
    <div id="market-forecast">
      <ForecastIllustration data={displayData} now={now} snapshotAt={generatedAt}
        goldLive={goldLive} btcLive={btcLive} assetView={assetView}
        journals={journal} audit={effectiveAudit} observationAt={observationAt}
        auditLoaded={Boolean(effectiveAudit?.ok&&(chartWatchFresh||!auditError))}/>
    </div>
  </div>;
}
