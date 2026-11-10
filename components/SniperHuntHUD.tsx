import type {M15HuntPreview,HuntSide} from '../lib/sniper-m15-hunt-preview';
import type {M1Priority} from '../lib/sniper-m1-priority';
import type {M15HuntProof} from '../lib/sniper-m15-hunt-proof';
import {assessM15HuntDisplay} from '../lib/sniper-m15-display-evidence';

type Props={
  hunt:M15HuntPreview;m1:M1Priority;price:number|null;
  marketOpen:boolean;qualified:boolean;qualifiedSide:HuntSide|'WAIT';
  proof?:M15HuntProof;flowSide?:HuntSide|'WAIT';
};
const fmt=(x:number|null)=>x!=null&&Number.isFinite(x)&&x>0?
  x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
export default function SniperHuntHUD(p:Props){
 const evidence=assessM15HuntDisplay({
   hunt:p.hunt,m1:p.m1,proof:p.proof,marketOpen:p.marketOpen,
   flowSide:p.flowSide
 });
 const observedSide=p.qualified?p.qualifiedSide:evidence.side;
 const title=observedSide==='BUY'?'↗ صعود':
   observedSide==='SELL'?'↘ هبوط':
   evidence.state==='CONFLICT'?'↔ تعارض الأطر':'↔ توازن';
 const sweep=p.hunt.sweep==='HIGH_REJECTION'?'سحب قمة / رفض':
   p.hunt.sweep==='LOW_REJECTION'?'سحب قاع / ارتداد':'لا سحب مؤكد';
 const observation=p.hunt.observation;
 const quality=observation?.quality==='CLEAR'?'أدلة متوافقة':
   observation?.quality==='MIXED'?'ترجيح مختلط':'ترجيح ضعيف';
 const disagreement=evidence.state==='CONFLICT';
 const nextM1=p.marketOpen&&p.m1.ready?
   p.m1.side==='BUY'?'↑ M1':p.m1.side==='SELL'?'↓ M1':'↔ M1':'M1 —';
 return <section className="sniper-hunt-hud" role="status"
   aria-label="راصد السيولة المبني على الشموع المغلقة">
   <div className="sniper-hunt-hud-brand">
     <small>AL-QANNAS · LIQUIDITY HUNTER</small>
     <b>{p.hunt.ready?title:'تحليل انتظار'}
       <span>{p.qualified?' · سيناريو محفوظ':' · مراقبة'}</span></b>
   </div>
   <div className="sniper-hunt-hud-data">
     <span><small>السعر</small><b dir="ltr">{fmt(p.price)}</b></span>
     <span><small>قوة النمط</small><b dir="ltr">{p.hunt.ready?
       p.hunt.strength+'/100':'—'}</b></span>
     <span><small>السيولة / الشموع</small><b>{sweep}</b></span>
     <span className="is-next"><small>الشمعة القادمة</small><b>{nextM1}</b></span>
   </div>
   {p.hunt.ready&&observation&&<small className="sniper-hunt-hud-observation">
     <b>{'راصد M15 · '+quality+' · صعود '+observation.buyPoints+
        ' / هبوط '+observation.sellPoints}</b>
     <span>{observation.reasons.slice(0,3).join(' · ')||
        'لا دليل اتجاه كافٍ · المساران للمراقبة'}</span>
     {(observation.warnings.length>0||disagreement)&&
       <em>{[...observation.warnings.slice(0,1),
         ...(disagreement?[evidence.reason]:[])].join(' · ')}</em>}
   </small>}
   <small className="sniper-hunt-hud-state">
     {!p.marketOpen?'السوق مغلق · مرجع سابق':
       p.hunt.referenceOnly?'بيانات M15 سابقة · ليست إشارة حية':
       evidence.reason+' · قوة النمط ليست احتمال نجاح'}
   </small>
 </section>;
}
