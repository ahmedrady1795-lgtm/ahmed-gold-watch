import type {M15HuntPreview,HuntSide} from '../lib/sniper-m15-hunt-preview';
import type {M1Priority} from '../lib/sniper-m1-priority';

type Props={
  hunt:M15HuntPreview;m1:M1Priority;price:number|null;
  marketOpen:boolean;qualified:boolean;qualifiedSide:HuntSide|'WAIT';
};
const fmt=(x:number|null)=>x!=null&&Number.isFinite(x)&&x>0?
  x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
export default function SniperHuntHUD(p:Props){
 const observedSide=p.qualified?p.qualifiedSide:p.hunt.preferred;
 const title=observedSide==='BUY'?'↗ صعود':observedSide==='SELL'?'↘ هبوط':'↔ توازن';
 const sweep=p.hunt.sweep==='HIGH_REJECTION'?'سحب قمة / رفض':
   p.hunt.sweep==='LOW_REJECTION'?'سحب قاع / ارتداد':'لا سحب مؤكد';
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
   <small className="sniper-hunt-hud-state">
     {!p.marketOpen?'السوق مغلق · مرجع سابق':
       p.hunt.referenceOnly?'بيانات M15 سابقة · ليست إشارة حية':
       'قوة النمط مؤشر غير مُعاير · ليس احتمال نجاح'}
   </small>
 </section>;
}
