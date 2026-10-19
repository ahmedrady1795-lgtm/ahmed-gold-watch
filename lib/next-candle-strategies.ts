/**
 * TradingView-inspired PUBLIC indicator concepts, independently implemented.
 * NOT TradingView API, Pine Script import, scraped strategies or neural AI.
 * Six frozen candle-close methods, selected on earlier train observations,
 * scored on later disjoint next-bar outcomes. No intrabar or future leakage.
 */
export type Candle={time:number;open:number;high:number;low:number;close:number};
export type Direction='BUY'|'SELL'|'WAIT';
type Strategy='EMA_8_21'|'MACD_12_26_9'|'RSI_REVERSION'|'DONCHIAN_BREAK'|'SWEEP_RECLAIM'|'MOMENTUM_3';
const STRATEGIES:Strategy[]=['EMA_8_21','MACD_12_26_9','RSI_REVERSION','DONCHIAN_BREAK','SWEEP_RECLAIM','MOMENTUM_3'];
const sign=(n:number):Direction=>n>0?'BUY':n<0?'SELL':'WAIT';
const median=(values:number[])=>{
 const x=values.filter(Number.isFinite).sort((a,b)=>a-b);
 return x.length?x[Math.floor(x.length/2)]:0;
};
function ema(values:number[],period:number){
 if(!values.length)return 0;
 const k=2/(period+1);let v=values[0];
 for(let i=1;i<values.length;i++)v=values[i]*k+v*(1-k);
 return v;
}
function emaLine(values:number[],period:number){
 if(!values.length)return [];
 const k=2/(period+1),out=[values[0]];
 for(let i=1;i<values.length;i++)out.push(values[i]*k+out.at(-1)!*(1-k));
 return out;
}
function indicator(rows:Candle[],kind:Strategy):Direction{
 if(rows.length<40)return 'WAIT';
 const last=rows.at(-1)!,prev=rows.at(-2)!;
 const tr=rows.slice(-21).map((b,i,a)=>i?Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
   Math.abs(b.low-a[i-1].close)):b.high-b.low);
 const atr=median(tr);if(atr<=0)return 'WAIT';
 const closes=rows.map(b=>b.close);
 if(kind==='EMA_8_21'){
   const difference=ema(closes,8)-ema(closes,21);
   const prior=ema(closes.slice(0,-1),8)-ema(closes.slice(0,-1),21);
   return Math.abs(difference)<atr*.12?'WAIT':
     difference>0&&difference>=prior?'BUY':difference<0&&difference<=prior?'SELL':'WAIT';
 }
 if(kind==='MACD_12_26_9'){
   const fast=emaLine(closes,12),slow=emaLine(closes,26);
   const macd=fast.map((v,i)=>v-slow[i]);
   const hist=macd.at(-1)!-ema(macd,9);
   return Math.abs(hist)<atr*.05?'WAIT':sign(hist);
 }
 if(kind==='RSI_REVERSION'){
   const steps=closes.slice(-15).map((v,i,a)=>i?v-a[i-1]:0).slice(1);
   const gains=steps.reduce((v,d)=>v+Math.max(0,d),0);
   const losses=steps.reduce((v,d)=>v+Math.max(0,-d),0);
   const rsi=losses===0?100:gains===0?0:100-100/(1+gains/losses);
   return rsi<=32?'BUY':rsi>=68?'SELL':'WAIT';
 }
 if(kind==='DONCHIAN_BREAK'){
   const prior=rows.slice(-13,-1);
   return last.close>Math.max(...prior.map(x=>x.high))+atr*.05?'BUY':
     last.close<Math.min(...prior.map(x=>x.low))-atr*.05?'SELL':'WAIT';
 }
 if(kind==='SWEEP_RECLAIM'){
   const prior=rows.slice(-15,-2);
   const low=Math.min(...prior.map(b=>b.low)),high=Math.max(...prior.map(b=>b.high));
   if(prev.low<low-atr*.05&&prev.close>low&&last.close>low&&last.close>last.open)return 'BUY';
   if(prev.high>high+atr*.05&&prev.close<high&&last.close<high&&last.close<last.open)return 'SELL';
   return 'WAIT';
 }
 return sign(Math.abs(last.close-rows.at(-4)!.close)<atr*.18?0:last.close-rows.at(-4)!.close);
}
const wilsonLower=(hits:number,n:number)=>{
 if(!n)return 0;const z=1.96,p=hits/n,den=1+z*z/n;
 return (p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/den;
};
function evaluate(rows:Candle[],kind:Strategy,begin:number,end:number){
 let n=0,hits=0,flat=0,naiveN=0,naiveHits=0,modelOnly=0,baselineOnly=0;
 for(let i=begin;i<end;i++){
   const prefix=rows.slice(0,i),next=rows[i];
   if(!next||!prefix.length)continue;
   const prediction=indicator(prefix,kind);
   const actual=sign(next.close-next.open);
   if(prediction==='WAIT')continue;
   n++;
   const predictedHit=actual!=='WAIT'&&prediction===actual;
   if(predictedHit)hits++;
   if(actual==='WAIT')flat++;
   const naive=sign(prefix.at(-1)!.close-prefix.at(-1)!.open);
   const baselineHit=actual!=='WAIT'&&naive===actual;
   naiveN++;if(baselineHit)naiveHits++;
   // Paired same-candle comparison: a trend-following strategy does not gain
   // credit for wins that an elementary last-body baseline also achieves.
   if(predictedHit&&!baselineHit)modelOnly++;
   if(baselineHit&&!predictedHit)baselineOnly++;
 }
 const pairedEdge=n?(modelOnly-baselineOnly)/n:0;
 // Conservative normal bound for the paired advantage. Disagreements,
 // not the shared wins, are the evidence of model improvement.
 const pairedSe=n?Math.sqrt(Math.max(0,
   (modelOnly+baselineOnly)/n-pairedEdge*pairedEdge)/n):0;
 return {n,hits,flat,modelOnly,baselineOnly,
   accuracyPct:n?Math.round(hits/n*100):null,
   baselinePct:naiveN?Math.round(naiveHits/naiveN*100):null,
   lower95Pct:n?Number((wilsonLower(hits,n)*100).toFixed(1)):null,
   pairedEdgeLower95Pct:n?Number(((pairedEdge-1.96*pairedSe)*100).toFixed(1)):null};
}
const label:Record<Strategy,string>={
 EMA_8_21:'تقاطع واتجاه EMA 8/21',
 MACD_12_26_9:'زخم MACD',
 RSI_REVERSION:'انعكاس RSI',
 DONCHIAN_BREAK:'كسر Donchian',
 SWEEP_RECLAIM:'سحب سيولة واسترداد',
 MOMENTUM_3:'استمرار زخم 3 شموع'
};
export function analyzeNextCandleStrategies(raw:readonly Candle[],now:number){
 const empty=(reason:string)=>({status:'UNAVAILABLE' as const,side:'WAIT' as Direction,
   strategy:null as Strategy|null,strategyLabel:null as string|null,reason,
   total:0,train:null as ReturnType<typeof evaluate>|null,
   holdout:null as ReturnType<typeof evaluate>|null,
   recentHoldout:null as ReturnType<typeof evaluate>|null,edgeSupported:false,
   atr:null as number|null,sampleBody:null as number|null,sampleUpperWick:null as number|null,
   sampleLowerWick:null as number|null});
 const rows=(Array.isArray(raw)?raw:[]).filter(b=>b&&
   [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time%60000===0&&
   b.time+60000<=now&&b.open>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
   b.low<=Math.min(b.open,b.close)).slice(-360);
 if(rows.length<160)return empty('نحتاج 160 شمعة M1 مغلقة على الأقل لاختبار الاستراتيجيات');
 if(rows.some((b,i)=>i>0&&b.time-rows[i-1].time!==60000))
   return empty('فجوة أو تغيير مصدر في شموع الدقيقة؛ لا نعتمد الاتجاه');
 if(now-(rows.at(-1)!.time+60000)>90000)
   return empty('آخر إغلاق M1 قديم؛ انتظار بيانات حديثة');
 const cutoff=Math.floor(rows.length*.72),begin=60;
 // Freeze the winning strategy ONLY on the older training portion.
 const training=STRATEGIES.map(strategy=>({
   strategy,train:evaluate(rows,strategy,begin,cutoff)
 })).filter(x=>x.train.n>=20&&x.train.accuracyPct!=null);
 training.sort((a,b)=>{
   const score=(x:typeof training[number])=>
     // Rank on skill ABOVE an equally sampled last-candle baseline;
     // an always-BUY trend cannot win simply by inheriting a rising market.
     (x.train.lower95Pct??0)-(x.train.baselinePct??50)+
       Math.min(80,x.train.n)/80*2;
   return score(b)-score(a);
 });
 const winner=training[0];
 if(!winner)return {...empty('لا استراتيجية أعطت 20 إشارة تدريب قابلة للتحقق'),
   total:rows.length,status:'TECHNICAL_ONLY' as const};
 const holdout=evaluate(rows,winner.strategy,cutoff,rows.length);
 const recentHoldout=evaluate(rows,winner.strategy,
   Math.floor((cutoff+rows.length)/2),rows.length);
 const edgeSupported=holdout.n>=30&&recentHoldout.n>=12&&
   holdout.baselinePct!=null&&holdout.accuracyPct!=null&&
   holdout.accuracyPct>=holdout.baselinePct+5&&
   (holdout.lower95Pct??0)>50&&
   (holdout.pairedEdgeLower95Pct??-100)>0&&
   (recentHoldout.accuracyPct??0)>=(recentHoldout.baselinePct??100);
 const side=indicator(rows,winner.strategy);
 const tail=rows.slice(-30),ranges=tail.map(b=>Math.max(b.high-b.low,
   Math.abs(b.high-b.open),Math.abs(b.low-b.open)));
 const a=median(ranges);
 const body=median(tail.map(b=>Math.abs(b.close-b.open)));
 const up=median(tail.map(b=>b.high-Math.max(b.open,b.close)));
 const down=median(tail.map(b=>Math.min(b.open,b.close)-b.low));
 const status=edgeSupported?'VALIDATED' as const:'TECHNICAL_ONLY' as const;
 return {status,side,strategy:winner.strategy,strategyLabel:label[winner.strategy],
   reason:edgeSupported?'أفضلية تاريخية خارج العينة في هذه النافذة؛ ليست ضمانًا للمستقبل':
     'طريقة منتقاة من تدريب أقدم لكن أفضلية توقع الدقيقة لم تثبت خارج العينة',
   total:rows.length,train:winner.train,holdout,recentHoldout,edgeSupported,
   atr:a,sampleBody:body,sampleUpperWick:up,sampleLowerWick:down};
}
export function illustrativeNextCandle(input:{
  study:ReturnType<typeof analyzeNextCandleStrategies>;anchor:number;
  minute:number;enabled:boolean
}){
 const {study,anchor,minute,enabled}=input;
 if(!enabled||study.status==='UNAVAILABLE'||study.side==='WAIT'||
   !Number.isFinite(anchor)||anchor<=0||!Number.isFinite(minute)||
   study.atr==null||study.atr<=0)return null;
 const a=study.atr,body=Math.min(a*.55,Math.max(a*.12,study.sampleBody??a*.2));
 const direction=study.side==='BUY'?1:-1,open=anchor,close=open+direction*body;
 const high=Math.max(open,close)+Math.min(a*.4,study.sampleUpperWick??a*.12);
 const low=Math.min(open,close)-Math.min(a*.4,study.sampleLowerWick??a*.12);
 if(low<=0)return null;
 return {time:minute+60000,open,high,low,close,side:study.side,
   validated:study.edgeSupported,illustrative:true as const};
}
