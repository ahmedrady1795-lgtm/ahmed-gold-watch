'use client';

// Trading results, never a model confidence score or a promise of future profit.
const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null;
const r=(v:number|null,d=2)=>v==null?'—':(v>0?'+':'')+v.toFixed(d)+'R';
type Stat={samples?:number;wins?:number;netR?:number;expectancyR?:number;validation?:string};
type Lane={horizon?:number;stats?:Stat};
function Outcome({asset,label,desk,horizon}:{asset:string;label:string;desk:any;horizon:1|5}){
  const lane=(desk?.ledger?.lanes as Lane[]|undefined)?.find(x=>x.horizon===horizon);
  const stats=lane?.stats;
  const count=Math.max(0,Number(stats?.samples||0));
  const wins=Math.max(0,Number(stats?.wins||0));
  const net=number(stats?.netR);
  const average=number(stats?.expectancyR);
  const qualify=count>=30&&average!=null&&average>.08&&stats?.validation==='POSITIVE_SAMPLE';
  const complete=count>=30;
  return <div className="proof-outcome">
    <div className="proof-outcome-head"><b>{label} M{horizon}</b>
      <small className={'pill '+(qualify?'ok':'neutral')}>{qualify?'عينة موجبة أوليًا':complete?'نتيجة تحتاج مراجعة':'جمع بيانات'}</small>
    </div>
    <div className="proof-outcome-numbers">
      <span><small>الصفقات</small><strong>{count}</strong></span>
      <span><small>الرابحة</small><strong>{count?wins+'/'+count:'—'}</strong></span>
      <span><small>الصافي</small><strong className={net!=null&&net<0?'red':net!=null&&net>0?'green':'muted'}>{count?r(net):'—'}</strong></span>
      <span><small>المتوسط</small><strong className={average!=null&&average<0?'red':average!=null&&average>0?'green':'muted'}>{count?r(average,3):'—'}</strong></span>
    </div>
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
    <p className="muted proof-outcome-note">نتائج الصفقات الورقية التي اكتمل توثيقها فقط، من سجل الخادم الحالي. إعادة النشر أو تبدّل التخزين ممكن تؤثر على استمرارية العينات. عينة 30 صفقة موجبة شرط مبدئي للمراجعة، مش إثبات ربح خارج العينة. استراتيجية إعادة اختبار الاختراق M5 تجريبية، والتنفيذ الحقيقي غير مفعّل.</p>
  </section>;
}
