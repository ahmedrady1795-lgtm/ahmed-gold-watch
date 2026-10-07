'use client';
import {Activity,TrendingDown,TrendingUp} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const calibrated=(v:any)=>Math.min(92,Math.max(0,Math.round(Number(v)||0)));
const timeLeft=(ts:any,now:number)=>{
  const d=Number(ts)-now;if(!Number.isFinite(d))return '';
  if(d<=0)return 'الآن';
  const totalSeconds=Math.ceil(d/1000),m=Math.floor(totalSeconds/60),s=totalSeconds%60,h=Math.floor(m/60),mm=m%60;
  return h>0?`متبقي ${h}س ${mm}د`:(m>0?`متبقي ${m}د ${s}ث`:`متبقي ${s}ث`);
};
const moveAr=(s:any)=>s==='BUY'?'صعود':s==='SELL'?'هبوط':'تذبذب';
const zoneRange=(z:any)=>z&&Number.isFinite(Number(z.low))&&Number.isFinite(Number(z.high))?`${fmt(z.low,2)}–${fmt(z.high,2)}`:'—';
const zoneName=(z:any)=>String(z?.kind||'').includes('DEMAND')||z?.side==='BUY'?'دعم/طلب':String(z?.kind||'').includes('SUPPLY')||z?.side==='SELL'?'مقاومة/عرض':'منطقة';
const phaseAr=(p:any)=>p==='ACCUMULATING'?'تجميع':p==='DISTRIBUTING'?'تصريف':p==='MARKUP_READY'?'تجميع جاهز للصعود':p==='MARKDOWN_READY'?'تصريف جاهز للهبوط':'توازن';
const structurePhaseAr=(p:any)=>p==='BREAKOUT'?'اختراق':p==='RETEST'?'إعادة اختبار':p==='SWEEP_REVERSAL'?'سحب سيولة وانعكاس':p==='IMPULSE'?'اندفاع':p==='PULLBACK'?'تصحيح':p==='EXHAUSTION'?'إجهاد الحركة':p==='COMPRESSION'?'ضغط وتجميع':p==='TREND'?'اتجاه مستمر':'انتقال';
const movementStructureLabel=(s:any)=>{
  if(!s?.ok)return 'غير مكتمل';
  const m=s.m1||s.m5||{};
  const next=m.nextSide||s.shortSide||s.side||'WAIT';
  const sideTxt=next==='BUY'?'صاعد':next==='SELL'?'هابط':'متوازن';
  if(s.path==='RISE_THEN_DROP')return 'صعود ثم هبوط';
  if(s.path==='DROP_THEN_RISE')return 'هبوط ثم صعود';
  return `${structurePhaseAr(m.phase)} ${sideTxt}`;
};
const structurePatternAr=(v:any)=>{
  const x=String(v||'').toUpperCase().trim();
  if(x==='HH + HL')return 'قمم أعلى + قيعان أعلى';
  if(x==='LH + LL')return 'قمم أدنى + قيعان أدنى';
  if(x==='EXPANDING RANGE')return 'نطاق متسع';
  if(x==='COMPRESSION / RANGE')return 'ضغط داخل نطاق';
  if(x==='MIXED')return 'هيكل مختلط';
  return x?'هيكل متغير':'—';
};
const intentPhaseAr=(p:any)=>p==='LIQUIDITY_BUILDUP'?'تجميع سيولة':p==='SWEEP_DETECTED'?'سحب سيولة':p==='TRAP_CONFIRMED'?'فخ سيولة مؤكد':p==='PRE_EXPANSION'?'استعداد قبل الحركة':p==='EXPANSION'?'الحركة بدأت':'لا يوجد سيناريو واضح';
const momentumPhaseAr=(p:any)=>p==='BUILDING'?'يتكوّن قبل الحركة':p==='ACTIVE'?'نشط':p==='EXHAUSTING'?'منهك':p==='WEAK'?'ضعيف':'محايد';
const mVolumePhaseAr=(p:any)=>p==='BUILDING'?'حجم يتزايد قبل الحركة':p==='CONFIRMING'?'الحجم يؤكد الحركة':p==='ABSORBING'?'امتصاص حجم':p==='DIVERGENCE'?'اختلاف سعر/حجم':p==='CLIMAX'?'Volume Climax':'حجم هادئ';
const intentStepAr=(v:any)=>{
  const x=String(v||'');
  if(x==='COMPRESSION')return 'ضغط';
  if(x==='LOWER_LIQUIDITY_SWEEP')return 'سحب سيولة أسفل';
  if(x==='UPPER_LIQUIDITY_SWEEP')return 'سحب سيولة أعلى';
  if(x==='RECLAIM')return 'استعادة المستوى';
  if(x==='ABSORPTION')return 'امتصاص';
  if(x==='INSTITUTIONAL_ZONE')return 'منطقة مؤسسية';
  if(x==='PRE_EXPANSION')return 'استعداد للاندفاع';
  if(x==='EXPANSION')return 'اندفاع';
  return '';
};
function nextMoveCopy(hunt:any,stateGraph:any){
  if(!hunt&&!stateGraph)return {title:'لا توجد حركة مؤكدة حاليًا',detail:'النواة تنتظر بيانات أو توافقًا أوضح قبل ترجيح الحركة القادمة.',tone:'amber'};
  const understanding=hunt?.marketUnderstanding;
  const first=understanding?.firstMove?.side||hunt?.nextMove?.side||hunt?.path?.shortSide||stateGraph?.nextSide||'WAIT';
  const follow=understanding?.followMove?.side||hunt?.path?.followSide||'WAIT';
  const pathLabel=String(hunt?.path?.label||'').trim();
  const firstHit=Number(hunt?.nextMove?.firstHitMinutes);
  const confidence=calibrated(understanding?.firstMove?.confidence??hunt?.nextMove?.confidence??hunt?.quality??stateGraph?.nextSideProbability??0);
  const title=String(understanding?.summary||'').trim()||pathLabel||(
    first==='BUY'?'الحركة القادمة المرجحة: صعود':
    first==='SELL'?'الحركة القادمة المرجحة: هبوط':
    'الحركة القادمة المرجحة: تذبذب وانتظار اتجاه أوضح'
  );
  const h1=hunt?.horizons?.oneMinute?.side||hunt?.horizons?.twoMinute?.side||'WAIT',h5=hunt?.horizons?.fiveMinute?.side||'WAIT',h15=hunt?.horizons?.fifteenMinute?.side||'WAIT',h30=hunt?.horizons?.thirtyMinute?.side||'WAIT';
  const timing=Number.isFinite(firstHit)&&firstHit>0?'، وأول حركة معتبرة متوقعة خلال نحو '+firstHit.toFixed(1)+' دقيقة':'';
  const phase=understanding?.mode?(' · فهم السوق: '+String(understanding.mode).replaceAll('_',' ')):'';
  const detail='أول حركة '+moveAr(first)+' بثقة '+confidence+'%'+timing+'. 1د: '+moveAr(h1)+' · 5د: '+moveAr(h5)+' · 15د: '+moveAr(h15)+' · 30د: '+moveAr(h30)+phase+'.';
  return {title,detail,tone:first==='BUY'?'green':first==='SELL'?'red':'amber'};
}

