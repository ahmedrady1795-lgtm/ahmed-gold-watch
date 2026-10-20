/** Explanatory, price-true reaction locations for a FROZEN illustrative M15
 * route. A historical demand/supply zone is OBSERVED; a future touch/turn is
 * always SIMULATED. This module never changes goals, bars, or execution.
 */
import type {M15Scenario,M15Side} from './sniper-m15-scenario';
import type {LiquidityLayers,LiquidityZone} from './sniper-m15-liquidity';
export type ReactionBand={low:number;high:number;price:number;
 kind:'DEMAND'|'SUPPLY'|'REBOUND_UP'|'REBOUND_DOWN';
 source:string;invalidation:number|null;label:string};
export type ReactionMark={step:number;price:number;direction:'UP'|'DOWN';
 kind:'ZONE_TOUCH'|'PATTERN_TURN';label:string;detail:string;
 invalidation:number|null};
export type M15ReactionMap={bands:ReactionBand[];marks:ReactionMark[]};
export const emptyReactionMap=():M15ReactionMap=>({bands:[],marks:[]});
const valid=(n:number)=>Number.isFinite(n)&&n>0;
export function buildM15ReactionMap(input:{
 scenario:M15Scenario;liquidity:LiquidityLayers;
 side:M15Side;anchor:number|null;now:number;stop?:number|null
}):M15ReactionMap{
 const {scenario,liquidity,side,now,stop}=input;
 const anchor=input.anchor;
 const blank=emptyReactionMap();
 if(!scenario.ready||!liquidity.ready||side==='WAIT'||
  !valid(anchor??NaN)||scenario.bars.length<3||
  !valid(scenario.atr??NaN)||!Number.isFinite(now))return blank;
 const buy=side==='BUY',dir=buy?'UP' as const:'DOWN' as const;
 const typeAllowed=buy?['DEMAND','REBOUND_UP']:['SUPPLY','REBOUND_DOWN'];
 const sameSide=(z:LiquidityZone)=>typeAllowed.includes(z.kind);
 const candidates=liquidity.zones.filter(z=>sameSide(z)&&
   valid(z.low)&&valid(z.high)&&z.high>=z.low&&
   (z.confirmedAt==null||z.confirmedAt<=now)&&
   (stop==null||(buy?z.high>stop:z.low<stop))&&
   Math.abs((z.high+z.low)/2-anchor!)<=scenario.atr!*9);
 const unique:LiquidityZone[]=[];
 for(const z of candidates.sort((a,b)=>
   Math.abs((a.low+a.high)/2-anchor!)-
   Math.abs((b.low+b.high)/2-anchor!))){
  if(unique.some(k=>Math.abs((k.high+k.low-z.high-z.low)/2)<
      scenario.atr!*.35))continue;
  unique.push(z);
 }
 // Nearest verified historical reaction band remains visible even when the
 // illustrated route never touches it. We do NOT claim a future reaction.
 const bands:ReactionBand[]=unique.slice(0,1).map(z=>({
   low:z.low,high:z.high,price:(z.low+z.high)/2,
   kind:z.kind as ReactionBand['kind'],source:z.source,
   invalidation:z.invalidation??(buy?z.low:z.high),
   label:buy?'منطقة ارتداد محتمل':'منطقة رفض محتمل'
 }));
 const bars=scenario.bars;
 const marks:ReactionMark[]=[];
 const threshold=Math.max(scenario.atr!*.08,anchor!*.000005);
 const stopHit=(price:number)=>stop!=null&&(buy?price<=stop:price>=stop);
 for(let i=1;i<bars.length-1;i++){
  const bar=bars[i],prev=bars[i-1],next=bars[i+1];
  const turn=buy?
    next.close>bar.close+threshold&&next.close>next.open:
    next.close<bar.close-threshold&&next.close<next.open;
  if(!turn)continue;
  const zone=bands.find(z=>bar.high>=z.low&&bar.low<=z.high&&
     (buy?bar.low<prev.close:bar.high>prev.close));
  if(!zone)continue;
  const price=buy?Math.max(bar.low,zone.low):Math.min(bar.high,zone.high);
  if(stopHit(price)||marks.some(m=>Math.abs(m.step-(i+1))<4))continue;
  marks.push({step:i+1,price,direction:dir,kind:'ZONE_TOUCH',
    label:buy?'ارتداد؟':'رفض؟',invalidation:zone.invalidation,
    detail:'تلامس افتراضي مع '+zone.label+' '+zone.source+
      '، وتحول لاحق في شموع المحاكاة فقط؛ ليس تأكيدًا من السوق'});
  if(marks.length>=2)break;
 }
 // If no verified zone was touched, mark ONE actual inflection in the
 // simulated OHLC route. This is a visual analogue turn, NOT demand/supply.
 if(!marks.length){
  for(let i=2;i<bars.length-2;i++){
   const b=bars[i],p=bars[i-1],next=bars[i+1];
   const pivot=buy?
     b.low<p.low&&b.low<next.low&&
     p.close>b.close+threshold&&next.close>b.close+threshold:
     b.high>p.high&&b.high>next.high&&
     p.close<b.close-threshold&&next.close<b.close-threshold;
   const price=buy?b.low:b.high;
   if(!pivot||stopHit(price))continue;
   marks.push({step:i+1,price,direction:dir,
     kind:'PATTERN_TURN',label:'انعطاف افتراضي',
     detail:'قاع/قمة في شموع السيناريو المحاكية فقط؛ ليس منطقة طلب/عرض مؤكدة',
     invalidation:null});
   break;
  }
 }
 return {bands,marks};
}
