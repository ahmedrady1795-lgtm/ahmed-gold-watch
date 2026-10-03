'use client';
import {Activity,ShieldCheck,TrendingUp,TrendingDown} from 'lucide-react';
const fmt=(v:any,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function Card({x}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const trade=x.trade,candidate=x.candidateTrade,buy=x.action==='BUY',sell=x.action==='SELL';
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
    <p>السعر: {fmt(x.price,x.asset==='BTC'?0:2)} · السعر: {x.source} · الشموع: {x.candleSource}</p>
    {trade?<div className="levels">
      <div><small>Entry</small><strong>{fmt(trade.entry,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,x.asset==='BTC'?0:2)}</strong></div>
    </div>:candidate?<div className="safetybox"><ShieldCheck/><p><b>Candidate فقط — غير مؤكد بعد</b><br/>Entry {fmt(candidate.entry,x.asset==='BTC'?0:2)} · SL {fmt(candidate.sl,x.asset==='BTC'?0:2)} · TP {fmt(candidate.tp,x.asset==='BTC'?0:2)}</p></div>:<p className="muted">لا توجد صفقة مرشحة الآن؛ المحرك ينتظر اكتمال الشروط.</p>}
    <p className="muted">MTF: {x.ensemble?.mtf?.up||0} صاعد / {x.ensemble?.mtf?.down||0} هابط · Structure {x.ensemble?.structure?.side||'WAIT'} {x.ensemble?.structure?.strength||0}/100</p>
    {!!x.reasons?.length&&<div><strong>أسباب التحليل</strong>{x.reasons.map((r:string,i:number)=><p key={i}>• {r}</p>)}</div>}
    {!!x.vetoes?.length&&<div className="safetybox"><ShieldCheck/><p><b>فلاتر المنع</b><br/>{x.vetoes.join(' · ')}</p></div>}
    <p className="muted">{x.note}</p>
  </section>;
}
export default function AICommandCenter({data,error}:any){
  return <div>
    <section className="sidecard"><strong>Quant Ensemble v2</strong><p>محرك قرار متعدد الطبقات: MTF + Momentum + Structure + Regime + Volatility + Data Quality + Temporal Confirmation. يرفض الإشارات الضعيفة بدل إجبار BUY/SELL.</p></section>
    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}
    <div className="dashboardgrid"><Card x={data?.gold}/><Card x={data?.bitcoin}/></div>
  </div>;
}
