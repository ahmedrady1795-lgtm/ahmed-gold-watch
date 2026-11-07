import {placeHuntWaypoints,type M15HuntPreview,type HuntPreviewCandle,type HuntSide} from '../lib/sniper-m15-hunt-preview';
import type {M15HuntProof} from '../lib/sniper-m15-hunt-proof';

type Props={
  forecast:M15HuntPreview;left:number;split:number;end:number;
  top:number;bottom:number;py:(price:number)=>number;liquidity:boolean;
  proof?:M15HuntProof;asset?:'GOLD'|'BTC';
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
  const anchored=f.preferred!=='WAIT';
  const clear=anchored&&f.observation?.quality==='CLEAR'&&
    !f.observation.conflicting&&!f.referenceOnly;
  const validated=clear&&p.proof?.status==='FORWARD_EDGE_CANDIDATE';
  const stations=placeHuntWaypoints(f,p.py,p.top,p.bottom);
  const toPoints=(list:HuntPreviewCandle[])=>
    [[p.split+4,clip(p.py(f.anchor!))],
      ...list.map((b,i)=>[p.split+9+(i+.5)*stride,clip(p.py(b.close))])];
  return <g className="sniper-m15-hunt-overlay">
    <defs>
      <linearGradient id={uid+'-panel'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#102330" stopOpacity=".72"/>
        <stop offset="68%" stopColor="#071921" stopOpacity=".34"/>
        <stop offset="100%" stopColor="#050b13" stopOpacity=".02"/>
      </linearGradient>
      <linearGradient id={uid+'-line'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={anchored?color[f.preferred as HuntSide]:'#d6c490'} stopOpacity=".58"/>
        <stop offset="100%" stopColor={anchored?color[f.preferred as HuntSide]:'#d6c490'} stopOpacity="1"/>
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
          strokeOpacity={f.referenceOnly?0.2:
            clear&&m.side!==f.preferred?0.24:0.74}
          strokeDasharray={m.stage===2?'5 4':'2 5'}/>
        <path d={'M '+(p.end-76)+' '+m.lineY+
          ' L '+(p.end-72)+' '+(m.labelY-4)}
          fill="none" stroke={ink} strokeWidth="1" strokeOpacity=".65"/>
        <rect x={p.end-72} y={m.labelY-11} width="70" height="15" rx="3"
          fill="#071720" stroke={ink}
          strokeOpacity={clear&&m.side!==f.preferred?.28:.92}
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
        {f.preferred===side&&!f.referenceOnly&&
          <polyline points={toPoints(side==='BUY'?f.buy:f.sell)
            .map(pt=>pt.join(',')).join(' ')} fill="none"
            stroke={color[side]} strokeWidth="9" strokeOpacity=".11"
            strokeLinecap="round" strokeLinejoin="round"/>}
        <polyline points={toPoints(side==='BUY'?f.buy:f.sell)
          .map(pt=>pt.join(',')).join(' ')}
          fill="none"
          stroke={f.preferred===side?'url(#'+uid+'-line)':color[side]}
          strokeWidth={f.preferred===side?(clear?3.6:2.4):1.1}
          strokeOpacity={f.referenceOnly?0.22:
            f.preferred===side?(clear?1:.79):(clear?.22:.34)}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={f.preferred===side?'9 5':'2 9'}/>
        {f.preferred===side&&!f.referenceOnly&&
          <circle cx={toPoints(side==='BUY'?f.buy:f.sell).at(-1)![0]}
            cy={toPoints(side==='BUY'?f.buy:f.sell).at(-1)![1]}
            r={clear?4.2:3.1} fill="#06151b" stroke={color[side]}
            strokeWidth={clear?2.5:1.4}/>}
        {/* Conditional paths only. No fabricated candle body or tick. */}
      </g>
    )}
    <text x={p.split+8} y={p.top+15} fontSize="10"
      fontWeight="800" fill="#eac883" textAnchor="start"
      stroke="#000" strokeWidth="2" paintOrder="stroke" direction="ltr">
      {f.referenceOnly?'M15 · HISTORY':'M15 · EARLY PATH'}
    </text>
    <text x={p.split+8} y={p.top+32} fontSize="9" fontWeight="800"
      fill={clear?color[f.preferred as HuntSide]:'#b1c1cb'}
      textAnchor="start" stroke="#000" strokeWidth="2" paintOrder="stroke">
      {f.referenceOnly?'سياق تاريخي فقط':
       clear?(f.preferred==='BUY'?'↑ المسار المرجح':'↓ المسار المرجح')+
         (validated?' · تفوق تاريخي أولي':' · يحتاج إثباتًا'):
       'القراءة متعارضة · مساران مشروطان'}
    </text>
    {f.sweep!=='NONE'&&<g>
      <circle cx={p.split+7} cy={clip(p.py(f.anchor))} r="4"
        fill="none" stroke="#e9ba55" strokeWidth="1.6"/>
      <title>{f.sweep==='HIGH_REJECTION'?
        'سحب قمة ثم رفض بإغلاق M15':'سحب قاع ثم ارتداد بإغلاق M15'}</title>
    </g>}
    <title>{'مسارا السعر مشروطان من إغلاقات M15 وATR، ولا توجد شموع مستقبلية أو أوامر تداول. '+
      'المسار الأقوى معروض فقط عند تلاقي 3 دلائل مغلقة بلا تعارض. '+
      'قياس الاتجاه نفسه: '+(p.proof?.status??'COLLECTING')+
      ' · '+(p.proof?.n??0)+' شمعة تاريخية مقارنة باتجاه آخر جسم مغلق. '+
      'ليست دقة متوقعة ولا أرباحًا.'}</title>
  </g>;
}
