'use client';
import {useEffect,useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {scenarioAsJournal} from '../lib/sniper-audit-view';
import ForecastIllustration from './ForecastIllustration';

// One calibrated surface: only scenarios actually recorded by the server
// ledger can show as ACTIVE. Browser refreshes cannot reset their targets.
export default function AICommandCenter({data,error,assetView='ALL',now=Date.now(),goldLive,btcLive}:any){
  const generatedAt=Number(data?.checkedAt||0);
  const [audit,setAudit]=useState<any>(null);
  const [auditError,setAuditError]=useState(false);
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
  const journal={GOLD:scenarioAsJournal(audit?.current?.GOLD),
    BTC:scenarioAsJournal(audit?.current?.BTC)};
  const stale=generatedAt>0&&now-generatedAt>90000;
  return <div className="ai-clean renewed-ai">
    {error&&!data&&<div className="fatal"><ShieldAlert size={18}/><div><strong>التحليل غير متاح</strong><span>{error}</span></div></div>}
    {stale&&<div className="fatal"><ShieldAlert size={18}/><div><strong>تحديث AI متأخر</strong>
      <span>آخر تحليل منذ {Math.round((now-generatedAt)/1000)} ثانية · الأهداف السابقة للمراجعة فقط.</span>
    </div></div>}
    {auditError&&<div className="fatal"><ShieldAlert size={18}/><div><strong>سجل القناص غير متصل</strong>
      <span>الأهداف الجديدة مش معتمدة على الرسم قبل استعادة سجل الأداء.</span>
    </div></div>}
    <div id="market-forecast">
      <ForecastIllustration data={data} now={now} snapshotAt={generatedAt}
        goldLive={goldLive} btcLive={btcLive} assetView={assetView}
        journals={journal} audit={audit} auditLoaded={audit!=null&&!auditError}/>
    </div>
  </div>;
}
