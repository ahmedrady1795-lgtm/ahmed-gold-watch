'use client';
import {Activity,ShieldCheck,TrendingUp,TrendingDown} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const calibrated=(v:any)=>Math.min(92,Math.max(0,Math.round(Number(v)||0)));

function IndicatorMatrix({x}:any){
  const rows=x?.indicatorMatrix?.rows;if(!rows)return null;
  const order=[['m1','M1'],['m5','M5'],['m15','M15'],['h1','H1']];
  return <div className="sidecard">
    <strong>مصفوفة مؤشرات تشخيصية · ليست أوامر</strong>
    <p>Fusion داخلي: {x.fusion?.buy||0} شراء / {x.fusion?.sell||0} بيع</p>
    {order.map(([key,label])=>{const r=rows[key];return <div className="kv" key={key}>
      <span>{label} · RSI {r?.rsi??'—'} · ADX {r?.adx??'—'}</span>
      <b className={r?.bias==='BUY'?'green':r?.bias==='SELL'?'red':'amber'}>ميل {sideAr(r?.bias)} · قوة {calibrated(r?.strength)}</b>
    </div>;})}
  </div>;
}

function Card({x,fast}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const master=x.master||{action:x.action,state:x.phase||'WAIT',watchSide:'WAIT',reason:'',lockedSide:'WAIT',pendingReversal:'WAIT',pendingCount:0};
  const trade=x.trade,buy=master.action==='BUY',sell=master.action==='SELL',pulse=x.livePulse,scalp=x.scalp,learner=x.scalpLearner,hunter=x.hunter,liq=x.liquidity,core=x.adaptiveCore,motion=x.motion,behavior=x.behavior,hunt=x.huntForecast;
  return <section className="panel">
    <div className="panelhead"><div><span className="eyebrow">{x.asset} · MASTER DECISION</span><h2>{buy?'شراء معتمد':sell?'بيع معتمد':'انتظار'} · {master.state}</h2></div>{buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}</div>

    <div className={buy||sell?'safetybox':'sidecard'}>
      <strong>🧭 القرار الوحيد: {buy?'BUY':sell?'SELL':'WAIT'}</strong>
      <p>{master.reason||'بانتظار توافق النواة.'}</p>
      {master.state==='WATCH'&&(hunt?.side||master.watchSide)!=='WAIT'&&<p>التوقع المثبت أثناء الانتظار: {sideAr(hunt?.side||master.watchSide)} — ليس صفقة حتى يعتمد Master.</p>}
      {master.state==='REVERSAL_LOCK'&&<p>Direction Lock: {sideAr(master.lockedSide)} · عكس محتمل {sideAr(master.pendingReversal)} ({master.pendingCount||0}/3)</p>}
      {master.state==='CONFLICT'&&<p>لا يوجد اتجاه تداول حتى ينتهي التعارض الداخلي.</p>}
    </div>

    {fast?.ok&&<div className={fast.stage==='IGNITION'||fast.stage==='WAVE_FORMING'?'safetybox':'sidecard'}>
      <strong>⚡ LIVE WAVE LEAD · {fast.stage} · ميل {sideAr(fast.side)} · قوة {calibrated(fast.score)}</strong>
      <div className="levels">
        <div><small>1s Velocity</small><strong>{fast.velocity1s} bps</strong></div>
        <div><small>Acceleration</small><strong>{fast.acceleration}</strong></div>
        <div><small>Persistence</small><strong>{fast.persistence}%</strong></div>
      </div>
      <div className="levels">
        <div><small>Tick Burst</small><strong>x{fast.burstRate}</strong></div>
        <div><small>Book Imbalance</small><strong>{fast.imbalance}%</strong></div>
        <div><small>Spread Compression</small><strong>{fast.spreadCompression}%</strong></div>
      </div>
      {!!fast.reasons?.length&&<p>{fast.reasons.join(' · ')}</p>}
      <p className="muted">طبقة استباقية Tick-by-Tick؛ تسبق التحليل الثقيل ولا تُعد أمر دخول منفردًا.</p>
    </div>}

    {hunt&&<div className={master.action==='WAIT'?'safetybox':'sidecard'}>
      <strong>🦅 HUNT FORECAST · الحركة القادمة المرجحة: {sideAr(hunt.side)} · {hunt.state}</strong>
      <div className="levels">
        <div><small>Forecast Strength</small><strong>{calibrated(hunt.score)}</strong></div>
        <div><small>Forecast Confidence</small><strong>{calibrated(hunt.confidence)}</strong></div>
        <div><small>Persistence</small><strong>{hunt.persistence||0}%</strong></div>
      </div>
      <p>نافذة متوقعة: {Math.round((hunt.horizonSeconds||0)/60)} دقيقة · حركة متوقعة: {hunt.expectedMoveAtr??0} ATR</p>
      <div className="levels">
        <div><small>Trigger</small><strong>{fmt(hunt.trigger,2)}</strong></div>
        <div><small>Projected</small><strong>{fmt(hunt.projected,2)}</strong></div>
        <div><small>Invalidation</small><strong>{fmt(hunt.invalidation,2)}</strong></div>
      </div>
      <p>Buy pressure {hunt.buyScore||0} · Sell pressure {hunt.sellScore||0} · Samples {hunt.samples||0}</p>
      {hunt.commitment&&<p><b>Direction Lock:</b> {sideAr(hunt.commitment.side)} · {hunt.commitment.state} · Smoothed Edge {hunt.commitment.smoothedEdge}{hunt.commitment.pendingSide!=='WAIT'?(' · عكس محتمل '+sideAr(hunt.commitment.pendingSide)+' '+hunt.commitment.pendingCount+'/2'):''}</p>}
      {!!hunt.reasons?.length&&<p>{hunt.reasons.join(' · ')}</p>}
      <p className="muted">{hunt.note}</p>
    </div>}

    <div className="levels">
      <div><small>Core Fusion · تشخيصي</small><strong>{x.fusion?.side||'WAIT'} · قوة {calibrated(Math.max(x.fusion?.buy||0,x.fusion?.sell||0))}</strong></div>
      <div><small>Confidence</small><strong>{calibrated(x.confidence)}</strong></div>
      <div><small>Data</small><strong>{x.dataQuality}/100</strong></div>
    </div>

    {hunter&&<div className="sidecard">
      <strong>🎯 Hunter · قراءة فرعية فقط</strong>
      <p>ميل {sideAr(hunter.side)} · {hunter.mode} · {hunter.status} · قوة {calibrated(hunter.score)}</p>
      <p>{hunter.reason}</p>
    </div>}

    {pulse&&<div className="levels">
      <div><small>Live Pulse</small><strong>{pulse.direction}</strong></div>
      <div><small>Δ M1</small><strong>{Number(pulse.deltaPct||0).toFixed(3)}%</strong></div>
      <div><small>Momentum</small><strong>{pulse.momentum}/100</strong></div>
    </div>}

    {liq&&<div className="sidecard">
      <strong>🧠 Liquidity · قراءة فرعية فقط</strong>
      <p>ميل {sideAr(liq.side)} · قوة {calibrated(Math.max(liq.buy||0,liq.sell||0))} · Quality {liq.quality}/100</p>
      <div className="levels">
        <div><small>Order Book</small><strong>{liq.book?.weightedImbalance??0}%</strong></div>
        <div><small>Volume Delta / CVD</small><strong>{liq.flow?.deltaPct??0}%</strong></div>
        <div><small>Acceleration</small><strong>{liq.dynamics?.acceleration??0}</strong></div>
      </div>
      <p>Microprice {liq.book?.microEdge??0} · Absorption {sideAr(liq.absorption?.side)} · قوة {calibrated(liq.absorption?.score)}</p>
      <p>{liq.absorption?.reason}</p>
      {core&&<p>Weights: Technical {Math.round((core.technicalWeight||0)*100)}% · Liquidity {Math.round((core.liquidityWeight||0)*100)}% · Motion {Math.round((core.motionWeight||0)*100)}% · Behavior {Math.round((core.behaviorWeight||0)*100)}%</p>}
    </div>}

    {motion&&<div className="sidecard">
      <strong>⚡ Motion · قراءة فرعية فقط</strong>
      <p>{motion.stage} · ميل {sideAr(motion.side)} · قوة {calibrated(motion.score)}</p>
      <div className="levels">
        <div><small>Pressure Trend</small><strong>{motion.components?.pressureTrend??0}</strong></div>
        <div><small>Microprice Lead</small><strong>{motion.components?.micropriceLead??0}</strong></div>
        <div><small>Compression</small><strong>{motion.components?.compression??0}</strong></div>
      </div>
      {!!motion.reasons?.length&&<p>{motion.reasons.join(' · ')}</p>}
    </div>}

    {behavior&&<div className="sidecard">
      <strong>🧬 Behavior · قراءة فرعية فقط</strong>
      <p>{behavior.pattern} · ميل {sideAr(behavior.side)} · قوة {calibrated(behavior.score)}</p>
      <div className="levels">
        <div><small>Historical Analogs</small><strong>{behavior.analogCount||0}</strong></div>
        <div><small>Follow-through</small><strong>↑ {behavior.votes?.buy||0} / ↓ {behavior.votes?.sell||0}</strong></div>
        <div><small>Expected Move</small><strong>{behavior.expectedMoveAtr??0} ATR</strong></div>
      </div>
      {!!behavior.reasons?.length&&<p>{behavior.reasons.join(' · ')}</p>}
    </div>}

    <p>السعر {fmt(pulse?.price??x.price,2)} · {pulse?.source||x.source}</p>

    {trade&&master.state==='TRADE'&&<div className="levels">
      <div><small>Entry</small><strong>{fmt(trade.entry,2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,2)}</strong></div>
    </div>}

    <div className="sidecard">
      <strong>⚡ M1 Scalp · قراءة فرعية فقط</strong>
      <p>{scalp?.action&&scalp.action!=='WAIT'?('ميل '+sideAr(scalp.action)+' — غير معتمد إلا إذا وافق Master Decision.'):(scalp?.reason||'بانتظار توافق M1/M5.')}</p>
    </div>

    {learner&&<div className={learner.ok?'safetybox':'sidecard'}>
      <strong>🎓 SCALP LEARNER · {learner.ok?'VALIDATED':'TRAINING'} · ميل {sideAr(learner.side)}</strong>
      <div className="levels">
        <div><small>OOS Accuracy</small><strong>{learner.oosAccuracy||0}%</strong></div>
        <div><small>OOS Edge</small><strong>{learner.oosEdgeAtr??0} ATR</strong></div>
        <div><small>Samples</small><strong>{learner.sampleCount||0}</strong></div>
      </div>
      <div className="levels">
        <div><small>Preferred Hold</small><strong>{learner.exitPlan?.maxHoldSeconds||0}ث</strong></div>
        <div><small>Take</small><strong>{learner.exitPlan?.takeAtr||0} ATR</strong></div>
        <div><small>Stop</small><strong>{learner.exitPlan?.stopAtr||0} ATR</strong></div>
      </div>
      {!!learner.reasons?.length&&<p>{learner.reasons.join(' · ')}</p>}
    </div>}

    <IndicatorMatrix x={x}/>

    {!!x.vetoes?.length&&<div className="sidecard"><ShieldCheck/><p><b>لماذا لم يدخل؟</b><br/>{x.vetoes.join(' · ')}</p></div>}
  </section>;
}

