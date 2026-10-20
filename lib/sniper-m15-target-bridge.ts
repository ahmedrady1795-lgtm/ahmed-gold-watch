/**
 * VISUAL ONLY: connect a fixed 12-bar analogue to already-frozen price goals.
 * These extra candles are a conditional price-space illustration, NOT a timed
 * M15 forecast, live quote, backtest result, or evidence of target reach.
 * Never feed this output into sniper scoring or the forward-proof ledger.
 */
export type M15DrawingBar={open:number;high:number;low:number;close:number};
type FrozenGoal={stage:number;price:number};
export function extendIllustrativeM15ToTargets(input:{
  model:readonly M15DrawingBar[];goals:readonly FrozenGoal[];
  side:'BUY'|'SELL';atr:number|null;stop?:number|null;
  maxCandles?:number;
}):{bars:M15DrawingBar[];connectedStages:number[];added:number;complete:boolean}{
  const model=input.model;
  if(!model.length||model.some((b,i)=>
    ![b.open,b.high,b.low,b.close].every(Number.isFinite)||
    b.low<=0||b.high<Math.max(b.open,b.close)||
    b.low>Math.min(b.open,b.close)||
    (i>0&&Math.abs(b.open-model[i-1].close)>1e-6)))
    return {bars:[],connectedStages:[],added:0,complete:false};
  const dir=input.side==='BUY'?1:-1;
  const validGoals=input.goals.length>0&&input.goals.every((g,i)=>
    Number.isInteger(g.stage)&&g.stage>0&&Number.isFinite(g.price)&&g.price>0&&
    (i===0||dir*(g.price-input.goals[i-1].price)>0));
  if(!validGoals)return {bars:[...model],connectedStages:[],added:0,complete:false};
  const bars:M15DrawingBar[]=model.map(b=>({...b}));
  const connectedStages:number[]=[];
  const atr=Number.isFinite(input.atr)&&input.atr!>0?input.atr!:
    Math.max(.00001,...model.map(b=>b.high-b.low));
  const maxCandles=Math.max(model.length,Math.min(96,Math.floor(input.maxCandles??84)));
  const pattern=[1.05,1.25,.85,-.24,1.34,.95,1.16,1.10];
  for(const goal of input.goals){
    if(bars.some(b=>b.low<=goal.price&&goal.price<=b.high)){
      connectedStages.push(goal.stage);
      continue;
    }
    const cursor=bars.at(-1)!.close;
    const distance=dir*(goal.price-cursor);
    if(distance<=0)break;
    // A large target may require more display slots; never scale a single
    // candle body into an enormous move merely to reach a label.
    const bodyUnit=Math.max(atr*.53,cursor*.000001);
    const count=Math.max(5,Math.ceil(distance/bodyUnit*1.65));
    if(bars.length+count>maxCandles)break;
    const weights=Array.from({length:count},(_,i)=>pattern[i%pattern.length]);
    const sum=weights.reduce((a,b)=>a+b,0);
    let traveled=0,prev=cursor;
    for(let i=0;i<count;i++){
      traveled+=weights[i];
      const close=i===count-1?goal.price:cursor+dir*distance*traveled/sum;
      const wick=Math.max(cursor*.0000003,Math.min(atr*.12,Math.abs(close-prev)*.35+atr*.035));
      let high=Math.max(prev,close)+wick;
      let low=Math.max(.000001,Math.min(prev,close)-wick);
      // Do not let illustrative wicks visually break the original stop.
      if(input.stop!=null&&Number.isFinite(input.stop)){
        if(dir>0)low=Math.max(low,input.stop+Math.max(.000001,atr*.001));
        else high=Math.min(high,input.stop-Math.max(.000001,atr*.001));
      }
      if(low>Math.min(prev,close)||high<Math.max(prev,close))break;
      bars.push({open:prev,high,low,close});
      prev=close;
    }
    if(bars.some(b=>b.low<=goal.price&&goal.price<=b.high))
      connectedStages.push(goal.stage);
    else break;
  }
  return {bars,connectedStages,added:bars.length-model.length,
    complete:connectedStages.length===input.goals.length};
}
