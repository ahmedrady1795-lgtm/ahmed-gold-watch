import {observedForwardReach,type BreakoutSide} from './scalp-selection';

// A DISPLAY-ONLY preview of the NEXT M1 bar. It is not a broker entry,
// cannot arm a scalp trade and cannot amend a persisted scenario/TP.
// Every target is frozen to a completed M1 close, never to a moving tick.
export type MinuteBar={time:number;open:number;high:number;low:number;close:number};
export type NearCandleWatch={
  side:BreakoutSide;
  horizon:1;
  target:{stage:1;price:number;low:number;high:number;quality:number;kind:'M1_OBSERVATION';source:string};
  samples:number;reachP20:number;referenceAt:number;
};
const round=(x:number)=>Number(x.toFixed(2));
export function buildNearCandleWatch(
  closed:MinuteBar[],price:number|null,now:number,
  contextSide:'BUY'|'SELL'|'WAIT'='WAIT',m5Side:'BUY'|'SELL'|'WAIT'='WAIT'
):NearCandleWatch|null{
  if(closed.length<65||price==null||!Number.isFinite(price)||price<=0||
     !Number.isFinite(now))return null;
  const last=closed.at(-1)!;
  if(now<last.time+60000||now-(last.time+60000)>90000)return null;
  const recent=closed.slice(-25);
  if(recent.some((c,i)=>![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||
    c.low<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||
    i>0&&c.time-recent[i-1].time!==60000))return null;
  const range=recent.slice(-20).reduce((sum,c)=>sum+c.high-c.low,0)/20;
  if(!(range>0))return null;
  const previous=closed.at(-5)!;
  const net=last.close-previous.close,body=last.close-last.open;
  if(Math.abs(net)<range*.32||Math.abs(body)<range*.20||
    Math.sign(net)!==Math.sign(body))return null;
  const side:BreakoutSide=net>0?'BUY':'SELL',dir=side==='BUY'?1:-1;
  if(contextSide!=='WAIT'&&side!==contextSide||
     m5Side!=='WAIT'&&side!==m5Side)return null;
  // Reject a newly exhausted candle and do not chase an already-consumed T1.
  const rejection=side==='BUY'?last.high-last.close:last.close-last.low;
  if(rejection>range*.6||Math.abs(price-last.close)>range*.50)return null;
  const reach=observedForwardReach(closed,side,1);
  const distance=reach.favorableP20;
  if(reach.samples<30||distance==null||distance<Math.max(.01,price*.000005))return null;
  const target=round(last.close+dir*distance);
  if(dir*(target-price)<Math.max(.01,distance*.12))return null;
  return {side,horizon:1,target:{stage:1,price:target,low:target,high:target,
    quality:0,kind:'M1_OBSERVATION',source:'Closed M1 next-bar P20 movement (WATCH only)'},
    samples:reach.samples,reachP20:round(distance),referenceAt:last.time+60000};
}
