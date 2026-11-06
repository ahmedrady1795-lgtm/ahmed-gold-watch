import {placeHuntWaypoints,type M15HuntPreview,type HuntPreviewCandle,type HuntSide} from '../lib/sniper-m15-hunt-preview';

type Props={
  forecast:M15HuntPreview;left:number;split:number;end:number;
  top:number;bottom:number;py:(price:number)=>number;liquidity:boolean;
};
const color={BUY:'#53e8b8',SELL:'#ff7798'};
export default function SniperM15HuntOverlay(p:Props){
  const f=p.forecast;
  if(!f.ready||f.anchor==null)return null;
  const clip=(v:number)=>Math.max(p.top+2,Math.min(p.bottom-2,v));
  const width=p.end-p.split;
  // Reserve a station rail. The forward half shows paths only, no future OHLC.
  const stride=(width-80)/6;
  const anchored=f.preferred!=='WAIT';
  const stations=placeHuntWaypoints(f,p.py,p.top,p.bottom);
  const toPoints=(list:HuntPreviewCandle[])=>
    [[p.split+4,clip(p.py(f.anchor!))],
      ...list.map((b,i)=>[p.split+9+(i+.5)*stride,clip(p.py(b.close))])];
  return <g className="sniper-m15-hunt-overlay">
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
          strokeOpacity={f.referenceOnly?0.3:0.62}
          strokeDasharray={m.stage===2?'5 4':'2 5'}/>
        <path d={'M '+(p.end-76)+' '+m.lineY+
          ' L '+(p.end-72)+' '+(m.labelY-4)}
          fill="none" stroke={ink} strokeWidth="1" strokeOpacity=".65"/>
        <rect x={p.end-72} y={m.labelY-11} width="70" height="15" rx="3"
          fill="#08151b" stroke={ink} strokeOpacity=".75"
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
        <polyline points={toPoints(side==='BUY'?f.buy:f.sell)
          .map(pt=>pt.join(',')).join(' ')}
          fill="none" stroke={color[side]}
          strokeWidth={f.preferred===side?1.8:1.1}
          strokeOpacity={f.referenceOnly?0.30:f.preferred===side?0.75:0.50}
          strokeDasharray={f.preferred===side?'6 4':'2 6'}/>
        {/* Paths only: never show simulated candle bodies or wicks. */}
      </g>
    )}
    <text x={p.split+8} y={p.top+15} fontSize="10"
      fontWeight="800" fill="#eac883" textAnchor="start"
      stroke="#000" strokeWidth="2" paintOrder="stroke" direction="ltr">
      {f.referenceOnly?'M15 · HISTORY':'M15 · PATH / WATCH'}
    </text>
    {f.sweep!=='NONE'&&<g>
      <circle cx={p.split+7} cy={clip(p.py(f.anchor))} r="4"
        fill="none" stroke="#e9ba55" strokeWidth="1.6"/>
      <title>{f.sweep==='HIGH_REJECTION'?
        'سحب قمة ثم رفض بإغلاق M15':'سحب قاع ثم ارتداد بإغلاق M15'}</title>
    </g>}
    <title>مسارا السعر مشروطان من إغلاقات M15 وATR، ولا توجد شموع مستقبلية أو أوامر تداول. قوة القراءة ليست نسبة نجاح.</title>
  </g>;
}
