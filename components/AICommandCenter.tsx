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
const phaseAr=(p:any)=>p==='ACCUMULATING'?'تجميع':p==='DISTRIBUTING'?'تصريف':p==='MARKUP_READY'?'تجميع جاهز للصعود':p==='MARKDOWN_READY'?'تصريف جاهز للهبوط':'توازن';
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

function fastScalpProjection(price:any,fast:any){
  const p=Number(price),at=Number(fast?.at||0),age=Date.now()-at;
  const side=fast?.side==='BUY'||fast?.side==='SELL'?fast.side:'WAIT';
  const confidence=Number(fast?.confidence||0);
  if(!Number.isFinite(p)||p<=0||!fast?.ok||side==='WAIT'||!Number.isFinite(at)||age<0||age>2600||confidence<28)return null;
  const v1=Math.abs(Number(fast?.velocity1s||0)),v3=Math.abs(Number(fast?.velocity3s||0)),acc=Math.abs(Number(fast?.acceleration||0));
  const burst=Math.max(0,Number(fast?.burstRate||1)-1);
  const stage=String(fast?.stage||'WARMING');
  const stageMult=stage==='IGNITION'?1.45:stage==='WAVE_FORMING'?1.18:stage==='PRE_TRIGGER'?1.0:.72;
  const rawBps=Math.min(3.2,Math.max(.10,v1*.62+v3*.10+acc*.52+burst*.16));
  const signedBps=(side==='BUY'?1:-1)*rawBps*stageMult;
  return {side,price:p*(1+signedBps/10000),confidence:Math.round(confidence),stage,bps:Number(signedBps.toFixed(2))};
}

