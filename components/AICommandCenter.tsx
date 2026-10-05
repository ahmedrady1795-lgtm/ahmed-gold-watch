'use client';
import {Activity,TrendingDown,TrendingUp} from 'lucide-react';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:any)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const calibrated=(v:any)=>Math.min(92,Math.max(0,Math.round(Number(v)||0)));
const timeLeft=(ts:any,now:number)=>{
  const d=Number(ts)-now;if(!Number.isFinite(d))return '';
  if(d<=0)return 'الآن';
  const m=Math.floor(d/60000),h=Math.floor(m/60),mm=m%60;
  return h>0?`بعد ${h}س ${mm}د`:`بعد ${Math.max(1,mm)}د`;
};
const moveAr=(s:any)=>s==='BUY'?'صعود':s==='SELL'?'هبوط':'تذبذب';
const zoneRange=(z:any)=>z&&Number.isFinite(Number(z.low))&&Number.isFinite(Number(z.high))?`${fmt(z.low,2)}–${fmt(z.high,2)}`:'—';
const zoneName=(z:any)=>String(z?.kind||'').includes('DEMAND')||z?.side==='BUY'?'دعم/طلب':String(z?.kind||'').includes('SUPPLY')||z?.side==='SELL'?'مقاومة/عرض':'منطقة';
function nextMoveCopy(hunt:any,stateGraph:any){
  if(!hunt&&!stateGraph)return {title:'لا توجد حركة مؤكدة حاليًا',detail:'النواة تنتظر بيانات أو توافقًا أوضح قبل ترجيح الحركة القادمة.',tone:'amber'};
  const understanding=hunt?.marketUnderstanding;
  const first=understanding?.firstMove?.side||hunt?.nextMove?.side||hunt?.path?.shortSide||stateGraph?.nextSide||'WAIT';
  const follow=understanding?.followMove?.side||hunt?.path?.followSide||'WAIT';
  const pathLabel=String(hunt?.path?.label||'').trim();
  const firstHit=Number(hunt?.nextMove?.firstHitMinutes);
  const confidence=calibrated(understanding?.firstMove?.confidence??hunt?.nextMove?.confidence??hunt?.quality??stateGraph?.nextSideProbability??0);
  const title=String(understanding?.summary||'').trim()||pathLabel||(
    first==='BUY'?'الحركة القادمة المرجحة: صعود':
    first==='SELL'?'الحركة القادمة المرجحة: هبوط':
    'الحركة القادمة المرجحة: تذبذب وانتظار اتجاه أوضح'
  );
  const h1=hunt?.horizons?.oneMinute?.side||hunt?.horizons?.twoMinute?.side||'WAIT',h5=hunt?.horizons?.fiveMinute?.side||'WAIT',h15=hunt?.horizons?.fifteenMinute?.side||'WAIT',h30=hunt?.horizons?.thirtyMinute?.side||'WAIT';
  const timing=Number.isFinite(firstHit)&&firstHit>0?'، وأول حركة معتبرة متوقعة خلال نحو '+firstHit.toFixed(1)+' دقيقة':'';
  const phase=understanding?.mode?(' · فهم السوق: '+String(understanding.mode).replaceAll('_',' ')):'';
  const detail='أول حركة '+moveAr(first)+' بثقة '+confidence+'%'+timing+'. 1د: '+moveAr(h1)+' · 5د: '+moveAr(h5)+' · 15د: '+moveAr(h15)+' · 30د: '+moveAr(h30)+phase+'.';
  return {title,detail,tone:first==='BUY'?'green':first==='SELL'?'red':'amber'};
}

