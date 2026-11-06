'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowRight,Clock3,RefreshCw,ShieldAlert} from 'lucide-react';
import ScalpDesk from '../../components/ScalpDesk';

function GoldLeadAudit({audit}:{audit:any}){
  if(!audit)return <section className="panel" aria-label="قياس اقتناص الذهب" style={{padding:16}}>
    <strong>قياس الاقتناص · الذهب</strong>
    <p>لم تبدأ عينة التوقيت بعد. لا توجد نسبة نجاح يمكن اعتمادها.</p>
  </section>;
  const lanes=[{key:'m1',name:'M1 · 60 ثانية'},{key:'m5',name:'M5 · 5 دقائق'}];
  return <section className="panel" aria-label="قياس اقتناص الذهب" style={{padding:16,marginBottom:14}}>
    <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:10,alignItems:'center'}}>
      <strong>قياس اقتناص الحركة · الذهب</strong>
      <span style={{fontSize:12,opacity:.76}}>مراقبة الاتجاه بعد الإشارة · ليست صفقات أو نسبة ربح</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(215px,1fr))',gap:12,marginTop:12}}>
      {lanes.map(({key,name})=>{
        const a=audit[key]||{},seen=Number(a.resolved||0);
        const sources=Object.keys(a.bySource||{});
        const exnessOnly=sources.length>0&&sources.every(s=>s.startsWith('Exness/MT5'));
        return <article key={key} style={{padding:14,border:'1px solid var(--border, rgba(160,165,180,.25))',borderRadius:12}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
            <strong>{name}</strong>
            <span style={{fontSize:12,opacity:.76}}>{a.pending?'رصد جارٍ':'رصد فقط'}</span>
          </div>
          <p style={{margin:'10px 0',fontSize:21,fontWeight:750}}>
            {seen>0?String(a.observedFavorablePct)+'%':'لا توجد عينة مكتملة'}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            حركة مؤيدة {a.favorableFirst||0} · عكسية {a.adverseFirst||0} · بلا حسم {a.noThreshold||0} · مجهولة {a.unknown||0}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            تحضير مبكر 55–69: {a.earlyWatchCohort?.total??0} حالة مرصودة
            {' · '}مؤيدة {a.earlyWatchCohort?.favorable??0} · عكسية {a.earlyWatchCohort?.adverse??0}
            {' · '}مجهولة {a.earlyWatchCohort?.unknown??0}
          </p>
          <p style={{fontSize:12,opacity:.82,margin:'5px 0'}}>
            زمن الحركة المؤيدة: {a.meanTimeToFavorableMs!=null?
              (Number(a.meanTimeToFavorableMs)/1000).toFixed(1)+' ثانية':'غير متاح'}
          </p>
          {!a.persisted&&<p style={{fontSize:12,margin:'6px 0',opacity:.85}}>
            {a.storage==='EPHEMERAL'?
              'الرصد محفوظ مؤقتًا داخل التشغيل الحالي؛ إعادة إنشاء Render تمسح السجل':
              'الرصد غير محفوظ على تخزين دائم؛ النتائج قد تضيع عند إعادة التشغيل'}
          </p>}
          <p style={{fontSize:12,opacity:.72,margin:'5px 0'}}>
            المصدر: {sources.length?(exnessOnly?'Exness/MT5':'أسعار مرجعية / مصدر مختلط'):'قيد الانتظار'}
            {' · '}{seen<50?'عينة غير كافية':'نتائج رصد فقط'}
          </p>
        </article>;
      })}
    </div>
    <p style={{margin:'10px 0 0',fontSize:12,opacity:.76}}>
      معدل الحركة المؤيدة يُحسب من أول حركة سعرية مرصودة بعد الإشارة، ولا يشمل الحالات المجهولة.
      لا يثبت الدخول قبل صناع السوق أو الربحية. قياس Ambush على أسعار Exness يبدأ بعد ربط MT5.
    </p>
  </section>;
}

