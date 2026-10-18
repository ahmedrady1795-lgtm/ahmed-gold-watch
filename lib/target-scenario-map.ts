/** Target-conditioned illustration, NEVER a prediction or a scored TP outcome. */
type Shape={open:number;high:number;low:number;close:number};
export function buildTargetScenarioMap(history:readonly Shape[],anchor:number|null,
  side:string,targets:readonly {stage:number;price:number}[],stop:number|null){
  const source=history.slice(-36).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&
    c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
  const sign=side==='BUY'?1:side==='SELL'?-1:0;
  if(source.length<24||!sign||anchor==null||!Number.isFinite(anchor)||anchor<=0)return null;
  if(stop!=null&&(!Number.isFinite(stop)||stop<=0||sign*(anchor-stop)<=0))return null;
  const goals=targets.filter(t=>Number.isFinite(t.price)&&t.price>0);
  if(!goals.length||goals.some((t,i)=>sign*(t.price-(i?goals[i-1].price:anchor))<=0))return null;
  const sizes=source.map(c=>Math.abs(c.close-c.open)).sort((a,b)=>a-b);
  const unit=sizes[Math.floor(sizes.length*.65)];
  if(unit<=anchor*.000001)return null;
  const bars:Shape[]=[];const markers:{stage:number;price:number;index:number}[]=[];
  let price=anchor;
  for(const goal of goals){
    while(sign*(goal.price-price)>unit*.000001&&bars.length<480){
      const sample=source[bars.length%source.length];
      const magnitude=Math.min(sizes.at(-1)!,Math.max(unit*.35,Math.abs(sample.close-sample.open)));
      // Small pullbacks between advances, bounded by the original invalidation.
      const pullback=bars.length%6===4&&sign*(price-anchor)>unit*2;
      let delta=pullback?-sign*magnitude*.55:sign*Math.min(magnitude,Math.abs(goal.price-price));
      if(stop!=null&&sign*(price+delta-stop)<=unit)delta=sign*Math.min(magnitude,Math.abs(goal.price-price));
      const close=price+delta;
      let high=Math.max(price,close)+(sample.high-Math.max(sample.open,sample.close));
      let low=Math.min(price,close)-(Math.min(sample.open,sample.close)-sample.low);
      if(stop!=null){if(sign>0)low=Math.max(low,stop+unit*.01);else high=Math.min(high,stop-unit*.01);}
      bars.push({open:price,close,high,low});price=close;
    }
    if(Math.abs(price-goal.price)<=unit*.000001)markers.push({...goal,index:bars.length-1});
    else break;
  }
  return {bars,markers,complete:markers.length===goals.length};
}
