'use client';

import {useMemo} from 'react';
import SniperMT5M1Chart from './SniperMT5M1Chart';
import {auditCandleHunter,buildCandleHunter,type CandleHunterLevel} from '../lib/sniper-m1-candle-hunter';
import type {M1Bar} from '../lib/sniper-mt5-m1';

type Quote={ok?:boolean;price?:number;source?:string;sourceTime?:number}|null|undefined;
type Props={
  asset:'GOLD'|'BTC';history:M1Bar[];historicalSource:string;
  quote:Quote;now:number;marketOpen:boolean;sourceReady:boolean;
  providerTransition:boolean
};
const fmt=(x:number)=>x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function SniperM1CandleHunter(p:Props){
  const plan=useMemo(()=>buildCandleHunter({
    bars:p.history,now:p.now,marketOpen:p.marketOpen,
    sourceReady:p.sourceReady,providerTransition:p.providerTransition
  }),[p.history,p.now,p.marketOpen,p.sourceReady,p.providerTransition]);
  const closedAt=p.history.at(-1)?.time??0;
  const audit=useMemo(()=>auditCandleHunter(p.history,p.now,32),
    // Re-score only on a newly closed bar, not on every live quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.asset,p.historicalSource,closedAt,Math.floor(p.now/60000)]);
  const levels=plan.ready&&plan.buy&&plan.sell?[
    {kind:'TRIGGER' as const,label:'BUY STOP',price:plan.buy.trigger},
    {kind:'TRIGGER' as const,label:'SELL STOP',price:plan.sell.trigger},
    {kind:'TARGET' as const,label:'BUY TP',price:plan.buy.target},
    {kind:'TARGET' as const,label:'SELL TP',price:plan.sell.target}
  ]:[];
  const nowPrice=Number(p.quote?.price);
  const activeHint=plan.ready&&p.quote?.ok&&Number.isFinite(nowPrice)?
    nowPrice>=plan.buy!.trigger?'تمت ملامسة BUY STOP بالسعر المعلن · التفعيل الفعلي غير مؤكد':
    nowPrice<=plan.sell!.trigger?'تمت ملامسة SELL STOP بالسعر المعلن · التفعيل الفعلي غير مؤكد':
    'مستويات القنص تنتظر كسر الشمعة المقبلة':'';
  const details=(name:string,level:CandleHunterLevel)=>(
    <div className={'sniper-m1-hunter-side '+(level.side==='BUY'?'is-buy':'is-sell')}
      key={name}>
      <strong>{name} <small>رصد مشروط لدقيقة واحدة</small></strong>
      <div><span>تفعيل</span><b dir="ltr">{fmt(level.trigger)}</b></div>
      <div><span>هدف سريع TP</span><b dir="ltr">{fmt(level.target)}</b></div>
      <div><span>إبطال / وقف SL</span><b dir="ltr">{fmt(level.stop)}</b></div>
    </div>
  );
  return <section className="sniper-m1-hunter" aria-label="قنص حركة كل شمعة M1">
    <div className="sniper-m1-hunter-head">
      <div><small>القناص السريع · على نهج الفيديو</small>
        <h2>قنص كل شمعة M1</h2></div>
      <span>{plan.ready?'مستويات دقيقة جارية':'انتظار شمعة مؤهلة'}</span>
    </div>
    {plan.ready&&plan.buy&&plan.sell?<>
      <div className="sniper-m1-hunter-orders">
        {details('BUY STOP',plan.buy)}
        {details('SELL STOP',plan.sell)}
      </div>
      <p className="sniper-m1-hunter-hint">{activeHint||plan.reason}</p>
    </>:<p className="sniper-m1-hunter-hint">{plan.reason} · لا مستويات وهمية</p>}
    <SniperMT5M1Chart asset={p.asset} history={p.history}
      historicalSource={p.historicalSource} quote={p.quote} now={p.now}
      marketOpen={p.marketOpen} providerTransition={p.providerTransition}
      levels={levels}/>
    <details className="sniper-m1-hunter-audit">
      <summary>فحص القنص على شموع M1 تاريخية</summary>
      <p>آخر {audit.observed} فرصة دقيقة قابلة للفحص من الشموع المتجاورة:
        {' '}لمس الهدف {audit.targetTouches}،
        {' '}ملتبس {audit.ambiguous}،
        {' '}فتح بسعر فجوة غير مؤكد {audit.openGapUnknown}،
        {' '}لم يحدث كسر {audit.noTrigger}،
        {' '}تحرك دون حسم {audit.pending}.
        {' '}الفحص بمستويات OHLC فقط، وليس سجل تنفيذ أو نسبة ربح موثقة.</p>
    </details>
  </section>;
}
