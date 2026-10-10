'use client';
import {useEffect,useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {buildSniperOutlook} from '../lib/sniper-outlook';
import {updateForecastJournal,type ForecastJournal} from '../lib/forecast-journal';
import ForecastIllustration from './ForecastIllustration';

// One decision surface: chart, distant targets, liquidity and scenario journal.
export default function AICommandCenter({data,error,assetView='ALL',now=Date.now(),goldLive,btcLive}:any){
  const generatedAt=Number(data?.checkedAt||0);
  const [journals,setJournals]=useState<{GOLD:ForecastJournal|null;BTC:ForecastJournal|null}>({GOLD:null,BTC:null});
  useEffect(()=>{
    setJournals(previous=>{
      const gold=updateForecastJournal(previous.GOLD,
        buildSniperOutlook('GOLD',data?.gold,goldLive,now,generatedAt),now,generatedAt);
      const btc=updateForecastJournal(previous.BTC,
        buildSniperOutlook('BTC',data?.bitcoin,btcLive,now,generatedAt),now,generatedAt);
      if(JSON.stringify(gold)===JSON.stringify(previous.GOLD)&&
         JSON.stringify(btc)===JSON.stringify(previous.BTC))return previous;
      return {GOLD:gold,BTC:btc};
    });
  },[data,goldLive,btcLive,now,generatedAt]);
  const stale=generatedAt>0&&now-generatedAt>90000;
  return <div className="ai-clean renewed-ai">
    {error&&!data&&<div className="fatal"><ShieldAlert size={18}/><div><strong>التحليل غير متاح</strong><span>{error}</span></div></div>}
    {stale&&<div className="fatal"><ShieldAlert size={18}/><div><strong>تحديث AI متأخر</strong>
      <span>آخر تحليل منذ {Math.round((now-generatedAt)/1000)} ثانية · الأهداف السابقة محفوظة للمراجعة وغير نشطة.</span>
    </div></div>}
    <div id="market-forecast">
      <ForecastIllustration data={data} now={now} snapshotAt={generatedAt}
        goldLive={goldLive} btcLive={btcLive} assetView={assetView} journals={journals}/>
    </div>
  </div>;
}
