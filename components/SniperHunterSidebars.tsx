import type {M15HuntPreview} from '../lib/sniper-m15-hunt-preview';
import type {M15HuntProof} from '../lib/sniper-m15-hunt-proof';
import {assessM15HuntDisplay} from '../lib/sniper-m15-display-evidence';
import type {M15WatchGuide} from '../lib/sniper-m15-watch-guide';
import type {WatchPriceMap} from '../lib/sniper-m15-watch-prices';
import type {M1Priority} from '../lib/sniper-m1-priority';
import type {StructureSnapshot} from '../lib/sniper-market-structure';

type Bar={time:number;open:number;high:number;low:number;close:number};
const fmt=(x:number|null|undefined)=>typeof x==='number'&&Number.isFinite(x)&&x>0?
  x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

type Bucket={at:number;touches:number;side:'ABOVE'|'BELOW'};
/** Genuine closed-candle PRICE ACTIVITY, not exchange volume/depth. */
export function closedM15PriceActivity(bars:readonly Bar[],price:number|null,bins=11):Bucket[]{
  if(bars.length<8||price==null||!Number.isFinite(price)||price<=0)return [];
  const recent=bars.slice(-48).filter(b=>[b.open,b.close,b.high,b.low].every(Number.isFinite)&&
    b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
  if(recent.length<8)return [];
  const low=Math.min(...recent.map(b=>b.low)),high=Math.max(...recent.map(b=>b.high));
  if(high<=low)return [];
  const n=Math.max(5,Math.min(13,Math.floor(bins)));
  const step=(high-low)/(n-1);
  return Array.from({length:n},(_,i)=>{
    const at=high-i*step;
    const touches=recent.filter(b=>b.low<=at&&b.high>=at).length;
    return {at,touches,side:at>=price?'ABOVE' as const:'BELOW' as const};
  });
}
export function SniperLiquidityColumn({history,price,preview,liquidityOn,structure}:{
  history:Bar[];price:number|null;preview:M15HuntPreview;liquidityOn:boolean;
  structure:StructureSnapshot;
}){
  const buckets=closedM15PriceActivity(history,price,11);
  const max=Math.max(1,...buckets.map(b=>b.touches));
  return <aside className="sniper-hunter-left" aria-label="البيانات الحقيقية للسيولة السعرية">
    <div className="sniper-hunter-sidehead">
      <strong>بروفايل حركة السعر</strong>
      <small>شموع M15 مغلقة · ليس دفتر أوامر</small>
    </div>
    <div className="sniper-hunter-profile">
      {buckets.length?buckets.map((b,i)=>
        <div key={'profile-'+i} className={'sniper-hunter-profile-row '+(
           b.side==='ABOVE'?'above':'below')} title={
             'مرات عبور الشموع المغلقة لهذا السعر: '+b.touches
          }>
          <span dir="ltr">{fmt(b.at)}</span>
          <i><b style={{width:(b.touches/max*100)+'%'}}/></i>
          <small>{b.touches}</small>
        </div>
      ):<p className="sniper-hunter-no-data">لا توجد شموع M15 كافية لبناء البروفايل.</p>}
    </div>
    {structure.ready&&<div className="sniper-hunter-structure-summary">
      <strong>هيكل السوق · إغلاقات M15</strong>
      <div><span>RSI 14</span><b dir="ltr">{structure.rsi14?.toFixed(1)??'—'}</b></div>
      <div><span>كسر هيكل</span><b>{
        structure.events.at(-1)?.kind.startsWith('BOS_')?'BOS':
        structure.events.at(-1)?.kind.startsWith('CHOCH_')?'CHoCH':
        'لا كسر حديث'
      }</b></div>
      <div><span>فجوات / كتل نشطة</span><b>{structure.zones.length}</b></div>
    </div>}
    {liquidityOn&&preview.ready&&
      <div className="sniper-hunter-pool-stack">
        <strong>مناطق جذب السعر</strong>
        {preview.pools.map(pool=>
          <div key={pool.kind}>
            <span>{pool.kind==='HIGH_POOL'?'سيولة فوق القمم':'سيولة تحت القيعان'}</span>
            <b dir="ltr">{fmt(pool.price)}</b>
          </div>)}
        <small>مستويات مستنتجة من قمم وقيعان تاريخية، لا أوامر مؤسسات مرئية.</small>
      </div>}
  </aside>;
}
export function SniperScenarioColumn({preview,guide,qualified,price,marketOpen,structure,watch,m1,priceFresh,proof,flowSide}:{
  preview:M15HuntPreview;guide:M15WatchGuide;qualified:boolean;
  price:number|null;marketOpen:boolean;structure:StructureSnapshot;
  watch:WatchPriceMap;m1:M1Priority;priceFresh:boolean;
  proof?:M15HuntProof;flowSide?:'BUY'|'SELL'|'WAIT';
}){
 const active=preview.ready&&!preview.referenceOnly&&marketOpen&&priceFresh;
 const evidence=assessM15HuntDisplay({
   hunt:preview,m1,proof,marketOpen:marketOpen&&priceFresh,flowSide
 });
 const visualSide=evidence.side;
 const levelsReady=active&&watch.ready&&guide.anchorTime!=null&&
   watch.asOf===guide.anchorTime+900000;
 const m1Conflict=evidence.state==='CONFLICT';
 const up=preview.buy,down=preview.sell;
 const row=(side:'BUY'|'SELL')=>{
  const rise=side==='BUY',candles=rise?up:down;
  const entry=rise?guide.upperTrigger:guide.lowerTrigger;
  const invalidation=rise?guide.lowerTrigger:guide.upperTrigger;
  const quote=price!=null&&Number.isFinite(price)&&price>0?price:null;
  const atr=guide.atr??0;
  const observed=levelsReady&&quote!=null&&entry!=null&&atr>0?
    (rise?watch.upper:watch.lower).filter(v=>
      (rise?v.price>Math.max(entry,quote)+atr*.08:
        v.price<Math.min(entry,quote)-atr*.08)&&
      Math.abs(v.price-quote)<=atr*4).slice(0,2):[];
  const crossed=quote!=null&&entry!=null&&
    (rise?quote>=entry:quote<=entry);
  const invalid=quote!=null&&invalidation!=null&&
    (rise?quote<=invalidation:quote>=invalidation);
  const near=quote!=null&&entry!=null&&atr>0&&
    Math.abs(quote-entry)<=atr*.30;
  const state=!active?'بيانات غير حية':invalid?'تجاوز إبطال الرصد':
    crossed?'السعر بعد مستوى الكسر · تأكيد الإغلاق مطلوب':
    near?'قريب من مستوى الكسر':'انتظار الوصول لمستوى الكسر';
  return <section className={'sniper-hunter-path '+(rise?'rise':'fall')+
      (visualSide===side&&active?' preferred':'')} key={side}>
    <div className="sniper-hunter-pathhead">
      <span>{rise?'↗':'↘'}</span>
      <strong>{rise?'مسار الصعود':'مسار الهبوط'}</strong>
      <small>{visualSide==='WAIT'?'مسار مشروط':
        visualSide===side&&active?'المرجّح للمراقبة':'مسار بديل'}</small>
    </div>
    <div><span>كسر مشروط M15</span><b dir="ltr">{fmt(entry)}</b></div>
    <div><span>إبطال رصد M15</span><b dir="ltr">{fmt(invalidation)}</b></div>
    <div><span>أقرب سيولة حقيقية</span><b dir="ltr">{fmt(observed[0]?.price)}</b></div>
    <div><span>سيولة تالية</span><b dir="ltr">{fmt(observed[1]?.price)}</b></div>
    <small>{state} · {observed[0]?.source??'لم يُرصد هدف قريب صالح'}</small>
    <div><span>محطة توضيحية 1</span><b dir="ltr">{fmt(candles[2]?.close)}</b></div>
    <div><span>محطة توضيحية 2</span><b dir="ltr">{fmt(candles[5]?.close)}</b></div>
    <small>محطات محاكاة ATR، ليست TP منفذًا أو مضمونًا.</small>
  </section>;
 };
 return <aside className="sniper-hunter-right" aria-label="المسارات المتوقعة المشروطة">
   <div className="sniper-hunter-sidehead">
     <strong>السيناريو الذكي · M15</strong>
     <small>{qualified?'توقع محفوظ':'مساران تحليليان'}</small>
   </div>
   {preview.ready?<div className="sniper-hunter-scenario-stack">
     {row('BUY')}{row('SELL')}
     <div className="sniper-hunter-sweep" role="status">
       <strong>{visualSide==='WAIT'?'M15 · لا ترجيح موثوق':
         'مراقبة M15 '+(visualSide==='BUY'?'صعود':'هبوط')}</strong>
       <span>{'رصد M1 '+(!m1.ready?'غير حديث':m1.side==='BUY'?'صعود':
         m1.side==='SELL'?'هبوط':'متوازن')}</span>
       <small>{!active?'مراقبة تاريخية فقط':
         m1Conflict?evidence.reason:
         visualSide==='WAIT'?evidence.reason:
         'المساران للمراقبة · الأسعار المرجعية ليست أوامر تداول'}</small>
     </div>
     {structure.ready&&structure.zones.length>0&&
       <div className="sniper-hunter-structure-zones">
         <strong>FVG / OB · مناطق مرصودة</strong>
         {structure.zones.slice(0,2).map(z=>
           <div key={z.kind+'-'+z.formedAt}>
             <span>{z.label}</span>
             <b dir="ltr">{fmt(z.low)} – {fmt(z.high)}</b>
           </div>)}
       </div>}
     <div className="sniper-hunter-sweep">
       <span>قراءة سحب السيولة</span>
       <strong>{preview.sweep==='HIGH_REJECTION'?'رفض قمة مغلقة':
         preview.sweep==='LOW_REJECTION'?'استرداد قاع مغلق':'لا يوجد سحب مؤكد'}</strong>
       <span>السعر المرصود <b dir="ltr">{fmt(price)}</b></span>
     </div>
   </div>:<div className="sniper-hunter-no-data">
     {preview.reason||'لا توجد بيانات مغلقة كافية'}
   </div>}
   <small className="sniper-hunter-right-caption">
     {active?'توقعات مشروطة · ليست صفقات':
       'مراقبة تاريخية أو سوق مغلق · لا دخول'}
   </small>
 </aside>;
}
export function SniperNextCandleCard({priority,marketOpen}:{
  priority:M1Priority;marketOpen:boolean;
}){
 const live=marketOpen&&priority.ready;
 const direction=live?priority.side:'WAIT';
 return <div className={'sniper-hunter-next '+(
   direction==='BUY'?'rise':direction==='SELL'?'fall':'neutral')}
   aria-label="ترجيح قبل حركة شمعة الدقيقة">
   <small>اقتناص الشمعة التالية · M1</small>
   <strong>{direction==='BUY'?'↗ ترقّب صعود':
     direction==='SELL'?'↘ ترقّب هبوط':'↔ انتظار'}</strong>
   <span>{live?'قوة نمط '+priority.pressureScore+'/100':'لا يوجد رصد حي مؤهل'}</span>
   <small>تقييم من إغلاقات سابقة، لا نتيجة مضمونة.</small>
 </div>;
}
