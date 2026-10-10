'use client';

import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Crosshair,Layers3,ShieldAlert,Target} from 'lucide-react';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import type {ForecastJournal} from '../lib/forecast-journal';

const fmt=(p:number|null|undefined,d=2)=>p!=null&&Number.isFinite(p)?
  p.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clock=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const clamp=(p:number,a:number,b:number)=>Math.max(a,Math.min(b,p));

export default function ForecastIllustration({data,now,snapshotAt,goldLive,btcLive,assetView='ALL',journals}:{
  data:any;now:number;snapshotAt:unknown;goldLive?:any;btcLive?:any;assetView?:'ALL'|'GOLD'|'BTC';
  journals?:{GOLD:ForecastJournal|null;BTC:ForecastJournal|null}
}){
  const [chosen,setChosen]=useState<'GOLD'|'BTC'>('GOLD');
  const asset: 'GOLD'|'BTC'=assetView==='ALL'?chosen:assetView;
  const x=asset==='GOLD'?data?.gold:data?.bitcoin;
  const journal=journals?.[asset]??null;
  const m=buildForecastIllustration(asset,x,asset==='GOLD'?goldLive:btcLive,now,snapshotAt,journal);
  const sn=m.sniper,dir=sn.view.side;
  const rise=dir==='BUY',fall=dir==='SELL';
  const W=1040,H=360,x0=52,x1=612,xf=622,xr=946,yt=22,yb=275;
  const px=(p:number)=>yt+(m.upper-p)/Math.max(.0000001,m.upper-m.lower)*(yb-yt);
  const grid=Array.from({length:5},(_,i)=>({y:yt+i*(yb-yt)/4,value:m.upper-(m.upper-m.lower)*i/4}));
  const candles=m.candles;
  const stride=(x1-x0)/Math.max(candles.length,1);
  const candleWidth=clamp(stride*.62,2,8.5);
  const maxVolume=Math.max(1,...candles.map(c=>c.volume));
  const chartBands=m.bands.slice().sort((a,b)=>a.kind==='TARGET'?-1:b.kind==='TARGET'?1:0);
  const projected=m.projected;
  let projectedPath='';
  if(m.ready&&projected.length>=2){
    projectedPath='M '+xf+' '+px(projected[0].price);
    projected.slice(1).forEach((p,i)=>{
      const xa=i===0?xf:Math.round(716+(i-1)*106);
      const xb=Math.min(xr-8,716+i*106);
      const ya=px(projected[i].price),yb2=px(p.price);
      projectedPath+=' C '+(xa+29)+' '+ya+' '+(xb-32)+' '+yb2+' '+xb+' '+yb2;
    });
  }
  const ageMin=m.historyAge==null?null:Math.ceil(m.historyAge/60000);
  const stateLabel=m.ready?'مسار احتمالي':journal?'محفوظ · '+({MONITORING:'تحت المراقبة',STALE:'سعر متأخر',UNQUALIFIED:'غير مؤهل',TP_REACHED:'هدف تحقق',INVALIDATED:'مُبطل',EXPIRED:'منتهي',ACTIVE:'تحت المراجعة'}[journal.state]):m.status==='STALE_CANDLES'?'شموع تاريخية متأخرة':
    m.status==='NO_CANDLES'?'الشموع غير متاحة':'الترقب بدون أهداف مؤكدة';
  const highest=m.displayTargets.at(-1);
  const activation=sn.activation?'خلال '+sn.activation.min+'–'+sn.activation.max+' د':'—';
  const arrival=sn.arrival?'خلال '+sn.arrival.min+'–'+sn.arrival.max+' د':'غير محدد';

  return <section id="forecast-illustration" className="workspace-section forecast-visual-section"
    aria-labelledby="forecast-visual-title">
    <div className="workspace-section-heading renewed-section-head">
      <div><span>02 / PRICE PATH RADAR · VISUAL OUTLOOK</span>
        <h2 id="forecast-visual-title">الرسم التوضيحي للحركة القادمة</h2></div>
      <p>شموع حقيقية · خريطة السيولة · مناطق الاستهداف · مسار مشروط</p>
    </div>
    <div className="forecast-visual-shell">
      <header className="forecast-visual-header">
        <div className="forecast-visual-heading">
          <span className="forecast-visual-mark"><Crosshair size={17}/></span>
          <div><strong>خريطة حركة {asset==='GOLD'?'الذهب':'البيتكوين'}</strong>
            <small>PRE-MOVE · M1 HISTORY / AI TARGET LADDER</small></div>
        </div>
        <div className="forecast-visual-controls">
          {assetView==='ALL'&&<div className="forecast-visual-tabs" role="group" aria-label="الأصل على الرسم">
            <button type="button" aria-pressed={asset==='GOLD'} onClick={()=>setChosen('GOLD')}>الذهب</button>
            <button type="button" aria-pressed={asset==='BTC'} onClick={()=>setChosen('BTC')}>البيتكوين</button>
          </div>}
          <span className={'forecast-visual-status '+(m.ready?'forecast-visual-active':'')}>
            <span className="forecast-dot"/>{stateLabel}
          </span>
        </div>
      </header>
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
              {rise?'صعود':fall?'هبوط':'انتظار'}</strong>
          </div>
          <div className="forecast-visual-targets">
            {([1,2,3] as const).map(i=>{
              const target=m.displayTargets.find(t=>t.stage===i);
              return <div key={i} className="forecast-visual-target">
                <span>TP{i}<small>{'reached' in (target||{})&&target?.reached?'تحقق':journal&&!m.ready?'محفوظ':target?.kind==='PROJECTION'?'تقديري':'منطقة هدف'}</small></span>
                <strong dir="ltr">{fmt(target?.price)}</strong>
              </div>;
            })}
          </div>
          <div className="forecast-visual-fact forecast-visual-stop">
            <small><ShieldAlert size={13}/> إبطال السيناريو</small>
            <strong dir="ltr">{fmt(m.displayStop)}</strong>
          </div>
          <div className="forecast-visual-fact forecast-visual-time">
            <small><Clock3 size={13}/> بدء الحركة / الهدف الأول</small>
            <strong>{m.ready?activation:journal?'غير نشط':'—'}</strong>
            <span>{m.ready?arrival:journal?.message||'توقيت غير مؤهل'}</span>
          </div>
          <div className="forecast-visual-confidence">
            <span>قوة التحليل <b>{m.ready&&sn.view.confidence!=null?fmt(sn.view.confidence,0)+'/100':'—'}</b></span>
            <small>تقييم نموذج، وليس نسبة نجاح أو ضمانًا</small>
          </div>
        </div>
        <div className="forecast-visual-chart-wrap">
          <div className="forecast-visual-topline">
            <span><Layers3 size={13}/> M1 / آخر {candles.length} شمعة مغلقة</span>
            <span>{ageMin!=null?'عمر آخر إغلاق '+ageMin+' دقيقة':'لا توجد بيانات شموع'}</span>
          </div>
          <div className="forecast-visual-chart-scroll">
            <svg className="forecast-visual-svg" viewBox={'0 0 '+W+' '+H}
              role="img" aria-label={m.ready?
                'الشموع التاريخية الحقيقية والمسار الاحتمالي إلى '+m.displayTargets.map(t=>'TP'+t.stage+' '+fmt(t.price)).join(' ثم '):
                'الشموع التاريخية فقط، ولا يوجد مسار سعري مؤهل'} >
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
                <path d={projectedPath} stroke={rise?'#51e5ac':'#f08ca4'} strokeWidth="3"
                  strokeDasharray="9 7" fill="none" markerEnd={'url(#forecast-arrow-'+asset+')'}/>
                {projected.slice(1).map((p,i)=><circle key={p.key}
                  cx={Math.min(xr-8,716+i*106)} cy={px(p.price)} r="4.2"
                  fill={rise?'#7eecc3':'#ffc2ce'} stroke="#0a1928" strokeWidth="2"/>)}
              </g>}
              {!m.ready&&<g>
                <rect x="645" y="136" width="273" height="65" rx="9" fill="#0a1520" stroke="#3a5464" strokeOpacity=".8"/>
                <text x="782" y="160" fill="#cedfeb" textAnchor="middle" fontSize="14" fontWeight="700">
                  {m.status==='STALE_CANDLES'?'الشموع متأخرة':m.status==='NO_CANDLES'?'لا توجد شموع كافية':journal?'الأهداف محفوظة · ليست إشارة نشطة':'لا توجد أهداف مؤهلة'}</text>
                <text x="782" y="182" fill="#91abbb" textAnchor="middle" fontSize="11">لن يتم رسم مسار افتراضي</text>
              </g>}
            </svg>
          </div>
          <div className="forecast-visual-legend">
            <span><i className="forecast-legend-history"/> شموع فعلية</span>
            <span><i className="forecast-legend-projection"/> مسار احتمالي</span>
            <span><i className="forecast-legend-target"/> مناطق أهداف</span>
            <span><i className="forecast-legend-rebound"/> مناطق ارتداد وسيولة</span>
            <span><i className="forecast-legend-stop"/> إبطال</span>
          </div>
        </div>
      </div>
      <footer className="forecast-visual-note">
        <span>الشموع السابقة بيانات سوق فعلية. الخط المتقطع رسم توضيحي لترتيب الأهداف وليس توقّعًا لشكل الشموع أو توقيت كل نقطة.</span>
        <span>{highest?(m.ready?'آخر هدف مرصود ':'آخر هدف محفوظ ')+fmt(highest.price):'القناص يرصد الشروط قبل عرض اتجاه وأهداف'}</span>
      </footer>
    </div>
  </section>;
}
