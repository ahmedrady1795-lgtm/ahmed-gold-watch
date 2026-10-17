'use client';

import {useEffect,useState} from 'react';
import {Crosshair,Layers3} from 'lucide-react';
import {buildChartOverlay} from '../lib/chart-trading-overlay';
import {buildForecastMotion,layoutForecastMotion,buildSmoothMotionPath} from '../lib/forecast-motion';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {buildGhostForecast} from '../lib/ghost-forecast';
import {buildVisualFuture} from '../lib/visual-forecast-candles';
import {predictGoldTrainedShadow} from '../lib/gold-trained-shadow';
import type {ForecastJournal} from '../lib/forecast-journal';
import SniperPerformance from './SniperPerformance';
import SniperStrategyRadar from './SniperStrategyRadar';
import {watchForChart} from '../lib/sniper-audit-view';
import {collapseChartZones,findOpposingOverlap,primaryLiquidityZone} from '../lib/chart-zone-merge';
import {detectLiquiditySweeps} from '../lib/liquidity-sweep';
import {detectDisplacementObFvg} from '../lib/institutional-price-action';
import {buildBreakoutGuide,explainFrameConflict,layoutPriceLanes} from '../lib/sniper-decision-guide';
import {evaluateProfessionalMove} from '../lib/professional-move';

const fmt=(p:number|null|undefined,d=2)=>p!=null&&Number.isFinite(p)?
  p.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clock=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'});
const clamp=(p:number,a:number,b:number)=>Math.max(a,Math.min(b,p));

