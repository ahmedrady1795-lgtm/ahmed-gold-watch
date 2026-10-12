'use client';
const value=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const duration=(v:unknown)=>value(v)==null?'—':Number(v)>=60?(Number(v)/60).toFixed(1)+' س':Number(v).toFixed(1)+' د';
const statuses:Record<string,string>={COMPLETED:'كل الأهداف',STOPPED:'إبطال',EXPIRED:'انتهاء المدة',REVERSED:'انعكاس',AMBIGUOUS:'ترتيب غير محسوم',UNOBSERVED:'متابعة ناقصة'};
export default function SniperPerformance({title,metrics,recent,asset}:{title:string;metrics:any;recent:any[];asset:'GOLD'|'BTC'}){
  const rows=(recent||[]).filter(r=>r.asset===asset).slice(0,5);
  return <section className="sniper-performance-cohort">
    <h4>{title}</h4>
    <div className="sniper-outcome-counts">
      <span>مكتمل <b>{metrics?.completed||0}</b></span><span>إبطال <b>{metrics?.stopped||0}</b></span>
      <span>انتهت المدة <b>{metrics?.expired||0}</b></span><span>انعكاس <b>{metrics?.reversed||0}</b></span>
      <span>جارٍ <b>{metrics?.pending||0}</b></span>
    </div>
    <div className="sniper-performance-table-wrap"><table>
      <caption>الوصول قبل الإبطال · الحالات المحسومة فقط</caption>
      <thead><tr><th>الهدف</th><th>وصل / عينة</th><th>النسبة</th><th>متوسط الوصول</th><th>الوسيط</th></tr></thead>
      <tbody>{([1,2,3] as const).map(stage=>{
        const t=metrics?.targets?.find((r:any)=>r.stage===stage),samples=Number(t?.samples||0);
        return <tr key={stage}><th>TP{stage}</th><td dir="ltr">{t?.hits||0} / {samples}</td>
          <td>{samples>=40&&value(t?.observedPct)!=null?t.observedPct+'%':'عينة غير كافية'}</td>
          <td>{duration(t?.avgMinutes)}</td><td>{duration(t?.medianMinutes)}</td></tr>;
      })}</tbody>
    </table></div>
    <p>الإحصاءات من آخر 600 سجل في مجموعة المتابعة. زمن الوصول محسوب للمسارات التي وصلت فقط؛ لا يتنبأ بموعد هدف جديد. الحالات المستبعدة: {Number(metrics?.ambiguous||0)+Number(metrics?.unobserved||0)}. النسب تظهر بعد 40 نتيجة لكل هدف.</p>
    {rows.length>0&&<ol className="sniper-recent-outcomes">{rows.map(r=><li key={r.id}>
      <span>{r.side==='BUY'?'شراء':'بيع'} · {statuses[r.status]||'جارٍ'}</span>
      <span>{(r.targets||[]).filter((t:any)=>t.reachedAt!=null).map((t:any)=>'TP'+t.stage).join(' + ')||'لا هدف مثبت'}</span>
      <small>{['AMBIGUOUS','UNOBSERVED'].includes(r.status)?'مستبعد من النسب':duration(r.resolvedAt!=null?(r.resolvedAt-r.startedAt)/60000:null)}</small>
    </li>)}</ol>}
  </section>;
}
