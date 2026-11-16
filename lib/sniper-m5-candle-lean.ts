/**
 * M5 candle-open / candle-end directional WATCH. Only earlier CLOSED M1
 * evidence can form a hypothesis. A signal is sampled at first browser
 * observation, stored immutably, and scored against the real M5 close later.
 * NOT an entry, broker order, win probability, or future OHLC.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
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
export function assessM5CandleLean(input:{
 now:number;price:number|null;sourceReady:boolean;
 m1:unknown;m5?:unknown;
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
 const m5Valid=lastM5&&prevM5&&lastM5.time+300000===cut&&
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
 const side:Side=reversalSide!=='WAIT'?reversalSide:
   pressure>=.12?'BUY':pressure<=-.12?'SELL':'WAIT';
 if(side==='WAIT')return none('لا يوجد ترجيح اتجاه من بيانات مغلقة');
 const kind=reversalSide!=='WAIT'?'انعكاس محتمل بعد سحب قمة/قاع سابق':
   'استمرار محتمل من زخم مغلق (ليس توقع انعكاس)';
 return {phase,side,issuedFor:cut,observedAfterMs:Math.max(0,now-cut),
   strength:Math.min(90,Math.round(Math.abs(pressure)*100)),
   reason:(phase==='OPEN'?'قراءة بداية M5':phase==='FOLLOW'?'قراءة أثناء M5':'قراءة نهاية M5')+
    ' · '+kind+(m5Valid?' · سياق M5':'')+
    (cut>latestClose?' · وصول M1 متأخر دقيقة':'')+
    ' · توقع غير مؤكد، لا يمثل أمر تداول أو تدفق أوامر حقيقي',
   tradeEligible:false};
}
