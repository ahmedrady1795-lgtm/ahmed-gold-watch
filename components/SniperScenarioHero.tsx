import type {PreMovePressure} from '../lib/pre-move-pressure';
import type {M15HuntPreview} from '../lib/sniper-m15-hunt-preview';
import type {LocalFusion} from '../lib/sniper-local-fusion';
import type {FlowProfileDecision} from '../lib/flow-profile-decision';
import type {LiquidityMagnetView} from '../lib/sniper-liquidity-magnets';

type Props={
 asset:'GOLD'|'BTC';fusion:LocalFusion;hunt:M15HuntPreview;
 preMove:PreMovePressure;liquidity:LiquidityMagnetView;flow?:FlowProfileDecision|null;
 price:number|null;marketOpen:boolean;fresh:boolean;
 providerTransition:boolean;now:number;
};
const priceText=(n:number|null|undefined)=>n!=null&&Number.isFinite(n)&&n>0?
 n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

/** A compact command strip above real OHLC. No inferred broker fills,
 * artificial price levels, future candle bodies or invented probabilities.
 * The extensive pre-move/AI/liquidity evidence deck is below the chart.
 */
export default function SniperScenarioHero(p:Props){
 const connected=p.marketOpen&&p.fresh&&!p.providerTransition&&p.fusion.ready;
 const side=connected?p.fusion.side:'WAIT';
 const direction=side==='BUY'?'الصعود المرجّح':side==='SELL'?'الهبوط المرجّح':'مراقبة الحركة';
 const headline=!connected?'بيانات السوق غير جاهزة':
   p.fusion.phase==='DISAGREEMENT'?'قراءات الاتجاه متعارضة':
   side==='WAIT'?'نراقب قبل صدور إشارة مبكرة موثوقة':
   p.fusion.phase==='EARLY_CANDIDATE'?'توافق التهيئة المبكرة قبل اختبار الكسر':
   'توافق الاتجاه على إغلاقات الأطر';
 const className=side==='BUY'?'is-buy':side==='SELL'?'is-sell':'is-wait';
 const candidate=connected&&side!=='WAIT'&&p.preMove.ok&&
   p.fusion.early===side&&
   (p.preMove.stage==='BUILDING'||p.preMove.stage==='ARMED');
 const trigger=candidate?p.preMove.trigger:null;
 const invalidation=candidate?p.preMove.invalidation:null;
 const liquidity=p.liquidity.ready?
   side==='BUY'?p.liquidity.above:
   side==='SELL'?p.liquidity.below:null:null;
 const source=connected?'M1 / M5 / M15 · إغلاقات موثوقة':
   'لا تحديث لحظي مؤهل';
 return <section className={'sniper-scenario-hero '+className}
   aria-label="السيناريو الرئيسي للسعر" data-direction={side}
   data-source-ready={connected}>
   <div className="sniper-scenario-hero-top">
     <div className="sniper-scenario-identity">
       <span className="sniper-scenario-icon" aria-hidden="true">◎</span>
       <span><b>SCENARIO COMMAND</b>
         <small>{p.asset==='BTC'?'BITCOIN / BTCUSD':'GOLD / XAUUSD'} · M15</small></span>
     </div>
     <div className="sniper-scenario-live-status">
       <i aria-hidden="true"/>
       {connected?'سوق متصل · قراءة مشروطة':'مصدر غير جاهز / سوق مغلق'}
     </div>
   </div>
   <div className="sniper-scenario-hero-main">
     <div className="sniper-scenario-direction">
       <span>اتجاه الحركة المتوقع بشرط توافق الأدلة</span>
       <h2>{side==='BUY'?'↗ ':side==='SELL'?'↘ ':'↔ '}{direction}</h2>
       <p>{headline}</p>
       <div className="sniper-scenario-evidence-pills">
         <span>M1 <b>{p.fusion.m1==='BUY'?'↑ صعود':
           p.fusion.m1==='SELL'?'↓ هبوط':'—'}</b></span>
         <span>M15 <b>{p.fusion.m15==='BUY'?'↑ صعود':
           p.fusion.m15==='SELL'?'↓ هبوط':'—'}</b></span>
         <span>POC × FLOW <b>{p.flow?.ready?
           (p.flow.side==='BUY'?'↑ صعود':p.flow.side==='SELL'?'↓ هبوط':'متعارض'):
           'غير متاح'}</b></span>
         <span>سيولة <b>{p.liquidity.ready?
           p.liquidity.sweep==='HIGH_RECLAIMED_DOWN'?'رفض قمة':
           p.liquidity.sweep==='LOW_RECLAIMED_UP'?'استرداد قاع':
           'مستويات مرصودة':'غير متاحة'}</b></span>
       </div>
     </div>
     <div className="sniper-scenario-orbit" aria-hidden="true">
       <div className="sniper-scenario-orbit-ring">
         <span className="sniper-scenario-orbit-core">{side==='BUY'?'↗':side==='SELL'?'↘':'⌁'}</span>
       </div>
       <small>{connected?(side==='WAIT'?'MONITORING':'EVIDENCE ALIGNED'):'OFFLINE'}</small>
     </div>
     <div className="sniper-scenario-levels">
       <div><span>السعر المرصود</span>
         <strong dir="ltr">{connected?priceText(p.price):'—'}</strong></div>
       <div><span>اختبار الكسر</span>
         <strong dir="ltr">{priceText(trigger)}</strong></div>
       <div><span>إبطال التهيئة</span>
         <strong dir="ltr">{priceText(invalidation)}</strong></div>
       <div><span>تجمع سيولة أمام الاتجاه</span>
         <strong dir="ltr">{priceText(liquidity?.price)}</strong>
         {liquidity&&<small>{liquidity.touches} قمم/قيعان متكررة · مراقبة</small>}</div>
     </div>
   </div>
   <div className="sniper-scenario-hero-footer">
     <span>{source} · {p.flow?.ready?
       (p.flow.quality==='EXECUTED_SAMPLE'?'حجم منفذ Coinbase':'نشاط أسعار MT5 الاسترشادي'):
       'بيانات التدفق غير مؤهلة'}</span>
     <span>المستويات مشروطة؛ لا شموع مستقبلية أو أهداف مضمونة</span>
     <span dir="ltr">QANNAS / OBSERVATION ONLY</span>
   </div>
 </section>;
}
