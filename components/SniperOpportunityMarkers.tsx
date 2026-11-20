import type {LiveOpportunity} from '../lib/sniper-live-opportunity';
import {outcomeLabel} from './SniperOpportunityHistory';
import {movementObservationLabel} from '../lib/sniper-movement-proof';
import type {MovementProof} from '../lib/sniper-movement-proof';

type Props={signal:LiveOpportunity;records:MovementProof[];evidenceScore?:number|null;
 asset:'GOLD'|'BTC';
 source:string;from:number;now:number;left:number;split:number;end:number;
 top:number;bottom:number;py:(price:number)=>number;timeX:(time:number)=>number};

/** Show only observations actually issued, never reconstructed hindsight entries. */
export default function SniperOpportunityMarkers(p:Props){
 const fit=(y:number)=>Math.max(p.top+15,Math.min(p.bottom-15,y));
 // Each marker stays anchored to its REAL issuance time/price. Only caption
 // positions may move to avoid covering price bars or another caption.
 const occupied:{l:number;r:number;t:number;b:number}[]=[];
 const placeLabel=(x:number,y:number,w:number,h:number,offset:number)=>{
   const dx=[0,-25,25,-55,55,-86,86];
   const offsets=[offset,offset*1.65,-offset*0.85,offset*2.2];
   for(const dy of offsets)for(const shift of dx){
     const cx=Math.min(p.split-w/2-4,Math.max(p.left+w/2+4,x+shift));
     const cy=Math.min(p.bottom-h/2-4,Math.max(p.top+h/2+4,y+dy));
     const box={l:cx-w/2,r:cx+w/2,t:cy-h/2,b:cy+h/2};
     if(occupied.every(b=>box.r+5<b.l||box.l-5>b.r||
       box.b+4<b.t||box.t-4>b.b)){
       occupied.push(box);return {x:cx,y:cy};
     }
   }
   return null; // keep the real price dot, omit only an overlapping caption
 };
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
 // Keep genuinely issued PRE-break warnings visible at their original
 // observation time. Never backfill an early alert from a later breakout.
 const early=p.records.filter(r=>r.asset===p.asset&&r.source===p.source&&
   r.kind==='EARLY'&&r.issuedAt>=p.from&&r.issuedAt<=p.now&&visible(r.priceAt))
   .sort((a,b)=>b.issuedAt-a.issuedAt);
 const earlyShown:MovementProof[]=[];
 for(const r of early){
   if(earlyShown.length>=8)break;
   if(earlyShown.some(e=>Math.abs(p.timeX(e.issuedAt)-p.timeX(r.issuedAt))<35&&
     Math.abs(p.py(e.priceAt)-p.py(r.priceAt))<24))continue;
   earlyShown.push(r);
 }
 // A real first/last-minute observation is pinned to the original M5
 // candle. Never reconstruct missing buy/sell labels after price has moved.
 const m5Issued=p.records.filter(r=>r.asset===p.asset&&r.source===p.source&&
   (r.kind==='OPEN'||r.kind==='FOLLOW'||r.kind==='CLOSE')&&r.issuedAt>=p.from&&
   r.issuedAt<=p.now&&visible(r.priceAt))
   .sort((a,b)=>b.issuedAt-a.issuedAt);
 // Only caption the FIRST observation of a distinct directional wave.
 // Historical dots (including repeated observations) remain at their original
 // price and issuance time for review. A new opposite wave or a 45m gap can
 // start a fresh caption; an ongoing decline is not six new sell entries.
 const waveIds=new Set<string>();
 let priorWaveRecord:MovementProof|null=null;
 for(const record of [...m5Issued].reverse()){
   if(!priorWaveRecord||record.side!==priorWaveRecord.side||
     record.issuedAt-priorWaveRecord.issuedAt>45*60000)
     waveIds.add(record.id);
   priorWaveRecord=record;
 }
 const recentM5=m5Issued.filter(r=>waveIds.has(r.id)).slice(0,3);
 // Keep each historical point, but only one caption per nearby cluster.
 const m5Captioned:MovementProof[]=[];
 for(const r of recentM5){
   if(m5Captioned.some(e=>Math.abs(p.timeX(e.issuedAt)-p.timeX(r.issuedAt))<55&&
     Math.abs(p.py(e.priceAt)-p.py(r.priceAt))<42))continue;
   m5Captioned.push(r);
 }
 // Reserve labels for ACTUAL pre-break alerts ahead of later wave labels.
 // This makes genuinely early observations legible without losing old dots.
 const lifecycleLabel:Record<string,string>={
   PENDING:'الإعداد ما زال تحت المراقبة',
   ACTIVATED:'تم رصد تفعيل مستوى الإعداد لاحقًا',
   INVALIDATED:'الإعداد السابق أُلغي بكسر إبطاله؛ ليست صفقة خاسرة منفذة',
   CANCELLED:'الإعداد السابق أُلغي قبل التفعيل',
   EXPIRED:'انتهت صلاحية الإعداد من غير تفعيل مؤهل'
 };
 const onsetLabel:Record<string,string>={
   PENDING:'جارٍ رصد بداية الموجة',
   MOVE_FIRST:'بدأت حركة مؤيدة بعد التنبيه',
   ADVERSE_FIRST:'بدأت حركة عكس التنبيه',
   NO_MOVE:'لم تبدأ موجة مؤهلة خلال ثلاث دقائق',
   AMBIGUOUS:'لم يُعرف ترتيب لمس المستويين في شمعة واحدة',
   UNKNOWN:'بيانات غير كافية للحكم'
 };
 const s=p.signal;
 const active=['PREPARE','TESTING','BREAK_CONFIRMED'].includes(s.phase)&&
   (s.side==='BUY'||s.side==='SELL')&&s.trigger!=null&&visible(s.trigger);
 // The current setup owns a small lane beside the live candle. Keep every
 // older price dot and timestamp, but do not print contradictory-looking
 // historic M5 captions right on top of today's actionable watch.
 const nearCurrent=(r:MovementProof)=>active&&
   Math.abs(p.timeX(r.issuedAt)-p.split)<96&&
   Math.abs(p.py(r.priceAt)-p.py(s.trigger!))<62;
 if(active){
   const y=fit(p.py(s.trigger!));
   occupied.push({l:p.split-97,r:p.split-3,
     t:Math.max(p.top,y-32),b:Math.min(p.bottom,y+18)});
 }
 const earlyLabels=new Map<string,{x:number;y:number}>();
 // Reserve qualified entries before observational captions.
 const breakLabels=new Map<string,{x:number;y:number}>();
 for(const r of shown.filter(r=>r.quality==='SETUP'&&!nearCurrent(r))){
   const chosen=placeLabel(p.timeX(r.issuedAt),p.py(r.priceAt),48,16,
     r.side==='BUY'?29:-29);
   if(chosen)breakLabels.set(r.id,chosen);
 }
 for(const r of earlyShown.filter(r=>r.setupLifecycle!=='INVALIDATED'&&
   r.setupLifecycle!=='CANCELLED'&&r.setupLifecycle!=='EXPIRED'&&
   !nearCurrent(r)).slice(0,2)){
   const px=p.timeX(r.issuedAt),py=p.py(r.priceAt);
   const chosen=placeLabel(px,py,48,16,r.side==='BUY'?22:-22);
   if(chosen)earlyLabels.set(r.id,chosen);
 }
 const nearM5=(r:MovementProof)=>m5Captioned.some(e=>
   Math.abs(p.timeX(e.issuedAt)-p.timeX(r.issuedAt))<60&&
   Math.abs(p.py(e.priceAt)-p.py(r.priceAt))<40);
 return <g className="sniper-opportunity-markers" aria-label="أماكن الرصد المبكر والشراء والبيع">
   {m5Issued.map((r,i)=>{
     const x=p.timeX(r.issuedAt),y=p.py(r.priceAt);
     const buy=r.side==='BUY',ink=buy?'#5ef2b7':'#ff839c';
     const observedAt=new Date(r.issuedAt).toLocaleTimeString('en-GB',
       {timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'});
     const caption=m5Captioned.includes(r)&&!nearCurrent(r);
     // Closed-M1 observations may be follow-through or a short countertrend
     // rebound; only a prearmed break may say BUY/SELL.
     const labelText=movementObservationLabel(r);
     const shortLabel=buy?'↗ صعود':'↘ هبوط';
     const labelWidth=78;
     const placement=caption?placeLabel(x,y,labelWidth,16,buy?24:-24):null;
     const labelX=placement?.x??x,labelY=placement?.y??y;
     return <g key={r.id} data-kind={r.kind}
       data-issued-at={r.issuedAt} data-side={r.side}>
       <circle cx={x} cy={y} r={caption?4:2.6} fill={ink}
         stroke="#06151b" strokeWidth="1.2"/>
       {placement&&<>
         <line x1={x} x2={labelX} y1={y} y2={labelY}
           stroke={ink} strokeOpacity=".6" strokeWidth=".7"/>
         <text x={labelX} y={labelY+3} textAnchor="middle"
           direction="rtl" fontSize="9" fontWeight="800" fill={ink}
           stroke="#07111b" strokeWidth="2.6" paintOrder="stroke">
           {'متابعة '+shortLabel}</text>
       </>}
       <title>{labelText+' · '+(r.kind==='OPEN'?'بداية M5':r.kind==='FOLLOW'?'أثناء M5':'نهاية M5')+
         ' · '+r.priceAt.toFixed(2)+' · '+(r.m5Outcome==='CORRECT'?'إغلاق M5 وافق الاتجاه فقط':
         r.m5Outcome==='WRONG'?'إغلاق M5 خالف الاتجاه فقط':'تقييم إغلاق M5 قيد القياس')+
         ' · وقت الرصد '+observedAt+' بتوقيت دبي · توقع مرصود وقتها، ليس صفقة منفذة'}</title>
     </g>;
   })}
   {early.map((r,i)=>{
     const x=p.timeX(r.issuedAt),y=p.py(r.priceAt),buy=r.side==='BUY';
     const ended=r.setupLifecycle==='INVALIDATED'||
       r.setupLifecycle==='CANCELLED'||r.setupLifecycle==='EXPIRED';
     const ink=ended?'#b4a5ad':'#e0be78';
     return <g key={r.id} data-kind="EARLY" data-issued-at={r.issuedAt}
       data-onset={r.onsetOutcome??'NOT_AUDITED'}
       data-lifecycle={r.setupLifecycle??'NOT_AUDITED'}>
       {ended?<circle cx={x} cy={y} r="2.1" fill={ink}/>:
         <path d={buy?`M${x} ${y-8} L${x-6} ${y+2} L${x+6} ${y+2} Z`:
         `M${x} ${y+8} L${x-6} ${y-2} L${x+6} ${y-2} Z`}
         stroke={ink} strokeWidth="1.3" fill="#2c2414"/>}
       {ended&&<text className="sniper-ended-cross" x={x+8} y={y-7} fontSize="11"
         fill="#fa92a4" fontWeight="900">×</text>}
       <title>{'ترقب '+(buy?'شراء':'بيع')+' قبل الكسر · '+
         r.priceAt.toFixed(2)+' · '+outcomeLabel[r.status]+
         (r.setupLifecycle?' · '+lifecycleLabel[r.setupLifecycle]:
           ' · حالة الإعداد غير مسجلة وقت إصدار هذه العلامة')+
         (r.onsetOutcome?' · '+onsetLabel[r.onsetOutcome]: ' · لم تكن خاضعة لتقييم بداية الموجة')+
         (r.onsetDelaySeconds!=null?' · بعد '+r.onsetDelaySeconds+'ث':'')+
         ' · محفوظ عند الرصد وليس إشارة تنفيذ'}</title>
       {earlyLabels.has(r.id)&&<>
         <line x1={x} y1={y}
           x2={earlyLabels.get(r.id)!.x} y2={earlyLabels.get(r.id)!.y}
           stroke={ink} strokeWidth=".7" strokeOpacity=".55"/>
         <text x={earlyLabels.get(r.id)!.x}
           y={earlyLabels.get(r.id)!.y+3} textAnchor="middle"
           direction="rtl" fontSize="9" fontWeight="800" fill={ink}
           stroke="#07111b" strokeWidth="2.6" paintOrder="stroke">
           {buy?'ترقب صعود':'ترقب هبوط'}
         </text>
       </>}
     </g>;
   })}
   {rows.filter(r=>!shown.includes(r)).map(r=><g key={r.id}>
     <circle cx={p.timeX(r.issuedAt)} cy={p.py(r.priceAt)} r="2.6"
       fill={r.side==='BUY'?'#57efb8':'#ff8095'}/>
     <title>{(r.side==='BUY'?'شراء':'بيع')+' · '+r.priceAt.toFixed(2)+' · '+outcomeLabel[r.status]}</title>
   </g>)}
   {shown.map(r=>{
     const x=p.timeX(r.issuedAt),y=p.py(r.priceAt),buy=r.side==='BUY';
     const ink=r.quality==null?'#96a3b5':
       r.quality==='COUNTERTREND'?'#dfbb80':
       r.quality==='OBSERVATION'?'#9bafc6':buy?'#57efb8':'#ff8095';
     const action=(buy?'شراء':'بيع');
     const label=r.quality==='SETUP'?action:
       r.quality==='COUNTERTREND'?'عكس؟':
       (buy?'↗ كسر':'↘ كسر');
     const width=46;
     const placement=r.quality==='SETUP'?breakLabels.get(r.id):
       nearM5(r)||nearCurrent(r)?null:placeLabel(x,y,width,16,buy?22:-22);
     const labelX=placement?.x??x,labelY=placement?.y??y;
     return <g key={r.id} data-side={r.side} data-issued-at={r.issuedAt}>
       <title>{(buy?'شراء':'بيع')+' · رصد سابق عند '+r.priceAt.toFixed(2)+
         ' · '+new Date(r.issuedAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai'})+
         ' · '+outcomeLabel[r.status]+' · '+
         (r.quality==='SETUP'?'فرصة مشروطة':r.quality==='COUNTERTREND'?'عكس الاتجاه الأعلى':
           r.quality==='OBSERVATION'?'كسر مرصود دون شروط الفرصة':'إشارة قديمة غير مصنفة')+
         ' · إشارة تحليلية مسجلة وليست صفقة منفذة'}</title>
       {placement&&<line x1={x} x2={labelX} y1={y} y2={labelY}
         stroke={ink} strokeWidth="1"/>}
       <circle cx={x} cy={y} r="3" fill={ink}/>
       {placement&&<text x={labelX} y={labelY+3}
         textAnchor="middle" direction="rtl" fontSize="9"
         fontWeight="800" fill={ink} stroke="#07111b"
         strokeWidth="2.6" paintOrder="stroke">
         {label+(r.status==='TARGET'?' ✓':r.status==='STOP'?' ×':'')}
       </text>}
     </g>;
   })}
   {/* A historical observation must never hide the current setup. */}
   {active&&(()=>{
     const buy=s.side==='BUY',confirmed=s.phase==='BREAK_CONFIRMED';
     const ink=s.quality==='COUNTERTREND'?'#dfbb80':
       s.quality==='OBSERVATION'?'#9bafc6':buy?'#57efb8':'#ff8095';
     const y=p.py(s.trigger!);
     const x=p.split-12,labelY=fit(y);
     // Preparation and crossing tests have explicit watch labels. Only qualified SETUP confirmation
     // may show the plain directive; keep all detailed reasons in <title>.
     const label=confirmed?(s.quality==='SETUP'?(buy?'شراء':'بيع'):
       (buy?'↗ رصد':'↘ رصد')):
       s.phase==='TESTING'?(buy?'اختبار صعود':'اختبار هبوط'):
       (buy?'ترقب صعود':'ترقب هبوط');
     return <g data-phase={s.phase} aria-label={label+' عند '+s.trigger!.toFixed(2)}>
       <title>{s.reason+' · المستوى '+s.trigger!.toFixed(2)+
         (p.evidenceScore!=null?' · أدلة '+p.evidenceScore+'/10 (ليست احتمال نجاح)':'')+
         ' · إشارة تحليلية وليست ضمان ربح أو أمر تنفيذ'}</title>
       <line x1={p.split-48} x2={p.split} y1={y} y2={y}
         stroke={ink} strokeOpacity=".75" strokeWidth=".9"
         strokeDasharray={confirmed?undefined:'3 4'}/>
       <circle cx={p.split} cy={y} r="3.1" fill={ink}/>
       <line x1={x} x2={x} y1={y} y2={labelY}
         stroke={ink} strokeOpacity=".55" strokeWidth=".7"/>
       <text x={x} y={labelY-8} textAnchor="start" direction="rtl"
         fontSize="9.5" fontWeight="900" fill={ink}
         stroke="#07111b" strokeWidth="2.8" paintOrder="stroke">
         {label}</text>
     </g>;
   })()}
 </g>;
}
