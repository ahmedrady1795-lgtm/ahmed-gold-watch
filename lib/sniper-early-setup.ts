import type {PaxgFlow} from './paxg-flow';
import type {SniperMarketContext} from './sniper-market-context';
import type {LiveOpportunity} from './sniper-live-opportunity';
import type {M5CandleLean} from './sniper-m5-candle-lean';
import type {FlowProfileDecision} from './flow-profile-decision';
import type {LiquidityMagnetView} from './sniper-liquidity-magnets';
import type {LiquidityZone} from './sniper-m15-liquidity';
import type {WatchPriceMap} from './sniper-m15-watch-prices';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type EarlySetup={
 scope:string;side:'BUY'|'SELL';phase:'OBSERVING'|'ARMED'|'TRIGGERED'|'CANCELLED'|'EXPIRED';
 sourceAt:number;armedAt:number;expiresAt:number;trigger:number;invalidation:number;
 crossedAt?:number|null;crossedQuoteAt?:number|null;
 atr:number;priceAt:number;lastPrice:number;lastAt:number;triggeredAt:number|null;
 targets:number[];reason:string;score?:number;setupKind?:'PRESSURE'|'SWEEP'|'COMPRESSION'|'RECLAIM'|'MICRO'|'COIL'|'ZONE'|'PULLBACK'|'PROFILE'|'STRUCTURE';retestAt?:number|null;
 trendSide?:'BUY'|'SELL'|'WAIT';flowAligned?:boolean;localStructureAligned?:boolean;contextNote?:string;
 selectionMargin?:number|null;selectionAgreement?:boolean;selectionConflict?:boolean;
};
/** A confirmed impulse is a description of CLOSED M1 momentum, not a
 * predictive SELL/BUY signal. We use it only to veto stale countertrend
 * preparation, never to fabricate a new trade. */
