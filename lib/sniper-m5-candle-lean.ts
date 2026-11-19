/**
 * M5 candle-open / candle-end directional WATCH. Only earlier CLOSED M1
 * evidence can form a hypothesis. A signal is sampled at first browser
 * observation, stored immutably, and scored against the real M5 close later.
 * NOT an entry, broker order, win probability, or future OHLC.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
import type {FlowProfileDecision} from './flow-profile-decision';
type Side='BUY'|'SELL'|'WAIT';
export type M5CandleLean={
 phase:'OPEN'|'FOLLOW'|'CLOSE'|'WAIT';side:Side;issuedFor:number|null;
 observedAfterMs:number;strength:number;reason:string;tradeEligible:false;
};
const good=(c:Bar)=>c&&[c.time,c.open,c.high,c.low,c.close]
 .every(Number.isFinite)&&c.time>0&&c.time%60000===0&&c.low>0&&
 c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
const none=(reason:string):M5CandleLean=>({
 phase:'WAIT',side:'WAIT',issuedFor:null,observedAfterMs:0,strength:0,
 reason,tradeEligible:false
});
/** Honest M5 fallback when 18 contiguous M1 closes are missing.
 * This is a lagging closed-M5 trend observation, NEVER a prebreak trade.
 * It does not borrow a future/current forming candle or cached old prices. */