function GoldQuickResults({gold}:{gold:any}){
  const lanes=([1,5] as const).map(h=>{
    const stats=gold?.ledger?.lanes?.find((x:any)=>x.horizon===h)?.stats;
    const proof=stats?.quickProof;
    return {h,proof,fast:Number(stats?.exitCauses?.quickTargets||0)};
  });
  return <section className="panel" aria-label="نتائج جني الربح السريع للذهب"
    style={{padding:16,marginBottom:14}}>
    <strong>قنص المكسب الصغير · خروج خلال دقيقة أو دقيقتين</strong>
    <p style={{fontSize:12,opacity:.78,margin:'7px 0'}}>
      الصافي بعد تكلفة تقديرية · رصد ورقي مش أرباح Exness. يشمل الربح والوقف وخروج الوقت.
    </p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>
      {lanes.map(({h,proof,fast})=><div key={h}
        style={{border:'1px solid var(--border, rgba(160,165,180,.25))',padding:12,borderRadius:10}}>
        <b>GOLD M{h}</b>
        <p style={{margin:'7px 0'}}>
          خروج سريع {fast} · عينة {proof?.samples??0}/50
        </p>
        <small>الصافي {proof?.samples&&Number.isFinite(proof.netR)?proof.netR+'R':'لم يبدأ الإثبات'}
          {' · '}{proof?.status==='POSITIVE_PAPER_SAMPLE'?'أدلة ورقية أولية':
            proof?.status==='NOT_VALIDATED'?'لم تثبت الأفضلية':'جمع نتائج'}
        </small>
      </div>)}
    </div>
  </section>;
}

