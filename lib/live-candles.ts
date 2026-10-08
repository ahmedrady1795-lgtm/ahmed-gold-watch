import type {Candle} from './engine';
export type LiveBars={lastAt:number;bars:(Candle&{complete:boolean;lastTickAt:number})[]};
export function ingestLiveCandle(state:LiveBars,at:number,price:number){
  if(!Number.isFinite(at)||!Number.isFinite(price)||price<=0||at<=state.lastAt)return;
  const bucket=Math.floor(at/60000)*60000,last=state.bars.at(-1),gap=state.lastAt>0?at-state.lastAt:Infinity;
  if(last&&last.time===bucket){
    last.high=Math.max(last.high,price);last.low=Math.min(last.low,price);last.close=price;
    last.lastTickAt=at;if(gap>10000)last.complete=false;
  }else{
    // A mid-minute socket start is incomplete. Full bars require coverage on both sides of the boundary.
    const complete=Boolean(last&&last.time===bucket-60000&&gap<=10000&&at-bucket<=10000);
    state.bars.push({time:bucket,open:price,high:price,low:price,close:price,complete,lastTickAt:at});
    state.bars=state.bars.slice(-120);
  }
  state.lastAt=at;
}
export function completedLiveCandles(state:LiveBars,now:number){
  return state.bars.filter(c=>c.complete&&c.time+60000<=now&&c.time+60000-c.lastTickAt<=10000).map(({complete,lastTickAt,...c})=>c);
}
