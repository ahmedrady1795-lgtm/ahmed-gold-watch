'use client';
import {useState} from 'react';
import type {MovementProof} from '../lib/sniper-movement-proof';
export const outcomeLabel:Record<MovementProof['status'],string>={
 TARGET:'وصل الهدف ✓',STOP:'وصل الإبطال ✕',TIMEOUT:'انتهت المهلة',
 AMBIGUOUS:'هدف وإبطال بنفس الدقيقة',UNKNOWN:'بيانات ناقصة',
 NO_TARGET:'بلا هدف قابل للقياس',PENDING:'قيد المتابعة'};
const m5Label:Record<NonNullable<MovementProof['m5Outcome']>,string>={
 PENDING:'بانتظار إغلاق M5',CORRECT:'الإغلاق وافق الاتجاه',WRONG:'الإغلاق خالف الاتجاه',
 FLAT:'متوازن',UNKNOWN:'بيانات ناقصة'};
const onsetLabel:Record<string,string>={
 PENDING:'قيد القياس',MOVE_FIRST:'تحرك مع التوقع أولًا',ADVERSE_FIRST:'تحرك عكس التوقع أولًا',
 NO_MOVE:'لم تبدأ حركة',AMBIGUOUS:'ترتيب الحركة غير معلوم',UNKNOWN:'بيانات ناقصة'
};
const lifecycleLabel:Record<string,string>={
 PENDING:'ترقب سارٍ',ACTIVATED:'تفعّل لاحقًا',INVALIDATED:'كسر الإبطال',
 CANCELLED:'أُلغي',EXPIRED:'انتهت الصلاحية'
};
const flowLabel:Record<string,string>={
 EXECUTED_TRADES:'صفقات منفذة',BROKER_DOM:'عمق الوسيط',QUOTE_ACTIVITY:'نشاط أسعار',
 PRICE_PROXY:'قراءة الشموع',UNAVAILABLE:'غير متاح'
};
const sideLabel:Record<string,string>={BUY:'صعود',SELL:'هبوط',WAIT:'محايد',
 NEUTRAL:'محايد',UNAVAILABLE:'غير متاح'};
export default function SniperOpportunityHistory({records,asset}:{records:MovementProof[];asset:'GOLD'|'BTC'}){
 const [page,setPage]=useState(0);
 const rows=records.filter(r=>r.asset===asset&&['EARLY','BREAK','OPEN','FOLLOW','CLOSE'].includes(r.kind)).sort((a,b)=>b.issuedAt-a.issuedAt);
 const pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages-1);
 return <details className="sniper-opportunity-history">
   <summary>سجل إشارات البيع والشراء ({rows.length})</summary>
   <small>نتيجة إغلاق M5 ليست نتيجة الهدف أو ربح صفقة. السعر والهدف والإبطال، إن وُجدت، محفوظة وقت الرصد. الترقب مشروط وليس دخولًا منفذًا. قراءات بداية وأثناء ونهاية M5 تقاس من سعر الرصد حتى إغلاقها؛ الكسور تقاس في M5 التالية؛ الإشارات القديمة غير مصنفة، ولا توجد أرباح صفقات مثبتة. الحفظ محليًا حتى ٢٠٠٠ إنذار؛ لا يسجل أثناء إغلاق الصفحة.</small>
   <div style={{overflowX:'auto'}}><table>
     <thead><tr>{['وقت دبي','الإشارة','التصنيف','سعر الرصد','الهدف','الإبطال','نتيجة الهدف','مهلة الهدف','إغلاق M5 فقط','بداية الحركة','حالة الترقب','سبب الرصد'].map(t=><th key={t}>{t}</th>)}</tr></thead>
     <tbody>{rows.slice(current*20,current*20+20).map(r=><tr key={r.id}>
       <td dir="ltr">{new Date(r.issuedAt).toLocaleString('en-GB',{timeZone:'Asia/Dubai',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
       <td style={{color:r.side==='BUY'?'#57efb8':'#ff8095'}}>{r.side==='BUY'?'شراء':'بيع'}</td>
       <td>{r.kind==='EARLY'?'ترقب قبل الكسر':r.kind==='OPEN'?'بداية M5':r.kind==='FOLLOW'?'أثناء M5':r.kind==='CLOSE'?'نهاية M5':r.quality==='SETUP'?'فرصة مشروطة':r.quality==='COUNTERTREND'?'عكس الاتجاه':
         r.quality==='OBSERVATION'?'رصد فقط':'غير مصنف'}</td>
       <td>{r.priceAt.toFixed(2)}</td><td>{r.target?.toFixed(2)??'—'}</td>
       <td>{r.invalidation?.toFixed(2)??'—'}</td><td>{outcomeLabel[r.status]}</td>
       <td>{r.target!=null?'٦٠ دقيقة من الرصد':'لا توجد خطة هدف'}</td>
       <td>{r.m5Outcome?m5Label[r.m5Outcome]:'—'}</td>
       <td>{r.onsetOutcome?onsetLabel[r.onsetOutcome]:'غير مسجل'}</td>
       <td>{r.setupLifecycle?lifecycleLabel[r.setupLifecycle]:'—'}</td>
       <td>{r.evidence?<details><summary>سبب العلامة</summary>
         <p>{r.evidence.reason}</p>
         <p>{'مصدر الشموع '+r.source}</p>
         <p>{'التدفق وقت الرصد '+(flowLabel[r.evidence.flowStatus]??r.evidence.flowStatus)+
           ' · '+r.evidence.flowSource+' · اتجاهه '+sideLabel[r.evidence.flowSide]}</p>
         <p>{'تحليل السيولة '+(r.evidence.liquidityReady?'متاح':'غير متاح')+
           ' · M1 '+sideLabel[r.evidence.m1Side]+' · M15 '+sideLabel[r.evidence.m15Side]}</p>
         <p>{'PAXG سوق منفصل · '+(sideLabel[r.evidence.proxySide]??r.evidence.proxySide)}</p>
       </details>:'سبب الإصدار غير محفوظ'}</td>
     </tr>)}</tbody>
   </table></div>
   {!rows.length&&<p>لم تسجل إشارة مؤكدة بعد.</p>}
   {pages>1&&<div><button onClick={()=>setPage(Math.max(0,current-1))} disabled={!current}>الأحدث</button>
     <span> {current+1} / {pages} </span>
     <button onClick={()=>setPage(Math.min(pages-1,current+1))} disabled={current===pages-1}>الأقدم</button></div>}
 </details>;
}
