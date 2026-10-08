'use client';
import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Target} from 'lucide-react';

const fmt=(v:any,d=2)=>v!=null&&Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(s:string)=>s==='BUY'?'شراء':s==='SELL'?'بيع':'انتظار';
const setupAr=(s:string)=>s==='BREAKOUT'?'اختراق نطاق':s==='PULLBACK'?'إعادة اختبار':s==='SWEEP'?'سحب سيولة وانعكاس':s==='CONTINUATION'?'استمرار اتجاه مؤكد':'رصد إعداد جديد';
const stateAr=(s:string)=>({ARMED:'بانتظار التفعيل',ACTIVE:'متابعة تجريبية',TP1:'تحقق T1',STOP:'ضرب الوقف',TIME_EXIT:'انتهت المدة',EXPIRED:'انتهت صلاحية الدخول',CANCELED:'أُلغي قبل الدخول',UNKNOWN:'نتيجة غير موثقة'} as Record<string,string>)[s]||'مراقبة';

export default function ScalpDesk({desk,now=Date.now()}:any){
  const [horizon,setHorizon]=useState<1|5>(5);
  const plan=desk.plans?.find((p:any)=>p.horizon===horizon);
  const lane=desk.ledger?.lanes?.find((x:any)=>x.horizon===horizon),current=lane?.current;
  const shown=current?.plan||plan;
  const stale=now-Number(desk.checkedAt)>15000;
  const expired=Boolean(current?.state==='ARMED'&&now>=Number(shown?.expiresAt));
  const status=stale?'التحديث متأخر':expired?'انتهت صلاحية الدخول':current?stateAr(current.state):plan?.status==='ARMED'?'فرصة قيد تأكيد الثبات':plan?.status==='BLOCKED'?'البيانات تمنع التفعيل':plan?.side==='WAIT'?'رصد السوق':'فرصة مشروطة · لم تتأكد';
  const directional=shown?.side==='BUY'||shown?.side==='SELL';
  const tone=stale||expired?'amber':shown?.side==='BUY'?'green':shown?.side==='SELL'?'red':'amber';
  const timed=Boolean(current&&(current.state==='ARMED'||current.state==='ACTIVE'));
  const liquidity=desk.liquidity,book=desk.orderBook;
  const bookFresh=Boolean(book?.ok&&book?.providers?.krakenDepth&&book.checkedAt&&now-book.checkedAt>=0&&now-book.checkedAt<=12000);
  const secs=shown&&directional&&timed?Math.max(0,Math.ceil(((current?.activatedAt?current.activatedAt+horizon*60000:shown.expiresAt)-now)/1000)):0;
  const stats=lane?.stats;
  const qualityGate=desk.qualityGates?.find((x:any)=>x.horizon===horizon);
  const entryCheck=desk.entryConfirmations?.find((x:any)=>x.horizon===horizon);
  const entryConfirmed=Boolean(!stale&&!expired&&entryCheck?.state==='ENTRY');
  const counting=Boolean(!stale&&entryCheck?.state==='HOLDING');
  const candleVerified=Boolean(!stale&&entryCheck?.state==='CONDITIONS_PENDING');
  return <section className={'panel scalp-desk ai-asset-card '+(shown?.side==='BUY'?'ai-buy':shown?.side==='SELL'?'ai-sell':'ai-wait')}>
    <div className="scalp-desk-head">
      <div><span className="eyebrow">توقيت الدخول · {desk.asset==='GOLD'?'الذهب':'البيتكوين'}</span><h2>فرص السكالب</h2></div>
      <span className={'scalp-feed-state '+(stale?'late':'')}>{stale?'بيانات متأخرة':'يتحدث تلقائيًا'}</span>
    </div>
    <div className="scalp-frame-tabs" role="tablist" aria-label="فريم السكالب">
      {([1,5] as const).map(h=>{const p=desk.plans?.find((x:any)=>x.horizon===h),c=desk.ledger?.lanes?.find((x:any)=>x.horizon===h)?.current,e=desk.entryConfirmations?.find((x:any)=>x.horizon===h);return <button key={h} id={'scalp-tab-'+desk.asset+'-'+h} type="button" role="tab" aria-selected={horizon===h} aria-controls={'scalp-panel-'+desk.asset} onClick={()=>setHorizon(h)} className={horizon===h?'selected':''}><strong>{h===1?'دقيقة واحدة':'خمس دقائق'} <span dir="ltr">M{h}</span></strong><small>{e?.state==='ENTRY'?'دخول مؤكد '+sideAr(e.side):c?stateAr(c.state):p?.status==='BLOCKED'?'بيانات غير جاهزة':p?.side==='WAIT'?'رصد السوق':sideAr(p?.side)+' · '+setupAr(p?.setup)}</small></button>;})}
    </div>
    <div id={'scalp-panel-'+desk.asset} role="tabpanel" aria-labelledby={'scalp-tab-'+desk.asset+'-'+horizon}>
      <div className={'scalp-entry-watch '+(entryConfirmed?'entry-confirmed':candleVerified?'entry-blocked':counting?'entry-counting':'')}>
        <div className="scalp-entry-status">
          <strong>{stale?'تأكيد الدخول متوقف: الأسعار متأخرة':
            entryConfirmed?'دخول '+sideAr(entryCheck.side)+' · ثبتت الدقيقة':
            candleVerified?'اكتمل ثبات الدقيقة · لا دخول':
            counting?'جارٍ تأكيد الثبات: '+entryCheck.heldSeconds+' / 60 ثانية':
            entryCheck?.state==='ACTIVE'?'صفقة تجريبية قيد المتابعة':
            'بانتظار ثبات دقيقة لتأكيد الدخول'}</strong>
          <span>{counting?'متبقي '+entryCheck.remainingSeconds+' ثانية':entryConfirmed?'تم تأكيد إغلاق M1':candleVerified?'شروط المخاطرة أو البيانات غير مكتملة':'تأكيد آلي مع كل تحديث'}</span>
        </div>
        <div className="scalp-entry-progress" aria-hidden="true"><span style={{width:(entryConfirmed||candleVerified?100:Math.max(0,Math.min(100,Number(entryCheck?.heldSeconds||0)/60*100)))+'%'}}/></div>
        {entryCheck?.trigger!=null&&<small>المستوى المرصود: <b dir="ltr">{fmt(entryCheck.trigger)}</b> · {entryCheck.side==='BUY'?'الثبات أعلاه للشراء':entryCheck.side==='SELL'?'الثبات أدناه للبيع':'انتظار الاتجاه'}</small>}
        {entryConfirmed&&<p className="scalp-entry-advice">سعر الدخول الورقي عند التأكيد <b dir="ltr">{fmt(entryCheck.entry)}</b> · الوقف <b dir="ltr">{fmt(entryCheck.stop)}</b> · T1 <b dir="ltr">{fmt(entryCheck.targets?.[0]?.price)}</b> · إشارة تحليلية وليست تنفيذًا تلقائيًا</p>}
        {candleVerified&&<p className="scalp-entry-advice">{entryCheck.reason}</p>}
      </div>
      <div className="scalp-decision">
        <div className={'scalp-direction '+tone}>{shown?.side==='BUY'?<ArrowUpRight size={34}/>:shown?.side==='SELL'?<ArrowDownRight size={34}/>:<Activity size={30}/>}<div><strong>{directional?sideAr(shown.side)+' · '+setupAr(shown.setup):'نبحث عن الإعداد التالي'}</strong><span>{status}</span></div></div>
        <div className="scalp-score"><b>{directional?shown?.score:'—'}{directional&&<small>/100</small>}</b><span>قوة الإعداد</span></div>
      </div>
      {directional&&<div className="scalp-levels">
        <div><small>{entryConfirmed?'دخول بعد التأكيد':'نقطة دخول محتملة'}</small><b dir="ltr">{fmt(shown?.entry)}</b></div>
        <div className="stop"><small>وقف الخسارة</small><b dir="ltr">{fmt(shown?.stop)}</b></div>
        {[0,1,2].map(j=><div key={j}><small><Target size={12}/> T{j+1}{j===0?' · الأول':''}</small><b dir="ltr">{fmt(shown?.targets?.[j]?.price)}</b><span>{shown?.targets?.[j]?shown.targets[j].kind==='STRUCTURE'?'مستوى سعري':'امتداد تقديري':'بانتظار إعداد'}</span></div>)}
      </div>
      }
      <div className="scalp-condition"><strong>{stale?'لا تعتمد الإعداد حتى يعود تحديث حديث':current?.note||plan?.reason}</strong><span>{shown?.trigger}</span></div>
      <div className="scalp-facts">
        <div><small>العائد / المخاطرة بعد التكلفة</small><b>{fmt(shown?.netRR)} R</b></div>
        <div><small><Clock3 size={12}/> {current?.activatedAt?'متبقي للمتابعة':'صلاحية التفعيل'}</small><b>{timed?(secs?secs+' ثانية':'انتهت'):'غير مفعّلة'}</b></div>
        <div><small>تكلفة الدورة {shown?.costEstimated?'· تقديرية':''}</small><b>{fmt(shown?.cost)} $</b></div>
      </div>
      {desk.asset==='BTC'&&shown?.costEstimated&&<p className="scalp-condition">رسوم البيتكوين والانزلاق تقديرية لمصدر الأسعار، وليست تكلفة Exness الفعلية. لن يعتبر النظام صفقة قابلة للتنفيذ حتى تسمح حسابات المخاطرة والعائد بالتكلفة المُستخدمة.</p>}
      {!!plan?.blockers?.length&&!current&&plan.blockers.length>1&&<details className="scalp-expand"><summary>شروط الدخول غير المكتملة ({plan.blockers.length})</summary><ul className="scalp-blockers">{plan.blockers.map((r:string)=><li key={r}>{r}</li>)}</ul></details>}
      {qualityGate?.blocked&&<p className="scalp-condition">حماية سجل السكالب التجريبي: {qualityGate.reason} · المتبقي {qualityGate.remainingSeconds} ثانية</p>}
      {!!shown?.evidence?.length&&<details className="scalp-expand"><summary>المؤشرات التي كوّنت الفرصة</summary><div className="scalp-evidence">{shown.evidence.map((e:any)=><div key={e.label}><small>{e.label}</small><b className={e.side==='BUY'?'green':e.side==='SELL'?'red':''}>{e.side==='WAIT'?e.value:sideAr(e.side)}</b><span>{e.side!=='WAIT'?e.value:''}</span></div>)}</div></details>}
    </div>
    {!current&&liquidity?.available&&!stale&&<details className="scalp-expand"><summary>سيناريوهات سعرية بديلة · للمراقبة فقط</summary><div className="scalp-motion" aria-label="أهداف الحركة المحتملة">
      <div className="scalp-liquidity-title"><strong>أهداف الحركة المحتملة · M{horizon}</strong><small>تتحدث مع السعر · الميل اللحظي {liquidity.pressure==='WAIT'?'متوازن':sideAr(liquidity.pressure)}</small></div>
      <p>سيناريوهات رصد مشروطة بإغلاق M1؛ أهداف الصفقة تتثبت عند تفعيل إعداد الدخول.</p>
      <div className="scalp-motion-paths">{liquidity.scenarios?.find((s:any)=>s.horizon===horizon)?.paths.map((s:any)=><div key={s.side} className="scalp-motion-path">
        <strong className={s.side==='BUY'?'green':'red'}>{s.side==='BUY'?'مسار الصعود':'مسار الهبوط'}</strong>
        <small>الثبات لمدة دقيقة {s.side==='BUY'?'فوق':'تحت'} <b dir="ltr">{fmt(s.trigger)}</b> · {s.confirmation?.state==='CONFIRMED'?'تحقق شرط الثبات':s.confirmation?.state==='HOLDING'?s.confirmation.heldSeconds+' / 60 ثانية':'بانتظار عبور المستوى'}</small>
        <div className="scalp-motion-targets">{s.targets.map((t:any,i:number)=><div key={i}><small>T{i+1}</small><b dir="ltr">{fmt(t.price)}</b><small>{t.kind==='STRUCTURE'?'مستوى سيولة':'امتداد تقديري'}</small></div>)}</div>
        <small>إبطال المسار {s.side==='BUY'?'تحت':'فوق'} <b dir="ltr">{fmt(s.invalidation)}</b></small>
      </div>)}</div>
    </div></details>}
    <details className="scalp-expand"><summary>خريطة السيولة ومصادر البيانات <span>{liquidity?.available&&!stale?'· قراءة متاحة':'· بيانات غير مكتملة'}</span></summary><div className="scalp-liquidity" aria-label="قراءة السيولة الحية">
      <div className="scalp-liquidity-title"><strong>خريطة السيولة · قراءة مستمرة</strong><small>{stale?'التحديث متأخر':liquidity?.available?'قراءة حديثة':'بيانات غير كافية'} · {new Date(desk.checkedAt).toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></div>
      <p>{liquidity?.reason||'جارٍ تحميل قراءة السيولة'}</p>
      {liquidity?.available&&<>
        <div className="scalp-liquidity-grid"><div><small>قمة نطاق 20 دقيقة</small><b dir="ltr">{fmt(liquidity.rangeHigh)}</b></div><div><small>قاع نطاق 20 دقيقة</small><b dir="ltr">{fmt(liquidity.rangeLow)}</b></div><div><small>الحركة منذ آخر إغلاق</small><b className={liquidity.pressure==='BUY'?'green':liquidity.pressure==='SELL'?'red':''}>{liquidity.pressure==='WAIT'?'متوازنة':sideAr(liquidity.pressure)} <span dir="ltr">{fmt(liquidity.move)}</span></b></div></div>
        <div className="scalp-pools">{liquidity.levels?.map((l:any,i:number)=><div key={i}><span>{l.side==='ABOVE'?'سيولة فوق قمة':'سيولة تحت قاع'}{l.touches>1?' · قمم/قيعان متقاربة':''}</span><b dir="ltr">{fmt(l.price)}</b><small>المسافة {fmt(l.distance)}</small></div>)}</div>
        <p>{liquidity.sweeps?.length?'آخر سحب مؤكد بإغلاق: '+liquidity.sweeps.map((s:any)=>(s.side==='BUY'?'سحب قاع واستعادة':'سحب قمة ورفض')+' '+fmt(s.level)+' · '+new Date(s.at).toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'})).join(' / '):'لم يُرصد سحب مؤكد في آخر 6 شموع؛ مراقبة الاقتراب والاختراق مستمرة.'}</p>
        <small>{liquidity.note}</small>
      </>}
      {desk.asset==='BTC'?<div className="scalp-book"><strong>دفتر أوامر Kraken · 25 مستوى</strong>{bookFresh?<div className="scalp-liquidity-grid"><div><small>طلبات الشراء · USD</small><b dir="ltr">{fmt(book.book.bidDepthUsd,0)}</b></div><div><small>عروض البيع · USD</small><b dir="ltr">{fmt(book.book.askDepthUsd,0)}</b></div><div><small>اختلال العمق المرجّح</small><b dir="ltr">{fmt(book.book.depthImbalance,0)}%</b></div></div>:<p>دفتر الأوامر غير متاح أو متأخر؛ خريطة السعر مستقلة عنه.</p>}<small>لقطة أوامر قابلة للتغيير والإلغاء؛ ليست ضمان اتجاه أو حجم صفقات منفذة.</small></div>:<div className="scalp-book"><small>الذهب: المصدر لا يوفر دفتر أوامر أو حجم تداول موثوق؛ قراءة السيولة هنا من حركة السعر.</small></div>}
    </div></details>
    <div className="scalp-paper-brief"><span>متابعة الصفقات التجريبية</span><strong>{stats?.samples?stats.samples+' نتيجة · متوسط '+fmt(stats.expectancyR)+'R':'جمع نتائج الأداء الفعلي'}</strong></div>
    <details className="scalp-expand"><summary>نتائج السكالب التفصيلية</summary>
    <div className="scalp-results"><div><span className="eyebrow">سجل هذا الفريم · تجريبي</span><h3>{stats?.samples?stats.samples+' صفقة موثقة':'بدأ سجل جديد للصفقات'}</h3></div><div className="scalp-results-grid"><div><small>صافي النتيجة</small><b className={Number(stats?.netR)>=0?'green':'red'}>{stats?.samples?fmt(stats.netR)+' R':'—'}</b></div><div><small>متوسط الصفقة</small><b>{stats?.samples?fmt(stats.expectancyR)+' R':'—'}</b></div><div><small>نسبة الربح</small><b>{stats?.samples?fmt(stats.winRate,1)+'%':'—'}</b></div></div><p>قوة الإعداد ليست احتمال نجاح. النتائج تحسب T1 أو الوقف أو انتهاء المدة بعد التكلفة. {stats?.unknown?stats.unknown+' نتيجة غير موثقة مستبعدة. ':''}{stats?.expired?stats.expired+' إعداد انتهى أو أُلغي قبل الدخول.':''}</p>
      {!!lane?.recent?.length&&<details><summary>آخر النتائج ({lane.recent.length})</summary><div className="scalp-history">{lane.recent.map((t:any)=><div key={t.plan.id}><time>{new Date(t.closedAt).toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'})}</time><span>{sideAr(t.plan.side)} · {stateAr(t.state)}</span><b className={Number(t.netR)>=0?'green':'red'}>{t.netR!=null?fmt(t.netR)+' R':'—'}</b></div>)}</div></details>}
    </div></details>
    <div className="scalp-source"><span>{desk.candleSource}</span><span>{desk.data?.m1AgeMs!=null?'آخر إغلاق M1 منذ '+Math.max(0,Math.round(desk.data.m1AgeMs/1000))+'ث':'شموع M1 غير متاحة'}</span><span>مرجع سعري؛ لم تُنفذ صفقة وسيط</span>{!desk.ledger?.persisted&&<span className="amber">حفظ السجل الدائم غير متاح</span>}</div>
  </section>;
}
