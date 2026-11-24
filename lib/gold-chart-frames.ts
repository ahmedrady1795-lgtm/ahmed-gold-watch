import type {Candle} from './engine';

// Complete observed bars only. Never interpolate missing minutes or merge venues.
const valid=(b:Candle,period:number,now:number)=>Number.isSafeInteger(b.time)&&
 b.time>0&&b.time%period===0&&b.time+period<=now&&
 [b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)&&
 b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
export function completeGoldBars(rows:readonly Candle[],period:number,now:number){
 return [...new Map(rows.filter(b=>valid(b,period,now)).map(b=>[b.time,b])).values()]
  .sort((a,b)=>a.time-b.time);
}
export function aggregateGoldBars(rows:readonly Candle[],from:number,to:number,now:number):Candle[]{
 if(!Number.isSafeInteger(to/from)||to<=from)return [];
 const groups=new Map<number,Candle[]>();
 for(const b of completeGoldBars(rows,from,now)){
  const at=Math.floor(b.time/to)*to;
  if(at+to>now)continue;
  const group=groups.get(at)||[];group.push(b);groups.set(at,group);
 }
 return [...groups].filter(([at,g])=>g.length===to/from&&
  g.every((b,i)=>b.time===at+i*from)).map(([time,g])=>({
   time,open:g[0].open,close:g[g.length-1].close,
   high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low))
 }));
}
export function recoverGoldFrames(input:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]},now:number){
 const merge=(raw:Candle[],derived:Candle[],period:number)=>
  completeGoldBars([...derived,...raw],period,now).slice(-340);
 const c1=completeGoldBars(input.c1,60000,now).slice(-340);
 const c5=merge(input.c5,aggregateGoldBars(c1,60000,300000,now),300000);
 const c15=merge(input.c15,aggregateGoldBars(c5,300000,900000,now),900000);
 const c60=merge(input.c60,aggregateGoldBars(c5,300000,3600000,now),3600000);
 return {c1,c5,c15,c60};
}
