'use client';
import {ArrowDownRight,ArrowUpRight,Activity,Clock3,Crosshair,ShieldAlert,Target,Zap,Layers3} from 'lucide-react';
import {buildSniperOutlook} from '../lib/sniper-outlook';
import ScalpDesk from './ScalpDesk';
import ForecastIllustration from './ForecastIllustration';

const fmt=(n:unknown,d=2)=>n!=null&&Number.isFinite(Number(n))?
  Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sLabel=(s:any)=>s==='BUY'?'صاعد':s==='SELL'?'هابط':'محايد';

function IndicatorSummary({x,fresh}:{x:any;fresh:boolean}){
  const rows=x?.indicatorMatrix?.rows,core=x?.coreSummary;
  return <details className="sniper-indicators">
    <summary>توافق المؤشرات والفريمات <span>{fresh&&core?core.qualityReady?'تقييم مؤهل':'تحت التقييم':'البيانات غير حديثة'}</span></summary>
    <div className="sniper-timeframes">
      {(['m1','m5','m15','h1'] as const).map(key=>{
        const r=fresh?rows?.[key]:null;
        return <div key={key}><b>{key.toUpperCase()}</b>
          <strong className={r?.bias==='BUY'?'green':r?.bias==='SELL'?'red':''}>{r?sLabel(r.bias):'—'}</strong>
          <small>RSI {fmt(r?.rsi,0)} · ADX {fmt(r?.adx,0)}</small>
        </div>;
      })}
    </div>
  </details>;
}
export function NextMoveCard({x,asset,now,liveQuote,snapshotAt}:{
  x:any;asset:'GOLD'|'BTC';now:number;liveQuote?:any;snapshotAt:unknown
}){
  const sn=buildSniperOutlook(asset,x,liveQuote,now,snapshotAt);
  const v=sn.view,ready=v.side!=='WAIT',rise=v.side==='BUY',fall=v.side==='SELL';
  const name=asset==='GOLD'?'الذهب':'البيتكوين';
  const signal=ready?(rise?'صعود محتمل':'هبوط محتمل'):'بدون إشارة مؤكدة';
  return <article className={'panel sniper-card '+(rise?'sniper-long':fall?'sniper-short':'sniper-neutral')}
    aria-label={'قناص الحركة القادمة '+name}>
    <div className="sniper-head">
      <div className="sniper-name"><span className="sniper-icon"><Crosshair size={19}/></span>
        <div><small>AI PREDATOR / NEXT MOVE</small><h3>{name} <span>{asset==='GOLD'?'XAUUSD':'BTCUSD'}</span></h3></div></div>
      <span className={'sniper-tag '+(ready?'sniper-tag-active':'')}>{sn.stageText}</span>
    </div>
    <div className="sniper-command">
      <div className="sniper-direction">
        <small>السيناريو القادم</small>
        <div className="sniper-direction-value">
          {rise?<ArrowUpRight size={24}/>:fall?<ArrowDownRight size={24}/>:<Activity size={21}/>}
          <strong>{signal}</strong>
        </div>
        <span className="sniper-phase"><Zap size={12}/>{sn.phaseText}
          {sn.compression!=null?' · جاهزية '+sn.compression+'/100':''}</span>
      </div>
      <div className="sniper-price">
        <small>{v.priceFresh?'السعر المرجعي':'السعر غير مباشر'}</small>
        <strong dir="ltr">{fmt(v.price)}</strong>
        <span>{v.sourceAgeSeconds!=null?'عمر السعر '+v.sourceAgeSeconds+'ث':'مصدر السعر غير متاح'}</span>
      </div>
    </div>

    <div className="sniper-clock-grid">
      <div><small><Clock3 size={12}/> بدء الحركة</small>
        <strong>{ready&&sn.activation?'خلال '+sn.activation.min+'–'+sn.activation.max+' د':'قيد التقييم'}</strong>
        <span>نافذة احتمالية وليست موعدًا قطعيًا</span></div>
      <div><small><Target size={12}/> الوصول إلى الهدف الأول</small>
        <strong>{ready&&sn.arrival?'خلال '+sn.arrival.min+'–'+sn.arrival.max+' د':'لا توجد مدة موثوقة'}</strong>
        <span>{sn.arrival?.basis||'لا يُعرض توقيت من غير نموذج متوافق'}</span></div>
    </div>

    {ready&&sn.targets.length>0?<section className="sniper-objectives">
      <div className="sniper-subhead"><b><Target size={15}/> خريطة الأهداف</b><small>مستويات احتمالية قبل الحركة</small></div>
      <div className="sniper-objective-grid">
        {sn.targets.map(t=><div key={t.stage} className="sniper-objective">
          <small>TP{t.stage} {t.kind==='PROJECTION'?'· تقديري':''}</small>
          <strong dir="ltr">{fmt(t.price)}</strong>
          <span dir="ltr">{fmt(t.low)} – {fmt(t.high)}</span>
        </div>)}
      </div>
      <div className="sniper-protection">
        <span><ShieldAlert size={14}/> إبطال السيناريو <b dir="ltr">{fmt(v.invalidation)}</b></span>
        <span>المسافة للهدف {v.targetDistancePct!=null?fmt(v.targetDistancePct,2)+'%':'—'}</span>
      </div>
    </section>:<div className="sniper-empty">
      <ShieldAlert size={16}/><span>{v.reason}. مش هنعرض هدف أو اتجاه قبل اكتمال شروطه.</span>
    </div>}

    <section className="sniper-liquidity">
      <div className="sniper-subhead"><b><Layers3 size={15}/> السيولة والارتداد</b>
        <small>{sn.flow?.source||'السيولة اللحظية غير مؤكدة'}</small></div>
      {sn.flow&&<div className="sniper-flow">
        <div><span className="green">طلب {sn.flow.buy}%</span><span className="red">عرض {sn.flow.sell}%</span></div>
        <div className="sniper-flow-bar"><i style={{width:sn.flow.buy+'%'}}/></div>
      </div>}
      {sn.zones.length>0?<div className="sniper-zone-list">
        {sn.zones.slice(0,4).map((z,i)=><div key={z.label+'-'+i}>
          <small>{z.label}</small><strong dir="ltr">{fmt(z.low)} – {fmt(z.high)}</strong>
        </div>)}
      </div>:<p className="sniper-zone-empty">مناطق السيولة والارتداد في انتظار قراءة حديثة.</p>}
    </section>
    {ready&&sn.evidence.length>0&&<div className="sniper-evidence">
      {sn.evidence.map(s=><span key={s}>{s}</span>)}
    </div>}
    <div className="sniper-foot">
      <span>{v.quality==='READY'?'مراقبة مشروطة':v.quality==='STALE'?'البيانات متأخرة':v.quality==='UNQUALIFIED'?'الدقة التاريخية غير مؤهلة':'رصد فقط'}</span>
      <span>القوة: {ready&&v.confidence!=null?fmt(v.confidence,0)+'/100':'—'}</span>
      {v.directionAccuracy!=null&&<span>دقة سابقة: {fmt(v.directionAccuracy,1)}% ({v.evidenceCount} حالة)</span>}
    </div>
    <IndicatorSummary x={x} fresh={v.forecastFresh&&v.priceFresh}/>
    <small className="sniper-disclaimer">توقّع احتمالي؛ الوقت والأهداف غير مضمونة، وليس أمر تنفيذ.</small>
  </article>;
}
export default function AICommandCenter({data,error,assetView='ALL',now=Date.now(),goldLive}:any){
  const generatedAt=data?.checkedAt;
  const snapshotAgeMs=generatedAt?Math.max(0,now-Number(generatedAt)):null;
  return <div className="ai-clean renewed-ai">
    {error&&!data&&<div className="fatal"><ShieldAlert size={18}/><div><strong>التحليل مش متاح</strong><span>{error}</span></div></div>}
    {snapshotAgeMs!=null&&snapshotAgeMs>90000&&<div className="fatal"><ShieldAlert size={18}/><div>
      <strong>لقطة التحليل متأخرة</strong><span>آخر تحديث منذ {Math.round(snapshotAgeMs/1000)} ثانية؛ الأهداف غير صالحة للتداول.</span>
    </div></div>}
    <section id="market-forecast" className="workspace-section" aria-labelledby="forecast-section-title">
      <div className="workspace-section-heading renewed-section-head">
        <div><span>01 / AI PREDATOR · رادار ما قبل الحركة</span>
          <h2 id="forecast-section-title">قناص الحركة القادمة</h2></div>
        <p>تجميع · تصريف · سيولة · مناطق ارتداد · توقيت ديناميكي</p>
      </div>
      <div className={'dashboardgrid market-pair-grid next-move-grid '+(assetView!=='ALL'?'single-asset':'')}>
        {assetView!=='BTC'&&<NextMoveCard x={data?.gold} asset="GOLD" now={now} liveQuote={goldLive} snapshotAt={generatedAt}/>}
        {assetView!=='GOLD'&&<NextMoveCard x={data?.bitcoin} asset="BTC" now={now} snapshotAt={generatedAt}/>}
      </div>
    </section>
    <ForecastIllustration data={data} now={now} snapshotAt={generatedAt}
      goldLive={goldLive} assetView={assetView}/>
    <section id="scalp-opportunities" className="workspace-section" aria-labelledby="scalp-section-title">
      <div className="workspace-section-heading renewed-section-head">
        <div><span>03 / فرص لحظية</span><h2 id="scalp-section-title">سكالب الثواني</h2></div>
        <p>صفقات ورقية، وليست أوامر وسيط</p>
      </div>
      <div className={'dashboardgrid market-pair-grid '+(assetView!=='ALL'?'single-asset':'')}>
        {assetView!=='BTC'&&(data?.gold?.scalpDesk?<ScalpDesk desk={data.gold.scalpDesk} now={now}/>:<div className="panel workspace-loading">بنجهّز سكالب الذهب…</div>)}
        {assetView!=='GOLD'&&(data?.bitcoin?.scalpDesk?<ScalpDesk desk={data.bitcoin.scalpDesk} now={now}/>:<div className="panel workspace-loading">بنجهّز سكالب البيتكوين…</div>)}
      </div>
    </section>
  </div>;
}
