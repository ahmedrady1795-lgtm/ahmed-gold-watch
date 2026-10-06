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
  const forwardTarget=Number.isFinite(Number(forward?.target))?Number(forward.target):null;
  const forwardWindow=forward?.horizonMinutes===15?'خلال 15 دقيقة':forward?.windowSeconds?(`${Math.max(1,Math.round(Number(forward.windowSeconds.min||0)/60))}–${Math.max(1,Math.round(Number(forward.windowSeconds.max||0)/60))} د`):'—';
  const liqBuy=Math.max(0,Math.min(100,Math.round(Number(x?.liquidity?.buy||0))));
  const liqSell=Math.max(0,Math.min(100,Math.round(Number(x?.liquidity?.sell||0))));
  const hasLiquidity=Boolean(liqBuy||liqSell);
  const accumulation=x?.accumulation||null;
  const accumulationPhase=accumulation?.phase==='ACCUMULATING'||accumulation?.phase==='MARKUP_READY'?'تجميع':accumulation?.phase==='DISTRIBUTING'||accumulation?.phase==='MARKDOWN_READY'?'تصريف':'توازن';
  const accumulationScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.accumulationScore||0))));
  const distributionScore=Math.max(0,Math.min(100,Math.round(Number(accumulation?.distributionScore||0))));
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
  const structure=x?.movementStructure||null;
  const structureText=movementStructureLabel(structure);
  const forwardHeadline=forwardSide==='WAIT'
    ?'انتظار قراءة أمامية أوضح'
    :forwardStatus==='PRE_MOVE'
      ?`قبل الحركة خلال 15د: ${moveAr(forwardSide)}`
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
          :`${moveAr(forwardSide)} → ${forwardZone?zoneRange(forwardZone):forwardTarget!=null?fmt(forwardTarget,2):'—'} · ${Math.round(Number(forward.confidence||0))}%`}
      </strong>
      <div className="forecast-scenario-strip">
        <div><small>الوجهة</small><b>{forwardZone?zoneRange(forwardZone):forwardTarget!=null?fmt(forwardTarget,2):priceDestination?zoneRange(priceDestination):'—'}</b></div>
        <div><small>نافذة التحرك</small><b>{forwardSide!=='WAIT'?forwardWindow:'—'}</b></div>
        <div><small>الارتداد</small><b dir="ltr">{zoneRange(path?.reboundZone||zone?.origin)}</b></div>
        <div><small>نسبة السيولة</small><b className="green">{hasLiquidity?`صعود ${liqBuy}%`:'—'}</b><b className="red">{hasLiquidity?`هبوط ${liqSell}%`:'—'}</b><span>{accumulationPhase}{accumulationPhase==='تجميع'&&accumulationScore?` · ${accumulationScore}%`:accumulationPhase==='تصريف'&&distributionScore?` · ${distributionScore}%`:''}</span></div>
        <div><small>مستويات السيولة</small>
          <b>{upperLiquidityLevel!=='—'?<>سيولة أعلى عند <span dir="ltr">{upperLiquidityLevel}</span></>:'لا توجد سيولة علوية واضحة'}</b>
          <span>{lowerLiquidityLevel!=='—'?<>سيولة أسفل عند <span dir="ltr">{lowerLiquidityLevel}</span></>:'لا توجد سيولة سفلية واضحة'}</span>
        </div>
        <div><small>هيكل الحركة</small><b>{structureText}</b><span>{structurePatternAr(structure?.m1?.structure||structure?.m5?.structure)}</span></div>
      </div>
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
