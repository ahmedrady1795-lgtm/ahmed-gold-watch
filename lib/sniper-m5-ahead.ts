/** Research-only pre-candle protocol. No UI or execution integration until validated. */
export type AheadBar={time:number;open:number;high:number;low:number;close:number};
export type AheadPlan={id:string;source:string;model:string;issuedAt:number;evidenceAt:number;
 targetStart:number;targetEnd:number;side:'BUY'|'SELL';reference:number;target:number;
 invalidation:number;leadMs:number;outcome:'PENDING'|'TARGET'|'STOP'|'AMBIGUOUS'|'TIMEOUT'|'GAP'|'UNKNOWN';
 direction?:'CORRECT'|'WRONG'|'FLAT';resolvedAt?:number};
const good=(b:AheadBar)=>b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
 b.time>0&&b.time%60000===0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
export function issueM5Ahead(prior:readonly AheadPlan[],input:{now:number;source:string;
 model:string;side:'BUY'|'SELL'|'WAIT';price:number;quoteAt:number;evidenceAt:number;bars:readonly AheadBar[]}):readonly AheadPlan[]{
 const {now,price,side,source,model}=input;
 if(!Number.isFinite(now)||!Number.isFinite(price)||price<=0||!source||!model||side==='WAIT')return prior;
 const start=Math.floor(now/300000)*300000+300000;
 // Freeze during the final minute, at least 15 seconds BEFORE the target opens.
 if(start-now<15000||start-now>60000||!Number.isFinite(input.quoteAt)||
   input.quoteAt>now||now-input.quoteAt>10000||!Number.isFinite(input.evidenceAt)||
   input.evidenceAt>now||now-input.evidenceAt>120000)return prior;
 const id=[source,model,start].join(':');if(prior.some(r=>r.id===id))return prior;
 const bars=[...new Map(input.bars.filter(good).filter(b=>b.time+60000<=input.evidenceAt)
   .map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time).slice(-15);
 if(bars.length!==15||bars.at(-1)!.time+60000!==input.evidenceAt||
   bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return prior;
 const atr=bars.slice(1).reduce((sum,b,i)=>sum+Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)),0)/14;
 if(!(atr>0))return prior;
 const sign=side==='BUY'?1:-1;
 // Fixed symmetric evaluation levels, frozen before the move. Not broker orders.
 const target=price+sign*atr,invalidation=price-sign*atr;
 if(Math.min(target,invalidation)<=0)return prior;
 return [...prior,{id,source,model,issuedAt:now,evidenceAt:input.evidenceAt,
   targetStart:start,targetEnd:start+300000,side,reference:price,target,invalidation,
   leadMs:start-now,outcome:'PENDING'}];
}
export function scoreM5Ahead(plan:AheadPlan,input:{now:number;source:string;bars:readonly AheadBar[]}):AheadPlan{
 if(plan.outcome!=='PENDING'||input.source!==plan.source||input.now<plan.targetEnd)return plan;
 const bars=[...new Map(input.bars.filter(good).filter(b=>b.time>=plan.targetStart&&
   b.time<plan.targetEnd&&b.time+60000<=input.now).map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
 if(bars.length!==5||bars.some((b,i)=>b.time!==plan.targetStart+i*60000))
   return input.now>=plan.targetEnd+600000?{...plan,outcome:'UNKNOWN',resolvedAt:input.now}:plan;
 const movement=(bars[4].close-bars[0].open)*(plan.side==='BUY'?1:-1);
 const direction=Math.abs(movement)<.01?'FLAT':movement>0?'CORRECT':'WRONG';
 // Price moved outside the frozen plan before its target candle opened.
 if(bars[0].open>=Math.max(plan.target,plan.invalidation)||
    bars[0].open<=Math.min(plan.target,plan.invalidation))
   return {...plan,direction,outcome:'GAP',resolvedAt:plan.targetEnd};
 for(const b of bars){
   const target=plan.side==='BUY'?b.high>=plan.target:b.low<=plan.target;
   const stop=plan.side==='BUY'?b.low<=plan.invalidation:b.high>=plan.invalidation;
   if(target||stop)return {...plan,direction,outcome:target&&stop?'AMBIGUOUS':target?'TARGET':'STOP',resolvedAt:b.time+60000};
 }
 return {...plan,direction,outcome:'TIMEOUT',resolvedAt:plan.targetEnd};
}
