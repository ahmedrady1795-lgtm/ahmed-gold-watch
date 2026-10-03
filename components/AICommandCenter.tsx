'use client';
import {Activity,ShieldCheck,TrendingUp,TrendingDown} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';

function IndicatorMatrix({x}:any){
  const rows=x?.indicatorMatrix?.rows;if(!rows)return null;
  const order=[['m1','M1'],['m5','M5'],['m15','M15'],['h1','H1']];
  return <div className="sidecard">
    <strong>مصفوفة المؤشرات · Fusion {x.fusion?.buy||0} شراء / {x.fusion?.sell||0} بيع</strong>
    {order.map(([key,label])=>{const r=rows[key];return <div className="kv" key={key}>
      <span>{label} · RSI {r?.rsi??'—'} · ADX {r?.adx??'—'}</span>
      <b className={r?.bias==='BUY'?'green':r?.bias==='SELL'?'red':'amber'}>{sideAr(r?.bias)} {r?.strength||0}/100</b>
    </div>;})}
  </div>;
}

function Card({x}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const trade=x.trade,candidate=x.candidateTrade,buy=x.action==='BUY',sell=x.action==='SELL',pulse=x.livePulse,scalp=x.scalp,scalpTrade=x.scalp?.trade,hunter=x.hunter,liq=x.liquidity,core=x.adaptiveCore;
  return <section className="panel">
    <div className="panelhead"><div><span className="eyebrow">{x.asset} · {x.phase||'SCAN'}</span><h2>{buy?'BUY STRIKE':sell?'SELL STRIKE':hunter?.status==='WATCH'?'WATCH '+sideAr(hunter?.side):'WAIT'} · Quality {x.quality||'—'}</h2></div>{buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}</div>

    <div className="levels">
      <div><small>Fusion</small><strong>{x.fusion?.side||'WAIT'} · {Math.max(x.fusion?.buy||0,x.fusion?.sell||0)}/100</strong></div>
      <div><small>Confidence</small><strong>{x.confidence}/100</strong></div>
      <div><small>Data</small><strong>{x.dataQuality}/100</strong></div>
    </div>

    {hunter&&<div className={hunter.status==='STRIKE'?'safetybox':'sidecard'}>
      <strong>🎯 {hunter.mode} · {sideAr(hunter.side)} · {hunter.status}</strong>
      <p>Score {hunter.score}/100 · حد الهجوم {hunter.threshold} · الفارق {hunter.gap}</p>
      <p>{hunter.reason}</p>
    </div>}

    {pulse&&<div className="levels">
      <div><small>Live Pulse</small><strong>{pulse.direction}</strong></div>
      <div><small>Δ M1</small><strong>{Number(pulse.deltaPct||0).toFixed(3)}%</strong></div>
      <div><small>Momentum</small><strong>{pulse.momentum}/100</strong></div>
    </div>}

    {liq&&<div className="sidecard">
      <strong>🧠 LIQUIDITY BRAIN · {sideAr(liq.side)} {Math.max(liq.buy||0,liq.sell||0)}/100 · Quality {liq.quality}/100</strong>
      <div className="levels">
        <div><small>Order Book</small><strong>{liq.book?.weightedImbalance??0}%</strong></div>
        <div><small>Volume Delta / CVD</small><strong>{liq.flow?.deltaPct??0}%</strong></div>
        <div><small>Acceleration</small><strong>{liq.dynamics?.acceleration??0}</strong></div>
      </div>
      <p>Bid depth {Number(liq.book?.bidDepthUsd||0).toLocaleString('en-US'){'}'} · Ask depth {Number(liq.book?.askDepthUsd||0).toLocaleString('en-US'){'}'} · Spread {liq.book?.spreadBps??'—'} bps</p>
      <p>Microprice edge {liq.book?.microEdge??0} · Wall {sideAr(liq.book?.wallSide)} · Absorption {sideAr(liq.absorption?.side)} {liq.absorption?.score||0}/100</p>
      <p>{liq.absorption?.reason}</p>
      {core&&<p><b>Adaptive weights:</b> Technical {Math.round((core.technicalWeight||0)*100)}% · Liquidity {Math.round((core.liquidityWeight||0)*100)}%</p>}
    </div>}

    <p>السعر {fmt(pulse?.price??x.price,x.asset==='BTC'?2:2)} · {pulse?.source||x.source}</p>

    {trade?<div className="levels">
      <div><small>Entry</small><strong>{fmt(trade.entry,x.asset==='BTC'?2:2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,x.asset==='BTC'?2:2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,x.asset==='BTC'?2:2)}</strong></div>
    </div>:candidate?<div className="sidecard"><strong>مرشح تحت المراقبة</strong><p>Entry {fmt(candidate.entry,2)} · SL {fmt(candidate.sl,2)} · TP {fmt(candidate.tp,2)} · RR {candidate.rr||'—'}</p></div>:null}

    <div className={scalpTrade?'safetybox':'sidecard'}>
      <strong>{scalpTrade?'⚡ '+scalp.title:'⚡ M1 SCALP · WAIT'}</strong>
      {scalpTrade?<p>Entry {fmt(scalpTrade.entry,2)} · SL {fmt(scalpTrade.sl,2)} · TP {fmt(scalpTrade.tp,2)} · Score {scalpTrade.score}/100 · صلاحية {scalpTrade.validForSeconds||75}ث</p>:<p>{scalp?.reason||'بانتظار توافق M1/M5.'}</p>}
    </div>

    <IndicatorMatrix x={x}/>

    {!!x.vetoes?.length&&<div className="sidecard"><ShieldCheck/><p><b>لماذا لم يدخل؟</b><br/>{x.vetoes.join(' · ')}</p></div>}
  </section>;
}

export default function AICommandCenter({data,error}:any){
  const auto=data?.autopilot;
  return <div>
    <section className="sidecard">
      <strong>Predator Core v6 · Adaptive Liquidity Brain</strong>
      <p>نواة تكيفية تجمع Trend + Breakout + Pullback + Reversal + M1 Scalp + المؤشرات متعددة الأطر + الأخبار + Live Pulse + Order Book + Volume Delta/CVD + Microprice + Absorption. وزن السيولة يتغير حسب حالة السوق.</p>
    </section>

    {!!data?.radar?.length&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">OPPORTUNITY RADAR</span><h2>الأولوية الآن: {data.radar[0]?.asset} · {data.radar[0]?.status}</h2></div><Activity/></div>
      <div className="levels">{data.radar.map((r:any)=><div key={r.asset}><small>{r.asset} · {r.mode||'SCAN'}</small><strong>{sideAr(r.side)} · {r.score}/100</strong></div>)}</div>
    </section>}

    {auto&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">LIVE DATA GUARD</span><h2>{auto.status==='healthy'?'HEALTHY':auto.status==='recovered'?'RECOVERED':'DEGRADED'}</h2></div><ShieldCheck/></div>
      <div className="levels">
        <div><small>Prices</small><strong>{auto.pricesReady?'READY':'WAIT'}</strong></div>
        <div><small>News</small><strong>{auto.newsReady?'READY':'WAIT'} · {auto.eventCount??0}</strong></div>
        <div><small>BTC</small><strong>{auto.btcSource||'—'}</strong></div>
      </div>
      {!!auto.actions?.length&&<p><b>Auto recovery:</b> {auto.actions.join(' · ')}</p>}
    </section>}

    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}
    <div className="dashboardgrid"><Card x={data?.bitcoin}/><Card x={data?.gold}/></div>
  </div>;
}
