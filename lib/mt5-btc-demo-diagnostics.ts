import type {BtcDemoDecision} from './mt5-btc-demo-plan';

// In-memory, bounded diagnostics only. No tokens, account details, trade
// levels, order instructions or personally identifiable information.
type Observation={at:number;reason:string};
const recent:Observation[]=[];
const MAX_EVENTS=300;
const WINDOW_MS=10*60*1000;
const trim=(now:number)=>{
  while(recent.length&&recent[0].at<now-WINDOW_MS)recent.shift();
  if(recent.length>MAX_EVENTS)recent.splice(0,recent.length-MAX_EVENTS);
};
export function recordBtcDemoSignalDecision(decision:BtcDemoDecision,now=Date.now()){
  const reason=decision.ready?'CANDIDATE_READY':decision.reason;
  recent.push({at:now,reason});
  trim(now);
}
export function btcDemoWaitStats(now=Date.now()){
  trim(now);
  const counts=new Map<string,number>();
  for(const x of recent)counts.set(x.reason,(counts.get(x.reason)||0)+1);
  const topReasons=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([reason,count])=>({reason,count}));
  return {windowMinutes:10,observations:recent.length,
    lastCheckedAt:recent.at(-1)?.at??null,
    lastDecision:recent.at(-1)?.reason??'NO_SIGNAL_POLLS_YET',
    topReasons};
}
