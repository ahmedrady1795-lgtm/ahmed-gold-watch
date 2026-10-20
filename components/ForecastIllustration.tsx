'use client';

import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Crosshair,Layers3,ShieldAlert,Target} from 'lucide-react';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {buildChartOverlay} from '../lib/chart-trading-overlay';
import NewsCommandCenter from './NewsCommandCenter';
import GoldTrapRadarPanel from './GoldTrapRadarPanel';
import {economicNewsTimeline} from '../lib/news-alert-window';
import type {ForecastJournal} from '../lib/forecast-journal';

const fmt=(p:number|null|undefined,d=2)=>p!=null&&Number.isFinite(p)?
  p.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clock=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const clamp=(p:number,a:number,b:number)=>Math.max(a,Math.min(b,p));

export default function ForecastIllustration({data,now,snapshotAt,goldLive,btcLive,assetView='ALL',journals,audit,auditLoaded=false}:{
  data:any;now:number;snapshotAt:unknown;goldLive?:any;btcLive?:any;assetView?:'ALL'|'GOLD'|'BTC';
  journals?:{GOLD:ForecastJournal|null;BTC:ForecastJournal|null};audit?:any;auditLoaded?:boolean
}){
  const [chosen,setChosen]=useState<'GOLD'|'BTC'>('GOLD');
  const [focusCandles,setFocusCandles]=useState(false);
  const [newsOpen,setNewsOpen]=useState(false);
  const earlyNews=economicNewsTimeline(data?.newsEvents||[],data?.autopilot?.nextEvent||null,now).alerts;
  const dueNews=earlyNews.length;
  const asset: 'GOLD'|'BTC'=assetView==='ALL'?chosen:assetView;
  const x=asset==='GOLD'?data?.gold:data?.bitcoin;
  const journal=journals?.[asset]??null;
  const calibration=audit?.metrics?.[asset];
  const observed=Number(calibration?.observed||0);
  const lastSource=Number(audit?.updatedAt||0);
  const auditHealthy=Boolean(auditLoaded&&audit?.persistence==='VOLUME'&&lastSource>0&&
    now-lastSource<180000);
  const serverWatch=audit?.watch?.[asset];
  const watchFresh=auditHealthy&&serverWatch?.updatedAt>0&&now-serverWatch.updatedAt<90000&&now>=serverWatch.updatedAt;
  const watchMetrics=serverWatch?.metrics;
  const watchObserved=Number(watchMetrics?.observed||0);
  const m=buildForecastIllustration(asset,x,asset==='GOLD'?goldLive:btcLive,now,snapshotAt,
    auditHealthy?journal:null,true,serverWatch?.state??null,serverWatch?.bias?
      (watchFresh?serverWatch.bias:{...serverWatch.bias,active:false}):null);
  const statusReady=m.ready&&auditHealthy;
  const watchReady=m.watchReady&&!statusReady;
  const overlay=buildChartOverlay({
    now,price:m.price,historyFresh:m.historyFresh,priceFresh:sniperPriceFresh(),
    fourHour:m.fourHour,m5:x?.chartHigherFrames?.m5,accumulation:x?.accumulation,
    targets:statusReady||watchReady?m.displayTargets:[]
  });
  function sniperPriceFresh(){return m.sniper.view.priceFresh;}
  const planVisible=statusReady||watchReady;
  const sn=m.sniper,dir=planVisible?m.displaySide:m.bias.active?m.bias.side:'WAIT';
  const rise=dir==='BUY',fall=dir==='SELL';
  const W=1040,H=465,x0=52,x1=612,xf=622,xr=946,yt=30,yb=375;
  const candleBounds=m.candles.flatMap(c=>[c.low,c.high]);
  if(m.price!=null)candleBounds.push(m.price);
  const candleMin=candleBounds.length?Math.min(...candleBounds):m.lower;
  const candleMax=candleBounds.length?Math.max(...candleBounds):m.upper;
  const candleSpan=Math.max(candleMax-candleMin,Math.abs(m.price||0)*.00065,.01);
  const scaleLow=focusCandles?candleMin-candleSpan*.3:Math.min(m.lower,overlay.lower?.low??m.lower,overlay.breakoutDown??m.lower);
  const scaleHigh=focusCandles?candleMax+candleSpan*.3:Math.max(m.upper,overlay.upper?.high??m.upper,overlay.breakoutUp??m.upper);
  const px=(p:number)=>yt+(scaleHigh-p)/Math.max(.0000001,scaleHigh-scaleLow)*(yb-yt);
  const grid=Array.from({length:5},(_,i)=>({y:yt+i*(yb-yt)/4,value:scaleHigh-(scaleHigh-scaleLow)*i/4}));
  const candles=m.candles;
  const stride=(x1-x0)/Math.max(candles.length,1);
  const candleWidth=clamp(stride*.62,2,8.5);
  const maxVolume=Math.max(1,...candles.map(c=>c.volume));
  const chartBands=m.bands.slice().sort((a,b)=>a.kind==='TARGET'?-1:b.kind==='TARGET'?1:0);
  const projected=m.projected;
  // Conditional paths never claim an approved trade, and only lead to closed-M5
  // breakout levels or existing four-hour liquidity ranges.
  const conditionalPath=(side:'BUY'|'SELL')=>{
    const level=side==='BUY'?overlay.breakoutUp:overlay.breakoutDown;
    if(!overlay.ready||level==null||m.price==null)return '';
    const pool=side==='BUY'?overlay.upper:overlay.lower;
    const terminal=pool&&(side==='BUY'?pool.center>level:pool.center<level)?pool.center:level;
    const start=clamp(px(m.price),yt+10,yb-10),breakAt=clamp(px(level),yt+10,yb-10);
    const endAt=clamp(px(terminal),yt+10,yb-10);
    return 'M '+xf+' '+start+' C '+(xf+45)+' '+start+' '+(xf+58)+' '+breakAt+' '+(xf+126)+' '+breakAt+
      ' C '+(xf+170)+' '+breakAt+' '+(xr-100)+' '+endAt+' '+(xr-38)+' '+endAt;
  };
  let projectedPath='';
  if(planVisible&&projected.length>=2){
    projectedPath='M '+xf+' '+px(projected[0].price);
    projected.slice(1).forEach((p,i)=>{
      const xa=i===0?xf:Math.round(716+(i-1)*106);
      const xb=Math.min(xr-8,716+i*106);
      const ya=px(projected[i].price),yb2=px(p.price);
      projectedPath+=' C '+(xa+29)+' '+ya+' '+(xb-32)+' '+yb2+' '+xb+' '+yb2;
    });
  }
  const ageMin=m.historyAge==null?null:Math.ceil(m.historyAge/60000);
  const stateLabel=statusReady?'سيناريو مؤهل · مسجل':watchReady&&m.heldBias?'اتجاه مثبت · أهداف مراقبة':watchReady?'أهداف بعيدة · مراقبة فقط':
    m.bias.active&&m.bias.side!=='WAIT'?(m.heldBias?'اتجاه محفوظ · تحقق مستمر':'الاتجاه مرصود · جارٍ البحث عن مستوى بعيد'):
    m.bias.active?'سوق عرضي · التحليل مستمر':
    m.status==='STALE_CANDLES'?'سوق متوقف أو شموع متأخرة':
    m.status==='NO_CANDLES'?'لا توجد شموع كافية':'انحياز سابق · ليس تحليلًا لحظيًا';
  const highest=m.displayTargets.at(-1);
  const zoneList=sn.zones.slice(0,4);
  const reboundBuy=m.fourHour.zones.filter(z=>z.side==='BUY');
  const reboundSell=m.fourHour.zones.filter(z=>z.side==='SELL');
  const statusText=statusReady?(journal?.message||sn.stageText):
    watchReady?(m.bias.active?m.bias.reason+' · مستويات مرصودة من H1/H4، وليست إشارة دخول':sn.view.reason):
    m.bias.label+' · '+m.bias.reason;
  const activation=statusReady&&sn.activation?'خلال '+sn.activation.min+'–'+sn.activation.max+' د':'—';
  const arrival=statusReady&&sn.arrival?'خلال '+sn.arrival.min+'–'+sn.arrival.max+' د':'غير محدد';

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
      <div className="forecast-brain-strip">
        <span><Activity size={14}/> {m.bias.active?m.bias.label+(m.heldBias?' · ثابت حتى تأكيد عكسي':m.bias.opposition?' · اختلاف فريمات':' · رصد متواصل'):
          'آخر قراءة: '+m.bias.label+' · '+m.bias.reason} {m.fourHour.ready?' · 4س: '+m.fourHour.phase:''}</span>
        <span><Layers3 size={14}/> وجهات بعيدة: H1 / H4 · مستويات فعلية</span>
        <span><Target size={14}/> {statusReady?'سيناريو مسجل':watchReady?'مستويات مراقبة بعيدة · دون أمر تداول':m.bias.active?'الاتجاه مرصود · الأهداف قيد التحقق':'بيانات قيد التحديث'}</span>
      </div>
      <div className={'forecast-flow-banner phase-'+overlay.phaseKind.toLowerCase()} aria-live="polite">
        <div className="forecast-flow-title">
          <span className="forecast-flow-orb"><Layers3 size={21}/></span>
          <div><small>حالة السيولة · آخر 4 ساعات</small><strong>{overlay.phaseLabel}</strong></div>
        </div>
        <div className="forecast-flow-explainer">
          <span>{overlay.evidence}</span>
          <small>استنتاج من الشموع ومناطق السعر، وليس رصدًا مباشرًا لأوامر المؤسسات.</small>
        </div>
        <div className="forecast-flow-zones">
          <span>سيولة علوية <b dir="ltr">{overlay.upper?fmt(overlay.upper.low)+' – '+fmt(overlay.upper.high):'—'}</b></span>
          <span>سيولة سفلية <b dir="ltr">{overlay.lower?fmt(overlay.lower.low)+' – '+fmt(overlay.lower.high):'—'}</b></span>
        </div>
      </div>
      <div className="forecast-visual-layout">
        <div className="forecast-visual-facts">
          <div className="forecast-visual-fact forecast-visual-last">
            <small>السعر المرجعي {sn.view.priceFresh?'· حديث':'· غير مباشر'}</small>
            <strong dir="ltr">{fmt(m.price)}</strong>
          </div>
          <div className="forecast-visual-fact">
            <small>الاتجاه المحتمل</small>
            <strong className={rise?'green':fall?'red':'forecast-visual-muted'}>
              {rise?<ArrowUpRight size={16}/>:fall?<ArrowDownRight size={16}/>:<Activity size={15}/>}
              {rise?(statusReady?'صعود مؤهل':'ميل صعود للمراقبة'):fall?(statusReady?'هبوط مؤهل':'ميل هبوط للمراقبة'):m.bias.active?'حركة عرضية / ترقب كسر':'البيانات غير حديثة'}</strong>
          </div>
          <div className="forecast-visual-targets">
            {([1,2,3] as const).map(i=>{
              const target=m.displayTargets.find(t=>t.stage===i);
              return <div key={i} className="forecast-visual-target">
                <span>{watchReady?('هدف بعيد '+i+' · مراقبة'):(i===1?'TP1 · أول':i===2?'TP2 · رئيسي':'TP3 · ممتد')}<small>{statusReady&&target&&'reached' in target&&target.reached?'تم الوصول':watchReady&&target?('source' in target && typeof target.source==='string'?target.source:'H1/H4 · مرصود'):(target?'M15/H1 · هيكلي':'لا يوجد مستوى مرصود بعد')}</small></span>
                <strong dir="ltr">{fmt(target?.price)}</strong>
              </div>;
            })}
          </div>
          <div className="forecast-visual-fact forecast-visual-stop">
            <small><ShieldAlert size={13}/> {watchReady?'حد إبطال الميل للمراقبة':'إبطال السيناريو'}</small>
            <strong dir="ltr">{fmt(m.displayStop)}</strong>
          </div>
          <div className="forecast-visual-fact forecast-visual-time">
            <small><Clock3 size={13}/> بدء الحركة / الهدف الأول</small>
            <strong>{statusReady?activation:watchReady?'رصد طويل المدى':'—'}</strong>
            <span>{statusReady?arrival:watchReady?'الزمن غير مؤكد · H1/H4':'لا يوجد توقيت وصول موثوق'}</span>
          </div>
          <div className="forecast-visual-confidence">
            <span>{statusReady?'قوة التحليل':'الانحياز الهيكلي'} <b>{statusReady&&sn.view.confidence!=null?fmt(sn.view.confidence,0)+'/100':
              m.bias.active?(m.bias.agreement+' مصادر مؤيدة'):'—'}</b></span>
            <small>{statusReady?'تقييم مشروط وليس ضمان ربح':m.bias.active?
              (m.heldBias?'اتجاه مراقبة محفوظ؛ الانعكاس يحتاج إغلاقين M15 مع توافق H1/H4':m.bias.opposition?'ميل غير إجماعي · للاستكشاف فقط':'رصد مستمر، غير صالح كإشارة دخول'):
              'السوق قد يكون مغلقًا أو البيانات متأخرة'}</small>
          </div>
        </div>
        <div className="forecast-visual-chart-wrap">
          <div className="forecast-visual-topline">
            <span><Layers3 size={13}/> M1 / آخر {candles.length} شمعة مغلقة</span>
            <span>{ageMin!=null?'عمر آخر إغلاق '+ageMin+' دقيقة':'لا توجد بيانات شموع'}</span>
            <button className="forecast-chart-zoom" type="button" onClick={()=>setFocusCandles(v=>!v)}>{focusCandles?'عرض كل المستويات':'تكبير الشموع'}</button>
          </div>
          <div className="forecast-visual-chart-scroll">
            <svg className="forecast-visual-svg" viewBox={'0 0 '+W+' '+H}
              role="img" aria-label={statusReady?
                'الشموع الحقيقية والسيناريو المسجل إلى '+m.displayTargets.map(t=>'TP'+t.stage+' '+fmt(t.price)).join(' ثم '):
                watchReady?'الشموع الحقيقية مع مستويات مراقبة مبكرة غير مؤهلة للدخول':
                'الشموع التاريخية فقط، ولا توجد إشارة مؤهلة'} >
              <defs>
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
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={rise?'#54e7ab':'#f09ca9'}/>
                </marker>
              </defs>
              <rect x="0" y="0" width={W} height={H} rx="9" fill={'url(#forecast-chart-'+asset+')'}/>
              <rect x={xf} y="16" width={xr-xf} height="405" fill="#56bde7" opacity=".028"/>
              {grid.map((g,i)=><g key={'grid'+i}>
                <line x1={x0} x2="958" y1={g.y} y2={g.y} stroke="#426076" strokeOpacity=".32" strokeDasharray="3 6"/>
                <text x="966" y={g.y+4} fill="#97afc0" fontSize="11" fontFamily="monospace">{fmt(g.value)}</text>
              </g>)}
              {Array.from({length:7},(_,i)=><line key={'v'+i} x1={x0+i*148} x2={x0+i*148} y1="18" y2="430"
                stroke="#345267" strokeOpacity=".20" strokeDasharray="3 7"/>)}
              <line x1={xf-8} x2={xf-8} y1="20" y2="425" stroke="#72b3d1" strokeOpacity=".5"
                strokeDasharray="6 7"/>
              <text x={xf-14} y="13" textAnchor="end" fill="#88bbd3" fontSize="11">تاريخ فعلي</text>
              <text x={xf+8} y="13" fill="#e7c58a" fontSize="11">المستقبل / سيناريو</text>
              {overlay.ready&&[overlay.upper,overlay.lower].filter((z):z is NonNullable<typeof z>=>z!=null).map(z=>{
                const top=clamp(px(z.high),yt,yb),bottom=clamp(px(z.low),yt,yb);
                const clr=z.side==='UPPER'?'#ff8397':'#55ddeb';
                return <g key={'pool-'+z.side}>
                  <rect x={x0} y={Math.min(top,bottom)} width={xr-x0} height={Math.max(5,Math.abs(bottom-top))}
                    rx="4" fill={clr} fillOpacity=".11" stroke={clr} strokeOpacity=".65" strokeDasharray="6 5"/>
                  <text x={xf+12} y={clamp(Math.min(top,bottom)-5,yt+9,yb-7)} fill={clr} fontSize="11" fontWeight="700">
                    {z.side==='UPPER'?'سيولة علوية · عرض محتمل':'سيولة سفلية · طلب محتمل'}</text>
                </g>;
              })}
              {overlay.ready&&([{side:'BUY',level:overlay.breakoutUp,confirmed:overlay.confirmedUp},
                {side:'SELL',level:overlay.breakoutDown,confirmed:overlay.confirmedDown}] as const)
                .filter(o=>o.level!=null).map(o=>{
                  const y=clamp(px(o.level!),yt+10,yb-10),color=o.side==='BUY'?'#6beab8':'#ff9ea9';
                  return <g key={'break-'+o.side}>
                    <line x1={xf-8} x2={xr-9} y1={y} y2={y} stroke={color} strokeOpacity=".86"
                      strokeWidth={o.confirmed?2:1.3} strokeDasharray={o.confirmed?undefined:'6 5'}/>
                    <circle cx={xf+4} cy={y} r="4" fill="#102330" stroke={color} strokeWidth="1.5"/>
                    <text x={xf+12} y={clamp(y-8,yt+12,yb-5)} fill={color} fontSize="11" fontWeight="700">
                      {o.side==='BUY'?'كسر صاعد':'كسر هابط'} {fmt(o.level)} {o.confirmed?'· مؤكد M5':'· مشروط'}</text>
                  </g>;
                })}
              {chartBands.map(z=>{
                const clr=z.kind==='BUY_REBOUND'?'#42e5a9':z.kind==='SELL_REBOUND'?'#ff7189':
                  z.kind==='TARGET'?'#3ce6a8':z.kind==='STOP'?'#fd687c':
                  z.kind==='REBOUND'?'#e8b35e':z.kind==='SUPPLY'?'#b48be9':
                  z.kind==='DEMAND'?'#4e96ff':'#67d9e3';
                const high=px(z.high),low=px(z.low),mid=px(z.price);
                return <g key={z.key}>
                  <rect x={x0} y={Math.min(high,low)-3} width={xr-x0}
                    height={Math.max(6,Math.abs(low-high)+6)} fill={clr} opacity={z.kind==='TARGET'?.12:.075} rx="2"/>
                  <line x1={z.kind==='TARGET'?xr-322:x0} x2={xr}
                    y1={mid} y2={mid} stroke={clr} strokeWidth={z.kind==='TARGET'?1.4:1}
                    strokeDasharray={z.kind==='STOP'?'7 6':undefined} strokeOpacity=".72"/>
                  <text x={xr-7} y={mid-7} textAnchor="end" fontSize="11" fill={clr}
                    fontWeight={z.kind==='TARGET'?700:500}>{z.label+'  '+fmt(z.price)}</text>
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
                  <rect x={x-candleWidth/2} y={420-volumeH} width={candleWidth}
                    height={volumeH} fill={color} opacity=".35"/>
                  <title>{clock(c.time)+' · O '+fmt(c.open)+' H '+fmt(c.high)+' L '+fmt(c.low)+' C '+fmt(c.close)}</title>
                </g>;
              })}
              <line x1={x0} x2={xr} y1="420" y2="420" stroke="#416077" strokeOpacity=".4"/>
              {candles.length>0&&[0,.33,.66,1].map((a,i)=>{
                const c=candles[Math.min(candles.length-1,Math.round((candles.length-1)*a))];
                return <text key={'time'+i} x={x0+(i/3)*(x1-x0)} y="452"
                  fill="#8ba6b9" textAnchor={i===0?'start':i===3?'end':'middle'} fontSize="11">{clock(c.time)}</text>;
              })}
              {m.price!=null&&sn.view.priceFresh&&<g>
                <line x1={x0} x2={xr} y1={px(m.price)} y2={px(m.price)}
                  stroke="#5ad6f4" strokeDasharray="3 5" strokeOpacity=".65"/>
                <rect x={xr+3} y={px(m.price)-12} width="91" height="23" rx="5" fill="#1b7291"/>
                <text x={xr+48} y={px(m.price)+4} textAnchor="middle" fill="#e8faff"
                  fontSize="12" fontWeight="700" fontFamily="monospace">{fmt(m.price)}</text>
              </g>}
              {projectedPath&&<g>
                <path d={projectedPath} stroke="#071823" strokeWidth="7" fill="none" opacity=".6"/>
                <path d={projectedPath} stroke={watchReady?'#e8b35e':rise?'#51e5ac':'#f08ca4'} strokeWidth="3"
                  strokeDasharray="9 7" fill="none" markerEnd={'url(#forecast-arrow-'+asset+')'}/>
                {projected.slice(1).map((p,i)=><circle key={p.key}
                  cx={Math.min(xr-8,716+i*106)} cy={px(p.price)} r="4.2"
                  fill={rise?'#7eecc3':'#ffc2ce'} stroke="#0a1928" strokeWidth="2"/>)}
              </g>}
              {!planVisible&&overlay.ready&&<g>
                {(['BUY','SELL'] as const).map(side=>{
                  const path=conditionalPath(side);
                  return path?<path key={'conditional-'+side} d={path} fill="none"
                    stroke={side==='BUY'?'#65edb7':'#94b6ff'}
                    strokeWidth={overlay.preferred===side?2.8:1.65}
                    strokeDasharray={overlay.preferred===side?'8 5':'4 8'}
                    strokeOpacity={overlay.preferred===side?1:.53}
                    markerEnd={'url(#forecast-arrow-'+asset+')'}/>:null;
                })}
                <rect x="706" y="204" width="205" height="38" rx="7" fill="#0b1928" stroke="#52748b"/>
                <text x="808" y="220" textAnchor="middle" fill="#dce9f2" fontSize="11" fontWeight="700">مساران مشروطان بالكسر</text>
                <text x="808" y="233" textAnchor="middle" fill="#a1becd" fontSize="9">ليس أمر دخول أو هدف مضمون</text>
              </g>}
              {!planVisible&&!overlay.ready&&<g>
                <rect x="645" y="136" width="273" height="65" rx="9" fill="#0a1520" stroke="#3a5464" strokeOpacity=".8"/>
                <text x="782" y="160" fill="#cedfeb" textAnchor="middle" fontSize="14" fontWeight="700">
                  {m.status==='STALE_CANDLES'?'الشموع متأخرة':m.status==='NO_CANDLES'?'لا توجد شموع كافية':'البيانات غير مكتملة'}</text>
                <text x="782" y="182" fill="#91abbb" textAnchor="middle" fontSize="11">لا مسار أو توقيت دون بيانات حديثة</text>
              </g>}
            </svg>
          </div>
          <div className="forecast-visual-legend">
            <span><i className="forecast-legend-history"/> شموع فعلية</span>
            <span><i className="forecast-legend-projection"/> {watchReady?'مسار مستويات بعيد · توضيحي':'سيناريو مشروط'}</span>
            <span><i className="forecast-legend-target"/> مناطق أهداف</span>
            <span><i className="forecast-legend-rebound"/> مناطق سيولة</span>
            <span className="sniper-buy-legend">● ارتداد شراء</span><span className="sniper-sell-legend">● ارتداد بيع</span>
            <span><i className="forecast-legend-stop"/> إبطال</span>
          </div>
        </div>
      </div>
      {asset==='GOLD'&&<GoldTrapRadarPanel radar={x?.goldTrapRadar} now={now}/>}
      <section className="forecast-eta-section" aria-label="التوقيت التقريبي للأهداف">
        <div className="forecast-eta-header">
          <strong><Clock3 size={16}/> مسار الحركة والوقت التقريبي للأهداف</strong>
          <small>تقدير من ATR M5 بعد تحقق شروط السيناريو · ليس موعدًا مضمونًا</small>
        </div>
        <div className="forecast-eta-grid">
          {([1,2,3] as const).map(stage=>{
            const target=m.displayTargets.find(t=>t.stage===stage);
            const timing=overlay.timing.find(t=>t.stage===stage)?.eta;
            return <div key={stage} className="forecast-eta-card">
              <small>{stage===1?'الهدف الأول':stage===2?'الهدف الثاني':'الهدف الثالث'} · {statusReady?'مسجل':watchReady?'للمراقبة':'غير مؤهل'}</small>
              <strong dir="ltr">{fmt(target?.price)}</strong>
              <span>{timing&&target?(timing.min+'–'+timing.max+' دقيقة'):'الوقت غير محدد'}</span>
            </div>;
          })}
        </div>
        <div className="forecast-breakout-rail">
          <span><ArrowUpRight size={15}/> شرط الكسر الصاعد <b dir="ltr">{fmt(overlay.breakoutUp)}</b>
            <small>{overlay.confirmedUp?'شمعتان M5 فوق المستوى · باقي الشروط لازمة':'انتظار شمعتين M5 مغلقتين فوقه'}</small>
          </span>
          <span><ArrowDownRight size={15}/> شرط الكسر الهابط <b dir="ltr">{fmt(overlay.breakoutDown)}</b>
            <small>{overlay.confirmedDown?'شمعتان M5 تحت المستوى · باقي الشروط لازمة':'انتظار شمعتين M5 مغلقتين تحته'}</small>
          </span>
        </div>
        <p className="forecast-eta-summary">
          <Target size={14}/> {overlay.ready?(
            overlay.preferred==='BUY'?'السيناريو المراقب: اختبار الكسر العلوي ثم سيولة القمم':
            overlay.preferred==='SELL'?'السيناريو المراقب: اختبار الكسر السفلي ثم سيولة القيعان':
            'السيناريو متوازن: نراقب كسر أحد الحدين دون ترجيح')
            :'في انتظار شموع M1/M5 حديثة ومتسقة لتحديد السيناريو.'}
          {' · '}التجميع والتصريف احتمالات سعرية فقط، وليسا إثباتًا لتدفقات المؤسسات.
        </p>
      </section>
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
            {m.fourHour.ready&&[...reboundBuy,...reboundSell].map((z,i)=><span key={z.side+i} className={z.side==='BUY'?'sniper-zone-buy':'sniper-zone-sell'}>
              <small>{z.side==='BUY'?'منطقة ارتداد شراء':'منطقة ارتداد بيع'} · M5</small>
              <b dir="ltr">{fmt(z.low)} – {fmt(z.high)}</b>
            </span>)}
            {zoneList.length?zoneList.map(z=><span key={z.label}>
              <small>{z.label}</small><b dir="ltr">{fmt(z.low)} – {fmt(z.high)}</b>
            </span>):!m.fourHour.zones.length?<small>لا توجد مناطق جديدة مؤهلة من القمم والقيعان المؤكدة</small>:null}
          </div>
          {sn.flow&&<p>تدفق تقديري: طلب {sn.flow.buy}% · عرض {sn.flow.sell}% ({sn.flow.source})</p>}
        </div>
        <div className="forecast-decision-card">
          <strong><Crosshair size={15}/> قرار القناص وسبب الأهداف</strong>
          <p>{statusText}</p>
          <p>{watchReady?'مستويات بعيدة من قمم وقيعان H1/H4 المكتملة · للمراقبة فقط':sn.longRange?.basis||'في انتظار إطار هيكلي موثوق'}
            {sn.longRange?.atr15!=null?' · ATR M15 '+fmt(sn.longRange.atr15):''}</p>
          {statusReady&&sn.evidence?.length>0&&<div className="forecast-decision-evidence">
            {sn.evidence.slice(0,4).map(item=><span key={item}>{item}</span>)}
          </div>}
        </div>
      </div>
      <section className="sniper-audit-panel" aria-label="سجل الأداء الحقيقي للقناص">
        <div className="sniper-audit-heading">
          <strong><ShieldAlert size={15}/> مراقبة الأهداف الفعلية · {asset==='GOLD'?'الذهب':'البيتكوين'}</strong>
          <span>{auditHealthy?'تخزين دائم على السيرفر':'سجل غير مؤكد الآن'}</span>
        </div>
        <div className="sniper-audit-figures">
          <div><small>سيناريوهات مكتملة التقييم</small><b dir="ltr">{observed}</b></div>
          <div><small>TP1 · وصول مُلاحظ</small><b>{observed>=40&&calibration?.targets?.[0]?.observedPct!=null?calibration.targets[0].observedPct+'%':'قيد جمع البيانات'}</b></div>
          <div><small>TP2 · وصول مُلاحظ</small><b>{observed>=40&&calibration?.targets?.[1]?.observedPct!=null?calibration.targets[1].observedPct+'%':'قيد جمع البيانات'}</b></div>
          <div><small>TP3 · وصول مُلاحظ</small><b>{observed>=40&&calibration?.targets?.[2]?.observedPct!=null?calibration.targets[2].observedPct+'%':'قيد جمع البيانات'}</b></div>
        </div>
        <p>
          {observed<40?'نحتاج '+Math.max(0,40-observed)+' سيناريوهات إضافية مكتملة قبل عرض النِّسب. ':''}
          الحالات غير الحاسمة: {Number(calibration?.ambiguous||0)} · انقطاع المتابعة: {Number(calibration?.unobserved||0)}.
          المعدلات نسبة وصول الأهداف قبل انتهاء السيناريو، وليست احتمالات ربح أو شهادة بدقة النموذج.
        </p>
        {audit?.block?.[asset]&&<p>سبب الانتظار الحالي: {String(audit.block[asset])}</p>}
      </section>
      <section className="sniper-audit-panel" aria-label="ذاكرة ونتائج الرصد البعيد">
        <div className="sniper-audit-heading">
          <strong><Layers3 size={15}/> ذاكرة القناص · نتائج الأهداف البعيدة</strong>
          <span>{watchFresh?'اتجاه وأهداف محفوظة على الخادم':'في انتظار تحديث ذاكرة الخادم'}</span>
        </div>
        <div className="sniper-audit-figures">
          <div><small>مسارات مكتملة التقييم</small><b>{watchObserved}</b></div>
          {([1,2,3] as const).map(stage=>{
            const rate=watchMetrics?.targets?.find((t:any)=>t.stage===stage);
            return <div key={stage}><small>هدف بعيد {stage} · وصول مُلاحظ</small>
              <b>{Number(rate?.samples||0)>=40&&rate?.observedPct!=null?rate.observedPct+'%':'قيد جمع البيانات'}</b>
              <small>{Number(rate?.samples||0)} مسار · {rate?.avgMinutes!=null?'متوسط الوصول '+rate.avgMinutes+' د':'لا متوسط مثبت'}</small>
            </div>;
          })}
        </div>
        <p>مدة تقييم المسار حتى 8 ساعات، وليست موعدًا لوصول السعر. الإبطال: {Number(watchMetrics?.stopped||0)} ·
          انعكاس مؤكد: {Number(watchMetrics?.reversed||0)} · انتهت المدة: {Number(watchMetrics?.expired||0)} ·
          نتائج مستبعدة لتداخل أو نقص شموع: {Number(watchMetrics?.ambiguous||0)+Number(watchMetrics?.unobserved||0)}.</p>
        <p>الرصد منفصل عن سيناريو الدخول. النتائج تُجمع للأمام دون تغيير الأهداف بعد صدورها؛ لا تثبت الربحية بعد تكاليف التداول.</p>
        {serverWatch?.current&&<p>آخر مسار: {String(serverWatch.current.note)} ·
          الأهداف الأصلية: {serverWatch.current.targets.map((t:any)=>fmt(t.price)+(t.reachedAt?' ✓':'')).join(' / ')}</p>}
      </section>
      <footer className="forecast-visual-note">
        <span>الشموع السابقة بيانات سوق فعلية. {watchReady?'الخط الأصفر مراقبة هيكلية أولية، وليس إشارة شراء أو بيع.':'الخط المتقطع ترتيب مستويات مشروط، وليس توقعًا لشكل الشموع أو وقت وصولها.'}</span>
        <span>{highest?(statusReady?'الهدف المسجل الأخير ':'أبعد مستوى هيكلي مرصود ')+fmt(highest.price):m.bias.active?'انحياز ظاهر · لا مستوى بعيد متاح':'آخر بيانات للمتابعة فقط'}</span>
      </footer>
    </div>
  </section>;
}