function GoldEveryCandle({data}:{data:any}){
  const latest=data?.latest;
  const stateLabel=(v:string)=>({
    AWAIT_QUOTE:'التوقع صادر · انتظار أول Bid/Ask بعد بداية الشمعة',
    CONFIRMING:'تأكيد اتجاه سريع من Bid/Ask · لم نضع Limit بعد',
    NO_EDGE:'توقع بلا تأكيد كافي · بلا Limit أو صفقة',
    NO_BID_ASK:'الدقيقة انتهت بدون أسعار Bid/Ask موثوقة',
    COST_UNVIABLE:'التكلفة أكبر من الحركة المرجحة · بدون Limit',
    PENDING:'LIMIT معلّق · مستني لمس السعر',
    ACTIVE:'تم لمس LIMIT ورقي · متابعة الخروج',
    QUICK_TP:'هدف مكسب صغير مرصود',
    STOP:'وقف مرصود',
    TIME_EXIT:'خروج وقت',
    EXPIRED:'انتهى LIMIT دون لمس',
    UNKNOWN:'نتيجة مجهولة'
  } as Record<string,string>)[v]||'بانتظار أول شمعة';
  const fmt=(x:any)=>Number.isFinite(Number(x))&&x!=null?
    Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  return <section className="panel" aria-label="قنص كل شمعة M1 ورقي"
    style={{padding:16,marginBottom:14}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <strong>كل شمعة M1 · Limit قريب وسلبي V6 · ثم لمس موثّق</strong>
      <span style={{fontSize:12,opacity:.82}}>ورقي بحثي فقط · لا ينفّذ على Exness</span>
    </div>
    <p style={{fontSize:12,opacity:.80,margin:'8px 0'}}>
      توقع لكل دقيقة مؤهلة؛ LIMIT قريب من Bid/Ask الحالي بدل انتظار منتصف جسم الشمعة السابقة.
      السعر ثابت لحظة إصدار الأمر وغير قابل للتنفيذ كسعر Market.
      الصافي النظري المستهدف ≥0.55R بعد تكلفة إضافية تقديرية؛ الاقتراب قد يزيد الدخول العكسي والخسائر. التوقعات الضعيفة بتحتاج
      تيكًا جديدًا يؤيد الاتجاه خلال 24 ثانية؛ مش هنستنى شمعة تانية.
      أي فرصة لا تصلح للتنفيذ
      تفضل متسجلة كتوقع، من غير تزوير دخول أو نجاح. مفيش ضمان للربح.
    </p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'8px 0 12px',fontSize:12}}>
      <span>توقعات محفوظة {data?.proposals??0}</span>
      <span>أوامر LIMIT اتجهزت {data?.limitsIssued??0}</span>
      <span>في انتظار أول سعر {data?.awaitingQuote??0}</span>
      <span>تأكيد تيكات جارٍ {data?.confirming??0}</span>
      <span>تأكيدات ناجحة {data?.tickConfirmed??0}</span>
      <span>بلا أفضلية قبل Limit {data?.noEdge??0}</span>
      <span>دقائق فاتت بلا رصد {data?.missedMinutes??0}</span>
      <span>فرص مكلفة متروكة {data?.costUnviable??0}</span>
      <span>توقعات ضعيفة {data?.weakCount??0}</span>
      <span>أوامر LIMIT لسه معلقة {data?.pending??0}</span>
      <span>دخول LIMIT ورقي مرصود {data?.filled??0}</span>
      <span>مكاسب صغيرة {data?.quickWins??0}</span>
      <span>وقف {data?.stops??0}</span>
      <span>انتهت {data?.expired??0}</span>
      <span>مجهولة {data?.unknown??0}</span>
      <span>انعكاسات سيولة {data?.reversalSetups??0}</span>
      <span>عينات قديمة منفصلة {data?.legacyResults??0}</span>
      <span>V6 نتائج LIMIT محسومة {data?.resolved??0}</span>
      <span>V6 نجاح الصفقات الورقية {data?.observedWinPct!=null?data.observedWinPct+'%':'لا توجد عينة'}</span>
      <span>V5 السابق: {data?.priorV5?.resolved??0} صفقة / {data?.priorV5?.netR??0}R (فترة مختلفة)</span>
      <span>إجمالي النسخ الأقدم: {data?.legacyResults??0} صفقة / {data?.legacyNetR??0}R (منفصلة)</span>
      <span>رفض قمة/قاع: {data?.byPattern?.reversal?.resolved??0} نتيجة / صافي {data?.byPattern?.reversal?.netR??0}R</span>
      <span>متابعة زخم: {data?.byPattern?.momentum?.resolved??0} نتيجة / صافي {data?.byPattern?.momentum?.netR??0}R</span>
    </div>
    <div style={{padding:'12px',margin:'10px 0',borderRadius:10,
      border:'1px solid var(--border, rgba(160,165,180,.25))'}}>
      <strong>التعلّم الحي من الشموع · نتيجة تأتي بعد التوقع</strong>
      <p style={{fontSize:13,margin:'6px 0'}}>
        {data?.forwardDirection?.hits??0} صحيح من {data?.forwardDirection?.graded??0} توقع
        مكتمل بعد صدوره · أخطاء {data?.forwardDirection?.misses??0}
        {' · '}مجهول {data?.forwardDirection?.unknown??0}
        {' · '}بانتظار الإغلاق {data?.forwardDirection?.waiting??0}
        {' · '}محايد {data?.forwardDirection?.flat??0}
      </p>
      <p style={{fontSize:12,margin:'6px 0'}}>
        <strong>مقارنة حقيقية مع اتجاه آخر شمعة مغلقة:</strong>
        {' '}القناص {data?.forwardDirection?.pairedBaseline?.modelHits??0} صحيح،
        {' '}والتوقع البسيط {data?.forwardDirection?.pairedBaseline?.baselineHits??0} صحيح
        {' '}على نفس {data?.forwardDirection?.pairedBaseline?.n??0} شمعة.
        {' '}فرق الدقة {data?.forwardDirection?.pairedBaseline?.liftPctPoints??'—'} نقطة مئوية.
        {' '}الحكم: {data?.forwardDirection?.pairedBaseline?.status==='FORWARD_EDGE_CANDIDATE'?
          'تحسّن أمامي مبدئي يحتاج تحقق أطول':
          data?.forwardDirection?.pairedBaseline?.status==='NO_DEMONSTRATED_EDGE'?
            'لم يثبت تفوق على المقارنة':'ما زلنا نجمع النتائج'}.
        {' '}لا نحسب الشموع المحايدة أو النتائج المجهولة نجاحًا.
      </p>
      <p style={{fontSize:12,margin:'6px 0'}}>
        توقعات ضعيفة: {data?.learning?.byEvidence?.weak?.hits??0} صحيح من
        {' '}{data?.learning?.byEvidence?.weak?.graded??0}
        {' · '}توقعات أقوى نسبيًا:
        {' '}{data?.learning?.byEvidence?.candidate?.hits??0} من
        {' '}{data?.learning?.byEvidence?.candidate?.graded??0}
        {' · '}قلب اتجاه متعلم {data?.learning?.switched??0}
      </p>
      <p style={{fontSize:12,margin:'6px 0',opacity:.8}}>
        المحرك بيسجل التوقع قبل كل شمعة ويقيم الإغلاق بعدها. لازم 24 توقعًا تدريبيًا
        و12 توقعًا لاحقًا من نفس نوع الحالة قبل السماح بتغيير اتجاه تلقائي.
        الحالات المجهولة والتوقعات الضعيفة ظاهرة، ومش محسوبة كمكاسب.
      </p>
      <p style={{fontSize:12,margin:'6px 0',opacity:.85}}>
        نموذج عكسي منافس (تجريبي فقط): اقترح {data?.learning?.shadowExpert?.proposedFlips??0} انعكاسًا
        {' · '}مقارنات مغلقة {data?.learning?.shadowExpert?.flipped?.graded??0}
        {' · '}المنافس أصاب {data?.learning?.shadowExpert?.flipped?.shadowHits??0}
        {' '}مقابل {data?.learning?.shadowExpert?.flipped?.liveHits??0} للمحرك الحالي على نفس الشموع.
        يتعلم من 8 نتائج تدريب و8 مراجعة من نفس النمط، ويسجل قراره قبل الشمعة.
        لا يغيّر الدخول أو توقع الشاشة قبل إثبات مستقل على شموع جديدة.
      </p>
      <p style={{fontSize:12,margin:'6px 0',opacity:.85}}>
        تجربة خروج مبكر بعد مهلة 3 ثوان وتيكين عكسيين متتاليين:
        {' '}{data?.learning?.fastExitShadow?.earlyExits??0} خروج افتراضي من
        {' '}{data?.learning?.fastExitShadow?.compared??0} صفقة LIMIT ورقية مكتملة جديدة.
        {' '}صافي مسار V6 الحالي {data?.learning?.fastExitShadow?.baselineNetR??0}R
        {' · '}صافي التجربة الافتراضية {data?.learning?.fastExitShadow?.shadowNetR??0}R.
        نفس الصفقات ونفس تكلفة Bid/Ask التقديرية، بدون تعديل الوقف أو التنفيذ،
        ولا نزعم تقليل الخسارة قبل رصد نتائج كافية.
      </p>
      <p style={{fontSize:12,margin:'6px 0',opacity:.9}}>
        اختبار الدخول المبكر: نفس LIMIT القريب V6 لكن على أول Bid/Ask
        صالح خلال أول 12 ثانية، بدل انتظار تأكيد التيكات الضعيفة.
        {' '}توقعات {data?.learning?.nearLimitShadow?.issued??0}
        {' · '}أوامر مبكرة {data?.learning?.nearLimitShadow?.placed??0}
        {' · '}لمسات ورقية في تيكات لاحقة {data?.learning?.nearLimitShadow?.touched??0}
        {' · '}صفقات محسومة {data?.learning?.nearLimitShadow?.resolved??0}
        {' · '}صافي تجريبي بعد التكاليف {data?.learning?.nearLimitShadow?.netR??0}R
        {' · '}مجهول بسبب فجوات {data?.learning?.nearLimitShadow?.unknown??0}.
        {' '}وعلى الصفقات اللي اكتملت عند الجانبين فقط:
        {' '}{data?.learning?.nearLimitShadow?.sameCohort?.resolved??0}
        {' '}صفقة · المبكر {data?.learning?.nearLimitShadow?.sameCohort?.nearNetR??0}R
        {' '}مقابل V6 {data?.learning?.nearLimitShadow?.sameCohort?.originalNetR??0}R.
        ده اختبار ورقي غير منفذ على Exness، ولا يتحول لـMarket،
        وقد يزيد الدخول الخاسر؛ ما نغيّرش سياسة V6 قبل دليل كافي.
      </p>
    </div>
    <div style={{padding:12,margin:'10px 0',borderRadius:10,
      border:'1px solid var(--border, rgba(160,165,180,.25))'}}
      aria-label="تقييم مبكر للتيكات دون تغيير التوقع الأصلي">
      <strong>مختبر أول 20 ثانية · هل قراءة التيكات تحسّن الاتجاه؟</strong>
      <p style={{fontSize:12,margin:'6px 0'}}>
        توقعات جديدة {data?.forwardPulse?.issued??0}
        {' · '}تيكان موثوقان {data?.forwardPulse?.sampled??0}
        {' · '}إشارات مبكرة مجمّدة {data?.forwardPulse?.earlySignals??0}
        {' · '}بلا إشارة قابلة للمقارنة {data?.forwardPulse?.insufficient??0}
      </p>
      <p style={{fontSize:12,margin:'6px 0'}}>
        من نفس {data?.forwardPulse?.graded??0} شمعة أغلقت:
        {' '}قراءة التيكات أصابت {data?.forwardPulse?.earlyHits??0}
        {' · '}التوقع الأصلي أصاب {data?.forwardPulse?.originalHits??0}
        {' · '}مجهول {data?.forwardPulse?.unknown??0}
        {' · '}محايد {data?.forwardPulse?.flat??0}
        {' · '}بانتظار الإغلاق {data?.forwardPulse?.waiting??0}
      </p>
      <p style={{fontSize:12,margin:'6px 0',opacity:.8}}>
        لما التيكات وافقت توقع البداية:
        {' '}{data?.forwardPulse?.agree?.earlyHits??0} من
        {' '}{data?.forwardPulse?.agree?.graded??0}.
        {' '}ولما عارضته:
        {' '}{data?.forwardPulse?.counter?.earlyHits??0} من
        {' '}{data?.forwardPulse?.counter?.graded??0}.
        {' '}دي مقارنة اتجاه فقط، مش أرباح أو إشارة تداول حقيقي.
        ولا نعتبرها تحسنًا مثبتًا من غير عينة مستقلة كافية.
      </p>
    </div>
    {latest?<div style={{border:'1px solid var(--border, rgba(160,165,180,.25))',
      padding:12,borderRadius:10}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <b>{latest.side==='BUY'?'↑ توقع صعود / BUY LIMIT':'↓ توقع هبوط / SELL LIMIT'}</b>
        <small>{latest.weak?'ضعيف · تجريبي فقط':'مرشح بحثي · لم تثبت ربحيته'}
          {' · '}{latest.pressure}/100 مش نسبة نجاح
          {' · '}{latest.pattern==='SWEEP_REJECTION'?'رفض كسر سيولة':'متابعة زخم'}
          {' · '}{latest.onlineModel==='ONLINE_INVERSION'?'اتجاه تغيّر بتعلم أمامي':
            'الترجيح الأساسي'}</small>
      </div>
      <p style={{margin:'6px 0',fontSize:13}}>
        دخول {fmt(latest.entry)} · هدف {fmt(latest.tp)} · وقف {fmt(latest.stop)}
        {latest.targetNetR!=null?' · عائد نظري '+latest.targetNetR+'R':''}
      </p>
      <small>{stateLabel(latest.state)} · {latest.note}</small>
      {latest.state==='CONFIRMING'&&<small style={{display:'block',marginTop:5}}>
        مفيش أمر Limit لحد ما حركة سعر جديدة تأكد التوقع الضعيف؛ الضغط {latest.pressure}/100
      </small>}
      <small style={{display:'block',marginTop:6}}>
        {latest.pulse?.firstSide?
          'أول إشارة تيكات مسجلة خلال الدقيقة: '+(latest.pulse.firstSide==='BUY'?'صعود':'هبوط')+
          (latest.pulse.firstAgree?' · مع التوقع':' · عكس التوقع')+
          ' · لا تغير الدخول ولا النتيجة':'لا توجد إشارة تيكات مبكرة مجمدة لهذه الدقيقة'}
      </small>
      <small style={{display:'block',marginTop:6}}>
        {latest.directionObserved==='BUY'||latest.directionObserved==='SELL'?
          'نتيجة توقع الشمعة بعد إغلاقها: '+(latest.side===latest.directionObserved?'✓ صحيح':'✗ خطأ'):
          latest.directionObserved==='UNKNOWN'?'نتيجة الاتجاه مجهولة بسبب فجوة/تغيير مصدر':
          latest.directionObserved==='FLAT'?'إغلاق محايد':
          'توقع هذه الشمعة لم يُحسم بعد'}
        {' · '}التعلم السابق {latest.onlineDecision?.priorGraded??0} شمعة صالحة من نفس الحالة
      </small>
    </div>:<p>بانتظار شمعة M1 مكتملة جديدة وسعر مرجعي حديث.</p>}
    {Array.isArray(data?.recent)&&data.recent.length>1&&
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,fontSize:12}}>
        {data.recent.slice(1,7).map((t:any)=>
          <span key={t.id} style={{padding:'5px 8px',borderRadius:6,
            border:'1px solid var(--border, rgba(160,165,180,.25))'}}>
            {t.side==='BUY'?'↑':'↓'} {stateLabel(t.state)}
            {t.netR!=null?' · '+t.netR+'R':''}
          </span>)}
      </div>}
    <small style={{display:'block',opacity:.72,marginTop:10}}>
      {data?.storage==='VOLUME'?'النتائج محفوظة على قرص الخدمة':
       'تخزين مؤقت؛ إعادة إنشاء الخدمة قد تمسح النتائج'}.
      {' '}مجموع الصافي الورقي {fmt(data?.netR)}R،
      {' '}من {data?.resolved??0} نتيجة قابلة للحساب بعد تكلفة تقديرية،
      {' '}مش كل توقع أمر Limit، ومش كل Limit بيتنفّذ.
      القناص ما بيراقبش الشموع وقت نوم Render أو انقطاع الأسعار،
      والدقائق دي لا نحسبها نجاحًا،
      {' '}متوسط الصافي {data?.meanNetR!=null?fmt(data.meanNetR)+'R':'غير محسوب'}،
      {' '}العائد المستهدف مش نسبة نجاح. العائد الصافي المستهدف في
      إعداد V6 لا يقل نظريًا عن 0.55R لكل وحدة مخاطرة؛ ونقطة التعادل
      تختلف مع التنفيذ الفعلي وتوزيع الخسائر. وما نعتبرش V6 ناجحة
      إلا بعينة أمامية كبيرة صافيها موجب.
      {' '}مش دليل ربح حقيقي ولا نسبة نجاح معتمدة.
    </small>
  </section>;
}