function AssetCard({x,liveQuote}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const hunt=x.huntForecast,recommendation=x.recommendation,goldCore=x.asset==='GOLD'?x.goldForecastCore:null,predator=x.asset==='GOLD'?x.predatorFusionV2:null;
  const core1=goldCore?.horizons?.oneMinute,core5=goldCore?.horizons?.fiveMinute;
  const h1=core1||hunt?.horizons?.oneMinute||hunt?.horizons?.twoMinute||{};
  const h5=core5||hunt?.horizons?.fiveMinute||{};
  const zone=hunt?.zoneForecast||null;
  const path=zone?.pathForecast||null;
  const forecastSide=path?.side&&path.side!=='WAIT'
    ?String(path.side)
    :zone?String(zone.side||'WAIT')
    :(goldCore?.side||hunt?.nextMove?.side||hunt?.marketUnderstanding?.firstMove?.side||'WAIT');
  const displaySide=recommendation?.active?recommendation.action:forecastSide;
  const buy=displaySide==='BUY',sell=displaySide==='SELL';
  const price=x.asset==='GOLD'&&liveQuote?.status==='live'?liveQuote.price:(x.livePulse?.price??x.price);
  const move=nextMoveCopy(hunt,x.stateGraph);
  const structuralTarget=path?.destination?.mid??zone?.target?.mid??null;
  const target=structuralTarget??recommendation?.targets?.scalp??recommendation?.targets?.oneMinute??hunt?.quickSignalTargets?.oneMinute?.price??null;
  const invalid=recommendation?.invalidation??hunt?.invalidation??null;
  const conf=recommendation?.active?calibrated(recommendation.confidence):calibrated(goldCore?.confidence??hunt?.nextMove?.confidence??hunt?.confidence??0);
  const scalpNext=x.scalp?.nextPrice||x.scalp?.fusionV8?.nextPrice||{};
  const scalpSide=x.scalp?.action==='BUY'||x.scalp?.action==='SELL'?x.scalp.action:(scalpNext?.side||'WAIT');
  const scalpPrice=scalpNext?.price??x.scalp?.target?.price??x.scalp?.ambushPlan?.target?.price??hunt?.quickSignalTargets?.oneMinute?.price??null;
  return <section className={"panel ai-asset-card compact-asset "+(buy?'ai-buy':sell?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div><span className="eyebrow">{x.asset==='GOLD'?'XAU/USD':'BTC/USD'}</span><h2>{buy?'الحركة المرجحة: صعود':sell?'الحركة المرجحة: هبوط':'انتظار اتجاه أوضح'}</h2></div>
      {buy?<TrendingUp/>:sell?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row compact-price">
      <div><small>السعر</small><strong>{fmt(price,2)}</strong></div>
      <div><small>الثقة</small><strong>{conf?conf+'%':'—'}</strong></div>
      <div><small>السكالب المتوقع</small><strong className={scalpSide==='BUY'?'green':scalpSide==='SELL'?'red':'amber'}>{fmt(scalpPrice,2)}</strong></div>
    </div>

    <div className="next-move-copy primary-move zone-primary">
      <span>توقع الحركة القادمة · مناطق</span>
      <strong className={forecastSide==='BUY'?'green':forecastSide==='SELL'?'red':'amber'}>
        {path?.side&&path.side!=='WAIT'
          ?`${moveAr(path.side)} نحو ${zoneName(path.destination)} ${zoneRange(path.destination)} · ${Math.round(Number(path.confidence||0))}%`
          :zone
            ?(zone.decisionReady===false||zone.side==='WAIT'
              ?'بين مناطق القرار · الحركة متوازنة'
              :zone?.target
                ?`${moveAr(zone.side)} نحو ${zoneName(zone.target)} ${zoneRange(zone.target)}`
                :zone?.origin
                  ?`${zone.setup||'تفاعل'} عند ${zoneRange(zone.origin)}`
                  :move.title)
            :move.title}
      </strong>
      <p>{path?.scenario||zone?.summary||move.detail}</p>
      {zone?.stability?.locked&&<em className="zone-stability">سيناريو ثابت · {zone.stability.flipsBlocked>0?`تم رفض ${zone.stability.flipsBlocked} انعكاس ضعيف`:'بانتظار كسر المنطقة أو دليل أقوى'}</em>}
      {zone&&<div className="zone-map-mini">
        <div><small>الدعم/الطلب</small><b>{zoneRange(zone.support)}</b></div>
        <div><small>المقاومة/العرض</small><b>{zoneRange(zone.resistance)}</b></div>
        <div><small>السيولة المرجحة</small><b>{zoneRange(path?.destination||zone.target)}</b></div>
        <div><small>منطقة الارتداد</small><b>{zoneRange(path?.reboundZone||zone.origin)}</b></div>
        <div><small>سيولة أعلى</small><b>{zoneRange(path?.upperLiquidity)}</b></div>
        <div><small>سيولة أسفل</small><b>{zoneRange(path?.lowerLiquidity)}</b></div>
      </div>}
    </div>

    <div className="forecast-horizons decision-horizons direction-only">
      {predator?.ok&&<div><small>تأكيد 30ث</small><strong className={predator.horizons.thirtySeconds.side==='BUY'?'green':predator.horizons.thirtySeconds.side==='SELL'?'red':'amber'}>{moveAr(predator.horizons.thirtySeconds.side)}</strong><span>{calibrated(predator.horizons.thirtySeconds.confidence??predator.horizons.thirtySeconds.strength)}%</span></div>}
      <div><small>اتجاه M1</small><strong className={h1.side==='BUY'?'green':h1.side==='SELL'?'red':'amber'}>{moveAr(h1.side)}</strong><span>{calibrated(h1.confidence??h1.strength)}%</span></div>
      <div><small>اتجاه M5</small><strong className={h5.side==='BUY'?'green':h5.side==='SELL'?'red':'amber'}>{moveAr(h5.side)}</strong><span>{calibrated(h5.confidence??h5.strength)}%</span></div>
    </div>

    {goldCore?.ok&&<div className="gold-risk-line">
      <span>عدم اليقين <b>{goldCore.uncertainty}%</b></span>
      <span>خطر الكسر الكاذب <b>{goldCore.fakeoutRisk}%</b></span>
      <span>السوق <b>{String(goldCore.regime||'—').replaceAll('_',' ')}</b></span>
    </div>}

    {(target!=null||invalid!=null)&&<div className="trade-strip compact-levels">
      <div><small>الهدف الأقرب</small><strong>{fmt(target,2)}</strong></div>
      <div><small>إلغاء السيناريو</small><strong>{fmt(invalid,2)}</strong></div>
      <div><small>القرار</small><strong className={recommendation?.active?(buy?'green':'red'):'amber'}>{recommendation?.active?sideAr(recommendation.action):'مراقبة'}</strong></div>
    </div>}
  </section>;
}

export default function AICommandCenter({data,error,fastWave,goldLive,now=Date.now()}:any){
  const auto=data?.autopilot,next=auto?.nextEvent;
  const nextEventDelta=Number(next?.time)-now;
  const showNextEvent=!!next&&Number.isFinite(nextEventDelta)&&nextEventDelta>=0&&nextEventDelta<=10*60*60*1000;
  return <div className="ai-clean">
    {error&&!data&&<div className="fatal"><Activity size={18}/><div><strong>تعذر تحديث AI</strong><span>{error}</span></div></div>}

    {showNextEvent&&<section className="next-news news-impact-card">
      <div className="news-head">
        <div className="news-title-wrap">
          <small>الخبر القادم</small>
          <strong>{next.name}</strong>
          <em>تأثيره المتوقع على السوق</em>
        </div>
        <span className="news-countdown">{timeLeft(next.time,now)}</span>
      </div>

      {(next.forecast||next.previous||next.actual)&&<div className="news-values ordered">
        {next.previous&&<span>السابق <b>{next.previous}</b></span>}
        {next.forecast&&<span>المتوقع <b>{next.forecast}</b></span>}
        {next.actual&&<span className="actual">الفعلي <b>{next.actual}</b></span>}
      </div>}

      <div className="news-impact-grid ordered">
        {[
          {label:'GOLD',name:'الذهب',impact:next.goldImpact},
          {label:'BTC',name:'البتكوين',impact:next.btcImpact}
        ].map(({label,name,impact}:any)=>{
          const s=String(impact?.side||'WAIT');
          const released=String(impact?.phase||'')!=='PRE_EVENT';
          const confidence=Math.round(Number(impact?.confidence||0));
          const risk=Math.round(Number(impact?.risk||0));
          const direction=s==='BUY'?'↑ صعود':s==='SELL'?'↓ هبوط':released?'↔ محايد':'⏳ غير محسوم';
          return <div className="news-impact ordered-impact" key={label}>
            <div className="impact-top">
              <small>{label}</small>
              <b>{name}</b>
            </div>
            <strong className={s==='BUY'?'green':s==='SELL'?'red':'amber'}>
              {direction}{confidence>0?` · ${confidence}%`:''}
            </strong>
            <div className="impact-meta">
              <span>{released?'تأثير فعلي':'قبل الخبر'}</span>
              <em>خطورة {risk}%</em>
            </div>
            <p>{impact?.reason||'سيتم تحديد الاتجاه بعد صدور البيانات ومقارنة Actual بالـ Forecast.'}</p>
          </div>;
        })}
      </div>
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold} liveQuote={goldLive}/></div>
  </div>;
}
