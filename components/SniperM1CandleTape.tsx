import {useMemo} from 'react';
import {buildM1CandleTape} from '../lib/sniper-m1-candle-tape';
import type {M1Bar} from '../lib/sniper-mt5-m1';

export default function SniperM1CandleTape({history,now}:{
  history:M1Bar[];now:number
}){
 const tape=useMemo(()=>buildM1CandleTape(history,now),[history,Math.floor(now/60000)]);
 const time=(at:number)=>new Date(at).toLocaleTimeString('en-GB',{
   hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'
 });
 return <section className="sniper-candle-tape" aria-label="مراجعة توقع اتجاه كل شمعة M1">
   <div className="sniper-candle-tape-title">
     <strong>قنص الدقيقة · اختبار شمعة بشمعة</strong>
     <span>{tape.graded?tape.aligned+' / '+tape.graded+' مطابقة اتجاه':'لا توجد نتائج اتجاه كافية'}</span>
   </div>
   <div className="sniper-candle-tape-rail">
     {tape.marks.length===0?<small className="sniper-candle-tape-no-data">
       نحتاج إغلاقات M1 متجاورة لتقييم الاتجاه دون النظر إلى المستقبل.
     </small>:tape.marks.map(m=>{
       const span=Math.max(m.high-m.low,.000001);
       const toY=(v:number)=>4+(m.high-v)/span*29;
       const bodyTop=Math.min(toY(m.open),toY(m.close));
       const bodyHeight=Math.max(1.5,Math.abs(toY(m.close)-toY(m.open)));
       const color=m.observed==='BUY'?'#49e3b3':
         m.observed==='SELL'?'#f1718d':'#b5c7d1';
       return <div className={'sniper-candle-tape-item '+(
           m.aligned===true?'is-aligned':
           m.aligned===false?'is-divergent':'is-neutral')}
         key={m.time}>
         <svg viewBox="0 0 42 39" role="img" aria-label={
           'شمعة M1 مغلقة '+(m.observed==='BUY'?'صاعدة':m.observed==='SELL'?'هابطة':'محايدة')
         }>
           <line x1="21" x2="21" y1={toY(m.high)} y2={toY(m.low)}
             stroke={color} strokeWidth="1.8"/>
           <rect x="16" y={bodyTop} width="10" height={bodyHeight}
             rx=".5" fill={color}/>
         </svg>
         <small dir="ltr">{time(m.time)}</small>
         {m.adaptiveImproved?<small title="اختير من تدريب سابق وفحص لاحق؛ ليس إثبات ربح">متكيف</small>:
          m.weak&&<small title="توقع منخفض الأدلة، ليس نسبة نجاح">ضعيف</small>}
         <b>{m.predicted==='BUY'?'↑':m.predicted==='SELL'?'↓':'–'}
           <span>{m.aligned===true?'✓':m.aligned===false?'×':'·'}</span>
         </b>
       </div>;
     })}
   </div>
   <small className="sniper-candle-tape-caution">
     جميع التوقعات الماضية {tape.aligned}/{tape.graded}، ومنها نموذج متكيف
     {' '}{tape.adaptiveAligned}/{tape.adaptiveGraded} (إن وُجد).
     {' '}المقارنة إعادة تشغيل تاريخية سببية، وليست إنذارات مجمدة حية أو أرباحًا.
     الأخطاء والضعيف محسوبين ولا بنخفيهم.
   </small>
 </section>;
}
