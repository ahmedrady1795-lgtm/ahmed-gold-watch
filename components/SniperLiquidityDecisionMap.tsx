import type {WatchPriceMap} from '../lib/sniper-m15-watch-prices';

type Side='BUY'|'SELL'|'WAIT';
type Props={
  watch:WatchPriceMap;ready:boolean;direction:Side;m1Side:Side;m15Side:Side;
  price:number|null;trigger:number|null;invalidation:number|null;
  split:number;end:number;top:number;bottom:number;lo:number;hi:number;
  py:(value:number)=>number;
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const fmt=(v:number)=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

/**
 * Source-backed, bidirectional liquidity map. Does not interpolate future
 * OHLC, move an observed price or imply that a watch level is a filled order.
 */
export default function SniperLiquidityDecisionMap(p:Props){
  const {watch,ready,split,end,top,bottom,lo,hi,py}=p;
  const conflict=ready&&p.m1Side!=='WAIT'&&p.m15Side!=='WAIT'&&
    p.m1Side!==p.m15Side;
  const entries=ready?[
    ...watch.upper.slice(0,2).map(v=>({
      key:v.key,label:'قمة '+v.source,price:v.price,color:'#62e0b1',
      detail:'سيولة فوق قمة تاريخية من شموع '+v.source+' مغلقة؛ مراقبة فقط'
    })),
    ...watch.lower.slice(0,2).map(v=>({
      key:v.key,label:'قاع '+v.source,price:v.price,color:'#ff8b9a',
      detail:'سيولة تحت قاع تاريخي من شموع '+v.source+' مغلقة؛ مراقبة فقط'
    })),
    ...(p.trigger!=null&&Number.isFinite(p.trigger)?[{
      key:'TRIGGER',label:'كسر مشروط',price:p.trigger,color:'#e8c87b',
      detail:'مستوى تحضير من M1/M5 يتطلب تأكيدًا ولا يمثل أمر دخول'
    }]:[]),
    ...(p.invalidation!=null&&Number.isFinite(p.invalidation)?[{
      key:'INVALID',label:'إبطال',price:p.invalidation,color:'#e8a1b1',
      detail:'سعر إبطال حالة الرصد المبكر؛ ليس وقفًا منفذًا'
    }]:[])
  ].filter(v=>v.price>=lo&&v.price<=hi):[];
  const labels=entries.map(z=>({...z,y:py(z.price),
    labelY:clamp(py(z.price),top+104,bottom-24)}))
    .sort((a,b)=>a.labelY-b.labelY);
  for(let i=1;i<labels.length;i++)
    labels[i].labelY=Math.max(labels[i].labelY,labels[i-1].labelY+22);
  const overflow=labels.length?Math.max(0,labels[labels.length-1].labelY-(bottom-22)):0;
  if(overflow)for(const z of labels)z.labelY-=overflow;
  return <g className="sniper-m15-liquidity-decision-map">
    <rect x={split+1} y={top+1} width={end-split-2}
      height={bottom-top-2} fill="#08161b" fillOpacity=".94"/>
    <line x1={split} x2={split} y1={top} y2={bottom}
      stroke="#81a0b1" strokeDasharray="5 5" strokeWidth="1.2"/>
    <rect x={split+8} y={top+9} width={end-split-16} height="76"
      rx="6" fill="#102832" stroke="#355364" strokeWidth=".8"/>
    <text x={end-12} y={top+25} textAnchor="end" direction="rtl"
      fill="#d6ebef" fontSize="9.5" fontWeight="800">خريطة السيولة · M15 / H1</text>
    <text x={end-12} y={top+44} textAnchor="end" direction="rtl"
      fontSize="9.1" fontWeight="800"
      fill={conflict?'#e7c27c':p.direction==='BUY'?'#63e8b9':
        p.direction==='SELL'?'#ff8da0':'#d5b77b'}>
      {conflict?'تعارض اتجاه الدقيقة وربع الساعة':
        p.direction==='BUY'?'↗ ميل صعود للمراقبة':
        p.direction==='SELL'?'↘ ميل هبوط للمراقبة':
        '↔ لا يوجد اتجاه متفق عليه'}
    </text>
    <text x={end-12} y={top+62} textAnchor="end" direction="rtl"
      fontSize="7.8" fill="#aac2ca">
      {ready?'مستويات من إغلاقات فعلية · لا مسار مضمون':
        'بيانات غير مؤهلة · لا توقع مرسوم'}
    </text>
    {labels.map(z=><g key={z.key} className="sniper-m15-source-level">
      <line x1={split+9} x2={end-8} y1={z.y} y2={z.y}
        stroke={z.color} strokeWidth="1.15" strokeDasharray="4 5" opacity=".85"/>
      <circle cx={split+13} cy={z.y} r="3.1" fill="#08161b"
        stroke={z.color} strokeWidth="1.6"/>
      {Math.abs(z.y-z.labelY)>9&&<line x1={split+21} x2={split+28}
        y1={z.y} y2={z.labelY} stroke={z.color} strokeOpacity=".7" strokeWidth=".85"/>}
      <rect x={split+29} y={z.labelY-10} width={end-split-39}
        height="19" rx="3" fill="#0b2027" stroke={z.color}
        strokeOpacity=".7" strokeWidth=".7"/>
      <text x={end-15} y={z.labelY+3} textAnchor="end" direction="rtl"
        fill={z.color} fontSize="8.4" fontWeight="700">
        {z.label+' · '+fmt(z.price)}
      </text>
      <title>{z.detail+' · '+fmt(z.price)}</title>
    </g>)}
    {ready&&p.price!=null&&p.price>=lo&&p.price<=hi&&
      <g className="sniper-m15-map-live">
        <line x1={split+8} x2={end-7} y1={py(p.price)} y2={py(p.price)}
          stroke="#b7ecf6" strokeWidth="1" strokeDasharray="2 3" opacity=".9"/>
        <circle cx={end-8} cy={py(p.price)} r="3.2" fill="#d3fbff" stroke="#0a2026"/>
        <title>{'السعر المرصود حاليًا '+fmt(p.price)}</title>
      </g>}
    {labels.length===0&&<g className="sniper-m15-map-empty">
      <text x={(split+end)/2} y={top+148} textAnchor="middle" direction="rtl"
        fill="#d4bf92" fontSize="9.5">
        {ready?'لا قمم أو قيعان مرصودة داخل المدى':'انتظار بيانات M15 حديثة'}
      </text>
      <text x={(split+end)/2} y={top+168} textAnchor="middle" direction="rtl"
        fill="#9cb6c3" fontSize="8">
        {ready?'المستويات البعيدة في اللوحة الجانبية':'لا نعرض مستويات أو شموع افتراضية'}
      </text>
    </g>}
  </g>;
}
