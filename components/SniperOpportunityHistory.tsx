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
export default function SniperOpportunityHistory({records,asset}:{records:MovementProof[];asset:'GOLD'|'BTC'}){
 const [page,setPage]=useState(0);
 const rows=records.filter(r=>r.asset===asset&&['EARLY','BREAK','OPEN','FOLLOW','CLOSE'].includes(r.kind)).sort((a,b)=>b.issuedAt-a.issuedAt);
 const pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages-1);
 return <details className="sniper-opportunity-history">
   <summary>سجل إشارات البيع والشراء ({rows.length})</summary>
   <small>نتيجة إغلاق M5 ليست نتيجة الهدف أو ربح صفقة. السعر والهدف والإبطال، إن وُجدت، محفوظة وقت الرصد. الترقب مشروط وليس دخولًا منفذًا. قراءات بداية وأثناء ونهاية M5 تقاس من سعر الرصد حتى إغلاقها؛ الكسور تقاس في M5 التالية؛ الإشارات القديمة غير مصنفة، ولا توجد أرباح صفقات مثبتة. الحفظ محليًا حتى ٢٠٠٠ إنذار؛ لا يسجل أثناء إغلاق الصفحة.</small>
   <div style={{overflowX:'auto'}}><table>
     <thead><tr>{['وقت دبي','الإشارة','التصنيف','سعر الرصد','الهدف','الإبطال','نتيجة الهدف','مهلة الهدف','إغلاق M5 فقط'].map(t=><th key={t}>{t}</th>)}</tr></thead>
     <tbody>{rows.slice(current*20,current*20+20).map(r=><tr key={r.id}>
       <td dir="ltr">{new Date(r.issuedAt).toLocaleString('en-GB',{timeZone:'Asia/Dubai',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
       <td style={{color:r.side==='BUY'?'#57efb8':'#ff8095'}}>{r.side==='BUY'?'شراء':'بيع'}</td>
       <td>{r.kind==='EARLY'?'ترقب قبل الكسر':r.kind==='OPEN'?'بداية M5':r.kind==='FOLLOW'?'أثناء M5':r.kind==='CLOSE'?'نهاية M5':r.quality==='SETUP'?'فرصة مشروطة':r.quality==='COUNTERTREND'?'عكس الاتجاه':
         r.quality==='OBSERVATION'?'رصد فقط':'غير مصنف'}</td>
       <td>{r.priceAt.toFixed(2)}</td><td>{r.target?.toFixed(2)??'—'}</td>
       <td>{r.invalidation?.toFixed(2)??'—'}</td><td>{outcomeLabel[r.status]}</td>
       <td>{r.target!=null?'٦٠ دقيقة من الرصد':'لا توجد خطة هدف'}</td>
       <td>{r.m5Outcome?m5Label[r.m5Outcome]:'—'}</td>
     </tr>)}</tbody>
   </table></div>
   {!rows.length&&<p>لم تسجل إشارة مؤكدة بعد.</p>}
   {pages>1&&<div><button onClick={()=>setPage(Math.max(0,current-1))} disabled={!current}>الأحدث</button>
     <span> {current+1} / {pages} </span>
     <button onClick={()=>setPage(Math.min(pages-1,current+1))} disabled={current===pages-1}>الأقدم</button></div>}
 </details>;
}
