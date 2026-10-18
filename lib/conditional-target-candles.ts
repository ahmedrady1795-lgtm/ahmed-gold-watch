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
  outcome:'ACTIVE'|'STOPPED'|'AMBIGUOUS';
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
 ready:false,bars:[],touches:[],pendingStages:[],milestones:[],outcome:'ACTIVE',atr:null,maxBody:null,reason
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
   w.price<=0||sign*(goals[0].price-w.price)<=0||
   (invalid!=null&&sign*(w.price-invalid)<=0)))
   return empty('مستويات هيكلية غير صالحة');
 // Build the route from SHORT, genuinely observed closed-M1 motifs.
 // Requiring one uninterrupted 96-bar historical analogue restricted matching
 // to much older regimes, making the chart look disconnected from today's M1.
 // A fresh 18-bar contextual match is used at each stage boundary. Context
 // for later stages comes only from the already drawn preceding six bars.
 // No objective/target, invalidation, or future TP hit enters the selection.
 // Thus zooming 18 -> 96 stages cannot rewrite the initial 18 bars.
 const motifLength=18;
 if(hist.length<motifLength+26)
   return empty('لا يكفي تاريخ مغلق لمقارنة شموع مستقبلية مرجعية');
 type Shape=Pick<Bar,'open'|'high'|'low'|'close'>;
 const norm=(c:Shape,unit:number)=>[
   (c.close-c.open)/unit,
   (c.high-Math.max(c.open,c.close))/unit,
   (Math.min(c.open,c.close)-c.low)/unit,
   (c.high-c.low)/unit
 ];
 const usedStarts:number[]=[];
 const chooseMotif=(recent:Shape[])=>{
   const current=recent.map(c=>norm(c,atr));
   const drift=(recent[5].close-recent[0].open)/atr;
   let selected=-1,best=Infinity,sourceUnit=atr;
   for(let start=12;start+motifLength<=hist.length-8;start++){
     const part=hist.slice(start-12,start+motifLength);
     if(part.length!==motifLength+12||part.some((b,i)=>!okay(b)||
       (i>0&&b.time-part[i-1].time!==60000)))continue;
     const reference=hist.slice(start-6,start);
     const localUnit=quantile(hist.slice(start-12,start)
       .map(b=>b.high-b.low),.5);
     if(localUnit<=0||localUnit>quote*.025)continue;
     let score=0;
     for(let j=0;j<6;j++){
       const ref=norm(reference[j],localUnit);
       for(let k=0;k<4;k++){
         const diff=ref[k]-current[j][k];
         score+=Math.min(36,diff*diff)*(k===0?1:k===3?.24:.35);
       }
     }
     const referenceDrift=(reference[5].close-reference[0].open)/localUnit;
     score+=Math.min(36,(referenceDrift-drift)**2)*.85;
     // Historical matches from the same overlapping event are NOT a second
     // distinct motif. Penalize re-use, without biasing toward TP outcomes.
     if(usedStarts.some(prior=>Math.abs(start-prior)<motifLength+6))
       score+=5;
     // When equally similar, prefer a recent completed market regime.
     score+=(hist.length-(start+motifLength))/hist.length*.15;
     if(score<best){best=score;selected=start;sourceUnit=localUnit;}
   }
   return {selected,sourceUnit};
 };
 let source=chooseMotif(hist.slice(-6));
 if(source.selected<0)return empty('لا توجد سلسلة تاريخية M1 متصلة للمقارنة');
 usedStarts.push(source.selected);
 // Same absolute price scale and genuine observed OHLC morphology. Never
 // amplify beyond the visible market's largest body, wick or full range.
 const out:RouteBar[]=[],touches:RouteTouch[]=[],milestones:RouteMilestone[]=[];
 let prev=quote,goalIndex=0,milestoneIndex=0,hitInvalidation=false,ambiguous=false;
 for(let i=0;i<count;i++){
   if(i>0&&i%motifLength===0){
     // Re-evaluate morphology after each illustrated structural leg, rather
     // than looping the same 18 candles or copying a stale 96-bar stretch.
     const next=chooseMotif(out.slice(-6));
     if(next.selected<0)break;
     source=next;
     usedStarts.push(source.selected);
   }
   const sample=hist[source.selected+(i%motifLength)];
   if(!sample)break;
   const scale=Math.min(1.1,Math.max(.60,atr/source.sourceUnit));
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
   // A completed OHLC candle cannot tell whether TP or SL traded first.
   // If both prices lie inside the same wick, NEVER paint a successful TP.
   // Stop-only candles also end the path before any later target is marked.
   const stopped=invalid!=null&&(side==='BUY'?low<=invalid:high>=invalid);
   if(stopped){
     hitInvalidation=true;
     ambiguous=goals.slice(goalIndex).some(goal=>goal.price>=low-1e-9&&goal.price<=high+1e-9);
     break;
   }
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
 }
 if(!out.length)return empty('لم تتوفر شموع مرجعية');
 return {ready:true,bars:out,touches,milestones,
   pendingStages:goals.slice(goalIndex).map(t=>t.stage),
   outcome:ambiguous?'AMBIGUOUS':hitInvalidation?'STOPPED':'ACTIVE',
   atr,maxBody:bodyCap,
   reason:ambiguous?
     'الهدف والوقف داخل شمعة مرجعية واحدة؛ ترتيب اللمس مجهول، ولا يُحتسب الهدف':
     hitInvalidation?
     'الشكل التاريخي المماثل لمس مستوى الإبطال أولًا؛ لا يصح مواصلة المسار':
     'مراحل مترابطة من شموع M1 تاريخية مشابهة حديثة النمط؛ الأهداف لا تغيّر الشموع ولا تحدد زمن الوصول أو احتماله'};
}


