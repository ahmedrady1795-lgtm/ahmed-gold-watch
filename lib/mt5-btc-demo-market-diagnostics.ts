import type {BtcDemoMarketDecision} from './mt5-btc-demo-market-plan';

type Observation={time:number;reason:string};
const events:Observation[]=[];
const TIME_MS=10*60000;
export function recordBtcDemoMarketDecision(d:BtcDemoMarketDecision,now=Date.now()){
  events.push({time:now,reason:d.ready?'CANDIDATE_READY':d.reason});
  while(events.length&&events[0].time<now-TIME_MS)events.shift();
  if(events.length>300)events.splice(0,events.length-300);
}
export function btcDemoMarketStats(now=Date.now()){
  while(events.length&&events[0].time<now-TIME_MS)events.shift();
  const counts=new Map<string,number>();
  for(const e of events)counts.set(e.reason,(counts.get(e.reason)||0)+1);
  return {windowMinutes:10,observations:events.length,
    lastCheckedAt:events.at(-1)?.time??null,
    lastDecision:events.at(-1)?.reason??'NO_MARKET_EA_POLLS_YET',
    topReasons:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([reason,count])=>({reason,count}))};
}
