'use client';

import {useMemo} from 'react';
import SniperMT5M1Chart from './SniperMT5M1Chart';
import SniperM1CandleTape from './SniperM1CandleTape';
import SniperM1IntrabarPulse from './SniperM1IntrabarPulse';
import {auditCandleHunter,displayCandleHunter,type CandleHunterLevel} from '../lib/sniper-m1-candle-hunter';
import type {M1Bar} from '../lib/sniper-mt5-m1';
import {everyM1Direction} from '../lib/sniper-m1-every-direction';
import {auditM1VisualEvidence} from '../lib/sniper-m1-visual-evidence';
import {freshM1QuoteForWatch} from '../lib/sampled-live-candle';
import {auditPrioritizedM1,grossBreakEvenPct}
  from '../lib/sniper-m1-priority';

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
  const priorityAudit=useMemo(()=>auditPrioritizedM1(p.history,p.now,48),
    [p.history,Math.floor(p.now/60000)]);
  const every=useMemo(()=>everyM1Direction(p.history,p.now),
    [p.history,Math.floor(p.now/60000)]);
  const favored=liveEligible&&every?.anchorTime===plan.candleTime?
    every.side:'WAIT';
  const nowPrice=Number(p.quote?.price);
  const trusted=liveEligible&&p.marketOpen&&!p.providerTransition&&
    freshM1QuoteForWatch(p.quote,p.historicalSource,p.now,plan.issuedAt!);
  // An issued forecast is immutable. Fresh live prices may flag an observed
  // contradiction, but they must not retroactively change its scored side.
  const anchorClose=p.history.find(b=>b.time===plan.candleTime)?.close??null;
  const visual=auditM1VisualEvidence({
    side:favored,pressure:every?.pressure??NaN,weak:every?.weak??true,
    improved:every?.adaptive?.improved??false,
    checked:every?.adaptive?.checked??0,
    checkHits:every?.adaptive?.checkHits??0,
    simpleCheckHits:every?.adaptive?.simpleCheckHits??0,
    quoteTrusted:Boolean(trusted),lastClosedPrice:anchorClose,
    currentPrice:Number.isFinite(nowPrice)?nowPrice:null,atr:plan.atr
  });
  const levels=plan.ready&&plan.buy&&plan.sell?[
    {kind:'TRIGGER' as const,label:visual.showPriorityStar&&favored==='BUY'?'BUY BREAK ★':'BUY BREAK',price:plan.buy.trigger},
    {kind:'TRIGGER' as const,label:visual.showPriorityStar&&favored==='SELL'?'SELL BREAK ★':'SELL BREAK',price:plan.sell.trigger},
    {kind:'TARGET' as const,label:'BUY TP',price:plan.buy.target},
    {kind:'TARGET' as const,label:'SELL TP',price:plan.sell.target},
    {kind:'STOP' as const,label:'BUY SL',price:plan.buy.stop},
    {kind:'STOP' as const,label:'SELL SL',price:plan.sell.stop}
  ]:[];
  // A current quote beyond a limit is NOT proof that a pending order filled.
  const activeHint=trusted?
    nowPrice>=plan.buy!.trigger?'السعر المرصود أعلى BUY BREAK · لا يوجد تنفيذ مؤكد':
    nowPrice<=plan.sell!.trigger?'السعر المرصود أسفل SELL BREAK · لا يوجد تنفيذ مؤكد':
    'السعر بين مستويَي الكسر · انتظار':
    'ننتظر سعرًا حديثًا من نفس مصدر الشموع بعد إنشاء المستويات';
  const details=(name:string,level:CandleHunterLevel)=>(
    <div className={'sniper-m1-hunter-side '+(level.side==='BUY'?'is-buy':'is-sell')}
      key={name}>
      <strong>{name} <small>{referenceOnly?'مستوى منتهي · مرجع فقط':'رصد مشروط لدقيقة واحدة'}</small></strong>
      <div><span>تفعيل</span><b dir="ltr">{fmt(level.trigger)}</b></div>
      <div><span>هدف رصد M1</span><b dir="ltr">{fmt(level.target)}</b></div>
      <small>امتداد مرصود {level.targetSampleSize} كسر سابق
        {level.targetBasis==='CONSERVATIVE_FALLBACK'?' · تقدير احتياطي':''}
        {' · '}عائد/وقف قبل التكلفة {level.grossRewardRisk.toFixed(2)}R
      </small>
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
    <div className="sniper-m1-priority" aria-label="ترجيح قنص الدقيقة على الإغلاقات الحقيقية">
      <strong>{visual.label}</strong>
      <span>{liveEligible&&every?
        'فرضية قبل بداية الشمعة · '+visual.reason+
        ' · الضغط '+every.pressure+'/100 (ليس احتمال نجاح)':display.reason}</span>
      {liveEligible&&every&&<small className="sniper-m1-regime-display">
        حالة الدقيقة: {every.marketRegime==='TREND'?'اتجاه':
          every.marketRegime==='RANGE'?'تذبذب جانبي':
          every.marketRegime==='SQUEEZE'?'انضغاط':
          every.marketRegime==='LOW_ACTIVITY'?'نشاط منخفض':
          every.marketRegime==='MIXED'?'حركة مختلطة':'بيانات غير كافية'}
        {' · '}كفاءة الاتجاه {Math.round(every.regimeEfficiency*100)}%
        {' · '}انضغاط {every.regimeCompression}/100
        {' · '}اختيار النموذج: {every.regimeExpert?.applied?
          'متكيف مع السوق (بحثي)':'قواعد M1 الأساسية'}
      </small>}
      {liveEligible&&every?.dataQuality==='LOW_ACTIVITY'&&
        <small className="sniper-m1-data-warning" role="status">
          حركة M1 ضعيفة للغاية؛ نحتفظ بالتوقع للمراجعة
          لكن لا نعتبره فرصة سكالب مربحة لمجرد اتجاه شمعة صغيرة.
        </small>}
      {liveEligible&&every?.dataQuality==='FLAT_CLUSTER'&&
        <small className="sniper-m1-data-warning" role="status">
          جودة السعر تحتاج مراجعة: {every.flatRecent} شموع مغلقة محايدة من آخر 6.
          التوقع ما زال بحثيًا، لكن لا يُعتمد اتجاه ولا تنفيذ من مصدر غير واضح.
        </small>}
      {liveEligible&&every?.pattern==='PRE_BREAK'&&
        <small className="sniper-m1-prebreak-evidence">
          EARLY SQUEEZE · انضغاط M1 {every.preBreakCompression}/100 ·
          قيعان صاعدة أو قمم هابطة قبل كسر النطاق · يحتاج تحققًا أماميًا.
        </small>}
      {visual.liveConflict&&<small className="sniper-m1-live-conflict">
        تنبيه: حركة التيكات الحالية عكس توقع بداية الدقيقة؛ لا نعيد كتابة التوقع أو نحسب نتيجة قبل الإغلاق.
      </small>}
      {liveEligible&&every?.adaptive&&<small>
        {every.adaptive.trained>0?
          'فحص سببي سابق: تدريب '+every.adaptive.trainHits+'/'+every.adaptive.trained+
          ' · مراجعة لاحقة '+every.adaptive.checkHits+'/'+every.adaptive.checked+
          ' مقابل استمرارية شمعة '+every.adaptive.simpleCheckHits+'/'+every.adaptive.checked:
          'العينة السابقة غير كافية لاختيار نموذج أفضل'}
        {' · '}لا يضمن نجاح الشمعة القادمة أو ربح أي صفقة
      </small>}
      <small>TP هنا امتداد مرجعي قصير داخل M1، مش هدف ربح مؤهل بعد السبريد. BREAK للمراقبة فقط، ومحاولات Limit الورقية منفصلة.</small>
    </div>

    <SniperM1IntrabarPulse forecast={liveEligible?every:null}
      anchorClose={liveEligible?anchorClose:null}
      historicalSource={p.historicalSource} quote={p.quote} now={p.now}
      marketOpen={p.marketOpen} sourceReady={p.sourceReady}
      providerTransition={p.providerTransition}/>
    <SniperMT5M1Chart asset={p.asset} history={p.history}
      historicalSource={p.historicalSource} quote={p.quote} now={p.now}
      marketOpen={p.marketOpen} providerTransition={p.providerTransition}
      levels={levels} referenceOnly={referenceOnly}/>
    <SniperM1CandleTape history={p.history} now={p.now} asset={p.asset}/>
    <details className="sniper-m1-setup-details">
      <summary>{plan.ready?'الدخول والهدف والوقف · عرض المستويات':'تفاصيل شروط القنص'}</summary>
      <p className="sniper-m1-gross-risk">
        أهداف أقرب لمدى الدقيقة، لكن العائد/الوقف الحالي
        {' '}{plan.ready&&plan.buy?plan.buy.grossRewardRisk.toFixed(2)+'R':'غير محسوب'}.
        {plan.ready&&Number.isFinite(grossBreakEvenPct(plan))?
          ' يتطلب تجاوز '+grossBreakEvenPct(plan).toFixed(1)+'% نجاح قبل السبريد والرسوم.':''}
        {' '}دي مستويات مراقبة BREAK وليست Limit منفذ أو صافي ربح، ولو التكلفة أعلى من الحركة يبقى الهدف غير قابل للتداول.
      </p>
    {plan.ready&&plan.buy&&plan.sell?<>
      <div className="sniper-m1-hunter-orders">
        {details('BUY BREAK',plan.buy)}
        {details('SELL BREAK',plan.sell)}
      </div>
      <p className={'sniper-m1-hunter-hint '+(referenceOnly?'is-expired':'')}>
        {referenceOnly?display.reason:activeHint||plan.reason}
      </p>
    </>:<p className="sniper-m1-hunter-hint">{plan.reason} · لا مستويات وهمية</p>}

    </details>
    <details className="sniper-m1-hunter-audit">
      <summary>مقارنة قنص اتجاه واحد بقنص الاتجاهين · فحص تاريخي</summary>
      <p><b>اتجاه واحد:</b> {priorityAudit.prioritized} ترجيح من {priorityAudit.observed} فرصة،
        {' '}لمس هدف {priorityAudit.targetTouches}،
        {' '}بلا تفعيل {priorityAudit.noTrigger}،
        {' '}التباس أو فجوات {priorityAudit.ambiguous+priorityAudit.gapUnknown}،
        {' '}تحرك غير محسوم {priorityAudit.unresolved}،
        {' '}حالات توازن {priorityAudit.balanced}.
        {' '}لا يُحسب اللمس ربحًا، ولا يُعتبر الوقف غير المرصود خسارة صفرية.</p>
      <p><b>الاتجاهان (الأساس السابق):</b></p>
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