function AssetCard({x,liveQuote,fast}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const hunt=x.huntForecast,recommendation=x.recommendation,goldCore=x.asset==='GOLD'?x.goldForecastCore:null,predator=x.asset==='GOLD'?x.predatorFusionV2:null;
  const core1=goldCore?.horizons?.oneMinute,core5=goldCore?.horizons?.fiveMinute;
  const h1=core1||hunt?.horizons?.oneMinute||hunt?.horizons?.twoMinute||{};
  const h5=core5||hunt?.horizons?.fiveMinute||{};
  const h15=hunt?.horizons?.fifteenMinute||{};
  const t1=hunt?.quickSignalTargets?.oneMinute||null;
  const t5=hunt?.quickSignalTargets?.fiveMinute||null;
  const t15=hunt?.quickSignalTargets?.fifteenMinute||hunt?.fifteenMinuteTarget||null;
  const horizonTarget=(t:any,side:any)=>(t?.side===side&&Number.isFinite(Number(t?.price)))?fmt(Number(t.price),2):'—';
  const zone=hunt?.zoneForecast||null;
  const path=zone?.pathForecast||null;
  const forecastSide=path?.side&&path.side!=='WAIT'
    ?String(path.side)
    :path?.priceDestination?.side&&path.priceDestination.side!=='WAIT'
      ?String(path.priceDestination.side)
      :zone?String(zone.side||'WAIT')
      :(goldCore?.side||hunt?.nextMove?.side||hunt?.marketUnderstanding?.firstMove?.side||'WAIT');
  const displaySide=forecastSide;
  const softDestination=Boolean(path?.side==='WAIT'&&path?.priceDestination?.zone);
  const buy=displaySide==='BUY'&&!softDestination,sell=displaySide==='SELL'&&!softDestination;
  const liveGoldPrice=x.asset==='GOLD'&&liveQuote?.ok&&Number.isFinite(Number(liveQuote?.price))&&Number(liveQuote.price)>0?Number(liveQuote.price):null;
  const price=liveGoldPrice??x.livePulse?.price??x.price;
  const move=nextMoveCopy(hunt,x.stateGraph);
  const priceDestination=path?.priceDestination?.zone??path?.destination??zone?.target??null;
  const structuralTarget=priceDestination?.mid??null;
  const target=structuralTarget??recommendation?.targets?.scalp??recommendation?.targets?.oneMinute??hunt?.quickSignalTargets?.oneMinute?.price??null;
  const invalid=path?.invalidation?.price??recommendation?.invalidation??hunt?.invalidation??null;
  const conf=path?.side&&path.side!=='WAIT'
    ?calibrated(path.confidence)
    :path?.priceDestination
      ?calibrated(path.priceDestination.confidence)
      :calibrated(goldCore?.confidence??hunt?.nextMove?.confidence??hunt?.confidence??0);
  const waveLeadView=fast?.ok?{
    available:true,armed:false,side:fast.side||'WAIT',
    stage:fast.stage==='IGNITION'||fast.stage==='WAVE_FORMING'?'RELEASED':fast.stage==='PRE_TRIGGER'||fast.stage==='COILED'?'BUILDING':'OBSERVE',
    mode:'MICRO_FLOW',
    score:Number(fast.score||0),confidence:Number(fast.confidence||0),stability:Number(fast.persistence||0),
    source:x.asset==='GOLD'?'Biquote live WebSocket micro-flow':'Coinbase live WebSocket micro-flow',
    reason:Array.isArray(fast.reasons)&&fast.reasons.length?fast.reasons.slice(0,3).join(' · '):'قراءة micro-flow لحظية من التسارع والسبريد وتتابع الـticks.',
    metrics:{bookImbalance:Number(fast.imbalance||0),pressureChange:0,replenishDelta:0,acceleration:Number(fast.acceleration||0),persistence:Number(fast.persistence||0)}
  }:null;
  const forward=x.forwardMove||null;
  const forwardSide=forward?.side==='BUY'||forward?.side==='SELL'?forward.side:'WAIT';
  const forwardZone=forward?.zone||null;
  const forwardTarget=forward?.target!==null&&forward?.target!==undefined&&Number.isFinite(Number(forward.target))?Number(forward.target):null;
  const forwardWindow=forward?.horizonMinutes===15?'خلال 15 دقيقة':forward?.windowSeconds?(`${Math.max(1,Math.round(Number(forward.windowSeconds.min||0)/60))}–${Math.max(1,Math.round(Number(forward.windowSeconds.max||0)/60))} د`):'—';
  const liqBuy=Math.max(0,Math.min(100,Math.round(Number(x?.liquidity?.buy||0))));
  const liqSell=Math.max(0,Math.min(100,Math.round(Number(x?.liquidity?.sell||0))));
  const hasLiquidity=Boolean(liqBuy||liqSell);
  const accumulation=x?.accumulation||null;
  const accumulationPhase=accumulation?.phase==='ACCUMULATING'||accumulation?.phase==='MARKUP_READY'?'تجميع':accumulation?.phase==='DISTRIBUTING'||accumulation?.phase==='MARKDOWN_READY'?'تصريف':'توازن';
  const accumulationScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.accumulationScore||0))));
  const distributionScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.distributionScore||0))));
  const intent=x?.marketMakerIntent||null;
  const momentum=x?.momentumEngine||null;
  const momentumTargets=momentum?.targets||null;
  const momentumT1=momentumTargets?.target1!=null&&Number.isFinite(Number(momentumTargets.target1))?Number(momentumTargets.target1):null;
  const momentumT2=momentumTargets?.target2!=null&&Number.isFinite(Number(momentumTargets.target2))?Number(momentumTargets.target2):null;
  const momentumInvalidation=momentumTargets?.invalidation!=null&&Number.isFinite(Number(momentumTargets.invalidation))?Number(momentumTargets.invalidation):null;
  const momentumSide=momentum?.side==='BUY'||momentum?.side==='SELL'?momentum.side:'WAIT';
  const intentSide=intent?.side==='BUY'||intent?.side==='SELL'?intent.side:'WAIT';
  const intentSteps=Array.isArray(intent?.sequence)?intent.sequence.map(intentStepAr).filter(Boolean).join(' → '):'';
  const intentSweep=intent?.sweepLevel!==null&&intent?.sweepLevel!==undefined&&Number.isFinite(Number(intent.sweepLevel))?fmt(Number(intent.sweepLevel),2):null;
  const validation15=x?.forecastValidation15m||null;
  const validationDirectional=Number(validation15?.global?.hits||0)+Number(validation15?.global?.fails||0);
  const validationAccuracy=Number(validation15?.global?.accuracy);
  const showValidation15=validationDirectional>=5&&Number.isFinite(validationAccuracy);
  const upperLiquidity=path?.upperLiquidity||zone?.resistance||null;
  const lowerLiquidity=path?.lowerLiquidity||zone?.support||null;
  const liquidityPoint=(z:any)=>{
    if(!z)return '—';
    const mid=Number(z?.mid);
    if(Number.isFinite(mid))return fmt(mid,2);
    const low=Number(z?.low),high=Number(z?.high);
    if(Number.isFinite(low)&&Number.isFinite(high))return fmt((low+high)/2,2);
    return '—';
  };
  const upperLiquidityLevel=liquidityPoint(upperLiquidity);
  const lowerLiquidityLevel=liquidityPoint(lowerLiquidity);
  const forwardStatus=String(forward?.status||'WAIT');
  const tradeSetup=forward?.tradeSetup||null;
  const tradeEntry=tradeSetup?.entry!==null&&tradeSetup?.entry!==undefined&&Number.isFinite(Number(tradeSetup.entry))?Number(tradeSetup.entry):null;
  const tradeSl=tradeSetup?.stopLoss!==null&&tradeSetup?.stopLoss!==undefined&&Number.isFinite(Number(tradeSetup.stopLoss))?Number(tradeSetup.stopLoss):null;
  const tradeTp=tradeSetup?.takeProfit!==null&&tradeSetup?.takeProfit!==undefined&&Number.isFinite(Number(tradeSetup.takeProfit))?Number(tradeSetup.takeProfit):null;
  const structure=x?.movementStructure||null;
  const structureText=movementStructureLabel(structure);
  const forwardHeadline=forwardSide==='WAIT'
    ?'انتظار قراءة أمامية أوضح'
    :forwardStatus==='PRE_MOVE'
      ?`قبل الحركة خلال 15د: ${moveAr(forwardSide)}`
      :forwardStatus==='CONDITIONAL_ENTRY'
        ?`صفقة مشروطة 15د: ${moveAr(forwardSide)}`
      :forwardStatus==='BUILDING'
        ?`ترجيح 15د يتكوّن: ${moveAr(forwardSide)}`
        :forwardStatus==='IN_PROGRESS'
          ?`حركة 15د بدأت: ${moveAr(forwardSide)} نحو الهدف`
          :`الحركة القادمة خلال 15د: ${moveAr(forwardSide)}`;
  return <section className={"panel ai-asset-card compact-asset "+(buy?'ai-buy':sell?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div><span className="eyebrow">{x.asset==='GOLD'?'XAU/USD':'BTC/USD'}</span><h2>{forwardHeadline}</h2></div>
      {forwardSide==='BUY'?<TrendingUp/>:forwardSide==='SELL'?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row compact-price">
      <div><small>السعر الآن</small><strong>{fmt(price,2)}</strong></div>
      <div><small>ثقة القراءة المبكرة</small><strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>{forward?.confidence?Math.round(Number(forward.confidence))+'%':'—'}</strong></div>
      <div><small>التحرك المتوقع</small><strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>{moveAr(forwardSide)}</strong></div>
    </div>

    <div className="next-move-copy primary-move zone-primary">
      <span>الحركة القادمة · قراءة H4 → توقع 15 دقيقة</span>
      <strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>
        {forwardSide==='WAIT'
          ?'لا يوجد اتجاه أمامي واضح'
          :forwardStatus==='CONDITIONAL_ENTRY'&&tradeEntry!=null
            ?`${moveAr(forwardSide)} مشروط فوق/تحت ${fmt(tradeEntry,2)} → ${tradeTp!=null?fmt(tradeTp,2):forwardTarget!=null?fmt(forwardTarget,2):'—'} · ${Math.round(Number(forward.confidence||0))}%`
            :`${moveAr(forwardSide)} → ${forwardZone?zoneRange(forwardZone):forwardTarget!=null?fmt(forwardTarget,2):'—'} · ${Math.round(Number(forward.confidence||0))}%`}
      </strong>
      <div className="forecast-scenario-strip">
        <div><small>الوجهة</small><b>{forwardZone?zoneRange(forwardZone):forwardTarget!=null?fmt(forwardTarget,2):priceDestination?zoneRange(priceDestination):'—'}</b></div>
        <div><small>نافذة التحرك</small><b>{forwardSide!=='WAIT'?forwardWindow:'—'}</b></div>
        <div><small>الارتداد</small><b dir="ltr">{zoneRange(path?.reboundZone||zone?.origin)}</b></div>
        <div className="scenario-wide"><small>نسبة السيولة</small><b className="green">{hasLiquidity?`صعود ${liqBuy}%`:'—'}</b><b className="red">{hasLiquidity?`هبوط ${liqSell}%`:'—'}</b><span>{accumulationPhase}{accumulationPhase==='تجميع'&&accumulationScore?` · ${accumulationScore}%`:accumulationPhase==='تصريف'&&distributionScore?` · ${distributionScore}%`:''}</span></div>
        <div className="scenario-wide"><small>مستويات السيولة</small>
          <b>{upperLiquidityLevel!=='—'?<>سيولة أعلى عند <span dir="ltr">{upperLiquidityLevel}</span></>:'لا توجد سيولة علوية واضحة'}</b>
          <span>{lowerLiquidityLevel!=='—'?<>سيولة أسفل عند <span dir="ltr">{lowerLiquidityLevel}</span></>:'لا توجد سيولة سفلية واضحة'}</span>
        </div>
        <div className="scenario-wide"><small>قراءة صانع السوق</small>
          <b className={intentSide==='BUY'?'green':intentSide==='SELL'?'red':'amber'}>{intent?(intentPhaseAr(intent.phase)+' · '+moveAr(intentSide)+' · '+Math.round(Number(intent.confidence||0))+'%'):'—'}</b>
          <span>{intentSteps||'لا يوجد تسلسل سيولة مكتمل'}{intentSweep?<> · مستوى السحب <span dir="ltr">{intentSweep}</span></>:null}</span>
          {showValidation15&&<span>اختبار حي 15د · دقة {validationAccuracy.toFixed(1)}% · {validationDirectional} نتيجة</span>}
        </div>
        <div className="scenario-wide"><small>نظام المومنتم</small>
          <b className={momentumSide==='BUY'?'green':momentumSide==='SELL'?'red':'amber'}>
            {momentum?(moveAr(momentumSide)+' · '+momentumPhaseAr(momentum.phase)+' · '+Math.round(Number(momentum.confidence||0))+'%'):'—'}
          </b>
          <span>
            ثبات {Math.round(Number(momentum?.stability||0))}% · تسارع {Math.round(Number(momentum?.acceleration||0))}% · استمرار {Math.round(Number(momentum?.persistence||0))}% · اتساع {Math.round(Number(momentum?.expansion||0))}%
          </span>
          {momentum?.flipPending&&<span className="amber">انعكاس مومنتم تحت الاختبار · لن يتم قلب الاتجاه قبل التأكيد</span>}
          {momentum?.mVolume&&<span>
            M-Volume · <b className={momentum.mVolume.side==='BUY'?'green':momentum.mVolume.side==='SELL'?'red':'amber'}>{moveAr(momentum.mVolume.side)}</b>
            {' · '}{mVolumePhaseAr(momentum.mVolume.phase)} · ثقة {Math.round(Number(momentum.mVolume.confidence||0))}% · قوة {Math.round(Number(momentum.mVolume.score||0))}%
          </span>}
          {momentum?.mVolume&&<span>
            RVOL {Number(momentum.mVolume.relativeVolume||0).toFixed(2)}x · Follow-through {Math.round(Number(momentum.mVolume.followThrough||0))}% · Effort/Result {Math.round(Number(momentum.mVolume.effortResult||0))}%
          </span>}
          {momentum?.mVolume&&Number(momentum.mVolume.divergence||0)>=45&&<span className="amber">
            Divergence سعر/حجم {Math.round(Number(momentum.mVolume.divergence||0))}% · الإشارة تحتاج حذر
          </span>}
          {(momentumT1!=null||momentumT2!=null)&&<span className="momentum-targets">
            هدف 1 <b dir="ltr">{momentumT1!=null?fmt(momentumT1,2):'—'}</b> · هدف 2 <b dir="ltr">{momentumT2!=null?fmt(momentumT2,2):'—'}</b>
          </span>}
          {momentumInvalidation!=null&&<span>إلغاء المومنتم <b dir="ltr">{fmt(momentumInvalidation,2)}</b> · أفق {Math.round(Number(momentumTargets?.horizonMinutes||15))}د</span>}
          {momentum?.mVolume&&Number(momentum.mVolume.absorption||0)>=55&&<span>امتصاص {Math.round(Number(momentum.mVolume.absorption||0))}%</span>}
          {Number(momentum?.exhaustion||0)>=55&&<span>إنهاك {Math.round(Number(momentum.exhaustion||0))}%</span>}
        </div>
        <div className="scenario-wide"><small>هيكل الحركة</small><b>{structureText}</b><span>{structurePatternAr(structure?.m1?.structure||structure?.m5?.structure)}</span></div>
      </div>
      {tradeSetup&&tradeEntry!=null&&tradeTp!=null&&<div className="forecast-scenario-strip trade-setup-strip">
        <div><small>{tradeSetup.mode==='CONDITIONAL'?'دخول مشروط':'الدخول'}</small><b dir="ltr">{fmt(tradeEntry,2)}</b></div>
        <div><small>وقف الخسارة</small><b dir="ltr">{tradeSl!=null?fmt(tradeSl,2):'—'}</b></div>
        <div><small>الهدف</small><b dir="ltr">{fmt(tradeTp,2)}</b></div>
        <div><small>التفعيل</small><b>{tradeSetup.trigger||'—'}</b>{Number.isFinite(Number(tradeSetup.rr))&&<span>R:R {Number(tradeSetup.rr).toFixed(2)}</span>}</div>
      </div>}
      {forward?.reason&&<small className="muted">{forward.reason}</small>}
    </div>

    <div className="forecast-horizons decision-horizons direction-only">
      <div><small>اتجاه M1</small><strong className={h1.side==='BUY'?'green':h1.side==='SELL'?'red':'amber'}>{moveAr(h1.side)}</strong><span>{calibrated(h1.confidence??h1.strength)}% · هدف <b dir="ltr">{horizonTarget(t1,h1.side)}</b></span></div>
      <div><small>اتجاه M5</small><strong className={h5.side==='BUY'?'green':h5.side==='SELL'?'red':'amber'}>{moveAr(h5.side)}</strong><span>{calibrated(h5.confidence??h5.strength)}% · هدف <b dir="ltr">{horizonTarget(t5,h5.side)}</b></span></div>
      <div><small>اتجاه M15</small><strong className={h15.side==='BUY'?'green':h15.side==='SELL'?'red':'amber'}>{moveAr(h15.side)}</strong><span>{calibrated(h15.confidence??h15.strength)}% · هدف <b dir="ltr">{horizonTarget(t15,h15.side)}</b></span></div>
    </div>


  </section>;
}

export default function AICommandCenter({data,error,fastWave,goldLive,now=Date.now()}:any){
  const auto=data?.autopilot,next=auto?.nextEvent;
  const nextEventDelta=Number(next?.time)-now;
  const awaitingActual=Boolean(next?.awaitingActual||next?.status==='AWAITING_ACTUAL');
  const narrativeLive=Boolean(next?.status==='TEXT_EVENT_LIVE'||next?.eventType==='NARRATIVE'&&nextEventDelta<0);
  const showNextEvent=!!next&&Number.isFinite(nextEventDelta)&&((nextEventDelta>=0&&nextEventDelta<=10*60*60*1000)||(awaitingActual&&nextEventDelta>=-30*60*1000)||(narrativeLive&&nextEventDelta>=-8*60*1000));
  return <div className="ai-clean">
    {error&&!data&&<div className="fatal"><Activity size={18}/><div><strong>تعذر تحديث AI</strong><span>{error}</span></div></div>}

    {showNextEvent&&<section className="next-news news-impact-card">
      <div className="news-head">
        <div className="news-title-wrap">
          <small>{awaitingActual?'بانتظار نتيجة الخبر':narrativeLive?'تصريحات جارية':'الخبر القادم'}</small>
          <strong>{next.name}</strong>
          <em>تأثيره المتوقع على السوق</em>
        </div>
        <span className="news-countdown">{awaitingActual?`متأخر ${Math.max(1,Math.floor(Math.abs(nextEventDelta)/60000))}د · بانتظار النتيجة`:narrativeLive?`بدأ منذ ${Math.max(1,Math.floor(Math.abs(nextEventDelta)/60000))}د · متابعة التأثير`:timeLeft(next.time,now)}</span>
      </div>

      {(next.forecast||next.previous||next.actual)&&<div className="news-values ordered">
        {next.previous&&<span>السابق <b>{next.previous}</b></span>}
        {next.forecast&&<span>المتوقع <b>{next.forecast}</b></span>}
        {next.actual&&<span className="actual">الفعلي <b>{next.actual}</b></span>}
      </div>}

      <div className="news-impact-grid ordered">
        {[
          {label:'GOLD',name:'الذهب',impact:next.goldImpact},
          {label:'BTC',name:'البتكوين',impact:next.btcImpact}
        ].map(({label,name,impact}:any)=>{
          const s=String(impact?.side||'WAIT');
          const released=!awaitingActual&&Boolean(next?.actual)&&String(impact?.phase||'')!=='PRE_EVENT';
          const confidence=Math.round(Number(impact?.confidence||0));
          const risk=Math.round(Number(impact?.risk||0));
          const up=Math.max(0,Math.min(100,Math.round(Number(impact?.upProbability??50))));
          const down=Math.max(0,Math.min(100,Math.round(Number(impact?.downProbability??(100-up)))));
          const direction=s==='BUY'?'↑ صعود':s==='SELL'?'↓ هبوط':released?'↔ محايد':narrativeLive?'↔ التأثير قيد القراءة':awaitingActual?'⏳ بانتظار النتيجة':'↔ غير محسوم';
          return <div className="news-impact ordered-impact" key={label}>
            <div className="impact-top">
              <small>{label}</small>
              <b>{name}</b>
            </div>
            <strong className={s==='BUY'?'green':s==='SELL'?'red':'amber'}>
              {direction}{confidence>0?` · ${confidence}%`:''}
            </strong>
            <div className="impact-meta">
              <span>{released?'تأثير فعلي':narrativeLive?'قراءة اللهجة ورد فعل السوق':awaitingActual?'التأثير المتوقع · بانتظار النتيجة':'الترجيح قبل الخبر'}</span>
              <em>خطورة {risk}%</em>
            </div>
            <div className="news-values ordered">
              <span>صعود <b className="green">{up}%</b></span>
              <span>هبوط <b className="red">{down}%</b></span>
            </div>
            <p>{impact?.reason||(next?.eventType==='NARRATIVE'?'لا توجد نتيجة رقمية لهذا الحدث؛ يتم تقييم التصريحات والسعر والسيولة.':'سيتم تحديد الاتجاه بعد صدور البيانات ومقارنة الفعلي بالمتوقع.')}</p>
          </div>;
        })}
      </div>
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold} liveQuote={goldLive}/></div>
  </div>;
}
