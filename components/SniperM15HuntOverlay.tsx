import type {M15HuntPreview,HuntPreviewCandle,HuntSide} from '../lib/sniper-m15-hunt-preview';

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
  const stride=(width-14)/6;
  const anchored=f.preferred!=='WAIT';
  const toPoints=(list:HuntPreviewCandle[])=>
    [[p.split+4,clip(p.py(f.anchor!))],
      ...list.map((b,i)=>[p.split+9+(i+.5)*stride,clip(p.py(b.close))])];
  const drawCandles=(list:HuntPreviewCandle[],side:HuntSide)=>{
    const selected=f.preferred===side;
    return <g className={'sniper-hunt-candles '+(selected?'preferred':'alternate')}
      key={'hypothesis-'+side}>
      {list.map((b,i)=>{
        const x=p.split+9+(i+.5)*stride;
        const yOpen=clip(p.py(b.open)),yClose=clip(p.py(b.close));
        const yHigh=clip(p.py(b.high)),yLow=clip(p.py(b.low));
        const top=Math.min(yOpen,yClose),height=Math.max(1.8,Math.abs(yOpen-yClose));
        const rising=b.close>=b.open;
        const opacity=f.referenceOnly?0.3:selected?0.87:anchored?0.26:0.47;
        return <g key={'sim-'+side+'-'+b.time}>
          <line x1={x} x2={x} y1={yHigh} y2={yLow}
            stroke={color[side]} strokeWidth={selected?1.7:1.1}
            strokeOpacity={opacity} strokeDasharray={selected?'none':'2 3'}/>
          <rect x={x-4} y={top} width="8" height={height} rx=".7"
            stroke={color[side]} strokeWidth={selected?1.5:1}
            strokeDasharray={selected?'none':'2 2'}
            fill={rising?'#37ad8e':'#b54c68'}
            fillOpacity={selected?(f.referenceOnly?0.13:0.34):0.055}
            strokeOpacity={opacity}/>
          <title>{(side==='BUY'?'احتمال صعود':'احتمال هبوط')+
            ' · شمعة '+(i+1)+' · OHLC افتراضي غير مُتحقق'}</title>
        </g>;
      })}
    </g>;
  };
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
    <line x1={p.split} x2={p.split} y1={p.top} y2={p.bottom}
      stroke="#bca874" strokeWidth="1.1" strokeDasharray="4 5"/>
    {(['BUY','SELL'] as const).map(side=>
      <g key={'track-'+side}>
        <polyline points={toPoints(side==='BUY'?f.buy:f.sell)
          .map(pt=>pt.join(',')).join(' ')}
          fill="none" stroke={color[side]}
          strokeWidth={f.preferred===side?1.8:1.1}
          strokeOpacity={f.referenceOnly?0.3:f.preferred===side?0.68:0.3}
          strokeDasharray={f.preferred===side?'6 4':'2 6'}/>
        {drawCandles(side==='BUY'?f.buy:f.sell,side)}
      </g>
    )}
    <text x={p.split+8} y={p.top+15} fontSize="10"
      fontWeight="800" fill="#eac883" textAnchor="start"
      stroke="#000" strokeWidth="2" paintOrder="stroke" direction="ltr">
      {f.referenceOnly?'M15 · HISTORY':'M15 · SIM / WATCH'}
    </text>
    {f.sweep!=='NONE'&&<g>
      <circle cx={p.split+7} cy={clip(p.py(f.anchor))} r="4"
        fill="none" stroke="#e9ba55" strokeWidth="1.6"/>
      <title>{f.sweep==='HIGH_REJECTION'?
        'سحب قمة ثم رفض بإغلاق M15':'سحب قاع ثم ارتداد بإغلاق M15'}</title>
    </g>}
    <title>المساران صعود وهبوط مشروطان؛ الشموع الست التالية رسومات افتراضية من ATR وإغلاقات M15، وليست حركة حقيقية أو أمر تداول. قوة القراءة ليست نسبة نجاح.</title>
  </g>;
}
