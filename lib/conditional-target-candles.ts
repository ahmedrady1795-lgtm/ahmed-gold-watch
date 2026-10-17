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
   !Number.isFinite(now)||now<=0)
   return empty('لا يوجد سعر حي حديث لبدء المسار');
 const hist=Array.isArray(input.history)?input.history:[];
 const bars=hist.slice(-36);
 if(bars.length<36||bars.some((b,i)=>!okay(b)||
   (i>0&&b.time-bars[i-1].time!==60000))||
   bars.at(-1)!.time+60000>now||
   now-(bars.at(-1)!.time+60000)>90000)
   return empty('يلزم 36 شمعة M1 فعلية متصلة ومغلقة وحديثة');
 const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=quantile(ranges,.5);
 // A mobile canvas displays 24 rather than 36 history candles. The rendered
 // synthetic candle must be no larger than THAT visible reference set.
 const visible=bars.slice(-Math.max(16,Math.min(36,Math.floor(input.visibleCount??36))));
 const bodies=visible.map(b=>Math.abs(b.close-b.open));
 const bodyCap=quantile(bodies,.75);
 const upCap=quantile(visible.map(b=>b.high-Math.max(b.open,b.close)),.75);
 const downCap=quantile(visible.map(b=>Math.min(b.open,b.close)-b.low),.75);
 // A flat market, feed shock, or quote far away from M1 close cannot
 // produce an honest candle-geometry comparison.
 if(atr<=quote*.000001||atr>quote*.025||bodyCap<atr*.015||
   bodyCap>atr*1.35||Math.abs(quote-bars.at(-1)!.close)>atr*1.8)
   return empty('حركة M1 لا تسمح بمسار شموع متناسب مع السوق الحالي');
 const goals=input.targets.slice(0,3).filter(t=>Number.isFinite(t?.price)&&
   t.price>0&&Number.isInteger(t.stage)&&t.stage>=1);
 if(!goals.length||goals.some((t,i)=>sign*(t.price-quote)<=0||
   (i>0&&sign*(t.price-goals[i-1].price)<=0)))
   return empty('لا توجد أهداف حقيقية متدرجة أمام السعر');
 const invalid=input.invalidation;
 if(invalid!=null&&(!Number.isFinite(invalid)||invalid<=0||
   sign*(quote-invalid)<=0))
   return empty('حد الإبطال لم يعد صالحًا أمام السعر الحي');
 const count=Number.isFinite(input.count)?Math.min(96,Math.max(3,Math.floor(input.count!))):18;
 const waypoints=input.waypoints??[];
 if(waypoints.length>8||waypoints.some(w=>!Number.isFinite(w.price)||w.price<=0||
   sign*(goals[0].price-w.price)<=0||
   (invalid!=null&&sign*(w.price-invalid)<=0)))
   return empty('مراحل الكسر أو الاختبار خارج حدود السيناريو');
 const milestones:RouteMilestone[]=[];
 let waypointIndex=0;
 // The stride is calibrated to HISTORIC BODY SIZE, not distance to TP.
 // Even an ambitious model cannot drag a single OHLC body to a far target.
 const maxBody=Math.min(bodyCap*.90,atr*.78);
 const samples=bars.slice(-27);
 const historicalRangeMax=Math.max(...visible.map(b=>b.high-b.low));
 const out:RouteBar[]=[],touches:RouteTouch[]=[];let prev=quote,goalIndex=0;
 for(let i=0;i<count;i++){
   const sample=samples[(i*7+5)%samples.length];
   const ratio=Math.min(1,Math.abs(sample.close-sample.open)/Math.max(bodyCap,.000001));
   const drift=maxBody*(.44+ratio*.38);
   // Brief countertrend bars and minor consolidation imitate real OHLC
   // hesitation; they are patterns of a conditional drawing, not market data.
   const retrace=i%6===4;
   const stepBody=retrace?-maxBody*(.13+ratio*.17):drift;
   // Follow evidence-derived structure BEFORE goals, including downward
   // retests in BUY routes and upward retests in SELL routes.
   while(waypointIndex<waypoints.length&&Math.abs(waypoints[waypointIndex].price-prev)<1e-8){
     milestones.push({...waypoints[waypointIndex++],index:Math.max(0,i-1)});
   }
   const waypoint=waypoints[waypointIndex];
   const next=waypoint??goals[goalIndex];
   const legSign=next?Math.sign(next.price-prev)||sign:sign;
   let body=legSign*stepBody;
   if(next){
     const distance=Math.abs(next.price-prev);
     if(legSign*body>=distance)body=legSign*distance;
   }else{
     // Doji/pullback after the last watched objective, no invented TP4.
     body=sign*(i%2===0?-maxBody*.16:maxBody*.12);
   }
   body=Math.max(-maxBody,Math.min(maxBody,body));
   const open=prev,close=open+body;
   const above=Math.min(upCap,Math.max(atr*.025,
     sample.high-Math.max(sample.open,sample.close)));
   const below=Math.min(downCap,Math.max(atr*.025,
     Math.min(sample.open,sample.close)-sample.low));
   // Match the entire historical high-low range as well as the body size.
   const wickBudget=Math.max(0,historicalRangeMax-Math.abs(body));
   const wickScale=Math.min(1,wickBudget/Math.max(above+below,.000001));
   const high=Math.max(open,close)+above*wickScale;
   const low=Math.max(quote*.001,Math.min(open,close)-below*wickScale);
   // Invalidation is a scenario boundary, not a license for a candle
   // to cross it on a made-up path.
   if(invalid!=null&&(side==='BUY'?low<=invalid:high>=invalid))
     return empty('شكل الشموع يتداخل مع حد الإبطال؛ توقف المسار');
   if(Math.abs(body)>bodyCap+1e-9||high-low>historicalRangeMax+1e-8)
     return empty('جسم شمعة تخطى مدى الشموع المرجعية');
   out.push({step:i+1,open,high,low,close});
   prev=close;
   if(waypoint&&Math.abs(prev-waypoint.price)<1e-8){
     milestones.push({...waypoint,index:i});waypointIndex++;
   }
   const active=goals[goalIndex];
   if(!waypoint&&active&&sign*(prev-active.price)>=-1e-8){
     touches.push({stage:active.stage,index:i,price:active.price});
     goalIndex++;
   }
 }
 return {ready:true,bars:out,touches,milestones,
   pendingStages:goals.slice(goalIndex).map(t=>t.stage),atr,maxBody,
   reason:goalIndex===goals.length?
    'شموع مسار سعري مشروط وصلت إلى الأهداف في الرسم فقط · الخطوات ليست دقائق':
    'مسار متدرج بحد جسم مستمد من M1 · الهدف البعيد لم نصل إليه بشموع وهمية'};
}
