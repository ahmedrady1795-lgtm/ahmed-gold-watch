'use client';
import {Activity,Clock3,Newspaper,Radar,ShieldAlert,TrendingDown,TrendingUp} from 'lucide-react';
const n=(v:any,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const countdown=(ms:number)=>{const s=Math.round(ms/1000),a=Math.abs(s),m=Math.floor(a/60),r=a%60;return `${s>=0?'بعد':'منذ'} ${m?m+'د ':''}${r}ث`;};
export default function CommandCenter({analysis,quote,events=[],background=[],now=Date.now(),health}:any){
 const sig=analysis?.signal,news=analysis?.news,side=sig?.sideCode==='buy'?'BUY':sig?.sideCode==='sell'?'SELL':null;
 const mode=sig?.mode==='news'?'NEWS MODE':analysis?.state==='setup'?'READY':analysis?.state==='wait'?'WATCH':'NO TRADE';
 const cls=analysis?.state==='setup'?(side==='BUY'?'cc-buy':'cc-sell'):analysis?.state==='wait'?'cc-watch':'cc-stop';
 const next=events.filter((e:any)=>e.importance===3&&e.time>now-6*3600000).sort((a:any,b:any)=>a.time-b.time)[0];
 const dxy=background.find((x:any)=>x.key==='dxy'),y2=background.find((x:any)=>x.key==='us2y'),y10=background.find((x:any)=>x.key==='us10y');
 return <section className={`commandcenter ${cls}`}>
  <div className="cc-main"><div><span className="eyebrow">TRADE COMMAND CENTER</span><h2>{mode}{side?` · ${side}`:''}</h2><p>{analysis?.reason||'بانتظار لقطة سوق مكتملة.'}</p></div><div className="cc-score"><small>التوافق</small><strong>{analysis?.score?Math.max(analysis.score.long,analysis.score.short):'—'}</strong><span>/100</span></div></div>
  <div className="cc-grid">
   <div><span><Radar size={15}/>السعر</span><strong>{n(quote?.price)}</strong><small>{quote?.source||'غير متصل'}</small></div>
   <div><span>{side==='SELL'?<TrendingDown size={15}/>:<TrendingUp size={15}/>}Regime</span><strong>{analysis?.regime?.label||'غير محسوم'}</strong><small>{analysis?.regime?analysis.regime.confidence+'%':'—'}</small></div>
   <div><span><Activity size={15}/>Spread</span><strong>{n(quote?.spread,2)}</strong><small>{quote?.status||'unknown'}</small></div>
   <div><span><Newspaper size={15}/>الخبر القوي</span><strong>{news?.event?.name||next?.name||'لا يوجد ضمن النافذة'}</strong><small>{news?.active?`${news.phase==='released'?'صدر':'متأهب'} · ${countdown((news.event?.time||0)-now)}`:next?countdown(next.time-now):'—'}</small></div>
  </div>
  {sig&&<div className="cc-trade"><div><small>ENTRY</small><b>{n(sig.entry)}</b></div><div><small>SL</small><b>{n(sig.sl)}</b></div><div><small>TP</small><b>{n(sig.tp)}</b></div><div><small>R:R</small><b>{n(sig.rr,2)}</b></div></div>}
  <div className="cc-confirm"><span>DXY <b>{n(dxy?.value,2)}</b> <em>{dxy?.percentChange!=null?`${dxy.percentChange>=0?'+':''}${n(dxy.percentChange,2)}%`:'—'}</em></span><span>US2Y <b>{n(y2?.value,3)}</b></span><span>US10Y <b>{n(y10?.value,3)}</b></span><span className={health?.services?.mt5Bridge?.fresh?'connected':'offline'}>{health?.services?.mt5Bridge?.fresh?'MT5 TICK READY':'MT5 TICK NOT READY'}</span></div>
  {health?.services?.adminSafety?.killSwitch&&<div className="cc-kill"><ShieldAlert size={16}/> KILL SWITCH مفعّل — التنفيذ الحقيقي محظور إداريًا.</div>}
 </section>;
}
