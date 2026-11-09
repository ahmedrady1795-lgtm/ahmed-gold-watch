import type {BtcOrderflow} from './btc-orderflow';
import type {Mt5GoldDomReading} from './gold-mt5-dom';
import type {Mt5QuoteProfile} from './mt5-quote-profile';

export type FlowSide='BUY'|'SELL'|'WAIT';
export type FlowProfileDecision={
 ready:boolean;side:FlowSide;quality:'EXECUTED_SAMPLE'|'INDICATIVE_BROKER'|'UNAVAILABLE';
 profileBasis:'EXECUTED_TRADES'|'QUOTE_UPDATES'|'NONE';
 asOf:number|null;observedAt:number|null;poc:number|null;vah:number|null;val:number|null;
 flowPct:number|null;depthPct:number|null;strength:number;
 profileReady:boolean;orderFlowReady:boolean;confirmed:boolean;
 source:string;reason:string;actionable:false
};
type GoldInput={mode?:string;source?:string;brokerSymbol?:string|null;
  brokerDepth?:Mt5GoldDomReading|null;quoteProfile?:Mt5QuoteProfile|null};
const blank=(reason:string):FlowProfileDecision=>({
 ready:false,side:'WAIT',quality:'UNAVAILABLE',profileBasis:'NONE',
 asOf:null,observedAt:null,poc:null,vah:null,val:null,flowPct:null,depthPct:null,
 strength:0,profileReady:false,orderFlowReady:false,confirmed:false,
 source:'NONE',reason,actionable:false
});
const validPrice=(v:unknown):v is number=>
 typeof v==='number'&&Number.isFinite(v)&&v>0;
const recent=(at:unknown,now:number,maxMs:number)=>
 typeof at==='number'&&Number.isFinite(at)&&at>0&&at<=now+2000&&now-at>=0&&now-at<=maxMs;
/**
 * Causal-at-observation evidence. BTC: a partial, single-venue executed tape.
 * GOLD: broker quote updates and optional displayed DOM (NOT executed volume).
 * Show a quote-only POC when DOM is missing, without treating it as flow
 * agreement, a real exchange volume profile, or broker execution evidence.
 */