function AssetCard({x,liveQuote,fast,preMove}:any){
  if(!x)return <section className="panel"><p>بانتظار التحليل…</p></section>;
  const hunt=x.huntForecast,recommendation=x.recommendation,goldCore=x.asset==='GOLD'?x.goldForecastCore:null,predator=x.asset==='GOLD'?x.predatorFusionV2:null;
  const core1=goldCore?.horizons?.oneMinute,core5=goldCore?.horizons?.fiveMinute;
  const h1=core1||hunt?.horizons?.oneMinute||hunt?.horizons?.twoMinute||{};
  const h5=core5||hunt?.horizons?.fiveMinute||{};
  const zone=hunt?.zoneForecast||null;
  const path=zone?.pathForecast||null;
  const forecastSide=path?.side&&path.side!=='WAIT'
    ?String(path.side)
    :path?.priceDestination?.side&&path.priceDestination.side!=='WAIT'
      ?String(path.priceDestination.side)
      :zone?String(zone.side||'WAIT')
      :(goldCore?.side||hunt?.nextMove?.side||hunt?.marketUnderstanding?.firstMove?.side||'WAIT');
  const displaySide=forecastSide;
  const softDestination=Boolean((path?.side==='WAIT'&&path?.priceDestination?.zone)||guardWatching);
  const buy=displaySide==='BUY'&&!softDestination,sell=displaySide==='SELL'&&!softDestination;
  const liveGoldPrice=x.asset==='GOLD'&&liveQuote?.ok&&Number.isFinite(Number(liveQuote?.price))&&Number(liveQuote.price)>0?Number(liveQuote.price):null;
  const price=liveGoldPrice??x.livePulse?.price??x.price;
  const move=nextMoveCopy(hunt,x.stateGraph);
  const priceDestination=path?.priceDestination?.zone??path?.destination??zone?.target??null;
  const structuralTarget=priceDestination?.mid??null;
  const target=structuralTarget??recommendation?.targets?.scalp??recommendation?.targets?.oneMinute??hunt?.quickSignalTargets?.oneMinute?.price??null;
  const invalid=path?.invalidation?.price??recommendation?.invalidation??hunt?.invalidation??null;
  const conf=path?.side&&path.side!=='WAIT'
    ?calibrated(path.confidence)
    :path?.priceDestination
      ?calibrated(path.priceDestination.confidence)
      :calibrated(goldCore?.confidence??hunt?.nextMove?.confidence??hunt?.confidence??0);
  const waveLeadView=fast?.ok?{
    available:true,armed:false,side:fast.side||'WAIT',
    stage:fast.stage==='IGNITION'||fast.stage==='WAVE_FORMING'?'RELEASED':fast.stage==='PRE_TRIGGER'||fast.stage==='COILED'?'BUILDING':'OBSERVE',
    mode:'MICRO_FLOW',
    score:Number(fast.score||0),confidence:Number(fast.confidence||0),stability:Number(fast.persistence||0),
    source:x.asset==='GOLD'?'Biquote live WebSocket micro-flow':'Coinbase live WebSocket micro-flow',
    reason:Array.isArray(fast.reasons)&&fast.reasons.length?fast.reasons.slice(0,3).join(' · '):'قراءة micro-flow لحظية من التسارع والسبريد وتتابع الـticks.',
    metrics:{bookImbalance:Number(fast.imbalance||0),pressureChange:0,replenishDelta:0,acceleration:Number(fast.acceleration||0),persistence:Number(fast.persistence||0)}
  }:null;
  const leadView=preMove?.available?preMove:waveLeadView||preMove;
  const forward=x.forwardMove||null;
  const forwardSide=forward?.side==='BUY'||forward?.side==='SELL'?forward.side:'WAIT';
  const forwardZone=forward?.zone||null;
  const forwardTarget=Number.isFinite(Number(forward?.target))?Number(forward.target):null;
  const forwardWindow=forward?.windowSeconds?(`${forward.windowSeconds.min}–${forward.windowSeconds.max} ث`):'—';
  const scalpNext=x.scalp?.nextPrice||x.scalp?.fusionV8?.nextPrice||{};
  const fastScalp=fastScalpProjection(price,fast);
  const scalpSide=fastScalp?.side??(x.scalp?.action==='BUY'||x.scalp?.action==='SELL'?x.scalp.action:(scalpNext?.side||'WAIT'));
  const scalpPrice=fastScalp?.price??scalpNext?.price??x.scalp?.target?.price??x.scalp?.ambushPlan?.target?.price??hunt?.quickSignalTargets?.oneMinute?.price??null;
  return <section className={"panel ai-asset-card compact-asset "+(buy?'ai-buy':sell?'ai-sell':'ai-wait')}>
    <div className="panelhead">
      <div><span className="eyebrow">{x.asset==='GOLD'?'XAU/USD':'BTC/USD'}</span><h2>{forwardSide==='BUY'?'التحرك القادم: صعود':forwardSide==='SELL'?'التحرك القادم: هبوط':'انتظار قراءة أمامية أوضح'}</h2></div>
      {forwardSide==='BUY'?<TrendingUp/>:forwardSide==='SELL'?<TrendingDown/>:<Activity/>}
    </div>

    <div className="ai-price-row compact-price">
      <div><small>السعر الآن</small><strong>{fmt(price,2)}</strong></div>
      <div><small>ثقة القراءة المبكرة</small><strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>{forward?.confidence?Math.round(Number(forward.confidence))+'%':'—'}</strong></div>
      <div><small>التحرك المتوقع</small><strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>{moveAr(forwardSide)}</strong></div>
    </div>

    <div className="next-move-copy primary-move zone-primary">
      <span>القراءة المبكرة · Forward Move</span>
      <strong className={forwardSide==='BUY'?'green':forwardSide==='SELL'?'red':'amber'}>
        {forwardSide==='WAIT'
          ?'لا يوجد تحرك أمامي واضح حتى الآن'
          :`${moveAr(forwardSide)} ${forwardZone?`→ منطقة ${zoneRange(forwardZone)}`:forwardTarget!=null?`→ قرب ${fmt(forwardTarget,2)}`:''} · ${Math.round(Number(forward.confidence||0))}%`}
      </strong>
      <p>{forward?.reason||'المحرك ينتظر اتفاق الضغط المبكر مع M1/M3 قبل إعطاء اتجاه.'}</p>
      {forwardSide!=='WAIT'&&<div className="forecast-scenario-strip">
        <div><small>الوجهة</small><b className={forwardSide==='BUY'?'green':'red'}>{forwardZone?zoneRange(forwardZone):forwardTarget!=null?fmt(forwardTarget,2):'—'}</b></div>
        <div><small>الزمن المتوقع</small><b>{forwardWindow}</b></div>
        <div><small>اتفاق المحركات</small><b>{Math.round(Number(forward?.agreement||0))}%</b></div>
      </div>}
    </div>

        <div className="next-move-copy primary-move zone-primary">
      <span>توقع الحركة القادمة · سيولة وهيكل</span>
      <strong className={softDestination?'amber':forecastSide==='BUY'?'green':forecastSide==='SELL'?'red':'amber'}>
        {forecastSide!=='WAIT'&&priceDestination
          ?`${softDestination?'ميل مراقبة: ':''}${moveAr(forecastSide)} → منطقة ${zoneRange(priceDestination)} · مركز ${fmt(priceDestination.mid,2)} · ${conf}%`
          :path?.side&&path.side!=='WAIT'
            ?`${path.conviction==='WEAK'?'ميل ضعيف: ':path.conviction==='STRONG'?'قوي: ':''}${moveAr(path.side)} · ${Math.round(Number(path.confidence||0))}%`
            :zone
              ?(zone.decisionReady===false||zone.side==='WAIT'
                ?'بين مناطق القرار · الحركة متوازنة'
                :zone?.origin
                  ?`${zone.setup||'تفاعل'} عند ${zoneRange(zone.origin)}`
                  :move.title)
              :move.title}
      </strong>
      <p>{path?.reason||path?.scenario||zone?.summary||move.detail}</p>
      {path?.probabilities&&<div className="forecast-scenario-strip">
        <div><small>صعود</small><b className="green">{Math.round(Number(path.probabilities.up||0))}%</b></div>
        <div><small>هبوط</small><b className="red">{Math.round(Number(path.probabilities.down||0))}%</b></div>
        <div><small>إلغاء السيناريو</small><b>{Number.isFinite(Number(path?.invalidation?.price))?fmt(path.invalidation.price,2):'—'}</b></div>
      </div>}
    </div>

    <div className="forecast-horizons decision-horizons direction-only">
      {predator?.ok&&<div><small>تأكيد 30ث</small><strong className={predator.horizons.thirtySeconds.side==='BUY'?'green':predator.horizons.thirtySeconds.side==='SELL'?'red':'amber'}>{moveAr(predator.horizons.thirtySeconds.side)}</strong><span>{calibrated(predator.horizons.thirtySeconds.confidence??predator.horizons.thirtySeconds.strength)}%</span></div>}
      <div><small>اتجاه M1</small><strong className={h1.side==='BUY'?'green':h1.side==='SELL'?'red':'amber'}>{moveAr(h1.side)}</strong><span>{calibrated(h1.confidence??h1.strength)}%</span></div>
      <div><small>اتجاه M5</small><strong className={h5.side==='BUY'?'green':h5.side==='SELL'?'red':'amber'}>{moveAr(h5.side)}</strong><span>{calibrated(h5.confidence??h5.strength)}%</span></div>
    </div>


    {(target!=null||invalid!=null)&&<div className="trade-strip compact-levels">
      <div><small>الهدف الأقرب</small><strong>{fmt(target,2)}</strong></div>
      <div><small>إلغاء السيناريو</small><strong>{fmt(invalid,2)}</strong></div>
      <div><small>القرار</small><strong className={recommendation?.active?(recommendation.action==='BUY'?'green':recommendation.action==='SELL'?'red':'amber'):'amber'}>{recommendation?.active?sideAr(recommendation.action):'مراقبة'}</strong></div>
    </div>}
  </section>;
}

export default function AICommandCenter({data,error,fastWave,goldLive,marketLead,now=Date.now()}:any){
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

    <div className="dashboardgrid"><AssetCard x={data?.bitcoin} fast={fastWave?.btc} preMove={marketLead?.btc||data?.bitcoin?.marketLead}/><AssetCard x={data?.gold} fast={fastWave?.gold} liveQuote={goldLive} preMove={marketLead?.gold||data?.gold?.marketLead}/></div>
  </div>;
}
