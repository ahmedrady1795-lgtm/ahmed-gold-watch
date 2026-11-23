/**
 * Display a cached, already-issued GOLD closed-M1 early observation on the
 * original XAUUSD chart. This is a PRICE-ONLY research watch, never DOM,
 * executed order flow, an MT5 fill, or a BUY/SELL trade authorization.
 */
export type GoldLocalWatchView={
  status:string;side:'BUY'|'SELL'|'WAIT';score:number;
  evidenceClass:string;issuedFromClosedM1At:number|null;
  checkedAt:number;quoteAt:number|null;quotePrice:number|null;
  quoteSource:string;candleSource:string;reason:string;
};
export type VisibleGoldLocalWatch={
  side:'BUY'|'SELL';score:number;issuedAt:number;reason:string;
};
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isFinite(v)&&v>0;
const stamp=(v:unknown):v is number=>positive(v)&&Number.isSafeInteger(v);
export function selectGoldLocalWatch(a:{
  now:number;marketOpen:boolean;priceFresh:boolean;providerTransition:boolean;
  price:number|null;quoteSource:string;chartSource:string;
  view:GoldLocalWatchView|null;
}):VisibleGoldLocalWatch|null{
  const v=a.view,now=a.now;
  if(!stamp(now)||!a.marketOpen||!a.priceFresh||a.providerTransition||
    !positive(a.price)||!v)return null;
  // Only an unqualified prospective PRICE watch can use this fallback:
  // a previously crossed breakout or a broker order is never reconstructed.
  if(v.status!=='EARLY_WATCH'||v.evidenceClass!=='CLOSED_M1_ONLY'||
    (v.side!=='BUY'&&v.side!=='SELL')||!Number.isFinite(v.score)||
    v.score<50||v.score>100)return null;
  if(!a.chartSource||!a.quoteSource||
    a.chartSource!==v.candleSource||a.quoteSource!==v.quoteSource)return null;
  if(!stamp(v.checkedAt)||!stamp(v.issuedFromClosedM1At)||
    !stamp(v.quoteAt)||!positive(v.quotePrice)||v.checkedAt>now||
    v.quoteAt>v.checkedAt||v.issuedFromClosedM1At>v.checkedAt||
    now-v.checkedAt>25000||now-v.quoteAt>30000||
    now-v.issuedFromClosedM1At>90000)return null;
  // A fast move away from the source quote makes a prior price-only reading
  // obsolete. Never follow/chase it as a fresh early BUY/SELL label.
  if(Math.abs(a.price-v.quotePrice)>Math.max(.12,a.price*.00025))
    return null;
  return {side:v.side,score:Math.round(v.score),
    issuedAt:v.issuedFromClosedM1At,reason:v.reason};
}
