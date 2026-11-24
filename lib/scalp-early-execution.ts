import type {Candle} from './engine';
import type {ScalpQuote} from './scalp-opportunities';
import type {LiquidityIntelligence} from './liquidity-intelligence';
import {observedForwardReach} from './scalp-selection';

type Direction='BUY'|'SELL'|'WAIT';
export type EarlyExecutionLead={
 status:'STALE'|'WAIT'|'EARLY_WATCH'|'COST_BLOCKED'|'VENUE_CONFLICT'|'LATE'|'ENTRY_CANDIDATE';
 side:Direction;setup:'SWEEP_RECLAIM'|'ABSORPTION'|'NONE';
 researchOnly:true;brokerExecutionVerified:false;
 issuedFromClosedM1At:number|null;checkedAt:number;
 score:number;entryType:'BUY_LIMIT'|'SELL_LIMIT'|null;
 entry:number|null;stop:number|null;target:number|null;
 estimatedRoundTripCost:number|null;netR:number|null;reachCap:number|null;
 quoteSource:string;flowSource:string;
 evidence:string[];blockers:string[];reason:string;
};

/** Independent BTC early-pressure research lane. Detection uses only closed
 * M1 candles and verified taker flow/book, never an ongoing OHLC future bar.
 * A passive BUY_LIMIT rests at/below bid; a SELL_LIMIT at/above ask. No orders
 * are sent; no public spot quote is treated as Exness broker execution.
 */
