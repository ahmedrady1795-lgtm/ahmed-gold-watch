/**
 * Causal OHLC price-action evidence for the Market Maker Hunter panel.
 * BOS, CHoCH, FVG and "order block candidate" are descriptive heuristics,
 * not proof of institutional trading, a hidden stop book or a winning trade.
 * ONLY fully closed, contiguous M15 candles are accepted.
 */
export type StructureBar={time:number;open:number;high:number;low:number;close:number};
export type StructureZone={
 kind:'BULL_FVG'|'BEAR_FVG'|'BULL_OB'|'BEAR_OB';
 low:number;high:number;formedAt:number;label:string;active:boolean
};
export type StructureEvent={
 kind:'BOS_UP'|'BOS_DOWN'|'CHOCH_UP'|'CHOCH_DOWN'|'SWEEP_HIGH'|'SWEEP_LOW';
 at:number;price:number;label:string
};
export type StructureSnapshot={
 ready:boolean;reason:string;zones:StructureZone[];events:StructureEvent[];
 bias:'BUY'|'SELL'|'WAIT';rsi14:number|null;strength:number;
 rsiSeries:number[];sweep:'HIGH_REJECTION'|'LOW_REJECTION'|'NONE';
};

const empty=(reason:string):StructureSnapshot=>({ready:false,reason,
 zones:[],events:[],bias:'WAIT',rsi14:null,strength:0,rsiSeries:[],sweep:'NONE'});
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const valid=(b:StructureBar)=>Number.isSafeInteger(b.time)&&b.time%900000===0&&
 [b.open,b.high,b.low,b.close].every(p=>Number.isFinite(p)&&p>0)&&
 b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
export function rsiFromClosedBars(bars:readonly StructureBar[],period=14):number[]{
 if(!Number.isInteger(period)||period<2||bars.length<=period)return [];
 const changes=bars.slice(1).map((b,i)=>b.close-bars[i].close);
 let gains=0,losses=0;
 for(const d of changes.slice(0,period)){
   gains+=Math.max(d,0);losses+=Math.max(-d,0);
 }
 let up=gains/period,down=losses/period;
 const value=()=>up+down===0?50:down===0?100:100-100/(1+up/down);
 const result=[value()];
 for(const d of changes.slice(period)){
   up=(up*(period-1)+Math.max(d,0))/period;
   down=(down*(period-1)+Math.max(-d,0))/period;
   result.push(value());
 }
 return result.map(x=>Number(x.toFixed(2)));
}

