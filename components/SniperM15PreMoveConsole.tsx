import type {CSSProperties} from 'react';
import type {PreMovePressure} from '../lib/pre-move-pressure';
import type {M15HuntPreview} from '../lib/sniper-m15-hunt-preview';
import type {M1Priority} from '../lib/sniper-m1-priority';
import type {LiquidityMagnetView} from '../lib/sniper-liquidity-magnets';
import type {LocalFusion} from '../lib/sniper-local-fusion';

type Side='BUY'|'SELL'|'WAIT';
type Props={
 preMove:PreMovePressure;hunt:M15HuntPreview;m1:M1Priority;
 liquidity:LiquidityMagnetView;fusion:LocalFusion;
 marketOpen:boolean;dataFresh:boolean;providerTransition:boolean;
};
const pretty=(v:number|null|undefined)=>v!=null&&Number.isFinite(v)&&v>0?
 v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const bounded=(v:number)=>Math.max(0,Math.min(100,Number.isFinite(v)?v:0));
/** Read-only EARLY FLOW console: no tick spoofing, institutional identity,
 * broker entry or future candle data. M15 and M1 grades are distinct.
 */
export default function SniperM15PreMoveConsole(p:Props){
 const fresh=p.marketOpen&&p.dataFresh&&!p.providerTransition;
 const premove=fresh&&p.preMove.ok&&
   (p.preMove.stage==='ARMED'||p.preMove.stage==='BUILDING')&&
   p.preMove.side!=='WAIT';
 const m15=fresh&&p.hunt.ready&&!p.hunt.referenceOnly&&
   p.hunt.observation?.quality==='CLEAR'&&!p.hunt.observation?.conflicting&&
   p.hunt.preferred!=='WAIT';
 const m1=fresh&&p.m1.ready&&p.m1.side!=='WAIT';
 const side:Side=p.fusion.side;
 const stage=!fresh?'STALE':p.fusion.phase==='DISAGREEMENT'?'CONFLICT':
   p.fusion.phase==='EARLY_CANDIDATE'?'PRE_BREAK':
   p.fusion.phase==='M15_CONFLUENCE'?'M15_BIAS':'WAIT';
 const headline=stage==='STALE'?'السوق أو البيانات غير جاهزة':
   stage==='CONFLICT'?'تعارض بين ضغط M1/M5 ومسار M15':
   stage==='PRE_BREAK'?'تهيئة محتملة قبل الكسر':
   stage==='M15_BIAS'?'ميل M15 مرصود · ينتظر تفعيلًا':'لم تتجمع قرائن كافية بعد';
 const ink=side==='BUY'?'#55eec8':side==='SELL'?'#ff8ba8':'#d9c692';
 // Only a real closed-M1/M5 PREMOVE setup provides a trigger. ATR
 // watch paths from M15 are descriptive and never masquerade as a level.
 const liveTrigger=premove?p.preMove.trigger:null;
 const invalidation=premove?p.preMove.invalidation:null;
 const compression=bounded(premove?p.preMove.compression:p.hunt.observation?.compressionPct??0);
 const pressure=bounded(premove?p.preMove.pressure:
   Math.abs((p.hunt.observation?.buyPoints??0)-(p.hunt.observation?.sellPoints??0))*5);
 const hints=premove?p.preMove.evidence.slice(0,3):
   (m15?p.hunt.observation?.reasons.filter(r=>r.startsWith(side==='BUY'?'↑':'↓')).slice(0,3):[])||[];
 const m1Label=!m1?'M1 غير حاسم':
   m1&&side!=='WAIT'&&p.m1.side===side?'M1 مؤيد':
   m1&&side!=='WAIT'?'M1 معاكس':'M1 قيد المراقبة';
 return <section className={'sniper-early-console is-'+stage.toLowerCase()}
   aria-label="مركز استباق الحركة من شموع مغلقة" data-early-stage={stage}
   style={{'--early-accent':ink} as CSSProperties}>
   <div className="sniper-early-console-header">
     <span className="sniper-early-label">
       <i aria-hidden="true" className="sniper-early-dot"/>
       EARLY FLOW <small>· رادار الحركة المسبقة</small>
     </span>
     <span className="sniper-early-phase">{stage==='PRE_BREAK'?'PRE-BREAK':
       stage==='M15_BIAS'?'STRUCTURE WATCH':stage==='CONFLICT'?'CONFLICT':
       stage==='STALE'?'OFFLINE':'SCANNING'}</span>
   </div>
   <div className="sniper-early-body">
     <div className="sniper-early-direction">
       <span className="sniper-early-kicker">قراءة اتجاه مشروطة</span>
       <strong>{side==='BUY'?'↗ صعود محتمل':side==='SELL'?'↘ هبوط محتمل':'↔ مراقبة بدون ترجيح'}</strong>
       <small>{headline}</small>
     </div>
     <div className="sniper-early-telemetry">
       <div className="sniper-early-meter">
         <span><b>انضغاط الحركة</b><em>{Math.round(compression)}/100</em></span>
         <div role="meter" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={Math.round(compression)} aria-label="درجة انضغاط الحركة">
           <i style={{width:compression+'%'}}/>
         </div>
       </div>
       <div className="sniper-early-meter">
         <span><b>ضغط الإغلاقات</b><em>{Math.round(pressure)}/100</em></span>
         <div role="meter" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={Math.round(pressure)} aria-label="درجة ضغط الإغلاقات">
           <i style={{width:pressure+'%'}}/>
         </div>
       </div>
     </div>
     <div className="sniper-early-levels">
       <span><small>اختبار الكسر</small><b dir="ltr">{pretty(liveTrigger)}</b></span>
       <span><small>إبطال الفكرة</small><b dir="ltr">{pretty(invalidation)}</b></span>
       <span><small>تأكيد الأطر</small><b>{m1Label}</b></span>
     </div>
   </div>
   <div className="sniper-fusion-2026" aria-label="محرك التوافق الذكي المحلي">
     <div>
       <strong>LOCAL AI FUSION</strong>
       <small>ترجيح سببي مستقل عن خدمات ML وNeural الخارجية</small>
     </div>
     <div className="sniper-fusion-votes" aria-label="توافق الأطر المغلقة">
       <span>M1 <b>{p.fusion.m1==='BUY'?'↑':p.fusion.m1==='SELL'?'↓':'—'}</b></span>
       <span>M15 <b>{p.fusion.m15==='BUY'?'↑':p.fusion.m15==='SELL'?'↓':'—'}</b></span>
       <span>PREMOVE <b>{p.fusion.early==='BUY'?'↑':p.fusion.early==='SELL'?'↓':'—'}</b></span>
       <span>CONFLUENCE <b>{p.fusion.phase==='OFFLINE'?'OFFLINE':
         p.fusion.phase==='DISAGREEMENT'?'CONFLICT':
         p.fusion.side==='WAIT'?'WATCH':p.fusion.side==='BUY'?'BUY WATCH':'SELL WATCH'}</b></span>
     </div>
     <small className="sniper-fusion-honesty">
       درجة توافق الأدلة وصفية وليست احتمال نجاح، ولا تسمح بتنفيذ صفقة.
     </small>
   </div>
   <div className="sniper-liquidity-magnets" aria-label="رادار مستويات السيولة المتكررة">
     <div className="sniper-liquidity-magnets-head">
       <strong>LIQUIDITY MAP 2026</strong>
       <small>{p.liquidity.ready?p.liquidity.reason:
         'أدلة M15 المغلقة غير كافية'}</small>
     </div>
     <div className="sniper-liquidity-magnet-cards">
       <div><small>سيولة محتملة أعلى القمم</small>
         <b dir="ltr">{pretty(p.liquidity.above?.price)}</b>
         <span>{p.liquidity.above?
           p.liquidity.above.touches+' اختبارات قمة · '+p.liquidity.above.distanceAtr+' ATR':
           'لا تجمع مؤكد'}</span>
       </div>
       <div><small>سيولة محتملة أسفل القيعان</small>
         <b dir="ltr">{pretty(p.liquidity.below?.price)}</b>
         <span>{p.liquidity.below?
           p.liquidity.below.touches+' اختبارات قاع · '+p.liquidity.below.distanceAtr+' ATR':
           'لا تجمع مؤكد'}</span>
       </div>
       <div><small>سحب السيولة المكتمل</small>
         <b>{p.liquidity.sweep==='HIGH_RECLAIMED_DOWN'?'رفض قمة':
           p.liquidity.sweep==='LOW_RECLAIMED_UP'?'استرداد قاع':'غير مرصود'}</b>
         <span>من OHLC مغلق فقط · ليس دفتر أوامر</span>
       </div>
     </div>
   </div>
   <div className="sniper-early-evidence">
     {hints.length?hints.map((item,i)=><span key={i}>{item}</span>):
       <span>{!fresh?'بيانات حديثة لازمة قبل إصدار أي تهيئة':
         'نراقب الانضغاط والقمم والقيعان وسحب السيولة'}</span>}
     {p.hunt.sweep!=='NONE'&&fresh&&<span>
       {p.hunt.sweep==='HIGH_REJECTION'?'رفض سيولة القمم M15':
         'استرداد سيولة القيعان M15'}</span>}
   </div>
   <small className="sniper-early-disclaimer">
     درجات وصفية وليست نسب نجاح · بيانات M1/M5/M15 مغلقة فقط ·
     لا يكشف أوامر مخفية ولا يفتح صفقة · لا أهداف معتمدة قبل تفعيل موثوق.
   </small>
 </section>;
}
