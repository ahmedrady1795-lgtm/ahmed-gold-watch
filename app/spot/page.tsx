'use client';

import {useEffect,useMemo,useState} from 'react';
import type {Candle,Candidate} from '../../lib/spot-radar';
import './spot.css';

type Radar={ok:true;source:string;asOf:number;universe:number;scanned:number;
  depthChecked:number;candidates:Candidate[];cacheAgeMs?:number};
type Filter='ALL'|'EARLY'|'BUILDING'|'ABSORPTION'|'EXTENDED';

const fmt=(v:number)=>Number.isFinite(v)?v.toLocaleString('en-US',
  {maximumFractionDigits:v<.001?8:v<1?6:v<10?4:2}):'—';
const usd=(n:number)=>'$'+(n>=1e9?(n/1e9).toFixed(2)+'B':
  n>=1e6?(n/1e6).toFixed(1)+'M':(n/1e3).toFixed(0)+'K');
const pct=(n:number)=>Number.isFinite(n)?(n>0?'+':'')+n.toFixed(2)+'%':'—';
const phaseName=(phase:Candidate['phase'])=>({
  EARLY:'تدفق مبكر',BUILDING:'ضغط شراء يتكوّن',WATCH:'قيد المراقبة',EXTENDED:'ممتدة / لا تطارد'
})[phase];

