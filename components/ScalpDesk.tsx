'use client';
import {useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,Clock3,Target} from 'lucide-react';

const fmt=(v:unknown,d=2)=>v!==null&&v!==undefined&&Number.isFinite(Number(v))
  ?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const sideAr=(v:string)=>v==='BUY'?'شراء':v==='SELL'?'بيع':'انتظار';
const SIGNAL_TTL_MS=15000;
// The 15-second clock is the visibility/validity window for a confirmed
// PAPER SIGNAL. It is NOT a broker order or a 15-second trade exit.
export default function ScalpDesk({desk,now=Date.now()}:any){
  const [horizon,setHorizon]=useState<1|5>(5);
  const plan=desk?.plans?.find((p:any)=>p.horizon===horizon);
  const confirmation=desk?.entryConfirmations?.find((e:any)=>e.horizon===horizon);
  const lane=desk?.ledger?.lanes?.find((l:any)=>l.horizon===horizon);
  const current=lane?.current;
  const checkedAt=Number(desk?.checkedAt);
  const stale=!Number.isFinite(checkedAt)||checkedAt<=0||checkedAt>now+2000||now-checkedAt>15000;
  const running=Boolean(current?.state==='ACTIVE');
  const blocked=stale||plan?.status==='BLOCKED';
  const direction=blocked?'WAIT':(
    running&&(current?.plan?.side==='BUY'||current?.plan?.side==='SELL')?current.plan.side:
    plan?.side==='BUY'||plan?.side==='SELL'?plan.side:'WAIT'
  );
  const signaledAt=Number(running?current?.activatedAt:confirmation?.confirmedCandleAt||0);
  const signalAge=signaledAt>0?now-signaledAt:Infinity;
  const confirmed=Boolean(!blocked&&direction!=='WAIT'&&signaledAt>0&&
    signalAge>=0&&signalAge<SIGNAL_TTL_MS&&
    (current?.state==='ACTIVE'||confirmation?.state==='ENTRY')&&
    (current?.state==='ACTIVE'||confirmation?.entryAudit?.approved===true));
  const remaining=confirmed?Math.max(1,Math.ceil((SIGNAL_TTL_MS-signalAge)/1000)):0;
  const status=blocked?'الدخول متوقف · بيانات أو شروط غير مكتملة':
    confirmed?'إشارة ورقية مؤكدة · نشطة الآن':
    running?'إشارة الدخول انتهت · الصفقة الورقية قيد المتابعة':
    confirmation?.state==='HOLDING'?'بانتظار تأكيد إغلاق M1':
    direction==='WAIT'?'مفيش اتجاه سكالب مؤكد دلوقتي':
    'اتجاه مرصود · لسه مش إشارة دخول';
  const reason=blocked?(plan?.blockers?.[0]||'آخر تحديث للسوق متأخر'):
    confirmation?.entryAudit?.reason||plan?.reason||'بانتظار الشروط الكاملة';
  const dirCss=confirmed?(direction==='BUY'?'green':'red'):'amber';
  const actionable=confirmed&&!stale;
  return <section className={'panel scalp-desk scalp-seconds '+(confirmed?(direction==='BUY'?'ai-buy':'ai-sell'):'ai-wait')}
    aria-label={'السكالب '+(desk?.asset==='GOLD'?'للذهب':'للبيتكوين')}>
    <div className="scalp-desk-head">
      <div><span className="eyebrow">سكالب سريع · {desk?.asset==='GOLD'?'XAU/USD':'BTC/USD'}</span>
        <h2>القرار في ثواني</h2></div>
      <span className={'scalp-feed-state '+(blocked?'late':'')}>{blocked?'غير جاهز':'أسعار تحت المراقبة'}</span>
    </div>
    <div className="scalp-frame-tabs" role="tablist" aria-label="فريم تحليل السكالب">
      {([1,5] as const).map(h=><button type="button" role="tab"
        aria-selected={horizon===h} aria-controls={'scalp-panel-'+desk.asset}
        id={'scalp-tab-'+desk.asset+'-'+h} key={h}
        onClick={()=>setHorizon(h)} className={horizon===h?'selected':''}>
        <strong>M{h}</strong><small>{h===1?'سياق الدقيقة':'سياق خمس دقائق'}</small>
      </button>)}
    </div>
    <div id={'scalp-panel-'+desk.asset} role="tabpanel"
      aria-labelledby={'scalp-tab-'+desk.asset+'-'+horizon}>
      <div className={'scalp-seconds-direction '+dirCss}>
        {confirmed?(direction==='BUY'?<ArrowUpRight size={36}/>:<ArrowDownRight size={36}/>):<Activity size={32}/>}
        <div><small>قرار الدخول</small>
          <strong>{blocked?'غير جاهز':confirmed?(direction==='BUY'?'↑ شراء مؤكد':'↓ بيع مؤكد'):running?'متابعة فقط':'انتظار · لا دخول'}</strong>
          <span>{confirmed?'إشارة ورقية · ليست أمرًا منفذًا':direction!=='WAIT'?'اتجاه المراقبة: '+sideAr(direction)+' · لا دخول جديد':'لا اتجاه مؤكد'}</span>
        </div>
        <div className="scalp-seconds-clock">
          <Clock3 size={16}/><strong>{remaining?remaining+' ث':'—'}</strong>
          <small>صلاحية الإشارة</small>
        </div>
      </div>
      <p className={'scalp-seconds-status '+(confirmed?'green':blocked?'red':'amber')}>
        {status}
      </p>
      {actionable&&<div className="scalp-seconds-levels" aria-label="مستويات الإشارة الورقية">
        <span><small>دخول ورقي</small><b dir="ltr">{fmt(running?current.plan.entry:confirmation?.entry)}</b></span>
        <span><small>وقف</small><b dir="ltr">{fmt(running?current.plan.stop:confirmation?.stop)}</b></span>
        <span><small><Target size={12}/> الهدف الأول</small><b dir="ltr">{fmt(running?current.plan.targets?.[0]?.price:confirmation?.targets?.[0]?.price)}</b></span>
      </div>}
      {!confirmed&&<p className="scalp-seconds-reason">{reason}</p>}
      <small className="scalp-seconds-foot">
        {stale?'بيانات السوق قديمة · يُمنع الدخول':
          'آخر تحديث '+Math.max(0,Math.round((now-desk.checkedAt)/1000))+' ثانية'}
        {' · '}إشارة 15 ثانية فقط · لا تنفيذ MT5
      </small>
    </div>
  </section>;
}
