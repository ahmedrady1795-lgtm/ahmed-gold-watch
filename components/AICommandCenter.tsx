'use client';
import {Activity,ShieldCheck,TrendingUp,TrendingDown} from 'lucide-react';
const fmt=(v:any,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function Card({x}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const trade=x.trade, buy=x.action==='BUY', sell=x.action==='SELL';
  return <section className="panel">
    <div className="panelhead"><div><span className="eyebrow">{x.asset} · AI DECISION ENGINE</span><h2>{buy?'BUY SETUP':sell?'SELL SETUP':'WAIT'}</h2></div>{buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}</div>
    <div className="levels">
      <div><small>Confluence</small><strong>{x.confluenceScore}/100</strong></div>
      <div><small>Long</small><strong>{x.longScore}</strong></div>
      <div><small>Short</small><strong>{x.shortScore}</strong></div>
    </div>
    <p><b>{x.title}</b></p>
    <p>السعر: {fmt(x.price,x.asset==='BTC'?0:2)} · المصدر: {x.source}</p>
    {trade?<div className="levels">
      <div><small>Entry</small><strong>{fmt(trade.entry,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>SL</small><strong>{fmt(trade.sl,x.asset==='BTC'?0:2)}</strong></div>
      <div><small>TP</small><strong>{fmt(trade.tp,x.asset==='BTC'?0:2)}</strong></div>
    </div>:<p className="muted">لا توجد صفقة مرشحة الآن؛ المحرك ينتظر اكتمال الشروط.</p>}
    {!!x.reasons?.length&&<div><strong>أسباب التحليل</strong>{x.reasons.map((r:string,i:number)=><p key={i}>• {r}</p>)}</div>}
    {!!x.vetoes?.length&&<div className="safetybox"><ShieldCheck/><p><b>فلاتر المنع</b><br/>{x.vetoes.join(' · ')}</p></div>}
    <p className="muted">{x.note}</p>
  </section>;
}
export default function AICommandCenter({data,error}:any){
  return <div>
    <section className="sidecard"><strong>AI Analysis Layer</strong><p>محرك قرار متعدد الفريمات للذهب وBTC. يخرج BUY/SELL فقط عند اكتمال الشروط؛ التنفيذ الحقيقي غير مفعّل.</p></section>
    {error&&<div className="fatal"><Activity size={18}/><div><strong>AI unavailable</strong><span>{error}</span></div></div>}
    <div className="dashboardgrid"><Card x={data?.gold}/><Card x={data?.bitcoin}/></div>
  </div>;
}
