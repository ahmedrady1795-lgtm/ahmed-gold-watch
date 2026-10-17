/**
 * Conditional PRICE-SPACE candle route for the visual chart only.
 * Stage index is NOT an M1 time forecast, ETA, order, win probability or
 * independent predictive edge. Server-sourced levels retain their true price.
 * Never stretch a drawn candle to reach a distant target.
 */
export type RouteSide='BUY'|'SELL';
export type RouteBar={
  step:number;open:number;high:number;low:number;close:number;
};
export type RouteTouch={stage:number;index:number;price:number};
export type RouteMilestone={key:string;label:string;price:number;index:number};
export type TargetRoute={
  ready:boolean;bars:RouteBar[];touches:RouteTouch[];pendingStages:number[];
  milestones:RouteMilestone[];
  atr:number|null;maxBody:number|null;reason:string;
};
type Bar={time:number;open:number;high:number;low:number;close:number};
type Goal={stage:number;price:number};
const quantile=(xs:number[],p:number)=>{
 const v=xs.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 if(!v.length)return 0;
 return v[Math.floor((v.length-1)*p)];
};
const okay=(b:Bar)=>b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
  b.time>0&&b.time%60000===0&&b.open>0&&b.low>0&&
  b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
const empty=(reason:string):TargetRoute=>({
 ready:false,bars:[],touches:[],pendingStages:[],milestones:[],atr:null,maxBody:null,reason
});
export function buildConditionalTargetCandles(input:{
 history:Bar[];now:number;quote:number|null;priceFresh:boolean;
 side:RouteSide;targets:Goal[];invalidation?:number|null;count?:number;
 visibleCount?:number;
 waypoints?:Array<{key:string;label:string;price:number}>;
}):TargetRoute{
 const {now,quote,side}=input,sign=side==='BUY'?1:-1;
 if(!input.priceFresh||quote==null||!Number.isFinite(quote)||quote<=0||
   !Number.isFinite(now)||now<=0)return empty('السعر المباشر غير متاح');
 const hist=Array.isArray(input.history)?input.history.slice(-240):[];
 const bars=hist.slice(-36);
 if(bars.length<36||bars.some((b,i)=>!okay(b)||
   (i>0&&b.time-bars[i-1].time!==60000))||
   bars.at(-1)!.time+60000>now||
   now-(bars.at(-1)!.time+60000)>90000)
   return empty('يلزم 36 شمعة M1 متصلة ومغلقة وحديثة');
 const trueRanges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=quantile(trueRanges,.5);
 const visible=bars.slice(-Math.max(16,Math.min(36,Math.floor(input.visibleCount??36))));
 const bodies=visible.map(b=>Math.abs(b.close-b.open));
 const bodyCap=Math.max(...bodies);
 const upCap=Math.max(...visible.map(b=>b.high-Math.max(b.open,b.close)));
 const downCap=Math.max(...visible.map(b=>Math.min(b.open,b.close)-b.low));
 const rangeCap=Math.max(...visible.map(b=>b.high-b.low));
 if(atr<=quote*.000001||atr>quote*.025||bodyCap<atr*.015||
    Math.abs(quote-bars.at(-1)!.close)>atr*1.8)
   return empty('حركة M1 لا تسمح بمسار متناسب مع السوق الحالي');
 const goals=input.targets.slice(0,3);
 if(!goals.length||goals.some((t,i)=>!Number.isFinite(t?.price)||
   t.price<=0||!Number.isInteger(t.stage)||t.stage<1||
   sign*(t.price-quote)<=0||
   (i>0&&sign*(t.price-goals[i-1].price)<=0)))
   return empty('لا توجد أهداف أصلية صالحة أمام سعر الإغلاق');
 const invalid=input.invalidation;
 if(invalid!=null&&(!Number.isFinite(invalid)||invalid<=0||
    sign*(quote-invalid)<=0))return empty('حد إبطال غير صالح');
 const count=Number.isFinite(input.count)?
   Math.min(96,Math.max(3,Math.floor(input.count!))):18;
 const waypoints=input.waypoints??[];
 if(waypoints.length>8||waypoints.some(w=>!Number.isFinite(w.price)||
   w.price<=0||(invalid!=null&&sign*(w.price-invalid)<=0)))
   return empty('مستويات هيكلية غير صالحة');
 // Pick an analogue using ONLY the six PRECEDING real closed M1 bars.
 // Never choose a sample because its subsequent candles hit a TP: that
 // would introduce hindsight selection and manufacture apparent accuracy.
 // Use a 96-bar sample for both short and extended displays whenever
 // available, so expanding the SVG never rewrites the already shown path.
 const horizon=hist.length>=110?96:count;
 if(hist.length<horizon+14)return empty('لا يكفي تاريخ مغلق لمقارنة شموع مستقبلية مرجعية');
 const context=hist.slice(-6);
 const norm=(c:Bar,unit:number)=>[
   (c.close-c.open)/unit,
   (c.high-Math.max(c.open,c.close))/unit,
   (Math.min(c.open,c.close)-c.low)/unit
 ];
 const current=context.map(c=>norm(c,atr));
 let selected=-1,best=Infinity,sourceUnit=atr;
 for(let start=12;start+horizon<=hist.length-8;start++){
   const part=hist.slice(start-12,start+horizon);
   if(part.length!==horizon+12||part.some((b,i)=>!okay(b)||
      (i>0&&b.time-part[i-1].time!==60000)))continue;
   const reference=hist.slice(start-6,start);
   const referenceTr=hist.slice(start-12,start).map(b=>b.high-b.low);
   const localUnit=quantile(referenceTr,.5);
   if(localUnit<=0||localUnit>quote*.025)continue;
   const score=reference.map((bar,j)=>{
     const signature=norm(bar,localUnit);
     return signature.reduce((total,value,k)=>{
       const error=value-current[j][k];
       return total+error*error*(k===0?1:.35);
     },0);
   }).reduce((sum,x)=>sum+x,0);
   if(score<best){best=score;selected=start;sourceUnit=localUnit;}
 }
 if(selected<0)return empty('لا توجد سلسلة تاريخية M1 متصلة للمقارنة');
 // Same absolute price scale and genuine observed OHLC morphology. Never
 // amplify beyond the visible market's largest body, wick or full range.
 const scale=Math.min(1.1,Math.max(.60,atr/sourceUnit));
 const out:RouteBar[]=[],touches:RouteTouch[]=[],milestones:RouteMilestone[]=[];
 let prev=quote,goalIndex=0,milestoneIndex=0,hitInvalidation=false;
 for(let i=0;i<count;i++){
   const sample=hist[selected+i];
   if(!sample)break;
   const originalBody=(sample.close-sample.open)*scale;
   const body=Math.max(-bodyCap,Math.min(bodyCap,originalBody));
   const open=prev,close=open+body;
   let above=Math.min(upCap,Math.max(0,
     sample.high-Math.max(sample.open,sample.close))*scale);
   let below=Math.min(downCap,Math.max(0,
     Math.min(sample.open,sample.close)-sample.low)*scale);
   const wickBudget=Math.max(0,rangeCap-Math.abs(body));
   const wickRatio=Math.min(1,wickBudget/Math.max(above+below,.00000001));
   above*=wickRatio;below*=wickRatio;
   const high=Math.max(open,close)+above;
   const low=Math.min(open,close)-below;
   if(low<=0)return empty('مسار توضيحي غير صالح');
   out.push({step:i+1,open,high,low,close});
   prev=close;
   // Levels are NEVER used to move candles. Mark a level only when the
   // naturally replayed candle's real-scale high-low interval intersects it.
   while(milestoneIndex<waypoints.length){
     const w=waypoints[milestoneIndex];
     if(w.price<low-1e-9||w.price>high+1e-9)break;
     milestones.push({...w,index:i});milestoneIndex++;
   }
   while(goalIndex<goals.length){
     const goal=goals[goalIndex];
     if(goal.price<low-1e-9||goal.price>high+1e-9)break;
     touches.push({stage:goal.stage,index:i,price:goal.price});goalIndex++;
   }
   if(invalid!=null&&(side==='BUY'?low<=invalid:high>=invalid)){
     hitInvalidation=true;break;
   }
 }
 if(!out.length)return empty('لم تتوفر شموع مرجعية');
 return {ready:true,bars:out,touches,milestones,
   pendingStages:goals.slice(goalIndex).map(t=>t.stage),
   atr,maxBody:bodyCap,
   reason:hitInvalidation?
     'الشكل التاريخي المماثل لمس مستوى الإبطال؛ لا يصح مواصلة المسار':
     'إعادة عرض شكل شموع M1 تاريخية فعلية بمقياس السعر الحالي؛ وصول الأهداف غير مفروض ولا يتنبأ بموعد أو احتمال'};
}
