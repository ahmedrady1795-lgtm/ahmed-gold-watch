/**
 * A causal intraday MOVEMENT observer, independent of M15 forecast publication
 * and broker trade eligibility. Never converts price detection to an order.
 * Only CLOSED same-venue M1/M5 bars can confirm a breakout. Targets are
 * historically observed M15/H1 levels strictly ahead of the current quote.
 */
type Side='BUY'|'SELL'|'WAIT';
type Bar={time:number;open:number;high:number;low:number;close:number};
type PreMove={ok?:boolean;stage?:string;side?:Side;sourceAt?:number;trigger?:number|null;invalidation?:number|null;readiness?:number};
type Watch={ready:boolean;upper:{price:number}[];lower:{price:number}[]};
export type LiveOpportunity={
  phase:'OFFLINE'|'WATCH'|'PREPARE'|'TESTING'|'BREAK_CONFIRMED'|'CANCELLED';
  side:Side;trigger:number|null;invalidation:number|null;
  targets:number[];sourceAt:number|null;strength:number;
  higherFrame:'ALIGNED'|'OPPOSED'|'NEUTRAL';
  reason:string;targetNote:string;tradeEligible:false;
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const valid=(b:Bar)=>b&&[b.time,b.open,b.close,b.high,b.low].every(finite)&&
  b.time>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
  b.low<=Math.min(b.open,b.close);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const round=(n:number)=>Number(n.toFixed(2));
function closed(raw:unknown,period:number,now:number){
 const keyed=new Map<number,Bar>();
 for(const b of Array.isArray(raw)?raw:[]){
   if(valid(b)&&b.time%period===0&&b.time+period<=now)keyed.set(b.time,b);
 }
 return [...keyed.values()].sort((a,b)=>a.time-b.time);
}
function contiguous(bars:Bar[],period:number,n:number){
 const tail=bars.slice(-n);
 return tail.length===n&&tail.every((b,i)=>!i||b.time-tail[i-1].time===period);
}
export function assessSniperLiveOpportunity(input:{
 now:number;price:number|null;sourceReady:boolean;c1:unknown;c5:unknown;
 preMove?:PreMove|null;watch?:Watch|null
}):LiveOpportunity{
 const empty=(reason:string,phase:LiveOpportunity['phase']='OFFLINE'):LiveOpportunity=>({
   phase,side:'WAIT',trigger:null,invalidation:null,targets:[],sourceAt:null,
   strength:0,higherFrame:'NEUTRAL',reason,targetNote:'لا أهداف جديدة موثوقة',tradeEligible:false
 });
 const {now,price}=input;
 if(!input.sourceReady||!finite(now)||!finite(price)||price<=0)
   return empty('السعر أو المصدر غير حديث؛ رادار الحركة متوقف');
 const m1=closed(input.c1,60000,now),m5=closed(input.c5,300000,now);
 if(m1.length<32||m5.length<7||!contiguous(m1,60000,30)||
   !contiguous(m5,300000,6)||
   now-(m1.at(-1)!.time+60000)>120000||
   now-(m5.at(-1)!.time+300000)>600000)
   return empty('شموع M1/M5 غير كافية أو متأخرة أو متقطعة');
 const tail=m1.slice(-24);
 const tr=tail.slice(1).map((b,i)=>Math.max(
   b.high-b.low,Math.abs(b.high-tail[i].close),Math.abs(b.low-tail[i].close)));
 const atr=tr.reduce((sum,x)=>sum+x,0)/tr.length;
 if(!(atr>0))return empty('تذبذب M1 غير صالح');
 const frameDelta=m5.at(-1)!.close-m5.at(-3)!.close;
 const m5Side:Side=Math.abs(frameDelta)<atr*.35?'WAIT':frameDelta>0?'BUY':'SELL';
 const targets=(s:Side)=>{
   if(!input.watch?.ready||s==='WAIT')return [];
   const margin=Math.max(.01,atr*.10);
   const prices=(s==='SELL'?input.watch.lower:input.watch.upper)
     .map(x=>x.price).filter(finite)
     .filter(v=>s==='SELL'?v<price-margin:v>price+margin)
     .sort((a,b)=>s==='SELL'?b-a:a-b);
   const unique:number[]=[];
   for(const v of prices)if(!unique.some(t=>Math.abs(t-v)<margin))unique.push(v);
   return unique.slice(0,3).map(round);
 };
 const output=(phase:LiveOpportunity['phase'],side:Side,trigger:number|null,
     invalidation:number|null,sourceAt:number,strength:number,reason:string):LiveOpportunity=>{
   const goalPrices=targets(side);
   return {phase,side,trigger:trigger==null?null:round(trigger),
     invalidation:invalidation==null?null:round(invalidation),
     sourceAt,strength:Math.round(clamp(strength,0,90)),targets:goalPrices,
     higherFrame:m5Side==='WAIT'?'NEUTRAL':m5Side===side?'ALIGNED':'OPPOSED',
     reason,
     targetNote:goalPrices.length?
       'أهداف هيكلية M15/H1 أمام السعر الحي، ليست وصولًا مضمونًا':
       'لا يوجد هدف M15/H1 صالح أمام السعر الحالي؛ لا نستنتج هدفًا وهميًا',
     tradeEligible:false};
 };
 // Detect the most recent CLOSED M1 displacement beyond preceding price levels.
 // No unfinished M15, projected candles, future bars or stale quote is used.
 for(let i=m1.length-1;i>=Math.max(12,m1.length-4);i--){
   const bar=m1[i],history=m1.slice(i-12,i);
   const hi=Math.max(...history.map(b=>b.high));
   const lo=Math.min(...history.map(b=>b.low));
   const range=Math.max(.00001,bar.high-bar.low);
   const body=Math.abs(bar.close-bar.open);
   if(body<atr*.60)continue;
   const sell=bar.close<lo-atr*.06&&bar.close<bar.open&&
     (bar.close-bar.low)/range<=.38;
   const buy=bar.close>hi+atr*.06&&bar.close>bar.open&&
     (bar.high-bar.close)/range<=.38;
   if(!sell&&!buy)continue;
   const side:Side=sell?'SELL':'BUY';
   const trigger=sell?lo:hi;
   const invalidation=sell?Math.max(...history.slice(-6).map(x=>x.high)):
     Math.min(...history.slice(-6).map(x=>x.low));
   const eventAt=bar.time+60000;
   const cancelled=sell?price>trigger+atr*.25:price<trigger-atr*.25;
   const strength=52+Math.min(22,body/atr*8)+(m5Side===side?9:0)-
     (m5Side!=='WAIT'&&m5Side!==side?12:0);
   return output(cancelled?'CANCELLED':'BREAK_CONFIRMED',side,trigger,
     invalidation,eventAt,strength,cancelled?
       'السعر رجع داخل النطاق بعد كسر M1؛ تم إلغاء رصد الاندفاع':
       'كسر وإغلاق M1 خارج النطاق السابق؛ رصد حركة وليس تصريح دخول');
 }
 const pre=input.preMove;
 if(pre?.ok&&['ARMED','BUILDING'].includes(String(pre.stage))&&
   (pre.side==='BUY'||pre.side==='SELL')&&finite(pre.sourceAt)&&
   now-pre.sourceAt>=0&&now-pre.sourceAt<=120000&&
   finite(pre.trigger)&&finite(pre.invalidation)&&
   (pre.side==='BUY'?pre.trigger>pre.invalidation:pre.trigger<pre.invalidation)){
   const crossed=pre.side==='SELL'?price<=pre.trigger:price>=pre.trigger;
   const invalid=pre.side==='SELL'?price>=pre.invalidation:price<=pre.invalidation;
   if(!invalid)return output(crossed?'TESTING':'PREPARE',pre.side,
     pre.trigger,pre.invalidation,pre.sourceAt,pre.readiness??45,crossed?
       'السعر يختبر مستوى الكسر؛ نحتاج إغلاق M1 مؤكدًا':
       'ضغط مبكر من M1/M5 قبل الكسر؛ إنذار مراقبة مشروط');
 }
 return empty('لا كسر M1 مؤكد ولا ضغط مبكر مؤهل الآن','WATCH');
}
