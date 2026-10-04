'use client';
import {Activity,ChevronDown,ShieldCheck,TrendingDown,TrendingUp,Zap} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const calibrated=(v:any)=>Math.min(92,Math.max(0,Math.round(Number(v)||0)));
const timeLeft=(ts:any,now:number)=>{
  const d=Number(ts)-now;if(!Number.isFinite(d))return '';
  if(d<=0)return 'الآن';
  const m=Math.floor(d/60000),h=Math.floor(m/60),mm=m%60;
  return h>0?`بعد ${h}س ${mm}د`:`بعد ${Math.max(1,mm)}د`;
};

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

      {scalp&&<div className="advanced-block"><strong>M1 Scalp</strong><p>{scalp.action&&scalp.action!=='WAIT'?('ميل '+sideAr(scalp.action)):scalp.reason||'WAIT'}</p></div>}
      <IndicatorMatrix x={x}/>
      {!!x.vetoes?.length&&<div className="advanced-block"><strong>Vetoes</strong><p>{x.vetoes.join(' · ')}</p></div>}
    </div>
  </details>;
}

function AssetCard({x,fast}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const master=x.master||{action:x.action,state:x.phase||'WAIT',reason:''},hunt=x.huntForecast,trade=x.trade;
  const buy=master.action==='BUY',sell=master.action==='SELL';
  const waveHot=fast?.ok&&['WAVE_FORMING','IGNITION'].includes(String(fast.stage));
  const scalpLong=Number(x.scalp?.score?.long||0),scalpShort=Number(x.scalp?.score?.short||0);
  const scalpSide=x.scalp?.action==='BUY'||x.scalp?.action==='SELL'?x.scalp.action:scalpLong>scalpShort?'BUY':scalpShort>scalpLong?'SELL':'WAIT';
  const scalpStrength=calibrated(Math.max(scalpLong,scalpShort));
  const m1=x.indicatorMatrix?.rows?.m1,m5=x.indicatorMatrix?.rows?.m5;
  const quickTargets=hunt?.quickSignalTargets||{};
  const signalRows=[
    {label:'Scalp',side:scalpSide,strength:scalpStrength,target:quickTargets?.scalp?.price},
    {label:'1 min',side:m1?.bias||'WAIT',strength:calibrated(m1?.strength),target:quickTargets?.oneMinute?.price},
    {label:'5 min',side:m5?.bias||'WAIT',strength:calibrated(m5?.strength),target:quickTargets?.fiveMinute?.price}
  ];
  return <section className={"panel ai-asset-card "+(buy?'ai-buy':sell?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div><span className="eyebrow">{x.asset} · MASTER</span><h2>{buy?'شراء':sell?'بيع':'ترقب الحركة'}</h2></div>
      {buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row">
      <div><small>السعر</small><strong>{fmt(x.livePulse?.price??x.price,2)}</strong></div>
      <div><small>الحالة</small><strong>{master.state||'WAIT'}</strong></div>
      <div><small>الثقة</small><strong>{calibrated(x.confidence)}</strong></div>
    </div>

    <div className="quick-signals">
      {signalRows.map((s:any)=><div className="quick-signal-row" key={s.label}>
        <span>{s.label}</span>
        <strong className={s.side==='BUY'?'green':s.side==='SELL'?'red':'amber'}>{sideAr(s.side)} <b>%{s.strength}</b>{s.target!=null?<em> · ≈ {fmt(s.target,2)}</em>:null}</strong>
      </div>)}
    </div>

    <div className="master-box">
      <span>القرار النهائي</span>
      <strong className={buy?'green':sell?'red':'amber'}>{buy?'BUY':sell?'SELL':'WAIT'}</strong>
      <p>{master.reason||'النواة تراقب الحركة ولم تعتمد دخولًا بعد.'}</p>
    </div>

    {x.stateGraph&&<div className="hunt-box market-state-box">
      <div className="hunt-title"><span>🧠 فهم حركة السوق</span><strong>{x.stateGraph.current} → {x.stateGraph.nextState}</strong></div>
      <div className="forecast-horizons">
        <div><small>الحالة الحالية</small><strong>{x.stateGraph.current}</strong></div>
        <div><small>الحالة التالية</small><strong>{x.stateGraph.nextState}</strong></div>
        <div><small>احتمال الانتقال</small><strong>%{x.stateGraph.nextStateProbability||0}</strong></div>
      </div>
      <div className="forecast-path">
        <div><small>اتجاه الحالة التالية</small><strong className={x.stateGraph.nextSide==='BUY'?'green':x.stateGraph.nextSide==='SELL'?'red':'amber'}>{sideAr(x.stateGraph.nextSide)} · %{x.stateGraph.nextSideProbability||0}</strong></div>
        <div><small>Sequence Matches</small><strong>{x.stateGraph.sequenceMatches||0}</strong></div>
      </div>
      <p className="muted">{x.stateGraph.sequence}</p>
      {x.stateGraph.changePoint&&<p className="amber">⚠️ Change Point {x.stateGraph.changePointScore}: السوق قد يكون بيغير نظام الحركة.</p>}
      {x.marketLearning&&x.stateGraph.nextSide!=='WAIT'&&x.marketLearning.side!=='WAIT'&&x.stateGraph.nextSide!==x.marketLearning.side&&<p className="red">MODEL CONFLICT: State Graph {sideAr(x.stateGraph.nextSide)} بينما الذاكرة {sideAr(x.marketLearning.side)} — الثقة في الحركة القادمة لازم تكون أقل.</p>}
      {x.marketLearning?.strongMoveMemory&&<p className="learning-line">⚡ ذاكرة موجة قوية: {sideAr(x.marketLearning.strongMoveMemory.side)} · احتمال {x.marketLearning.strongMoveMemory.probability||0}% · عينات {x.marketLearning.strongMoveMemory.samples||0}</p>}
    </div>}

    {hunt&&<div className="hunt-box">
      <div className="hunt-title"><span>🦅 الحركة القادمة المتوقعة</span><strong>{sideAr(hunt.nextMove?.side||hunt.path?.shortSide)} · {hunt.path?.label||sideAr(hunt.side)} · {hunt.state}</strong></div>
      {hunt.liveFailureGuard?.invalidated&&<p className="red">⚠️ تم إلغاء التوقع السابق {sideAr(hunt.liveFailureGuard.failedSide)} بعد حركة عكسية {hunt.liveFailureGuard.adverseAtr} ATR؛ لن يتكرر نفس الاتجاه مباشرة.</p>}

      <div className="forecast-path">
        <div><small>الحركة الأولى</small><strong className={hunt.path?.shortSide==='BUY'?'green':hunt.path?.shortSide==='SELL'?'red':'amber'}>{sideAr(hunt.path?.shortSide)} → {fmt(hunt.path?.firstLeg,2)}</strong></div>
        <div><small>الحركة التالية</small><strong className={hunt.path?.followSide==='BUY'?'green':hunt.path?.followSide==='SELL'?'red':'amber'}>{sideAr(hunt.path?.followSide)} → {fmt(hunt.path?.secondLeg,2)}</strong></div>
      </div>

      <div className="forecast-horizons">
        <div><small>بعد دقيقتين</small><strong className={hunt.horizons?.twoMinute?.side==='BUY'?'green':hunt.horizons?.twoMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.twoMinute?.side)} %{hunt.horizons?.twoMinute?.strength||0}</strong><span>≈ {fmt(hunt.movementStations?.[0]?.price??hunt.path?.firstLeg,2)}</span></div>
        <div><small>بعد 5 دقائق</small><strong className={hunt.horizons?.fiveMinute?.side==='BUY'?'green':hunt.horizons?.fiveMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.fiveMinute?.side)} %{hunt.horizons?.fiveMinute?.strength||0}</strong><span>≈ {fmt(hunt.movementStations?.[1]?.price??hunt.path?.secondLeg,2)}</span></div>
        <div><small>بعد 15 دقيقة</small><strong className={hunt.horizons?.fifteenMinute?.side==='BUY'?'green':hunt.horizons?.fifteenMinute?.side==='SELL'?'red':'amber'}>{sideAr(hunt.horizons?.fifteenMinute?.side)} %{hunt.horizons?.fifteenMinute?.strength||0}</strong><span>≈ {fmt(hunt.fifteenMinuteTarget?.price,2)}</span></div>
      </div>

      {hunt.strongMove&&<div className={"strong-move-box "+(hunt.strongMove.side==='BUY'?'strong-up':'strong-down')}>
        <small>🚀 STRONG MOVE SETUP</small>
        <strong>{sideAr(hunt.strongMove.side)} · قوة {calibrated(hunt.strongMove.score)} · جاهزية {calibrated(hunt.strongMove.readiness)}</strong>
        <span>{hunt.strongMove.phase} · {hunt.strongMove.side==='BUY'?('كسر '+fmt(hunt.strongMove.breakoutLevel,2)):('كسر '+fmt(hunt.strongMove.breakdownLevel,2))}</span>
        <span>Liquidity {hunt.strongMove.liquidityConfirmed?'✓':'—'} · Absorption {hunt.strongMove.absorptionConfirmed?'✓':'—'}</span>
      </div>}

      {hunt.accumulationMap&&<div className="accumulation-strip">
        <div><small>Accumulation</small><strong>{hunt.accumulationMap.accumulationScore||0}</strong></div>
        <div><small>Distribution</small><strong>{hunt.accumulationMap.distributionScore||0}</strong></div>
        <div><small>Breakout Ready</small><strong>{hunt.accumulationMap.breakoutReadiness||0}</strong></div>
      </div>}

      {hunt.waveStructure&&<div className="wave-structure-strip">
        <div><small>مرحلة M1</small><strong>{hunt.waveStructure?.m1?.phase||'—'}</strong><span>{hunt.waveStructure?.m1?.structure||''}</span></div>
        <div><small>مرحلة M5</small><strong>{hunt.waveStructure?.m5?.phase||'—'}</strong><span>{hunt.waveStructure?.m5?.structure||''}</span></div>
      </div>}

      <div className="ai-price-row">
        <div><small>جودة التوقع</small><strong>{calibrated(hunt.quality??hunt.confidence)}</strong></div>
        <div><small>ثبات الاتجاه</small><strong>{hunt.persistence||0}%</strong></div>
        <div><small>أفق التوقع</small><strong>2 / 5 / 15 د</strong></div>
      </div>

      <div className="forecast-levels">
        <div><small>Trigger</small><strong>{fmt(hunt.trigger,2)}</strong></div>
        <div><small>Target</small><strong>{fmt(hunt.projected,2)}</strong></div>
        <div><small>Invalidation</small><strong>{fmt(hunt.invalidation,2)}</strong></div>
      </div>

      {hunt.alternative?.side&&hunt.alternative.side!=='WAIT'&&<div className="forecast-alt">
        <small>السيناريو البديل</small>
        <strong>{sideAr(hunt.alternative.side)} · قوة {calibrated(hunt.alternative.strength)}</strong>
        <span>{hunt.alternative.condition}</span>
      </div>}

      {hunt.expectedMoveLearning&&<p className="learning-line">🎯 ذاكرة الحركة: 2m {sideAr(hunt.expectedMoveLearning.twoMinute?.side)} · 5m {sideAr(hunt.expectedMoveLearning.fiveMinute?.side)} · 15m {sideAr(hunt.expectedMoveLearning.fifteenMinute?.side)} · متوسط Calibration {hunt.expectedMoveCore?.averageCalibration||0}</p>}
      {hunt.commitment&&<p className="muted">Direction Lock: {sideAr(hunt.commitment.side)} · {hunt.commitment.state}{hunt.commitment.pendingSide!=='WAIT'?(' · عكس محتمل '+sideAr(hunt.commitment.pendingSide)+' '+hunt.commitment.pendingCount+'/2'):''}</p>}
      {!!hunt.reasons?.length&&<p className="muted">{hunt.reasons.slice(0,4).join(' · ')}</p>}
    </div>}

    {waveHot&&<div className="wave-alert">
      <Zap size={17}/><div><strong>LIVE WAVE · {fast.stage} · {sideAr(fast.side)}</strong><span>1s {fast.velocity1s} bps · Acc {fast.acceleration} · Persistence {fast.persistence}%</span></div>
    </div>}

    {trade&&master.state==='TRADE'&&<div className="trade-strip">
      <div><small>Entry</small><strong>{fmt(trade.entry,2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,2)}</strong></div>
    </div>}

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
      {!!data?.radar?.length&&<div className="radar-mini">{data.radar.slice(0,2).map((r:any)=><div key={r.asset}><small>{r.asset}</small><strong>{r.side!=='WAIT'?sideAr(r.side):('HUNT '+sideAr(r.huntSide))}</strong><span>{r.status||r.huntState}</span></div>)}</div>}
    </section>

    {auto?.status&&auto.status!=='healthy'&&<div className="fatal"><ShieldCheck size={18}/><div><strong>Data Guard: {auto.status}</strong><span>بعض المصادر تحتاج مراجعة قبل اعتماد أي صفقة.</span></div></div>}
    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}

    {showNextEvent&&<section className="next-news">
      <div><small>أقرب خبر</small><strong>{next.name}</strong></div>
      <span>{timeLeft(next.time,now)}</span>
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold}/></div>
  </div>;
}
