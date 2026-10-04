'use client';
import {Activity,ChevronDown,TrendingDown,TrendingUp} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const calibrated=(v:any)=>Math.min(92,Math.max(0,Math.round(Number(v)||0)));
const timeLeft=(ts:any,now:number)=>{
  const d=Number(ts)-now;if(!Number.isFinite(d))return '';
  if(d<=0)return 'الآن';
  const m=Math.floor(d/60000),h=Math.floor(m/60),mm=m%60;
  return h>0?`بعد ${h}س ${mm}د`:`بعد ${Math.max(1,mm)}د`;
};
const moveAr=(s:any)=>s==='BUY'?'صعود':s==='SELL'?'هبوط':'تذبذب';
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
  const h2=hunt?.horizons?.twoMinute?.side||'WAIT',h5=hunt?.horizons?.fiveMinute?.side||'WAIT',h15=hunt?.horizons?.fifteenMinute?.side||'WAIT';
  const timing=Number.isFinite(firstHit)&&firstHit>0?'، وأول حركة معتبرة متوقعة خلال نحو '+firstHit.toFixed(1)+' دقيقة':'';
  const phase=understanding?.mode?(' · فهم السوق: '+String(understanding.mode).replaceAll('_',' ')):'';
  const detail='أول حركة '+moveAr(first)+' بثقة '+confidence+'%'+timing+'، وبعدها '+moveAr(follow)+'. ميل 2د: '+moveAr(h2)+' · 5د: '+moveAr(h5)+' · 15د: '+moveAr(h15)+phase+'.';
  return {title,detail,tone:first==='BUY'?'green':first==='SELL'?'red':'amber'};
}

function IndicatorMatrix({x}:any){
  const rows=x?.indicatorMatrix?.rows;if(!rows)return null;
  return <div className="advanced-block">
    <strong>المؤشرات متعددة الأطر</strong>
    {([['m1','M1'],['m5','M5'],['m15','M15'],['h1','H1']] as const).map(([key,label])=>{const r=rows[key];return <div className="kv" key={key}>
      <span>{label} · RSI {r?.rsi??'—'} · ADX {r?.adx??'—'}</span>
      <b className={r?.bias==='BUY'?'green':r?.bias==='SELL'?'red':'amber'}>{sideAr(r?.bias)} · {calibrated(r?.strength)}</b>
    </div>;})}
  </div>;
}

