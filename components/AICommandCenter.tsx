'use client';
import {ArrowDownRight,ArrowUpRight,Clock3,ShieldAlert,Target,TrendingUp,Activity} from 'lucide-react';
import {buildNextMoveView} from '../lib/next-move-view';
import ScalpDesk from './ScalpDesk';

const fmt=(n:unknown,d=2)=>n!=null&&Number.isFinite(Number(n))
  ?Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function pct(n:number|null){return n==null?'—':n.toFixed(2)+'%';}
function Liquidity({x,now}:{x:any;now:number}){
  const liq=x?.liquidity,scalp=x?.scalpDesk;
  const depthAt=Number(liq?.checkedAt||0),depthFresh=Boolean(liq?.ok&&depthAt&&
    now-depthAt>=0&&now-depthAt<=12000);
  const buy=Number(liq?.buy),sell=Number(liq?.sell);
  const hasPressure=depthFresh&&Number.isFinite(buy)&&Number.isFinite(sell)&&
    buy>=0&&sell>=0&&Math.abs(buy+sell-100)<=1;
  const cacheFresh=Boolean(scalp?.liquidity?.available&&
    scalp?.checkedAt&&now-Number(scalp.checkedAt)>=0&&
    now-Number(scalp.checkedAt)<=15000);
  const upper=cacheFresh?scalp.liquidity.rangeHigh:null;
  const lower=cacheFresh?scalp.liquidity.rangeLow:null;
  const mode=liq?.mode==='DOM'?'دفتر أوامر':liq?.mode==='CANDLE_FLOW_PROXY'?'تقدير من الشموع':'مصدر غير مؤكد';
  return <section className="next-liquidity" aria-label="السيولة القريبة">
    <div className="next-liq-heading"><b>السيولة القريبة</b>
      <small>{hasPressure?mode:'ضغط السيولة غير مؤكد'}</small></div>
    {hasPressure?<div className="next-orderflow">
      <div className="next-orderflow-labels">
        <span className="green">شراء {Math.round(buy)}%</span>
        <span className="red">بيع {Math.round(sell)}%</span>
      </div>
      <div className="next-orderflow-track" aria-hidden="true">
        <span style={{width:buy+'%'}}/>
      </div>
    </div>:<p className="next-liq-empty">ضغط السيولة غير متاح حاليًا.</p>}
    <div className="next-liq-levels">
      <div><small>سيولة فوق النطاق</small><strong dir="ltr">{cacheFresh?fmt(upper):'—'}</strong></div>
      <div><small>سيولة تحت النطاق</small><strong dir="ltr">{cacheFresh?fmt(lower):'—'}</strong></div>
    </div>

  </section>;
}
function IndicatorSummary({x,fresh}:{x:any;fresh:boolean}){
  const rows=x?.indicatorMatrix?.rows;
  const core=x?.coreSummary;
  const label=(side:unknown)=>side==='BUY'?'صاعد':side==='SELL'?'هابط':'محايد';
  return <details className="indicator-summary">
    <summary><span>المؤشرات والنواة</span><small>{fresh&&core?core.qualityReady?'دليل مؤهل':'قيد التقييم':'بانتظار بيانات حديثة'}</small></summary>
    <div className="indicator-timeframes">
      {(['m1','m5','m15','h1'] as const).map(frame=>{
        const row=fresh?rows?.[frame]:null;
        return <div key={frame}><b>{frame.toUpperCase()}</b><span className={row?.bias==='BUY'?'green':row?.bias==='SELL'?'red':''}>{row?label(row.bias):'—'}</span><small>RSI {fmt(row?.rsi,0)} · ADX {fmt(row?.adx,0)}</small></div>;
      })}
    </div>
    <p>{fresh&&core?'النواة: '+label(core.side)+' · '+core.samples+' عينة مرجعية':'القراءات القديمة لا تُعرض كمؤشرات مباشرة'}</p>
  </details>;
}
export function NextMoveCard({x,asset,now,liveQuote,snapshotAt}:{
  x:any;asset:'GOLD'|'BTC';now:number;liveQuote?:any;snapshotAt:unknown
}){
  const view=buildNextMoveView(asset,x,liveQuote,now,snapshotAt);
  const ready=view.side!=='WAIT';
  const rise=view.side==='BUY',fall=view.side==='SELL';
  const symbol=asset==='GOLD'?'XAU / USD':'BTC / USD';
  const label=asset==='GOLD'?'الذهب':'البيتكوين';
  const confidence=view.confidence!=null&&Number.isFinite(view.confidence)?
    Math.max(0,Math.min(100,Math.round(view.confidence))):null;
  const t1=ready&&view.target!=null?view.target:null;
  const stop=ready&&view.invalidation!=null?view.invalidation:null;
  return <article className={'panel next-move-card '+(rise?'next-up':fall?'next-down':'next-wait')}
    aria-label={'الحركة القادمة '+label}>
    <header className="next-card-head">
      <div><small className="next-kicker">الحركة القادمة · 15 دقيقة</small>
        <h3>{label}<span dir="ltr">{symbol}</span></h3></div>
      <span className={'next-status '+(view.quality==='READY'?'active':'paused')}>
        <span className="next-status-dot" aria-hidden="true"/>
        {view.quality==='READY'?'سيناريو مشروط':
          view.quality==='STALE'?'بيانات متأخرة':
          view.quality==='UNQUALIFIED'?'غير مؤهل':'قيد المراقبة'}
      </span>
    </header>
    <div className="next-hero">
      <div className={'next-direction '+(rise?'green':fall?'red':'amber')}>
        {rise?<ArrowUpRight size={31}/>:fall?<ArrowDownRight size={31}/>:<Activity size={27}/>}
        <span><small>الاتجاه خلال 15 دقيقة</small>
          <strong>{rise?'صعود':fall?'هبوط':'انتظار'}</strong></span>
      </div>
      <div className="next-current-price">
        <small>{view.priceFresh?'السعر المرجعي الآن':'آخر سعر · غير مباشر'}</small>
        <strong dir="ltr">{fmt(view.price)}</strong>
        <span>{view.sourceAgeSeconds!=null?'عمر السعر '+view.sourceAgeSeconds+' ثانية':'وقت المصدر غير متاح'}</span>
      </div>
    </div>
    <div className="next-reason">
      {ready?<TrendingUp size={16}/>:<ShieldAlert size={16}/>}
      <span>{view.reason}</span>
    </div>
    {ready&&<div className="next-target-map">
      <div className="next-target-head"><span><Target size={16}/> المسار المتوقع</span>
        <small>{ready?'هدف مرصود وإبطال واضح':'من غير أهداف تداول لحد اكتمال الشروط'}</small>
      </div>
      <div className="next-target-grid">
        <div><small>الهدف الأول</small><strong className={rise?'green':fall?'red':''} dir="ltr">{fmt(t1)}</strong>
          <span>{pct(view.targetDistancePct)} من السعر</span></div>
        <div><small>إبطال السيناريو</small><strong dir="ltr">{fmt(stop)}</strong>
          <span>{pct(view.riskDistancePct)} من السعر</span></div>
      </div>
      {ready&&view.targetDistancePct!=null&&view.riskDistancePct!=null&&
        <div className="next-risk-note">المسافة للهدف مقارنة بالإبطال:
          <b> {view.riskDistancePct>0?
            (view.targetDistancePct/view.riskDistancePct).toFixed(2)+' : 1':'—'}</b>
          <span> (هندسة مستويات فقط، قبل السبريد والعمولات)</span>
        </div>}
    </div>}
    <Liquidity x={x} now={now}/>
    <IndicatorSummary x={x} fresh={view.forecastFresh&&view.priceFresh}/>
    <div className="next-card-foot">
      {view.hasHistoricalBand&&<span><Clock3 size={14}/> النطاق التاريخي لإغلاق 15 دقيقة:
        <b dir="ltr">{fmt(view.bandLower)} – {fmt(view.bandUpper)}</b>
      </span>}
      <span>قوة السيناريو: {ready&&confidence!=null?confidence+'/100':'غير معتمدة'} · مش نسبة نجاح</span>
      {view.directionAccuracy!=null&&<span>اختبار الاتجاه: {fmt(view.directionAccuracy,1)}%
        من {view.evidenceCount} حالة · ليس ضمانًا</span>}

    </div>
  </article>;
}
export default function AICommandCenter({data,error,assetView='ALL',now=Date.now(),goldLive}:any){
  const generatedAt=data?.checkedAt;
  const snapshotAgeMs=generatedAt?Math.max(0,now-Number(generatedAt)):null;
  return <div className="ai-clean renewed-ai">
    {error&&!data&&<div className="fatal"><ShieldAlert size={18}/>
      <div><strong>التحليل مش متاح</strong><span>{error}</span></div></div>}
    {snapshotAgeMs!=null&&snapshotAgeMs>90000&&
      <div className="fatal"><ShieldAlert size={18}/><div>
        <strong>لقطة التحليل متأخرة</strong>
        <span>آخر تحديث منذ {Math.round(snapshotAgeMs/1000)} ثانية. السيناريوهات مش صالحة للدخول.</span>
      </div></div>}
    <section id="scalp-opportunities" className="workspace-section" aria-labelledby="scalp-section-title">
      <div className="workspace-section-heading renewed-section-head">
        <div><span>01 / قرارات سريعة</span>
          <h2 id="scalp-section-title">سكالب الثواني</h2></div>
        <p>إشارات ورقية بصلاحية 15 ثانية</p>
      </div>
      <div className={'dashboardgrid market-pair-grid '+(assetView!=='ALL'?'single-asset':'')}>
        {assetView!=='BTC'&&(data?.gold?.scalpDesk?
          <ScalpDesk desk={data.gold.scalpDesk} now={now}/>:
          <div className="panel workspace-loading">بنجهّز سكالب الذهب…</div>)}
        {assetView!=='GOLD'&&(data?.bitcoin?.scalpDesk?
          <ScalpDesk desk={data.bitcoin.scalpDesk} now={now}/>:
          <div className="panel workspace-loading">بنجهّز سكالب البيتكوين…</div>)}
      </div>
    </section>
    <section id="market-forecast" className="workspace-section" aria-labelledby="forecast-section-title">
      <div className="workspace-section-heading renewed-section-head">
        <div><span>02 / سيناريو السعر والسيولة</span>
          <h2 id="forecast-section-title">الحركة القادمة</h2></div>
        <p>الاتجاه المتوقع ومستويات السيولة</p>
      </div>
      <div className={'dashboardgrid market-pair-grid next-move-grid '+(assetView!=='ALL'?'single-asset':'')}>
        {assetView!=='BTC'&&<NextMoveCard x={data?.gold} asset="GOLD" now={now}
          liveQuote={goldLive} snapshotAt={generatedAt}/>}
        {assetView!=='GOLD'&&<NextMoveCard x={data?.bitcoin} asset="BTC" now={now}
          snapshotAt={generatedAt}/>}
      </div>
    </section>
  </div>;
}