export default function ForecastIllustration({data,now,snapshotAt,goldLive,btcLive,assetView='ALL',journals,audit,auditLoaded=false,observationAt=snapshotAt}:{
  data:any;now:number;snapshotAt:unknown;observationAt?:unknown;goldLive?:any;btcLive?:any;assetView?:'ALL'|'GOLD'|'BTC';
  journals?:{GOLD:ForecastJournal|null;BTC:ForecastJournal|null};audit?:any;auditLoaded?:boolean
}){
  const [chosen,setChosen]=useState<'GOLD'|'BTC'>('GOLD');
  const [focusCandles,setFocusCandles]=useState(false);
  const [showAlternatives,setShowAlternatives]=useState(false);
  const [showGhost,setShowGhost]=useState(true);
  const [mobile,setMobile]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [chartWindow,setChartWindow]=useState<60|240>(60);
  const [chartFullscreen,setChartFullscreen]=useState(false);
  useEffect(()=>{
    if(!chartFullscreen)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setChartFullscreen(false);};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[chartFullscreen]);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 600px)');
    const update=()=>setMobile(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  const asset: 'GOLD'|'BTC'=assetView==='ALL'?chosen:assetView;
  const x=asset==='GOLD'?data?.gold:data?.bitcoin;
  const journal=journals?.[asset]??null;
  const calibration=audit?.metrics?.[asset];
  const observed=Number(calibration?.observed||0);
  const memory=watchForChart(audit,asset,now,auditLoaded);
  const auditHealthy=memory.durable;
  const serverWatch=audit?.watch?.[asset];
  const watchFresh=memory.fresh;
  const watchMetrics=serverWatch?.metrics;
  const watchObserved=Number(watchMetrics?.observed||0);
  const m=buildForecastIllustration(asset,x,asset==='GOLD'?goldLive:btcLive,now,snapshotAt,
    auditHealthy?journal:null,true,memory.state,memory.bias,observationAt);
  const statusReady=m.ready&&auditHealthy;
  const watchReady=m.watchReady&&!statusReady;
  const planVisible=statusReady||watchReady;
  const sn=m.sniper,dir=planVisible?m.displaySide:watchFresh&&m.bias.active?m.bias.side:'WAIT';
  const preMove=x?.preMovePressure;
  const preMoveActive=Boolean(preMove?.ok&&['BUILDING','ARMED'].includes(String(preMove.stage))&&
    (preMove.side==='BUY'||preMove.side==='SELL')&&
    Number(preMove.sourceAt)>0&&now-Number(preMove.sourceAt)<=180000&&
    m.historyFresh&&m.observationFresh&&sn.view.priceFresh);
  const rise=dir==='BUY',fall=dir==='SELL';
  const W=mobile?740:1440,H=mobile?(expanded||chartFullscreen?860:760):(expanded||chartFullscreen?920:760),x0=mobile?28:66,
    x1=mobile?360:980,xf=x1+14,xr=W-(mobile?142:172),yt=40,yb=H-102,volumeEnd=H-49;
  const breakout=buildBreakoutGuide({frames:x?.chartHigherFrames,now,side:dir,price:m.price,
    sourceReady:sn.view.priceFresh&&m.observationFresh&&m.historyFresh,invalidation:m.displayStop});
  const overlay=buildChartOverlay({now,price:m.price,historyFresh:m.historyFresh,
    priceFresh:sn.view.priceFresh&&m.observationFresh,fourHour:m.fourHour,
    m5:x?.chartHigherFrames?.m5,accumulation:x?.accumulation,targets:planVisible?m.displayTargets:[]});
  const pools=overlay.ready?[overlay.upper,overlay.lower].filter((z):z is NonNullable<typeof z>=>z!=null):[];
  const candles=m.candles.slice(-chartWindow);
  const candleBounds=candles.flatMap(c=>[c.low,c.high]);
  if(m.price!=null)candleBounds.push(m.price);
  const candleMin=candleBounds.length?Math.min(...candleBounds):m.lower;
  const candleMax=candleBounds.length?Math.max(...candleBounds):m.upper;
  const candleSpan=Math.max(candleMax-candleMin,Math.abs(m.price||0)*.00065,.01);
  const visibleBands=m.bands.filter(z=>z.kind==='TARGET'||z.kind==='STOP'||
    z.kind==='BUY_REBOUND'||z.kind==='SELL_REBOUND'||z.kind==='DEMAND'||z.kind==='SUPPLY');
  // Fold coinciding zones only; keep every independent target stage and the stop.
  const chartBands=collapseChartZones(visibleBands,m.price,mobile?1:2);
  const primaryZone=primaryLiquidityZone(chartBands,m.price);
  const opposingOverlap=findOpposingOverlap(chartBands,m.price);
  const motion=buildForecastMotion({visible:planVisible,side:dir,price:m.price,
    targets:m.displayTargets,breakout,
    now,m5:x?.chartHigherFrames?.m5,zones:chartBands,
    preMove:x?.preMovePressure,liquidity:overlay,invalidation:m.displayStop});
  // Visible by default, evidence-gated M1-only forecast, independent from
  // trade execution, AI qualification and the server's stored target prices.
  const goldShadow=asset==='GOLD'?predictGoldTrainedShadow({
    candles:m.candles,now,price:m.price,source:String(x?.candleSource||''),
    planSide:planVisible?m.displaySide:'WAIT',
    sourceReady:m.historyFresh&&m.observationFresh&&sn.view.priceFresh
  }):null;
  const ghost=goldShadow??buildGhostForecast({candles:m.candles,now,
    side:planVisible?m.displaySide:'WAIT',price:m.price,
    sourceReady:m.historyFresh&&m.observationFresh&&sn.view.priceFresh,
    scenarioReady:planVisible});
  const visualCandles=showGhost?buildVisualFuture({candles:m.candles,forecast:ghost,side:dir,
    scenarioPath:planVisible&&motion.length>1?motion.map(p=>({key:p.key,price:p.price})):[]}):[];
  const scenarioCandles=visualCandles.some(c=>c.scenarioShape);
  const ghostVisible=showGhost&&ghost.mode==='CANDLES';
  const ghostRangeVisible=showGhost&&ghost.mode==='RANGE';
  const ghostActive=showGhost&&ghost.mode!=='OFF';
  const ghostXs=visualCandles.map((_,i)=>xf+10+(i+.5)*(xr-xf-20)/visualCandles.length);
  const motionColor=watchReady?'#e8b35e':rise?'#51e5ac':'#f08ca4';
  const scenarioKind=motion.some(p=>p.kind==='SWEEP')?'SWEEP_RECLAIM':
    motion.some(p=>p.kind==='RETEST')?'BREAK_RETEST':'DIRECT';
  const scenarioLabel=scenarioKind==='SWEEP_RECLAIM'?'سحب سيولة ثم استرداد':
    scenarioKind==='BREAK_RETEST'?'كسر ثم اختبار وارتداد':'مسار مباشر مشروط';
  const allBounds=[...candleBounds,...chartBands.flatMap(z=>[z.low,z.high]),...motion.map(p=>p.price),...(ghostActive?ghost.range.flatMap(r=>[r.low,r.high]):[]),...(visualCandles.length?visualCandles.flatMap(c=>[c.high,c.low]):[]),...pools.flatMap(z=>[z.low,z.high]),
    ...(breakout.ready?[breakout.above!,breakout.below!]:[])];
  const allMin=allBounds.length?Math.min(...allBounds):m.lower;
  const allMax=allBounds.length?Math.max(...allBounds):m.upper;
  const allSpan=Math.max(allMax-allMin,candleSpan);
  const scaleLow=focusCandles?candleMin-candleSpan*.3:allMin-allSpan*.1;
  const scaleHigh=focusCandles?candleMax+candleSpan*.3:allMax+allSpan*.1;
  const px=(p:number)=>yt+(scaleHigh-p)/Math.max(.0000001,scaleHigh-scaleLow)*(yb-yt);
  const ghostBandPath=visualCandles.length&&!scenarioCandles&&ghost.atr!=null?
    'M '+xf+' '+px(m.candles.at(-1)!.close)+
    ' L '+visualCandles.map((c,i)=>ghostXs[i]+' '+px(c.high+ghost.atr!*.27*Math.sqrt(i+1))).join(' L ')+
    ' L '+visualCandles.map((_,i)=>{const j=visualCandles.length-1-i;
      return ghostXs[j]+' '+px(visualCandles[j].low-ghost.atr!*.27*Math.sqrt(j+1));}).join(' L ')+
    ' Z':'';
  const grid=Array.from({length:5},(_,i)=>({y:yt+i*(yb-yt)/4,value:scaleHigh-(scaleHigh-scaleLow)*i/4}));
  const priceFresh=m.price!=null&&sn.view.priceFresh&&m.observationFresh;
  const chartLanes=layoutPriceLanes([
    ...chartBands.map(z=>({key:z.key,y:px(z.price),price:z.price,
      label:z.kind==='TARGET'?'TP'+z.key.replace('TP',''):z.kind==='STOP'?'إبطال':
        z.key===primaryZone?.key?(z.kind==='DEMAND'||z.kind==='BUY_REBOUND'?'طلب ★':'عرض ★'):
        z.kind==='DEMAND'||z.kind==='BUY_REBOUND'?'طلب':'عرض',
      kind:z.kind})),
    ...(priceFresh?[{key:'MARKET_PRICE',y:px(m.price!),price:m.price!,label:'سعر',kind:'PRICE'}]:[])
  ],yt+20,yb-20,38);
  const stride=(x1-x0)/Math.max(candles.length,1);
  const candleWidth=clamp(stride*.72,mobile?1.6:2,11);
  const maxVolume=Math.max(1,...candles.map(c=>c.volume));
  let continuousStart=Math.max(0,candles.length-1);
  while(continuousStart>0&&candles[continuousStart].time-candles[continuousStart-1].time===60000)continuousStart--;
  const continuousCandles=candles.slice(continuousStart);
  const emaPath=(period:number)=>{
    if(!m.historyFresh||continuousCandles.length<period)return '';
    let ema=continuousCandles.slice(0,period).reduce((sum,c)=>sum+c.close,0)/period;
    let d='M '+(x0+(continuousStart+period-.5)*stride)+' '+px(ema);
    for(let i=period;i<continuousCandles.length;i++){
      ema+=(continuousCandles[i].close-ema)*2/(period+1);
      d+=' L '+(x0+(continuousStart+i+.5)*stride)+' '+px(ema);
    }
    return d;
  };
  const indicatorRows=x?.indicatorMatrix?.rows||{};
  const proMove=evaluateProfessionalMove({
    now,frames:{m1:x?.chartCandles,m5:x?.chartHigherFrames?.m5,
      m15:x?.chartHigherFrames?.m15,h1:x?.chartHigherFrames?.h1},
    adxM5:indicatorRows.m5?.adx
  });
  const technicalFresh=m.historyFresh&&m.observationFresh&&sn.view.priceFresh;
  const metric=(v:unknown)=>technicalFresh&&v!=null&&Number.isFinite(Number(v))?fmt(Number(v),1):'—';
  const modelStatus=data?.modelValidation;
  const modelLabel=asset==='GOLD'?(x?.coreSummary?.qualityReady?'معايرة فنية متاحة':'غير مؤهل إحصائيًا'):
    modelStatus?(modelStatus.mlM1?.ready&&modelStatus.mlM5?.ready?'ML M1/M5 مؤهل':'ML غير مؤهل'):'غير متاح';
  const volumeBasis=candles.some(c=>c.volumeBasis==='REAL')?'REAL':
    candles.some(c=>c.volumeBasis==='TICK')?'TICK':'NONE';
  const historyX=(time:number)=>{
    const i=candles.findIndex(c=>c.time>=time);
    return i<0?x1:x0+(i+.5)*stride;
  };
  const readingLive=m.fourHour.ready&&sn.view.priceFresh&&m.observationFresh&&m.historyFresh;
  // Same causal detector as the scalp engine; paint only recent confirmed or
  // unconfirmed wicks. No made-up order-book quantities or future candles.
  const sweepScan=detectLiquiditySweeps(m.candles,now);
  const recentSweeps=sweepScan.ok&&readingLive?
    sweepScan.events.filter(e=>e.sweepAt>=candles[0]?.time&&now-e.sweepAt<=30*60000)
      .filter((e,i,a)=>a.findLastIndex(z=>z.side===e.side)===i).slice(-2):[];
  const structureScan=detectDisplacementObFvg(m.candles,now);
  const structureView=readingLive&&structureScan.ok?structureScan.setups.filter(e=>
    e.impulseAt>=candles[0]?.time&&now-e.impulseAt<30*60000&&
    (e.phase==='AWAIT_RETEST'||e.phase==='RETEST_CONFIRMED')).at(-1)??null:null;
  const leadSweep=recentSweeps.filter(e=>e.status==='CONFIRMED')
    .sort((a,b)=>b.sweepAt-a.sweepAt)[0]??null;
  const marketEvents=readingLive?m.fourHour.events.filter(e=>candles[0]&&e.at>=candles[0].time)
    .filter(e=>!e.kind.startsWith('SWEEP')||!recentSweeps.some(s=>
      (s.side==='BUY'?e.kind==='SWEEP_LOW':e.kind==='SWEEP_HIGH')&&
      Math.abs(s.sweepAt-e.at)<=300000))
    .filter((e,i,a)=>a.findLastIndex(q=>q.kind===e.kind)===i).slice(mobile?-2:-3):[];
  const contextBox=readingLive?m.fourHour.contextBox:null;
  // Share the EXACT SAME price scale as historical OHLC bars. X positions
  // reflect the relative price distance to verified levels, NOT future time.
  // Smooth, price-bounded segments replace misleading equal-step zigzags.
  const projectedPoints=layoutForecastMotion(motion,xf,xr-18,px);
  const projectedPath=buildSmoothMotionPath(projectedPoints);
  const conditionalPath=(side:'BUY'|'SELL')=>{
    const level=side==='BUY'?breakout.above:breakout.below;
    const pool=side==='BUY'?overlay.upper:overlay.lower;
    if(!overlay.ready||!breakout.ready||m.price==null||level==null||!pool)return '';
    const end=side==='BUY'?Math.max(level,pool.center):Math.min(level,pool.center);
    const dx=xr-xf,start=px(m.price),b=px(level),y=px(end);
    return `M ${xf} ${start} L ${xf+dx*.23} ${b} L ${xf+dx*.34} ${b+(start-b)*.2} L ${xr-18} ${y}`;
  };
  const motionLabels=layoutPriceLanes(projectedPoints.filter(p=>p.kind!=='HOLD').map((p,i)=>({
    key:p.key,y:clamp(p.y+(i%2===0?-32:36),yt+20,yb-20)
  })),yt+20,yb-20,mobile?34:30);
  const ageMin=m.historyAge==null?null:Math.ceil(m.historyAge/60000);
  // Distinguish a genuinely stale source from a neutral/conflicted model.
  // Losing a directional bias does not mean that gold stopped streaming.
  const feedProblem=!m.historyFresh?'الشموع متأخرة · آخر إغلاق فقط':
    !sn.view.priceFresh?'السعر متأخر · لا إشارة حية':
    !m.observationFresh?'تحديث القراءة متأخر · مراقبة فقط':null;
  const neutralLabel=!memory.bias?'تجهيز ذاكرة الأهداف · التحليل مستمر':
    !watchFresh?'سجل المراقبة قيد التحديث':
    !m.bias.active?'التحليل مستمر · الاتجاه غير مؤكد':
    'سوق متوازن · ترقب كسر';
  const stateLabel=feedProblem??(!watchFresh&&!statusReady?'انتظار ذاكرة حديثة':
    statusReady?'سيناريو مؤهل · مسجل':watchReady&&m.heldBias?'اتجاه مثبت · أهداف مراقبة':
    watchReady?'أهداف بعيدة · مراقبة فقط':
    m.bias.active&&m.bias.side!=='WAIT'?(m.heldBias?'اتجاه محفوظ · تحقق مستمر':'الاتجاه مرصود · جارٍ البحث عن مستوى بعيد'):
    m.bias.active?'سوق عرضي · التحليل مستمر':
    m.status==='NO_CANDLES'?'لا توجد شموع كافية':'مراقبة مستمرة · الاتجاه غير مؤكد');
  const highest=m.displayTargets.at(-1);
  const zoneList=chartBands.filter(z=>z.kind!=='TARGET'&&z.kind!=='STOP').slice(0,4);
  const conflictFavor=opposingOverlap&&m.fourHour.ready&&dir!=='WAIT'&&
    m.fourHour.side===dir?dir:'WAIT';
  const blockAt=Number(audit?.blockAt?.[asset]||0);
  const waitReason=!statusReady&&blockAt>0&&blockAt<=now+2000&&now-blockAt<=90000?
    String(audit?.block?.[asset]||''):'';
  const frameExplanation=explainFrameConflict(dir,m.fourHour.side,m.fourHour.ready);
  const statusText=statusReady?(journal?.message||sn.stageText):
    watchReady?m.bias.reason+' · أهداف الخادم ثابتة للمراقبة':
    watchFresh?m.bias.label+' · '+m.bias.reason:'ننتظر ذاكرة أهداف حديثة من الخادم';

  return <section id="forecast-illustration" className="workspace-section forecast-visual-section"
    aria-labelledby="forecast-visual-title">

    <div className="forecast-visual-shell">
      <header className="forecast-visual-header">
        <div className="forecast-visual-heading">
          <span className="forecast-visual-mark"><Crosshair size={17}/></span>
          <div><strong>شاشة {asset==='GOLD'?'الذهب · XAUUSD':'البيتكوين · BTCUSD'}</strong>
            <small>شموع سوق فعلية M1 · مراقبة مستويات H1/H4</small></div>
        </div>
        <div className="forecast-visual-controls">
          {assetView==='ALL'&&<div className="forecast-visual-tabs" role="group" aria-label="الأصل على الرسم">
            <button type="button" aria-pressed={asset==='GOLD'} onClick={()=>setChosen('GOLD')}>الذهب</button>
            <button type="button" aria-pressed={asset==='BTC'} onClick={()=>setChosen('BTC')}>البيتكوين</button>
          </div>}
          <span className={'forecast-visual-status '+(statusReady?'forecast-visual-active':watchReady?'forecast-visual-watch':'')}>
            <span className="forecast-dot"/>{stateLabel}
          </span>
        </div>
      </header>
      <div className="sniper-decision-strip sniper-decision-compact" aria-label="قرار موحد للقناص">
        <strong className={statusReady?(rise?'green':fall?'red':''):''}>{feedProblem??(statusReady?'سيناريو ورقي مؤهل':'لا دخول مؤكد')}</strong>
        <span>{rise?'↗ ميل صعود':fall?'↘ ميل هبوط':neutralLabel}</span>
        {m.fourHour.ready&&<b>4س · {m.fourHour.phase}</b>}
      </div>
      <div className={'forecast-visual-layout' +(expanded?' forecast-layout-expanded':'')}>
        <div className={'forecast-visual-chart-wrap'+(expanded?' forecast-chart-expanded':'')+(chartFullscreen?' chart-fullscreen':'')}>
          <div className="forecast-visual-topline">
            <span className="sniper-chart-live-quote"><b dir="ltr">{fmt(m.price)}</b><small>{sn.view.priceFresh?'سعر حديث':'آخر سعر'} · M1 · {candles.length} شمعة</small></span>
            <span className="sniper-chart-candle-age">{ageMin!=null?'آخر إغلاق منذ '+ageMin+' د':'لا توجد بيانات شموع'}</span>
            {structureView&&<span className={'sniper-structure-chip '+(structureView.side==='BUY'?'structure-up':'structure-down')}
              title="شموع مغلقة: اندفاع + كسر جسم + آخر شمعة معاكسة + فجوة 3 شموع، وليس إثبات أوامر مؤسسات">
              {structureView.side==='BUY'?'↗':'↘'} {structureView.kind==='BOS'?'BOS':'CHoCH؟'} · OB/FVG ·
              {structureView.phase==='RETEST_CONFIRMED'?'اختبار مغلق':'انتظار اختبار'}
            </span>}
            {leadSweep&&<span className={'sniper-sweep-chip '+(leadSweep.side==='BUY'?'sweep-up':'sweep-down')}
              title="تأكيد فني من شموع مغلقة؛ لا يسمح بالدخول دون وقف وتكلفة وتحقق">
              {leadSweep.side==='BUY'?'↗ سحب سيولة قاع':'↘ سحب سيولة قمة'} · {fmt(leadSweep.level)} · إبطال {fmt(leadSweep.invalidation)}
            </span>}
            <div className="forecast-chart-tools">
              <button type="button" aria-pressed={chartWindow===60} onClick={()=>setChartWindow(60)}>ساعة</button>
              <button type="button" aria-pressed={chartWindow===240} onClick={()=>setChartWindow(240)}>4 ساعات</button>
              <button className="forecast-chart-zoom" type="button" aria-pressed={focusCandles} onClick={()=>setFocusCandles(v=>!v)}>{focusCandles?'كل المستويات':'تكبير الشموع'}</button>
              <button type="button" aria-pressed={showGhost} onClick={()=>setShowGhost(v=>!v)} title="شموع M1 افتراضية فقط عندما تؤيدها نتائج زمنية سابقة؛ وإلا نطاق تقلب مرئي دون اتجاه">{showGhost?'إخفاء التقدير':'شموع تقديرية'}</button>
              <button className="forecast-chart-alternative" type="button" aria-pressed={showAlternatives} onClick={()=>setShowAlternatives(v=>!v)} title="مسارات مشروطة إضافية، ليست صفقات">{showAlternatives?'إخفاء البدائل':'بدائل'}</button>
              <button type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'حجم عادي':'توسيع الرسم ⤢'}</button>
              <button type="button" aria-pressed={chartFullscreen} onClick={()=>setChartFullscreen(v=>!v)}>{chartFullscreen?'إغلاق ملء الشاشة':'⛶ ملء الشاشة'}</button>
            </div>
          </div>
          <div className="forecast-visual-chart-scroll">
            <svg className={'forecast-visual-svg'+(focusCandles?' forecast-visual-svg-zoomed':'')} viewBox={'0 0 '+W+' '+H}
              role="img" aria-label={statusReady?
                'الشموع الحقيقية والسيناريو المسجل إلى '+m.displayTargets.map(t=>'TP'+t.stage+' '+fmt(t.price)).join(' ثم '):
                watchReady?'الشموع الحقيقية مع مستويات مراقبة مبكرة غير مؤهلة للدخول':
                'الشموع التاريخية فقط، ولا توجد إشارة مؤهلة'} >
              <defs>
                <clipPath id={'forecast-plot-'+asset}><rect x={x0} y={yt} width={xr-x0} height={yb-yt}/></clipPath>
                <linearGradient id={'forecast-target-'+asset} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#36e4a6" stopOpacity=".18"/>
                  <stop offset="100%" stopColor="#36e4a6" stopOpacity=".035"/>
                </linearGradient>
                <linearGradient id={'forecast-chart-'+asset} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#15283d"/>
                  <stop offset="100%" stopColor="#0a1422"/>
                </linearGradient>
                <marker id={'forecast-arrow-'+asset} viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={motionColor}/>
                </marker>
              </defs>
              <rect x="0" y="0" width={W} height={H} rx="9" fill={'url(#forecast-chart-'+asset+')'}/>
              <rect x={xf} y="16" width={xr-xf} height={volumeEnd-15} fill="#56bde7" opacity=".028"/>
              {grid.map((g,i)=><g key={'grid'+i}>
                <line x1={x0} x2={xr+12} y1={g.y} y2={g.y} stroke="#426076" strokeOpacity=".32" strokeDasharray="3 6"/>
                {!chartLanes.some(r=>Math.abs(r.labelY-g.y)<17)&&<text direction="ltr" x={W-12} y={g.y+4}
                  textAnchor="end" fill="#97afc0" fontSize={mobile?18:12}
                  fontFamily="monospace">{fmt(g.value)}</text>}
              </g>)}
              {Array.from({length:7},(_,i)=><line key={'v'+i} x1={x0+i*(xr-x0)/6} x2={x0+i*(xr-x0)/6} y1="18" y2={volumeEnd+10}
                stroke="#345267" strokeOpacity=".20" strokeDasharray="3 7"/>)}
              <line x1={xf-8} x2={xf-8} y1="20" y2={volumeEnd+5} stroke="#72b3d1" strokeOpacity=".5"
                strokeDasharray="6 7"/>
              <text x={xf-14} y="18" textAnchor="end" fill="#88bbd3" fontSize={mobile?18:12}>تاريخ فعلي</text>
              <text x={xf+8} y="18" fill="#e7c58a" fontSize={mobile?16:12}>{mobile?'مسار مشروط':'مسار مشروط · ليس مقياسًا للوقت'}</text>
              <g clipPath={'url(#forecast-plot-'+asset+')'}>
                {pools.map(z=>{const color=z.side==='UPPER'?'#ff7d9b':'#51dcdf';return <g key={z.side}>
                  <rect x={x0} y={px(z.high)} width={xr-x0} height={Math.max(5,px(z.low)-px(z.high))}
                    fill={color} fillOpacity=".12" stroke={color} strokeDasharray="6 5"/>
                  <text x={x0+8} y={clamp(px(z.high)-8,yt+18,yb-18)} fill={color} fontSize={mobile?14:12}>
                    {z.side==='UPPER'?'سيولة علوية محتملة':'سيولة سفلية محتملة'} · {fmt(z.low)} – {fmt(z.high)}</text>
                </g>;})}
                {breakout.ready&&([{side:'BUY',level:breakout.above},{side:'SELL',level:breakout.below}] as const).map(b=>
                  b.level!=null&&<g key={b.side}>
                    <line x1={xf} x2={xr} y1={px(b.level)} y2={px(b.level)} stroke={b.side==='BUY'?'#67eac1':'#ff92ad'} strokeDasharray="5 5"/>
                    <text x={xf+6} y={clamp(px(b.level)-9,yt+16,yb-12)} fill={b.side==='BUY'?'#67eac1':'#ff92ad'} fontSize={mobile?14:12}>
                      {b.side==='BUY'?'كسر صاعد':'كسر هابط'} · {fmt(b.level)}</text>
                  </g>)}
                {showAlternatives&&(['BUY','SELL'] as const).filter(side=>!planVisible||side!==dir).map(side=>{
                  const path=conditionalPath(side);return path?<path key={side} d={path} fill="none" stroke={side==='BUY'?'#5ce3b3':'#82b2ff'}
                    strokeWidth="2.5" strokeDasharray="7 5"><title>{planVisible?'سيناريو بديل مشروط بالكسر':'مسار مراقبة مشروط بالكسر'} · ليس هدفًا معتمدًا</title></path>:null;
                })}
              </g>
              {contextBox&&candles[0]&&contextBox.to>candles[0].time&&<g className="sniper-context-box">
                <rect x={Math.max(x0,historyX(contextBox.from))} y={px(contextBox.high)}
                  width={Math.max(8,Math.min(x1,historyX(contextBox.to))-Math.max(x0,historyX(contextBox.from)))}
                  height={Math.max(8,px(contextBox.low)-px(contextBox.high))} rx="5"
                  fill={contextBox.kind==='ACCUMULATION'?'#43d5ad':contextBox.kind==='DISTRIBUTION'?'#ef829e':'#d5b267'}
                  fillOpacity=".1" stroke={contextBox.kind==='ACCUMULATION'?'#43d5ad':contextBox.kind==='DISTRIBUTION'?'#ef829e':'#d5b267'} strokeDasharray="5 4"/>
                <text x={Math.max(x0+80,(Math.max(x0,historyX(contextBox.from))+Math.min(x1,historyX(contextBox.to)))/2)}
                  y={Math.max(yt+14,px(contextBox.high)-8)} textAnchor="middle" fill="#ecdfad" fontSize={mobile?14:12} fontWeight="700">{contextBox.label}</text>
                <title>{contextBox.label+' · '+fmt(contextBox.low)+' – '+fmt(contextBox.high)+' · قراءة سعر ونشاط وليست أوامر مؤسسات'}</title>
              </g>}
              {opposingOverlap&&px(opposingOverlap.high)<=yb&&px(opposingOverlap.low)>=yt&&<rect
                x={x0} y={px(opposingOverlap.high)} width={xr-x0}
                height={Math.max(3,px(opposingOverlap.low)-px(opposingOverlap.high))}
                fill="#deb368" fillOpacity=".09" stroke="#efbc70" strokeDasharray="4 5" strokeOpacity=".65">
                <title>{'منطقة تعارض شراء وبيع '+fmt(opposingOverlap.low)+' – '+fmt(opposingOverlap.high)+' · ليست إشارة دخول'}</title>
              </rect>}
              {motion.some(p=>p.kind==='BREAK'||p.kind==='RETEST')&&breakout.trigger!=null&&
                px(breakout.trigger)>=yt&&px(breakout.trigger)<=yb&&<g>
                <rect x={xf} y={px(breakout.trigger)-7} width={xr-xf} height="14" fill="#75caff" fillOpacity=".13"/>
                <line x1={xf} x2={xr} y1={px(breakout.trigger)} y2={px(breakout.trigger)} stroke="#8dd4ff" strokeDasharray="4 5"/>
                <title>{'منطقة الكسر المشروط · '+fmt(breakout.trigger)+' · إغلاق شمعتي M5، ثم توافق M15/H1'}</title>
              </g>}
              {motion.filter(p=>p.kind==='RETEST'||p.kind==='SWEEP').map(p=>
                px(p.price)>=yt&&px(p.price)<=yb?<g key={'motion-zone-'+p.key}>
                  <rect x={xf} y={px(p.price)-5} width={xr-xf} height="10"
                    fill={p.kind==='RETEST'?'#72d6fd':'#f5bb7f'} fillOpacity=".17"/>
                  <line x1={xf} x2={xr} y1={px(p.price)} y2={px(p.price)}
                    stroke={p.kind==='RETEST'?'#72d6fd':'#f5bb7f'} strokeDasharray="2 6" strokeOpacity=".67"/>
                  <title>{p.label+' · '+fmt(p.price)+' · احتمال مشروط لا يعني حركة مؤكدة'}</title>
                </g>:null
              )}
              {chartBands.map(z=>{
                const clr=z.kind==='BUY_REBOUND'?'#42e5a9':z.kind==='SELL_REBOUND'?'#ff7189':
                  z.kind==='TARGET'?'#3ce6a8':z.kind==='STOP'?'#fd687c':
                  z.kind==='REBOUND'?'#e8b35e':z.kind==='SUPPLY'?'#b48be9':
                  z.kind==='DEMAND'?'#4e96ff':'#67d9e3';
                const high=px(z.high),low=px(z.low),mid=px(z.price);
                if(mid<yt||mid>yb)return null;
                return <g key={z.key}>
                  <rect x={x0} y={Math.min(high,low)-3} width={xr-x0}
                    height={Math.max(6,Math.abs(low-high)+6)} fill={clr} opacity={z.kind==='TARGET'?.12:z.key===primaryZone?.key ? .18 : .05} rx="2"/>
                  <line x1={z.kind==='TARGET'?xf:x0} x2={xr}
                    y1={mid} y2={mid} stroke={clr} strokeWidth={z.key===primaryZone?.key?2.1:z.kind==='TARGET'?1.4:1}
                    strokeDasharray={z.kind==='STOP'?'7 6':undefined} strokeOpacity=".72"/>
                  <title>{z.label+' · '+fmt(z.low)+' – '+fmt(z.high)}</title>
                </g>;
              })}
              {emaPath(20)&&<path d={emaPath(20)} fill="none" stroke="#edc36d" strokeWidth="1.9" strokeOpacity=".9"
                clipPath={'url(#forecast-plot-'+asset+')'}/>}
              {emaPath(50)&&<path d={emaPath(50)} fill="none" stroke="#a3a1ff" strokeWidth="1.9" strokeOpacity=".85"
                clipPath={'url(#forecast-plot-'+asset+')'}/>}
              {candles.map((c,i)=>{
                const x=x0+(i+.5)*stride;
                const color=c.close>=c.open?'#4ad9c6':'#f0758a';
                const top=Math.min(px(c.open),px(c.close)),bottom=Math.max(px(c.open),px(c.close));
                const volumeH=Math.min(35,Math.max(1,c.volume/maxVolume*35));
                return <g key={c.time}>
                  <line x1={x} x2={x} y1={px(c.high)} y2={px(c.low)} stroke={color} strokeWidth="1.3"/>
                  <rect x={x-candleWidth/2} y={top} width={candleWidth}
                    height={Math.max(2.2,bottom-top)} rx=".7" fill={color}
                    stroke={c.close>=c.open?'#a2ffe7':'#ffc0cb'} strokeOpacity=".6" strokeWidth=".75"/>
                  <rect x={x-candleWidth/2} y={volumeEnd-volumeH} width={candleWidth}
                    height={volumeH} fill={color} opacity=".35"/>
                  <title>{clock(c.time)+' · O '+fmt(c.open)+' H '+fmt(c.high)+' L '+fmt(c.low)+' C '+fmt(c.close)}</title>
                </g>;
              })}
              {priceFresh&&m.historyFresh&&candles.length>0&&<g className="sniper-actual-to-quote">
                <path d={'M '+(x0+(candles.length-.5)*stride)+' '+px(candles[candles.length-1].close)+
                  ' L '+xf+' '+px(m.price!)}
                  fill="none" stroke="#8ee6f9" strokeWidth="2" strokeDasharray="2 6" strokeOpacity=".9"/>
                <circle cx={xf} cy={px(m.price!)} r={mobile?7:5} fill="#102c42" stroke="#8ee6f9" strokeWidth="2"/>
                <title>آخر إغلاق M1 إلى السعر الحي المرصود · وصل نقطتين فقط، بدون اختلاق شموع بينهما</title>
              </g>}
              {structureView&&<g className="sniper-obfvg-structure" aria-label="OB FVG BOS الهيكل" clipPath={'url(#forecast-plot-'+asset+')'}>
                {([{key:'ob',zone:structureView.ob,label:'OB',color:'#8a99f3'},
                   {key:'fvg',zone:structureView.fvg,label:'FVG',color:'#f0bf70'}] as const).map(z=>{
                  const left=Math.max(x0,historyX(z.key==='ob'?structureView.obAt:structureView.impulseAt));
                  const y=Math.min(px(z.zone.high),px(z.zone.low));
                  const h=Math.abs(px(z.zone.low)-px(z.zone.high));
                  return <g key={z.key}>
                    <rect x={left} y={y} width={Math.max(2,x1-left)}
                      height={Math.max(h,3)} rx="2" stroke={z.color} strokeDasharray={z.key==='fvg'?'6 4':undefined}
                      fill={z.color} fillOpacity={z.key==='fvg'?.15:.10} strokeOpacity=".80"/>
                    <text x={Math.min(left+7,x1-32)} y={clamp(y-6,yt+13,yb-12)}
                      fill={z.color} fontSize={mobile?15:12} fontWeight="700">{z.label}</text>
                    <title>{z.label+' · نطاق سعري من شموع مغلقة '+fmt(z.zone.low)+'–'+fmt(z.zone.high)}</title>
                  </g>;
                })}
                <line x1={x0} x2={x1} y1={px(structureView.structuralLevel)}
                  y2={px(structureView.structuralLevel)} stroke="#e8c67e" strokeDasharray="5 5"
                  strokeWidth="2" strokeOpacity=".86"/>
                <circle cx={historyX(structureView.impulseAt)}
                  cy={px(structureView.side==='BUY'?structureView.impulseHigh:structureView.impulseLow)}
                  r="6" stroke="#f7ca83" fill="#102438" strokeWidth="2"/>
                <line x1={historyX(structureView.impulseAt)} x2={x1}
                  y1={px(structureView.invalidation)} y2={px(structureView.invalidation)}
                  stroke="#fa8199" strokeDasharray="7 5" strokeWidth="1.5"/>
                <title>{structureView.reason+' · BOS/CHoCH هيكلي، OB شمعة سعرية، FVG فجوة ثلاث شموع. لا دخول بدون شروط العائد والسبريد وتأكيد الاختبار.'}</title>
              </g>}
              {recentSweeps.map((event,index)=>{
                const x=historyX(event.sweepAt),tipY=px(event.extreme),levelY=px(event.level);
                if(!Number.isFinite(tipY)||tipY<yt||tipY>yb||levelY<yt||levelY>yb)return null;
                const confirmed=event.status==='CONFIRMED';
                const color=event.status==='TRAP'?'#8699a7':event.side==='BUY'?'#58eec1':'#fa9aaf';
                const label=(event.side==='BUY'?'سحب قاع':'سحب قمة')+
                  (confirmed?' ✓':event.status==='PENDING'?' · انتظار':' · فخ');
                const tagX=clamp(x+18,x0+4,x1-175),tagY=clamp(tipY+(event.side==='BUY'?29:-31),yt+15,yb-18);
                const opposite=event.side==='BUY'?-1:1;
                return <g className="sniper-confirmed-sweep" key={event.id}>
                  <line x1={Math.max(x0,x-stride*13)} x2={Math.min(x1,x+stride*13)}
                    y1={levelY} y2={levelY} stroke={color} strokeWidth="2"
                    strokeDasharray="9 5" strokeOpacity={confirmed?.88:.42}/>
                  <circle cx={x} cy={tipY} r={mobile?13:11} fill="none"
                    stroke={color} strokeWidth={confirmed?2.9:1.7}
                    strokeDasharray={confirmed?undefined:'4 4'}/>
                  <line x1={x} x2={x} y1={tipY} y2={tagY} stroke={color} strokeOpacity=".68"/>
                  <rect x={tagX} y={tagY-12} width={mobile?164:137} height="25"
                    rx="7" fill="#102737" stroke={color} strokeOpacity=".78"/>
                  <text x={tagX+(mobile?82:68.5)} y={tagY+4} textAnchor="middle"
                    fontSize={mobile?15:12} fill={color} fontWeight="700">{label}</text>
                  {confirmed&&event.confirmedAt!=null&&<circle
                    cx={historyX(event.confirmedAt-60000)}
                    cy={px(event.trigger??event.level)} r="4" fill={color}/>}
                  <title>{event.reason+' · مستوى '+fmt(event.level)+
                    ' · ذيل '+fmt(event.extreme)+' · إبطال '+fmt(event.invalidation)+
                    (confirmed?' · إغلاق تأكيد '+clock(event.confirmedAt!):' · ممنوع التفعيل')}</title>
                </g>;
              })}
              {marketEvents.map((event,index)=>{
                const x=historyX(event.at),y=px(event.price),up=event.kind==='SWEEP_LOW'||event.kind==='BOS_UP';
                const color=up?'#6af0bd':'#ff9aaf',label=event.kind==='SWEEP_LOW'?'سحب قاع':event.kind==='SWEEP_HIGH'?'سحب قمة':up?'كسر صاعد':'كسر هابط';
                const labelY=clamp(y+(up?28+index*3:-24-index*3),yt+22,yb-18);
                return <g key={event.kind+event.at} className="sniper-liquidity-event">
                  <circle cx={x} cy={y} r="5" stroke={color} fill="#0b1b28" strokeWidth="2"/>
                  <line x1={x} x2={x} y1={y} y2={labelY} stroke={color} strokeOpacity=".6"/>
                  <rect x={clamp(x-42,x0,x1-85)} y={labelY-12} width="85" height="22" rx="5" fill="#0b2230" stroke={color} strokeOpacity=".65"/>
                  <text x={clamp(x,x0+42,x1-43)} y={labelY+3} textAnchor="middle" fill={color} fontSize={mobile?13:11} fontWeight="700">{label}</text>
                  <title>{event.label+' · '+fmt(event.level)+' · تأكيد '+clock(event.confirmedAt)}</title>
                </g>;
              })}
              <line x1={x0} x2={xr} y1={volumeEnd} y2={volumeEnd} stroke="#416077" strokeOpacity=".4"/>
              {candles.length>0&&[0,.33,.66,1].map((a,i)=>{
                const c=candles[Math.min(candles.length-1,Math.round((candles.length-1)*a))];
                return <text key={'time'+i} x={x0+(i/3)*(x1-x0)} y={H-13}
                  fill="#8ba6b9" textAnchor={i===0?'start':i===3?'end':'middle'} fontSize="11">{clock(c.time)}</text>;
              })}
              {priceFresh&&<line x1={x0} x2={xr} y1={px(m.price!)} y2={px(m.price!)}
                stroke="#5ad6f4" strokeDasharray="3 5" strokeOpacity=".65"/>}
              {ghostActive&&<g className="sniper-ghost-forecast" clipPath={'url(#forecast-plot-'+asset+')'}>
                {ghostBandPath&&<path d={ghostBandPath} fill="#88b4ef" fillOpacity=".105"
                  stroke="#a3bff7" strokeOpacity=".4" strokeDasharray="3 6" strokeWidth="1">
                  <title>نطاق تقلب تقريبي متسع، غير معاير إحصائيًا ولا يضمن تغطية محددة</title>
                </path>}
                {visualCandles.map((c,i)=>{
                  const gx=ghostXs[i],up=c.close>=c.open;
                  const color=up?'#40e69b':'#ff6b81',top=Math.min(px(c.open),px(c.close)),
                    bottom=Math.max(px(c.open),px(c.close));
                  return <g key={c.time} opacity={c.validatedShape?.92:.68}>
                    <line x1={gx} x2={gx} y1={px(c.high)} y2={px(c.low)}
                      stroke={color} strokeWidth={c.validatedShape?2.1:1.65} strokeDasharray="3 3"/>
                    <rect x={gx-(mobile?5:7)} y={top} width={mobile?10:14}
                      height={Math.max(3.2,bottom-top)} rx="1.5"
                      fill={color} fillOpacity={c.validatedShape?.77:.61} stroke={color} strokeWidth="1" strokeDasharray="3 2"/>
                    {c.validatedShape&&<text x={gx} y={clamp(px(c.high)-11,yt+30,yb-13)}
                      textAnchor="middle" fill={color} fontSize={mobile?12:10}>{up?'↑':'↓'} {c.step}</text>}
                    {!c.scenarioShape&&(i%4===0||i===visualCandles.length-1)&&<text x={gx} y={yb-7} textAnchor="middle" fill="#b8c9e5"
                      fontSize={mobile?11:10}>{clock(c.time)}</text>}
                    <title>{(c.scenarioShape?'شمعة شكلية لمرحلة المسار، غير زمنية رقم ':'شمعة M1 افتراضية رقم ')+c.step+
                      (c.scenarioShape?' · دون موعد وصول':' · '+clock(c.time))+' · '+(up?'صعود توضيحي':'هبوط توضيحي')+
                      ' · O '+fmt(c.open)+' H '+fmt(c.high)+' L '+fmt(c.low)+' C '+fmt(c.close)+
                      ' · '+(c.validatedShape?'نموذج M1 مفحوص تاريخيًا':'شمعة شكلية توضيحية غير مدعومة باختبار مستقل')+' · ليست سعرا فعليا'}</title>
                  </g>;
                })}
                {ghostRangeVisible&&<g className="ghost-neutral-range" opacity=".15">
                  {ghost.range.map((r,i)=><g key={r.time}>
                    <line x1={ghostXs[i]} x2={ghostXs[i]} y1={px(r.high)} y2={px(r.low)}
                      stroke="#a7bce8" strokeWidth="1.6" strokeDasharray="3 6" strokeOpacity=".7"/>
                    <circle cx={ghostXs[i]} cy={px(m.candles.at(-1)!.close)} r="3" fill="#a7bce8" opacity=".7"/>
                    <title>نطاق تذبذب M1 للخطوة {r.step}، لا يحدد صعودًا أو هبوطًا</title>
                  </g>)}
                </g>}
                <text x={(ghostXs[0]+ghostXs.at(-1)!)/2} y={yt+29} textAnchor="middle"
                  fontSize={mobile?13:12} fontWeight="700" fill="#bdd1ee">
                  {scenarioCandles?'شموع مسار سعري مشروط · غير زمنية':ghostVisible?(ghost.source==='GOLD_MT5_OOS_MODEL'?'GOLD MT5 · اختبار تاريخي':'GHOST M1 · تجريبي') :'M1 · شموع تذبذب افتراضية'}
                </text>
              </g>}
              {chartLanes.map(label=>{
                const isPrice=label.kind==='PRICE',isTarget=label.kind==='TARGET',isStop=label.kind==='STOP';
                const color=isPrice?'#9feaff':isTarget?'#74f0ba':isStop?'#ff9cab':
                  label.label.startsWith('طلب')?'#8debc6':'#f2b0c7';
                const rx=xr+8,ry=label.labelY-17,rw=W-rx-10;
                return <g key={'rail-'+label.key} className="sniper-price-rail-label">
                  <line x1={xr} x2={rx} y1={label.y} y2={label.labelY}
                    stroke={color} strokeWidth="1.15" strokeOpacity=".8"/>
                  <rect x={rx} y={ry} width={rw} height="34" rx="4"
                    fill={isPrice?'#18506a':'#112637'} stroke={color} strokeOpacity=".65"/>
                  <text x={rx+rw/2} y={label.labelY-5} textAnchor="middle"
                    fontSize={mobile?16:10} fill={color} fontWeight="700">{label.label}</text>
                  <text direction="ltr" x={rx+rw/2} y={label.labelY+10} textAnchor="middle"
                    fontSize={mobile?19:13} fill={color} fontWeight="700"
                    fontFamily="monospace">{fmt(label.price)}</text>
                  <title>{label.label+' · المستوى الأصلي '+fmt(label.price)}</title>
                </g>;
              })}
              {projectedPath&&!ghostVisible&&visualCandles.length===0&&<g className="forecast-motion-path" clipPath={'url(#forecast-plot-'+asset+')'}>
                <path d={projectedPath} stroke="#071823" strokeWidth="8" fill="none" opacity=".7"/>
                <path d={projectedPath} stroke={motionColor} strokeWidth="3"
                  strokeDasharray="8 7" fill="none" markerEnd={'url(#forecast-arrow-'+asset+')'}/>
                {projectedPoints.map((p,i)=>{
                  if(p.y<yt||p.y>yb)return null;
                  const labelY=motionLabels.find(l=>l.key===p.key)?.labelY??clamp(p.y-30,yt+24,yb-20);
                  const short=p.kind==='TARGET'?p.key:p.kind==='START'?'بداية':
                    p.kind==='BREAK'?'كسر؟':p.kind==='RETEST'?'اختبار؟':
                    p.kind==='SWEEP'?'سحب؟':p.kind==='RECLAIM'?'استرداد؟':'امتداد؟';
                  return <g key={p.key}>
                    <circle cx={p.x} cy={p.y} r={mobile?11:8} fill="#0b2230" stroke={motionColor} strokeWidth="2"/>
                    <text x={p.x} y={p.y+(mobile?5:3)} textAnchor="middle" fill="#f2f8fc" fontSize={mobile?14:9}>{i+1}</text>
                    {p.kind!=='HOLD'&&<g>
                      <line x1={p.x} x2={p.x} y1={p.y+(labelY>p.y?12:-12)} y2={labelY} stroke={motionColor} strokeOpacity=".5"/>
                      <rect x={clamp(p.x-25,xf-25,xr-52)} y={labelY-13} width="52" height="26" rx="5" fill="#0b2130" stroke={motionColor} strokeOpacity=".6"/>
                      <text x={clamp(p.x,xf,xr-27)} y={labelY+5} textAnchor="middle" fill="#eaf7ff" fontSize={mobile?17:12} fontWeight="700">{short}</text>
                    </g>}
                    <title>{(i+1)+' · '+p.label+' · '+fmt(p.price)+(p.kind==='HOLD'?' · امتداد توضيحي مشتق من مدى M5، وليس هدفًا محسوبًا':'')}</title>
                  </g>;
                })}
                {m.displayStop!=null&&px(m.displayStop)>=yt&&px(m.displayStop)<=yb&&<path
                  d={'M '+xf+' '+px(m.price!)+' L '+(xf+(xr-xf)*.3)+' '+px(m.displayStop)}
                  stroke="#ff8da1" strokeWidth="1.5" strokeDasharray="4 6" fill="none">
                  <title>{'مسار إبطال منفصل · '+fmt(m.displayStop)}</title>
                </path>}
              </g>}
              {!planVisible&&<g>
                <rect x={xf+8} y={yb-76} width={xr-xf-16} height="65" rx="9" fill="#0a1520" stroke="#3a5464" strokeOpacity=".8"/>
                <text x={(xf+xr)/2} y={yb-51} fill="#cedfeb" textAnchor="middle" fontSize="14" fontWeight="700">
                  {m.status==='STALE_CANDLES'?'الشموع متأخرة':m.status==='NO_CANDLES'?'انتظار شموع':watchFresh?'ترقب كسر':'تهيئة الذاكرة'}</text>
                <text x={(xf+xr)/2} y={yb-29} fill="#91abbb" textAnchor="middle" fontSize={mobile?11:11}>لا إشارة دخول</text>
              </g>}
            </svg>
          </div>
          {showGhost&&<div className="forecast-ghost-guide" role="status" aria-live="polite"
            style={{padding:'7px 10px',border:'1px dashed #446980',borderRadius:8,marginTop:6,color:'#c4dbea',fontSize:12}}>
            <b>{ghostVisible?(ghost.source==='GOLD_MT5_OOS_MODEL'?
              '3 شموع ذهب مدعومة باختبار · يليها شموع شكلية فقط':'3 شموع M1 مفحوصة · والباقي شموع افتراضية'):
              ghostRangeVisible?'نطاق تذبذب M1 · لا توقع اتجاه · شموع توضيحية':
              'لا تتوفر بيانات كافية للتقدير'}</b>
            <span> · {ghost.reason}. {scenarioCandles?
              'شموع مسار مشروط حتى أهداف الخادم، لا تمثل دقيقة لكل شمعة أو موعد وصول، ولا تضمن تحقق الأهداف.':
              '16 شمعة مستقبلية شكلية مستمدة من تذبذب M1، ليست توقعات OHLC موثوقة.'} هذه الدراسة ليست نموذج ML معتمدًا، ولا تغيّر قرار الدخول.</span>
            <details style={{marginTop:4}}>
              <summary>نتائج الاختبار التاريخي وطريقة العرض</summary>
              {ghost.validation.samples>=12?<span>
                {ghost.source==='GOLD_MT5_OOS_MODEL'?'اختبار خارج فترة تدريب نموذج الذهب:':'فحص زمني بنوافذ سابقة منفصلة:'}
                {' '}{ghost.validation.directionHits}/{ghost.validation.samples}
                {' '}اتجاهات صحيحة بعد 3 شموع؛ متوسط خطأ الإغلاق {fmt(ghost.validation.maeAtr,2)} ATR.
                {ghostRangeVisible?' النتيجة لا تكفي لإظهار شموع اتجاهية.':''}
                {' '}اختبار تاريخي تقني فقط، لا يثبت دقة تداول حي أو موثوقية احتمالات.
              </span>:<span>لا توجد نتائج تاريخية كافية لإعلان دقة.</span>}
              <span> النطاق المعروض تقدير للتذبذب وليس نطاق ثقة إحصائيًا.</span>
            </details>
          </div>}
          {motion.length>0&&<details className="forecast-motion-guide" aria-label="خطوات المسار المتوقع">
            <summary><strong>{statusReady?'سيناريو مؤهل':'مراقبة مشروطة'} · {scenarioLabel} · عرض خطوات المسار</strong></summary>
            <ol>{motion.map((p,i)=><li key={p.key}>
              <b>{i+1}</b><span>{p.label}{p.kind!=='HOLD'&&<small dir="ltr">{fmt(p.price)}</small>}</span>
            </li>)}</ol>
            <p>السهم يربط مستويات موثقة بالأسعار الأصلية، ويظهر ارتدادات مشروطة فقط عند توافر شموع M5 مغلقة متصلة؛ انحناء الخط توضيحي والمسافات الأفقية سعرية وليست أزمنة وصول.
              {scenarioKind==='BREAK_RETEST'?' الاختبار ممكن يحصل عند المستوى المرسوم، وممكن السعر يكمل مباشرة.':''}
              {scenarioKind==='SWEEP_RECLAIM'?' سحب السيولة مسار بديل مرصود الاحتمال فقط، ويلغى لو اتكسر الإبطال.':''}
              {motion.some(p=>p.kind==='HOLD')?' امتداد ما بعد الكسر تقديري من تذبذب M5، وليس هدفًا منفصلًا.':''}
              {watchReady?' الكسر يحتاج إغلاق شمعتي M5 وتوافق M15/H1 وباقي شروط القناص؛ ليس تصريح دخول.':''}</p>
          </details>}
          <div className="sniper-chart-key" aria-label="مفتاح الرسم">
            <span><i className="sniper-key-up"/> صعود</span><span><i className="sniper-key-down"/> هبوط</span>
            <span><i className="sniper-key-path"/> سيناريو مشروط</span>
            <span className="render-ema20">EMA20</span><span className="render-ema50">EMA50</span>
          </div>
          <details className="sniper-chart-legend-drawer"><summary>تفاصيل خطوط الرسم</summary>
          <div className="forecast-visual-legend">
            <span><i className="forecast-legend-history"/> شموع M1 حقيقية</span>
            <span><i className="forecast-legend-projection"/> {watchReady?'مسار مستويات بعيد · توضيحي':'سيناريو مشروط'}</span>
            {visualCandles.length>0&&<span>▥ {scenarioCandles?'شموع مسار الأهداف · غير زمنية':'شموع افتراضية M1'} · توضيحية فقط</span>}
            {ghostRangeVisible&&<span>◌ محاكاة تذبذب · بلا أفضلية اتجاه</span>}
            <span><i className="forecast-legend-target"/> مناطق أهداف</span>
            <span><i className="forecast-legend-rebound"/> مناطق سيولة</span>
            {primaryZone&&<span className="sniper-primary-zone">★ أعلى أولوية عرض · {primaryZone.confirmedAt?'قمة/قاع M5 مؤكد':'منطقة تحليل'}{(primaryZone.sources?.length||0)>1?' + توافق مصدرين':''}</span>}
            {opposingOverlap&&<span className="sniper-conflict-legend">◇ تداخل طلب وعرض · انتظار</span>}
            <span className="sniper-buy-legend">● طلب / استرداد</span><span className="sniper-sell-legend">● عرض / رفض</span>
            <span><i className="forecast-legend-stop"/> إبطال</span>
          </div>
          </details>
        </div>
      </div>
      <div className="sniper-price-snapshot" aria-label="السعر والأهداف الأساسية">
        {planVisible&&m.displayTargets.slice(0,3).map(t=><span key={'snap-tp'+t.stage} className="sniper-price-snapshot-target">
          <small>{statusReady?'هدف':'مراقبة'} TP{t.stage}</small><b dir="ltr">{fmt(t.price)}</b>
        </span>)}
        {planVisible&&m.displayStop!=null&&<span className="sniper-price-snapshot-stop"><small>الإبطال</small><b dir="ltr">{fmt(m.displayStop)}</b></span>}
        {!planVisible&&<span className="sniper-price-snapshot-wait">{feedProblem||'مراقبة فقط · لا توجد أهداف دخول مؤهلة'}</span>}
      </div>
      <details className="sniper-evidence-drawer"><summary>تفاصيل التحليل والمؤشرات والسيولة <span>إظهار</span></summary>
      <div className="sniper-indicator-strip" aria-label="مؤشرات محسوبة من شموع مغلقة">
        <span><small>M1 RSI</small><b>{metric(indicatorRows.m1?.rsi)}</b></span>
        <span><small>M5 RSI</small><b>{metric(indicatorRows.m5?.rsi)}</b></span>
        <span><small>M5 ADX</small><b>{metric(indicatorRows.m5?.adx)}</b></span>
        <span><small>توافق M5</small><b>{technicalFresh?(indicatorRows.m5?.bias==='BUY'?'ميل صعود':indicatorRows.m5?.bias==='SELL'?'ميل هبوط':'متوازن'):'—'}</b></span>
        <span><small>AI · {asset==='GOLD'?'الذهب':'BTC'}</small><b>{technicalFresh?modelLabel:'بيانات قديمة'}</b></span>
        <span><small>حجم التداول</small><b>{!m.historyFresh?'متأخر':volumeBasis==='REAL'?'حقيقي':volumeBasis==='TICK'?'Tick Volume':'غير موثق'}</b></span>
      </div>
      <section className="sniper-pro-move" aria-label="رادار توقع الحركة الفني">
        <div className="sniper-pro-move-head">
          <strong>Predator · حركة السوق القادمة</strong>
          <span className={proMove.status==='CONFIRMED'?'pro-confirmed':proMove.status==='WATCH'?'pro-watch':'pro-wait'}>
            {proMove.status==='CONFIRMED'?'كسر M5 مؤكد فنّيًا':proMove.status==='WATCH'?'ترقب حركة':'انتظار الأدلة'}
          </span>
          <b>{proMove.side==='BUY'?'↗ ميل صاعد':proMove.side==='SELL'?'↘ ميل هابط':'— اتجاه غير محسوم'}</b>
        </div>
        <div className="sniper-pro-move-data">
          <span>توافق فني: <b>{proMove.score}/100</b></span>
          <span>الكسر: <b dir="ltr">{fmt(proMove.trigger)}</b></span>
          <span>إبطال: <b dir="ltr">{fmt(proMove.invalidation)}</b></span>
          <span>ATR M5: <b dir="ltr">{fmt(proMove.m5Atr,2)}</b></span>
          <span>M15/H1: <b>{proMove.timeframeAgreement.m15==='BUY'?'↑':proMove.timeframeAgreement.m15==='SELL'?'↓':'—'} / {proMove.timeframeAgreement.h1==='BUY'?'↑':proMove.timeframeAgreement.h1==='SELL'?'↓':'—'}</b></span>
        </div>
        <p>{proMove.reason} · توافق فني وليس احتمال نجاح أو إشارة تنفيذ.</p>
      </section>
      <details className="sniper-confirmation-details">
        <summary>تفاصيل شروط الكسر · {breakout.ready?'مستويات مراقبة مشروطة':'غير مؤهل'}</summary>
      <div className="sniper-confirmation-strip" aria-label="مستويات الكسر وتأكيد الاتجاه">
        <div className="sniper-confirmation-levels">
          <strong>شرط تأكيد الكسر · M5</strong>
          {breakout.ready?<span dir="ltr">
            {breakout.side==='BUY'?'BUY > '+fmt(breakout.above):
              breakout.side==='SELL'?'SELL < '+fmt(breakout.below):
              'BUY > '+fmt(breakout.above)+'  |  SELL < '+fmt(breakout.below)}
          </span>:<span>المستويات غير متاحة من شموع حديثة</span>}
        </div>
        <p>{breakout.reason}</p>
        {breakout.ready&&<small>المرجع أعلى/أدنى 12 شمعة M5 سابقة + هامش من متوسط مدى الشموع. الكسر وحده ليس تصريح دخول.
          {breakout.invalidation!=null?' مستوى إبطال المراقبة '+fmt(breakout.invalidation):' لا نعرض إبطالًا قبل وجود مستوى سليم.'}</small>}
        {preMoveActive&&<p className="sniper-frame-explanation" aria-label="التهيئة قبل حركة السوق">
          <strong>رادار ما قبل الحركة · {preMove.stage==='ARMED'?'ضغط مُهيّأ':'ضغط بيتكوّن'} · {preMove.side==='BUY'?'ميل شرائي':'ميل بيعي'}</strong>
          {' · مستوى التفعيل '}<b dir="ltr">{fmt(preMove.trigger)}</b>
          {' · إبطال السيناريو '}<b dir="ltr">{fmt(preMove.invalidation)}</b>
          {' · تهيئة فنية '}<b dir="ltr">{Math.round(Number(preMove.readiness||0))}/100</b>
          {' · '}شموع مغلقة فقط، ليست احتمالية ربح ولا تصريح دخول قبل تأكيد الكسر.
        </p>}
        <p className="sniper-frame-explanation">{frameExplanation}</p>
      </div>
      </details>
      <div className={'render-flow-banner phase-'+overlay.phaseKind.toLowerCase()} aria-live="polite">
        <div><small>حالة السيولة · قراءة آخر 4 ساعات</small><strong>{overlay.phaseLabel}</strong></div>
        <p>{overlay.evidence}<small>تقدير سلوكي من السعر والحجم المتاح · لا يمثل احتمال ربح.</small></p>
      </div>
      <div className="sniper-data-health" aria-label="حداثة بيانات القناص">
        <span className={sn.view.priceFresh?'sniper-health-ok':''}>السعر: {sn.view.priceFresh?'حديث':'متأخر'} · {sn.priceAge==null?'—':Math.round(sn.priceAge)+' ث'}</span>
        <span className={m.observationFresh?'sniper-health-ok':''}>قراءة السوق: {m.observationFresh?'حديثة':'متأخرة'} · {Number(observationAt)>0?Math.max(0,Math.round((now-Number(observationAt))/1000))+' ث':'—'}</span>
        <span className={m.historyFresh?'sniper-health-ok':''}>الشموع: {m.historyFresh?'حديثة':'تحتاج تحديث'}</span>
      </div>
      </details>
      <details className="sniper-inspection"><summary>مؤشرات الاتجاه والسيولة بالتفصيل</summary>
      <SniperStrategyRadar frames={x?.chartHigherFrames} now={now} price={m.price} side={dir}
        sourceReady={sn.view.priceFresh&&m.observationFresh} targets={m.displayTargets} stop={m.displayStop}
        liquidityContext={m.fourHour}/>
      </details>
      <details className="sniper-inspection"><summary>تحليل 4 ساعات ومصادر السيولة</summary>
      <section className="sniper-four-hour" aria-label="قراءة آخر أربع ساعات">
        <div className="sniper-four-head">
          <strong>تحليل آخر 4 ساعات · هيكل وسيولة</strong>
          <span>{m.fourHour.ready?'شموع مغلقة · '+m.fourHour.bars+'/240':'بيانات الأربع ساعات غير مكتملة'}</span>
        </div>
        <div className="sniper-four-grid">
          <div><small>اتجاه 4 ساعات</small><b>{!m.fourHour.ready?'انتظار بيانات':m.fourHour.side==='BUY'?'ميل شرائي':m.fourHour.side==='SELL'?'ميل بيعي':'عرضي / انتظار'}</b></div>
          <div><small>حالة التجميع / التصريف</small><b>{m.fourHour.phase}</b></div>
          <div><small>قمة / قاع آخر 4 ساعات</small><b dir="ltr">{fmt(m.fourHour.rangeHigh)} / {fmt(m.fourHour.rangeLow)}</b></div>
          <div><small>تغير 4 ساعات</small><b dir="ltr">{m.fourHour.changePct==null?'—':(m.fourHour.changePct>0?'+':'')+fmt(m.fourHour.changePct)+'%'}</b></div>
          <div><small>{m.fourHour.volumeBasis==='TICK'?'VWAP تقريبي · Tick':'VWAP حسب الحجم'}</small><b dir="ltr">{fmt(m.fourHour.vwap)}</b></div>
          <div><small>سحب السيولة / كسر الهيكل</small><b>{m.fourHour.sweep==='SELL_SIDE'?'قاع مسحوب':m.fourHour.sweep==='BUY_SIDE'?'قمة مسحوبة':'—'} · {m.fourHour.structure==='BOS_UP'?'BOS صاعد':m.fourHour.structure==='BOS_DOWN'?'BOS هابط':'لا كسر'}</b></div>
        </div>
        <p>{m.fourHour.ready?m.fourHour.summary:m.fourHour.reason} · مصدر الشموع: {String(x?.candleSource||'غير محدد')} · {m.fourHour.volumeSource}. التجميع والتصريف تقدير سلوكي لا قياس مباشر لأوامر المؤسسات.</p>
      </section>
      <div className="forecast-decision-row">
        <div className="forecast-decision-card">
          <strong><Layers3 size={15}/> مناطق الارتداد والسيولة</strong>
          <div className="forecast-decision-zones">
            {zoneList.length?zoneList.map(z=><span key={z.key} className={z.kind==='DEMAND'||z.kind==='BUY_REBOUND'?'sniper-zone-buy':z.kind==='SUPPLY'||z.kind==='SELL_REBOUND'?'sniper-zone-sell':''}>
              <small>{z.label}</small><b dir="ltr">{fmt(z.low)} – {fmt(z.high)}</b>
            </span>):<small>لا توجد مناطق جديدة مؤهلة من القمم والقيعان المؤكدة</small>}
          </div>
          {opposingOverlap&&<p className="sniper-zone-conflict-note">
            منطقة طلب وعرض متداخلة <b dir="ltr">{fmt(opposingOverlap.low)} – {fmt(opposingOverlap.high)}</b> ·
            {conflictFavor==='BUY'?' ميل سياقي للشراء لأن القناص والأربع ساعات متفقان، لكنه غير مؤكد للدخول.':
              conflictFavor==='SELL'?' ميل سياقي للبيع لأن القناص والأربع ساعات متفقان، لكنه غير مؤكد للدخول.':
              ' لا توجد أفضلية مثبتة؛ ننتظر كسرًا مغلقًا وتوافق الفريمات.'}
          </p>}
          {sn.flow&&<p>تدفق تقديري: طلب {sn.flow.buy}% · عرض {sn.flow.sell}% ({sn.flow.source})</p>}
        </div>
        <div className="forecast-decision-card">
          <strong><Crosshair size={15}/> قرار القناص وسبب الأهداف</strong>
          <p>{statusText}</p>
          {statusReady&&journal?<p className="sniper-entry-gates">دخول السيناريو المسجل: <b dir="ltr">{fmt(journal.startPrice)}</b> · الإبطال: <b dir="ltr">{fmt(journal.invalidation)}</b> · المتابعة حتى الإبطال أو الوصول للهدف.</p>:
            watchReady?<p className="sniper-entry-gates">مراقبة فقط، ليست صفقة جاهزة. يلزم تأكيد اتجاه وإغلاق M5 مؤهل قبل أي دخول.{m.displayStop!=null?' حد إبطال اتجاه المراقبة: '+fmt(m.displayStop):''}</p>:
            <p className="sniper-entry-gates">لا توجد نقطة دخول مؤهلة حاليًا.{waitReason?' سبب الانتظار: '+waitReason:''}</p>}
          <p>{watchReady?'مستويات بعيدة من قمم وقيعان H1/H4 المكتملة · للمراقبة فقط':sn.longRange?.basis||'في انتظار إطار هيكلي موثوق'}
            {sn.longRange?.atr15!=null?' · ATR M15 '+fmt(sn.longRange.atr15):''}</p>
          {statusReady&&sn.evidence?.length>0&&<div className="forecast-decision-evidence">
            {sn.evidence.slice(0,4).map(item=><span key={item}>{item}</span>)}
          </div>}
        </div>
      </div>
      </details>
      <details className="sniper-inspection"><summary>سجل أداء القناص</summary>
      <section className="sniper-audit-panel sniper-audit-compact" aria-label="ملخص نتائج القناص">
        <div className="sniper-audit-heading">
          <strong><Layers3 size={15}/> سجل أداء القناص · {asset==='GOLD'?'الذهب':'البيتكوين'}</strong>
          <span>{audit?.persistence==='VOLUME'?'سجل على الخادم':audit?.archive?.savedAt>0?'أرشيف دوري · آخر حفظ '+Math.max(0,Math.floor((now-audit.archive.savedAt)/60000))+' د':'جارٍ التحقق من الأرشيف'}</span>
        </div>
        <div className="sniper-performance-grid">
          <SniperPerformance title="سيناريوهات الدخول المؤهلة" metrics={calibration} recent={audit?.recent||[]} asset={asset}/>
          <SniperPerformance title="الرصد الهيكلي للأهداف البعيدة · مراقبة فقط" metrics={watchMetrics} recent={serverWatch?.recent||[]} asset={asset}/>
        </div>
        <p>{audit?.archive?.savedAt>0?
          'أرشيف دوري محفوظ: '+new Date(audit.archive.savedAt).toLocaleString('ar-EG',{timeZone:'Asia/Dubai',dateStyle:'short',timeStyle:'short'})+
          ' · '+audit.archive.records+' سجل. آخر أحداث بعد نقطة الحفظ قد تُفقد عند توقف الخادم.':
          audit?.persistence==='VOLUME'?'السجل محفوظ على وحدة تخزين الخادم.':'لم نتأكد بعد من نقطة حفظ خارجية؛ السجل الحالي مؤقت.'}
          {audit?.archive?.checkedAt>0&&!audit.archive.reachable?' تعذر التحقق من أحدث نسخة؛ المعروض آخر حفظ معروف.':
            audit?.archive?.savedAt>0&&now-audit.archive.savedAt>45*60000?' الأرشفة متأخرة؛ آخر نسخة محفوظة ما زالت متاحة.':''}
          {' '}فجوات المتابعة مستبعدة من النسب. هذا سجل رصد ورقي وليس قياس ربحية صفقات فعلية.
        </p>
        <a className="sniper-audit-export" href="/api/sniper-audit?archive=1" download="sniper-paper-audit.json">تنزيل نسخة السجل JSON</a>
      </section>
      </details>
      <footer className="forecast-visual-note"><span>الشموع M1 فعلية ومغلقة · السعر الحي نقطة مستقلة · المستقبل مسار احتمالي غير زمني.</span>
        <span>{highest?'آخر مستوى '+fmt(highest.price):'لا أهداف دخول معتمدة'}</span></footer>
    </div>
  </section>;
}
