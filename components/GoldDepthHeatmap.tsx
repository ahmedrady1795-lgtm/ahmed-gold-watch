'use client';
import type {GoldDepthHeatmap as Heatmap} from '../lib/gold-flow-history';
export function GoldDepthHeatmap({maps,now,open}:{maps:readonly Heatmap[];now:number;open:boolean}){
 const live=open?maps.filter(v=>v.actionable===false&&v.asOf<=now&&now-v.asOf<=8000&&v.frames.length):[];
 return <details className="gold-depth-heatmap">
   <summary>خريطة السيولة · {live.length?live.length+' مصدر حي':'لا عمق حديث'}</summary>
   {live.map(m=>{
     const frames=m.frames.filter(f=>f.at<=now&&now-f.at<=120000);
     const levels=frames.flatMap(f=>f.levels);
     const lo=Math.min(...levels.map(l=>l.price)),hi=Math.max(...levels.map(l=>l.price));
     const max=Math.max(...levels.map(l=>l.qty));
     const y=(p:number)=>10+88*(hi-p)/Math.max(.01,hi-lo);
     return <div className="gold-depth-venue" key={m.source}>
       <small>{m.source} · {Math.floor((now-m.asOf)/1000)}ث</small>
       <svg viewBox="0 0 360 120" role="img" aria-label={'خريطة عمق مرصود '+m.source}>
         <rect width="360" height="120" fill="#081720"/>
         {frames.map(frame=><g key={frame.at}>
           {frame.levels.map(l=>{
             const intensity=l.qty/max;
             return <rect key={l.side+':'+l.price} x={4+(frame.at-(now-120000))/120000*288}
               y={y(l.price)} width="6" height="2.2" fill={intensity>.7?'#ffc34f':l.side==='BID'?'#32cfb1':'#fa758e'}
               opacity={.12+.88*intensity}><title>{l.side+' '+l.price+' · '+l.qty}</title></rect>;
           })}
           <circle cx={7+(frame.at-(now-120000))/120000*288} cy={y(frame.mid)} r="1.2" fill="#f4f6f8"/>
         </g>)}
         <text x="354" y="13" textAnchor="end" fontSize="9" fill="#bacad3">{hi.toFixed(2)}</text>
         <text x="354" y="99" textAnchor="end" fontSize="9" fill="#bacad3">{lo.toFixed(2)}</text>
         <text x="4" y="114" fontSize="9" fill="#bacad3">-120s</text>
         <text x="290" y="114" textAnchor="end" fontSize="9" fill="#bacad3">LIVE</text>
       </svg>
       <div className="gold-depth-rows"><span>أكبر طلب {m.bidWall.toFixed(2)}</span><span>أكبر عرض {m.askWall.toFixed(2)}</span></div>
       {m.changeKnown&&<div className="gold-depth-rows"><span>طلب +{m.bidAdded.toFixed(2)} / −{m.bidReduced.toFixed(2)}</span><span>عرض +{m.askAdded.toFixed(2)} / −{m.askReduced.toFixed(2)}</span></div>}
     </div>;
   })}
   <small>عينات عمق XAUUSDT خلال دقيقتين، ليست دفتر وسيط XAUUSD. الأصفر كثافة أعلى. نقص الكمية قد يكون تنفيذًا أو إلغاءً؛ الأوامر المخفية غير مؤكدة.</small>
 </details>;
}