function CandleChart({bars,trigger}:{bars:Candle[];trigger:number}){
  const candles=bars.slice(-44);
  if(candles.length<20)return <p>لا توجد شموع مؤكدة كافية.</p>;
  const lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high));
  const margin=Math.max((hi-lo)*.14,hi*.0005),bottom=lo-margin,top=hi+margin;
  const py=(v:number)=>16+(top-v)/(top-bottom)*192;
  const step=590/candles.length,width=Math.max(3,step*.6);
  return <svg className="spot-candle-svg" viewBox="0 0 650 240"
      role="img" aria-label="شموع دقيقة حقيقية مغلقة من Binance Spot وليست شموع توقع">
    <rect x="0" y="0" width="650" height="240" fill="#08131f" rx="10"/>
    {[0,.25,.5,.75,1].map(i=><line key={i} x1="12" x2="630"
      y1={16+i*192} y2={16+i*192} stroke="#26384a" strokeDasharray="3 5"/>)}
    {trigger>=bottom&&trigger<=top&&<g>
      <line x1="12" x2="629" y1={py(trigger)} y2={py(trigger)} stroke="#eac985" strokeDasharray="5 5" strokeWidth="1.2"/>
      <text x="622" y={py(trigger)-5} fill="#f2d291" fontSize="10" textAnchor="end">مقاومة</text>
    </g>}
    {candles.map((c,i)=>{
      const x=26+i*step+step/2,up=c.close>=c.open;
      const color=up?'#42d9a2':'#f07883',bodyTop=Math.min(py(c.open),py(c.close));
      return <g key={c.time}>
        <line x1={x} x2={x} y1={py(c.high)} y2={py(c.low)} stroke={color} strokeWidth="1.35"/>
        <rect x={x-width/2} y={bodyTop} width={width}
          height={Math.max(1.3,Math.abs(py(c.close)-py(c.open)))} fill={color} rx=".4"/>
      </g>;
    })}
    <text x="628" y="227" textAnchor="end" fill="#839ab1" fontSize="11">1m · مغلقة فقط</text>
    <text x="22" y="227" textAnchor="start" fill="#839ab1" fontSize="11">Binance Spot</text>
  </svg>;
}
export default function SpotPage(){
  const [data,setData]=useState<Radar|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(true);
  const [selected,setSelected]=useState('');
  const [filter,setFilter]=useState<Filter>('ALL');
  const [now,setNow]=useState(Date.now());
  const [manualRefresh,setManualRefresh]=useState(0);
  useEffect(()=>{
    let closed=false,inFlight=false;
    const load=async()=>{
      if(inFlight||closed)return;
      inFlight=true;setBusy(true);
      try{
        const r=await fetch('/api/spot-radar',{cache:'no-store',signal:AbortSignal.timeout(55000)});
        const j=await r.json().catch(()=>null);
        if(!r.ok||!j?.ok)throw Error(j?.message||'خدمة Binance Spot غير متاحة حالياً');
        if(!closed){setData(j as Radar);setError('');
          setSelected(previous=>j.candidates.some((c:Candidate)=>c.symbol===previous)?previous:(j.candidates[0]?.symbol||''));}
      }catch(e){if(!closed){setError(e instanceof Error?e.message:'تعذر التحديث');setData(null);}}
      finally{inFlight=false;if(!closed)setBusy(false);}
    };
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},95000);
    const clock=setInterval(()=>setNow(Date.now()),5000);
    return()=>{closed=true;clearInterval(timer);clearInterval(clock);};
  },[manualRefresh]);
  const old=Boolean(data&&now-data.asOf>210000);
  const shown=useMemo(()=>data?.candidates.filter(c=>filter==='ALL'||c.phase===filter||
    (filter==='ABSORPTION'&&c.absorption?.state!=='NONE'&&Boolean(c.absorption?.state)))||[],
    [data,filter]);
  const coin=shown.find(c=>c.symbol===selected)||shown[0]||null;
  const ready=(data?.candidates||[]).filter(c=>c.phase==='EARLY').length;
  const absorbed=(data?.candidates||[]).filter(c=>c.absorption?.state==='BUY_RECLAIM').length;
  return <main className="spot-page" dir="rtl">
    <header className="spot-head">
      <div><a className="spot-back" href="/">← القناص الرئيسي</a>
        <div className="spot-eyebrow">QANNAS / SPOT FLOW INTELLIGENCE</div>
        <h1>رادار السيولة <span>SPOT</span></h1>
        <p>ابحث عن بدايات ضغط الشراء، لا عن العملات التي انتهى صعودها.</p>
      </div>
      <div className="spot-head-state">
        <span className={'spot-live '+(data&&!old?'ok':'warn')}>{data&&!old?'● بيانات سوق حديثة':'● بانتظار بيانات موثوقة'}</span>
        <small>{data?'آخر مسح '+new Date(data.asOf).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'مصدر البيانات: Binance Spot'}</small>
        <button type="button" onClick={()=>setManualRefresh(x=>x+1)} disabled={busy}>{busy?'جاري فحص السوق…':'↻ إعادة فحص'}</button>
      </div>
    </header>

    <div className="spot-summary">
      <div><small>فرص التدفق المبكر</small><strong>{data&&!old?ready:'—'}</strong><span>ليست ضمان ارتفاع</span></div>
      <div><small>الأزواج التي جرى تحليلها</small><strong>{data?data.scanned:'—'}</strong><span>من {data?.universe??'—'} زوج Spot مؤهل</span></div>
      <div><small>عودة شراء بعد امتصاص بيع</small><strong>{data&&!old?absorbed:'—'}</strong><span>تسلسل مرصود لا ضمان صعود</span></div>
      <div><small>دفاتر أوامر تم فحصها</small><strong>{data?data.depthChecked:'—'}</strong><span>لقطات قابلة للإلغاء</span></div>
      <div><small>تحديث الرادار</small><strong>90s</strong><span>دقائق مغلقة · بدون تداول تلقائي</span></div>
    </div>

    {error&&<div className="spot-warning" role="alert"><strong>الرادار متوقف عن إصدار ترشيحات</strong><span>{error}</span></div>}
    {old&&<div className="spot-warning" role="status">بيانات التحليل قديمة، لا تعتبر أي مرشح إشارة نشطة حتى ينجح التحديث.</div>}
    {!data&&!error&&<div className="spot-empty">جارٍ جمع الأدلة من صفقات Binance الحقيقية ودفتر الأوامر…</div>}

    {data&&<div className="spot-workspace">
      <section className="spot-list-panel" aria-label="قائمة مرشحي Spot">
        <div className="spot-panel-title"><div><span>RADAR WATCHLIST</span><h2>العملات المرشحة</h2></div><small>التقييم قوة دلائل، لا نسبة نجاح</small></div>
        <div className="spot-filters">
          {([['ALL','الكل'],['EARLY','تدفق مبكر'],['BUILDING','ضغط شراء'],['ABSORPTION','امتصاص خفي'],['EXTENDED','لا تطارد']] as const).map(([value,label])=>
            <button key={value} type="button" className={filter===value?'active':''}
              onClick={()=>setFilter(value)}>{label}</button>)}
        </div>
        <div className="spot-pairs">
          {!shown.length&&<div className="spot-empty">لا توجد عملات تستوفي هذا التصنيف حالياً. غياب الإشارات أفضل من تلفيق فرصة.</div>}
          {shown.map(c=><button key={c.symbol} type="button"
            className={'spot-pair '+(selected===c.symbol?'selected':'')}
            onClick={()=>setSelected(c.symbol)}>
            <span className="spot-pair-main"><b>{c.symbol.slice(0,-4)} <em>/ USDT</em></b><small>{phaseName(c.phase)}{c.absorption?.state==='BUY_RECLAIM'?' · امتصاص ثم شراء':c.absorption?.state==='SELL_ABSORPTION'?' · امتصاص محتمل':''}</small></span>
            <span className="spot-pair-price"><b>{fmt(c.price)}</b><small className={c.change24h>=0?'positive':'negative'}>{pct(c.change24h)} / 24س</small></span>
            <span className={'spot-score '+c.phase}><b>{c.score}</b><small>/100</small></span>
            <span className="spot-pair-volume">تسارع <strong>×{c.volumeImpulse.toFixed(1)}</strong></span>
          </button>)}
        </div>
        <p className="spot-small-note">المرشح الأقوى ليس بالضرورة الأكثر ربحاً. لا تُعرض عملة دون شموع دقيقة مغلقة ومتتابعة. يتم عرض أعلى 12 نتيجة من عينة متغيرة من السوق.</p>
      </section>

      <section className="spot-detail-panel" aria-label="تفاصيل العملة المحددة">
        {coin?<>
          <div className="spot-detail-header">
            <div><span>LIQUIDITY X-RAY</span><h2>{coin.symbol.slice(0,-4)} <small>/ USDT</small></h2>
              <p>{phaseName(coin.phase)} · <b className={coin.phase==='EXTENDED'?'negative':'positive'}>{pct(coin.change15m)} خلال 15 دقيقة</b></p></div>
            <a href={'https://www.binance.com/en/trade/'+coin.symbol.slice(0,-4)+'_USDT?type=spot'}
              target="_blank" rel="noopener noreferrer" className="spot-binance-link">عرض في Binance ↗</a>
          </div>
          <div className="spot-chart"><CandleChart bars={coin.candles} trigger={coin.breakout}/>
            <div className="spot-chart-legend"><span><i className="spot-dot green"/>شموع صاعدة</span><span><i className="spot-dot red"/>شموع هابطة</span><span><i className="spot-dot gold"/>مستوى مقاومة سابق</span></div>
          </div>
          <div className="spot-metrics">
            <div><small>تسارع تداول آخر 5د</small><b>×{coin.volumeImpulse.toFixed(2)}</b><span>مقارنة بمتوسط 50د قبلها</span></div>
            <div><small>الشراء المنفّذ</small><b>{Math.round(coin.buyShare*100)}%</b><span>حجم المشترين المبادرين بالصفقات</span></div>
            <div><small>صافي ضغط التداول 5د</small><b className={coin.flowDelta5m>=0?'positive':'negative'}>{coin.flowDelta5m>=0?'+':'−'}{usd(Math.abs(coin.flowDelta5m))}</b><span>فرق شراء وبيع Taker المنفّذ</span></div>
            <div><small>تحوّل ميزان الشراء</small><b className={coin.flowShiftPct>=0?'positive':'negative'}>{(coin.flowShiftPct>0?'+':'')+coin.flowShiftPct.toFixed(1)} نقطة</b><span>مقابل آخر 20 دقيقة سابقة</span></div>
            <div><small>تفوّق على بيتكوين 15د</small><b>{coin.relative15m===null?'غير متاح':pct(coin.relative15m)}</b><span>قوة نسبية لا تعني ضخاً مؤكداً</span></div>
            <div><small>حجم تداول 24 ساعة</small><b>{usd(coin.volume24h)}</b><span>سيولة تداول · USDT</span></div>
            <div><small>عائد / مخاطرة بعد التكلفة</small><b className={coin.netRR>=1.15?'positive':'negative'}>{coin.netRR>0?coin.netRR.toFixed(2)+' : 1':'غير مجدٍ'}</b><span>تقديري عند T1 وليس وعداً</span></div>
            <div><small>تكلفة تقديرية ذهاب وعودة</small><b>{coin.estimatedCostPct.toFixed(2)}%</b><span>رسوم مفترضة 0.1% لكل جهة + 0.05% انزلاق + السبريد</span></div>
          </div>
          <div className="spot-absorption">
            <div className="spot-panel-title"><h3>كاشف الامتصاص الخفي</h3><small>بيع منفّذ → صمود السعر → استعادة الشراء</small></div>
            <strong className={'spot-absorption-status '+(coin.absorption?.state||'NONE')}>
              {coin.absorption?.state==='BUY_RECLAIM'?'رُصد امتصاص بيع ثم استعادة شراء':
                coin.absorption?.state==='SELL_ABSORPTION'?'امتصاص بيع محتمل · ننتظر عودة المشترين':
                'لا توجد بصمة امتصاص مستوفية للشروط'}
            </strong>
            {coin.absorption&&<div className="spot-absorption-stats">
              <div><small>البيع المنفّذ في فترة الضغط</small><b>{pct(coin.absorption.sellShare*100)}</b></div>
              <div><small>كثافة حجم التداول</small><b>×{coin.absorption.pressureRatio.toFixed(1)}</b></div>
              <div><small>تغير السعر أثناء البيع</small><b>{pct(coin.absorption.holdPct)}</b></div>
              <div><small>شراء آخر 5 دقائق</small><b>{pct(coin.absorption.reclaimBuyShare*100)}</b></div>
            </div>}
            <small>مبني على شموع Spot المغلقة وحجم المشترين المبادرين بالصفقات. احتمال امتصاص وليس كشفًا لأوامر مخفية أو نوايا حيتان.</small>
          </div>
          <div className="spot-orderflow"><div className="spot-panel-title"><h3>ميزان دفتر الأوامر</h3><small>طلبات ظاهرة ضمن ±1% من السعر</small></div>
            {coin.book?<><div className="spot-book-meter"><span style={{width:(coin.book.bidShare*100)+'%'}}/></div>
              <div className="spot-book-label"><span>الطلب {Math.round(coin.book.bidShare*100)}%</span><span>العرض {Math.round((1-coin.book.bidShare)*100)}%</span></div>
              <small>السبريد: {coin.book.spreadBps.toFixed(1)} نقطة أساس · الأوامر قابلة للإلغاء فوراً وليست صفقات منفّذة.</small></>
            :<div className="spot-warning">عمق دفتر الأوامر غير متاح لهذا الزوج؛ لا تأكيد من السيولة المعلقة.</div>}
          </div>
          <div className="spot-levels"><h3>خطة مراقبة هيكلية <small>مستويات حسابية وليست تنبؤات</small></h3>
            <div><span>مقاومة / شرط الاختراق</span><strong>{fmt(coin.breakout)}</strong></div>
            <div><span>منطقة هدف قياسي T1</span><strong className="positive">{fmt(coin.target1)}</strong></div>
            <div><span>امتداد حسابي T2</span><strong className="positive">{fmt(coin.target2)}</strong></div>
            <div><span>إلغاء السيناريو</span><strong className="negative">{fmt(coin.invalidation)}</strong></div>
          </div>
          <div className="spot-evidence"><h3>ليه ظهرت العملة؟</h3>
            {coin.reasons.length?coin.reasons.map((r,i)=><span key={i}>✓ {r}</span>):<span>دلائل غير مكتملة؛ تحت المراقبة فقط.</span>}
            {coin.warnings.map((w,i)=><small key={i}>⚠ {w}</small>)}
          </div>
          <div className="spot-footnote">آخر شمعة مؤكدة: {new Date(coin.freshAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})} · البيانات من Binance Spot العامة. لا تشمل أخبار المشاريع أو المحافظ الخاصة أو أوامر المؤسسات غير المعلنة. الدرجة نموذج مراقبة أولي يحتاج اختبار نتائج فعلي قبل اعتماد أي دقة.</div>
        </>:<div className="spot-empty">اختر عملة لعرض حركة التداول والسيولة.</div>}
      </section>
    </div>}
  </main>;
}
