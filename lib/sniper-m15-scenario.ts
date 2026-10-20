/**
 * Sniper M15 candle route. Observed candles and future scenarios are never
 * conflated: only fully CLOSED 15-minute OHLC may train analogues.
 * No TP/SL price may reshape OHLC, and no synthetic bar is a broker quote.
 */
export type M15Bar={time:number;open:number;high:number;low:number;close:number;volume?:number};
export type M15Side='BUY'|'SELL'|'WAIT';
export type ScenarioM15Bar={open:number;high:number;low:number;close:number;step:number;source:'HISTORICAL_ANALOGUE'};
export type M15Scenario={
  ready:boolean;bars:ScenarioM15Bar[];reason:string;sourceBars:number;
  archiveYears:number;origin:'RECENT_M15'|'CAPTURED_M15'|'MULTI_YEAR_ARCHIVE'|'NONE';
  touches:number[];stopped:boolean;atr:number|null
};
const valid=(b:M15Bar)=>b!=null&&
 [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time>0&&
 b.time%900000===0&&b.open>0&&b.low>0&&
 b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
const median=(v:number[])=>{
 const a=v.filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
 return a.length?a[Math.floor((a.length-1)/2)]:0;
};
const abs=(n:number)=>Math.abs(n);
const range=(b:M15Bar,prev:M15Bar)=>Math.max(b.high-b.low,
 abs(b.high-prev.close),abs(b.low-prev.close));
const joined=(a:M15Bar,b:M15Bar)=>b.time-a.time===900000;
const empty=(reason:string,sourceBars=0,archiveYears=0):M15Scenario=>({
 ready:false,bars:[],reason,sourceBars,archiveYears,origin:'NONE',
 touches:[],stopped:false,atr:null
});
export function closedM15Bars(raw:unknown,now:number,limit=1800):M15Bar[]{
 if(!Array.isArray(raw))return [];
 const unique=new Map<number,M15Bar>();
 for(const b of raw){
   if(valid(b)&&b.time+900000<=now&&b.time>=now-12*365*86400000)
     unique.set(b.time,{time:b.time,open:b.open,high:b.high,low:b.low,
       close:b.close,volume:Number.isFinite(b.volume)?Math.max(0,b.volume):0});
 }
 return [...unique.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
/** Sampled intraperiod prices are not a complete exchange OHLC feed. */
export type ObservedM15={
 time:number;open:number;high:number;low:number;close:number;
 lastAt:number;count:number;venue:string
};
const venue=(s:string)=>{
 const v=String(s||'').toLowerCase();
 return v.includes('coinbase')?'COINBASE':
   v.includes('kraken')||v.includes('xbt/usd')?'KRAKEN':
   v.includes('biquote')?'BIQUOTE':
   v.includes('exness')?'EXNESS':'UNKNOWN';
};
export function observeM15Tick(prev:ObservedM15|null,input:{
 now:number;at:number;price:number;source:string;historySource:string
}):ObservedM15|null{
 const {now,at,price,source,historySource}=input,feed=venue(source);
 if(feed==='UNKNOWN'||feed!==venue(historySource)||
   ![now,at,price].every(Number.isFinite)||price<=0||
   at>now+1000||now-at>10000||at<=0)return null;
 const time=Math.floor(at/900000)*900000;
 if(time!==Math.floor(now/900000)*900000)return null;
 if(!prev||prev.time!==time||prev.venue!==feed)
   return {time,open:price,high:price,low:price,close:price,
     lastAt:at,count:1,venue:feed};
 if(at<=prev.lastAt)return prev;
 return {...prev,high:Math.max(prev.high,price),low:Math.min(prev.low,price),
   close:price,lastAt:at,count:prev.count+1};
}
export function sampledLiveM15(raw:readonly M15Bar[],now:number,
 observed:ObservedM15|null=null,historySource=''){
 const start=Math.floor(now/900000)*900000;
 const minutes=raw.filter(b=>b.time>=start&&b.time<now&&
   b.time%60000===0&&b.time+60000<=now&&
   [b.open,b.high,b.low,b.close].every(Number.isFinite)&&
   b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
  .sort((a,b)=>a.time-b.time);
 const tick=observed&&observed.time===start&&
   observed.venue!=='UNKNOWN'&&observed.venue===venue(historySource)&&
   observed.lastAt<=now+1000&&now-observed.lastAt<=10000?observed:null;
 if(!minutes.length)return tick?{
   time:start,open:tick.open,close:tick.close,high:tick.high,low:tick.low,
   minutes:0,sampledTicks:tick.count,partial:true as const
 }:null;
 const first=minutes[0],last=minutes[minutes.length-1];
 // Never bridge a discontinuous M1 series using sampled quote data.
 if(minutes.some((b,i)=>i>0&&b.time-minutes[i-1].time!==60000))return null;
 const lastClosedAt=last.time+60000;
 return {time:start,open:first.open,
   close:tick&&tick.lastAt>=lastClosedAt?tick.close:last.close,
   high:Math.max(...minutes.map(b=>b.high),tick?.high??0),
   low:Math.min(...minutes.map(b=>b.low),tick?.low??Infinity),
   minutes:minutes.length,sampledTicks:tick?.count??0,
   partial:true as const};
}
export function buildM15Scenario(input:{
 history:unknown; archive?:unknown; now:number;anchor:number|null;
 side:M15Side;targets:readonly {price:number}[];stop?:number|null;steps?:number;
 archiveYears?:number;
}):M15Scenario{
 const live=closedM15Bars(input.history,input.now,500);
 const extra=closedM15Bars(input.archive,input.now,40000);
 // A captured archive can gradually replace the short live window ONLY if
 // recent overlapping true OHLC match to prevent silently mixing price feeds.
 const lookups=new Map(extra.map(b=>[b.time,b]));
 const overlap=live.slice(-24).filter(b=>lookups.has(b.time));
 const compatible=overlap.length>=6&&overlap.every(b=>{
   const archived=lookups.get(b.time)!;
   const tol=Math.max(b.close*.000015,.02);
   return Math.abs(b.open-archived.open)<=tol&&
     Math.abs(b.high-archived.high)<=tol&&
     Math.abs(b.low-archived.low)<=tol&&
     Math.abs(b.close-archived.close)<=tol;
 });
 const captured=extra.length>=240&&compatible;
 const archival=captured&&Number.isFinite(input.archiveYears)&&input.archiveYears!>=2&&extra.length>=4000;
 const base=captured?extra:live;
 const years=archival?input.archiveYears!:0;
 if(input.side==='WAIT'||!Number.isFinite(input.anchor)||input.anchor==null||input.anchor<=0)
   return empty('لا اتجاه مرجّح أو سعر إغلاق حقيقي للبدء',base.length,years);
 if(live.length<32)return empty('نحتاج 32 شمعة M15 مغلقة على الأقل',base.length,years);
 const tail=live.slice(-24);
 if(tail.some((b,i)=>i>0&&!joined(tail[i-1],b))||
    input.now-(tail.at(-1)!.time+900000)>36*60000)
   return empty('شموع M15 الأخيرة متأخرة أو فيها فجوة',base.length,years);
 const recent=live.slice(-21),atr=median(recent.slice(1).map((b,i)=>range(b,recent[i])));
 if(atr<=0||atr>input.anchor*.08||abs(input.anchor-live.at(-1)!.close)>atr*3)
   return empty('مدى M15 الحالي غير مناسب للمحاكاة',base.length,years);
 const dir=input.side==='BUY'?1:-1;
 const goals=input.targets.slice(0,3);
 if(!goals.length||goals.some((g,i)=>!Number.isFinite(g.price)||g.price<=0||
   dir*(g.price-input.anchor!)<=0||
   i>0&&dir*(g.price-goals[i-1].price)<=0))
   return empty('مستويات الأهداف ليست مرتبة في اتجاه الحركة',base.length,years);
 if(input.stop!=null&&(!Number.isFinite(input.stop)||input.stop<=0||
   dir*(input.anchor-input.stop)<=0))
   return empty('مستوى الإبطال غير صالح',base.length,years);
 const source=base;
 const unitOf=(part:M15Bar[])=>median(part.slice(1).map((b,i)=>range(b,part[i])));
 const recentBody=median(tail.map(b=>abs(b.close-b.open)));
 const recentWick=median(tail.map(b=>b.high-b.low));
 // Preserve the candle morphology of the latest closed M15 regime.
 // Wide historical outliers must not become oversized illustrative bodies.
 const capBody=Math.max(atr*.50,recentBody*1.9);
 const capRange=Math.max(atr*1.35,recentWick*1.9);
 const shape=(bar:M15Bar,u:number)=>[
   (bar.close-bar.open)/u,
   (bar.high-Math.max(bar.open,bar.close))/u,
   (Math.min(bar.open,bar.close)-bar.low)/u
 ];
 const regime=(rows:M15Bar[],unit:number)=>{
   const travel=rows.reduce((sum,b)=>sum+abs(b.close-b.open),0);
   const net=rows.at(-1)!.close-rows[0].open;
   return [net/unit,net/Math.max(travel,unit*.01),
     rows.reduce((sum,b)=>sum+(b.high-b.low)/unit,0)/rows.length];
 };
 // Rebuild historical candles sequentially at the actual anchor. A candidate
 // that touches the original stop is not a VIABLE illustrative route and must
 // never be displayed as a four-candle "forecast" with distant target labels.
 // This is conditional scenario screening, NOT forecast win-rate evidence.
 const preview=(following:readonly M15Bar[],startPrice:number,refUnit:number)=>{
   let cursor=startPrice;
   const bars:ScenarioM15Bar[]=[];
   const k=Math.min(1.08,Math.max(.65,atr/refUnit));
   for(const reference of following){
     const body=Math.max(-capBody,Math.min(capBody,
       (reference.close-reference.open)*k));
     const hi=Math.max(0,(reference.high-
       Math.max(reference.open,reference.close))*k);
     const lo=Math.max(0,(Math.min(reference.open,reference.close)-
       reference.low)*k);
     const allowance=Math.max(0,capRange-abs(body));
     const ratio=Math.min(1,allowance/Math.max(.000000001,hi+lo));
     const open=cursor,close=open+body;
     const high=Math.max(open,close)+hi*ratio;
     const low=Math.min(open,close)-lo*ratio;
     if(low<=0||(input.stop!=null&&
       low<=input.stop&&input.stop<=high))return null;
     bars.push({step:bars.length+1,open,high,low,close,
       source:'HISTORICAL_ANALOGUE'});
     cursor=close;
   }
   return bars;
 };
 const chosen:number[]=[];
 let price=input.anchor,context=tail.slice(-6).map(b=>({...b}));
 const output:ScenarioM15Bar[]=[],touches:number[]=[];
 const stopped=false;
 let goalIndex=0;
 const count=Math.max(6,Math.min(48,Math.floor(input.steps??36)));
 for(let stage=0;stage<Math.ceil(count/6);stage++){
   let best=-1,bestScore=Infinity;
   let bestBars:ScenarioM15Bar[]=[];
   const currentRegime=regime(context,atr);
   // Score past context only, never the outcome against live future candles.
   // Filter outcomes by the requested directional scenario, not by TP distance.
   for(let i=12;i+6<=source.length-2;i++){
     const group=source.slice(i-12,i+6);
     if(group.some((b,j)=>j>0&&!joined(group[j-1],b)))continue;
     const refUnit=unitOf(group.slice(0,12));
     if(refUnit<=0||refUnit>price*.08)continue;
     const future=source.slice(i,i+6);
     const net=dir*(future.at(-1)!.close-future[0].open);
     if(net<refUnit*.18)continue;
     const before=source.slice(i-6,i);
     let score=0;
     for(let j=0;j<6;j++){
       const nowShape=shape(context[j],atr),historyShape=shape(before[j],refUnit);
       score+=(nowShape[0]-historyShape[0])**2+
          .24*(nowShape[1]-historyShape[1])**2+
          .24*(nowShape[2]-historyShape[2])**2;
     }
     // Match the observed regime as well as individual candle shapes.
     // All features precede this candidate's outcome; targets do not enter scoring.
     const pastRegime=regime(before,refUnit);
     score+=.35*(currentRegime[0]-pastRegime[0])**2+
       .75*(currentRegime[1]-pastRegime[1])**2+
       .25*(currentRegime[2]-pastRegime[2])**2;
     if(chosen.some(prior=>abs(prior-i)<12))score+=1.5;
     // deterministic tie break favour recent genuine windows
     score+=(source.length-i)/source.length*.05;
     if(score<bestScore){
       const candidate=preview(future.slice(0,Math.min(6,count-output.length)),
         price,refUnit);
       if(!candidate||!candidate.length)continue;
       best=i;bestScore=score;bestBars=candidate;
     }
   }
   if(best<0)break;
   chosen.push(best);
   for(const candidate of bestBars){
     const bar={...candidate,step:output.length+1};
     output.push(bar);price=bar.close;
     const {open,high,low,close}=bar;
     context=[...context.slice(1),{time:0,open,high,low,close}];
     while(goalIndex<goals.length&&low<=goals[goalIndex].price&&
       goals[goalIndex].price<=high){
       touches.push(goalIndex+1);goalIndex++;
     }
   }
   if(output.length>=count)break;
 }
 if(!output.length)return empty('لا توجد مقاطع M15 لا تلامس الإبطال؛ لا نعرض مسارًا غير صالح',base.length,years);
 return {ready:true,bars:output,reason:archival?
   'شموع M15 من أرشيف متحقق متعدد السنوات؛ ليست أسعار مستقبلية مؤكدة':
   captured?'محاكاة من أرشيف M15 متزايد بنفس المصدر؛ ليس أرشيف سنوات كاملًا':
   'محاكاة M15 من الشموع المغلقة المتاحة حديثًا؛ أرشيف سنوات غير متصل',
   sourceBars:base.length,archiveYears:years,
   origin:archival?'MULTI_YEAR_ARCHIVE':captured?'CAPTURED_M15':'RECENT_M15',
   touches,stopped,atr};
}
