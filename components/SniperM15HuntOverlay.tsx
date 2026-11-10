import {placeHuntWaypoints,type M15HuntPreview,type HuntPreviewCandle,type HuntSide} from '../lib/sniper-m15-hunt-preview';
import type {M15HuntProof} from '../lib/sniper-m15-hunt-proof';
import type {M15Obstacle} from '../lib/sniper-m15-route-obstacle';
import type {M1Priority} from '../lib/sniper-m1-priority';
import {assessM15HuntDisplay} from '../lib/sniper-m15-display-evidence';

type Props={
  forecast:M15HuntPreview;left:number;split:number;end:number;
  top:number;bottom:number;py:(price:number)=>number;liquidity:boolean;
  proof?:M15HuntProof;asset?:'GOLD'|'BTC';obstruction?:M15Obstacle;
  m1:M1Priority;marketOpen:boolean;flowSide?:HuntSide|'WAIT';
};
const color={BUY:'#53e8b8',SELL:'#ff7798'};
export default function SniperM15HuntOverlay(p:Props){
  const f=p.forecast;
  if(!f.ready||f.anchor==null)return null;
  const clip=(v:number)=>Math.max(p.top+2,Math.min(p.bottom-2,v));
  const width=p.end-p.split;
  const uid='hunt-'+(p.asset||'GOLD')+'-'+f.anchorTime;
  // Reserve a station rail. The forward half shows paths only, no future OHLC.
  const stride=(width-80)/6;
  const blocked=Boolean(p.obstruction?.blocked);
  const evidence=assessM15HuntDisplay({
    hunt:f,m1:p.m1,proof:p.proof,marketOpen:p.marketOpen,flowSide:p.flowSide
  });
  const visualSide=evidence.side;
  const anchored=visualSide!=='WAIT'&&!blocked;
  const clear=anchored&&evidence.state==='PRELIMINARY_EDGE';
  const validated=clear;
  const stations=placeHuntWaypoints(f,p.py,p.top,p.bottom);
  const toPoints=(list:HuntPreviewCandle[],side:HuntSide)=>{
    const points=[[p.split+4,clip(p.py(f.anchor!))]];
    for(let i=0;i<list.length;i++){
      const x=p.split+9+(i+.5)*stride,b=list[i],o=p.obstruction;
      // Once a scenario touches an unbroken supply/demand wall, do NOT
      // draw hypothetical continuation beyond it as a predicted breakout.
      const hits=Boolean(o?.blocked&&
        ((side==='BUY'&&o.kind==='SUPPLY'&&b.close>=o.level!)||
         (side==='SELL'&&o.kind==='DEMAND'&&b.close<=o.level!)));
      points.push([x,clip(p.py(hits?o!.level!:b.close))]);
      if(hits)break;
    }
    return points;
  };
  return <g className="sniper-m15-hunt-overlay">
    <defs>
      <linearGradient id={uid+'-panel'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#102330" stopOpacity=".72"/>
        <stop offset="68%" stopColor="#071921" stopOpacity=".34"/>
        <stop offset="100%" stopColor="#050b13" stopOpacity=".02"/>
      </linearGradient>
      <linearGradient id={uid+'-line'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={anchored?color[visualSide as HuntSide]:'#d6c490'} stopOpacity=".58"/>
        <stop offset="100%" stopColor={anchored?color[visualSide as HuntSide]:'#d6c490'} stopOpacity="1"/>
      </linearGradient>
    </defs>
    <rect x={p.split+1} y={p.top+1} width={Math.max(1,width-2)}
      height={p.bottom-p.top-2} rx="4" fill={'url(#'+uid+'-panel)'}/>
    <line x1={p.split+2} x2={p.end-76} y1={clip(p.py(f.anchor))}
      y2={clip(p.py(f.anchor))} stroke="#d8e7ed" strokeOpacity=".25"
      strokeDasharray="2 8" strokeWidth=".85"/>
    {p.liquidity&&f.pools.map(pool=>{
      const up=pool.kind==='HIGH_POOL',c=up?'#ff8098':'#55dfad';
      const low=clip(p.py(pool.low)),high=clip(p.py(pool.high));
      return <g key={pool.kind} className="sniper-hunt-pool">
        <rect x={p.left} y={Math.min(low,high)} width={p.end-p.left}
          height={Math.max(2,Math.abs(low-high))} fill={c} opacity=".10"/>
        <line x1={p.left} x2={p.end}
          y1={clip(p.py(pool.price))} y2={clip(p.py(pool.price))}
          stroke={c} opacity=".67" strokeWidth="1.15" strokeDasharray="2 5"/>
        <title>{(up?'منطقة قمم قد تحتوي أوامر وقف':'منطقة قيعان قد تحتوي أوامر وقف')+
          ' · تقدير من شموع مغلقة فقط، وليس دفتر أوامر حقيقي'}</title>
      </g>;
    })}
    {/* Price-TRUE watch waypoints. Only caption Y is shifted to avoid
        overlaps; these are conditional simulated stations, not TP fills. */}
    {stations.map(m=>{
      const ink=color[m.side],isUp=m.side==='BUY';
      return <g key={'station-'+m.side+'-'+m.stage}
        className="sniper-hunt-waypoint">
        <line x1={p.split+6} x2={p.end-77} y1={m.lineY} y2={m.lineY}
          stroke={ink} strokeWidth={m.stage===2?1.45:0.95}
          strokeOpacity={f.referenceOnly?(f.observation?0.2:0.53):
            !anchored?0.42:clear&&m.side!==visualSide?0.24:0.66}
          strokeDasharray={m.stage===2?'5 4':'2 5'}/>
        <path d={'M '+(p.end-76)+' '+m.lineY+
          ' L '+(p.end-72)+' '+(m.labelY-4)}
          fill="none" stroke={ink} strokeWidth="1" strokeOpacity=".65"/>
        <rect x={p.end-72} y={m.labelY-11} width="70" height="15" rx="3"
          fill="#071720" stroke={ink}
          strokeOpacity={!anchored?.5:clear&&m.side!==visualSide?.28:.85}
          strokeWidth=".8"/>
        <text x={p.end-5} y={m.labelY} textAnchor="end" direction="ltr"
          fontSize="8.3" fontWeight="800" fill={ink}>
          {(isUp?'↑':'↓')+m.stage+' '+m.price.toFixed(2)}
        </text>
        <title>{(isUp?'صعود':'هبوط')+' · محطة '+m.stage+' '+m.price.toFixed(2)+
          ' · هدف افتراضي من ATR وليس TP حقيقيًا'}</title>
      </g>;
    })}
    <line x1={p.split} x2={p.split} y1={p.top} y2={p.bottom}
      stroke="#bca874" strokeWidth="1.1" strokeDasharray="4 5"/>
    {(['BUY','SELL'] as const).map(side=>
      <g key={'track-'+side}>
        {anchored&&visualSide===side&&!f.referenceOnly&&
          <polyline points={toPoints(side==='BUY'?f.buy:f.sell,side)
            .map(pt=>pt.join(',')).join(' ')} fill="none"
            stroke={color[side]} strokeWidth="9" strokeOpacity=".11"
            strokeLinecap="round" strokeLinejoin="round"/>}
        <polyline points={toPoints(side==='BUY'?f.buy:f.sell,side)
          .map(pt=>pt.join(',')).join(' ')}
          fill="none"
          stroke={anchored&&visualSide===side?'url(#'+uid+'-line)':color[side]}
          strokeWidth={anchored&&visualSide===side?(clear?3.4:2.2):1.1}
          strokeOpacity={f.referenceOnly?(f.observation?0.22:0.58):blocked?.28:
            !anchored?.38:visualSide===side?(clear?.9:.7):.25}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={anchored&&visualSide===side?'9 5':'2 9'}/>
        {anchored&&visualSide===side&&!f.referenceOnly&&
          <circle cx={toPoints(side==='BUY'?f.buy:f.sell,side).at(-1)![0]}
            cy={toPoints(side==='BUY'?f.buy:f.sell,side).at(-1)![1]}
            r={clear?4.2:3.1} fill="#06151b" stroke={color[side]}
            strokeWidth={clear?2.5:1.4}/>}
        {/* Conditional paths only. No fabricated candle body or tick. */}
      </g>
    )}
    <text x={p.split+8} y={p.top+15} fontSize="10"
      fontWeight="800" fill="#eac883" textAnchor="start"
      stroke="#000" strokeWidth="2" paintOrder="stroke" direction="ltr">
      {f.referenceOnly?(f.observation?'M15 · HISTORY':'M15 · GAP WATCH'):
        evidence.state==='CONFLICT'?'M15 · FRAME CONFLICT':'M15 · EARLY PATH'}
    </text>
    <text x={p.split+8} y={p.top+32} fontSize="9" fontWeight="800"
      fill={anchored?color[visualSide as HuntSide]:'#b1c1cb'}
      textAnchor="start" stroke="#000" strokeWidth="2" paintOrder="stroke">
      {f.referenceOnly?(f.observation?'سياق تاريخي فقط':'فجوات في المصدر · مساران للمراقبة فقط'):
       blocked?'مقاومة / طلب غير مكسور · لا استمرار مؤكد':
       anchored?(visualSide==='BUY'?'↑ المسار المرجح':'↓ المسار المرجح')+
         (validated?' · اختبار تاريخي أولي':' · يحتاج إثباتًا'):
       evidence.reason}
    </text>
    {f.sweep!=='NONE'&&<g>
      <circle cx={p.split+7} cy={clip(p.py(f.anchor))} r="4"
        fill="none" stroke="#e9ba55" strokeWidth="1.6"/>
      <title>{f.sweep==='HIGH_REJECTION'?
        'سحب قمة ثم رفض بإغلاق M15':'سحب قاع ثم ارتداد بإغلاق M15'}</title>
    </g>}
    <title>{(blocked?p.obstruction!.reason+' · ':'')+
      'مسارا السعر مشروطان من إغلاقات M15 وATR، ولا توجد شموع مستقبلية أو أوامر تداول. '+
      'ترجيح الرسم يتطلب M15 واضحًا وM1 مؤيدًا بلا دليل عكسي. '+
      'قياس الاتجاه نفسه: '+(p.proof?.status??'COLLECTING')+
      ' · '+(p.proof?.n??0)+' شمعة تاريخية مقارنة باتجاه آخر جسم مغلق. '+
      'ليست دقة متوقعة ولا أرباحًا.'}</title>
  </g>;
}
