'use client';

import {useEffect,useMemo,useState} from 'react';
import type {Candidate} from '../../lib/spot-radar';
import {scanSpotInBrowser} from '../../lib/client-spot-radar';
import './spot.css';

type Radar={ok:true;source:string;asOf:number;universe:number;scanned:number;
  depthChecked:number;candidates:Candidate[];warning?:string;
  forwardAudit?:{total:number;hit3pct:number;avgReturnPct:number;pending:number}};
const fmt=(value:number)=>Number.isFinite(value)?value.toLocaleString('en-US',
  {maximumFractionDigits:value<.001?8:value<1?6:value<10?4:2}):'—';
const pct=(v:number)=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(2)+'%':'—';
const level=(score:number)=>score>=70?'مرتفع':score>=55?'جيد':'مراقبة';

export default function SpotPage(){
  const [data,setData]=useState<Radar|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshKey,setRefreshKey]=useState(0);
  const [now,setNow]=useState(Date.now());

  useEffect(()=>{
    let closed=false,inFlight=false;
    const load=async()=>{
      if(closed||inFlight)return;
      inFlight=true;setLoading(true);
      try{
        const r=await fetch('/api/spot-radar',{cache:'no-store',
          signal:AbortSignal.timeout(56000)});
        const j=await r.json().catch(()=>null);
        if(!r.ok||!j?.ok)throw Error(j?.detail||j?.message||'فشل قراءة Binance Spot');
        if(!closed){setData(j as Radar);setError('');}
      }catch(e){
        if(closed)return;
        try{
          const fallback=await scanSpotInBrowser();
          if(!closed){setData(fallback);setError('');}
        }catch(fail){
          if(!closed){
            setData(null);
            setError('تعذر تحديث Binance Spot الآن: '+
              (fail instanceof Error?fail.message:
                e instanceof Error?e.message:'المصدر غير متاح'));
          }
        }
      }finally{
        inFlight=false;
        if(!closed)setLoading(false);
      }
    };
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},95000);
    const clock=setInterval(()=>setNow(Date.now()),6000);
    return()=>{closed=true;clearInterval(timer);clearInterval(clock);};
  },[refreshKey]);

  const stale=Boolean(data&&now-data.asOf>210000);
  const sorted=useMemo(()=>[...(data?.candidates||[])]
    .filter(c=>c.outlook24h&&c.outlook24h.state!=='AVOID')
    .sort((a,b)=>(b.outlook24h?.rankScore||0)-(a.outlook24h?.rankScore||0))
    .slice(0,12),[data]);

  return <main className="spot-simple" dir="rtl">
    <div className="spot-simple-inner">
      <header className="spot-simple-head">
        <a href="/" className="spot-simple-back">← القناص الرئيسي</a>
        <div className="spot-simple-eyebrow">QANNAS · BINANCE SPOT</div>
        <h1>رادار ميم كوين <span>والحركات الكبيرة خلال 24 ساعة</span></h1>
        <p>رادار جريء للشراء المنفّذ: يلقط بداية التدفق من أول فحص، ويؤكد استمراره بعد فحص جديد.</p>
      </header>

      <div className="spot-simple-toolbar">
        <div className="spot-simple-stamp">
          <span className={'spot-simple-dot '+(data&&!stale?'live':'wait')}/>
          <span>{data&&!stale?(data.source?.includes('browser')?'بيانات Binance مباشرة من المتصفح':'تحليل Binance Spot محدث'):loading?'جاري تحليل السوق…':'بيانات غير متاحة أو قديمة'}</span>
          {data&&<small>· آخر فحص {new Date(data.asOf).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</small>}
        </div>
        <button type="button" onClick={()=>setRefreshKey(n=>n+1)}
          disabled={loading}>{loading?'بيفحص…':'↻ تحديث'}</button>
      </div>

      <div className="spot-simple-count">
        <strong>أقوى مرشحي الحركة الكبيرة</strong>
        <span>{data?sorted.length+' عملات من '+data.scanned+' تم تحليلها':'بانتظار Binance'}</span>
      </div>

      {data?.forwardAudit&&data.forwardAudit.total>0&&
        <p className="spot-simple-proof">اختبار 24 ساعة المسجّل: {data.forwardAudit.hit3pct} من {data.forwardAudit.total}
          {' '}أغلقوا بارتفاع 3% أو أكثر · سجل تشغيل تجريبي قد يُصفّر عند إعادة النشر.</p>}

      {error&&<p role="alert" className="spot-simple-alert">{error}</p>}
      {stale&&<p role="status" className="spot-simple-alert">البيانات قديمة؛ لا تعتمد على هذا الترتيب حتى ينجح التحديث.</p>}
      {!data&&loading&&<p className="spot-simple-empty">بنراجع السيولة والشموع الحقيقية خلال 24 ساعة…</p>}
      {data&&sorted.length===0&&<p className="spot-simple-empty">
        مفيش عملات مستوفية لشروط الصعود المبدئي حاليًا. الرادار مش هيخترع ترشيحات.
      </p>}

      <ol className="spot-simple-list">
        {sorted.map((c,i)=>{
          const outlook=c.outlook24h!;
          const base=c.symbol.slice(0,-4);
          return <li key={c.symbol} className="spot-simple-coin">
            <div className="spot-simple-rank">{i+1}</div>
            <div className="spot-simple-body">
              <div className="spot-simple-coin-head">
                <div><strong>{base}</strong><span> / USDT</span></div>
                {c.highUpside?.group==='MEME'&&
                  <span className="spot-simple-meme">ميم كوين</span>}
                {c.accumulation?.state==='BUY_BUILDUP'&&
                  <span className="spot-simple-accumulation">🧲 تسارع شراء قبل الاختراق</span>}
                {c.spotIgnition?.state==='FLOW_CONFIRMED'?
                  <span className="spot-simple-ignition">⚡ تدفّق شراء مستمر</span>:
                  outlook.fastLane&&
                  <span className="spot-simple-early">⚡ التقاط مبكر</span>}
                 <span className={'spot-simple-level '+(outlook.state==='HIGH'?'high':'possible')}>
                  قوة الإشارة: {level(outlook.rankScore)}
                </span>
              </div>
              <p>{outlook.reason}</p>
              <div className="spot-simple-foot">
                <span>نشاط السيولة: <b>{outlook.volumeRatio24.toFixed(2)}×</b></span>
                {c.highUpside&&
                  <span>متوسط نطاق الساعة سابقًا: <b>{c.highUpside.hourlyRangePct.toFixed(2)}%</b></span>}

              </div>
            </div>
            <div className="spot-simple-quote">
              <strong>{fmt(c.price)}</strong>
              <small>USDT</small>
              <span className={outlook.hourlyChange24>=0?'up':'down'}>
                {pct(outlook.hourlyChange24)} <em>آخر 24س</em>
              </span>
            </div>
          </li>;
        })}
      </ol>
      {data&&<footer className="spot-simple-disclaimer">
        الترتيب توقع اتجاهي استكشافي للـ24 ساعة القادمة، وليس احتمال نجاح محسوب أو وعدًا بضخ السيولة. نسبة التغير المعروضة تخص آخر 24 ساعة، وليست مكسبًا متوقعًا.
      </footer>}
    </div>
  </main>;
}
