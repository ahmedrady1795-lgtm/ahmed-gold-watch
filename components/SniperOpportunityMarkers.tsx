import type {LiveOpportunity} from '../lib/sniper-live-opportunity';
import {outcomeLabel} from './SniperOpportunityHistory';
import type {MovementProof} from '../lib/sniper-movement-proof';

type Props={signal:LiveOpportunity;records:MovementProof[];asset:'GOLD'|'BTC';
 source:string;from:number;now:number;left:number;split:number;end:number;
 top:number;bottom:number;py:(price:number)=>number;timeX:(time:number)=>number};

/** Show only observations actually issued, never reconstructed hindsight entries. */
export default function SniperOpportunityMarkers(p:Props){
 const fit=(y:number)=>Math.max(p.top+15,Math.min(p.bottom-15,y));
 const visible=(price:number)=>Number.isFinite(price)&&price>0&&
   p.py(price)>=p.top&&p.py(price)<=p.bottom;
 const rows=p.records.filter(r=>r.asset===p.asset&&r.source===p.source&&
   r.kind==='BREAK'&&r.issuedAt>=p.from&&r.issuedAt<=p.now&&visible(r.priceAt))
   .sort((a,b)=>b.issuedAt-a.issuedAt);
 // Keep nearby captions legible, without changing recorded time or price.
 const shown:MovementProof[]=[];
 for(const r of rows){
   if(shown.some(s=>Math.abs(p.timeX(s.issuedAt)-p.timeX(r.issuedAt))<54&&
     Math.abs(p.py(s.priceAt)-p.py(r.priceAt))<34))continue;
   shown.push(r);
 }
 const s=p.signal;
 const active=['PREPARE','TESTING','BREAK_CONFIRMED'].includes(s.phase)&&
   (s.side==='BUY'||s.side==='SELL')&&s.trigger!=null&&visible(s.trigger);
 return <g className="sniper-opportunity-markers" aria-label="أماكن فرص الشراء والبيع">
   {rows.filter(r=>!shown.includes(r)).map(r=><g key={r.id}>
     <circle cx={p.timeX(r.issuedAt)} cy={p.py(r.priceAt)} r="2.6"
       fill={r.side==='BUY'?'#57efb8':'#ff8095'}/>
     <title>{(r.side==='BUY'?'شراء':'بيع')+' · '+r.priceAt.toFixed(2)+' · '+outcomeLabel[r.status]}</title>
   </g>)}
   {shown.map(r=>{
     const x=p.timeX(r.issuedAt),y=p.py(r.priceAt),buy=r.side==='BUY';
     const ink=buy?'#57efb8':'#ff8095',labelY=fit(y+(buy?23:-23));
     const labelX=Math.max(p.left+26,Math.min(p.split-26,x));
     return <g key={r.id} data-side={r.side} data-issued-at={r.issuedAt}>
       <title>{(buy?'شراء':'بيع')+' · رصد سابق عند '+r.priceAt.toFixed(2)+
         ' · '+new Date(r.issuedAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai'})+
         ' · '+outcomeLabel[r.status]+' · إشارة تحليلية مسجلة وليست صفقة منفذة'}</title>
       <line x1={x} x2={labelX} y1={y} y2={labelY} stroke={ink} strokeWidth="1"/>
       <circle cx={x} cy={y} r="3" fill={ink}/>
       <rect x={labelX-24} y={labelY-10} width="48" height="20" rx="5"
         fill="#081d29" stroke={ink} strokeOpacity=".7"/>
       <text x={labelX} y={labelY+4} textAnchor="middle" direction="rtl"
         fontSize="11" fontWeight="800" fill={ink}>{(buy?'شراء':'بيع')+(r.status==='TARGET'?' ✓':r.status==='STOP'?' ✕':'')}</text>
     </g>;
   })}
   {active&&(()=>{
     const buy=s.side==='BUY',confirmed=s.phase==='BREAK_CONFIRMED';
     const ink=buy?'#57efb8':'#ff8095',y=p.py(s.trigger!);
     const width=126,x=Math.min(p.split+12,p.end-width-4),labelY=fit(y);
     const label=(confirmed?'':'ترقب ')+(buy?'شراء':'بيع');
     return <g data-phase={s.phase} aria-label={label+' عند '+s.trigger!.toFixed(2)}>
       <title>{s.reason+' · المستوى '+s.trigger!.toFixed(2)+
         ' · إشارة تحليلية وليست ضمان ربح أو أمر تنفيذ'}</title>
       <line x1={p.split-5} x2={x+width} y1={y} y2={y}
         stroke={ink} strokeWidth="1.3" strokeDasharray={confirmed?undefined:'4 3'}/>
       <circle cx={p.split} cy={y} r="4" fill={ink}/>
       <line x1={x} x2={x} y1={y} y2={labelY} stroke={ink}/>
       <rect x={x} y={labelY-13} width={width} height="26" rx="5"
         fill={buy?'#073a2d':'#421b2a'} stroke={ink}/>
       <text x={x+width/2} y={labelY+4} textAnchor="middle" direction="rtl"
         fontSize="11" fontWeight="800" fill={ink}>
         {label+' · '+s.trigger!.toFixed(2)}</text>
     </g>;
   })()}
 </g>;
}
