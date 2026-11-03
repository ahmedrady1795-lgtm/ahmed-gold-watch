'use client';

import {useMemo} from 'react';
import SniperMT5M1Chart from './SniperMT5M1Chart';
import {auditCandleHunter,displayCandleHunter,type CandleHunterLevel} from '../lib/sniper-m1-candle-hunter';
import type {M1Bar} from '../lib/sniper-mt5-m1';
import {freshM1QuoteForWatch} from '../lib/sampled-live-candle';

type Quote={ok?:boolean;price?:number;source?:string;sourceTime?:number}|null|undefined;
type Props={
  asset:'GOLD'|'BTC';history:M1Bar[];historicalSource:string;
  quote:Quote;now:number;marketOpen:boolean;sourceReady:boolean;
  providerTransition:boolean
};
const fmt=(x:number)=>x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function SniperM1CandleHunter(p:Props){
  const display=useMemo(()=>displayCandleHunter({
    bars:p.history,now:p.now,marketOpen:p.marketOpen,
    sourceReady:p.sourceReady,providerTransition:p.providerTransition
  }),[p.history,p.now,p.marketOpen,p.sourceReady,p.providerTransition]);
  const plan=display.plan;
  const referenceOnly=display.kind==='EXPIRED_REFERENCE';
  const liveEligible=display.kind==='LIVE';
  const closedAt=p.history.at(-1)?.time??0;
  const audit=useMemo(()=>auditCandleHunter(p.history,p.now,48),
    // Re-score only on a newly closed bar, not on every live quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.asset,p.historicalSource,closedAt,Math.floor(p.now/60000)]);
  const levels=plan.ready&&plan.buy&&plan.sell?[
    {kind:'TRIGGER' as const,label:'BUY STOP',price:plan.buy.trigger},
    {kind:'TRIGGER' as const,label:'SELL STOP',price:plan.sell.trigger},
    {kind:'TARGET' as const,label:'BUY TP',price:plan.buy.target},
    {kind:'TARGET' as const,label:'SELL TP',price:plan.sell.target},
    {kind:'STOP' as const,label:'BUY SL',price:plan.buy.stop},
    {kind:'STOP' as const,label:'SELL SL',price:plan.sell.stop}
  ]:[];
  const nowPrice=Number(p.quote?.price);
  const trusted=liveEligible&&p.marketOpen&&!p.providerTransition&&
    freshM1QuoteForWatch(p.quote,p.historicalSource,p.now,plan.issuedAt!);
  // A current quote beyond a limit is NOT proof that a pending order filled.
  const activeHint=trusted?
    nowPrice>=plan.buy!.trigger?'السعر المرصود أعلى BUY STOP · لا يوجد تنفيذ مؤكد':
    nowPrice<=plan.sell!.trigger?'السعر المرصود أسفل SELL STOP · لا يوجد تنفيذ مؤكد':
    'السعر بين مستويَي الكسر · انتظار':
    'ننتظر سعرًا حديثًا من نفس مصدر الشموع بعد إنشاء المستويات';
  const details=(name:string,level:CandleHunterLevel)=>(
    <div className={'sniper-m1-hunter-side '+(level.side==='BUY'?'is-buy':'is-sell')}
      key={name}>
      <strong>{name} <small>{referenceOnly?'مستوى منتهي · مرجع فقط':'رصد مشروط لدقيقة واحدة'}</small></strong>
      <div><span>تفعيل</span><b dir="ltr">{fmt(level.trigger)}</b></div>
      <div><span>هدف سريع TP</span><b dir="ltr">{fmt(level.target)}</b></div>
      <div><span>إبطال / وقف SL</span><b dir="ltr">{fmt(level.stop)}</b></div>
    </div>
  );
  return <section className="sniper-m1-hunter" aria-label="قنص حركة كل شمعة M1">
    <div className="sniper-m1-hunter-head">
      <div><small>القناص السريع · على نهج الفيديو</small>
        <h2>قنص كل شمعة M1</h2></div>
      <span>{liveEligible&&plan.expiresAt?
        'تتبقى '+Math.max(0,Math.ceil((plan.expiresAt-p.now)/1000))+' ثانية':
        referenceOnly?'مستويات منتهية · لا دخول':'انتظار شمعة مؤهلة'}</span>
    </div>
    <p className="sniper-m1-gross-risk">رصد تجريبي فقط · الهدف 0.72 ATR / الوقف 0.82 ATR (حوالي 0.88R قبل تكاليف التداول).</p>
    {plan.ready&&plan.buy&&plan.sell?<>
      <div className="sniper-m1-hunter-orders">
        {details('BUY STOP',plan.buy)}
        {details('SELL STOP',plan.sell)}
      </div>
      <p className={'sniper-m1-hunter-hint '+(referenceOnly?'is-expired':'')}>
        {referenceOnly?display.reason:activeHint||plan.reason}
      </p>
    </>:<p className="sniper-m1-hunter-hint">{plan.reason} · لا مستويات وهمية</p>}
    <SniperMT5M1Chart asset={p.asset} history={p.history}
      historicalSource={p.historicalSource} quote={p.quote} now={p.now}
      marketOpen={p.marketOpen} providerTransition={p.providerTransition}
      levels={levels} referenceOnly={referenceOnly}/>
    <details className="sniper-m1-hunter-audit">
      <summary>فحص القنص على شموع M1 تاريخية</summary>
      <p>آخر {audit.observed} فرصة دقيقة قابلة للفحص من الشموع المتجاورة، ولا تمثل تنفيذًا عند أسعار الوسيط:
        {' '}لمس الهدف {audit.targetTouches}،
        {' '}ملتبس {audit.ambiguous}،
        {' '}فتح بسعر فجوة غير مؤكد {audit.openGapUnknown}،
        {' '}لم يحدث كسر {audit.noTrigger}،
        {' '}تحرك دون حسم {audit.pending}.
        {' '}الفحص بمستويات OHLC فقط، وليس سجل تنفيذ أو نسبة ربح موثقة.</p>
    </details>
  </section>;
}
