'use client';
import {Activity,ShieldCheck,TrendingUp,TrendingDown} from 'lucide-react';
const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function Card({x}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const trade=x.trade,candidate=x.candidateTrade,buy=x.action==='BUY',sell=x.action==='SELL',pulse=x.livePulse,scalp=x.scalp,scalpTrade=x.scalp?.trade,hunter=x.hunter;
  return <section className="panel">
    <div className="panelhead"><div><span className="eyebrow">{x.asset} · {x.model||'AI ENGINE'}</span><h2>{buy?'BUY SETUP':sell?'SELL SETUP':'WAIT'} · Quality {x.quality||'—'}</h2></div>{buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}</div>
    <div className="levels">
      <div><small>Confidence</small><strong>{x.confidence}/100</strong></div>
      <div><small>Confluence</small><strong>{x.confluenceScore}/100</strong></div>
      <div><small>Stability</small><strong>{x.stability}/100</strong></div>
    </div>
    <div className="levels">
      <div><small>Data Quality</small><strong>{x.dataQuality}/100</strong></div>
      <div><small>Uncertainty</small><strong>{x.uncertainty}/100</strong></div>
      <div><small>Bias</small><strong>{x.bias}</strong></div>
    </div>
    <p><b>{x.title}</b></p>
    {hunter&&<div className={hunter.status==='STRIKE'?'safetybox':'sidecard'}>
      <strong>🎯 HUNTER {hunter.status} · {hunter.mode} · {hunter.side}</strong>
      <p>Score {hunter.score}/100 · Strike threshold {hunter.threshold} · Gap {hunter.gap}</p>
      <p>{hunter.reason}</p>
      {hunter.trade&&<p>Candidate Entry {fmt(hunter.trade.entry,x.asset==='BTC'?0:2)} · SL {fmt(hunter.trade.sl,x.asset==='BTC'?0:2)} · TP {fmt(hunter.trade.tp,x.asset==='BTC'?0:2)} · RR {hunter.trade.rr}</p>}
    </div>}
    {pulse&&<div className="levels">
      <div><small>Live Pulse</small><strong>{pulse.direction}</strong></div>
      <div><small>Δ M1</small><strong>{Number(pulse.deltaPct).toFixed(3)}%</strong></div>
      <div><small>Live Momentum</small><strong>{pulse.momentum}/100</strong></div>
    </div>}
    <p>السعر: {fmt(pulse?.price??x.price,x.asset==='BTC'?0:2)} · السعر: {pulse?.source||x.source} · الشموع: {x.candleSource}</p>
    {trade?<div className="levels">
      <div><small>Entry</small><strong>{fmt(trade.entry,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,x.asset==='BTC'?0:2)}</strong></div>
    </div>:candidate?<div className="safetybox"><ShieldCheck/><p><b>Candidate فقط — غير مؤكد بعد</b><br/>Entry {fmt(candidate.entry,x.asset==='BTC'?0:2)} · SL {fmt(candidate.sl,x.asset==='BTC'?0:2)} · TP {fmt(candidate.tp,x.asset==='BTC'?0:2)}</p></div>:<p className="muted">لا توجد صفقة مرشحة الآن؛ المحرك ينتظر اكتمال الشروط.</p>}
    <div className={scalpTrade?'safetybox':'sidecard'}>
      <strong>{scalpTrade?'⚡ '+scalp.title:'⚡ M1 SCALP · WAIT'}</strong>
      {scalpTrade?<p>Entry {fmt(scalpTrade.entry,x.asset==='BTC'?0:2)} · SL {fmt(scalpTrade.sl,x.asset==='BTC'?0:2)} · TP {fmt(scalpTrade.tp,x.asset==='BTC'?0:2)} · Score {scalpTrade.score}/100 · صالح تقريبًا {scalpTrade.validForSeconds||90}ث</p>:<p>{scalp?.reason||'بانتظار توافق M1/M5.'}</p>}
    </div>
    <p className="muted">MTF: {x.ensemble?.mtf?.up||0} صاعد / {x.ensemble?.mtf?.down||0} هابط · Structure {x.ensemble?.structure?.side||'WAIT'} {x.ensemble?.structure?.strength||0}/100</p>
    {!!x.reasons?.length&&<div><strong>أسباب التحليل</strong>{x.reasons.map((r:string,i:number)=><p key={i}>• {r}</p>)}</div>}
    {!!x.vetoes?.length&&<div className="safetybox"><ShieldCheck/><p><b>فلاتر المنع</b><br/>{x.vetoes.join(' · ')}</p></div>}
    <p className="muted">{x.note}</p>
  </section>;
}
export default function AICommandCenter({data,error}:any){
  const auto=data?.autopilot;
  return <div>
    <section className="sidecard"><strong>Quant Hunter v4 · Adaptive Strike Engine</strong><p>3 محركات صيد مستقلة: Trend Continuation + Breakout Ignition + Range Reversal، مع Live Pulse وMTF وRegime وAdaptive Thresholds. يخرج Standard + Hunter + M1 Adaptive Scalp ويعيد تحميل المصادر عند نقص البيانات.</p></section>
    {auto&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">AI SYSTEM GUARD</span><h2>{auto.status==='healthy'?'SYSTEM HEALTHY':auto.status==='recovered'?'AUTO-RECOVERED':'DEGRADED'}</h2></div><ShieldCheck/></div>
      <div className="levels"><div><small>Prices</small><strong>{auto.pricesReady?'READY':'WAIT'}</strong></div><div><small>News</small><strong>{auto.newsReady?'READY':'DEGRADED'} · {auto.eventCount??0}</strong></div><div><small>BTC Source</small><strong>{auto.btcSource||'—'}</strong></div></div>
      {!!auto.actions?.length&&<p><b>تصحيح تلقائي:</b> {auto.actions.join(' · ')}</p>}
      {!!auto.detected?.length&&<p className="muted"><b>مشاكل مكتشفة:</b> {auto.detected.join(' · ')}</p>}
    </section>}
    {!!data?.radar?.length&&<section className="panel">
      <div className="panelhead"><div><span className="eyebrow">OPPORTUNITY RADAR</span><h2>أفضل فرصة الآن: {data.radar[0]?.asset} · {data.radar[0]?.status}</h2></div><Activity/></div>
      <div className="levels">{data.radar.map((r:any)=><div key={r.asset}><small>{r.asset} · {r.mode||'SCAN'}</small><strong>{r.side} · {r.score}/100</strong></div>)}</div>
    </section>}
    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}
    <div className="dashboardgrid"><Card x={data?.gold}/><Card x={data?.bitcoin}/></div>
  </div>;
}
