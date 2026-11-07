import {useEffect,useMemo,useState} from 'react';
import {buildM1CandleTape} from '../lib/sniper-m1-candle-tape';
import type {M1Bar} from '../lib/sniper-mt5-m1';

type ForwardEvidence={
  asset:'GOLD'|'BTC';issued:number;latestIssuedAt:number|null;
  paired:{status:string;n:number;modelHits:number;baselineHits:number;
    liftPctPoints:number|null};
  netR:number;resolved:number;storage:string;verifiedBrokerTrades:0;
};
export default function SniperM1CandleTape({history,now,asset}:{
  history:M1Bar[];now:number;asset:'GOLD'|'BTC'
}){
 const [forward,setForward]=useState<ForwardEvidence|null>(null);
 // Read-only evidence refresh once per minute. Does NOT run inference,
 // create predictions, backfill failed bars or authorize a broker order.
 useEffect(()=>{
   let active=true;
   void fetch('/api/sniper-health',{cache:'no-store',
     signal:AbortSignal.timeout(6500)})
     .then(r=>r.ok?r.json():Promise.reject(Error('health unavailable')))
     .then(j=>{if(active)setForward((asset==='GOLD'?
       j.paperM1?.gold:j.paperM1?.bitcoin)??null);})
     .catch(()=>{if(active)setForward(null)});
   return()=>{active=false};
 },[asset,Math.floor(now/60000)]);
 const tape=useMemo(()=>buildM1CandleTape(history,now),[history,Math.floor(now/60000)]);
 const time=(at:number)=>new Date(at).toLocaleTimeString('en-GB',{
   hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'
 });
 return <section className="sniper-candle-tape" aria-label="مراجعة توقع اتجاه كل شمعة M1">
   <div className="sniper-candle-tape-title">
     <strong>قنص الدقيقة · إعادة اختبار تاريخية، مش توقعات LIVE</strong>
     <span>{tape.graded?'تاريخي: '+tape.aligned+' / '+tape.graded+' اتجاه صحيح':'لا توجد نتائج اتجاه كافية'}</span>
   </div>
   <p style={{fontSize:12,margin:'7px 0',color:'#bfe7d8'}}>
     <strong>مراقبة LIVE مُجمّدة {asset==='BTC'?'BTC':'GOLD'}:</strong>
     {' '}{forward?
       forward.issued===0?'لسه مفيش توقع M1 أمامي محفوظ':
       'النتائج الأمامية '+forward.paired.modelHits+'/'+forward.paired.n+
         ' مقابل '+forward.paired.baselineHits+'/'+forward.paired.n+
         ' لاتباع آخر شمعة · '+forward.paired.status+
         ' · صافي السكالب الورقي '+forward.netR+'R من '+forward.resolved+' نتيجة':
       'لا توجد قراءة أمامية متاحة حاليًا'}
     {' '}· {forward?.storage==='VOLUME'?'تخزين دائم':
       'تخزين مؤقت قد يُفقد عند إعادة التشغيل'}
   </p>
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
         {m.recoveryApplied?<small title="تغيير بحثي بعد فشل الضغط في مجموعتين سابقتين؛ ليس توقعًا مؤكدًا">تجربة إنقاذ</small>:
          m.adaptiveImproved?<small title="اختير من تدريب سابق وفحص لاحق؛ ليس إثبات ربح">متكيف</small>:
          m.weak&&<small title="توقع منخفض الأدلة، ليس نسبة نجاح">ضعيف</small>}
         <b>{m.predicted==='BUY'?'↑':m.predicted==='SELL'?'↓':'–'}
           <span>{m.aligned===true?'✓':m.aligned===false?'×':'·'}</span>
         </b>
       </div>;
     })}
   </div>
   <small className="sniper-candle-tape-caution">
     {tape.recentWeak&&<>
       <strong>تنبيه: توقعات القناص في آخر {tape.recentGraded} شموع تاريخية ضعيفة
       ({tape.recentAligned} صحيح). لازم نختبر تغيير الطريقة قبل الوثوق فيها.</strong>{' '}
     </>}
     {' '}على نفس {tape.baselineGraded} شموع قابلة للمقارنة:
     القناص {tape.pairedModelHits} صحيح، واتباع آخر جسم شمعة مغلقة
     {' '}{tape.baselineAligned} صحيح.
     {' '}إجمالي اختبار القناص {tape.aligned}/{tape.graded}، ومنها متكيف
     {' '}{tape.adaptiveAligned}/{tape.adaptiveGraded}.
     {' '}دي إعادة تشغيل تاريخية سببية وليست إنذارات LIVE مجمدة أو إثبات ربح.
     الضعيف والأخطاء محسوبين ومش بنخفيهم.
   </small>
 </section>;
}
