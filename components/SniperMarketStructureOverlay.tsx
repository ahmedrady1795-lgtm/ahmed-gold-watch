import type {StructureSnapshot} from '../lib/sniper-market-structure';
type Props={
  structure:StructureSnapshot;left:number;split:number;top:number;bottom:number;
  py:(price:number)=>number;timeX:(time:number)=>number;
};
const palette=(kind:string)=>kind.startsWith('BULL')||kind.endsWith('_UP')||
  kind==='SWEEP_LOW'?'#42e7af':'#fa7595';
export default function SniperMarketStructureOverlay(p:Props){
 const s=p.structure;
 if(!s.ready)return null;
 const min=p.left+5,max=p.split-7;
 const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
 const lastEvents=s.events.slice(-4);
 return <g className="sniper-market-structure" aria-label="هيكل السوق من الشموع المغلقة">
  {s.zones.map(z=>{
    const start=clamp(p.timeX(z.formedAt),min,max),color=palette(z.kind);
    const up=clamp(p.py(z.high),p.top+1,p.bottom-1);
    const down=clamp(p.py(z.low),p.top+1,p.bottom-1);
    if(start>=max||!Number.isFinite(up)||!Number.isFinite(down))return null;
    return <g className="sniper-structure-zone" key={z.kind+'-'+z.formedAt}>
      <rect x={start} y={Math.min(up,down)} width={max-start}
        height={Math.max(2,Math.abs(up-down))}
        fill={color} fillOpacity=".11" stroke={color} strokeOpacity=".46"
        strokeWidth=".7" strokeDasharray="4 4"/>
      <text x={max-3} y={Math.max(p.top+15,Math.min(p.bottom-4,Math.min(up,down)-5))}
        textAnchor="end" fontSize="8" fontWeight="800"
        fill={color} stroke="#02080d" strokeWidth="2" paintOrder="stroke"
        direction="rtl">{z.label}</text>
      <title>{z.label+' · منطقة سعرية مرصودة من M15 مغلق؛ ليست أوامر مخفية أو تأكيد دخول'}</title>
    </g>;
  })}
  {lastEvents.map((e,i)=>{
    const x=clamp(p.timeX(e.at),min,max),y=clamp(p.py(e.price),p.top+13,p.bottom-13);
    const color=palette(e.kind);
    // Multiple historical events on a tiny viewport must not cover the candles.
    const showLabel=i===lastEvents.length-1||i===lastEvents.length-2;
    return <g key={e.kind+'-'+e.at} className="sniper-structure-event">
      <circle cx={x} cy={y} r="3.6" fill="#020f15" stroke={color} strokeWidth="1.5"/>
      {showLabel&&<text x={clamp(x,p.left+26,p.split-32)}
        y={clamp(y-13-(i%2)*8,p.top+15,p.bottom-13)}
        textAnchor="middle" fill={color} fontSize="8.4"
        fontWeight="800" stroke="#02080d" strokeWidth="2.5"
        paintOrder="stroke" direction="ltr">
        {e.kind==='SWEEP_HIGH'?'SWEEP ↑':
          e.kind==='SWEEP_LOW'?'SWEEP ↓':
          e.kind.startsWith('CHOCH')?'CHoCH':'BOS'}
      </text>}
      <title>{e.label+' · مستوى '+e.price.toFixed(2)+' · إغلاق M15 فقط'}</title>
    </g>;
  })}
 </g>;
}
export function SniperStructureRSI({structure}:{
  structure:StructureSnapshot
}){
 const values=structure.rsiSeries;
 if(!structure.ready||values.length<4)return null;
 const w=400,h=50;
 const path=values.map((r,i)=>
   (i===0?'M ':' L ')+(8+i*(w-16)/(values.length-1)).toFixed(2)+' '+
   (5+(100-r)*.4).toFixed(2)).join('');
 const rsi=structure.rsi14;
 return <div className="sniper-structure-rsi" aria-label="مؤشر RSI 14 من شموع M15 المغلقة">
   <div className="sniper-structure-rsi-label">
     <strong>RSI 14</strong>
     <b dir="ltr">{rsi==null?'—':rsi.toFixed(1)}</b>
     <small>إغلاقات حقيقية</small>
   </div>
   <svg viewBox="0 0 400 50" role="img"
      aria-label="مسار RSI المحسوب من الإغلاقات السابقة">
     {[30,50,70].map(level=><line key={level} x1="7" x2="393"
       y1={5+(100-level)*.4} y2={5+(100-level)*.4}
       stroke={level===50?'#42515a':'#683d4a'}
       strokeDasharray="3 5" strokeWidth=".9"/>)}
     <path d={path} fill="none" stroke="#79e6b6"
       strokeWidth="1.8" strokeLinejoin="round"/>
   </svg>
 </div>;
}
