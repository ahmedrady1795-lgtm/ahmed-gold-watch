/**
 * Read-only M15 chart liquidity overlays. All inputs are completed OHLC
 * or the existing four-hour analysis, never fictitious institution orders.
 * Zones may be shown during sideways/WAIT observations, but never execute.
 */
type Candle={time:number;open:number;high:number;low:number;close:number};
type RawZone={side:'BUY'|'SELL';low:number;high:number;confirmedAt:number;source:string;touches?:number};
type RawContext={low:number;high:number;from:number;to:number;label:string;kind:string};
type RawEvent={kind:string;at:number;confirmedAt:number;price:number;level:number;label:string};
export type LiquidityZone={kind:'DEMAND'|'SUPPLY'|'HIGH_POOL'|'LOW_POOL'|'REBOUND_UP'|'REBOUND_DOWN';
 low:number;high:number;label:string;source:string;confirmedAt:number|null;
 invalidation?:number};
export type LiquidityContext={low:number;high:number;from:number;to:number;
 label:string;kind:'ACCUMULATION'|'DISTRIBUTION'|'COMPRESSION'};
export type LiquidityEvent={kind:'SWEEP_LOW'|'SWEEP_HIGH'|'BOS_UP'|'BOS_DOWN';
 at:number;price:number;label:string};
export type LiquidityLayers={ready:boolean;zones:LiquidityZone[];
 context:LiquidityContext|null;events:LiquidityEvent[];phase:string;reason:string};
