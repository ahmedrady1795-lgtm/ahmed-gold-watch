'use client';
import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Target} from 'lucide-react';

const fmt=(v:any,d=2)=>v!=null&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:string)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const setupAr=(s:string)=>s==='BREAKOUT'?'اختراق نطاق':s==='PULLBACK'?'إعادة اختبار':s==='SWEEP'?'سحب سيولة وانعكاس':'رصد إعداد جديد';
const stateAr=(s:string)=>({ARMED:'بانتظار التفعيل',ACTIVE:'متابعة تجريبية',TP1:'تحقق T1',STOP:'ضرب الوقف',TIME_EXIT:'انتهت المدة',EXPIRED:'انتهت صلاحية الدخول',CANCELED:'أُلغي قبل الدخول',UNKNOWN:'نتيجة غير موثقة'} as Record<string,string>)[s]||'مراقبة';

export default function ScalpDesk({desk,now=Date.now(),children}:any){
  const [horizon,setHorizon]=useState<1|5>(1);
  const plan=desk.plans?.find((p:any)=>p.horizon===horizon);
  const lane=desk.ledger?.lanes?.find((x:any)=>x.horizon===horizon),current=lane?.current;
  const shown=current?.plan||plan;
  const stale=now-Number(desk.checkedAt)>15000;
  const expired=Boolean(current?.state==='ARMED'&&now>=Number(shown?.expiresAt));
  const status=stale?'التحديث متأخر':expired?'انتهت صلاحية الدخول':current?stateAr(current.state):plan?.status==='ARMED'?'إعداد قابل للتفعيل التجريبي':plan?.status==='BLOCKED'?'البيانات تمنع التفعيل':plan?.side==='WAIT'?'رصد السوق':'تكوّن فرصة';
  const directional=shown?.side==='BUY'||shown?.side==='SELL';
  const tone=stale||expired?'amber':shown?.side==='BUY'?'green':shown?.side==='SELL'?'red':'amber';
  const secs=shown&&directional?Math.max(0,Math.ceil(((current?.activatedAt?current.activatedAt+horizon*60000:shown.expiresAt)-now)/1000)):0;
  const stats=lane?.stats;
  return <section className={'panel scalp-desk ai-asset-card '+(shown?.side==='BUY'?'ai-buy':shown?.side==='SELL'?'ai-sell':'ai-wait')}>
    <div className="scalp-desk-head">
      <div><span className="eyebrow">{desk.asset==='GOLD'?'XAU / USD':'BTC / USD'} · SCALP ENGINE</span><h2>رادار فرص السوق</h2></div>
      <div className="scalp-quote"><b dir="ltr">{fmt(desk.quote?.price)}</b><small>{desk.quote?.at!=null&&now-desk.quote.at<=15000?'سعر حديث':'السعر متأخر'}</small></div>
    </div>
    <div className="scalp-frame-tabs" role="tablist" aria-label="فريم السكالب">
      {([1,5] as const).map(h=>{const p=desk.plans?.find((x:any)=>x.horizon===h),c=desk.ledger?.lanes?.find((x:any)=>x.horizon===h)?.current;return <button key={h} id={'scalp-tab-'+desk.asset+'-'+h} type="button" role="tab" aria-selected={horizon===h} aria-controls={'scalp-panel-'+desk.asset} onClick={()=>setHorizon(h)} className={horizon===h?'selected':''}><strong>{h===1?'دقيقة واحدة':'خمس دقائق'} <span dir="ltr">M{h}</span></strong><small>{c?stateAr(c.state):p?.status==='BLOCKED'?'بيانات غير جاهزة':p?.side==='WAIT'?'رصد السوق':sideAr(p?.side)+' · '+setupAr(p?.setup)}</small></button>;})}
    </div>
    <div id={'scalp-panel-'+desk.asset} role="tabpanel" aria-labelledby={'scalp-tab-'+desk.asset+'-'+horizon}>
      <div className="scalp-decision">
        <div className={'scalp-direction '+tone}>{shown?.side==='BUY'?<ArrowUpRight size={34}/>:shown?.side==='SELL'?<ArrowDownRight size={34}/>:<Activity size={30}/>}<div><strong>{directional?sideAr(shown.side)+' · '+setupAr(shown.setup):'نبحث عن الإعداد التالي'}</strong><span>{status}</span></div></div>
        <div className="scalp-score"><b>{shown?.score||0}<small>/100</small></b><span>قوة الإعداد</span></div>
      </div>
      <div className="scalp-levels">
        <div><small>الدخول المشروط</small><b dir="ltr">{fmt(shown?.entry)}</b></div>
        <div className="stop"><small>وقف الخسارة</small><b dir="ltr">{fmt(shown?.stop)}</b></div>
        {[0,1,2].map(j=><div key={j}><small><Target size={12}/> T{j+1}{j===0?' · الأول':''}</small><b dir="ltr">{fmt(shown?.targets?.[j]?.price)}</b><span>{shown?.targets?.[j]?shown.targets[j].kind==='STRUCTURE'?'مستوى سعري':'امتداد تقديري':'بانتظار إعداد'}</span></div>)}
      </div>
      <div className="scalp-condition"><strong>{stale?'لا تعتمد الإعداد حتى يعود تحديث حديث':current?.note||plan?.reason}</strong><span>{shown?.trigger}</span></div>
      <div className="scalp-facts">
        <div><small>العائد / المخاطرة بعد التكلفة</small><b>{fmt(shown?.netRR)} R</b></div>
        <div><small><Clock3 size={12}/> {current?.activatedAt?'متبقي للمتابعة':'صلاحية التفعيل'}</small><b>{secs?secs+' ثانية':shown?.entry!=null?'انتهت':'—'}</b></div>
        <div><small>تكلفة الدورة {shown?.costEstimated?'· تقديرية':''}</small><b>{fmt(shown?.cost)} $</b></div>
      </div>
      {!!plan?.blockers?.length&&!current&&<ul className="scalp-blockers">{plan.blockers.map((r:string)=><li key={r}>{r}</li>)}</ul>}
      <div className="scalp-evidence">{shown?.evidence?.map((e:any)=><div key={e.label}><small>{e.label}</small><b className={e.side==='BUY'?'green':e.side==='SELL'?'red':''}>{e.side==='WAIT'?e.value:sideAr(e.side)}</b><span>{e.side!=='WAIT'?e.value:''}</span></div>)}</div>
    </div>
    <div className="scalp-results"><div><span className="eyebrow">سجل هذا الفريم · تجريبي</span><h3>{stats?.samples?stats.samples+' صفقة موثقة':'بدأ سجل جديد للصفقات'}</h3></div><div className="scalp-results-grid"><div><small>صافي النتيجة</small><b className={Number(stats?.netR)>=0?'green':'red'}>{stats?.samples?fmt(stats.netR)+' R':'—'}</b></div><div><small>متوسط الصفقة</small><b>{stats?.samples?fmt(stats.expectancyR)+' R':'—'}</b></div><div><small>نسبة الربح</small><b>{stats?.samples?fmt(stats.winRate,1)+'%':'—'}</b></div></div><p>قوة الإعداد ليست احتمال نجاح. النتائج تحسب T1 أو الوقف أو انتهاء المدة بعد التكلفة. {stats?.unknown?stats.unknown+' نتيجة غير موثقة مستبعدة. ':''}{stats?.expired?stats.expired+' إعداد انتهى أو أُلغي قبل الدخول.':''}</p>
      {!!lane?.recent?.length&&<details><summary>آخر النتائج ({lane.recent.length})</summary><div className="scalp-history">{lane.recent.map((t:any)=><div key={t.plan.id}><time>{new Date(t.closedAt).toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'})}</time><span>{sideAr(t.plan.side)} · {stateAr(t.state)}</span><b className={Number(t.netR)>=0?'green':'red'}>{t.netR!=null?fmt(t.netR)+' R':'—'}</b></div>)}</div></details>}
    </div>
    <div className="scalp-source"><span>{desk.candleSource}</span><span>{desk.data?.m1AgeMs!=null?'آخر إغلاق M1 منذ '+Math.max(0,Math.round(desk.data.m1AgeMs/1000))+'ث':'شموع M1 غير متاحة'}</span><span>مرجع سعري؛ لم تُنفذ صفقة وسيط</span>{!desk.ledger?.persisted&&<span className="amber">حفظ السجل الدائم غير متاح</span>}</div>
    {children&&<details className="scalp-context"><summary>الاتجاه العام وتوقع 15 دقيقة</summary>{children}</details>}
  </section>;
}