export default function AICommandCenter({data,error,fastWave}:any){
  const auto=data?.autopilot;
  return <div>
    <section className="sidecard">
      <strong>Predator Core v8.5 · Directional Commitment Hunter</strong>
      <p>النواة تضيف Directional Commitment فوق Wave Lead وScalp Learner: الاتجاه لا يتقلب مع كل قراءة، والعكس يحتاج تفوقًا واضحًا في قراءتين متتاليتين أو IGNITION قوي جدًا. MT5 Fast Path يطبق نفس القفل في المحاكاة.</p>
    </section>

    {!!data?.radar?.length&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">MASTER OPPORTUNITY RADAR</span><h2>{data.radar[0]?.asset} · {data.radar[0]?.status}</h2></div><Activity/></div>
      <div className="levels">{data.radar.map((r:any)=><div key={r.asset}><small>{r.asset}</small><strong>{r.side!=='WAIT'?('قرار '+sideAr(r.side)+' · '+r.status):('HUNT '+sideAr(r.huntSide)+' · '+(r.huntState||r.status))}</strong></div>)}</div>
    </section>}

    {auto&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">LIVE DATA GUARD</span><h2>{auto.status==='healthy'?'HEALTHY':auto.status==='recovered'?'RECOVERED':'DEGRADED'}</h2></div><ShieldCheck/></div>
      <div className="levels">
        <div><small>Prices</small><strong>{auto.pricesReady?'READY':'WAIT'}</strong></div>
        <div><small>News</small><strong>{auto.newsReady?'READY':'WAIT'} · {auto.eventCount??0}</strong></div>
        <div><small>BTC</small><strong>{auto.btcSource||'—'}</strong></div>
      </div>
    </section>}

    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}
    <div className="dashboardgrid"><Card x={data?.bitcoin} fast={fastWave?.btc}/><Card x={data?.gold} fast={fastWave?.gold}/></div>
  </div>;
}
