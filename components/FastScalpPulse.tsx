'use client';
import {readFastScalpView} from '../lib/scalp-fast-view';

const fmt=(n:number|null)=>n==null||!Number.isFinite(n)?'—':
  n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const sideArabic=(side:string)=>side==='BUY'?'ميل صعود':side==='SELL'?'ميل هبوط':'دون ميل معتمد';
export default function FastScalpPulse({desk,now,aiAgeMs,assetView='ALL'}:{
  desk:any;now:number;aiAgeMs:number|null;assetView?:'ALL'|'GOLD'|'BTC'
}){
  const views=[readFastScalpView(desk?.gold,now),readFastScalpView(desk?.bitcoin,now)].filter(v=>assetView==='ALL'||v.asset===assetView);
  if(!desk)return <section id="market-overview" className="panel workspace-loading">جارٍ تحميل القراءة اللحظية للسوق…</section>;
  return <section id="market-overview" className="panel fast-pulse-compact" aria-label="القراءة السريعة المستقلة عن AI">
    <div className="panelhead">
      <div><span className="eyebrow">01 / نبض السوق</span><h2>السوق الآن · قراءة لحظية</h2></div>
      <span className="pill">{aiAgeMs!=null?'آخر تحليل AI موسع منذ '+Math.round(aiAgeMs/1000)+' ثانية':'AI الموسع لم يصل بعد'}</span>
    </div>
    <div className={'fast-pulse-grid '+(assetView!=='ALL'?'single-asset':'')}>
      {views.map(v=><div key={v.asset} className="fast-pulse-asset">
        <strong>{v.asset==='GOLD'?'الذهب XAU/USD':'البيتكوين BTC/USD'}</strong>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,gap:8,flexWrap:'wrap'}}>
          <strong className={v.fresh?(v.side==='BUY'?'green':v.side==='SELL'?'red':'amber'):'muted'}>
            {v.fresh?sideArabic(v.side):'الأسعار متأخرة'}
          </strong>
          <small>{v.status==='PAPER_ENTRY'?'ENTRY ورقي مؤكد':v.status==='CONDITIONAL_WATCH'?'WATCH · مراقبة مشروطة':
            v.status==='PRICE_PRESSURE_ONLY'?'ميل سعري فقط':v.status==='NO_SETUP'?'لا يوجد إعداد':'بيانات غير حديثة'}</small>
        </div>
        {v.horizon!=null&&<small>الإعداد M{v.horizon} · قوة الإعداد {v.score}/100 وليست احتمال النجاح</small>}
        {v.status==='PAPER_ENTRY'
          ?<p>دخول مرجعي {fmt(v.entry)} · وقف {fmt(v.stop)} · هدف {fmt(v.target)}</p>
          :v.status==='CONDITIONAL_WATCH'
            ?<p>مستوى مراقبة {fmt(v.entry)} · الوقف المقترح {fmt(v.stop)} · الهدف المشروط {fmt(v.target)}</p>
            :null}
        <p style={{margin:'8px 0 0',fontSize:13}}>{v.reason}</p>

        {v.fresh&&<small>آخر سعر منذ {Math.max(0,Math.round((now-v.quoteAt)/1000))} ث · مصدر: {v.candleSource||'غير محدد'}</small>}
      </div>)}
    </div>

    <small className="fast-pulse-note">الميل اللحظي قد يختلف عن توقع 15 دقيقة · إعدادات السكالب M1 وM5 تحتاج تأكيدًا مستقلًا · لا أوامر Exness</small>
  </section>;
}
