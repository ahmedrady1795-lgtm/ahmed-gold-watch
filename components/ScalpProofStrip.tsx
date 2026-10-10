'use client';

// Trading results, never a model confidence score or a promise of future profit.
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null;
const r=(v:number|null,d=2)=>v==null?'—':(v>0?'+':'')+v.toFixed(d)+'R';
type Proof={status?:string;samples?:number;requiredSamples?:number;netR?:number;
  expectancyR?:number;lower95MeanR?:number|null;profitFactor?:number|null;maxDrawdownR?:number};
type Stat={samples?:number;wins?:number;netR?:number;expectancyR?:number;
  validation?:string;forwardProof?:Proof;retestProof?:Proof};
type SetupStat={setup:string;samples:number;wins:number;netR:number;
  expectancyR:number|null;timeExits:number;negativeTimeExits:number;stops:number;targets:number};
type Lane={horizon?:number;stats?:Stat&{setupBreakdown?:SetupStat[]}};
function Outcome({asset,label,desk,horizon}:{asset:string;label:string;desk:any;horizon:1|5}){
  const lane=(desk?.ledger?.lanes as Lane[]|undefined)?.find(x=>x.horizon===horizon);
  const stats=lane?.stats;
  const count=Math.max(0,Number(stats?.samples||0));
  const wins=Math.max(0,Number(stats?.wins||0));
  const net=number(stats?.netR);
  const average=number(stats?.expectancyR);
  const validated=stats?.forwardProof?.status==='POSITIVE_PAPER_SAMPLE';
  const completed=stats?.forwardProof?.status==='NOT_VALIDATED';
  const proofN=Math.max(0,Number(stats?.forwardProof?.samples||0));
  const required=Math.max(50,Number(stats?.forwardProof?.requiredSamples||50));
  const retest=horizon===5?stats?.retestProof:null;
  return <div className="proof-outcome">
    <div className="proof-outcome-head"><b>{label} M{horizon}</b>
      <small className={'pill '+(validated?'ok':'neutral')}>
        {validated?'إثبات ورقي أولي':completed?'النتيجة غير مؤهلة':'جمع إثبات جديد'}
      </small>
    </div>
    <div className="proof-outcome-numbers">
      <span><small>الصفقات</small><strong>{count}</strong></span>
      <span><small>الرابحة</small><strong>{count?wins+'/'+count:'—'}</strong></span>
      <span><small>الصافي</small><strong className={net!=null&&net<0?'red':net!=null&&net>0?'green':'muted'}>{count?r(net):'—'}</strong></span>
      <span><small>المتوسط</small><strong className={average!=null&&average<0?'red':average!=null&&average>0?'green':'muted'}>{count?r(average,3):'—'}</strong></span>
    </div>
    <small className="proof-outcome-meta">
      اختبار بعد التحديث {proofN}/{required} صفقة
      {proofN&&stats?.forwardProof?.lower95MeanR!=null
        ?' · الحد الأدنى التقديري للمتوسط '+r(stats.forwardProof.lower95MeanR,3):''}
    </small>
    {retest&&<div className="proof-retest">
      <b>إعادة اختبار الاختراق M5 · استراتيجية منفصلة</b>
      <span>{Math.max(0,Number(retest.samples||0))}/
        {Math.max(50,Number(retest.requiredSamples||50))} صفقة ورقية جديدة
        · الصافي {retest.samples?r(number(retest.netR)):'لسه مفيش نتائج'}
        · {retest.status==='POSITIVE_PAPER_SAMPLE'?'أداء ورقي موجب مبدئيًا':
          retest.status==='NOT_VALIDATED'?'لم تحقق شروط الإثبات':'تحت الاختبار'}
      </span>
    </div>}
    {asset==='GOLD'&&horizon===1&&count>=5&&average!=null&&average<0&&
      <small className="proof-outcome-warning">أداء الدقيقة سلبي؛ مفيش أفضلية ربح مثبتة.</small>}
  </div>;
}
export default function ScalpProofStrip({desk}:{desk:any}){
  return <section id="trade-performance" className="panel proof-board" aria-label="نتائج الصفقات الورقية">
    <div className="panelhead"><div><span className="eyebrow">دليل الأداء</span>
      <h2>النتائج بعد التكلفة</h2></div>
      <span className="pill">ورقي فقط · لا أوامر وسيط</span>
    </div>
    <div className="proof-outcome-grid">
      <Outcome asset="GOLD" label="الذهب" desk={desk?.gold} horizon={1}/>
      <Outcome asset="GOLD" label="الذهب" desk={desk?.gold} horizon={5}/>
      <Outcome asset="BTC" label="البيتكوين" desk={desk?.bitcoin} horizon={1}/>
      <Outcome asset="BTC" label="البيتكوين" desk={desk?.bitcoin} horizon={5}/>
    </div>
    <details className="proof-breakdown">
      <summary>اعرف الخسائر جاية من أنهي استراتيجية، وإيه سبب الخروج</summary>
      <div className="proof-breakdown-grid">
        {([['GOLD','الذهب',desk?.gold],['BTC','البيتكوين',desk?.bitcoin]] as const)
          .flatMap(([asset,label,assetDesk])=>
            ([1,5] as const).flatMap(horizon=>{
              const lane=(assetDesk?.ledger?.lanes as Lane[]|undefined)?.find(x=>x.horizon===horizon);
              return (lane?.stats?.setupBreakdown||[]).filter(x=>x.samples>0).map(x=>({
                ...x,key:asset+'-'+horizon+'-'+x.setup,label:label+' M'+horizon
              }));
            }))
          .map(x=><div className="proof-breakdown-row" key={x.key}>
            <strong>{x.label} · {({BREAKOUT:'اختراق',PULLBACK:'تصحيح',
              SWEEP:'سحب سيولة',CONTINUATION:'استمرار',RETEST:'إعادة اختبار'} as Record<string,string>)[x.setup]||x.setup}</strong>
            <span>نتائج {x.samples} · ربح {x.wins} · صافي
              <b className={x.netR<0?'red':x.netR>0?'green':'muted'}> {r(x.netR)} </b></span>
            <small>وقف {x.stops} · هدف {x.targets} · خروج وقت {x.timeExits}
              {x.negativeTimeExits?' (خسارة '+x.negativeTimeExits+')':''}</small>
          </div>)}
      </div>
      <small>الصفقات ذات النتيجة المجهولة والمُلغاة مش محسوبة أرباح. البيانات ورقية وبسعر مرجعي، مش نتائج Exness.</small>
    </details>
    <p className="muted proof-outcome-note">نتائج الصفقات الورقية التي اكتمل توثيقها فقط، من سجل الخادم الحالي. إعادة النشر أو تبدّل التخزين ممكن تؤثر على استمرارية العينات. التحقق الورقي بيتطلب 50 نتيجة موثقة بعد التحديث، ومتوسط عائد موجب بحد ثقة تقريبي، ومعامل ربح لا يقل عن 1.2 وسحب لا يزيد عن 6R. وده برضه مش اختبار تنفيذ Exness أو إثبات ربح مستقبلي. استراتيجية إعادة اختبار الاختراق M5 تجريبية، والتنفيذ الحقيقي غير مفعّل.</p>
  </section>;
}
