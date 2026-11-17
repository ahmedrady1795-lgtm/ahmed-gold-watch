import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M5CandleLean} from './sniper-m5-candle-lean';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type EarlySetup={
 scope:string;side:'BUY'|'SELL';phase:'ARMED'|'TRIGGERED'|'CANCELLED'|'EXPIRED';
 sourceAt:number;armedAt:number;expiresAt:number;trigger:number;invalidation:number;
 atr:number;priceAt:number;lastPrice:number;lastAt:number;triggeredAt:number|null;
 targets:number[];reason:string;
};
/** Session-only arming: reloading cannot invent an earlier observation. */
export function advanceEarlySetup(input:{prior:EarlySetup|null;scope:string;now:number;
 price:number|null;ready:boolean;bars:unknown;opportunity:LiveOpportunity;lean:M5CandleLean}):EarlySetup|null{
 const {now,price}=input;
 let prior=input.prior?.scope===input.scope?input.prior:null;
 if(!Number.isFinite(now)||price==null||!Number.isFinite(price)||price<=0)return null;
 if(prior&&now<prior.lastAt)return null;
 if(!input.ready)return prior?(prior.phase==='CANCELLED'?prior:{...prior,phase:'CANCELLED',lastAt:now,reason:'البيانات غير حديثة؛ الإعداد ملغي'}):null;
 if(prior&&(prior.phase==='ARMED'||prior.phase==='TRIGGERED')){
   const invalid=prior.side==='BUY'?price<=prior.invalidation:price>=prior.invalidation;
   const expired=now>=prior.expiresAt;
   const gap=now-prior.lastAt>15000;
   if(invalid||expired||gap)return {...prior,phase:expired?'EXPIRED':'CANCELLED',lastAt:now,
     reason:invalid?'كسر مستوى الإبطال':expired?'انتهت صلاحية الإعداد':'انقطعت متابعة السعر؛ لا تفعيل بأثر رجعي'};
   if(prior.phase==='TRIGGERED')return prior.lastPrice===price&&prior.lastAt===now?prior:
     {...prior,lastPrice:price,lastAt:now};
   const crossed=prior.side==='BUY'?price>=prior.trigger:price<=prior.trigger;
   if(crossed){
     const extension=Math.abs(price-prior.trigger);
     if(extension>prior.atr*.35)return {...prior,phase:'CANCELLED',lastAt:now,
       reason:'السعر تجاوز منطقة التفعيل؛ لا نطارد الموجة'};
     return {...prior,phase:'TRIGGERED',triggeredAt:now,priceAt:price,lastPrice:price,lastAt:now,
       reason:'عبور حي لمستوى إعداد مسجل قبل الكسر'};
   }
   return prior.lastPrice===price&&prior.lastAt===now?prior:{...prior,lastPrice:price,lastAt:now};
 }
 // A cancelled/finished setup cannot immediately re-arm in the same wave.
 if(prior&&now<prior.expiresAt)return prior;
 const rows=(Array.isArray(input.bars)?input.bars:[]).filter((b:Bar)=>b&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time>0&&
   b.time%60000===0&&b.time+60000<=now&&b.low>0&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 const bars=[...new Map<number,Bar>(rows.map((b:Bar)=>[b.time,b])).values()]
   .sort((a,b)=>a.time-b.time).slice(-18);
 if(bars.length<18||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return prior;
 const last=bars.at(-1)!,sourceAt=last.time+60000;
 if(now-sourceAt>90000||prior&&sourceAt<=prior.sourceAt)return prior;
 const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=ranges.slice(-14).reduce((a,b)=>a+b,0)/14;
 if(!(atr>0)||atr>price*.04)return prior;
 const op=input.opportunity;
 let side:'BUY'|'SELL'|null=null,trigger=0,invalidation=0;
 let reason='';
 if(op.phase==='PREPARE'&&(op.side==='BUY'||op.side==='SELL')&&
   op.trigger!=null&&op.invalidation!=null&&op.sourceAt!=null&&now-op.sourceAt<=90000){
   side=op.side;trigger=op.trigger;invalidation=op.invalidation;
   reason='ضغط سعري قبل الكسر';
 }else if(input.lean.side!=='WAIT'&&input.lean.reason.includes('انعكاس محتمل')){
   // Sweep rejection supplies a level to watch, not an immediate BUY/SELL.
   side=input.lean.side;
   trigger=side==='BUY'?last.high+atr*.05:last.low-atr*.05;
   invalidation=side==='BUY'?last.low-atr*.05:last.high+atr*.05;
   reason='استرداد مستوى بعد سحب قمة أو قاع';
 }
 if(!side||![trigger,invalidation].every(Number.isFinite))return prior;
 const remaining=side==='BUY'?trigger-price:price-trigger;
 const risk=side==='BUY'?price-invalidation:invalidation-price;
 // Must be first observed BEFORE crossing, near a defined level. Reject a
 // setup already touched by any later/current observed candle, even on pullback.
 const touched=rows.some((b:Bar)=>b.time>=sourceAt&&(side==='BUY'?b.high>=trigger:b.low<=trigger))||
   (Array.isArray(input.bars)?input.bars:[]).some((b:Bar)=>b&&Number.isFinite(b.time)&&
     b.time>=sourceAt&&b.time<=now&&Number.isFinite(b.high)&&Number.isFinite(b.low)&&
     (side==='BUY'?b.high>=trigger:b.low<=trigger));
 if(remaining<=0||remaining>atr*.8||risk<=0||touched)return prior;
 return {scope:input.scope,side,phase:'ARMED',sourceAt,armedAt:now,expiresAt:now+300000,
   trigger,invalidation,atr,priceAt:price,lastPrice:price,lastAt:now,triggeredAt:null,
   targets:op.side===side?op.targets.filter(t=>side==='BUY'?t>trigger:t<trigger):[],reason};
}
export function earlySetupOpportunity(state:EarlySetup|null):LiveOpportunity{
 const active=state?.phase==='ARMED'||state?.phase==='TRIGGERED';
 return {phase:state?.phase==='ARMED'?'PREPARE':state?.phase==='TRIGGERED'?'BREAK_CONFIRMED':
   state?'CANCELLED':'WATCH',side:active?state!.side:'WAIT',
   trigger:state?.trigger??null,invalidation:state?.invalidation??null,
   targets:active?state!.targets:[],sourceAt:state?.triggeredAt??state?.sourceAt??null,
   strength:0,higherFrame:'NEUTRAL',m15Context:'NEUTRAL',quality:'OBSERVATION',
   reason:state?.reason??'انتظار إعداد قبل الحركة؛ الزخم وحده لا يصدر شراء أو بيع',
   targetNote:'مستويات مراقبة ثابتة، وليست ضمان وصول',tradeEligible:false};
}