export default function ScalpWorkspace(){
  const [desk,setDesk]=useState<any>(null);
  const [now,setNow]=useState(Date.now());
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [asset,setAsset]=useState<'ALL'|'GOLD'|'BTC'>('GOLD');
  const assetRef=useRef<'ALL'|'GOLD'|'BTC'>('GOLD');
  assetRef.current=asset;
  const inFlight=useRef(false);
  const load=async()=>{
    if(inFlight.current)return;
    inFlight.current=true;
    setLoading(true);
    try{
      const requestedAsset=assetRef.current;
      const r=await fetch('/api/scalp?asset='+(requestedAsset==='GOLD'?'GOLD':'ALL')+'&ts='+Date.now(),{
        cache:'no-store',headers:{'X-Qannas-Viewer':'1'},
        signal:AbortSignal.timeout(12000)
      });
      const result=await r.json();
      if(!r.ok||!result?.ok)throw Error(result?.message||'تعذر تحديث السكالب');
      // Do not overwrite a switched-to-ALL view with an older GOLD-only answer.
      if(requestedAsset===assetRef.current)setDesk(result);
      setError('');
    }catch(e){
      setError(e instanceof Error?e.message:'تعذر الاتصال');
    }finally{inFlight.current=false;setLoading(false);}
  };
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(document.visibilityState==='visible')await load();
      if(active)timer=setTimeout(poll,2500);
    };
    void poll();
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{active=false;clearTimeout(timer);clearInterval(clock)};
  },[]);
  const age=desk?.checkedAt!=null?Math.max(0,Math.round((now-desk.checkedAt)/1000)):null;
  return <main className="shell modern-workspace scalp-workspace">
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">AG</div>
        <div><span>GOLD WATCH · DESKTOP DESK</span><strong>SCALP LAB</strong></div>
      </div>
      <div className="topbar-actions">
        <Link href="/" className="scalp-back-link"><ArrowRight size={16}/> رجوع للقناص</Link>
        <button type="button" className="refresh" onClick={()=>void load()} disabled={loading}>
          <RefreshCw size={16} className={loading?'spin':''}/> تحديث
        </button>
      </div>
    </header>
    <div className="scalp-lab-intro">
      <div><span className="eyebrow">SEPARATE WORKSPACE / M1 + M5</span>
        <h1>سكالب الثواني <span>· صفحة مستقلة</span></h1>
        <p>فرص وتجارب ورقية سريعة؛ محرك السكالب مستقل عن أهداف القناص الهيكلية.</p></div>
      <div className="scalp-lab-status">
        <Clock3 size={16}/><strong>{age==null?'جاري الاتصال':age<=15?'بيانات حديثة':'بيانات قديمة'}</strong>
        <span>{age==null?'—':age+' ثانية منذ آخر تحديث'}</span>
      </div>
    </div>
    <div className="workspace-toolbar scalp-lab-toolbar">
      <div className="asset-switch" role="group" aria-label="اختيار الأصل">
        {([{id:'ALL',label:'الكل'},{id:'GOLD',label:'الذهب'},{id:'BTC',label:'البيتكوين'}] as const)
          .map(item=><button key={item.id} aria-pressed={asset===item.id}
            onClick={()=>setAsset(item.id)} type="button">{item.label}</button>)}
      </div>
      <span className="scalp-paper-label"><ShieldAlert size={14}/> تجريبي فقط · غير متصل بأوامر MT5</span>
    </div>
    {error&&<div className="fatal"><ShieldAlert size={16}/><div><strong>الاتصال غير مستقر</strong>
      <span>{error} · لا تعتمد على الأسعار المعروضة قبل عودة البيانات الحديثة.</span></div></div>}
    {asset!=='BTC'&&<GoldEveryCandle data={desk?.gold?.everyCandle}/>}
    {asset!=='BTC'&&<GoldLeadAudit audit={desk?.gold?.leadAudit}/>}
    {asset!=='BTC'&&<GoldQuickResults gold={desk?.gold}/>}
    <section className="content lite-content" aria-label="منصة سكالب مستقلة">
      <div className={'dashboardgrid market-pair-grid '+(asset!=='ALL'?'single-asset':'')}>
        {asset!=='BTC'&&(desk?.gold?<ScalpDesk desk={desk.gold} now={now}/>:
          <div className="panel workspace-loading"><Activity size={16}/> جاري قراءة سكالب الذهب…</div>)}
        {asset!=='GOLD'&&(desk?.bitcoin?<ScalpDesk desk={desk.bitcoin} now={now}/>:
          <div className="panel workspace-loading"><Activity size={16}/> جاري قراءة سكالب البيتكوين…</div>)}
      </div>
    </section>
    <div className="scalp-lab-footer">
      <ShieldAlert size={16}/>
      إشارات السكالب هنا ورقية ولا تنفذ أوامر على Exness/MT5. الاتصال الآلي بالمنصة يحتاج إعدادات وتنفيذ منفصل على اللابتوب.
    </div>
    <footer><Link href="/">القناص بعيد المدى ←</Link> · Gold Watch Scalp Lab</footer>
  </main>;
}
