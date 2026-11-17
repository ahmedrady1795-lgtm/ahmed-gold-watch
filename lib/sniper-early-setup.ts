import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M5CandleLean} from './sniper-m5-candle-lean';
import type {FlowProfileDecision} from './flow-profile-decision';
import type {LiquidityMagnetView} from './sniper-liquidity-magnets';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type EarlySetup={
 scope:string;side:'BUY'|'SELL';phase:'ARMED'|'TRIGGERED'|'CANCELLED'|'EXPIRED';
 sourceAt:number;armedAt:number;expiresAt:number;trigger:number;invalidation:number;
 crossedAt?:number|null;crossedQuoteAt?:number|null;
 atr:number;priceAt:number;lastPrice:number;lastAt:number;triggeredAt:number|null;
 targets:number[];reason:string;score?:number;setupKind?:'PRESSURE'|'SWEEP'|'COMPRESSION'|'RECLAIM'|'MICRO'|'COIL';retestAt?:number|null;
};
/** Session-only arming: reloading cannot invent an earlier observation. */
export function advanceEarlySetup(input:{prior:EarlySetup|null;scope:string;now:number;
 price:number|null;quoteAt?:number|null;ready:boolean;bars:unknown;opportunity:LiveOpportunity;lean:M5CandleLean;
 flow?:FlowProfileDecision|null;liquidity?:LiquidityMagnetView|null;
 m1Side?:'BUY'|'SELL'|'WAIT';m15Side?:'BUY'|'SELL'|'WAIT'}):EarlySetup|null{
 const {now,price}=input;
 let prior=input.prior?.scope===input.scope?input.prior:null;
 if(!Number.isFinite(now)||price==null||!Number.isFinite(price)||price<=0)return null;
 if(prior&&now<prior.lastAt)return null;
 if(!input.ready)return prior?(prior.phase==='CANCELLED'?prior:{...prior,phase:'CANCELLED',lastAt:now,reason:'البيانات غير حديثة؛ الإعداد ملغي'}):null;
 // Count flow/profile ONLY if it was observed on the matching venue before this
 // decision, with a fresh real timestamp. Unavailable DOM is never agreement.
 const flow=input.flow;
 const hasFlow=Boolean(flow?.ready&&flow.side!=='WAIT'&&
   Number.isFinite(flow.asOf)&&Number.isFinite(flow.observedAt)&&
   flow.asOf!<=now&&flow.observedAt!<=now&&
   now-flow.asOf!<=15000&&now-flow.observedAt!<=15000);
 const flowSide=hasFlow?flow!.side:'WAIT';
 // M15 liquidity is a CLOSED-CANDLE swing/sweep proxy, not actual resting orders.
 const liq=input.liquidity;
 const liveSweep=Boolean(liq?.ready&&liq.sourceAt!=null&&
   liq.sourceAt<=now&&now-liq.sourceAt<=600000);
 const sweptSide=liveSweep&&liq?.sweep==='HIGH_RECLAIMED_DOWN'?'SELL':
   liveSweep&&liq?.sweep==='LOW_RECLAIMED_UP'?'BUY':'WAIT';
 if(prior?.phase==='ARMED'&&
   ((flowSide!=='WAIT'&&flowSide!==prior.side)||
    (sweptSide!=='WAIT'&&sweptSide!==prior.side)))
   return {...prior,phase:'CANCELLED',lastAt:now,
     reason:flowSide!=='WAIT'&&flowSide!==prior.side?
       'تدفق المصدر والبروفايل يعارضان الإعداد المبكر':
       'سحب سيولة M15 مغلق يعارض الإعداد المبكر'};
 if(prior&&(prior.phase==='ARMED'||prior.phase==='TRIGGERED')){
   const invalid=prior.side==='BUY'?price<=prior.invalidation:price>=prior.invalidation;
   // A recent activated breakout returning through its frozen level is a
   // FAILED BREAK, even if the much farther structural stop remains untouched.
   // Keep the historical BREAK marker for forward audit, never erase it.
   const rejected=prior.phase==='TRIGGERED'&&prior.triggeredAt!=null&&
     now-prior.triggeredAt<=60000&&
     (prior.side==='BUY'?price<prior.trigger-prior.atr*.12:
       price>prior.trigger+prior.atr*.12);
   if(rejected)return {...prior,phase:'CANCELLED',lastAt:now,lastPrice:price,
     reason:'فشل اختراق '+(prior.side==='BUY'?'شراء':'بيع')+
       '؛ السعر عاد عبر مستوى التفعيل بعد الإشارة'};
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
       lastPrice:price,reason:'السعر تجاوز منطقة التفعيل؛ لا نطارد الموجة'};
     const quoteAt=input.quoteAt!=null&&Number.isFinite(input.quoteAt)?
       input.quoteAt:now;
     if(prior.crossedAt==null)return {...prior,crossedAt:now,
       crossedQuoteAt:quoteAt,lastPrice:price,lastAt:now,
       reason:'اختبار عبور مستوى '+(prior.side==='BUY'?'الشراء':'البيع')+
         '؛ لم تثبت متابعة السعر بعد'};
     // Two distinct fresh observations separated by >= 2.5s, not a one-tick wick.
     // Confirmation records the LATER observed price/time, never backdates it.
     const laterQuote=quoteAt>(prior.crossedQuoteAt??prior.crossedAt);
     if(now-prior.crossedAt<2500||!laterQuote||
       extension<prior.atr*.04)return {...prior,lastPrice:price,lastAt:now};
     return {...prior,phase:'TRIGGERED',triggeredAt:now,priceAt:price,lastPrice:price,lastAt:now,
       reason:prior.retestAt!=null?
         'تفعيل بعد إعادة اختبار وعبور جديد على عرضين حديثين':
         'تفعيل بعد عبور حي مستمر ومراقب لمستوى إعداد سابق'};
   }
   if(prior.crossedAt!=null){
     const reversal=prior.side==='BUY'?price<prior.trigger-prior.atr*.08:
       price>prior.trigger+prior.atr*.08;
     if(reversal)return {...prior,phase:'CANCELLED',lastAt:now,lastPrice:price,
       reason:'فشل اختبار الاختراق؛ عودة السعر تحت/فوق مستوى التفعيل قبل التأكيد'};
     // A near-level pullback is only a RETEST OBSERVATION: it must cross again
     // on two fresh quotes to become an actual confirmed signal.
     return {...prior,crossedAt:null,crossedQuoteAt:null,
       retestAt:now,lastPrice:price,lastAt:now,
       reason:'إعادة اختبار قريبة من مستوى الكسر؛ انتظار عبور جديد'};
   }
   return prior.lastPrice===price&&prior.lastAt===now?prior:{...prior,lastPrice:price,lastAt:now};
 }
 // Re-arm a cancelled/expired setup only after TWO NEW complete M1 bars,
 // instead of locking out the whole five-minute wave after a feed hiccup.
 const rows=(Array.isArray(input.bars)?input.bars:[]).filter((b:Bar)=>b&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time>0&&
   b.time%60000===0&&b.time+60000<=now&&b.low>0&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 const bars=[...new Map<number,Bar>(rows.map((b:Bar)=>[b.time,b])).values()]
   .sort((a,b)=>a.time-b.time).slice(-18);
 if(bars.length<18||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return prior;
 const last=bars.at(-1)!,sourceAt=last.time+60000;
 if(now-sourceAt>90000||prior&&sourceAt<=prior.sourceAt+60000)return prior;
 const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=ranges.slice(-14).reduce((a,b)=>a+b,0)/14;
 if(!(atr>0)||atr>price*.04)return prior;
 const op=input.opportunity;
 let side:'BUY'|'SELL'|null=null,trigger=0,invalidation=0;
 let setupKind:EarlySetup['setupKind']='PRESSURE';
 let reason='';
 if(op.phase==='PREPARE'&&(op.side==='BUY'||op.side==='SELL')&&
   op.trigger!=null&&op.invalidation!=null&&op.sourceAt!=null&&now-op.sourceAt<=90000){
   side=op.side;trigger=op.trigger;invalidation=op.invalidation;
   reason='ضغط سعري قبل الكسر';
 }else if(input.lean.side!=='WAIT'&&input.lean.reason.includes('انعكاس محتمل')){
   // Sweep rejection supplies a level to watch, not an immediate BUY/SELL.
   side=input.lean.side;setupKind='SWEEP';
   trigger=side==='BUY'?last.high+atr*.05:last.low-atr*.05;
   invalidation=side==='BUY'?last.low-atr*.05:last.high+atr*.05;
   reason='استرداد مستوى بعد سحب قمة أو قاع';
 }
 // Third independent PRE-MOVE setup: closed M1 compression beside a previously
 // observed swing. This is a price/liquidity proxy, NOT live resting orders.
 // It arms a level ahead of the quote; it never backfills a crossed level.
 if(!side&&bars.length>=18){
   const priorRange=bars.slice(-18,-4);
   const recent=bars.slice(-4);
   const high=Math.max(...priorRange.map(b=>b.high));
   const low=Math.min(...priorRange.map(b=>b.low));
   const width=Math.max(...recent.map(b=>b.high))-
     Math.min(...recent.map(b=>b.low));
   const tight=width>0&&width<=atr*1.65;
   const last4=recent.map(b=>b.close);
   const slope=last4.at(-1)!-last4[0];
   const upperReject=recent.some(b=>b.high>=high-atr*.18&&
     b.close<b.high-atr*.18);
   const lowerReject=recent.some(b=>b.low<=low+atr*.18&&
     b.close>b.low+atr*.18);
   const swingSell=tight&&upperReject&&!lowerReject&&
     last.close<high&&slope<0&&price<high&&
     price>low&&price-last.low<=atr*.65;
   const swingBuy=tight&&lowerReject&&!upperReject&&
     last.close>low&&slope>0&&price>low&&
     price<high&&last.high-price<=atr*.65;
   if(swingSell!==swingBuy){
     side=swingSell?'SELL':'BUY';setupKind='COMPRESSION';
     trigger=side==='SELL'?Math.min(...recent.map(b=>b.low))-atr*.04:
       Math.max(...recent.map(b=>b.high))+atr*.04;
     invalidation=side==='SELL'?Math.max(...recent.map(b=>b.high))+atr*.1:
       Math.min(...recent.map(b=>b.low))-atr*.1;
     reason='انضغاط M1 قرب مستوى سيولة سعري سابق؛ مراقبة كسر مبكر';
   }
 }
 // Rejection/reclaim of a PRE-EXISTING closed-M1 swing. We only arm an
 // unbroken local trigger; the rejection alone is not a BUY/SELL order.
 if(!side){
   const baseline=bars.slice(-16,-4),test=bars.slice(-4);
   const oldHigh=Math.max(...baseline.map(b=>b.high));
   const oldLow=Math.min(...baseline.map(b=>b.low));
   const localHigh=Math.max(...test.map(b=>b.high));
   const localLow=Math.min(...test.map(b=>b.low));
   const testEnd=test.at(-1)!;
   const sweepLow=test.some(b=>b.low<oldLow+atr*.08)&&
     testEnd.close>oldLow+atr*.12&&
     testEnd.close>test[1].close+atr*.08&&
     test.some(b=>b.close<b.open)&&
     testEnd.close-localLow<atr*1.5;
   const sweepHigh=test.some(b=>b.high>oldHigh-atr*.08)&&
     testEnd.close<oldHigh-atr*.12&&
     testEnd.close<test[1].close-atr*.08&&
     test.some(b=>b.close>b.open)&&
     localHigh-testEnd.close<atr*1.5;
   if(sweepLow!==sweepHigh){
     side=sweepLow?'BUY':'SELL';setupKind='RECLAIM';
     trigger=side==='BUY'?localHigh+atr*.04:localLow-atr*.04;
     invalidation=side==='BUY'?localLow-atr*.08:localHigh+atr*.08;
     reason='استرداد مستوى سعري سابق بعد اختبار السيولة · مراقبة تفعيل مبكر';
   }
 }
 // Additional early, closed-bar MICRO preparation. A 3-minute range must
 // contract INSIDE an older observed 11-minute range, before either boundary
 // breaks. Direction needs rising lows/falling highs and a directional close.
 // This is price structure, NOT executed Order Flow or a guaranteed impulse.
 if(!side){
   const older=bars.slice(-14,-3),micro=bars.slice(-3);
   const olderHigh=Math.max(...older.map(b=>b.high));
   const olderLow=Math.min(...older.map(b=>b.low));
   const tinyHigh=Math.max(...micro.map(b=>b.high));
   const tinyLow=Math.min(...micro.map(b=>b.low));
   const narrow=tinyHigh-tinyLow>0&&tinyHigh-tinyLow<=atr*1.45&&
     tinyHigh-tinyLow<=(olderHigh-olderLow)*.55;
   const inside=tinyHigh<olderHigh-atr*.025&&tinyLow>olderLow+atr*.025;
   const up=narrow&&inside&&micro[1].low>=micro[0].low-atr*.07&&
     micro[2].low>=micro[1].low-atr*.07&&
     micro[2].close>micro[0].close+atr*.12&&
     micro[2].close>micro[2].open;
   const down=narrow&&inside&&micro[1].high<=micro[0].high+atr*.07&&
     micro[2].high<=micro[1].high+atr*.07&&
     micro[2].close<micro[0].close-atr*.12&&
     micro[2].close<micro[2].open;
   if(up!==down){
     const candidate=up?'BUY':'SELL';
     const higher=input.m15Side??'WAIT';
     // Do not sell only because a rising trend briefly paused, or vice versa.
     if(higher==='WAIT'||higher===candidate||sweptSide===candidate){
       side=candidate;setupKind='MICRO';
       trigger=up?tinyHigh+atr*.05:tinyLow-atr*.05;
       invalidation=up?tinyLow-atr*.12:tinyHigh+atr*.12;
       reason='ضغط صغير M1 قبل الكسر داخل نطاق سعري أقدم';
     }
   }
 }
 // Start-of-wave COIL: three COMPLETED M1 candles squeeze, with
 // progressively lower highs AND higher lows. M15 must supply the bias.
 // Do not treat a squeeze as a trade: arm the unbroken edge first.
 if(!side&&(input.m15Side==='BUY'||input.m15Side==='SELL')){
   const old=bars.slice(-15,-3),coil=bars.slice(-3);
   const olderWidth=Math.max(...old.map(b=>b.high))-
     Math.min(...old.map(b=>b.low));
   const top=Math.max(...coil.map(b=>b.high));
   const bottom=Math.min(...coil.map(b=>b.low));
   const width=top-bottom;
   const lowerHighs=coil[0].high>coil[1].high+atr*.025&&
     coil[1].high>coil[2].high+atr*.025;
   const higherLows=coil[0].low+atr*.025<coil[1].low&&
     coil[1].low+atr*.025<coil[2].low;
   const compact=width>=atr*.22&&width<=atr*1.25&&
     olderWidth>=width*1.8;
   const center=(top+bottom)/2;
   const higher=input.m15Side;
   const directional= higher==='BUY'?coil[2].close>=center:
     coil[2].close<=center;
   const oppositeMicro=input.m1Side!=='WAIT'&&
     input.m1Side!=null&&input.m1Side!==higher;
   if(lowerHighs&&higherLows&&compact&&directional&&!oppositeMicro){
     side=higher;setupKind='COIL';
     trigger=side==='BUY'?top+atr*.045:bottom-atr*.045;
     invalidation=side==='BUY'?bottom-atr*.1:top+atr*.1;
     reason='انضغاط M1 قبل بداية موجة محتملة · مستوى كسر مراقب';
   }
 }
 if(!side||![trigger,invalidation].every(Number.isFinite))return prior;
 // A same-venue flow/profile contradiction or fresh M15 sweep can veto setup
 // BEFORE it is armed. Missing depth/profile does not fabricate a positive vote.
 if((flowSide!=='WAIT'&&flowSide!==side)||
    (sweptSide!=='WAIT'&&sweptSide!==side))return prior;
 if(flowSide===side){
   reason+=flow!.quality==='EXECUTED_SAMPLE'?
     ' · دلتا الصفقات وPOC من نفس المصدر':
     ' · POC ونشاط عمق وسيط MT5 استرشادي';
 }else reason+=' · Order Flow المنفذ غير مؤكد';
 if(sweptSide===side)reason+=' · سحب سيولة M15 مغلق يدعم الاتجاه';
 // Evidence count is a qualitative checklist, NEVER a win probability.
 // Absent real DOM cannot earn a flow point or block price-only analysis.
 const last3=bars.slice(-3);
 const shortHeight=Math.max(...last3.map(b=>b.high))-
   Math.min(...last3.map(b=>b.low));
 const older=bars.slice(-16,-4);
 const observedEdge=side==='BUY'?Math.max(...older.map(b=>b.high)):
   Math.min(...older.map(b=>b.low));
 const directionalClose=side==='BUY'?
   last.close>bars.at(-3)!.close+atr*.09:
   last.close<bars.at(-3)!.close-atr*.09;
 const evidenceScore=Math.min(10,2+
   (shortHeight>0&&shortHeight<=atr*1.65?1:0)+
   (Math.abs(trigger-price)<=atr*.65?1:0)+
   (directionalClose?1:0)+
   (Math.abs(observedEdge-trigger)<=atr*.55?1:0)+
   (input.m1Side===side?1:0)+
   (input.m15Side===side?1:0)+
   (flowSide===side?1:0)+
   (sweptSide===side?1:0));
 // New MICRO setup is admitted from at least four independent checklist
 // points; existing confirmed compression/sweep plans retain their rules.
 if(setupKind==='MICRO'&&evidenceScore<4)return prior;
 reason+=' · أدلة '+evidenceScore+'/10 (ليست نسبة نجاح)';
 const remaining=side==='BUY'?trigger-price:price-trigger;
 const risk=side==='BUY'?price-invalidation:invalidation-price;
 // Must be first observed BEFORE crossing, near a defined level. Reject a
 // setup already touched by any later/current observed candle, even on pullback.
 const touched=rows.some((b:Bar)=>b.time>=sourceAt&&(side==='BUY'?b.high>=trigger:b.low<=trigger))||
   (Array.isArray(input.bars)?input.bars:[]).some((b:Bar)=>b&&Number.isFinite(b.time)&&
     b.time>=sourceAt&&b.time<=now&&Number.isFinite(b.high)&&Number.isFinite(b.low)&&
     (side==='BUY'?b.high>=trigger:b.low<=trigger));
 if(remaining<=0||remaining>atr*.8||risk<=0||touched)return prior;
 return {scope:input.scope,side,phase:'ARMED',sourceAt,armedAt:now,expiresAt:now+180000,
   trigger,invalidation,atr,priceAt:price,lastPrice:price,lastAt:now,triggeredAt:null,
   crossedAt:null,crossedQuoteAt:null,retestAt:null,score:evidenceScore,setupKind,
   targets:op.side===side?op.targets.filter(t=>side==='BUY'?t>trigger:t<trigger):[],reason};
}
export function earlySetupOpportunity(state:EarlySetup|null):LiveOpportunity{
 const active=state?.phase==='ARMED'||state?.phase==='TRIGGERED';
 return {phase:state?.phase==='ARMED'?(state.crossedAt!=null?'TESTING':'PREPARE'):
   state?.phase==='TRIGGERED'?'BREAK_CONFIRMED':
   state?'CANCELLED':'WATCH',side:active?state!.side:'WAIT',
   trigger:state?.trigger??null,invalidation:state?.invalidation??null,
   targets:active?state!.targets:[],sourceAt:state?.triggeredAt??state?.sourceAt??null,
   strength:0,higherFrame:'NEUTRAL',m15Context:'NEUTRAL',quality:'OBSERVATION',
   reason:state?.reason??'انتظار إعداد قبل الحركة؛ الزخم وحده لا يصدر شراء أو بيع',
   targetNote:'مستويات مراقبة ثابتة، وليست ضمان وصول',tradeEligible:false};
}
