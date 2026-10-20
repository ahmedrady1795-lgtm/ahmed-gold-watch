/**
 * Price-authentic BOTH-SIDED M15 liquidity destination map.
 *
 * These are historical high/low references for WATCH ONLY. They are not
 * confirmed stop orders, achievable next-candle TP, or an entry signal.
 * Never uses unfinished candles or an ATR-multiplied fictitious destination.
 */
export type WatchSide='BUY'|'SELL';
export type WatchPrice={key:string;side:WatchSide;stage:1|2|3;price:number;
  source:'M15'|'H1';kind:'SWING'|'RANGE';actionable:false};
export type WatchPriceMap={ready:boolean;reason:string;
  upper:WatchPrice[];lower:WatchPrice[];atr:number|null;asOf:number|null};
type Candle={time:number;open:number;high:number;low:number;close:number};
const good=(b:Candle)=>b!=null&&[b.time,b.open,b.high,b.low,b.close]
  .every(Number.isFinite)&&b.time>0&&b.low>0&&
  b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
const round=(v:number)=>Number(v.toFixed(2));

function closed(raw:unknown,period:number,now:number){
  const unique=new Map<number,Candle>();
  for(const b of Array.isArray(raw)?raw:[]){
    if(b&&good(b)&&b.time%period===0&&b.time+period<=now&&
      b.time>=now-20*86400000)unique.set(b.time,b);
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
function freshTail(bars:Candle[],period:number,now:number,count:number,maxAge:number){
  const tail=bars.slice(-count),last=tail.at(-1);
  return tail.length===count&&last!=null&&
    now-last.time-period>=0&&now-last.time-period<=maxAge&&
    tail.every((b,i)=>i===0||b.time-tail[i-1].time===period);
}
function trueRange(bars:Candle[]){
  if(bars.length<16)return null;
  const tail=bars.slice(-15);
  let sum=0;
  for(let i=1;i<tail.length;i++){
    const c=tail[i],p=tail[i-1];
    sum+=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));
  }
  const value=sum/14;
  return Number.isFinite(value)&&value>0?value:null;
}
export function buildM15WatchPriceMap(input:{
 now:number;price:number|null;sourceReady:boolean;
 m15:unknown;h1?:unknown
}):WatchPriceMap{
  const empty=(reason:string):WatchPriceMap=>({ready:false,reason,
    upper:[],lower:[],atr:null,asOf:null});
  const {now,price}=input;
  if(!input.sourceReady||price==null||!Number.isFinite(price)||price<=0)
    return empty('سعر حي أو مصدر M15 غير متاح');
  const m15=closed(input.m15,900000,now);
  if(!freshTail(m15,900000,now,16,36*60000)||m15.length<26)
    return empty('شموع M15 قديمة أو متقطعة');
  const atr=trueRange(m15);
  if(!atr)return empty('تعذر تقدير مدى الحركة من شموع مغلقة');
  const h1Raw=closed(input.h1,3600000,now);
  const h1=freshTail(h1Raw,3600000,now,4,135*60000)&&h1Raw.length>=12?
    h1Raw:[];
  const minDistance=Math.max(atr*.12,price*.000012);
  const maxDistance=Math.max(atr*22,price*.007);
  const separation=Math.max(atr*.50,price*.00008);
  const raw:Array<{side:WatchSide;price:number;source:'M15'|'H1';kind:'SWING'|'RANGE';d:number}>=[];
  const add=(candidate:number,side:WatchSide,source:'M15'|'H1',kind:'SWING'|'RANGE')=>{
    if(!Number.isFinite(candidate)||candidate<=0)return;
    const distance=side==='BUY'?candidate-price:price-candidate;
    if(distance<minDistance||distance>maxDistance)return;
    raw.push({side,price:candidate,source,kind,d:distance});
  };
  for(const {frame,rows} of [{frame:'M15' as const,rows:m15},
    {frame:'H1' as const,rows:h1}]){
    if(rows.length<10)continue;
    // A swing only exists after two subsequent FINISHED candles.
    for(let i=2;i<rows.length-2;i++){
      const bar=rows[i],near=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]];
      if(near.every(x=>bar.high>x.high))add(bar.high,'BUY',frame,'SWING');
      if(near.every(x=>bar.low<x.low))add(bar.low,'SELL',frame,'SWING');
    }
    for(const size of [8,16,32,64,96,130]){
      if(rows.length<size)continue;
      const window=rows.slice(-size);
      add(Math.max(...window.map(x=>x.high)),'BUY',frame,'RANGE');
      add(Math.min(...window.map(x=>x.low)),'SELL',frame,'RANGE');
    }
  }
  const pick=(side:WatchSide):WatchPrice[]=>{
    const ordered=raw.filter(x=>x.side===side).sort((a,b)=>
      a.d-b.d||({H1:0,M15:1}[a.source]-{H1:0,M15:1}[b.source]));
    const chosen:typeof raw=[];
    for(const row of ordered){
      if(chosen.length>=3)break;
      if(chosen.some(x=>Math.abs(x.price-row.price)<separation))continue;
      chosen.push(row);
    }
    return chosen.map((v,i)=>({
      key:(side==='BUY'?'UP':'DOWN')+(i+1),
      side,stage:(i+1) as 1|2|3,price:round(v.price),
      source:v.source,kind:v.kind,actionable:false as const
    }));
  };
  const upper=pick('BUY'),lower=pick('SELL');
  return {ready:true,reason:upper.length||lower.length?
    'مستويات مراقبة من قمم وقيعان M15/H1 المغلقة؛ ليست أهداف دخول مضمونة':
    'لم تُرصد قمم أو قيعان صالحة قريبة من السعر الحالي',
    upper,lower,atr:round(atr),asOf:m15.at(-1)!.time+900000};
}
