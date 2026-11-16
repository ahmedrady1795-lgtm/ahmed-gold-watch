'use client';
import {useState} from 'react';
import type {MovementProof} from '../lib/sniper-movement-proof';
export const outcomeLabel:Record<MovementProof['status'],string>={
 TARGET:'وصل الهدف ✓',STOP:'وصل الإبطال ✕',TIMEOUT:'انتهت المهلة',
 AMBIGUOUS:'هدف وإبطال بنفس الدقيقة',UNKNOWN:'بيانات ناقصة',
 NO_TARGET:'بلا هدف قابل للقياس',PENDING:'قيد المتابعة'};
export default function SniperOpportunityHistory({records,asset}:{records:MovementProof[];asset:'GOLD'|'BTC'}){
 const [page,setPage]=useState(0);
 const rows=records.filter(r=>r.asset===asset&&r.kind==='BREAK').sort((a,b)=>b.issuedAt-a.issuedAt);
 const pages=Math.max(1,Math.ceil(rows.length/20)),current=Math.min(page,pages-1);
 return <details className="sniper-opportunity-history">
   <summary>سجل إشارات البيع والشراء ({rows.length})</summary>
   <small>السعر والهدف والإبطال محفوظة وقت الرصد. النتيجة من شموع لاحقة، وليست أرباح صفقات. الحفظ على هذا المتصفح حتى ٢٠٠٠ إنذار؛ لا يسجل أثناء إغلاق الصفحة.</small>
   <div style={{overflowX:'auto'}}><table>
     <thead><tr>{['وقت دبي','الإشارة','التصنيف','سعر الرصد','الهدف','الإبطال','النتيجة'].map(t=><th key={t}>{t}</th>)}</tr></thead>
     <tbody>{rows.slice(current*20,current*20+20).map(r=><tr key={r.id}>
       <td dir="ltr">{new Date(r.issuedAt).toLocaleString('en-GB',{timeZone:'Asia/Dubai',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
       <td style={{color:r.side==='BUY'?'#57efb8':'#ff8095'}}>{r.side==='BUY'?'شراء':'بيع'}</td>
       <td>{r.quality==='SETUP'?'فرصة مشروطة':r.quality==='COUNTERTREND'?'عكس الاتجاه':
         r.quality==='OBSERVATION'?'رصد فقط':'قديم غير مصنف'}</td>
       <td>{r.priceAt.toFixed(2)}</td><td>{r.target?.toFixed(2)??'—'}</td>
       <td>{r.invalidation?.toFixed(2)??'—'}</td><td>{outcomeLabel[r.status]}</td>
     </tr>)}</tbody>
   </table></div>
   {!rows.length&&<p>لم تسجل إشارة مؤكدة بعد.</p>}
   {pages>1&&<div><button onClick={()=>setPage(Math.max(0,current-1))} disabled={!current}>الأحدث</button>
     <span> {current+1} / {pages} </span>
     <button onClick={()=>setPage(Math.min(pages-1,current+1))} disabled={current===pages-1}>الأقدم</button></div>}
 </details>;
}
