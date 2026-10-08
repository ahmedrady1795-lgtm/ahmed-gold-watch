'use client';
import {Activity,TrendingDown,TrendingUp} from 'lucide-react';
import ScalpDesk from './ScalpDesk';

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
const targetSourceAr=(v:any)=>{
  const x=String(v||'').toLowerCase();
  if(x.includes('movement 15m'))return 'نموذج 15د';
  if(x.includes('hunt 15m'))return 'توافق 15د';
  if(x.includes('path destination'))return 'المسار الهيكلي';
  if(x.includes('order-book')||x.includes('order book'))return 'جدار Order Book';
  if(x.includes('last swing'))return 'Swing حديث';
  if(x.includes('range edge'))return 'حد النطاق';
  if(x.includes('liquidity'))return 'مستوى سيولة';
  if(x.includes('h4'))return 'مستوى H4';
  if(x.includes('intent'))return 'هدف تدفق السوق';
  if(x.includes('30m'))return 'امتداد 30د';
  if(x.includes('atr'))return 'إسقاط ATR';
  if(x.includes('structural'))return 'هيكل سعري';
  return v||'هدف مركب';
};
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

function LegacyAssetCard({x,liveQuote,fast,now=Date.now()}:any){
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
  const liveWavePrice=Number.isFinite(Number(fast?.price))&&Number(fast.price)>0?Number(fast.price):null;
  const price=liveGoldPrice??liveWavePrice??x.livePulse?.price??x.price;
  const move=nextMoveCopy(hunt,x.stateGraph);
  const priceDestination=path?.priceDestination?.zone??path?.priceDestination??path?.destination??zone?.target??null;
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
  const liqOk=Boolean(x?.liquidity?.ok&&now-Number(x?.liquidity?.checkedAt||0)<12000);
  const liquidityLabel=x?.liquidity?.mode==='DOM'?'عمق أوامر الوسيط':x?.liquidity?.mode==='CANDLE_FLOW_PROXY'?'تقدير من الشموع (ليس دفتر أوامر)':'سيولة منصات التداول';
  const hasLiquidity=Boolean(liqOk&&liqBuy+liqSell===100);
  const accumulation=x?.accumulation||null;
  const accumulationPhase=accumulation?.phase==='ACCUMULATING'||accumulation?.phase==='MARKUP_READY'?'تجميع':accumulation?.phase==='DISTRIBUTING'||accumulation?.phase==='MARKDOWN_READY'?'تصريف':'توازن';
  const accumulationScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.accumulationScore||0))));
  const distributionScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.distributionScore||0))));
  const intent=x?.marketMakerIntent||null;
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
  // An unconfirmed destination remains visible as a watch scenario, never a trade entry.
  const watchZone=path?.priceDestination?.zone??path?.priceDestination??null;
  const watchMid=watchZone?.mid!=null?Number(watchZone.mid):watchZone?.low!=null&&watchZone?.high!=null?(Number(watchZone.low)+Number(watchZone.high))/2:null;
  const watchSide=watchZone?.side==='BUY'||watchZone?.side==='SELL'?watchZone.side:'WAIT';
  const watchAhead=watchMid!=null&&Number.isFinite(watchMid)&&watchMid>0&&price!=null&&
    ((watchSide==='BUY'&&watchMid>Number(price))||(watchSide==='SELL'&&watchMid<Number(price)));
  const tradeSetup=forward?.tradeSetup||null;
  const tradeEntry=tradeSetup?.entry!==null&&tradeSetup?.entry!==undefined&&Number.isFinite(Number(tradeSetup.entry))?Number(tradeSetup.entry):null;
  const tradeSl=tradeSetup?.stopLoss!==null&&tradeSetup?.stopLoss!==undefined&&Number.isFinite(Number(tradeSetup.stopLoss))?Number(tradeSetup.stopLoss):null;
  const tradeTp=tradeSetup?.takeProfit!==null&&tradeSetup?.takeProfit!==undefined&&Number.isFinite(Number(tradeSetup.takeProfit))?Number(tradeSetup.takeProfit):null;
  const structure=x?.movementStructure||null;
  const structureText=movementStructureLabel(structure);
  const targets=forward?.targets||null;
  const t1Level=targets?.t1||null,t2Level=targets?.t2||null,t3Level=targets?.t3||null;
  const t1Price=t1Level?.price!=null&&Number.isFinite(Number(t1Level.price))?Number(t1Level.price):forwardTarget;
  const t2Price=t2Level?.price!=null&&Number.isFinite(Number(t2Level.price))?Number(t2Level.price):null;
  const t3Price=t3Level?.price!=null&&Number.isFinite(Number(t3Level.price))?Number(t3Level.price):null;
  const invalidation=targets?.invalidation!=null&&Number.isFinite(Number(targets.invalidation))?Number(targets.invalidation):forward?.invalidation!=null&&Number.isFinite(Number(forward.invalidation))?Number(forward.invalidation):tradeSl;
  const heroSide=forwardSide;
  const liveInvalidated=Boolean(price!=null&&invalidation!=null&&heroSide!=='WAIT'&&(heroSide==='BUY'?Number(price)<=invalidation:Number(price)>=invalidation));
  const hit=(v:number|null)=>Boolean(price!=null&&v!=null&&heroSide!=='WAIT'&&(heroSide==='BUY'?Number(price)>=v:Number(price)<=v));
  const liveT1Hit=hit(t1Price),liveT2Hit=hit(t2Price),liveT3Hit=hit(t3Price);
  const liveState=liveInvalidated?'INVALIDATED':liveT3Hit?'T3_HIT':liveT2Hit?'T2_HIT':liveT1Hit?'T1_HIT':forwardStatus==='IN_PROGRESS'?'ACTIVE':'TRACKING';
  const liveStateAr=liveState==='INVALIDATED'?'القراءة أُلغيت':liveState==='T3_HIT'?'T3 تحقق':liveState==='T2_HIT'?'T2 تحقق':liveState==='T1_HIT'?'T1 تحقق':liveState==='ACTIVE'?'الحركة بدأت':'تتبع لحظي';
  const activeTarget=!liveT1Hit?t1Price:!liveT2Hit?t2Price:!liveT3Hit?t3Price:null;
  const activeLabel=!liveT1Hit?'T1':!liveT2Hit?'T2':!liveT3Hit?'T3':'تمت الأهداف';
  const activeDistancePct=price!=null&&activeTarget!=null&&Number(price)>0?Math.abs(activeTarget-Number(price))/Number(price)*100:null;
  const targetQuality=Math.round(Number(targets?.quality||forward?.targetQuality||0));
  const targetSources=Number(targets?.sourceCount||0);
  const forwardHeadline=heroSide==='WAIT'
    ?'الحركة القادمة: انتظار'
    :liveInvalidated
      ?'القراءة السابقة أُلغيت · إعادة حساب'
      :activeTarget!=null
        ?'الحركة القادمة: '+moveAr(heroSide)+' نحو '+activeLabel+' '+fmt(activeTarget,2)
        :'الحركة اكتملت · انتظار أهداف جديدة';
  return <section className={"panel ai-asset-card compact-asset "+(heroSide==='BUY'?'ai-buy':heroSide==='SELL'?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div>
        <span className="eyebrow">{x.asset==='GOLD'?'XAU/USD':'BTC/USD'} · LIVE</span>
        <h2>{forwardHeadline}</h2>
      </div>
      {heroSide==='BUY'?<TrendingUp/>:heroSide==='SELL'?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row compact-price">
      <div><small>السعر الآن</small><strong>{fmt(price,2)}</strong></div>
      <div><small>الاتجاه القادم</small><strong className={heroSide==='BUY'?'green':heroSide==='SELL'?'red':'amber'}>{moveAr(heroSide)}</strong></div>
      <div><small>ثقة الاتجاه</small><strong>{Math.round(Number(forward?.confidence||0))}%</strong></div>
      <div><small>جودة الأهداف</small><strong>{targetQuality?targetQuality+'%':'—'}</strong></div>
      <div><small>الحالة</small><strong className={liveInvalidated?'red':heroSide==='WAIT'?'amber':'green'}>{liveStateAr}</strong></div>
    </div>
    <div className="forecast-horizons decision-horizons direction-only">
      <div><small>ضغط الشراء</small><strong className="green">{hasLiquidity?liqBuy+'%':'—'}</strong><span>{hasLiquidity?'قراءة سوق متاحة':'البيانات غير مؤكدة'}</span></div>
      <div><small>ضغط البيع</small><strong className="red">{hasLiquidity?liqSell+'%':'—'}</strong><span>{liquidityLabel}</span></div>
      <div><small>مصدر السيولة</small><strong>{liqOk?'متاح':'غير مؤكد'}</strong><span>{x?.liquidity?.source||'لا يوجد مصدر مؤكد'}</span></div>
    </div>

    <div className="next-move-copy primary-move zone-primary">
      <span>الحركة القادمة · أهداف أمامية متدرجة</span>
      <strong className={heroSide==='BUY'?'green':heroSide==='SELL'?'red':'amber'}>
        {heroSide==='WAIT'
          ?'لا يوجد اتجاه صالح الآن'
          :activeTarget!=null
            ?moveAr(heroSide)+' → '+activeLabel+' '+fmt(activeTarget,2)+(activeDistancePct!=null?' · يبعد '+activeDistancePct.toFixed(3)+'%':'')
            :'تم استهلاك سلم الأهداف الحالي'}
      </strong>

      <div className="forecast-scenario-strip">
        {heroSide==='WAIT'&&watchAhead&&<div className="scenario-wide">
          <small>منطقة مراقبة فقط · ليست إشارة دخول أو هدفًا مؤكدًا</small>
          <b dir="ltr">{moveAr(watchSide)} → {fmt(watchMid,2)}</b>
          <span>{watchZone?.projected?'إسقاط احتمالي من التذبذب':'منطقة سعرية مرجحة'} · تنتظر تأكيد M1 و M5 والسيولة قبل أي توصية</span>
        </div>}
        <div><small>T1 · الهدف الأول</small><b dir="ltr">{t1Price!=null?fmt(t1Price,2):'—'}</b><span>{liveT1Hit?'تحقق':targetSourceAr(t1Level?.source)+(t1Level?.quality?' · جودة '+Math.round(Number(t1Level.quality))+'%':'')}</span></div>
        <div><small>T2 · الهدف التالي</small><b dir="ltr">{t2Price!=null?fmt(t2Price,2):'—'}</b><span>{liveT2Hit?'تحقق':targetSourceAr(t2Level?.source)+(t2Level?.quality?' · جودة '+Math.round(Number(t2Level.quality))+'%':'')}</span></div>
        <div><small>T3 · الامتداد</small><b dir="ltr">{t3Price!=null?fmt(t3Price,2):'—'}</b><span>{liveT3Hit?'تحقق':targetSourceAr(t3Level?.source)+(t3Level?.quality?' · جودة '+Math.round(Number(t3Level.quality))+'%':'')}</span></div>
        <div><small>إبطال القراءة</small><b dir="ltr">{invalidation!=null?fmt(invalidation,2):'—'}</b><span>{liveInvalidated?'تم الكسر':'صالح'}</span></div>

        <div className="scenario-wide"><small>سبب اختيار الأهداف</small>
          <b>{targets?.reason||forward?.reason||'انتظار مستويات أمامية أوضح'}</b>
          <span>{targets?.mode==='STRUCTURAL'?'أهداف هيكلية بالكامل':targets?.mode==='MIXED'?'مزيج مستويات حقيقية + إسقاط احتياطي':targets?.mode==='PROJECTED'?'إسقاط مؤقت لحين ظهور مستويات حقيقية':targetSources?'توافق '+targetSources+' مصادر سعرية/هيكلية':'قراءة مركبة من السوق'}</span>
        </div>

        <div className="scenario-wide"><small>تأكيد الاتجاه</small>
          <b>H4 {moveAr(forward?.confirmations?.h4)} · M15 {moveAr(forward?.confirmations?.m15)} · M5 {moveAr(forward?.confirmations?.m5)}</b>
          <span>هيكل {moveAr(forward?.confirmations?.structure)} · سيولة {moveAr(forward?.confirmations?.liquidity)} · مصادر السوق {moveAr(forward?.confirmations?.toolMesh)}</span>
        </div>

        {tradeSetup&&tradeEntry!=null&&<div className="scenario-wide"><small>التفعيل فقط عند اكتمال الشروط</small>
          <b dir="ltr">{fmt(tradeEntry,2)}</b>
          <span>{tradeSetup.trigger||'—'}{Number.isFinite(Number(tradeSetup.rr))?' · R:R '+Number(tradeSetup.rr).toFixed(2):''}</span>
        </div>}
      </div>

      <div className="forecast-horizons decision-horizons direction-only">
        <div><small>دقة 15د</small><strong>{showValidation15?validationAccuracy.toFixed(1)+'%':'—'}</strong><span>{showValidation15?validationDirectional+' نتيجة':'جمع عينات'}</span></div>
        <div><small>نافذة القراءة</small><strong>{forwardWindow}</strong><span>تتحدث تلقائيًا</span></div>
        <div><small>توافق القرار</small><strong>{Math.round(Number(forward?.agreement||0))}%</strong><span>{Math.round(Number(forward?.support||0))} مصادر مؤيدة</span></div>
      </div>
    </div>
  </section>;
}

function AssetCard(props:any){
  if(!props.x?.scalpDesk)return <LegacyAssetCard {...props}/>;
  return <ScalpDesk desk={props.x.scalpDesk} now={props.now}><LegacyAssetCard {...props}/></ScalpDesk>;
}

export default function AICommandCenter({data,error,fastWave,goldLive,now=Date.now()}:any){
  const snapshotAgeMs=data?.snapshot?Math.max(0,now-Number(data.snapshot.servedAt||now)+Number(data.snapshot.ageMs||0)):null;
  const auto=data?.autopilot,next=auto?.nextEvent;
  const nextEventDelta=Number(next?.time)-now;
  const awaitingActual=Boolean(next?.awaitingActual||next?.status==='AWAITING_ACTUAL');
  const narrativeLive=Boolean(next?.status==='TEXT_EVENT_LIVE'||next?.eventType==='NARRATIVE'&&nextEventDelta<0);
  const showNextEvent=!!next&&Number.isFinite(nextEventDelta)&&((nextEventDelta>=0&&nextEventDelta<=10*60*60*1000)||(awaitingActual&&nextEventDelta>=-30*60*1000)||(narrativeLive&&nextEventDelta>=-8*60*1000));
  return <div className="ai-clean">
    {error&&!data&&<div className="fatal"><Activity size={18}/><div><strong>تعذر تحديث AI</strong><span>{error}</span></div></div>}
    {snapshotAgeMs!=null&&snapshotAgeMs>30000&&<div className="fatal"><Activity size={18}/><div><strong>التحليل متأخر</strong><span>آخر لقطة عمرها {Math.round(snapshotAgeMs/1000)} ثانية · لا تعتمد على أي توصية حتى تتجدد</span></div></div>}

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

    <div className="dashboardgrid"><AssetCard now={now} x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard now={now} x={data?.gold} fast={fastWave?.gold} liveQuote={goldLive}/></div>
  </div>;
}