export function assessFlowProfile(input:{
 asset:'GOLD'|'BTC';price:number|null;now:number;observedAt?:number|null;
 sourceMatches:boolean;btc?:BtcOrderflow|null;gold?:GoldInput|null;
 bookSide?:FlowSide
}):FlowProfileDecision{
 const {asset,now}=input,price=input.price;
 // External GOLD quotes keep the chart alive but are not an MT5 flow feed.
 if(input.asset==='GOLD'&&input.gold?.mode!=='broker')
   return blank('لا يوجد اتصال مباشر Exness/MT5؛ السعر الخارجي للمراقبة فقط');
 if(!input.sourceMatches)return blank('السعر والشموع ليسا من نفس منصة بيانات التدفق؛ لا ندمج أسواق مختلفة');
 if(!validPrice(price)||!Number.isFinite(now))return blank('لا يوجد سعر موثوق');
 if(asset==='BTC'){
   const f=input.btc;
   if(!f?.ok||f.status!=='LIVE_SAMPLE'||!f.profile||!f.flow||
      !recent(f.asOf,now,12000)||f.coverage.trades<50||
      f.coverage.seconds<8||f.profile.rows.length<2)
      return blank('يلزم Volume Profile وصفقات منفذة حديثة كافية من Coinbase');
   const p=f.profile,delta=f.flow.deltaPct;
   if(![p.poc,p.vah,p.val,p.vwap,delta].every(Number.isFinite)||
     p.poc<=0||p.vah<p.val||p.poc<p.val||p.poc>p.vah)
     return blank('قيم POC / VAH / VAL أو دلتا غير صالحة');
   const deltaSide:FlowSide=delta>=16?'BUY':delta<=-16?'SELL':'WAIT';
   // Price location relative to POC AND VWAP is a separate family from trade delta.
   const location:FlowSide=price>p.poc&&price>=p.vwap?'BUY':
     price<p.poc&&price<=p.vwap?'SELL':'WAIT';
   const bookConflict=Boolean(input.bookSide&&input.bookSide!=='WAIT'&&
     input.bookSide!==deltaSide&&deltaSide!=='WAIT');
   const side:FlowSide=!bookConflict&&deltaSide===location?deltaSide:'WAIT';
   return {ready:true,side,quality:'EXECUTED_SAMPLE',
     profileBasis:'EXECUTED_TRADES',asOf:f.asOf,
     observedAt:input.observedAt??null,poc:p.poc,vah:p.vah,val:p.val,
     flowPct:delta,depthPct:null,
     strength:side==='WAIT'?0:Math.min(90,Math.round(40+Math.abs(delta)*.55+
       Math.min(15,f.coverage.trades/40))),
     profileReady:true,orderFlowReady:true,confirmed:side!=='WAIT',
     source:f.source,reason:bookConflict?
       'تعارض دفتر L2 مع دلتا الصفقات، تم تعليق الترجيح':
       side==='WAIT'?'الدلتا وموقع السعر من POC/VWAP غير متوافقين بعد':
       'اتفاق حجم منفذ عند السعر مع دلتا التنفيذ الهجومي (عينة جزئية من Coinbase)',
     actionable:false};
 }
 const g=input.gold,p=g?.quoteProfile,d=g?.brokerDepth;
 if(g?.mode!=='broker'||!/^XAUUSD[a-z0-9._-]*$/i.test(String(g?.brokerSymbol||''))||
   !p?.ready||!recent(p.asOf,now,8000)||p.samples<12||
   !validPrice(p.poc)||!validPrice(p.vah)||!validPrice(p.val))
   return blank('الذهب يحتاج عينات Bid/Ask حديثة من نفس وسيط MT5؛ لا توجد صفقات GC منفذة');
 if(!d?.available||!recent(d.asOf,now,7000)||d.samples<3||
    typeof d.imbalancePct!=='number'||!Number.isFinite(d.imbalancePct)){
   // Indicative price activity is visible, but absent depth never votes.
   return {ready:false,side:'WAIT',quality:'INDICATIVE_BROKER',
     profileBasis:'QUOTE_UPDATES',asOf:p.asOf,observedAt:input.observedAt??null,
     poc:p.poc,vah:p.vah,val:p.val,flowPct:p.directionalPct,depthPct:null,
     strength:0,profileReady:true,orderFlowReady:false,confirmed:false,
     source:'Exness/MT5 quote updates only',
     reason:'بروفايل نشاط السعر متاح من MT5؛ عمق السوق DOM غير متاح ولا يوجد حجم صفقات منفذة',
     actionable:false};
 }
 const pressure=p.directionalPct,depth=d.imbalancePct;
 const quoteSide:FlowSide=pressure>=12?'BUY':pressure<=-12?'SELL':'WAIT';
 const depthSide:FlowSide=depth>=12?'BUY':depth<=-12?'SELL':'WAIT';
 const location:FlowSide=price>=p.poc?'BUY':'SELL';
 const side:FlowSide=quoteSide===depthSide&&quoteSide===location?quoteSide:'WAIT';
 return {ready:true,side,quality:'INDICATIVE_BROKER',
   profileBasis:'QUOTE_UPDATES',asOf:Math.min(p.asOf!,d.asOf!),
   observedAt:input.observedAt??null,
   poc:p.poc,vah:p.vah,val:p.val,flowPct:pressure,depthPct:depth,
   strength:side==='WAIT'?0:Math.min(62,Math.round(25+
     Math.min(Math.abs(pressure),Math.abs(depth))*.45)),
   profileReady:true,orderFlowReady:true,confirmed:false,
   source:'Exness/MT5 broker quotes + displayed DOM',
   reason:side==='WAIT'?'تحديثات السعر وعمق الوسيط غير متفقين؛ رصد فقط':
     'اتفاق نشاط عروض الوسيط مع عمقه؛ إشارة استرشادية وليست حجم تداول منفذًا',
   actionable:false};
}
/**
 * A next-candle forecast must not be retroactively altered by observations
 * received after that candle started. Missing pre-issuance flow is unknown.
 */
export function flowAvailableBeforeM1(f:FlowProfileDecision|null|undefined,
 issuedAt:number):boolean{
 return Boolean(f?.ready&&f.side!=='WAIT'&&f.asOf!=null&&
   f.observedAt!=null&&Number.isFinite(f.observedAt)&&
   Number.isFinite(issuedAt)&&f.asOf<=issuedAt&&issuedAt-f.asOf<=15000&&
   f.observedAt<=issuedAt&&issuedAt-f.observedAt<=15000);
}
