'use client';

import {useEffect,useState} from 'react';
import {Crosshair,Layers3} from 'lucide-react';
import {buildForecastMotion} from '../lib/forecast-motion';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import NewsCommandCenter from './NewsCommandCenter';
import {economicNewsTimeline} from '../lib/news-alert-window';
import type {ForecastJournal} from '../lib/forecast-journal';
import SniperPerformance from './SniperPerformance';
import SniperStrategyRadar from './SniperStrategyRadar';
import {watchForChart} from '../lib/sniper-audit-view';
import {collapseChartZones,findOpposingOverlap,primaryLiquidityZone} from '../lib/chart-zone-merge';
import {buildBreakoutGuide,explainFrameConflict,layoutPriceLanes} from '../lib/sniper-decision-guide';

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
  const [newsOpen,setNewsOpen]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [chartWindow,setChartWindow]=useState<60|240>(240);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 600px)');
    const update=()=>setMobile(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  const earlyNews=economicNewsTimeline(data?.newsEvents||[],data?.autopilot?.nextEvent||null,now).alerts;
  const dueNews=earlyNews.length;
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
  const rise=dir==='BUY',fall=dir==='SELL';
  const W=mobile?680:1040,H=expanded?700:560,x0=mobile?18:52,
    x1=mobile?280:530,xf=x1+10,xr=W-(mobile?150:146),yt=30,yb=H-90,volumeEnd=H-45;
  const breakout=buildBreakoutGuide({frames:x?.chartHigherFrames,now,side:dir,price:m.price,
    sourceReady:sn.view.priceFresh&&m.observationFresh&&m.historyFresh,invalidation:m.displayStop});
  const motion=buildForecastMotion({visible:planVisible,side:dir,price:m.price,
    targets:m.displayTargets,breakout});
  const motionColor=watchReady?'#e8b35e':rise?'#51e5ac':'#f08ca4';
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
  const allBounds=[...candleBounds,...chartBands.flatMap(z=>[z.low,z.high]),...motion.map(p=>p.price)];
  const allMin=allBounds.length?Math.min(...allBounds):m.lower;
  const allMax=allBounds.length?Math.max(...allBounds):m.upper;
  const allSpan=Math.max(allMax-allMin,candleSpan);
  const scaleLow=focusCandles?candleMin-candleSpan*.3:allMin-allSpan*.1;
  const scaleHigh=focusCandles?candleMax+candleSpan*.3:allMax+allSpan*.1;
  const px=(p:number)=>yt+(scaleHigh-p)/Math.max(.0000001,scaleHigh-scaleLow)*(yb-yt);
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
  const candleWidth=clamp(stride*.62,mobile?.6:1,8.5);
  const maxVolume=Math.max(1,...candles.map(c=>c.volume));
  const historyX=(time:number)=>{
    const i=candles.findIndex(c=>c.time>=time);
    return i<0?x1:x0+(i+.5)*stride;
  };
  const readingLive=m.fourHour.ready&&sn.view.priceFresh&&m.observationFresh&&m.historyFresh;
  const marketEvents=readingLive?m.fourHour.events.filter(e=>candles[0]&&e.at>=candles[0].time)
    .filter((e,i,a)=>a.findLastIndex(q=>q.kind===e.kind)===i).slice(mobile?-2:-3):[];
  const contextBox=readingLive?m.fourHour.contextBox:null;
  const projectedPoints=motion.map((p,i)=>({...p,
    x:xf+i*(xr-xf-18)/Math.max(1,motion.length-1),y:px(p.price)}));
  let projectedPath='';
  if(projectedPoints.length>=2){
    projectedPath='M '+projectedPoints[0].x+' '+projectedPoints[0].y;
    projectedPoints.slice(1).forEach((p,i)=>{
      const a=projectedPoints[i],dx=p.x-a.x;
      projectedPath+=' C '+(a.x+dx*.35)+' '+a.y+' '+(p.x-dx*.35)+' '+p.y+' '+p.x+' '+p.y;
    });
  }
  const motionLabels=layoutPriceLanes(projectedPoints.filter(p=>p.kind!=='HOLD').map((p,i)=>({
    key:p.key,y:clamp(p.y+(i%2===0?-32:36),yt+20,yb-20)
  })),yt+20,yb-20,mobile?34:30);
  const ageMin=m.historyAge==null?null:Math.ceil(m.historyAge/60000);
  const stateLabel=!watchFresh&&!statusReady?'انتظار ذاكرة حديثة':statusReady?'سيناريو مؤهل · مسجل':watchReady&&m.heldBias?'اتجاه مثبت · أهداف مراقبة':watchReady?'أهداف بعيدة · مراقبة فقط':
    m.bias.active&&m.bias.side!=='WAIT'?(m.heldBias?'اتجاه محفوظ · تحقق مستمر':'الاتجاه مرصود · جارٍ البحث عن مستوى بعيد'):
    m.bias.active?'سوق عرضي · التحليل مستمر':
    m.status==='STALE_CANDLES'?'سوق متوقف أو شموع متأخرة':
    m.status==='NO_CANDLES'?'لا توجد شموع كافية':'انحياز سابق · ليس تحليلًا لحظيًا';
  const highest=m.displayTargets.at(-1);
  const zoneList=chartBands.filter(z=>z.kind!=='TARGET'&&z.kind!=='STOP').slice(0,4);
  const conflictFavor=opposingOverlap&&m.fourHour.ready&&dir!=='WAIT'&&
    m.fourHour.side===dir?dir:'WAIT';
  const blockAt=Number(audit?.blockAt?.[asset]||0);
  const waitReason=!planVisible&&blockAt>0&&blockAt<=now+2000&&now-blockAt<=90000?
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
          <div><strong>خريطة حركة {asset==='GOLD'?'الذهب':'البيتكوين'}</strong>
            <small>M1 · 4H CONTEXT · H1/H4 DISTANT TARGET RADAR</small></div>
        </div>
        <div className="forecast-visual-controls">
          <button type="button" onClick={()=>setNewsOpen(v=>!v)} aria-expanded={newsOpen}
            className={'forecast-news-tab '+(newsOpen?'active':'')}>الأخبار {dueNews>0?'· '+dueNews:''}</button>
          {assetView==='ALL'&&<div className="forecast-visual-tabs" role="group" aria-label="الأصل على الرسم">
            <button type="button" aria-pressed={asset==='GOLD'} onClick={()=>setChosen('GOLD')}>الذهب</button>
            <button type="button" aria-pressed={asset==='BTC'} onClick={()=>setChosen('BTC')}>البيتكوين</button>
          </div>}
          <span className={'forecast-visual-status '+(statusReady?'forecast-visual-active':watchReady?'forecast-visual-watch':'')}>
            <span className="forecast-dot"/>{stateLabel}
          </span>
        </div>
      </header>
      {earlyNews.length>0&&!newsOpen&&<button type="button" className="forecast-news-peek" onClick={()=>setNewsOpen(true)}>
        خبر خلال 8 ساعات: {earlyNews[0].name} · التفاصيل في تبويب الأخبار ↗
      </button>}
      {newsOpen&&<div className="forecast-news-drawer"><NewsCommandCenter events={data?.newsEvents||[]} now={now} featuredEvent={data?.autopilot?.nextEvent||null}/></div>}
      <div className="sniper-decision-strip" aria-label="قرار موحد للقناص">
        <strong className={rise?'green':fall?'red':''}>{rise?'ميل صعود':fall?'ميل هبوط':!memory.bias?'تهيئة ذاكرة الأهداف':!m.bias.active?'توقف مؤقت للبيانات':watchFresh?'سوق متوازن · ترقب كسر':'الذاكرة متأخرة'}</strong>
        <span>{planVisible?m.heldBias?'أهداف مثبتة · تتغير عند الوصول أو الإبطال أو انعكاس مؤكد':'مستويات هيكلية من الخادم · للمراقبة':watchFresh?memory.state?.reachedPrices?.length&&!memory.state?.targets?.length?'الأهداف السابقة استُهلكت؛ انتظار إغلاق M15 لهدف جديد':m.bias.reason:'انتظار بيانات الخادم؛ لا نستبدلها بأهداف متغيرة'}</span>
        {m.fourHour.ready&&<b>4س · {m.fourHour.phase}</b>}
      </div>
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
        <p className="sniper-frame-explanation">{frameExplanation}</p>
      </div>
      <div className={'forecast-visual-layout'+(expanded?' forecast-layout-expanded':'')}>
        <div className={'forecast-visual-chart-wrap'+(expanded?' forecast-chart-expanded':'')}>
          <div className="forecast-visual-topline">
            <span><Layers3 size={13}/> M1 · {candles.length} شمعة · توقيت الإمارات</span>
            <span>{ageMin!=null?'عمر آخر إغلاق '+ageMin+' دقيقة':'لا توجد بيانات شموع'}</span>
            <div className="forecast-chart-tools">
              <button type="button" aria-pressed={chartWindow===60} onClick={()=>setChartWindow(60)}>ساعة</button>
              <button type="button" aria-pressed={chartWindow===240} onClick={()=>setChartWindow(240)}>4 ساعات</button>
              <button className="forecast-chart-zoom" type="button" aria-pressed={focusCandles} onClick={()=>setFocusCandles(v=>!v)}>{focusCandles?'كل الأهداف':'تركيز الشموع'}</button>
              <button type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'حجم عادي':'توسيع الرسم ⤢'}</button>
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
              <text x={xf+8} y="18" fill="#e7c58a" fontSize={mobile?18:12}>{mobile?'سيناريو':'المستقبل / سيناريو'}</text>
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
                <title>{'منطقة التفعيل المشروط · '+fmt(breakout.trigger)+' · إغلاق شمعتي M5، ثم توافق M15/H1'}</title>
              </g>}
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
              {candles.map((c,i)=>{
                const x=x0+(i+.5)*stride;
                const color=c.close>=c.open?'#4ad9c6':'#f0758a';
                const top=Math.min(px(c.open),px(c.close)),bottom=Math.max(px(c.open),px(c.close));
                const volumeH=Math.min(35,Math.max(1,c.volume/maxVolume*35));
                return <g key={c.time}>
                  <line x1={x} x2={x} y1={px(c.high)} y2={px(c.low)} stroke={color} strokeWidth="1.3"/>
                  <rect x={x-candleWidth/2} y={top} width={candleWidth}
                    height={Math.max(1.3,bottom-top)} rx=".45" fill={color}/>
                  <rect x={x-candleWidth/2} y={volumeEnd-volumeH} width={candleWidth}
                    height={volumeH} fill={color} opacity=".35"/>
                  <title>{clock(c.time)+' · O '+fmt(c.open)+' H '+fmt(c.high)+' L '+fmt(c.low)+' C '+fmt(c.close)}</title>
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
              {projectedPath&&<g className="forecast-motion-path" clipPath={'url(#forecast-plot-'+asset+')'}>
                <path d={projectedPath} stroke="#071823" strokeWidth="8" fill="none" opacity=".7"/>
                <path d={projectedPath} stroke={motionColor} strokeWidth="3"
                  strokeDasharray={watchReady?'8 6':undefined} fill="none" markerEnd={'url(#forecast-arrow-'+asset+')'}/>
                {projectedPoints.map((p,i)=>{
                  if(p.y<yt||p.y>yb)return null;
                  const labelY=motionLabels.find(l=>l.key===p.key)?.labelY??clamp(p.y-30,yt+24,yb-20);
                  const short=p.kind==='TARGET'?p.key:p.kind==='START'?'بداية':p.kind==='BREAK'?'تفعيل':p.kind==='RETEST'?'اختبار؟':'ثبات؟';
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
                <rect x={xf+8} y="136" width={xr-xf-16} height="80" rx="9" fill="#0a1520" stroke="#3a5464" strokeOpacity=".8"/>
                <text x={(xf+xr)/2} y="162" fill="#cedfeb" textAnchor="middle" fontSize="14" fontWeight="700">
                  {m.status==='STALE_CANDLES'?'الشموع متأخرة':m.status==='NO_CANDLES'?'انتظار شموع':watchFresh?'ترقب كسر':'تهيئة الذاكرة'}</text>
                <text x={(xf+xr)/2} y="187" fill="#91abbb" textAnchor="middle" fontSize={mobile?11:11}>لا إشارة دخول</text>
              </g>}
            </svg>
          </div>
          {motion.length>0&&<div className="forecast-motion-guide" aria-label="خطوات المسار المتوقع">
            <strong>{statusReady?'سيناريو مؤهل':'مراقبة مشروطة'} · كيف يصل السعر للأهداف؟</strong>
            <ol>{motion.map((p,i)=><li key={p.key}>
              <b>{i+1}</b><span>{p.label}{p.kind!=='HOLD'&&<small dir="ltr">{fmt(p.price)}</small>}</span>
            </li>)}</ol>
            <p>المسار يوضح ترتيبًا محتملًا، وليس شكل الشموع أو موعد الوصول. إعادة الاختبار اختيارية وقد يصل السعر مباشرة أو يُبطل السيناريو.
              {motion.some(p=>p.kind==='HOLD')?' الثبات المرسوم امتداد توضيحي من مدى M5.':''}
              {watchReady?' الكسر يحتاج إغلاق شمعتي M5 وتوافق M15/H1 وباقي شروط القناص؛ ليس تصريح دخول.':''}</p>
          </div>}
          <div className="forecast-visual-legend">
            <span><i className="forecast-legend-history"/> شموع فعلية</span>
            <span><i className="forecast-legend-projection"/> {watchReady?'مسار مستويات بعيد · توضيحي':'سيناريو مشروط'}</span>
            <span><i className="forecast-legend-target"/> مناطق أهداف</span>
            <span><i className="forecast-legend-rebound"/> مناطق سيولة</span>
            {primaryZone&&<span className="sniper-primary-zone">★ أعلى أولوية عرض · {primaryZone.confirmedAt?'قمة/قاع M5 مؤكد':'منطقة تحليل'}{(primaryZone.sources?.length||0)>1?' + توافق مصدرين':''}</span>}
            {opposingOverlap&&<span className="sniper-conflict-legend">◇ تداخل طلب وعرض · انتظار</span>}
            <span className="sniper-buy-legend">● طلب / استرداد</span><span className="sniper-sell-legend">● عرض / رفض</span>
            <span><i className="forecast-legend-stop"/> إبطال</span>
          </div>
        </div>
      </div>
      <div className="sniper-data-health" aria-label="حداثة بيانات القناص">
        <span className={sn.view.priceFresh?'sniper-health-ok':''}>السعر: {sn.view.priceFresh?'حديث':'متأخر'} · {sn.priceAge==null?'—':Math.round(sn.priceAge)+' ث'}</span>
        <span className={m.observationFresh?'sniper-health-ok':''}>قراءة السوق: {m.observationFresh?'حديثة':'متأخرة'} · {Number(observationAt)>0?Math.max(0,Math.round((now-Number(observationAt))/1000))+' ث':'—'}</span>
        <span className={m.historyFresh?'sniper-health-ok':''}>الشموع: {m.historyFresh?'حديثة':'تحتاج تحديث'}</span>
      </div>
      <SniperStrategyRadar frames={x?.chartHigherFrames} now={now} price={m.price} side={dir}
        sourceReady={sn.view.priceFresh&&m.observationFresh} targets={m.displayTargets} stop={m.displayStop}
        liquidityContext={m.fourHour}/>
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
          {audit?.archive?.savedAt>0&&now-audit.archive.savedAt>45*60000?' الأرشفة متأخرة؛ آخر نسخة محفوظة ما زالت متاحة.':''}
          {' '}فجوات المتابعة مستبعدة من النسب. هذا سجل رصد ورقي وليس قياس ربحية صفقات فعلية.
        </p>
        <a className="sniper-audit-export" href="/api/sniper-audit?archive=1" download="sniper-paper-audit.json">تنزيل نسخة السجل JSON</a>
      </section>
      </details>
      <footer className="forecast-visual-note">
        <span>الشموع السابقة بيانات سوق فعلية. {watchReady?'الخط الأصفر مراقبة هيكلية أولية، وليس إشارة شراء أو بيع.':'المسار ترتيب محتمل لتوضيح السيناريو، وليس توقعًا لشكل الشموع أو وقت وصولها.'}</span>
        <span>{highest?(statusReady?'الهدف المسجل الأخير ':'أبعد مستوى هيكلي مرصود ')+fmt(highest.price):m.bias.active?'انحياز ظاهر · لا مستوى بعيد متاح':'آخر بيانات للمتابعة فقط'}</span>
      </footer>
    </div>
  </section>;
}