function AdvancedDetails({x}:any){
  const hunter=x.hunter,liq=x.liquidity,motion=x.motion,behavior=x.behavior,learner=x.scalpLearner,marketLearning=x.marketLearning,selfEvolution=x.selfEvolution,evolutionAutopsy=x.evolutionAutopsy,scalp=x.scalp,core=x.adaptiveCore;
  return <details className="advanced-details">
    <summary><span>التفاصيل المتقدمة</span><ChevronDown size={16}/></summary>
    <div className="advanced-content">
      <div className="advanced-block">
        <strong>Core Fusion</strong>
        <div className="levels">
          <div><small>BUY</small><strong>{x.fusion?.buy||0}</strong></div>
          <div><small>SELL</small><strong>{x.fusion?.sell||0}</strong></div>
          <div><small>Data</small><strong>{x.dataQuality||0}/100</strong></div>
        </div>
      </div>

      {hunter&&<div className="advanced-block"><strong>Hunter</strong><p>{sideAr(hunter.side)} · {hunter.mode} · {hunter.status} · قوة {calibrated(hunter.score)}</p><p>{hunter.reason}</p></div>}

      {liq&&<div className="advanced-block">
        <strong>Liquidity</strong>
        <p>{sideAr(liq.side)} · قوة {calibrated(Math.max(liq.buy||0,liq.sell||0))} · Quality {liq.quality}/100</p>
        <div className="levels">
          <div><small>Order Book</small><strong>{liq.book?.weightedImbalance??0}%</strong></div>
          <div><small>CVD / Delta</small><strong>{liq.flow?.deltaPct??0}%</strong></div>
          <div><small>Acceleration</small><strong>{liq.dynamics?.acceleration??0}</strong></div>
        </div>
        <p>Absorption: {sideAr(liq.absorption?.side)} · {calibrated(liq.absorption?.score)}</p>
        {core&&<p>Weights: Tech {Math.round((core.technicalWeight||0)*100)}% · Liq {Math.round((core.liquidityWeight||0)*100)}% · Motion {Math.round((core.motionWeight||0)*100)}% · Behavior {Math.round((core.behaviorWeight||0)*100)}%</p>}
      </div>}

      {motion&&<div className="advanced-block"><strong>Motion</strong><p>{motion.stage} · {sideAr(motion.side)} · قوة {calibrated(motion.score)}</p></div>}

      {behavior&&<div className="advanced-block">
        <strong>Behavior Study</strong>
        <p>{behavior.pattern} · {sideAr(behavior.side)} · قوة {calibrated(behavior.score)} · Analogs {behavior.analogCount||0}</p>
        <p>↑ {behavior.votes?.buy||0} / ↓ {behavior.votes?.sell||0} · Expected {behavior.expectedMoveAtr??0} ATR</p>
      </div>}

      {learner&&<div className="advanced-block">
        <strong>Scalp Learner · {learner.ok?'VALIDATED':'BLOCKED/TRAINING'}</strong>
        <div className="levels">
          <div><small>Holdout Accuracy</small><strong>{learner.oosAccuracy||0}%</strong></div>
          <div><small>Net Edge</small><strong>{learner.oosEdgeAtr??0} ATR</strong></div>
          <div><small>Profit Factor</small><strong>{learner.profitFactor??'—'}</strong></div>
        </div>
        {!!learner.gate?.reasons?.length&&<p>{learner.gate.reasons.join(' · ')}</p>}
      </div>}

      {x.expectedMoveLearning&&<div className="advanced-block">
        <strong>🎯 Expected Move Learning · PRIMARY</strong>
        <div className="levels">
          <div><small>2m</small><strong>{sideAr(x.expectedMoveLearning.twoMinute?.side)} · Cal {x.expectedMoveLearning.twoMinute?.calibration||50}</strong></div>
          <div><small>5m</small><strong>{sideAr(x.expectedMoveLearning.fiveMinute?.side)} · Cal {x.expectedMoveLearning.fiveMinute?.calibration||50}</strong></div>
          <div><small>15m</small><strong>{sideAr(x.expectedMoveLearning.fifteenMinute?.side)} · Cal {x.expectedMoveLearning.fifteenMinute?.calibration||50}</strong></div>
        </div>
        <p>Resolved 2m {x.expectedMoveLearning.totals?.resolved2||0} · 5m {x.expectedMoveLearning.totals?.resolved5||0} · 15m {x.expectedMoveLearning.totals?.resolved15||0}</p>
        <p>يتعلم من أول جهة تصل لحركة معتبرة؛ الإغلاق بعد النافذة يُستخدم لقياس الاستمرار فقط.</p>
      </div>}

      {marketLearning&&<div className="advanced-block">
        <strong>🧠 Market Learning Brain</strong>
        <div className="levels">
          <div><small>Learned Bias</small><strong>{sideAr(marketLearning.side)} · {calibrated(marketLearning.confidence)}</strong></div>
          <div><small>1m Memory</small><strong>{sideAr(marketLearning.horizon1?.side)} · {marketLearning.horizon1?.samples||0}</strong></div>
          <div><small>5m Memory</small><strong>{sideAr(marketLearning.horizon5?.side)} · {marketLearning.horizon5?.samples||0}</strong></div>
        </div>
        <p>Observations {marketLearning.totals?.observations||0} · Resolved 1m {marketLearning.totals?.resolved1||0} · Resolved 5m {marketLearning.totals?.resolved5||0} · Self {marketLearning.selfCalibration?.reliability||50}</p>
        {!!marketLearning.reasons?.length&&<p>{marketLearning.reasons.join(' · ')}</p>}
      </div>}

      {selfEvolution&&<div className="advanced-block">
        <strong>🧬 Self-Evolution Lab</strong>
        <div className="levels">
          <div><small>Generation</small><strong>G{selfEvolution.generation||0}</strong></div>
          <div><small>Active Fitness</small><strong>{selfEvolution.active?.fitness??'—'}</strong></div>
          <div><small>Champion</small><strong>{selfEvolution.champion?.fitness??'—'}</strong></div>
        </div>
        <p>Regime: {selfEvolution.regime||'—'} · Tournament {selfEvolution.tournament?.generated||0} candidates{selfEvolution.tournament?.winner?(' · winner '+selfEvolution.tournament.winner):''}</p>
        <p>{selfEvolution.promoted?'✅ Candidate promoted':selfEvolution.rolledBack?'↩️ Automatic rollback':selfEvolution.reason||'Shadow monitoring'}</p>
        <p>Permissions: Feature Synthesis ✓ · Multi-Candidate ✓ · Ablation ✓ · Autopsy ✓ · Regime Champions ✓ · Auto Rollback ✓</p>
        <p>Production Source Write ✕ · Execution Code Write ✕</p>
        {evolutionAutopsy?.issues?.length?<p>Autopsy: {evolutionAutopsy.issues.join(' · ')}</p>:<p>Autopsy: clean cycle</p>}
      </div>}

      {scalp&&<div className="advanced-block"><strong>Scalp Ambush</strong><p>{scalp.action&&scalp.action!=='WAIT'?sideAr(scalp.action):'انتظار'}</p></div>}
      <IndicatorMatrix x={x}/>
      {!!x.vetoes?.length&&<div className="advanced-block"><strong>Vetoes</strong><p>{x.vetoes.join(' · ')}</p></div>}
    </div>
  </details>;
}

