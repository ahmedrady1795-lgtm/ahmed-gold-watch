import type {M15Scenario,M15Side,ScenarioM15Bar} from './sniper-m15-scenario';
import type {M15ReactionMap} from './sniper-m15-reactions';
export type FrozenM15Snapshot={
 asset:'GOLD'|'BTC';source:string;closedTime:number;anchorTime:number;
 createdAt:number;side:Exclude<M15Side,'WAIT'>;goals:Array<{stage:number;price:number}>;
 stop:number|null;scenario:M15Scenario;reactions:M15ReactionMap;
 // Unscored, natural historical analogue extension for the classic 48-slot view.
 // The original first 12 scored bars stay in scenario.bars unchanged.
 visualBars?:ScenarioM15Bar[]
};
const M15=900000;
export const FROZEN_M15_HORIZON=12*M15;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function validateFrozenM15Snapshot(data:unknown,input:{
 asset:'GOLD'|'BTC';source:string;now:number
}):FrozenM15Snapshot|null{
 if(!data||typeof data!=='object')return null;
 const x=data as FrozenM15Snapshot;
 if(x.asset!==input.asset||x.source!==input.source||!x.source||
   x.side!=='BUY'&&x.side!=='SELL'||!finite(input.now)||
   !finite(x.closedTime)||x.closedTime%M15!==0||
   !finite(x.anchorTime)||x.anchorTime!==x.closedTime+M15||
   !finite(x.createdAt)||x.createdAt<x.anchorTime||
   x.createdAt>=x.anchorTime+M15||
   input.now<x.createdAt||input.now>=x.anchorTime+FROZEN_M15_HORIZON||
   x.stop!=null&&(!finite(x.stop)||x.stop<=0)||
   !Array.isArray(x.goals)||x.goals.length>3||
   !x.goals.every((g,i)=>finite(g.price)&&g.price>0&&
     g.stage===i+1))return null;
 const s=x.scenario;
 if(!s?.ready||!Array.isArray(s.bars)||!s.bars.length||
   s.bars.length>12||s.stopped||!s.bars.every((b,i,a)=>
      b.step===i+1&&[b.open,b.close,b.high,b.low].every(finite)&&
      b.low>0&&b.high>=Math.max(b.open,b.close)&&
      b.low<=Math.min(b.open,b.close)&&
      (i===0||Math.abs(b.open-a[i-1].close)<.000001)))return null;
 const visual=x.visualBars;
 if(visual!==undefined&&(!Array.isArray(visual)||
   visual.length<s.bars.length||visual.length>48||
   !visual.every((b,i,a)=>b.step===i+1&&b.source==='HISTORICAL_ANALOGUE'&&
     [b.open,b.close,b.high,b.low].every(finite)&&b.low>0&&
     b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&
     (i===0||Math.abs(b.open-a[i-1].close)<.000001))||
   !s.bars.every((b,i)=>visual[i]&&
     [b.open,b.close,b.high,b.low].every((value,k)=>
       Math.abs(value-[visual[i].open,visual[i].close,visual[i].high,visual[i].low][k])<.000001))))
     return null;
 if(!x.reactions||!Array.isArray(x.reactions.bands)||
   !Array.isArray(x.reactions.marks))return null;
 // Prevent accidental restoration across a changed quote/source or a
 // malformed older version. This is a client display snapshot, NOT proof.
 return x;
}
