/**
 * Read-only price zones for the sniper cockpit. No order-book inference:
 * BUY/SELL areas are observed OHLC demand/supply, NOT institutional orders.
 * A broken zone is excluded after a fully CLOSED M15 candle invalidates it.
 */
import type {LiquidityLayers,LiquidityZone} from './sniper-m15-liquidity';
import type {WatchPriceMap} from './sniper-m15-watch-prices';

type Candle={time:number;open:number;high:number;low:number;close:number};
export type LiquidityBoardItem={
 key:'SELL'|'BUY'|'HIGH_LIQ'|'LOW_LIQ';
 label:string;low:number|null;high:number|null;source:string;
 status:'OBSERVED'|'REACTION'|'NONE';hint:string
};
export type LiquidityBoard={
 ready:boolean;reason:string;items:LiquidityBoardItem[];
 context:{label:string;low:number;high:number;historical:boolean}|null
};
const valid=(x:number)=>Number.isFinite(x)&&x>0;
const center=(z:{low:number;high:number})=>(z.low+z.high)/2;
export function buildM15LiquidityBoard(input:{
 liquidity:LiquidityLayers;watch:WatchPriceMap;history:readonly Candle[];
 price:number|null;now:number
}):LiquidityBoard{
 const blank=(key:LiquidityBoardItem['key'],label:string,hint:string):LiquidityBoardItem=>({
   key,label,low:null,high:null,status:'NONE',source:'',hint
 });
 const empty=(reason:string):LiquidityBoard=>({
   ready:false,reason,context:null,items:[
     blank('SELL','تصريف / بيع محتمل','لا توجد منطقة عرض صالحة'),
     blank('BUY','تجميع / شراء محتمل','لا توجد منطقة طلب صالحة'),
     blank('HIGH_LIQ','سيولة أعلى القمم','لا توجد قمة مرصودة'),
     blank('LOW_LIQ','سيولة أسفل القيعان','لا يوجد قاع مرصود')
   ]
 });
 const {liquidity,history,price,now,watch}=input;
 if(!liquidity.ready||price==null||!valid(price))
   return empty(liquidity.reason||'مصدر الشموع أو السعر غير متاح');
 const last=history.at(-1);
 if(!last||last.time+900000>now||now-(last.time+900000)>36*60000)
   return empty('تحديث M15 غير متاح');
 const closed=history.slice(-52).filter(b=>b.time+900000<=now&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite));
 const invalidated=(z:LiquidityZone)=>{
   if(z.confirmedAt!=null&&z.confirmedAt>now)return true;
   const later=closed.filter(b=>b.time+900000>(z.confirmedAt??now));
   return (z.kind==='DEMAND'||z.kind==='REBOUND_UP')?
     later.some(b=>b.close<z.low):
     (z.kind==='SUPPLY'||z.kind==='REBOUND_DOWN')?
       later.some(b=>b.close>z.high):false;
 };
 const zones=liquidity.zones.filter(z=>valid(z.low)&&valid(z.high)&&
   z.low<=z.high&&!invalidated(z));
 const choose=(kinds:LiquidityZone['kind'][],side:'UP'|'DOWN')=>{
   const candidates=zones.filter(z=>kinds.includes(z.kind)&&
     (side==='UP'?z.high>=price:z.low<=price));
   return candidates.sort((a,b)=>Math.abs(center(a)-price)-Math.abs(center(b)-price))[0]??null;
 };
 const supply=choose(['SUPPLY','REBOUND_DOWN'],'UP');
 const demand=choose(['DEMAND','REBOUND_UP'],'DOWN');
 const highPool=zones.filter(z=>z.kind==='HIGH_POOL'&&z.high>price)
   .sort((a,b)=>center(a)-center(b))[0]??null;
 const lowPool=zones.filter(z=>z.kind==='LOW_POOL'&&z.low<price)
   .sort((a,b)=>center(b)-center(a))[0]??null;
 const zoneItem=(key:LiquidityBoardItem['key'],label:string,
   z:LiquidityZone|null,hint:string):LiquidityBoardItem=>z?({
     key,label,low:z.low,high:z.high,source:z.source,
     status:z.kind==='REBOUND_UP'||z.kind==='REBOUND_DOWN'?'REACTION':'OBSERVED',
     hint:z.kind==='REBOUND_UP'?'ارتداد مؤكد بشموع مغلقة · ليس دخولًا':
       z.kind==='REBOUND_DOWN'?'رفض مؤكد بشموع مغلقة · ليس دخولًا':hint
   }):blank(key,label,'لا توجد منطقة صالحة حاليًا');
 const poolItem=(key:'HIGH_LIQ'|'LOW_LIQ',label:string,z:LiquidityZone|null,
   fallback:number|null):LiquidityBoardItem=>{
   if(z)return zoneItem(key,label,z,'قمة/قاع مرصود · احتمال سحب سيولة');
   if(fallback!=null&&valid(fallback))return {
     key,label,low:fallback,high:fallback,source:'قمة/قاع M15 أو H1 مغلق',
     status:'OBSERVED',hint:'مستوى تاريخي للمراقبة، وليس أوامر مؤكدة'
   };
   return blank(key,label,'لا توجد مستويات صالحة حاليًا');
 };
 const upper=watch.ready?watch.upper.find(x=>x.price>price)?.price??null:null;
 const lower=watch.ready?watch.lower.find(x=>x.price<price)?.price??null:null;
 const ctx=liquidity.context;
 const context=ctx&&valid(ctx.low)&&valid(ctx.high)&&ctx.high>=ctx.low&&
   ctx.to<=now&&ctx.to>=now-52*900000?{
      label:ctx.kind==='ACCUMULATION'?'تجميع سعري مرصود':
        ctx.kind==='DISTRIBUTION'?'تصريف سعري مرصود':'انضغاط / توازن مرصود',
      low:ctx.low,high:ctx.high,
      historical:price<ctx.low||price>ctx.high||now-ctx.to>3*900000
   }:null;
 return {ready:true,reason:liquidity.reason,context,items:[
   zoneItem('SELL','تصريف / بيع محتمل',supply,
     'منطقة عرض · انتظر رفضًا بإغلاق M15'),
   zoneItem('BUY','تجميع / شراء محتمل',demand,
     'منطقة طلب · انتظر ارتدادًا بإغلاق M15'),
   poolItem('HIGH_LIQ','سيولة أعلى القمم',highPool,upper),
   poolItem('LOW_LIQ','سيولة أسفل القيعان',lowPool,lower)
 ]};
}
