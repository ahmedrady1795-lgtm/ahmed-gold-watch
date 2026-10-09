'use client';
import {useState} from 'react';
import {FX_WATCHLIST,screenFxQuote,type FxSymbol} from '../lib/fx-scalp-screen';

// Universe discovery only. Without a broker-side MT5 data bridge for every
// pair this panel must not display fake FX prices or simulated trade entries.
export default function FxPairWatchlist(){
  const [selected,setSelected]=useState<FxSymbol>('EURUSD');
  const active=FX_WATCHLIST.find(x=>x.symbol===selected)!;
  const readiness=screenFxQuote(active.symbol,0);
  const display=(s:string)=>s.slice(0,3)+'/'+s.slice(3);
  return <details className="panel fx-watchlist" aria-label="قائمة فوركس للسكالب">
    <summary><strong>فوركس · {FX_WATCHLIST.length} أزواج للبحث</strong><span>فتح قائمة اختيار الأسواق · بدون أوامر</span></summary>
    <p className="muted">الأولوية حاليًا لاختيار أسواق الاختبار، مش توصيات BUY/SELL. مفيش ربط BID/ASK وM1/M5 من Exness للأزواج دي لسه.</p>
    <div className="fx-pair-grid">
      {FX_WATCHLIST.map(p=><button type="button" key={p.symbol}
        aria-pressed={selected===p.symbol}
        className={selected===p.symbol?'selected':''}
        onClick={()=>setSelected(p.symbol)}>
        <strong dir="ltr">{display(p.symbol)}</strong><small>{p.priority==='FIRST'?'اختبار أول':'قائمة ثانية'}</small>
      </button>)}
    </div>
    <section className="fx-pair-detail">
      <strong dir="ltr">{display(active.symbol)}</strong>
      <span>{active.label}</span>
      <small>حالة التحقق: {readiness.reason} · حجم النقطة pip = {active.pipSize}</small>
    </section>
    <p className="muted">لتقييم الدخول لازم سعر BID/ASK حي، شموع M1 وM5 مغلقة، عمولة وانزلاق Exness الفعليين، واختبار اتجاه وتكلفة خارج العينة. لحين توافرهم كل الأزواج للمراقبة والبحث فقط.</p>
  </details>;
}