function AssetCard({x,fast}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const master=x.master||{action:x.action,state:x.phase||'WAIT',reason:''},hunt=x.huntForecast,recommendation=x.recommendation;
  const forecastSide=hunt?.marketUnderstanding?.firstMove?.side||hunt?.nextMove?.side||hunt?.path?.shortSide||'WAIT';
  const displaySide=master.action==='BUY'||master.action==='SELL'?master.action:forecastSide;
  const buy=displaySide==='BUY',sell=displaySide==='SELL';
  const masterState=String(master?.state||'').toUpperCase();
  const scalpFusion=x.scalp?.fusionV8;
  const predator=scalpFusion?.predator;
  const predatorPhase=String(predator?.phase||'');
  const ambushActive=Boolean(
    predatorPhase==='AMBUSH'&&(x.scalp?.action==='BUY'||x.scalp?.action==='SELL')
  );
  const ambushSide=ambushActive?x.scalp.action:'WAIT';
  const scalpStrength=calibrated(predator?.score??x.scalp?.confidence??0);
  const plan=x.scalp?.ambushPlan||{};
  const entry=plan?.entry||{};
  const invalid=plan?.invalidation||{};
  const helpers=scalpFusion?.assistants||{};
  const helperCount=Number(scalpFusion?.assistantCount||0);
  const ambushStats=x.asset==='BTC'?x.scalpLive?.bySource?.SCALP_AMBUSH_TRADE_V8:null;
  const ambushMetric=ambushStats?.resolved?ambushStats:(x.asset==='BTC'?x.scalpLive?.global:null);
  const ambushWf=x.asset==='BTC'?x.scalpLive?.walkForwardBySource?.SCALP_AMBUSH_TRADE_V8:null;
  const scalpTargetPrice=x.scalp?.target?.price??plan?.target?.price??x.scalp?.intercept?.launchLine??null;
  const nextPrice=x.scalp?.nextPrice||scalpFusion?.nextPrice||{};
  const ambushStatus=invalid?.cancel?'ملغي'
    :ambushActive?'جاهز'
      :plan?.status==='ARMED'?'جاهز للمراقبة'
        :plan?.status==='STALK'?'يراقب'
          :plan?.status==='SCOUT'?'ينتظر':'ينتظر';
  return <section className={"panel ai-asset-card "+(buy?'ai-buy':sell?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div><span className="eyebrow">{x.asset}</span><h2>{recommendation?.active?(buy?'شراء':sell?'بيع':'مراقبة'):(buy?'توقع صعود':sell?'توقع هبوط':'تذبذب')}</h2></div>
      {buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row">
      <div><small>السعر</small><strong>{fmt(x.livePulse?.price??x.price,2)}</strong></div>
      <div><small>الثقة</small><strong>{recommendation?.active?(calibrated(recommendation.confidence)+'%'):'—'}</strong></div>
      <div><small>الحالة</small><strong>{recommendation?.active?'توصية':'مراقبة'}</strong></div>
    </div>

    <small className="muted">نتائج توقع الحركة — ليست صفقات منفذة</small>
    <div className="ai-outcome-mini">
      <span>شراء ✓ <b>{x.expectedMoveLearning?.directionStats?.buySuccess||0}</b></span>
      <span>شراء ✕ <b>{x.expectedMoveLearning?.directionStats?.buyFail||0}</b></span>
      <span>بيع ✓ <b>{x.expectedMoveLearning?.directionStats?.sellSuccess||0}</b></span>
      <span>بيع ✕ <b>{x.expectedMoveLearning?.directionStats?.sellFail||0}</b></span>
    </div>

    <div className={"scalp-ambush-card "+(ambushSide==='BUY'?'ambush-buy':ambushSide==='SELL'?'ambush-sell':'ambush-wait')}>
      <div className="scalp-ambush-head">
        <div>
          <span>SCALP AMBUSH</span>
          <small>السكالب الوحيد</small>
        </div>
        <b className={ambushSide==='BUY'?'green':ambushSide==='SELL'?'red':'amber'}>{sideAr(ambushSide)}</b>
      </div>

      <div className="scalp-ambush-main">
        <strong className={ambushSide==='BUY'?'green':ambushSide==='SELL'?'red':'amber'}>
          {ambushSide==='BUY'?'الحركة: صعود':ambushSide==='SELL'?'الحركة: هبوط':'الحركة: انتظار'}
        </strong>
        <span>{scalpStrength}%{scalpTargetPrice!=null?<> · الهدف ≈ {fmt(scalpTargetPrice,2)}</>:null}</span>
      </div>

      <div className={"scalp-next-price "+(nextPrice?.ready?'ready':'waiting')}>
        <div>
          <small>السعر القادم المتوقع</small>
          <strong className={nextPrice?.side==='BUY'?'green':nextPrice?.side==='SELL'?'red':'amber'}>
            {nextPrice?.ready?fmt(nextPrice.price,2):'ينتظر توافق الحركة'}
          </strong>
        </div>
        <span>
          {nextPrice?.ready
            ?<>نطاق {fmt(nextPrice.low,2)} — {fmt(nextPrice.high,2)} · خلال {nextPrice.horizonSeconds||'—'}ث · ثقة {calibrated(nextPrice.confidence)}%</>
            :<>Ambush لن يعرض رقمًا قبل توافق السرعة والسيولة والـ microprice</>}
        </span>
      </div>

      <div className="scalp-ambush-grid">
        <div><small>الحالة</small><b>{ambushStatus}</b></div>
        <div><small>الدخول</small><b>{entry?.ready?'جاهز':'انتظار'}</b></div>
        <div><small>المساعدون</small><b>{helperCount}/10</b></div>
        <div><small>الدقة الحية</small><b>{ambushMetric?.accuracy==null?'—':ambushMetric.accuracy+'%'}</b></div>
      </div>

      {(entry?.zoneLow!=null&&entry?.zoneHigh!=null)&&<p>منطقة الدخول {fmt(entry.zoneLow,2)} — {fmt(entry.zoneHigh,2)}</p>}
      {invalid?.cancel&&<p className="red">إلغاء: {(invalid.reasons||[]).join(' · ')||'شرط الإلغاء تحقق'}</p>}

      {x.asset==='BTC'&&ambushStats&&<div className="scalp-ambush-results">
        <span>نجح <b>{ambushStats?.hits||0}</b></span>
        <span>فشل <b>{ambushStats?.fails||0}</b></span>
        <span>محايد <b>{ambushStats?.neutral||0}</b></span>
        <span>OOS <b>{ambushWf?.oos?.accuracy==null?'—':ambushWf.oos.accuracy+'%'}</b></span>
      </div>}
    </div>

    {(()=>{
      const move=nextMoveCopy(hunt,x.stateGraph);
      return <div className="next-move-copy">
        <span>توقع الحركة القادمة</span>
        <strong className={move.tone}>{move.title}</strong>
        <p>{move.detail}</p>
      </div>;
    })()}

    {x.nextMoveLive&&<div className="next-move-copy">
      <span>Next Move Live Tracker</span>
      <strong className={(x.nextMoveLive?.global?.accuracy??0)>=60?'green':(x.nextMoveLive?.global?.accuracy??0)>=50?'amber':'red'}>
        {x.nextMoveLive?.global?.accuracy==null?'يجمع النتائج الحية':('دقة '+x.nextMoveLive.global.accuracy+'%')}
      </strong>
      <div className="ai-outcome-mini">
        <span>نجح ✓ <b>{x.nextMoveLive?.global?.hits||0}</b></span>
        <span>فشل ✕ <b>{x.nextMoveLive?.global?.fails||0}</b></span>
        <span>محايد <b>{x.nextMoveLive?.global?.neutral||0}</b></span>
        <span>معلق <b>{x.nextMoveLive?.pending||0}</b></span>
      </div>
      <p>First-Passage Live · {x.nextMoveLive?.learningSamples||0} نتيجة اتجاهية{x.nextMoveLive?.readyForLearning?' · جاهز للمعايرة':' · يتعلم بعد تجميع عينة أكبر'}</p>
      {x.nextMoveLive?.walkForward&&<div className="ai-outcome-mini">
        <span>OOS <b>{x.nextMoveLive.walkForward?.oos?.accuracy==null?'—':(x.nextMoveLive.walkForward.oos.accuracy+'%')}</b></span>
        <span>Coverage <b>{x.nextMoveLive.walkForward?.oos?.coverage==null?'—':(x.nextMoveLive.walkForward.oos.coverage+'%')}</b></span>
        <span>WF <b>{x.nextMoveLive.walkForward?.status||'COLLECTING'}</b></span>
        <span>Drift <b>{x.nextMoveLive.walkForward?.drift?.delta==null?'—':((x.nextMoveLive.walkForward.drift.delta>0?'+':'')+x.nextMoveLive.walkForward.drift.delta+'%')}</b></span>
      </div>}
    </div>}

    {hunt&&<div className="forecast-horizons compact-forecast">
      <div><small>2m</small><strong className={hunt.horizons?.twoMinute?.side==='BUY'?'green':hunt.horizons?.twoMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.twoMinute?.side)} {hunt.horizons?.twoMinute?.strength||0}%</strong><span>≈ {fmt(hunt.movementStations?.[0]?.price??hunt.path?.firstLeg,2)}</span></div>
      <div><small>5m</small><strong className={hunt.horizons?.fiveMinute?.side==='BUY'?'green':hunt.horizons?.fiveMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.fiveMinute?.side)} {hunt.horizons?.fiveMinute?.strength||0}%</strong><span>≈ {fmt(hunt.movementStations?.[1]?.price??hunt.path?.secondLeg,2)}</span></div>
      <div><small>15m</small><strong className={hunt.horizons?.fifteenMinute?.side==='BUY'?'green':hunt.horizons?.fifteenMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.fifteenMinute?.side)} {hunt.horizons?.fifteenMinute?.strength||0}%</strong><span>≈ {fmt(hunt.fifteenMinuteTarget?.price,2)}</span></div>
    </div>}

    {hunt&&<details className="advanced-details compact-details">
      <summary><span>تحليل الحركة</span><ChevronDown size={16}/></summary>
      <div className="advanced-content">
        <div className="advanced-block">
          <strong>الحركة القادمة المتوقعة</strong>
          <p>{sideAr(hunt.nextMove?.side||hunt.path?.shortSide)} · جودة {calibrated(hunt.quality??hunt.confidence)} · ثبات {hunt.persistence||0}%</p>
          <p>Trigger {fmt(hunt.trigger,2)} · Target {fmt(hunt.projected,2)} · Invalidation {fmt(hunt.invalidation,2)}</p>
          {hunt.strongMove&&<p>Strong Move: {sideAr(hunt.strongMove.side)} · قوة {calibrated(hunt.strongMove.score)} · جاهزية {calibrated(hunt.strongMove.readiness)}</p>}
          {hunt.liveFailureGuard?.invalidated&&<p className="amber">الحركة السابقة فشلت؛ النواة خفّضت وزنها وأعادت ترجيح الاتجاه مباشرة بدل إيقاف التحليل.</p>}
        </div>
      </div>
    </details>}

    <AdvancedDetails x={x}/>
  </section>;
}

export default function AICommandCenter({data,error,fastWave,now=Date.now()}:any){
  const auto=data?.autopilot,next=auto?.nextEvent;
  const nextEventDelta=Number(next?.time)-now;
  const showNextEvent=!!next&&Number.isFinite(nextEventDelta)&&nextEventDelta>=0&&nextEventDelta<=10*60*60*1000;
  return <div className="ai-clean">
    <section className="ai-hero">
      <div><span className="eyebrow">PREDATOR CORE</span><h1>{data?.model||'AI Hunter'}</h1></div>
      {!!data?.radar?.length&&<div className="radar-mini">{data.radar.slice(0,2).map((r:any)=><div key={r.asset}><small>{r.asset}</small><strong>{sideAr(r.side)}</strong><span>{r.side==='WAIT'?'WAIT':(r.status||'TRADE')}</span></div>)}</div>}
    </section>

    {error&&!data&&<div className="fatal"><Activity size={18}/><div><strong>تعذر تحديث AI</strong><span>{error}</span></div></div>}

    {showNextEvent&&<section className="next-news">
      <div><small>أقرب خبر</small><strong>{next.name}</strong></div>
      <span>{timeLeft(next.time,now)}</span>
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold}/></div>
  </div>;
}