const ok=(v:number)=>Number.isFinite(v)&&v>0;
const empty=(reason:string):LiquidityLayers=>({
 ready:false,zones:[],context:null,events:[],phase:'قراءة غير متاحة',reason
});
export function buildSniperM15Liquidity(input:{
 now:number;price:number|null;history:readonly Candle[];sourceReady:boolean;
 fourHour?:{ready?:boolean;phase?:string;zones?:RawZone[];
 contextBox?:RawContext|null;events?:RawEvent[]} | null;
 pools?:{ready?:boolean;upper?:{low:number;high:number}|null;
 lower?:{low:number;high:number}|null}|null;
}):LiquidityLayers{
 const {now,price,history,fourHour}=input;
 if(!input.sourceReady||price==null||!ok(price))return empty('السعر أو مصدر الشموع متأخر');
 const latest=history.at(-1),first=history.at(0);
 if(!latest||!first||history.length<26||
    now-(latest.time+900000)>36*60000||
    history.slice(-12).some((b,i,a)=>b.time%900000!==0||
     b.time+900000>now||!ok(b.low)||b.high<Math.max(b.open,b.close)||
     b.low>Math.min(b.open,b.close)||
     (i>0&&b.time-a[i-1].time!==900000)))
   return empty('شموع M15 غير مكتملة أو متقطعة');
 const lookback=history.slice(-52);
 const minPrice=Math.min(...lookback.map(b=>b.low));
 const maxPrice=Math.max(...lookback.map(b=>b.high));
 const normalSpan=Math.max(maxPrice-minPrice,price*.0008);
 const maxWidth=Math.max(normalSpan*.6,price*.002);
 const validZone=(lo:number,hi:number)=>ok(lo)&&ok(hi)&&hi>=lo&&
   hi-lo<=maxWidth&&Math.abs((hi+lo)/2-price)<normalSpan*2.2;
 const zones:LiquidityZone[]=[];
 const add=(kind:LiquidityZone['kind'],low:number,high:number,
   label:string,source:string,confirmedAt:number|null,invalidation?:number)=>{
   if(!validZone(low,high))return;
   if(zones.some(z=>z.kind===kind&&
     Math.abs((z.low+z.high)/2-(low+high)/2)<normalSpan*.014))return;
   zones.push({kind,low,high,label,source,confirmedAt,invalidation});
 };
 if(fourHour?.ready){
   for(const z of (fourHour.zones??[]).slice(0,8)){
     if(!z||z.confirmedAt>now||z.confirmedAt<=0)continue;
     add(z.side==='BUY'?'DEMAND':'SUPPLY',z.low,z.high,
       z.side==='BUY'?'منطقة طلب':'منطقة عرض',z.source,z.confirmedAt);
   }
 }
 // If the H4/M5 record has no usable demand/supply, use strictly
 // confirmed M15 pivot highs/lows as transparent technical zones.
 const hasDemand=zones.some(z=>z.kind==='DEMAND');
 const hasSupply=zones.some(z=>z.kind==='SUPPLY');
 if(!hasDemand||!hasSupply){
   const candidates:RawZone[]=[];
   for(let i=Math.max(2,history.length-60);i<history.length-2;i++){
     const b=history[i],adj=[history[i-2],history[i-1],history[i+1],history[i+2]];
     const after=history.slice(i+3);
     if(!hasDemand&&adj.every(c=>b.low<c.low)&&
       !after.some(c=>c.close<b.low))
       candidates.push({side:'BUY',low:b.low,high:Math.max(b.open,b.close),
         confirmedAt:history[i+2].time+900000,source:'قاع M15 مؤكد'});
     if(!hasSupply&&adj.every(c=>b.high>c.high)&&
       !after.some(c=>c.close>b.high))
       candidates.push({side:'SELL',low:Math.min(b.open,b.close),high:b.high,
         confirmedAt:history[i+2].time+900000,source:'قمة M15 مؤكدة'});
   }
   for(const side of ['BUY','SELL'] as const){
     if(side==='BUY'&&hasDemand||side==='SELL'&&hasSupply)continue;
     candidates.filter(z=>z.side===side).sort((a,b)=>
       Math.abs((a.low+a.high)/2-price)-Math.abs((b.low+b.high)/2-price))
      .slice(0,1).forEach(z=>add(side==='BUY'?'DEMAND':'SUPPLY',z.low,z.high,
        side==='BUY'?'طلب M15':'عرض M15',z.source,z.confirmedAt));
   }
 }
 // Fully closed M15 sweep/reclaim + a later completed follow-through.
 // Not an institutional order book; invalidate after any later close breach.
 const reactions:Array<{
   kind:'REBOUND_UP'|'REBOUND_DOWN';low:number;high:number;
   confirmedAt:number;invalidation:number;source:string
 }>=[];
 const atrRows=history.slice(-15);
 const atrRanges=atrRows.slice(1).map((b,i)=>
   Math.max(b.high-b.low,Math.abs(b.high-atrRows[i].close),
     Math.abs(b.low-atrRows[i].close)));
 const atr=atrRanges.length?
   atrRanges.reduce((sum,x)=>sum+x,0)/atrRanges.length:0;
 if(atr>0)for(let i=Math.max(2,history.length-35);i<history.length-1;i++){
   const p2=history[i-2],p1=history[i-1],b=history[i],next=history[i+1];
   if(p1.time-p2.time!==900000||b.time-p1.time!==900000||
      next.time-b.time!==900000||next.time+900000>now)continue;
   const span=b.high-b.low;
   if(!(span>0))continue;
   const lowerWick=Math.min(b.open,b.close)-b.low;
   const upperWick=b.high-Math.max(b.open,b.close);
   const upSweep=b.low<Math.min(p1.low,p2.low)&&
     lowerWick>=span*.22&&b.close>=b.low+span*.55&&
     next.close>b.close&&next.close>next.open;
   const downSweep=b.high>Math.max(p1.high,p2.high)&&
     upperWick>=span*.22&&b.close<=b.high-span*.55&&
     next.close<b.close&&next.close<next.open;
   const after=history.slice(i+2);
   if(upSweep&&price>b.low&&!after.some(c=>c.close<b.low)){
     const high=Math.min(Math.min(b.open,b.close),
       b.low+Math.max(atr*.4,span*.25));
     if(high>b.low)reactions.push({kind:'REBOUND_UP',low:b.low,high,
       confirmedAt:next.time+900000,invalidation:b.low,
       source:'سحب قاع M15 ثم إغلاق صاعد لاحق'});
   }
   if(downSweep&&price<b.high&&!after.some(c=>c.close>b.high)){
     const low=Math.max(Math.max(b.open,b.close),
       b.high-Math.max(atr*.4,span*.25));
     if(low<b.high)reactions.push({kind:'REBOUND_DOWN',low,high:b.high,
       confirmedAt:next.time+900000,invalidation:b.high,
       source:'سحب قمة M15 ثم إغلاق هابط لاحق'});
   }
 }
 // Nearest recent valid reaction on each side; never fabricate an event.
 for(const kind of ['REBOUND_UP','REBOUND_DOWN'] as const){
   const candidate=reactions.filter(z=>z.kind===kind)
     .sort((a,b)=>b.confirmedAt-a.confirmedAt)[0];
   if(candidate)add(candidate.kind,candidate.low,candidate.high,
     kind==='REBOUND_UP'?'ارتداد صاعد':'رفض هابط',
     candidate.source,candidate.confirmedAt,candidate.invalidation);
 }
 if(input.pools?.ready){
   const upper=input.pools.upper,lower=input.pools.lower;
   if(upper)add('HIGH_POOL',upper.low,upper.high,'سيولة القمم','سعر M1/M5 مغلق',null);
   if(lower)add('LOW_POOL',lower.low,lower.high,'سيولة القيعان','سعر M1/M5 مغلق',null);
 }
 // Keep at most two zones of each side, with pool lines distinguishable.
 const selected=zones.filter(z=>!['HIGH_POOL','LOW_POOL'].includes(z.kind))
   .sort((a,b)=>Math.abs((a.low+a.high)/2-price)-Math.abs((b.low+b.high)/2-price));
 const demand=selected.filter(z=>z.kind==='DEMAND').slice(0,2);
 const supply=selected.filter(z=>z.kind==='SUPPLY').slice(0,2);
 const reboundZones=zones.filter(z=>z.kind==='REBOUND_UP'||z.kind==='REBOUND_DOWN');
 const pools=zones.filter(z=>['HIGH_POOL','LOW_POOL'].includes(z.kind));
 const contextRaw=fourHour?.ready?fourHour.contextBox:null;
 const context:LiquidityContext|null=contextRaw&&
    ['ACCUMULATION','DISTRIBUTION','COMPRESSION'].includes(contextRaw.kind)&&
    ok(contextRaw.low)&&contextRaw.high>=contextRaw.low&&
    contextRaw.to>contextRaw.from&&contextRaw.to<=now&&
    contextRaw.from>=first.time&&contextRaw.from<=latest.time+900000?{
      low:contextRaw.low,high:contextRaw.high,from:contextRaw.from,to:contextRaw.to,
      label:contextRaw.label,kind:contextRaw.kind as LiquidityContext['kind']
    }:null;
 const events=(fourHour?.ready?(fourHour.events??[]):[])
   .filter((e):e is RawEvent=>Boolean(e&&
     ['SWEEP_LOW','SWEEP_HIGH','BOS_UP','BOS_DOWN'].includes(e.kind)&&
     ok(e.price)&&e.at>=first.time&&e.at<=latest.time+900000&&
     e.confirmedAt<=now&&e.confirmedAt>e.at))
   .slice(-3).map(e=>({kind:e.kind as LiquidityEvent['kind'],at:e.at,
     price:e.price,label:e.label}));
 return {ready:true,zones:[...demand,...supply,...reboundZones,...pools],context,events,
   phase:fourHour?.ready?String(fourHour.phase||'توازن / غير محسوم'):
     'مناطق M15 فقط · سياق الأربع ساعات غير مكتمل',
   reason:fourHour?.ready?'مناطق مشتقة من شموع M1/M5/M15 مغلقة':
     'مستويات M15 تاريخية فقط؛ لا توجد قراءة تجميع مؤكدة'};
}


