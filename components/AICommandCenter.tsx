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
  const hunter=x.hunter,liq=x.liquidity,motion=x.motion,behavior=x.behavior,learner=x.scalpLearner,scalp=x.scalp,core=x.adaptiveCore;
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

    <div className="master-box">
      <span>القرار النهائي</span>
      <strong className={buy?'green':sell?'red':'amber'}>{buy?'BUY':sell?'SELL':'WAIT'}</strong>
      <p>{master.reason||'النواة تراقب الحركة ولم تعتمد دخولًا بعد.'}</p>
    </div>

    {hunt&&<div className="hunt-box">
      <div className="hunt-title"><span>🦅 الحركة القادمة المرجحة</span><strong>{sideAr(hunt.side)} · {hunt.state}</strong></div>
      <div className="ai-price-row">
        <div><small>قوة التوقع</small><strong>{calibrated(hunt.score)}</strong></div>
        <div><small>ثبات الاتجاه</small><strong>{hunt.persistence||0}%</strong></div>
        <div><small>الزمن</small><strong>{Math.max(1,Math.round((hunt.horizonSeconds||0)/60))} د</strong></div>
      </div>
      <div className="forecast-levels">
        <div><small>Trigger</small><strong>{fmt(hunt.trigger,2)}</strong></div>
        <div><small>Projected</small><strong>{fmt(hunt.projected,2)}</strong></div>
        <div><small>Invalidation</small><strong>{fmt(hunt.invalidation,2)}</strong></div>
      </div>
      {hunt.commitment&&<p className="muted">Direction Lock: {sideAr(hunt.commitment.side)} · {hunt.commitment.state}{hunt.commitment.pendingSide!=='WAIT'?(' · عكس محتمل '+sideAr(hunt.commitment.pendingSide)+' '+hunt.commitment.pendingCount+'/2'):''}</p>}
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
  return <div className="ai-clean">
    <section className="ai-hero">
      <div><span className="eyebrow">PREDATOR CORE</span><h1>{data?.model||'AI Hunter'}</h1></div>
      {!!data?.radar?.length&&<div className="radar-mini">{data.radar.slice(0,2).map((r:any)=><div key={r.asset}><small>{r.asset}</small><strong>{r.side!=='WAIT'?sideAr(r.side):('HUNT '+sideAr(r.huntSide))}</strong><span>{r.status||r.huntState}</span></div>)}</div>}
    </section>

    {auto?.status&&auto.status!=='healthy'&&<div className="fatal"><ShieldCheck size={18}/><div><strong>Data Guard: {auto.status}</strong><span>بعض المصادر تحتاج مراجعة قبل اعتماد أي صفقة.</span></div></div>}
    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}

    {next&&<section className="next-news">
      <div><small>أقرب خبر</small><strong>{next.name}</strong></div>
      <span>{timeLeft(next.time,now)}</span>
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold}/></div>
  </div>;
}
