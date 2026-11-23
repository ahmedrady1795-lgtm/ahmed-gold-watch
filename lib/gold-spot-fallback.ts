import type {GoldLeadEvent} from './gold-preparation-lead.ts';
import {goldQuoteMatchesCandles} from './gold-preparation-lead.ts';

/** The already-running server recorder issues prospectively timestamped
 * GOLD spot PRICE plans. This function only decides whether one can be
 * DISPLAYED on the XAUUSD chart; it never certifies DOM, GC prints or fills.
 * Absence of a valid plan is neutral and never turns M5 momentum into BUY.
 */
export type GoldPreparationView={
 status:string;
 current:GoldLeadEvent|null;
 observation?:{
   checkedAt?:number;source?:string;quoteSource?:string;
   quoteAt?:number;price?:number;reason?:string;
 }|null;
};
export type GoldSpotDisplay={
 id:string;issuedAt:number;side:'BUY'|'SELL';
 trigger:number;invalidation:number;target:number;
 source:string;label:string;reason:string;method:'SPOT_PRICE_PREPARATION';
};
const good=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
export function selectGoldSpotDisplay(a:{
 now:number;marketFresh:boolean;chartSource:string;
 quoteSource:string;quoteAt:number|null;price:number|null;
 view:GoldPreparationView|null;
}):GoldSpotDisplay|null{
 const {now,view}=a,p=view?.current,obs=view?.observation;
 if(!Number.isSafeInteger(now)||!a.marketFresh||view?.status!=='OBSERVING'||
    !p||p.status!=='ARMED'||p.method!=='SPOT_PRICE_PREPARATION'||
    !['BUY','SELL'].includes(p.side)||!obs)return null;
 if(!goldQuoteMatchesCandles(a.quoteSource,a.chartSource)||
    p.source!==a.chartSource||p.quoteSource!==a.quoteSource||
    obs.source!==p.source||obs.quoteSource!==p.quoteSource)return null;
 if(!good(p.issuedAt)||p.issuedAt>now||now-p.issuedAt>5*60000||
    !good(p.armUntil)||now>=p.armUntil||p.armUntil-p.issuedAt>7*60000||
    !good(p.contextAt)||p.contextAt>p.issuedAt||
    !good(p.quoteAt)||p.quoteAt>p.issuedAt+2000||
    p.issuedAt-p.quoteAt>10000)return null;
 if(!good(obs.checkedAt)||obs.checkedAt>now+1500||
    now-obs.checkedAt>45000||!good(obs.quoteAt)||
    obs.quoteAt>now+1500||now-obs.quoteAt>20000||
    !good(a.quoteAt)||a.quoteAt>now+1500||now-a.quoteAt>10000)return null;
 const price=a.price;
 if(!good(price)||!good(obs.price)||
    ![p.trigger,p.invalidate,p.target].every(good))return null;
 const sign=p.side==='BUY'?1:-1;
 const risk=sign*(p.trigger-p.invalidate);
 const reward=sign*(p.target-p.trigger);
 const ahead=sign*(p.trigger-price);
 // Require a REAL historical target and a remaining positive pre-break
 // buffer; never resurrect an already-crossed or expired alert.
 if(!(risk>0&&reward>=1.35*risk&&ahead>Math.max(.01,risk*.04)&&
      ahead<=risk*.80&&sign*(price-p.invalidate)>0&&
      Math.abs(obs.price-price)<=risk*.65))return null;
 return {id:p.id,issuedAt:p.issuedAt,side:p.side,trigger:p.trigger,
   invalidation:p.invalidate,target:p.target,source:p.source,
   label:p.side==='BUY'?'خطة شراء سعرية مشروطة':'خطة بيع سعرية مشروطة',
   reason:p.reason,method:'SPOT_PRICE_PREPARATION'};
}
