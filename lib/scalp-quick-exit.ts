// GOLD paper scalp only: freeze a small, cost-positive take-profit when the
// independent exact-entry audit has already authorized a reference fill.
// Never reuse these levels for live broker orders or pretend they are Exness fills.
export type GoldQuickPlan={
  asset:string;horizon:1|5;side:'BUY'|'SELL'|'WAIT';stop:number|null;
  targets:ReadonlyArray<{price:number}>;cost:number
};
export type GoldQuickExit={price:number;maxHoldMs:number;minimumNetR:number};
export const GOLD_QUICK_MIN_NET_R=0.30;
export function buildGoldQuickExit(plan:GoldQuickPlan,filledPrice:number):GoldQuickExit|null{
  if(plan.asset!=='GOLD'||(plan.side!=='BUY'&&plan.side!=='SELL')||
    !Number.isFinite(filledPrice)||filledPrice<=0||
    plan.stop==null||!Number.isFinite(plan.stop)||plan.stop<=0||
    !Number.isFinite(plan.cost)||plan.cost<=0)return null;
  const dir=plan.side==='BUY'?1:-1;
  const risk=dir*(filledPrice-plan.stop);
  const mainTarget=plan.targets[0]?.price;
  const mainReward=mainTarget==null?NaN:dir*(mainTarget-filledPrice);
  if(!Number.isFinite(risk)||risk<=0||!Number.isFinite(mainReward)||mainReward<=0)return null;
  // After estimated round-trip spread + fees + slip, aim for a positive
  // 0.30R paper gain. Do not set a micro target below the fee/slip cushion.
  const grossMove=plan.cost+Math.max((risk+plan.cost)*GOLD_QUICK_MIN_NET_R,plan.cost*.25);
  // Round away from entry; never round a theoretical win down to zero.
  const cents=dir===1?Math.ceil((filledPrice+grossMove)*100-1e-7):
    Math.floor((filledPrice-grossMove)*100+1e-7);
  const price=cents/100;
  const move=dir*(price-filledPrice);
  if(!Number.isFinite(price)||price<=0||move<=plan.cost||
    move>mainReward||move<=0)return null;
  return {price,maxHoldMs:plan.horizon===1?60_000:120_000,
    minimumNetR:GOLD_QUICK_MIN_NET_R};
}
