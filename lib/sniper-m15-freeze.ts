import type {M15Side} from './sniper-m15-scenario';
/**
 * Stable on-chart projection gate, independent of trade execution.
 * HOLD on every quote tick. REBUILD only on a NEW closed M15 bar.
 * PAUSE on transient freshness loss; CLEAR on stop, market or structure invalidation.
 */
export type FrozenPlanState={
 asset:'GOLD'|'BTC';closedTime:number;side:Exclude<M15Side,'WAIT'>;
 stop:number|null;createdAt:number;anchorTime?:number
};
export type FreezeDecision='CLEAR'|'HOLD'|'REBUILD'|'PAUSE';
export function frozenM15Decision(input:{
 old:FrozenPlanState|null;asset:'GOLD'|'BTC';closedTime:number;
 quote:number|null;fresh:boolean;marketOpen:boolean;now:number;
 opposingBosConfirmedAt?:number|null;opposingBosSide?:'BUY'|'SELL'|null
}):FreezeDecision{
 const {old,asset,closedTime,quote,now}=input;
 if(!input.marketOpen||!Number.isFinite(now))return 'CLEAR';
 if(!input.fresh||quote==null||
   !Number.isFinite(quote)||quote<=0||!Number.isFinite(now)||
   !Number.isFinite(closedTime)||closedTime<=0||
   now<closedTime+900000||now-closedTime>45*60000){
   return old?.asset===asset&&now>=old.createdAt&&
     (old.anchorTime!=null?now-old.anchorTime<=12*900000:
       now-old.closedTime<=45*60000)?'PAUSE':'CLEAR';
 }
 if(!old||old.asset!==asset)return 'REBUILD';
 if(old.stop!=null&&Number.isFinite(old.stop)&&
   (old.side==='BUY'?quote<=old.stop:quote>=old.stop))return 'CLEAR';
 if(input.opposingBosConfirmedAt!=null&&
   input.opposingBosConfirmedAt>old.createdAt&&
   input.opposingBosSide!=null&&
   input.opposingBosSide!==old.side)return 'CLEAR';
 // Keep one issued twelve-bar forecast across intervening M15 closes.
 // Actual outcomes are compared against its ORIGINAL issued timestamps.
 if(old.anchorTime!=null&&now<old.anchorTime+12*900000)
   return 'HOLD';
 if(old.closedTime!==closedTime)return 'REBUILD';
 return 'HOLD';
}

/** A new candle may request a replacement without blanking the valid old route.
 * The retained snapshot is bounded and never survives an explicit invalidation. */
export function retainM15Snapshot(decision:FreezeDecision,old:FrozenPlanState|null,
 asset:'GOLD'|'BTC',now:number){
 return Boolean(old&&old.asset===asset&&decision!=='CLEAR'&&
   Number.isFinite(now)&&now>=old.createdAt&&now>=old.closedTime+900000&&
   (old.anchorTime!=null?now-old.anchorTime<12*900000:
     now-old.closedTime<=45*60000));
}
