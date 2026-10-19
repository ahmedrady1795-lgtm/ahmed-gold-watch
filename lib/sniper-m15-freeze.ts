import type {M15Side} from './sniper-m15-scenario';
/**
 * Stable on-chart projection gate, independent of trade execution.
 * HOLD on every quote tick. REBUILD only on a NEW closed M15 bar.
 * CLEAR immediately if stop, freshness, market or structure invalidates.
 */
export type FrozenPlanState={
 asset:'GOLD'|'BTC';closedTime:number;side:Exclude<M15Side,'WAIT'>;
 stop:number|null;createdAt:number
};
export type FreezeDecision='CLEAR'|'HOLD'|'REBUILD';
export function frozenM15Decision(input:{
 old:FrozenPlanState|null;asset:'GOLD'|'BTC';closedTime:number;
 quote:number|null;fresh:boolean;marketOpen:boolean;now:number;
 opposingBosConfirmedAt?:number|null;opposingBosSide?:'BUY'|'SELL'|null
}):FreezeDecision{
 const {old,asset,closedTime,quote,now}=input;
 if(!input.fresh||!input.marketOpen||quote==null||
   !Number.isFinite(quote)||quote<=0||!Number.isFinite(now)||
   !Number.isFinite(closedTime)||closedTime<=0||
   now<closedTime+900000||now-closedTime>45*60000)return 'CLEAR';
 if(!old||old.asset!==asset)return 'REBUILD';
 if(old.stop!=null&&Number.isFinite(old.stop)&&
   (old.side==='BUY'?quote<=old.stop:quote>=old.stop))return 'CLEAR';
 if(input.opposingBosConfirmedAt!=null&&
   input.opposingBosConfirmedAt>old.createdAt&&
   input.opposingBosSide!=null&&
   input.opposingBosSide!==old.side)return 'CLEAR';
 if(old.closedTime!==closedTime)return 'REBUILD';
 return 'HOLD';
}