export function detectEarlyExecutionLead(input:{
 asset:'BTC'|'GOLD';c1:readonly Candle[];quote:ScalpQuote;
 liquidity:LiquidityIntelligence|null;now:number;estimatedRoundTripCost:number|null
}):EarlyExecutionLead{
 const {asset,quote,liquidity:l,now}=input;
 const source=String(quote.source||'unavailable');
 const base:EarlyExecutionLead={status:'WAIT',side:'WAIT',setup:'NONE',
   researchOnly:true,brokerExecutionVerified:false,issuedFromClosedM1At:null,
   checkedAt:now,score:0,entryType:null,entry:null,stop:null,target:null,
   estimatedRoundTripCost:null,netR:null,reachCap:null,
   quoteSource:source,flowSource:l?.source||'none',evidence:[],blockers:[],
   reason:'لا توجد سيولة تنفيذية مرصودة تكفي لفرصة مبكرة'};
 const done=(status:EarlyExecutionLead['status'],reason:string,extra:Partial<EarlyExecutionLead>={}):EarlyExecutionLead=>({
   ...base,...extra,status,reason});
 if(asset!=='BTC')return done('WAIT','بيانات ذهب MT5 الحقيقية للأوردر فلو غير متاحة لهذا المسار؛ لا نستخدم سيولة BTC بديلًا');
 const price=quote.price,bid=quote.bid,ask=quote.ask;
 if(!Number.isFinite(now)||!Number.isFinite(quote.at)||quote.at==null||
   now-quote.at<0||now-quote.at>3000||price==null||!Number.isFinite(price)||price<=0)
   return done('STALE','سعر BTC غير صالح أو متأخر');
 // A crossed or malformed provided book is an integrity failure. A missing
 // BBO or a last trade outside the current spread only blocks execution,
 // not the independent closed-bar/verified absorption observation.
 if(bid!=null&&ask!=null&&(![bid,ask].every(Number.isFinite)||bid<=0||ask<=bid))
   return done('STALE','دفتر Bid/Ask غير صالح');
 const executionBbo=bid!=null&&ask!=null&&Number.isFinite(bid)&&Number.isFinite(ask)&&
   bid>0&&ask>bid&&price>=bid-(ask-bid)*2&&price<=ask+(ask-bid)*2;
 const closed=input.c1.filter(x=>Number.isSafeInteger(x.time)&&x.time%60000===0&&
   x.time+60000<=now&&[x.open,x.high,x.low,x.close].every(Number.isFinite)&&
   x.low>0&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close))
   .sort((a,b)=>a.time-b.time);
 const last=closed.at(-1);
 if(!last||closed.length<60||now-last.time-60000>90000||
   closed.slice(-60).some((b,i,a)=>i>0&&b.time-a[i-1].time!==60000))
   return done('STALE','سجل شموع BTC M1 المغلقة غير متصل أو قديم');
 const reference=closed.slice(-13,-1);
 const recent=closed.slice(-22);
 const trs=recent.map((c,i)=>i===0?c.high-c.low:Math.max(
   c.high-c.low,Math.abs(c.high-recent[i-1].close),
   Math.abs(c.low-recent[i-1].close)));
 const atr=trs.slice(-20).reduce((a,b)=>a+b,0)/20;
 if(!Number.isFinite(atr)||atr<=0)return done('STALE','مدى الشموع غير صالح');
 const frozenAt=last.time+60000;
 const levels={low:Math.min(...reference.map(c=>c.low)),
   high:Math.max(...reference.map(c=>c.high))};
 const sweepMargin=Math.max(atr*.028,price*.000002);
 const sweepBuy=last.low<levels.low-sweepMargin&&last.close>levels.low+sweepMargin;
 const sweepSell=last.high>levels.high+sweepMargin&&last.close<levels.high-sweepMargin;
 // No ambiguous double sweep can become a directional prediction.
 if(sweepBuy&&sweepSell)return done('WAIT','سحب سيولة في الاتجاهين؛ لا ترجيح');
 if(!l||!l.ok||now-l.checkedAt<0||now-l.checkedAt>6000||
   l.quality<65||l.integrity.status==='VENUE_CONFLICT'||
   l.integrity.status==='POSSIBLE_DEPTH_WITHDRAWAL'||
   l.integrity.status==='UNVERIFIED'){
   return done(l?.integrity.status==='VENUE_CONFLICT'?'VENUE_CONFLICT':'STALE',
     'السيولة عبر المنصات غير متفقة أو لم تصل بيانات أوامر وتنفيذ حديثة',
     {issuedFromClosedM1At:frozenAt});
 }
 // Coinbase maker side is already inverted into true taker direction.
 // OKX reports true taker side directly: when Coinbase prints go missing,
 // allow OKX *research* fallback ONLY alongside independently healthy
 // Kraken BTC-USD depth. OKX alone must not self-confirm its own trades.
 const flowVenue=l.flow.venue??(l.providers.coinbaseTrades?'COINBASE':'NONE');
 const coinbasePath=flowVenue==='COINBASE'&&l.providers.coinbaseTrades&&
    (l.providers.krakenDepth||l.providers.okxDepth);
 const okxPath=flowVenue==='OKX'&&l.providers.okxTrades&&l.providers.krakenDepth;
 if(!(coinbasePath||okxPath)||l.flow.tradeCount<12)
   return done('WAIT',flowVenue==='OKX'?
      'صفقات OKX تحتاج عمق Kraken حديثًا مستقلًا لتأكيد الامتصاص':
      'لا توجد صفقات هجومية موثقة مع عمق مستقل');
 // Quotes and book can come from different venues; reject unusual divergence
 // rather than using Coinbase BBO as an Exness or Kraken execution quote.
 const bookMid=l.book.bestBid!=null&&l.book.bestAsk!=null?
   (l.book.bestBid+l.book.bestAsk)/2:null;
 if(bookMid!=null&&Math.abs(price-bookMid)/bookMid>0.003)
   return done('VENUE_CONFLICT','سعر BTC يختلف عن دفتر المنصة المستقلة أكثر من 30 نقطة أساس',
     {issuedFromClosedM1At:frozenAt});
 const absorption=l.absorption;
 const flowSide=absorption.side;
 const delta=l.flow.deltaPct;
 const depth=l.book.depthImbalance;
 const plausibleBuy=flowSide==='BUY'&&absorption.score>=56&&delta<=-24&&
   (depth>=-20||l.dynamics.bidDepthChangePct-l.dynamics.askDepthChangePct>=6);
 const plausibleSell=flowSide==='SELL'&&absorption.score>=56&&delta>=24&&
   (depth<=20||l.dynamics.askDepthChangePct-l.dynamics.bidDepthChangePct>=6);
 const atLowerZone=price<=levels.low+atr*.38&&price>=levels.low-atr*.60;
 const atUpperZone=price>=levels.high-atr*.38&&price<=levels.high+atr*.60;
 const buy=(sweepBuy&&plausibleBuy)||(!sweepSell&&plausibleBuy&&atLowerZone);
 const sell=(sweepSell&&plausibleSell)||(!sweepBuy&&plausibleSell&&atUpperZone);
 if(buy===sell)return done('WAIT',buy?'سيولة متعارضة في اتجاهي السعر':'لم يظهر امتصاص تنفيذي قرب حد السيولة');
 const side:Direction=buy?'BUY':'SELL';
 const dir=buy?1:-1;
 const setup:EarlyExecutionLead['setup']=buy&&sweepBuy||sell&&sweepSell?
  'SWEEP_RECLAIM':'ABSORPTION';
 const blockers:string[]=[];
 if(l.integrity.blockedSides.includes(side))blockers.push('سلامة دفتر الأوامر تمنع هذا الجانب');
 if(side==='BUY'&&l.side==='SELL'&&l.strength>=61||
   side==='SELL'&&l.side==='BUY'&&l.strength>=61)
   blockers.push('الضغط التنفيذي الكلي يعارض الامتصاص');
 const recentExtreme=side==='BUY'?last.low:last.high;
 const extended=side==='BUY'?price-last.close:last.close-price;
 if(extended>atr*.50||Math.abs(price-last.close)>atr*.90)
   return done('LATE','السعر تحرك بالفعل بعيدًا عن لحظة الامتصاص؛ ممنوع مطاردة الشمعة',
     {side,setup,issuedFromClosedM1At:frozenAt,
      evidence:['امتصاص حقيقي مرصود لكن السعر ابتعد أكثر من حد الدخول المبكر']});
 if(!executionBbo||bid==null||ask==null){
   // Retain a direction only when the independent flow/closed candle agrees
   // and integrity has not vetoed the side. Never derive a LIMIT or TP.
   if(blockers.length)return done('WAIT',blockers[0],{issuedFromClosedM1At:frozenAt});
   const estimate=input.estimatedRoundTripCost;
   return done('EARLY_WATCH','امتصاص سيولة مبكر؛ سعر التنفيذ غير متاح أو خارج السبريد، مراقبة فقط',{
     side,setup,issuedFromClosedM1At:frozenAt,
     score:Math.round(Math.min(89,35+absorption.score*.38+(setup==='SWEEP_RECLAIM'?14:0)+
       Math.max(0,side==='BUY'?depth:-depth)*.10)),
     estimatedRoundTripCost:typeof estimate==='number'&&Number.isFinite(estimate)&&estimate>0?estimate:null,
     evidence:['امتصاص تنفيذ مرصود مع إغلاق M1 ودفتر مستقل؛ لا يوجد سعر LIMIT مؤهل'],
     blockers:['Bid/Ask غير مؤهل؛ لا دخول أو هدف صفقة']
   });
 }
 const hold=side==='BUY'?Math.min(bid,price):Math.max(ask,price);
 const entry=Number((hold-dir*Math.max(.01,atr*.025)).toFixed(2));
 const minStop=side==='BUY'?Math.min(recentExtreme,levels.low):Math.max(recentExtreme,levels.high);
 const stop=Number((minStop-dir*Math.max(atr*.09,.01)).toFixed(2));
 const risk=dir*(entry-stop);
 const reach=observedForwardReach(closed,side as 'BUY'|'SELL',1,240);
 const reachCap=reach.samples>=30&&reach.favorableP55!=null?
   Math.min(atr*1.7,reach.favorableP55):null;
 const estimatedCost=input.estimatedRoundTripCost;
 const cost=typeof estimatedCost==='number'&&Number.isFinite(estimatedCost)&&
   estimatedCost>0?estimatedCost:null;
 const score=Math.round(Math.min(89,
   35+absorption.score*.38+(setup==='SWEEP_RECLAIM'?14:0)+
   Math.max(0,side==='BUY'?depth:-depth)*.10));
 const evidence=[
   'تنفيذ هجومي '+(flowVenue==='OKX'?'OKX BTC-USDT':'Coinbase BTC-USD')+
      ' ('+(side==='BUY'?'بيع امتصه مشترون':'شراء امتصه بائعون')+')',
   setup==='SWEEP_RECLAIM'?'سحب مستوى قديم ثم استرداد بإغلاق M1':'امتصاص قريب من سيولة سابقة',
   'دفتر أوامر مستقل حديث · '+l.integrity.status,
   'سعر LIMIT ورقي قريب من Bid/Ask · ليس تنفيذ Exness'
 ];
 const baseLead={side,setup,issuedFromClosedM1At:frozenAt,score,
   entryType:(side==='BUY'?'BUY_LIMIT':'SELL_LIMIT') as EarlyExecutionLead['entryType'],
   entry,stop,reachCap,estimatedRoundTripCost:cost,evidence,blockers};
 if(risk<=0||risk>atr*1.55)
   blockers.push('وقف هيكلي بعيد عن سعر LIMIT المناسب لفريم دقيقة');
 if(reachCap==null)blockers.push('لا توجد 30 نافذة M1 مغلقة مستقلة لتقدير حركة الهدف');
 if(cost==null)blockers.push('تكلفة التنفيذ غير متاحة');
 else if(reachCap!=null&&cost>reachCap*.35)
   blockers.push('السبريد والرسوم والانزلاق يستهلكون الحركة الممكنة');
 const needed=cost==null?null:risk*1.25+cost*2.25;
 const targetDist=reachCap!=null&&needed!=null&&needed<=reachCap?
   Math.min(reachCap,Math.max(needed,atr*.6)):null;
 const target=targetDist!=null?Number((entry+dir*targetDist).toFixed(2)):null;
 const netR=cost!=null&&target!=null&&risk>0?
   Number(((dir*(target-entry)-cost)/(risk+cost)).toFixed(2)):null;
 if(target==null||netR==null||netR<1.25)blockers.push('لا يوجد هدف M1 قابل للتحقق يغطي وقفًا حقيقيًا وتكلفة تقديرية ويحقق 1.25R صافي');
 const common={...baseLead,target,netR};
 if(blockers.length)return done('COST_BLOCKED',blockers[0],{...common,blockers});
 return done('ENTRY_CANDIDATE','فرصة بحثية مبكرة مشروطة بلمس LIMIT وبتحقق سعر وسيط Exness',common);
}