/** Purged walk-forward illustration check, NOT a timing or TP forecast.
 * Every match receives only a closed historical PREFIX, and the next 18
 * genuinely closed M1 bars are revealed AFTER the route has been frozen.
 * Disjoint 18-bar outcome folds prevent repeat scoring the same movement.
 */
export function auditConditionalRoute(history:Bar[],now:number){
 const rows=Array.isArray(history)?history.slice(-720):[];
 const emptyAudit={samples:0,maeAtr:null as number|null,
   baselineMaeAtr:null as number|null,directionPct:null as number|null,
   baselineDirectionPct:null as number|null,status:'COLLECTING' as 'COLLECTING'|'NO_PROVEN_EDGE'};
 if(rows.length<95||!Number.isFinite(now))return emptyAudit;
 let samples=0,totalErr=0,baselineErr=0,hits=0,baseHits=0;
 // Use at most 25 disjoint tests; do not include an unfinished candle.
 const cutoff=rows.length-18;
 const first=Math.max(65,cutoff-25*18);
 for(let t=first;t<=cutoff;t+=18){
   const prefix=rows.slice(0,t),future=rows.slice(t,t+18);
   if(prefix.length<60||future.length!==18||
      [...prefix.slice(-36),...future].some((c,i,a)=>!okay(c)||
       (i>0&&c.time-a[i-1].time!==60000))||
      future.at(-1)!.time+60000>now)continue;
   const last=prefix.at(-1)!;
   const recent=prefix.slice(-36);
   const unit=quantile(recent.slice(1).map((b,i)=>Math.max(b.high-b.low,
      Math.abs(b.high-recent[i].close),Math.abs(b.low-recent[i].close))),.5);
   if(!Number.isFinite(unit)||unit<=0)continue;
   const model=buildConditionalTargetCandles({
     history:prefix,now:last.time+90000,quote:last.close,priceFresh:true,
     side:'BUY',targets:[{stage:1,price:last.close+unit*10000}],
     count:18,visibleCount:36
   });
   if(!model.ready||model.bars.length!==18)continue;
   samples++;
   for(let i=0;i<18;i++){
     totalErr+=Math.abs(model.bars[i].close-future[i].close)/unit/18;
     baselineErr+=Math.abs(last.close-future[i].close)/unit/18;
   }
   const realised=Math.sign(future.at(-1)!.close-last.close);
   if(Math.sign(model.bars.at(-1)!.close-last.close)===realised&&realised!==0)hits++;
   if(Math.sign(last.close-prefix.at(-4)!.close)===realised&&realised!==0)baseHits++;
 }
 return {...emptyAudit,samples,
   maeAtr:samples?Number((totalErr/samples).toFixed(3)):null,
   baselineMaeAtr:samples?Number((baselineErr/samples).toFixed(3)):null,
   directionPct:samples?Number((hits/samples*100).toFixed(1)):null,
   baselineDirectionPct:samples?Number((baseHits/samples*100).toFixed(1)):null,
   status:samples>=20?'NO_PROVEN_EDGE' as const:'COLLECTING' as const};
}