export function closedM1Impulse(raw:unknown,now:number):'BUY'|'SELL'|'WAIT'{
 if(!Array.isArray(raw))return 'WAIT';
 const candles=raw.filter((b:Bar)=>b&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
   b.time>0&&b.time%60000===0&&b.time+60000<=now&&b.low>0&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
   .sort((a:Bar,b:Bar)=>a.time-b.time).slice(-15) as Bar[];
 if(candles.length<15||candles.some((b,i)=>i>0&&b.time-candles[i-1].time!==60000))
   return 'WAIT';
 if(now-(candles.at(-1)!.time+60000)>90000)return 'WAIT';
 const ranges=candles.slice(1).map((b,i)=>Math.max(
   b.high-b.low,Math.abs(b.high-candles[i].close),Math.abs(b.low-candles[i].close)));
 const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;
 if(!(atr>0))return 'WAIT';
 const last=candles.at(-1)!,old=candles.at(-4)!;
 const tail=candles.slice(-3);
 const downBodies=tail.filter(b=>b.close<b.open-atr*.12).length;
 const upBodies=tail.filter(b=>b.close>b.open+atr*.12).length;
 const priorFloor=Math.min(...candles.slice(-11,-3).map(b=>b.low));
 const priorCeiling=Math.max(...candles.slice(-11,-3).map(b=>b.high));
 const down=old.close-last.close>=atr*1.25&&downBodies>=2&&
   last.close<priorFloor-atr*.05;
 const up=last.close-old.close>=atr*1.25&&upBodies>=2&&
   last.close>priorCeiling+atr*.05;
 return down&&!up?'SELL':up&&!down?'BUY':'WAIT';
}
// On the first M1 close back inside an established range, arm the rejection
// candle's edge while the live quote is still near the reclaimed boundary.
function firstReclaim(bars:Bar[],price:number,atr:number){
 const last=bars[bars.length-1];
 const prior=bars.slice(-13,-1);
 const floor=Math.min(...prior.map(b=>b.low));
 const ceiling=Math.max(...prior.map(b=>b.high));
 const buy=last.low<floor-atr*.05&&last.close>floor&&last.close>last.open;
 const sell=last.high>ceiling+atr*.05&&last.close<ceiling&&last.close<last.open;
 if(buy===sell||last.high>ceiling&&last.low<floor)return null;
 const sign=buy?1:-1;
 const edge=buy?floor:ceiling;
 const progress=sign*(price-edge);
 if(progress<0||progress>atr*.25||sign*(last.close-edge)>atr*.25)return null;
 return {side:buy?'BUY' as const:'SELL' as const,
   trigger:buy?last.high+atr*.04:last.low-atr*.04,
   invalidation:buy?last.low-atr*.08:last.high+atr*.08};
}
/** Session-only arming: reloading cannot invent an earlier observation. */
export function advanceEarlySetup(input:{prior:EarlySetup|null;scope:string;now:number;
 proxy?:PaxgFlow|null;previousQuote?:{at:number;price:number}|null;
 price:number|null;quoteAt?:number|null;ready:boolean;bars:unknown;opportunity:LiveOpportunity;lean:M5CandleLean;
 flow?:FlowProfileDecision|null;liquidity?:LiquidityMagnetView|null;
 zones?:readonly LiquidityZone[];watch?:WatchPriceMap|null;marketContext?:SniperMarketContext|null;
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
 // An independent, recent M1 closed-candle displacement invalidates
 // a counter-direction WATCH immediately. This avoids stale BUY banners through
 // a fast support breakdown while retaining continuous M5 direction monitoring.
 const closedImpulse=closedM1Impulse(input.bars,now);
 if(prior&&(prior.phase==='ARMED'||prior.phase==='OBSERVING')&&
   closedImpulse!=='WAIT'&&closedImpulse!==prior.side)
   return {...prior,phase:'CANCELLED',lastAt:now,lastPrice:price,
     reason:'إلغاء الترصد: موجة '+(closedImpulse==='SELL'?'هبوط':'صعود')+
       ' مؤكدة من M1 المغلق ضد الإعداد؛ ليس تنبؤ دخول'};
 // Two NEW completed M1 candles against an untriggered setup invalidate
 // its original pre-break thesis. This is local, causal cancellation, not a
 // stricter general filter: subsequent fresh setup candidates still get scored.
 // A countertrend bounce is NOT converted into an opposing trade signal.
 if(prior?.phase==='ARMED'&&prior.crossedAt==null){
   const recent=(Array.isArray(input.bars)?input.bars:[]).filter((b:Bar)=>
     b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
     b.time%60000===0&&b.time>=prior!.sourceAt&&
     b.time+60000<=now&&b.low>0&&
     b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
     .sort((a:Bar,b:Bar)=>a.time-b.time).slice(-2) as Bar[];
   if(recent.length===2&&recent[1].time-recent[0].time===60000&&
      now-(recent[1].time+60000)<=90000){
     const against=prior.side==='SELL'?
       recent.every(b=>b.close-b.open>=prior!.atr*.16)&&
         recent[1].close>=recent[0].high-prior.atr*.04&&
         recent[1].close-prior.priceAt>=prior.atr*.38:
       recent.every(b=>b.open-b.close>=prior!.atr*.16)&&
         recent[1].close<=recent[0].low+prior.atr*.04&&
         prior.priceAt-recent[1].close>=prior.atr*.38;
     if(against)return {...prior,phase:'CANCELLED',lastAt:now,
       lastPrice:price,reason:'إلغاء الترصد: إغلاقا M1 ضد مستوى الإعداد قبل التفعيل'};
   }
 }
 // A historical support/resistance approach is a ZONE OBSERVATION,
 // not a BUY/SELL setup. It cannot be triggered by a quote crossing its
 // exploratory line. Later, separate closed-M1 reclaim/pressure evidence can
 // arm a new setup; never retrospectively promote the old observation.
 if(prior?.phase==='OBSERVING'){
   const breached=prior.side==='BUY'?price<=prior.invalidation:
     price>=prior.invalidation;
   const departed=prior.side==='BUY'?price>=prior.trigger:
     price<=prior.trigger;
   const expired=now>=prior.expiresAt;
   const gap=now-prior.lastAt>15000;
   if(breached||departed||expired||gap)return {...prior,
     phase:breached||gap?'CANCELLED':'EXPIRED',lastAt:now,lastPrice:price,
     reason:breached?'السعر اخترق منطقة المراقبة ضد الانعكاس':
       departed?'غادر السعر نطاق المراقبة؛ لم تُرصد تهيئة انعكاس مؤهلة':
       expired?'انتهت مراقبة المنطقة دون تهيئة مؤهلة':
       'انقطعت متابعة السعر؛ انتهت مراقبة المنطقة'};
 }
 if((prior?.phase==='ARMED'||prior?.phase==='TRIGGERED')&&
   ((flowSide!=='WAIT'&&flowSide!==prior.side)||
    (sweptSide!=='WAIT'&&sweptSide!==prior.side)))
   return {...prior,phase:'CANCELLED',lastAt:now,
     reason:flowSide!=='WAIT'&&flowSide!==prior.side?
       'تدفق المصدر والبروفايل يعارضان الإعداد المبكر':
       'سحب سيولة M15 مغلق يعارض الإعداد المبكر'};
 if(prior?.phase==='ARMED'&&input.m1Side&&input.m1Side!=='WAIT'&&
   input.m15Side===input.m1Side&&input.m1Side!==prior.side&&
   flowSide!==prior.side&&sweptSide!==prior.side){
   const newer=(Array.isArray(input.bars)?input.bars:[]).some((b:Bar)=>
     b&&Number.isFinite(b.time)&&b.time%60000===0&&
     b.time+60000>prior!.sourceAt&&b.time+60000<=now);
   if(newer)return {...prior,phase:'CANCELLED',lastAt:now,lastPrice:price,
     reason:'تغير اتجاه M1 وM15 بعد الإعداد؛ إلغاء الترصد المعاكس وإعادة التقييم'};
 }
 if(prior&&(prior.phase==='ARMED'||prior.phase==='TRIGGERED')){
   const invalid=prior.side==='BUY'?price<=prior.invalidation:price>=prior.invalidation;
   // A recent activated breakout returning through its frozen level is a
   // FAILED BREAK, even if the much farther structural stop remains untouched.
   // Keep the historical BREAK marker for forward audit, never erase it.
   const rejected=prior.phase==='TRIGGERED'&&prior.triggeredAt!=null&&
     (prior.side==='BUY'?price<prior.trigger-prior.atr*.12:
       price>prior.trigger+prior.atr*.12);
   if(rejected)return {...prior,phase:'CANCELLED',lastAt:now,lastPrice:price,
     reason:'فشل اختراق '+(prior.side==='BUY'?'شراء':'بيع')+
       '؛ السعر عاد عبر مستوى التفعيل بعد الإشارة'};
   const objectiveReached=prior.phase==='TRIGGERED'&&prior.targets.length>0&&
     (prior.side==='BUY'?price>=prior.targets[0]:price<=prior.targets[0]);
   if(objectiveReached)return {...prior,phase:'EXPIRED',lastAt:now,lastPrice:price,
     reason:'السعر وصل أول مستوى مرصود؛ الإشارة السابقة انتهت وسجلها محفوظ'};
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
     const quoteAt=input.quoteAt;
     if(quoteAt==null||!Number.isFinite(quoteAt)||quoteAt>now||now-quoteAt>15000)
       return {...prior,lastPrice:price,lastAt:now,
         reason:'عبور سعري دون توقيت عرض حديث؛ لا تأكيد من ساعة الشاشة'};
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
       trendSide:input.m15Side??'WAIT',flowAligned:flowSide===prior.side,
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
 // New closed evidence may arm a new setup immediately. The same source
 // candle cannot repeatedly re-arm a failed setup on every quote.
 const rows=(Array.isArray(input.bars)?input.bars:[]).filter((b:Bar)=>b&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time>0&&
   b.time%60000===0&&b.time+60000<=now&&b.low>0&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 const bars=[...new Map<number,Bar>(rows.map((b:Bar)=>[b.time,b])).values()]
   .sort((a,b)=>a.time-b.time).slice(-18);
 if(bars.length<18||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return prior;
 const last=bars.at(-1)!,sourceAt=last.time+60000;
 const observingSameBar=prior?.phase==='OBSERVING'&&sourceAt===prior.sourceAt;
 if(now-sourceAt>90000||prior&&sourceAt<=prior.sourceAt&&!observingSameBar)return prior;
 const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=ranges.slice(-14).reduce((a,b)=>a+b,0)/14;
 if(!(atr>0)||atr>price*.04)return prior;
 const ctx=input.marketContext;
 const contextFresh=Boolean(ctx&&Number.isFinite(ctx.asOf)&&ctx.asOf<=now&&now-ctx.asOf<=180000);
 const op=input.opportunity;
 let side:'BUY'|'SELL'|null=null,trigger=0,invalidation=0;
 let setupKind:EarlySetup['setupKind']='PRESSURE';
 let reason='';
 // Collect alternative, independently observable preparations from the SAME
 // closed-M1 snapshot. The first matching detector is no longer the winner.
 // No price beyond now, hindsight outcomes, or synthetic Order Flow is used.
 type Candidate={side:'BUY'|'SELL';setupKind:NonNullable<EarlySetup['setupKind']>;
   trigger:number;invalidation:number;reason:string};
 const candidates:Candidate[]=[];
 const collect=()=>{
   if(side&&Number.isFinite(trigger)&&Number.isFinite(invalidation))
     candidates.push({side,trigger,invalidation,setupKind:setupKind!,reason});
   side=null;trigger=0;invalidation=0;reason='';setupKind='PRESSURE';
 };
 // Trend pullback: a completed impulse, followed by two contracting candles
 // against it, holding the impulse origin. Arm the LOCAL resumption edge,
 // before it breaks, rather than waiting for the entire old swing to break.
 // M15 or actual same-venue flow supplies context; price momentum alone does not.
 const context=flowSide!=='WAIT'?flowSide:(input.m15Side??'WAIT');
 if(!side&&context!=='WAIT'){
   const impulse=bars.slice(-6,-2),pause=bars.slice(-2);
   const sign=context==='BUY'?1:-1;
   const drive=sign*(impulse.at(-1)!.close-impulse[0].open);
   const high=Math.max(...impulse.map(b=>b.high));
   const low=Math.min(...impulse.map(b=>b.low));
   const top=Math.max(...pause.map(b=>b.high));
   const bottom=Math.min(...pause.map(b=>b.low));
   const retrace=sign*(impulse.at(-1)!.close-last.close);
   const held=context==='BUY'?bottom>low+atr*.1:top<high-atr*.1;
   const contracting=top-bottom<=atr*1.4&&top-bottom<high-low;
   const opposing= pause.some(b=>sign*(b.close-b.open)<-atr*.05);
   if(drive>=atr*.8&&retrace>=atr*.08&&retrace<=drive*.65&&
     held&&contracting&&opposing){
     side=context;setupKind='PULLBACK';
     trigger=context==='BUY'?top+atr*.035:bottom-atr*.035;
     invalidation=context==='BUY'?bottom-atr*.12:top+atr*.12;
     reason='تصحيح قصير حافظ على أصل الموجة؛ رصد استئناف الاتجاه قبل كسر النطاق المحلي';
   }
 }
 collect();
 if(!side&&op.phase==='PREPARE'&&(op.side==='BUY'||op.side==='SELL')&&
   op.trigger!=null&&op.invalidation!=null&&op.sourceAt!=null&&
   op.sourceAt<=now&&now-op.sourceAt<=90000){
   side=op.side;trigger=op.trigger;invalidation=op.invalidation;
   reason='ضغط سعري قبل الكسر';
 }else if(!side&&input.lean.side!=='WAIT'&&input.lean.reason.includes('انعكاس محتمل')){
   // Sweep rejection supplies a level to watch, not an immediate BUY/SELL.
   side=input.lean.side;setupKind='SWEEP';
   trigger=side==='BUY'?last.high+atr*.05:last.low-atr*.05;
   invalidation=side==='BUY'?last.low-atr*.05:last.high+atr*.05;
   reason='استرداد مستوى بعد سحب قمة أو قاع';
 }
 collect();
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
 collect();
 // Only consecutive live quotes from the chart feed can establish the order
 // of a sweep and recovery inside the still-open minute.
 let liveReclaim:Candidate|undefined;
 const previous=input.previousQuote, at=input.quoteAt;
 if(previous&&at!=null&&sourceAt<=previous.at&&previous.at<at&&at<=now&&
    at-previous.at<=10000&&now-at<=10000&&now<sourceAt+60000&&
    Number.isFinite(previous.price)&&previous.price>0){
   const range=bars.slice(-12);
   const floor=Math.min(...range.map(b=>b.low));
   const ceiling=Math.max(...range.map(b=>b.high));
   const up=previous.price<floor-atr*.05&&price>=floor+atr*.02&&price<=floor+atr*.25;
   const down=previous.price>ceiling+atr*.05&&price<=ceiling-atr*.02&&price>=ceiling-atr*.25;
   if(up||down){
     liveReclaim={side:up?'BUY':'SELL',setupKind:'RECLAIM',
       trigger:price+(up?1:-1)*atr*.08,
       invalidation:previous.price+(up?-1:1)*atr*.08,
       reason:'استرداد حي داخل الدقيقة بعد عبور مستوى سابق على تحديثين سعريين'};
     candidates.push(liveReclaim);
   }
 }
 // A proxy can warn ahead of a local range break. Both observed quotes must
 // remain inside the same compact gold range and move towards its near edge.
 let proxyPressure:Candidate|undefined;
 const proxy=input.proxy;
 if(proxy&&(proxy.side==='BUY'||proxy.side==='SELL')&&
   proxy.observedAt<=now&&now-proxy.observedAt<=12000&&proxy.tradeAt<=now&&
   now-proxy.tradeAt<=15000&&proxy.count>=3&&previous&&at!=null&&
   previous.at>=sourceAt&&previous.at<at&&at<=now&&now-at<=10000&&
   at-previous.at<=10000&&now-sourceAt<60000){
   const tail=bars.slice(-3);
   const high=Math.max(...tail.map(b=>b.high)),low=Math.min(...tail.map(b=>b.low));
   const buy=proxy.side==='BUY',gap=buy?high-price:price-low;
   const approach=(buy?1:-1)*(price-previous.price);
   if(high-low<=1.5*atr&&previous.price>=low&&previous.price<=high&&
     gap>=atr*.05&&gap<=atr*.4&&approach>0&&approach<=atr*.25&&
     Math.abs(price-last.close)<=atr*.65){
     proxyPressure={side:proxy.side,setupKind:'PRESSURE',trigger:buy?high:low,
       invalidation:buy?low:high,reason:'ضغط دفتر وتنفيذ PAXG مع اقتراب الذهب من حافة نطاق M1 قبل الكسر'};
     candidates.push(proxyPressure);
   }
 }
 const onset=firstReclaim(bars,price,atr);
 if(onset){
   candidates.push({...onset,setupKind:'RECLAIM',
     reason:'أول إغلاق دقيقة استرد مستوى سابق؛ رصد بداية الارتداد قرب المستوى'});
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
 collect();
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
 collect();
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
 collect();
 // Value-area rejection is a separate opportunity source, not a mandatory
 // gate. Quote-only profiles remain indicative and earn NO executed-flow vote.
 const profileFresh=Boolean(flow?.profileReady&&
   (flow.profileBasis==='EXECUTED_TRADES'||flow.profileBasis==='QUOTE_UPDATES')&&flow.asOf!=null&&flow.observedAt!=null&&
   flow.asOf<=now&&flow.observedAt<=now&&now-flow.asOf<=15000&&now-flow.observedAt<=15000);
 if(!side&&profileFresh&&[flow!.poc,flow!.val,flow!.vah].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&
   flow!.val!<flow!.vah!&&flow!.poc!>=flow!.val!&&flow!.poc!<=flow!.vah!){
   const buy=last.low<flow!.val!-atr*.04&&last.close>flow!.val!+atr*.04&&
     last.close>last.open&&price>flow!.val!&&last.high+atr*.135<flow!.poc!;
   const sell=last.high>flow!.vah!+atr*.04&&last.close<flow!.vah!-atr*.04&&
     last.close<last.open&&price<flow!.vah!&&last.low-atr*.135>flow!.poc!;
   if(buy!==sell){
     side=buy?'BUY':'SELL';setupKind='PROFILE';
     trigger=buy?last.high+atr*.035:last.low-atr*.035;
     invalidation=buy?last.low-atr*.12:last.high+atr*.12;
     reason='رفض حافة البروفايل الحالي واسترداد نطاق القيمة؛ رصد الكسر المحلي قبل حدوثه'+
       (flow!.profileBasis==='EXECUTED_TRADES'?' · عينة حجم منفذ':' · نشاط أسعار استرشادي، ليس حجم تنفيذ');
   }
 }
 collect();
 // PRE-ZONE WATCH: a pre-existing M15/H1 price low/high is known BEFORE
 // price touches it. This arms a nearby break level while the M1 move is
 // approaching the zone, never after the turn or by repurposing a LIVE wick.
 // These are historical swing references, NOT resting exchange orders.
 if(!side&&input.watch?.ready&&input.watch.asOf!=null&&
   input.watch.asOf<=sourceAt&&now-input.watch.asOf<=3600000){
   const map=input.watch;
   const levels=[
     ...map.lower.map(l=>({...l,plan:'BUY' as const})),
     ...map.upper.map(l=>({...l,plan:'SELL' as const}))
   ].filter(l=>l.price>0&&Number.isFinite(l.price)&&
     (l.source==='M15'||l.source==='H1')&&
     (l.kind==='SWING'||l.kind==='RANGE'))
    .sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price));
   for(const l of levels){
     const buy=l.plan==='BUY';
     const away=buy?price-l.price:l.price-price;
     // Only APPROACH from the safe side of the level, not a bounce
     // which has already passed or a distant trend continuation.
     const movingToward=buy?
       last.close<bars.at(-3)!.close-atr*.08:
       last.close>bars.at(-3)!.close+atr*.08;
     const atZone=away>=atr*.07&&away<=atr*.8&&
       (buy?last.low<=l.price+atr*.65:last.high>=l.price-atr*.65);
     const entryHigh=Math.max(...bars.slice(-2).map(b=>b.high));
     const entryLow=Math.min(...bars.slice(-2).map(b=>b.low));
     const localTrigger=buy?entryHigh+atr*.035:entryLow-atr*.035;
     const invalid=buy?l.price-atr*.42:l.price+atr*.42;
     const ahead=buy?localTrigger>price+atr*.045:
       localTrigger<price-atr*.045;
     const distance=Math.abs(localTrigger-price);
     if(!atZone||!movingToward||!ahead||distance>atr*.75)continue;
     // A recent confirmed M15 sweep against the proposed reversal is
     // contradictory evidence; an unavailable sweep is NOT agreement.
     if(sweptSide!=='WAIT'&&sweptSide!==l.plan)continue;
     side=l.plan;setupKind='ZONE';trigger=localTrigger;invalidation=invalid;
     reason='مراقبة '+(buy?'دعم':'مقاومة')+' '+l.source+
       ' مثبت سابقًا؛ قبل اختبار كسر M1';
     break;
   }
 }
 collect();
 // STRUCTURE-EDGE COMPETITOR. Detect a potential BOS on three COMPLETED
 // M1 candles APPROACHING a historical low/high, never after the break.
 // A lower-high sequence near an older floor can beat a contradictory
 // single-pattern BUY. This is NOT a sell fill or guaranteed breakdown.
 const olderEdge=bars.slice(-15,-3),edgeTail=bars.slice(-3);
 const olderHigh=Math.max(...olderEdge.map(b=>b.high));
 const olderLow=Math.min(...olderEdge.map(b=>b.low));
 const downSequence=edgeTail[0].high>edgeTail[1].high+atr*.035&&
   edgeTail[1].high>edgeTail[2].high+atr*.035&&
   edgeTail[2].close<edgeTail[0].close-atr*.20&&
   edgeTail[2].close<edgeTail[2].open;
 const upSequence=edgeTail[0].low+atr*.035<edgeTail[1].low&&
   edgeTail[1].low+atr*.035<edgeTail[2].low&&
   edgeTail[2].close>edgeTail[0].close+atr*.20&&
   edgeTail[2].close>edgeTail[2].open;
 const nearLow=last.close>olderLow+atr*.035&&
   last.close<olderLow+atr*.60&&
   price>olderLow+atr*.025&&price<olderLow+atr*.72;
 const nearHigh=last.close<olderHigh-atr*.035&&
   last.close>olderHigh-atr*.60&&
   price<olderHigh-atr*.025&&price>olderHigh-atr*.72;
 // A gentle drift next to support/resistance is not a BOS pre-move.
 // Require at least two decisive CLOSED bodies in the expected direction.
 const bearishBodies=edgeTail.filter(b=>b.open-b.close>atr*.12).length;
 const bullishBodies=edgeTail.filter(b=>b.close-b.open>atr*.12).length;
 const structureSell=downSequence&&nearLow&&bearishBodies>=2;
 const structureBuy=upSequence&&nearHigh&&bullishBodies>=2;
 const structureSide:'BUY'|'SELL'|null=structureSell!==structureBuy?
   structureSell?'SELL':'BUY':null;
 if(structureSide){
   const trendVotes=Number(input.m1Side===structureSide)+
     Number(input.m15Side===structureSide)+Number(flowSide===structureSide);
   const againstSweep=sweptSide!=='WAIT'&&sweptSide!==structureSide;
   // A strongly closed M1 structure may outrank a weaker first-picked pattern
   // when M15 has no direction yet. A known OPPOSITE M15/flow still needs
   // two independent positive votes, never infer consent from missing data.
   const m15Unknown=!input.m15Side||input.m15Side==='WAIT';
   const locallyDominant=input.m1Side===structureSide&&
     m15Unknown&&flowSide==='WAIT'&&
     (structureSide==='SELL'?bearishBodies:bullishBodies)>=2;
   const canChallenge=side==null||side!==structureSide&&
     (trendVotes>=2||locallyDominant);
   if(canChallenge&&trendVotes>=1&&!againstSweep){
     const lower=Math.min(...edgeTail.map(b=>b.low));
     const upper=Math.max(...edgeTail.map(b=>b.high));
     const edgeTrigger=structureSide==='SELL'?
       Math.min(olderLow,lower)-atr*.035:
       Math.max(olderHigh,upper)+atr*.035;
     const edgeInvalid=structureSide==='SELL'?upper+atr*.12:
       lower-atr*.12;
     const edgeRemaining=structureSide==='SELL'?
       price-edgeTrigger:edgeTrigger-price;
     const edgeRisk=structureSide==='SELL'?
       edgeInvalid-price:price-edgeInvalid;
     // Compare feasible candidates before replacement. Previously a remote
     // structure edge could overwrite a valid preparation and then fail the
     // global ATR-distance check, discarding BOTH setups.
     const edgeAlreadyTouched=(Array.isArray(input.bars)?input.bars:[])
       .some((b:Bar)=>b&&Number.isFinite(b.time)&&b.time>=sourceAt&&
         b.time<=now&&Number.isFinite(b.low)&&Number.isFinite(b.high)&&
         (structureSide==='SELL'?b.low<=edgeTrigger:b.high>=edgeTrigger));
     if(edgeRemaining>0&&edgeRemaining<=atr*.8&&edgeRisk>0&&
       !edgeAlreadyTouched){
       side=structureSide;setupKind='STRUCTURE';
       trigger=edgeTrigger;invalidation=edgeInvalid;
       reason='اقتراب M1 من '+(structureSide==='SELL'?'كسر قاع':'كسر قمة')+
         ' تاريخي مع '+(structureSide==='SELL'?'قمم أدنى':'قيعان أعلى')+
         '؛ تهيئة سابقة للكسر وليست متابعة بعده';
       if(locallyDominant&&trendVotes<2)
         reason+=' · ضغط شموع M1 رجّح الكسر رغم غياب اتجاه M15';
     }
   }
 }
 collect();
 // Score only supply/demand that had already been confirmed before the M1
 // candle tested it. Pool targets and zones recovered after a data gap do
 // not establish a live obstacle or reversal.
 const zones=(input.zones??[]).filter(z=>z.confirmedAt!=null&&
   z.confirmedAt<=last.time&&z.low>0&&z.high>=z.low&&
   !z.source.includes('فجوة')&&['SUPPLY','DEMAND','REBOUND_UP','REBOUND_DOWN'].includes(z.kind));
 const demand=(z:LiquidityZone)=>z.kind==='DEMAND'||z.kind==='REBOUND_UP';
 const recent=bars.slice(-6);
 const recentLow=Math.min(...recent.map(b=>b.low));
 const recentHigh=Math.max(...recent.map(b=>b.high));
 // Two separated wick rejections can mark a nearer M1 barrier than the
 // M15 map, provided no later closed minute accepted price beyond it.
 const olderTests=bars.slice(0,-3);
 for(const buy of [true,false]){
   const rejected=olderTests.filter((b,i)=>i>0&&i+1<olderTests.length&&(buy?
     b.high>olderTests[i-1].high&&b.high>olderTests[i+1].high&&
       b.high-Math.max(b.open,b.close)>=atr*.3:
     b.low<olderTests[i-1].low&&b.low<olderTests[i+1].low&&
       Math.min(b.open,b.close)-b.low>=atr*.3));
   for(const b of rejected){
     const level=buy?b.high:b.low;
     const repeated=rejected.some(a=>a.time<=b.time-120000&&
       Math.abs((buy?a.high:a.low)-level)<=atr*.18);
     if(!repeated||bars.some(a=>a.time>b.time&&
       (buy?a.close>level+atr*.1:a.close<level-atr*.1)))continue;
     zones.push({kind:buy?'SUPPLY':'DEMAND',low:level-atr*.1,high:level+atr*.1,
       confirmedAt:b.time+60000,label:'رفض متكرر',source:'ذيول M1 مغلقة'});
   }
 }
 for(const z of zones){
   const buy=demand(z),edge=buy?z.high:z.low,sign=buy?1:-1;
   const tail=buy?Math.min(last.open,last.close)-last.low:last.high-Math.max(last.open,last.close);
   const touched=buy?last.low<=edge&&last.low>=z.low-atr*.2:
     last.high>=edge&&last.high<=z.high+atr*.2;
   const recovery=sign*(price-edge);
   if(!touched||tail<atr*.25||sign*(last.close-last.open)<=0||
     sign*(last.close-edge)<=0||recovery<0||recovery>atr*.45)continue;
   candidates.push({side:buy?'BUY':'SELL',setupKind:'RECLAIM',
     trigger:buy?last.high+atr*.035:last.low-atr*.035,
     invalidation:buy?last.low-atr*.08:last.high+atr*.08,
     reason:'رفض مبكر عند '+(buy?'طلب':'عرض')+' محدد قبل اللمس؛ السعر قريب من المنطقة'});
 }
 // Treat each trigger as a prospective choice. Reject an already-crossed
 // level BEFORE comparing scores; a high-scoring remote candidate must never
 // suppress a nearby valid one. Zone observations are available but do not
 // outrank genuine pre-break preparations.
 const viable=candidates.filter(c=>{
   if(observingSameBar&&c!==liveReclaim&&c!==proxyPressure)return false;
   const remaining=c.side==='BUY'?c.trigger-price:price-c.trigger;
   const risk=c.side==='BUY'?price-c.invalidation:c.invalidation-price;
   const buy=c.side==='BUY';
   const extended=(buy?price-recentLow:recentHigh-price)>atr*1.8;
   if(c.setupKind!=='ZONE'&&extended&&zones.some(z=>{
     if(demand(z)===buy)return false;
     const room=buy?z.low-c.trigger:c.trigger-z.high;
     const stillAhead=buy?price<=z.high:price>=z.low;
     return stillAhead&&room<Math.min(risk,atr);
   }))return false;
   const touched=(Array.isArray(input.bars)?input.bars:[]).some((b:Bar)=>
     b&&Number.isFinite(b.time)&&b.time>=sourceAt&&b.time<=now&&
     Number.isFinite(b.low)&&Number.isFinite(b.high)&&
     (c.side==='BUY'?b.high>=c.trigger:b.low<=c.trigger));
   return remaining>0&&remaining<=atr*.8&&risk>0&&!touched&&
     (c.setupKind==='ZONE'||closedImpulse==='WAIT'||closedImpulse===c.side)&&
     (flowSide==='WAIT'||flowSide===c.side)&&
     (sweptSide==='WAIT'||sweptSide===c.side);
 });
 const evidenceRank=(c:Candidate)=>{
   const tail=bars.slice(-3);
   const same=tail.filter(b=>c.side==='BUY'?
     b.close-b.open>atr*.12:b.open-b.close>atr*.12).length;
   const against=tail.filter(b=>c.side==='BUY'?
     b.open-b.close>atr*.12:b.close-b.open>atr*.12).length;
   // Ranking score is not probability of a winning trade.
   const structural={
     PRESSURE:1.0,SWEEP:1.3,COMPRESSION:1.4,RECLAIM:1.5,
     MICRO:1.25,COIL:1.3,ZONE:-3,PULLBACK:1.6,
     PROFILE:1.45,STRUCTURE:1.65
   }[c.setupKind];
   const remaining=Math.abs(c.trigger-price);
   const m1=input.m1Side==='WAIT'||!input.m1Side?0:
     input.m1Side===c.side?1.1:-.95;
   const m15=input.m15Side==='WAIT'||!input.m15Side?0:
     input.m15Side===c.side?1.0:-1.2;
   const flowVote=flowSide==='WAIT'?0:flowSide===c.side?1.2:-1.5;
   const sweepVote=sweptSide==='WAIT'?0:sweptSide===c.side?1.1:-1.6;
   const bodyVote=same>=2?1:against>=2?-1:0;
   const buy=c.side==='BUY';
   const obstacleDistances=zones.filter(z=>demand(z)!==buy)
     .map(z=>buy?z.low-c.trigger:c.trigger-z.high).filter(d=>d>0);
   const riskFromBreak=Math.abs(c.trigger-c.invalidation);
   const nearest=Math.min(...obstacleDistances);
   // In a contest prefer the setup with space after its trigger. Unknown
   // zones give no advantage and a distant target cannot erase a nearer wall.
   const roomVote=Number.isFinite(nearest)&&riskFromBreak>0?
     Math.min(0,nearest/riskFromBreak-1):0;
   const nearVote=remaining<=atr*.52?.6:0;
   return structural+m1+m15+flowVote+sweepVote+bodyVote+nearVote+roomVote;
 };
 const ranked=viable.map((c,index)=>({c,index,rank:evidenceRank(c)}))
   .sort((a,b)=>b.rank-a.rank||a.index-b.index);
 const chosen=ranked[0]?.c;
 if(!chosen)return prior;
 ({side,setupKind,trigger,invalidation,reason}=chosen);
 // Prospective consensus is counted by DISTINCT detector types, not the
 // number of correlated labels produced by the same few M1 candles.
 // The closest opposite direction, not the arbitrary second row, measures
 // true ambiguity in the winner. All figures are quality evidence, NOT P(win).
 const contrary=ranked.find(r=>r.c.side!==side);
 const selectionMargin=contrary?ranked[0].rank-contrary.rank:null;
 const selectionAgreement=ranked.some(r=>r!==ranked[0]&&
   r.c.side===side&&r.c.setupKind!==chosen.setupKind);
 const selectionConflict=selectionMargin!=null&&selectionMargin<.8;
 if(selectionAgreement)
   reason+=' · نموذجان مختلفان يؤيدان الاتجاه (ليس تأكيدًا مستقلًا من بورصة)';
 if(contrary)
   reason+=' · نموذج عكسي مرصود بفارق '+selectionMargin!.toFixed(1)+
     (selectionConflict?'؛ الإعداد متنازع عليه':'؛ الترجيح أوضح')+
     ' (ليس احتمال نجاح)';
 if(!side||![trigger,invalidation].every(Number.isFinite))return prior;
 // A recent directional displacement is a veto on fresh countertrend arming.
 // Reversal monitoring at a historical zone stays observable; a BUY/SELL
 // preparation needs new closed-bar evidence AFTER the impulse has ended.
 if(setupKind!=='ZONE'&&closedImpulse!=='WAIT'&&side!==closedImpulse)
   return prior;
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
 // Closed-body pressure is information from the already available M1 bars.
 // Count it as ONE quality vote (or a soft deduction), not a new entry gate.
 // Do not treat a wick, missing flow, or daily VIX as executed order flow.
 const sameBodies=last3.filter(b=>side==='BUY'?
   b.close-b.open>atr*.12:b.open-b.close>atr*.12).length;
 const opposedBodies=last3.filter(b=>side==='BUY'?
   b.open-b.close>atr*.12:b.close-b.open>atr*.12).length;
 const candlePressureVote=sameBodies>=2&&opposedBodies<=1?1:
   opposedBodies>=2&&sameBodies<=1?-1:0;
 if(candlePressureVote>0)reason+=' · ضغط إغلاقات M1 يؤيد الاتجاه';
 if(candlePressureVote<0)reason+=' · ضغط إغلاقات M1 يعاكس الترصد';
 const priceEvidenceScore=Math.max(0,Math.min(10,2+
   (shortHeight>0&&shortHeight<=atr*1.65?1:0)+
   (Math.abs(trigger-price)<=atr*.65?1:0)+
   (directionalClose?1:0)+
   (Math.abs(observedEdge-trigger)<=atr*.55?1:0)+
   (input.m1Side===side?1:0)+
   (input.m15Side===side?1:0)+
   (flowSide===side?1:0)+
   (sweptSide===side?1:0)+candlePressureVote));
 // New MICRO setup is admitted from at least four independent checklist
 // points; existing confirmed compression/sweep plans retain their rules.
 if(setupKind==='MICRO'&&priceEvidenceScore<4)return prior;
 // News/sentiment cannot qualify a weak price setup on their own.
 const newsAdjustment=contextFresh&&ctx!.newsSide!=='WAIT'?(ctx!.newsSide===side ? .5 : -.5):0;
 const stressed=contextFresh&&(ctx!.stress||ctx!.newsRisk>=75);
 const regimeAdjustment=stressed?(setupKind==='PULLBACK'||setupKind==='PROFILE' ? .5 : -.5):0;
 // A weak near-tie must not masquerade as a high-confidence signal.
 // Keep watching/arming rather than blanket-blocking price analysis.
 const agreementAdjustment=selectionAgreement?.5:0;
 const conflictAdjustment=selectionConflict?-1.5:0;
 const evidenceScore=Math.max(0,Math.min(10,
   priceEvidenceScore+newsAdjustment+regimeAdjustment+
   agreementAdjustment+conflictAdjustment));
 const localStructureAligned=input.m1Side===side&&priceEvidenceScore>=6&&
   ['PULLBACK','RECLAIM','COMPRESSION','PROFILE','STRUCTURE'].includes(setupKind);
 if(contextFresh)reason+=' · '+ctx!.reason;
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
 // Freeze nearby observed price objectives for EVERY setup, not just the
 // pressure detector's side. Never synthesize a profit target from ATR.
 const watchFresh=input.watch?.ready&&input.watch.asOf!=null&&
   input.watch.asOf<=now&&now-input.watch.asOf<=3600000;
 const levelPrices=watchFresh?(side==='BUY'?input.watch!.upper:input.watch!.lower)
   .map(l=>l.price):[];
 const targetPrices=[...(op.side===side?op.targets:[]),...levelPrices,
   ...(setupKind==='PROFILE'&&flow?.poc!=null?[flow.poc]:[]),
   ...bars.slice(0,-2).map(b=>side==='BUY'?b.high:b.low)]
   .filter(t=>Number.isFinite(t)&&(side==='BUY'?t>trigger+atr*.1:t<trigger-atr*.1))
   .sort((a,b)=>side==='BUY'?a-b:b-a);
 const targets:number[]=[];
 for(const target of targetPrices)
   if(!targets.some(t=>Math.abs(t-target)<atr*.1))targets.push(target);
 return {scope:input.scope,side,phase:setupKind==='ZONE'?'OBSERVING':'ARMED',
   sourceAt,armedAt:now,expiresAt:now+180000,
   trigger,invalidation,atr,priceAt:price,lastPrice:price,lastAt:now,triggeredAt:null,
   crossedAt:null,crossedQuoteAt:null,retestAt:null,score:evidenceScore,setupKind,
   trendSide:input.m15Side??'WAIT',flowAligned:flowSide===side,localStructureAligned,
   contextNote:contextFresh?ctx!.reason:undefined,
   selectionMargin,selectionAgreement,selectionConflict,
   targets:targets.slice(0,3),reason};
}
export function earlySetupOpportunity(state:EarlySetup|null):LiveOpportunity{
 const active=state?.phase==='ARMED'||state?.phase==='TRIGGERED';
 const opposed=state?.trendSide!=null&&state.trendSide!=='WAIT'&&state.trendSide!==state.side;
 const context:LiveOpportunity['m15Context']=opposed?'OPPOSED':
   state?.trendSide===state?.side&&state!=null?'ALIGNED':'NEUTRAL';
 const direction=state?.side==='BUY'?1:-1;
 const risk=state?direction*(state.priceAt-state.invalidation):0;
 const reward=state?.targets.length?direction*(state.targets[0]-state.priceAt):0;
 const qualified=state?.phase==='TRIGGERED'&&!opposed&&
   (context==='ALIGNED'||state.flowAligned===true||state.localStructureAligned===true)&&
   (state.score??0)>=4&&state.selectionConflict!==true&&
   risk>0&&risk<=state.atr*3&&
   reward>=risk&&reward<=state.atr*4;
 return {phase:state?.phase==='OBSERVING'?'WATCH':
   state?.phase==='ARMED'?(state.crossedAt!=null?'TESTING':'PREPARE'):
   state?.phase==='TRIGGERED'?'BREAK_CONFIRMED':
   state?'CANCELLED':'WATCH',side:active?state!.side:'WAIT',
   trigger:state?.trigger??null,invalidation:state?.invalidation??null,
   targets:active?state!.targets:[],sourceAt:state?.triggeredAt??state?.sourceAt??null,
   strength:state?.score==null?0:state.score*10,higherFrame:'NEUTRAL',m15Context:context,
   setupKind:state?.setupKind,
   quality:qualified?'SETUP':opposed?'COUNTERTREND':'OBSERVATION',
   reason:state?.reason??'انتظار إعداد قبل الحركة؛ الزخم وحده لا يصدر شراء أو بيع',
   targetNote:'مستويات مراقبة ثابتة، وليست ضمان وصول',tradeEligible:false};
}
