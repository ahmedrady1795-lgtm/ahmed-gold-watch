'use client';

import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Crosshair,Layers3,ShieldAlert,Target} from 'lucide-react';
import {buildForecastIllustration} from '../lib/forecast-illustration';
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
  const asset: 'GOLD'|'BTC'=assetView==='ALL'?chosen:assetView;
  const x=asset==='GOLD'?data?.gold:data?.bitcoin;
  const journal=journals?.[asset]??null;
  const m=buildForecastIllustration(asset,x,asset==='GOLD'?goldLive:btcLive,now,snapshotAt,journal,true);
  const calibration=audit?.metrics?.[asset];
  const observed=Number(calibration?.observed||0);
  const lastSource=Number(audit?.updatedAt||0);
  const auditHealthy=Boolean(auditLoaded&&audit?.persistence==='VOLUME'&&lastSource>0&&
    now-lastSource<180000);
  const statusReady=m.ready&&auditHealthy;
  const watchReady=m.watchReady&&!statusReady;
  const planVisible=statusReady||watchReady;
  const sn=m.sniper,dir=planVisible?m.displaySide:'WAIT';
  const rise=dir==='BUY',fall=dir==='SELL';
  const W=1040,H=360,x0=52,x1=612,xf=622,xr=946,yt=22,yb=275;
  const candleBounds=m.candles.flatMap(c=>[c.low,c.high]);
  if(m.price!=null)candleBounds.push(m.price);
  const candleMin=candleBounds.length?Math.min(...candleBounds):m.lower;
  const candleMax=candleBounds.length?Math.max(...candleBounds):m.upper;
  const candleSpan=Math.max(candleMax-candleMin,Math.abs(m.price||0)*.00065,.01);
  const scaleLow=focusCandles?candleMin-candleSpan*.3:m.lower;
  const scaleHigh=focusCandles?candleMax+candleSpan*.3:m.upper;
  const px=(p:number)=>yt+(scaleHigh-p)/Math.max(.0000001,scaleHigh-scaleLow)*(yb-yt);
  const grid=Array.from({length:5},(_,i)=>({y:yt+i*(yb-yt)/4,value:scaleHigh-(scaleHigh-scaleLow)*i/4}));
  const candles=m.candles;
  const stride=(x1-x0)/Math.max(candles.length,1);
  const candleWidth=clamp(stride*.62,2,8.5);
  const maxVolume=Math.max(1,...candles.map(c=>c.volume));
  const chartBands=m.bands.slice().sort((a,b)=>a.kind==='TARGET'?-1:b.kind==='TARGET'?1:0);
  const projected=m.projected;
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
  const stateLabel=statusReady?'سيناريو مؤهل · مسجل':watchReady?'رصد مبكر · غير مؤهل للدخول':m.status==='STALE_CANDLES'?'شموع تاريخية متأخرة':
    m.status==='NO_CANDLES'?'الشموع غير متاحة':!sn.view.priceFresh?'السعر غير محدث':'الرصد نشط · انتظار توافق';
  const highest=m.displayTargets.at(-1);
  const zoneList=sn.zones.slice(0,4);
  const statusText=statusReady?(journal?.message||sn.stageText):watchReady?
    (sn.view.side!=='WAIT'?sn.view.reason:m.observation.reason):
    (sn.view.reason+' · '+m.observation.reason);
  const activation=statusReady&&sn.activation?'خلال '+sn.activation.min+'–'+sn.activation.max+' د':'—';
  const arrival=statusReady&&sn.arrival?'خلال '+sn.arrival.min+'–'+sn.arrival.max+' د':'غير محدد';

  return <section id="forecast-illustration" className="workspace-section forecast-visual-section"
    aria-labelledby="forecast-visual-title">
    <div className="workspace-section-heading renewed-section-head">
      <div><span>01 / AI PREDATOR · SMART PATH RADAR</span>
        <h2 id="forecast-visual-title">القناص الذكي · الرسم المتوقع للحركة</h2></div>
      <p>التحليل والاتجاه والأهداف الهيكلية في لوحة واحدة · السكالب في صفحة مستقلة</p>
    </div>
    <div className="forecast-visual-shell">
      <header className="forecast-visual-header">
        <div className="forecast-visual-heading">
          <span className="forecast-visual-mark"><Crosshair size={17}/></span>
          <div><strong>خريطة حركة {asset==='GOLD'?'الذهب':'البيتكوين'}</strong>
            <small>M1 CANDLES · M15/H1 STRUCTURAL SNIPER</small></div>
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
      <div className="forecast-brain-strip">
        <span><Activity size={14}/> {sn.phaseText} {sn.compression!=null?'· جاهزية '+sn.compression+'/100':''}</span>
        <span><Layers3 size={14}/> مصادر الأهداف: M15 / H1 / السيولة</span>
        <span><Target size={14}/> {statusReady?'مستويات مؤهلة ومُسجلة':watchReady?'مستويات هيكلية للمراقبة فقط':'لا يوجد هدف مؤهل حاليًا'}</span>
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
              {rise?(statusReady?'صعود مؤهل':'ميل صعود مرصود'):fall?(statusReady?'هبوط مؤهل':'ميل هبوط مرصود'):'انتظار تأكيد'}</strong>
          </div>
          <div className="forecast-visual-targets">
            {([1,2,3] as const).map(i=>{
              const target=m.displayTargets.find(t=>t.stage===i);
              return <div key={i} className="forecast-visual-target">
                <span>{watchReady?('منطقة '+i+' · مراقبة'):(i===1?'TP1 · أول':i===2?'TP2 · رئيسي':'TP3 · ممتد')}<small>{statusReady&&target&&'reached' in target&&target.reached?'تم الوصول':watchReady?'مستوى هيكلي · ليس توصية دخول':target?'M15/H1 · هيكلي':'بانتظار مستوى مؤكد'}</small></span>
                <strong dir="ltr">{fmt(target?.price)}</strong>
              </div>;
            })}
          </div>
          <div className="forecast-visual-fact forecast-visual-stop">
            <small><ShieldAlert size={13}/> {watchReady?'إبطال الميل المرصود':'إبطال السيناريو'}</small>
            <strong dir="ltr">{fmt(m.displayStop)}</strong>
          </div>
          <div className="forecast-visual-fact forecast-visual-time">
            <small><Clock3 size={13}/> بدء الحركة / الهدف الأول</small>
            <strong>{statusReady?activation:watchReady?'لم يتأكد':'—'}</strong>
            <span>{statusReady?arrival:watchReady?'رصد مبكر · لا يوجد موعد قابل للتحقق':'لا يوجد موعد موثوق للهدف البعيد'}</span>
          </div>
          <div className="forecast-visual-confidence">
            <span>{watchReady?'توافق الفريمات':'قوة التحليل'} <b>{statusReady&&sn.view.confidence!=null?fmt(sn.view.confidence,0)+'/100':watchReady&&m.observation.ready?m.observation.votes+'/3':'—'}</b></span>
            <small>{watchReady?'ميل مراقبة غير مختبر كإشارة تداول':'تقييم مشروط، وليس نسبة نجاح أو ضمانًا'}</small>
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
              <rect x={xf} y="16" width={xr-xf} height="310" fill="#56bde7" opacity=".028"/>
              {grid.map((g,i)=><g key={'grid'+i}>
                <line x1={x0} x2="958" y1={g.y} y2={g.y} stroke="#426076" strokeOpacity=".32" strokeDasharray="3 6"/>
                <text x="966" y={g.y+4} fill="#97afc0" fontSize="11" fontFamily="monospace">{fmt(g.value)}</text>
              </g>)}
              {Array.from({length:7},(_,i)=><line key={'v'+i} x1={x0+i*148} x2={x0+i*148} y1="18" y2="329"
                stroke="#345267" strokeOpacity=".20" strokeDasharray="3 7"/>)}
              <line x1={xf-8} x2={xf-8} y1="15" y2="328" stroke="#72b3d1" strokeOpacity=".5"
                strokeDasharray="6 7"/>
              <text x={xf-14} y="13" textAnchor="end" fill="#88bbd3" fontSize="11">تاريخ فعلي</text>
              <text x={xf+8} y="13" fill="#e7c58a" fontSize="11">المستقبل / سيناريو</text>
              {chartBands.map(z=>{
                const clr=z.kind==='TARGET'?'#3ce6a8':z.kind==='STOP'?'#fd687c':
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
                  <rect x={x-candleWidth/2} y={325-volumeH} width={candleWidth}
                    height={volumeH} fill={color} opacity=".35"/>
                  <title>{clock(c.time)+' · O '+fmt(c.open)+' H '+fmt(c.high)+' L '+fmt(c.low)+' C '+fmt(c.close)}</title>
                </g>;
              })}
              <line x1={x0} x2={xr} y1="325" y2="325" stroke="#416077" strokeOpacity=".4"/>
              {candles.length>0&&[0,.33,.66,1].map((a,i)=>{
                const c=candles[Math.min(candles.length-1,Math.round((candles.length-1)*a))];
                return <text key={'time'+i} x={x0+(i/3)*(x1-x0)} y="346"
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
              {!planVisible&&<g>
                <rect x="645" y="136" width="273" height="65" rx="9" fill="#0a1520" stroke="#3a5464" strokeOpacity=".8"/>
                <text x="782" y="160" fill="#cedfeb" textAnchor="middle" fontSize="14" fontWeight="700">
                  {m.status==='STALE_CANDLES'?'الشموع متأخرة':m.status==='NO_CANDLES'?'لا توجد شموع كافية':'الرصد يعمل · لا يوجد اتجاه مؤكد'}</text>
                <text x="782" y="182" fill="#91abbb" textAnchor="middle" fontSize="11">لن نختلق هدفًا أو مسارًا بدون بيانات</text>
              </g>}
            </svg>
          </div>
          <div className="forecast-visual-legend">
            <span><i className="forecast-legend-history"/> شموع فعلية</span>
            <span><i className="forecast-legend-projection"/> {watchReady?'مسار مراقبة فقط':'سيناريو مشروط'}</span>
            <span><i className="forecast-legend-target"/> مناطق أهداف</span>
            <span><i className="forecast-legend-rebound"/> مناطق ارتداد وسيولة</span>
            <span><i className="forecast-legend-stop"/> إبطال</span>
          </div>
        </div>
      </div>
      <div className="forecast-decision-row">
        <div className="forecast-decision-card">
          <strong><Layers3 size={15}/> مناطق الارتداد والسيولة</strong>
          <div className="forecast-decision-zones">
            {zoneList.length?zoneList.map(z=><span key={z.label}>
              <small>{z.label}</small><b dir="ltr">{fmt(z.low)} – {fmt(z.high)}</b>
            </span>):<small>لا توجد مناطق حديثة مؤهلة للعرض</small>}
          </div>
          {sn.flow&&<p>تدفق تقديري: طلب {sn.flow.buy}% · عرض {sn.flow.sell}% ({sn.flow.source})</p>}
        </div>
        <div className="forecast-decision-card">
          <strong><Crosshair size={15}/> قرار القناص وسبب الأهداف</strong>
          <p>{statusText}</p>
          <p>{watchReady?'مستويات من شموع M15/H1 التاريخية · ليست نقاط دخول':sn.longRange?.basis||'في انتظار إطار هيكلي موثوق'}
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
      <footer className="forecast-visual-note">
        <span>الشموع السابقة بيانات سوق فعلية. {watchReady?'الخط الأصفر مراقبة هيكلية أولية، وليس إشارة شراء أو بيع.':'الخط المتقطع ترتيب مستويات مشروط، وليس توقعًا لشكل الشموع أو وقت وصولها.'}</span>
        <span>{highest?(statusReady?'الهدف المسجل الأخير ':'منطقة الرصد الأبعد ')+fmt(highest.price):'القناص يرصد الشروط قبل عرض اتجاه وأهداف'}</span>
      </footer>
    </div>
  </section>;
}