export function observeClosedM5Trend(input:{now:number;price:number|null;
 sourceReady:boolean;m5:unknown}):{side:Side;ready:boolean;reason:string}{
 const missing=(reason:string)=>({side:'WAIT' as const,ready:false,reason});
 if(!input.sourceReady||!Number.isFinite(input.now)||
   input.price==null||!Number.isFinite(input.price)||input.price<=0)
   return missing('السعر الحالي أو مصدر M5 غير حديث');
 const keyed=new Map<number,Bar>();
 for(const b of Array.isArray(input.m5)?input.m5:[])
   if(good(b)&&b.time%300000===0&&b.time+300000<=input.now)
     keyed.set(b.time,b);
 const tail=[...keyed.values()].sort((a,b)=>a.time-b.time).slice(-5);
 if(tail.length<5||
   tail.some((b,i)=>i>0&&b.time-tail[i-1].time!==300000)||
   input.now-(tail[4].time+300000)>300000)
   return missing('إغلاقات M5 الأخيرة متأخرة أو ناقصة؛ لا ننسب لها اتجاهًا حيًا');
 const tr=tail.slice(1).map((b,i)=>Math.max(
   b.high-b.low,Math.abs(b.high-tail[i].close),
   Math.abs(b.low-tail[i].close)));
 const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
 if(!(atr>0)||atr>input.price*.04)return missing('تذبذب M5 غير صالح');
 const delta=tail[4].close-tail[1].close;
 const recent=tail.slice(-3);
 const upBodies=recent.filter(b=>b.close>b.open+atr*.12).length;
 const downBodies=recent.filter(b=>b.open>b.close+atr*.12).length;
 const buy=delta>=atr*.55&&upBodies>=2;
 const sell=delta<=-atr*.55&&downBodies>=2;
 return {ready:true,side:buy&&!sell?'BUY':sell&&!buy?'SELL':'WAIT',
   reason:buy&&!sell?'متابعة صعود من إغلاقات M5؛ ليست ترقب شراء مبكر':
     sell&&!buy?'متابعة هبوط من إغلاقات M5؛ ليست ترقب بيع مبكر':
     'إغلاقات M5 حديثة لكن بلا اتجاه كافٍ لتأكيد المتابعة'};
}
export function assessM5CandleLean(input:{
 now:number;price:number|null;sourceReady:boolean;
 m1:unknown;m5?:unknown;flow?:FlowProfileDecision|null;
 m1Side?:Side;m15Side?:Side;
}):M5CandleLean{
 const {now,price}=input;
 if(!input.sourceReady||!Number.isFinite(now)||!Number.isFinite(price)||
   price==null||price<=0)return none('السعر أو مصدر الشموع غير حديث');
 const start=Math.floor(now/300000)*300000;
 const elapsed=now-start;
 // Signal on the opening M1, or in the final minute ahead of M5 close.
 // Do not backfill old signals after the window has passed.
 const phase:'OPEN'|'FOLLOW'|'CLOSE'|'WAIT'=elapsed<60000?'OPEN':
   elapsed>=240000&&elapsed<300000?'CLOSE':'FOLLOW';
 // Consume each newly closed minute immediately, including minute one.
 const cut=Math.floor(now/60000)*60000;
 const unique=new Map<number,Bar>();
 for(const b of Array.isArray(input.m1)?input.m1:[])
  if(good(b)&&b.time+60000<=cut)unique.set(b.time,b);
 const rows=[...unique.values()].sort((a,b)=>a.time-b.time).slice(-18);
 const latestClose=rows.at(-1)?rows.at(-1)!.time+60000:0;
 // Allow one delayed publication, but never bridge an internal gap or use stale evidence.
 if(rows.length<18||cut-latestClose<0||cut-latestClose>60000||now-latestClose>120000||
   rows.some((b,i)=>i>0&&b.time-rows[i-1].time!==60000))
   return none('إغلاقات M1 الأخيرة ناقصة؛ لا نختلق اتجاهًا');
 const tr=rows.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-rows[i].close),Math.abs(b.low-rows[i].close)));
 const atr=tr.slice(-14).reduce((a,b)=>a+b,0)/14;
 if(!Number.isFinite(atr)||atr<=0||atr>price*.04)
   return none('مدى M1 غير صالح');
 const last=rows.at(-1)!;
 const momentum=(last.close-rows.at(-5)!.close)/(4*atr);
 const body=(last.close-last.open)/atr;
 const range=Math.max(last.high-last.low,atr*.15);
 const closeLocation=(2*last.close-last.high-last.low)/range;
 // M5 is optional confirmation, not a veto: at a sharp reversal its older
 // direction may lag the genuine last M1 closes.
 const m5Rows=(Array.isArray(input.m5)?input.m5:[])
  .filter((b:Bar)=>good(b)&&b.time%300000===0&&b.time+300000<=cut)
  .sort((a:Bar,b:Bar)=>a.time-b.time);
 const lastM5=m5Rows.at(-1),prevM5=m5Rows.at(-2);
 const m5Valid=lastM5&&prevM5&&lastM5.time+300000===start&&
   lastM5.time-prevM5.time===300000;
 const m5Slope=m5Valid?clamp((lastM5!.close-prevM5!.close)/
   Math.max(atr*3,.01)):0;
 // Independent, causal pre-move setup: sweep of a PREVIOUS liquidity
 // extreme followed by rejection back inside the old range. The sweep
 // candle must be fully closed; no live/current M5 high/low is consulted.
 const before=rows.slice(-10,-1);
 const priorHigh=Math.max(...before.map(b=>b.high));
 const priorLow=Math.min(...before.map(b=>b.low));
 const sweepUp=last.high>priorHigh+atr*.08&&
   last.close<priorHigh&&last.close<=last.low+(last.high-last.low)*.45&&
   last.high-Math.max(last.open,last.close)>=atr*.3;
 const sweepDown=last.low<priorLow-atr*.08&&
   last.close>priorLow&&last.close>=last.high-(last.high-last.low)*.45&&
   Math.min(last.open,last.close)-last.low>=atr*.3;
 // This is a reversal HYPOTHESIS, not proof of order flow or liquidity.
 const reversalSide:Side=sweepDown&&!sweepUp?'BUY':
   sweepUp&&!sweepDown?'SELL':'WAIT';
 const pressure=.58*clamp(momentum)+.24*clamp(body)+
   .12*clamp(closeLocation)+.06*m5Slope;
 // Momentum alone is not evidence of a pre-move opportunity. Keep
 // continuation as a distinct, explicitly labelled observer.
 const momentumSide:Side=pressure>=.12?'BUY':pressure<=-.12?'SELL':'WAIT';
 // Use only genuinely timestamped, same-source flow available BEFORE
 // the observation. Missing MT5 DOM is never treated as agreement.
 const f=input.flow;
 const flowValid=Boolean(f?.ready&&f.side!=='WAIT'&&f.asOf!=null&&
   f.observedAt!=null&&f.asOf<=now&&f.observedAt<=now&&
   now-f.asOf<=15000&&now-f.observedAt<=15000);
 const flowSide:Side=flowValid?f!.side:'WAIT';
 // A swept wick is an OBSERVATION, not enough to sell into a rising M1+M15.
 // A current quote beyond the swept wick invalidates the old reversal thesis.
 // M1 and M15 here are independently computed from COMPLETED candles.
 const m1Frame=input.m1Side==='BUY'||input.m1Side==='SELL'?input.m1Side:'WAIT';
 const m15Frame=input.m15Side==='BUY'||input.m15Side==='SELL'?input.m15Side:'WAIT';
 const alignedTrend=m1Frame===m15Frame?m1Frame:'WAIT';
 const contraryTrend=reversalSide!=='WAIT'&&alignedTrend!=='WAIT'&&
   reversalSide!==alignedTrend&&flowSide!==reversalSide;
 const reclaimedAgainstReversal=reversalSide==='SELL'?
   price>=last.high-atr*.02:
   reversalSide==='BUY'?price<=last.low+atr*.02:false;
 const reversalLive=reversalSide!=='WAIT'&&!contraryTrend&&!reclaimedAgainstReversal;
 const candidate:Side=reversalLive?reversalSide:momentumSide;
 // A closed-bar continuation is no longer a current direction once the
 // live quote breaks that bar's opposite edge. Invalidate, do not fabricate
 // a reverse signal from the unfinished candle.
 const continuationFailed=!reversalLive&&
   (candidate==='BUY'?price<last.low-atr*.08:
    candidate==='SELL'?price>last.high+atr*.08:false);
 // If the swept wick has already failed, stale closed-candle momentum
 // CANNOT independently recreate the same bearish/bullish reversal claim.
 const staleOpposite=reversalSide!=='WAIT'&&
   reclaimedAgainstReversal&&candidate===reversalSide;
 const crossFrameOpposite=contraryTrend&&candidate!==alignedTrend;
 // A conflicting verified flow observation is a veto, not a reversed
 // order. Missing flow remains explicitly unconfirmed price action.
 // A live quote already extended outside the closed range cannot establish
 // a fresh pre-open entry from the same closed momentum.
 const extended=phase==='CLOSE'&&!reversalLive&&
   (candidate==='BUY'?price>Math.max(last.high,priorHigh)+atr*.5:
    candidate==='SELL'?price<Math.min(last.low,priorLow)-atr*.5:false);
 const side:Side=extended||continuationFailed||staleOpposite||crossFrameOpposite||
   (flowSide!=='WAIT'&&candidate!==flowSide)?'WAIT':candidate;
 if(side==='WAIT')return none(extended?'الحركة تجاوزت النطاق قبل الافتتاح؛ ننتظر إعدادًا جديدًا':continuationFailed?
   'السعر كسر نطاق آخر شمعة عكس القراءة؛ متابعة الاتجاه السابق ملغاة':staleOpposite?
   'السعر تجاوز ذيل سحب السيولة؛ الانعكاس القديم لم يعد صالحًا':
   crossFrameOpposite?
   'رفض قمة/قاع M1 غير مؤكد مع توافق M1 وM15 في الاتجاه المقابل':
   flowSide!=='WAIT'&&candidate!==flowSide?
   'تعارض قراءة السيولة السعرية مع تدفق المصدر نفسه؛ لا إشارة':
   'لا يوجد ترجيح اتجاه من بيانات مغلقة');
 const kind=reversalLive?'انعكاس محتمل بعد سحب قمة/قاع سابق':
   'استمرار محتمل من زخم مغلق (ليس توقع انعكاس)';
 return {phase,side,issuedFor:cut,observedAfterMs:Math.max(0,now-cut),
   strength:Math.min(90,Math.round(Math.abs(pressure)*100)),
   reason:(phase==='OPEN'?'قراءة بداية M5':phase==='FOLLOW'?'قراءة أثناء M5':'قراءة نهاية M5')+
    ' · '+kind+(m5Valid?' · سياق M5':'')+
    (flowSide!=='WAIT'?' · تدفق المصدر متوافق':
     ' · Order Flow الحقيقي غير مؤكد؛ قراءة حركة سعر فقط')+
    (cut>latestClose?' · وصول M1 متأخر دقيقة':'')+
    ' · توقع غير مؤكد، لا يمثل أمر تداول أو تدفق أوامر حقيقي',
   tradeEligible:false};
}
