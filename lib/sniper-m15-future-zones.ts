/** Price-authentic zones to watch IN FRONT OF the live M15 candle.
 * Drawn in forecast viewport even in WAIT. They are historical closed-bar
 * liquidity/structure references, NOT observed future orders or trades.
 */
import type {LiquidityLayers,LiquidityZone} from './sniper-m15-liquidity';
import type {M15Bar} from './sniper-m15-scenario';
export type ForwardWatchZone={
 key:'SUPPLY'|'DEMAND'|'HIGH_POOL'|'LOW_POOL';
 low:number;high:number;price:number;
 label:string;subtitle:string;source:string;
 confirm:number;invalidate:number;historical:true;actionable:false
};
const valid=(v:number)=>Number.isFinite(v)&&v>0;
const q=(v:number)=>Number(v.toFixed(4));
export function futureM15WatchZones(input:{
 now:number;history:readonly M15Bar[];liquidity:LiquidityLayers;
 sourceReady:boolean
}):ForwardWatchZone[]{
 const {history,liquidity,now}=input;
 if(!input.sourceReady||!liquidity.ready||history.length<26)return [];
 const last=history.at(-1)!;
 const closed=history.slice(-26);
 if(closed.some((b,i)=>!Number.isFinite(b.time)||b.time%900000!==0||
    b.time+900000>now||b.low<=0||b.high<Math.max(b.open,b.close)||
    b.low>Math.min(b.open,b.close)||
    (i>0&&b.time-closed[i-1].time!==900000)))return [];
 const atrRows=closed.slice(-15);
 const tr=atrRows.slice(1).map((b,i)=>Math.max(
   b.high-b.low,Math.abs(b.high-atrRows[i].close),
   Math.abs(b.low-atrRows[i].close)));
 const atr=tr.reduce((s,v)=>s+v,0)/tr.length;
 if(!valid(atr))return [];
 const anchor=last.close;
 const pick=(k:ForwardWatchZone['key'],names:LiquidityZone['kind'][])=>{
  const pool=liquidity.zones.filter(z=>names.includes(z.kind)&&
    valid(z.low)&&valid(z.high)&&z.low<=z.high&&
    (z.confirmedAt==null||z.confirmedAt<=now)&&
    Math.abs((z.low+z.high)/2-anchor)<=atr*16);
  if(!pool.length)return null;
  // Demand from below, supply from above. A live quote crossing a level
  // is not proof of a trade or a new institutional order.
  pool.sort((a,b)=>{
   const d=(z:LiquidityZone)=>Math.abs((z.high+z.low)/2-anchor);
   const sign=k==='SUPPLY'||k==='HIGH_POOL'?1:-1;
   const f=(z:LiquidityZone)=>sign*((z.low+z.high)/2-anchor)<-atr*.2?atr*50:0;
   return d(a)+f(a)-d(b)-f(b);
  });
  return pool[0];
 };
 const choices:[
  ForwardWatchZone['key'],LiquidityZone['kind'][],string,string
 ][]=[
  ['SUPPLY',['SUPPLY','REBOUND_DOWN'],'عرض · رفض؟','إغلاق هابط بعد اختبار العرض'],
  ['DEMAND',['DEMAND','REBOUND_UP'],'طلب · ارتداد؟','إغلاق صاعد بعد اختبار الطلب'],
  ['HIGH_POOL',['HIGH_POOL'],'سيولة قمم','سحب القمة وعودة السعر أسفلها أو اختراق مؤكّد'],
  ['LOW_POOL',['LOW_POOL'],'سيولة قيعان','سحب القاع وعودة السعر أعلاه أو كسر مؤكّد']
 ];
 const result:ForwardWatchZone[]=[];
 for(const [key,names,label,subtitle] of choices){
  const z=pick(key,names);if(!z)continue;
  const up=key==='DEMAND'||key==='LOW_POOL';
  const low=q(z.low),high=q(z.high);
  const buffer=Math.max(atr*.13,anchor*.000006);
  result.push({key,low,high,price:q((low+high)/2),
   label,subtitle,source:z.source,confirm:q(up?high+buffer:low-buffer),
   invalidate:q(up?low-buffer:high+buffer),
   historical:true,actionable:false});
 }
 // Do not print multiple big labels at identical prices. Preserve the
 // strongest demand/supply reference before secondary stop-pool levels.
 const unique:ForwardWatchZone[]=[];
 for(const z of result){
  if(unique.some(x=>Math.abs(x.price-z.price)<atr*.36))continue;
  unique.push(z);
 }
 return unique.slice(0,4);
}
export function conditionalM15BreakoutLevels(input:{
 now:number;history:readonly M15Bar[];sourceReady:boolean
}):{upper:number;lower:number;valid:boolean;note:string}{
 const none={upper:0,lower:0,valid:false,note:'تحتاج شموع M15 مغلقة ومتصلة'};
 if(!input.sourceReady||input.history.length<18)return none;
 const rows=input.history.slice(-18);
 if(rows.some((b,i)=>b.time+900000>input.now||b.time%900000!==0||
   b.low<=0||b.high<Math.max(b.open,b.close)||
   b.low>Math.min(b.open,b.close)||
   (i>0&&b.time-rows[i-1].time!==900000)))return none;
 // Last 12 fully completed M15 candles. Both sides are conditions, not
 // a directional forecast. Do not manufacture order book liquidity.
 const window=rows.slice(-12);
 const upper=Math.max(...window.map(b=>b.high));
 const lower=Math.min(...window.map(b=>b.low));
 return {upper:q(upper),lower:q(lower),valid:upper>lower,
   note:'إغلاق M15 خارج النطاق شرط للمراقبة، وليس إشارة دخول'};
}