/** A label is a reading aid, not another price: merge nearby labels while
 * retaining every independent exact-price zone in the chart geometry. */
export type CompactZoneAnnotation={
 price:number;kind:LiquidityZone['kind']|'MIXED';
 label:string;detail:string;count:number;low:number;high:number
};
export function compactM15ZoneAnnotations(
 zones:readonly LiquidityZone[],lastPrice:number,
 pixelY:(price:number)=>number,limit=3,minGap=29
):CompactZoneAnnotation[]{
 if(!Number.isFinite(lastPrice)||lastPrice<=0)return [];
 const sorted=zones.filter(z=>z&&Number.isFinite(z.low)&&Number.isFinite(z.high)&&
     z.high>=z.low&&z.low>0)
   .map(z=>({z,p:(z.low+z.high)/2}))
   .sort((a,b)=>pixelY(a.p)-pixelY(b.p));
 const clusters:Array<Array<typeof sorted[number]>>=[];
 for(const entry of sorted){
   const last=clusters.at(-1);
   if(last&&Math.abs(pixelY(entry.p)-
     pixelY(last.reduce((sum,e)=>sum+e.p,0)/last.length))<minGap)
     last.push(entry);
   else clusters.push([entry]);
 }
 const visible=clusters.sort((a,b)=>
   Math.abs(a.reduce((s,x)=>s+x.p,0)/a.length-lastPrice)-
   Math.abs(b.reduce((s,x)=>s+x.p,0)/b.length-lastPrice))
   .slice(0,Math.max(1,Math.min(4,limit)))
   .sort((a,b)=>pixelY(a[0].p)-pixelY(b[0].p));
 return visible.map(group=>{
   const preferred=group.find(e=>e.z.kind==='REBOUND_UP'||e.z.kind==='REBOUND_DOWN')??
     group.find(e=>e.z.kind==='DEMAND'||e.z.kind==='SUPPLY')??group[0];
   const name=(kind:LiquidityZone['kind'])=>kind==='DEMAND'?'طلب':
     kind==='SUPPLY'?'عرض':kind==='REBOUND_UP'?'ارتداد صاعد':
     kind==='REBOUND_DOWN'?'رفض هابط':
     kind==='LOW_POOL'?'سيولة قيعان':'سيولة قمم';
   const single=group.every(e=>e.z.kind===preferred.z.kind);
   const hasUp=group.some(e=>e.z.kind==='REBOUND_UP');
   const hasDown=group.some(e=>e.z.kind==='REBOUND_DOWN');
   const label=(single?name(preferred.z.kind):
     hasUp?'ارتداد + مناطق':hasDown?'رفض + مناطق':'مناطق متداخلة')+
     (group.length>1?' ×'+group.length:'');
   return {price:group.reduce((s,x)=>s+x.p,0)/group.length,
     kind:single?preferred.z.kind:'MIXED' as const,label,
     detail:group.map(e=>name(e.z.kind)+': '+e.z.low.toFixed(2)+'–'+
       e.z.high.toFixed(2)).join(' | '),count:group.length,
     low:Math.min(...group.map(e=>e.z.low)),
     high:Math.max(...group.map(e=>e.z.high))};
 });
}
