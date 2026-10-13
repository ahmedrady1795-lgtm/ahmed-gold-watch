'use client';
import {useMemo} from 'react';
import {Crosshair,Activity,ShieldAlert} from 'lucide-react';
import {evaluateSniperStrategies} from '../lib/sniper-strategies';
import type {LiquidityContext} from '../lib/liquidity-foundation';
const fmt=(v:number|null,d=1)=>v==null?'—':v.toLocaleString('en-US',{maximumFractionDigits:d});
export default function SniperStrategyRadar({frames,now,price,side,sourceReady,targets,stop,liquidityContext}: {
  frames:any;now:number;price:number|null;side:'BUY'|'SELL'|'WAIT';sourceReady:boolean;
  targets:Array<{price:number}>;stop:number|null;liquidityContext?:LiquidityContext|null
}){
  // Candle indicators change only with new history. Current price and freshness
  // are still reevaluated; the 1-second clock doesn't create new confirmation bars.
  const minute=Math.floor(now/60000);
  const target=targets[0]?.price??null;
  const analysis=useMemo(()=>evaluateSniperStrategies({frames,now:minute*60000,price,side,sourceReady,
    targets:target==null?[]:[{price:target}],stop,liquidityContext}),
    [frames,minute,price,side,sourceReady,target,stop,liquidityContext]);
  return <details id="sniper-strategies" className="sniper-strategy-radar" aria-label="استراتيجيات ومؤشرات القناص">
    <summary className="sniper-strategy-head"><strong><Crosshair size={17}/> المؤشرات وشروط الدخول</strong>
      <span className={analysis.eligible?'sniper-radar-confirmed':''}>{analysis.regimeLabel} · {analysis.eligible?'تأكيد فني أولي':'انتظار تأكيد'}</span></summary>
    <p className="sniper-strategy-reason"><ShieldAlert size={14}/>{analysis.reason}</p>
    {analysis.ready&&<>
      <p className="sniper-liquidity-foundation">أساس الحركة والسيولة: {analysis.liquidity.evidence} · {analysis.liquidity.volumeLabel} · {analysis.liquidity.reason}</p>
      <div className="sniper-indicator-grid">
        <div><small>قوة الاتجاه · ADX M15</small><b dir="ltr">{fmt(analysis.frames?.m15.adx??null)}</b><span>{(analysis.frames?.m15.adx??0)>=23?'اتجاه أقوى':'اتجاه ضعيف / توازن'}</span></div>
        <div><small>زخم · RSI M15</small><b dir="ltr">{fmt(analysis.frames?.m15.rsi??null)}</b><span>زخم مؤيد يحتاج تأكيد السعر</span></div>
        <div><small>امتداد عن EMA20 · M5</small><b dir="ltr">{fmt(analysis.extensionAtr)} ATR</b><span>{(analysis.extensionAtr??0)>2.5?'امتداد زائد؛ انتظار رجوع':'ضمن المدى المرصود'}</span></div>
        <div><small>عائد / مخاطرة الهدف الأول</small><b dir="ltr">{analysis.rr==null?'—':'1 : '+fmt(analysis.rr,2)}</b><span>من الهدف والإبطال الظاهرين</span></div>
      </div>
      <div className="sniper-frame-agreement" aria-label="توافق الأطر والمؤشرات">
        {(['m5','m15','h1'] as const).map(frame=>{
          const item=analysis.frames![frame];
          return <span key={frame} className={item.side==='BUY'?'sniper-frame-buy':item.side==='SELL'?'sniper-frame-sell':''}>
            <b>{frame.toUpperCase()}</b> {item.side==='BUY'?'ميل شراء':item.side==='SELL'?'ميل بيع':'متوازن'}
            <small dir="ltr">ADX {fmt(item.adx)} · +DI {fmt(item.plusDI)} / −DI {fmt(item.minusDI)}</small>
          </span>;
        })}
      </div>
      <div className="sniper-strategy-grid">
        {analysis.strategies.map(s=><article key={s.id} className={'sniper-strategy-card sniper-strategy-'+s.state.toLowerCase()}>
          <div><strong><Activity size={14}/>{s.name}</strong><span>{s.state==='CONFIRMED'?'تأكيد مغلق':s.state==='BUILDING'?'يتكوّن':'رصد'}</span></div>
          <p>{s.reason}</p>{s.level!=null&&<small>مستوى مرجعي <b dir="ltr">{fmt(s.level,2)}</b></small>}
        </article>)}
      </div>
      <div className="sniper-strategy-details">
        <p>Supertrend (10,3): M15 {analysis.technical.supertrendM15==='BUY'?'صعود':analysis.technical.supertrendM15==='SELL'?'هبوط':'غير مكتمل'} · H1 {analysis.technical.supertrendH1==='BUY'?'صعود':analysis.technical.supertrendH1==='SELL'?'هبوط':'غير مكتمل'} · خط M15: {fmt(analysis.technical.supertrendM15Line,2)}. Bollinger/Keltner: {analysis.technical.keltnerRelease?'تحرر بكسر M15':analysis.technical.keltnerSqueeze?'انضغاط قائم':'بدون ضغط مؤكد'} · تغيّر ADX M15 خلال 3 شموع: {fmt(analysis.technical.adxSlopeM15,2)}.</p>
        <p>CHOP: {fmt(analysis.choppiness)} · رتبة عرض بولينجر: {fmt(analysis.squeezePercentile)}% من آخر 60 قراءة · كفاءة الحركة: {fmt((analysis.efficiency??0)*100)}% · ATR M15: {fmt(analysis.frames?.m15.atr??null,2)}.</p>
        <p>آخر تأكيد M5: {new Date(analysis.confirmedAt!).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})} بتوقيت الإمارات. الحسابات من شموع مغلقة فقط.</p>
        {analysis.blockers.map(reason=><p key={reason}>• {reason}</p>)}
        <p>الرادار يقيّم فرصًا جديدة حسب اتجاه وأهداف الرسم. التأكيد الفني وحده لا يمنح إشارة دخول؛ السيناريو المعتمد يظهر مسجّلًا على الرسم. الأهداف الهيكلية للمراقبة مستقلة عن تأكيد الدخول. هذه قواعد فنية غير مثبتة الربحية؛ سجل الأداء هو مرجع تقييمها.</p>
        <p>تعريف المؤشرات: <a href="https://www.tradingview.com/support/solutions/43000634738-supertrend/" target="_blank" rel="noreferrer">Supertrend</a> · <a href="https://www.tradingview.com/support/solutions/43000502266-keltner-channels-kc/" target="_blank" rel="noreferrer">Keltner</a> · <a href="https://www.tradingview.com/support/solutions/43000589099-average-directional-index-adx/" target="_blank" rel="noreferrer">ADX / DMI</a> · <a href="https://www.tradingview.com/support/solutions/43000501972-bollinger-bandwidth-bbw/" target="_blank" rel="noreferrer">Bollinger BandWidth</a> · <a href="https://www.tradingview.com/support/solutions/43000501980-choppiness-index-chop/" target="_blank" rel="noreferrer">CHOP</a></p>
      </div>
    </>}
  </details>;
}
