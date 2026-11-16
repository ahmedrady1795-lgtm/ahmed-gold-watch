// EXPERIMENTAL: offline evaluation only; not wired into live signals.
/**
 * M5 candle-open / candle-end directional WATCH. Only earlier CLOSED M1
 * evidence can form a hypothesis. A signal is sampled at first browser
 * observation, stored immutably, and scored against the real M5 close later.
 * NOT an entry, broker order, win probability, or future OHLC.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Side='BUY'|'SELL'|'WAIT';
export type M5LevelSetup={
 phase:'OPEN'|'FOLLOW'|'CLOSE'|'WAIT';side:Side;issuedFor:number|null;
 observedAfterMs:number;strength:number;reason:string;tradeEligible:false;
 modelVersion?:'LEVELS_V2';setup?:'REJECTION'|'PULLBACK';
 entryLow?:number;entryHigh?:number;target?:number;invalidation?:number;
};
const good=(c:Bar)=>c&&[c.time,c.open,c.high,c.low,c.close]
 .every(Number.isFinite)&&c.time>0&&c.time%60000===0&&c.low>0&&
 c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
const none=(reason:string):M5LevelSetup=>({
 phase:'WAIT',side:'WAIT',issuedFor:null,observedAfterMs:0,strength:0,
 reason,tradeEligible:false
});
export function assessM5LevelSetup(input:{
 now:number;price:number|null;sourceReady:boolean;
 m1:unknown;m5?:unknown;
}):M5LevelSetup{
 const {now,price}=input;
 if(!input.sourceReady||!Number.isFinite(now)||!Number.isFinite(price)||
   price==null||price<=0)return none('السعر أو مصدر الشموع غير حديث');
 const start=Math.floor(now/300000)*300000;
 const elapsed=now-start;
 // Signal on the opening M1, or in the final minute ahead of M5 close.
 // Do not backfill old signals after the window has passed.
 const phase:'OPEN'|'FOLLOW'|'CLOSE'|'WAIT'=elapsed<90000?'OPEN':
   elapsed>=240000&&elapsed<300000?'CLOSE':'FOLLOW';
 const cut=phase==='OPEN'?start:phase==='CLOSE'?start+240000:
   Math.floor(now/60000)*60000;
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
 const pressure=.58*clamp(momentum)+.24*clamp(body)+
   .12*clamp(closeLocation)+.06*m5Slope;
 // Directional momentum alone is not an opportunity. Locate a level that
 // existed BEFORE the last three evidence candles, then require a local reaction.
 const base=rows.slice(0,-3),reaction=rows.slice(-3);
 const lows:number[]=[Math.min(...base.map(b=>b.low))];
 const highs:number[]=[Math.max(...base.map(b=>b.high))];
 for(let i=1;i<base.length-1;i++){
   if(base[i].low<=base[i-1].low&&base[i].low<=base[i+1].low)lows.push(base[i].low);
   if(base[i].high>=base[i-1].high&&base[i].high>=base[i+1].high)highs.push(base[i].high);
 }
 // Older M5 pivots add context, without including the reaction itself.
 const context=m5Rows.filter((b:Bar)=>b.time+300000<=reaction[0].time).slice(-12);
 for(let i=1;i<context.length-1;i++){
   if(context[i].low<=context[i-1].low&&context[i].low<=context[i+1].low)lows.push(context[i].low);
   if(context[i].high>=context[i-1].high&&context[i].high>=context[i+1].high)highs.push(context[i].high);
 }
 const low=Math.min(...reaction.map(b=>b.low)),high=Math.max(...reaction.map(b=>b.high));
 const lowerWick=Math.min(last.open,last.close)-last.low;
 const upperWick=last.high-Math.max(last.open,last.close);
 type Candidate={side:'BUY'|'SELL';level:number;stop:number;target:number;setup:'REJECTION'|'PULLBACK'};
 const candidates:Candidate[]=[];
 for(const side of ['BUY','SELL'] as const){
   const buy=side==='BUY';
   const levels=(buy?lows:highs).filter(level=>
     Math.abs((buy?low:high)-level)<=atr*.45&&
     (buy?last.close>=level: last.close<=level)&&
     Math.abs(price-level)<=atr*.85);
   for(const level of levels){
     const rejection=buy?lowerWick>=atr*.22&&closeLocation>.15:
       upperWick>=atr*.22&&closeLocation<-.15;
     const pullback=buy?m5Slope>.1&&reaction[2].low>reaction[1].low&&
       reaction[1].low<=reaction[0].low&&body>.08:
       m5Slope<-.1&&reaction[2].high<reaction[1].high&&
       reaction[1].high>=reaction[0].high&&body<-.08;
     if(!rejection&&!pullback)continue;
     // A large displacement has already spent the proposed early move.
     if(Math.abs(price-last.close)>atr*.45||Math.abs(body)>1.1)continue;
     const stop=buy?Math.min(low,level)-atr*.15:Math.max(high,level)+atr*.15;
     const risk=buy?price-stop:stop-price;
     const targets=(buy?highs:lows).filter(v=>buy?v>price+atr*.65:v<price-atr*.65)
       .sort((a,b)=>buy?a-b:b-a);
     const target=targets[0],reward=buy?target-price:price-target;
     if(!Number.isFinite(target)||risk<=0||reward<risk||risk>atr*1.5)continue;
     candidates.push({side,level,stop,target,setup:rejection?'REJECTION':'PULLBACK'});
   }
 }
 if(!candidates.length)return none('لا فرصة قرب مستوى معروف: الزخم وحده لا يكفي، أو الحركة ابتعدت عن الدخول');
 if(candidates.some(c=>c.side!==candidates[0].side))
   return none('رد فعل متعارض بين الطلب والعرض؛ لا أفضلية واضحة');
 const best=candidates.sort((a,b)=>Math.abs(price-a.level)-Math.abs(price-b.level))[0];
 const side=best.side;
 return {phase,side,issuedFor:cut,observedAfterMs:Math.max(0,now-cut),
   strength:Math.min(90,Math.round(45+Math.abs(pressure)*20)),
   modelVersion:'LEVELS_V2',setup:best.setup,
   entryLow:best.level-atr*(side==='BUY'?.25:.85),
   entryHigh:best.level+atr*(side==='BUY'?.85:.25),
   target:best.target,invalidation:best.stop,
   reason:(best.setup==='REJECTION'?'رفض سعري عند ':'إعادة اختبار عند ')+
     (side==='BUY'?'دعم سابق':'مقاومة سابقة')+
     ' · هدف عند مستوى مرصود وإبطال ثابت · ليست نسبة نجاح مثبتة',
   tradeEligible:false};
}