export function analyzeM15MarketStructure(
 history:readonly StructureBar[],now:number
):StructureSnapshot{
 if(!Array.isArray(history)||!Number.isFinite(now))
   return empty('إغلاقات M15 غير متاحة');
 // Markets may have scheduled closed-session gaps. Analyze the most
 // recent contiguous segment only rather than hiding every indicator
 // because a weekend gap exists among older historical bars.
 const tail=history.slice(-72);
 let begin=tail.length;
 while(begin>0){
   const b=tail[begin-1];
   if(!valid(b)||b.time+900000>now||
      begin<tail.length&&tail[begin].time-b.time!==900000)break;
   begin--;
 }
 const bars=tail.slice(begin);
 if(bars.length<24)return empty('يلزم 24 إغلاق M15 متصل وحديث');
 const last=bars.at(-1)!;
 if(now-(last.time+900000)>3600000)return empty('بيانات الهيكل قديمة');
 const ranges=bars.slice(-16).slice(1).map((b,i)=>{
   const prev=bars[bars.length-16+i];
   return Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));
 });
 const sorted=ranges.filter(v=>v>0).sort((a,b)=>a-b);
 const atr=sorted[Math.floor(sorted.length/2)]||0;
 if(!Number.isFinite(atr)||atr<=0||atr>=last.close*.06)
   return empty('تقلب M15 غير صالح');
 const events:StructureEvent[]=[];
 const zones:StructureZone[]=[];
 // Use ONLY preceding bars to establish a prior reference before each event.
 // Never use a future high/low to confirm a historic BOS.
 for(let i=Math.max(13,bars.length-32);i<bars.length;i++){
   const b=bars[i],previous=bars.slice(i-12,i);
   const ceiling=Math.max(...previous.map(r=>r.high));
   const floor=Math.min(...previous.map(r=>r.low));
   const prevDelta=bars[i-1].close-bars[Math.max(0,i-5)].close;
   const bosUp=b.close>ceiling+atr*.04;
   const bosDown=b.close<floor-atr*.04;
   if(bosUp||bosDown){
     const change=bosUp?prevDelta< -atr*.18:prevDelta>atr*.18;
     events.push({kind:bosUp?(change?'CHOCH_UP':'BOS_UP'):
       (change?'CHOCH_DOWN':'BOS_DOWN'),at:b.time,price:b.close,
       label:change?'CHoCH':'BOS'});
   }
   // A closed sweep must wick through previous known swing AND reject on close.
   if(b.high>ceiling+atr*.05&&b.close<ceiling&&b.close<b.open)
     events.push({kind:'SWEEP_HIGH',at:b.time,price:b.high,label:'سحب قمة'});
   if(b.low<floor-atr*.05&&b.close>floor&&b.close>b.open)
     events.push({kind:'SWEEP_LOW',at:b.time,price:b.low,label:'سحب قاع'});
   // Three-candle non-overlap (FVG); do not call it exchange volume/imbalance.
   if(i>=2){
     const first=bars[i-2];
     if(b.low>first.high+atr*.08)
       zones.push({kind:'BULL_FVG',low:first.high,high:b.low,
         formedAt:b.time,label:'FVG طلب',active:true});
     else if(b.high<first.low-atr*.08)
       zones.push({kind:'BEAR_FVG',low:b.high,high:first.low,
         formedAt:b.time,label:'FVG عرض',active:true});
   }
   // Opposite-bodied candle before a significant CLOSE beyond a swing.
   if((bosUp||bosDown)&&Math.abs(b.close-b.open)>atr*.35){
     const candidate=bars.slice(Math.max(0,i-5),i).reverse().find(row=>
       bosUp?row.close<row.open:row.close>row.open);
     if(candidate)zones.push({kind:bosUp?'BULL_OB':'BEAR_OB',
       low:candidate.low,high:candidate.high,formedAt:b.time,
       label:bosUp?'OB طلب محتمل':'OB عرض محتمل',active:true});
   }
 }
 // Keep just recent unfilled zones. If subsequently crossed through,
 // that old FVG/OB is no longer an active liquidity area.
 const examined=zones.map(zone=>{
   const later=bars.filter(b=>b.time>zone.formedAt);
   const crossed=zone.kind.startsWith('BULL')?
      later.some(b=>b.close<zone.low):later.some(b=>b.close>zone.high);
   return {...zone,active:!crossed};
 }).filter(z=>z.active&&
   z.high>=last.close-atr*5&&z.low<=last.close+atr*5);
 // Deduplicate overlapping zones of the same sign to keep mobile legibility.
 const selected:StructureZone[]=[];
 for(const z of examined.sort((a,b)=>b.formedAt-a.formedAt)){
   if(selected.some(p=>p.kind===z.kind&&
     Math.abs((p.high+p.low-z.high-z.low)/2)<atr*.2))continue;
   selected.push(z);
   if(selected.length>=3)break;
 }
 const recentEvents=events.slice(-8);
 const latest=events.at(-1);
 const rsiSeries=rsiFromClosedBars(bars,14);
 const rsi=rsiSeries.at(-1)??null;
 const bias=latest?.kind==='SWEEP_HIGH'||latest?.kind==='BOS_DOWN'||
   latest?.kind==='CHOCH_DOWN'?'SELL':
   latest?.kind==='SWEEP_LOW'||latest?.kind==='BOS_UP'||
   latest?.kind==='CHOCH_UP'?'BUY':'WAIT';
 const sweep=latest?.kind==='SWEEP_HIGH'?'HIGH_REJECTION':
   latest?.kind==='SWEEP_LOW'?'LOW_REJECTION':'NONE';
 const strength=bias==='WAIT'?0:Math.round(clamp(
   35+Math.abs((rsi??50)-50)*.48+
   Math.min(20,Math.abs(last.close-last.open)/atr*18),35,80));
 return {ready:true,reason:'الهيكل من إغلاقات M15 فقط',
   zones:selected,events:recentEvents,bias,rsi14:rsi,strength,
   rsiSeries:rsiSeries.slice(-24),sweep};
}
