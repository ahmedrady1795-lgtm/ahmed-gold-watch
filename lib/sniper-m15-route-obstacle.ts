/**
 * Historical M15 supply/demand is an OBSTACLE, not a guaranteed breakout.
 * Prevent a new, bullish/bearish forecast from sailing through the nearest
 * opposing zone unless two complete consecutive M15 closes have crossed it.
 * Read-only analysis. Does not alter the exchange/MT5 trading authority.
 */
export type M15ObstacleSide='BUY'|'SELL'|'WAIT';
type Bar={time:number;close:number};
type Zone={key:string;low:number|null;high:number|null;status:string};
export type M15Obstacle={blocked:boolean;reason:string;level:number|null;
  kind:'SUPPLY'|'DEMAND'|null};
const clear: M15Obstacle={blocked:false,reason:'',level:null,kind:null};
export function assessM15RouteObstacle(input:{
  side:M15ObstacleSide;anchor:number|null;goals:readonly {price:number}[];
  zones:readonly Zone[];closed:readonly Bar[];now:number;atr:number|null;
}):M15Obstacle{
 const {side,anchor,goals,zones,closed,now}=input;
 if(side==='WAIT'||anchor==null||!Number.isFinite(anchor)||anchor<=0||
   !Number.isFinite(now)||!goals.length||!Number.isFinite(goals[0].price))
   return clear;
 const isBuy=side==='BUY',kind=isBuy?'SUPPLY':'DEMAND';
 const matches=zones.filter(z=>z.key===(isBuy?'SELL':'BUY')&&
   z.status!=='NONE'&&z.low!=null&&z.high!=null&&
   Number.isFinite(z.low)&&Number.isFinite(z.high)&&z.low>0&&z.high>=z.low&&
   (isBuy?z.high>=anchor&&goals[0].price>=z.low:
     z.low<=anchor&&goals[0].price<=z.high));
 if(!matches.length)return clear;
 const zone=matches.sort((a,b)=>
   Math.abs((a.low!+a.high!)/2-anchor)-
   Math.abs((b.low!+b.high!)/2-anchor))[0];
 const level=isBuy?zone.high!:zone.low!;
 const tail=closed.slice(-2);
 const contiguous=tail.length===2&&tail.every(b=>
   Number.isSafeInteger(b.time)&&b.time%900000===0&&
   Number.isFinite(b.close)&&b.close>0&&b.time+900000<=now)&&
   tail[1].time-tail[0].time===900000;
 const buffer=Math.max(.01,(input.atr??0)*.05);
 const confirmed=contiguous&&tail.every(b=>
   isBuy?b.close>level+buffer:b.close<level-buffer);
 if(confirmed)return clear;
 return {blocked:true,kind,level,
  reason:isBuy?
    'هدف الصعود يواجه عرضًا مرصودًا عند '+level.toFixed(2)+
      '؛ يلزم كسر بإغلاقَي M15 قبل رسم استمرار صاعد':
    'هدف الهبوط يواجه طلبًا مرصودًا عند '+level.toFixed(2)+
      '؛ يلزم كسر بإغلاقَي M15 قبل رسم استمرار هابط'};
}
