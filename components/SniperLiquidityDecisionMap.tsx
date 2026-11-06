import type {WatchPriceMap} from '../lib/sniper-m15-watch-prices';
import type {ConditionalMovementRoute} from '../lib/sniper-m15-smart-route';

type Side='BUY'|'SELL'|'WAIT';
type Props={
  watch:WatchPriceMap;ready:boolean;direction:Side;m1Side:Side;m15Side:Side;
  route?:ConditionalMovementRoute|null;instanceId?:string;
  price:number|null;trigger:number|null;invalidation:number|null;
  split:number;end:number;top:number;bottom:number;lo:number;hi:number;
  py:(value:number)=>number;
};
const fmt=(n:number|null|undefined)=>n!=null&&Number.isFinite(n)&&n>0?
  n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

/**
 * A highly visible decision diagram, NOT extrapolated future OHLC.
 * Upper/lower destinations come only from genuine CLOSED M15/H1 price levels.
 * The map has its own explicitly non-proportional visual layout and never
 * shares the real candlestick axis or claims to predict arrival time.
 */
export default function SniperLiquidityDecisionMap(p:Props){
  const {watch,ready,split,end,top,bottom}=p;
  const route=ready?p.route:null;
  const invalidated=Boolean(route&&route.invalidation!=null&&p.price!=null&&
    (route.side==='BUY'?p.price<=route.invalidation:p.price>=route.invalidation));
  const activeSide=route&&!invalidated?route.side:'WAIT';
  const conflict=ready&&p.m1Side!=='WAIT'&&p.m15Side!=='WAIT'&&
    p.m1Side!==p.m15Side;
  const upper=ready?watch.upper.slice(0,2):[];
  const lower=ready?watch.lower.slice(0,2):[];
  const linePrices=route?route.targets.map(t=>t.price):[];
  const evidenceEntries=ready?[...upper,...lower]:[];
  const hasUpper=upper.length>0,hasLower=lower.length>0;
  const x=split+11,w=end-split-22;
  const cy=top+(bottom-top)*.53;
  const pathX=split+37,endX=end-40;
  const riseY=top+194,fallY=bottom-139;
  const riseD='M '+pathX+' '+cy+
    ' C '+(pathX+20)+' '+(cy-54)+' '+(endX-45)+' '+riseY+' '+endX+' '+riseY;
  const fallD='M '+pathX+' '+cy+
    ' C '+(pathX+20)+' '+(cy+54)+' '+(endX-45)+' '+fallY+' '+endX+' '+fallY;
  const suffix=(p.instanceId||'gold').replace(/[^a-zA-Z0-9]/g,'');
  const upId='qannasV4Up'+suffix,downId='qannasV4Down'+suffix;
  const markerUp='qannasV4ArrowUp'+suffix,markerDown='qannasV4ArrowDown'+suffix;
  const sideLabel=invalidated?'التوقع محفوظ · غير نشط':
    activeSide==='BUY'?'مسار الصعود مرجّح للمراقبة':
    activeSide==='SELL'?'مسار الهبوط مرجّح للمراقبة':
    conflict?'تعارض إشارات M1 وM15':
    ready?'مساران محتملان · انتظار التأكيد':'البيانات غير جاهزة';
  const confidenceLabel=route&&!invalidated?route.evidence:
    conflict?'إشارات متضاربة':ready?'مراقبة فقط':'لا إشارات مؤهلة';
  // Keep this explicit provenance invariant for test & review: when a route
  // qualifies its reference destinations are route.targets.map(t=>t.price).
  // There is no timing or fill inference in this figure.
  return <g className="sniper-m15-liquidity-decision-map">
    <defs>
      <linearGradient id={upId} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#147a6f"/>
        <stop offset=".55" stopColor="#32d5af"/>
        <stop offset="1" stopColor="#b5ffe6"/>
      </linearGradient>
      <linearGradient id={downId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a44e67"/>
        <stop offset=".55" stopColor="#f57392"/>
        <stop offset="1" stopColor="#ffd4de"/>
      </linearGradient>
      <marker id={markerUp} viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#62f8c7"/>
      </marker>
      <marker id={markerDown} viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8caa"/>
      </marker>
    </defs>
    <rect x={split+1} y={top+1} width={end-split-2}
      height={bottom-top-2} rx="5" fill="#06141a"/>
    <rect x={split+5} y={top+5} width={end-split-10}
      height={bottom-top-10} rx="5" fill="none"
      stroke="#335d66" strokeWidth=".8" strokeDasharray="2 8"/>
    <line x1={split} x2={split} y1={top} y2={bottom}
      stroke="#c6a66d" strokeDasharray="4 5" strokeWidth="1.4"/>
    <rect x={x+1} y={top+13} width={w-2} height="95" rx="8"
      fill="#0f2930" stroke="#af8f4a" strokeWidth="1.1"/>
    <text x={split+18} y={top+30} fill="#eac675" fontSize="8" fontWeight="800">
      V4 · LIVE RADAR
    </text>
    <text x={end-19} y={top+48} direction="rtl" textAnchor="end"
      fill="#e2f4ef" fontSize="12" fontWeight="900">خريطة قنص الحركة</text>
    <text x={end-19} y={top+67} direction="rtl" textAnchor="end"
      fill={invalidated?'#9fb4bf':activeSide==='BUY'?'#62ecc4':
        activeSide==='SELL'?'#ff95b1':'#e4c98b'}
      fontSize="9.5" fontWeight="800">{sideLabel}</text>
    <text x={end-19} y={top+86} textAnchor="end" fill="#93b6bc"
      fontSize="8">{confidenceLabel}</text>

    {/* Schematic lanes are spatially fixed and do not impersonate a time axis. */}
    <rect x={x+1} y={top+119} width={w-2} height="65" rx="7"
      fill="#0b2724" stroke="#327b6b" strokeWidth="1"/>
    <rect x={x+1} y={bottom-123} width={w-2} height="64" rx="7"
      fill="#28151e" stroke="#8b4358" strokeWidth="1"/>
    <text x={end-21} y={top+136} textAnchor="end" direction="rtl"
      fill="#72eac8" fontSize="10.5" fontWeight="900">↗ سيولة فوق القمم</text>
    <text x={end-21} y={top+157} textAnchor="end" fill="#e6fff3"
      fontSize="13" fontWeight="900">{fmt(upper[0]?.price)}</text>
    <text x={end-21} y={top+173} textAnchor="end" fill="#81b9a8"
      fontSize="8.3">{hasUpper?upper[0].source+' · '+fmt(upper[1]?.price):'لا مستوى صعود مؤكد'}</text>
    <text x={end-21} y={bottom-104} textAnchor="end" direction="rtl"
      fill="#ff9ab0" fontSize="10.5" fontWeight="900">↘ سيولة تحت القيعان</text>
    <text x={end-21} y={bottom-82} textAnchor="end" fill="#fff1f4"
      fontSize="13" fontWeight="900">{fmt(lower[0]?.price)}</text>
    <text x={end-21} y={bottom-66} textAnchor="end" fill="#cda0b0"
      fontSize="8.3">{hasLower?lower[0].source+' · '+fmt(lower[1]?.price):'لا مستوى هبوط مؤكد'}</text>

    {/* Bright movement paths are conditional, not candles or proportional price lines. */}
    <g className="sniper-m15-motion-route">
      <path d={riseD} fill="none" stroke="#1f967e" strokeWidth="10"
        strokeLinecap="round" opacity={hasUpper?'.13':'.04'}/>
      <path d={fallD} fill="none" stroke="#c15e77" strokeWidth="10"
        strokeLinecap="round" opacity={hasLower?'.13':'.04'}/>
      <path d={riseD} fill="none" stroke={'url(#'+upId+')'}
        strokeWidth={activeSide==='BUY'?3.5:1.5}
        strokeDasharray={activeSide==='BUY'?'none':'5 6'}
        opacity={hasUpper?(activeSide==='BUY'?1:.65):.18}
        markerEnd={'url(#'+markerUp+')'}/>
      <path d={fallD} fill="none" stroke={'url(#'+downId+')'}
        strokeWidth={activeSide==='SELL'?3.5:1.5}
        strokeDasharray={activeSide==='SELL'?'none':'5 6'}
        opacity={hasLower?(activeSide==='SELL'?1:.65):.18}
        markerEnd={'url(#'+markerDown+')'}/>
      {hasUpper&&<circle cx={endX} cy={riseY} r="5.5" fill="#123f35"
        stroke="#6bffcf" strokeWidth="2"/>}
      {hasLower&&<circle cx={endX} cy={fallY} r="5.5" fill="#3e1d2b"
        stroke="#ff93ad" strokeWidth="2"/>}
      <circle cx={pathX} cy={cy} r="28" fill="#0b2029"
        stroke="#d3ad64" strokeWidth="1.2" opacity=".95"/>
      <circle cx={pathX} cy={cy} r="18" fill="none"
        stroke="#cfb16e" strokeDasharray="3 4"/>
      <circle cx={pathX} cy={cy} r="5" fill="#d6f8ef"/>
      <path d={'M '+(pathX-35)+' '+cy+' h 12 M '+(pathX+23)+' '+cy+
        ' h 12 M '+pathX+' '+(cy-35)+' v 12 M '+pathX+' '+(cy+23)+' v 12'}
        stroke="#d7ba7e" strokeWidth="1.4"/>
    </g>
    <rect x={split+73} y={cy-24} width={end-split-91} height="49" rx="6"
      fill="#0b242e" stroke="#53848b" strokeWidth=".9"/>
    <text x={end-22} y={cy-7} textAnchor="end" direction="rtl"
      fill="#9bdbe0" fontSize="8.6">السعر المرصود</text>
    <text x={end-22} y={cy+12} textAnchor="end"
      fill="#e1faff" fontSize="14" fontWeight="900">{fmt(p.price)}</text>
    {route&&!invalidated&&<text x={end-21} y={cy+40}
      textAnchor="end" fill="#bfc6d3" fontSize="8">
      {'مرتكز M1 '+fmt(route.anchor)}
    </text>}
    {invalidated&&<text x={end-21} y={cy+40}
      textAnchor="end" fill="#ffb3c5" fontSize="8.1">
      التوقع محفوظ · غير نشط
    </text>}
    {ready&&p.trigger!=null&&Number.isFinite(p.trigger)&&
      <text x={end-21} y={cy-43} textAnchor="end" fill="#e7c47e"
        fontSize="8.2">{'تفعيل مشروط '+fmt(p.trigger)}</text>}
    {ready&&p.invalidation!=null&&Number.isFinite(p.invalidation)&&
      <text x={end-21} y={cy+60} textAnchor="end" fill="#f4a3b6"
        fontSize="8.2">{'إبطال '+fmt(p.invalidation)}</text>}

    <rect x={x+1} y={bottom-46} width={w-2} height="32" rx="5"
      fill="#10222b" stroke="#294b59" strokeWidth=".7"/>
    <text x={end-19} y={bottom-33} textAnchor="end" direction="rtl"
      fill="#aecbd4" fontSize="8.3">↗ ↘ مسارات مراقبة وليست صفقات</text>
    <text x={end-19} y={bottom-20} textAnchor="end" direction="rtl"
      fill="#89a5ad" fontSize="7.4">مخطط غير زمني وغير نسبي · لا ربح مضمون</text>

    {/* Retain exact reference prices for discovery and accessibility. */}
    <g className="sniper-m15-source-level">
      <title>{'سيولة M15/H1: '+evidenceEntries
        .map(z=>z.source+' '+fmt(z.price)).join('، ')}</title>
    </g>
    <title>{linePrices.length?
      'المسار المرصود من '+fmt(route?.anchor)+' نحو '+linePrices.map(fmt).join(' ثم ')+
      ' — توضيحي فقط':'مراقبة مشروطة للمستويات الحقيقية؛ لا شموع مستقبلية'}</title>
  </g>;
}
