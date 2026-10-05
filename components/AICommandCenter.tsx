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
  const forecastSide=goldCore?.side||hunt?.nextMove?.side||hunt?.marketUnderstanding?.firstMove?.side||'WAIT';
  const displaySide=recommendation?.active?recommendation.action:forecastSide;
  const buy=displaySide==='BUY',sell=displaySide==='SELL';
  const price=x.asset==='GOLD'&&liveQuote?.status==='live'?liveQuote.price:(x.livePulse?.price??x.price);
  const move=nextMoveCopy(hunt,x.stateGraph);
  const target=recommendation?.targets?.scalp??recommendation?.targets?.oneMinute??hunt?.quickSignalTargets?.oneMinute?.price??null;
  const invalid=recommendation?.invalidation??hunt?.invalidation??null;
  const conf=recommendation?.active?calibrated(recommendation.confidence):calibrated(goldCore?.confidence??hunt?.nextMove?.confidence??hunt?.confidence??0);
  const scalpNext=x.scalp?.nextPrice||x.scalp?.fusionV8?.nextPrice||{};
  const scalpSide=x.scalp?.action==='BUY'||x.scalp?.action==='SELL'?x.scalp.action:(scalpNext?.side||'WAIT');
  const scalpPrice=scalpNext?.price??x.scalp?.target?.price??x.scalp?.ambushPlan?.target?.price??hunt?.quickSignalTargets?.oneMinute?.price??null;
  const forecastPrice1=predator?.horizons?.oneMinute?.price??(core1?.expectedMove!=null&&price!=null?Number(price)+(core1.side==='SELL'?-1:1)*Number(core1.expectedMove):hunt?.quickSignalTargets?.oneMinute?.price??scalpPrice);
  const forecastPrice5=predator?.horizons?.fiveMinutes?.price??(core5?.expectedMove!=null&&price!=null?Number(price)+(core5.side==='SELL'?-1:1)*Number(core5.expectedMove):hunt?.quickSignalTargets?.fiveMinute?.price??hunt?.movementStations?.[1]?.price??null);
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

    <div className="next-move-copy primary-move">
      <span>توقع الحركة القادمة</span>
      <strong className={move.tone}>{forecastPrice1!=null?('≈ '+fmt(forecastPrice1,2)):move.title}</strong>
      <p>{move.detail}{forecastPrice5!=null?' · هدف 5د ≈ '+fmt(forecastPrice5,2):''}</p>
    </div>

    {predator?.ok&&<div className="forecast-horizons decision-horizons">
      <div><small>30ث المتوقع</small><strong className={predator.horizons.thirtySeconds.side==='BUY'?'green':predator.horizons.thirtySeconds.side==='SELL'?'red':'amber'}>{fmt(predator.horizons.thirtySeconds.price,2)}</strong><span>{predator.horizons.thirtySeconds.low}–{predator.horizons.thirtySeconds.high}</span></div>
      <div><small>3د المتوقع</small><strong className={predator.horizons.threeMinutes.side==='BUY'?'green':predator.horizons.threeMinutes.side==='SELL'?'red':'amber'}>{fmt(predator.horizons.threeMinutes.price,2)}</strong><span>{predator.horizons.threeMinutes.low}–{predator.horizons.threeMinutes.high}</span></div>
    </div>}
    <div className="forecast-horizons decision-horizons">
      <div><small>M1 المتوقع</small><strong className={h1.side==='BUY'?'green':h1.side==='SELL'?'red':'amber'}>{fmt(forecastPrice1,2)}</strong><span>{calibrated(h1.confidence??h1.strength)}%</span></div>
      <div><small>M5 المتوقع</small><strong className={h5.side==='BUY'?'green':h5.side==='SELL'?'red':'amber'}>{fmt(forecastPrice5,2)}</strong><span>{calibrated(h5.confidence??h5.strength)}%</span></div>
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
        <div><small>أقرب خبر</small><strong>{next.name}</strong></div>
        <span>{timeLeft(next.time,now)}</span>
      </div>
      <div className="news-impact-grid">
        {[
          {label:'GOLD',impact:next.goldImpact},
          {label:'BTC',impact:next.btcImpact}
        ].map(({label,impact}:any)=>{
          const s=String(impact?.side||'WAIT');
          const released=String(impact?.phase||'')!=='PRE_EVENT';
          return <div className="news-impact" key={label}>
            <small>{label} · {released?'تأثير الخبر':'الميل المتوقع'}</small>
            <strong className={s==='BUY'?'green':s==='SELL'?'red':'amber'}>
              {s==='BUY'?'↑ صعود':s==='SELL'?'↓ هبوط':'↔ محايد'}
              {Number(impact?.confidence)>0?` · ${Math.round(Number(impact.confidence))}%`:''}
            </strong>
            <em>خطورة {Math.round(Number(impact?.risk||0))}%</em>
          </div>;
        })}
      </div>
      {(next.forecast||next.previous)&&<div className="news-values">
        {next.forecast&&<span>Forecast <b>{next.forecast}</b></span>}
        {next.previous&&<span>Previous <b>{next.previous}</b></span>}
        {next.actual&&<span>Actual <b>{next.actual}</b></span>}
      </div>}
    </section>}

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc}/><AssetCard x={data?.gold} fast={fastWave?.gold} liveQuote={goldLive}/></div>
  </div>;
}
