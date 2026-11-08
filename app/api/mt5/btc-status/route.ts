import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BtcStatus,getMt5BtcVerifiedSnapshot,setMt5BtcStatus} from '../../../../lib/mt5-btc-readonly';
import {planBtcDemoEveryCandle} from '../../../../lib/mt5-btc-demo-plan';
import {btcDemoWaitStats} from '../../../../lib/mt5-btc-demo-diagnostics';
import {planBtcDemoMarket} from '../../../../lib/mt5-btc-demo-market-plan';
import {btcDemoMarketStats} from '../../../../lib/mt5-btc-demo-market-diagnostics';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let n=0;
  for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);
  return n===0;
}
export async function POST(request:Request){
  const token=getRuntimeEnv().MT5_BRIDGE_TOKEN;
  const auth=request.headers.get('authorization')||'';
  if(!token||!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),token))
    return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  try{
    const incoming=await request.json();
    const received=setMt5BtcStatus(incoming);
    return Response.json({ok:true,receivedAt:Date.now(),symbol:received.status?.symbol,
      fresh:received.fresh,candlesFresh:received.candlesFresh},
      {headers:{'Cache-Control':'no-store'}});
  }catch{
    return Response.json({ok:false,code:'BAD_BTC_BROKER_STATUS'},
      {status:400,headers:{'Cache-Control':'no-store'}});
  }
}
export async function GET(){
  const now=Date.now();
  const status=getMt5BtcStatus(now);
  const verified=getMt5BtcVerifiedSnapshot(now);
  // The public read-only status shows WAIT reasons, never actual order levels.
  // Actual broker order placement still requires the authenticated signal
  // endpoint, confirmed DEMO account, and the locally enabled MT5 EA.
  const decision=planBtcDemoEveryCandle(verified,now);
  const market=planBtcDemoMarket(verified,now);
  const m1=verified?.candles.c1??[];
  let atrM1:number|null=null;
  if(m1.length>=15){
    let sum=0;
    for(let i=m1.length-14;i<m1.length;i++){
      const row=m1[i],prev=m1[i-1];
      sum+=Math.max(row.high-row.low,Math.abs(row.high-prev.close),
        Math.abs(row.low-prev.close));
    }
    atrM1=Math.round(sum/14*100)/100;
  }
  const spread=verified?Math.round((verified.ask-verified.bid)*100)/100:null;
  const ratio=atrM1!==null&&spread!==null&&spread>0?
    Math.round(atrM1/spread*100)/100:null;
  return Response.json({
    ok:true,executionEnabled:false,brokerSource:'Exness MT5 BTCUSD CFD',
    ...status,
    demoDiagnostics:{
      signalEnabled:getRuntimeEnv().MT5_BTC_DEMO_SIGNALS_ENABLED==='true',
      brokerCandlesVerified:Boolean(verified),
      candidateNow:decision.ready,
      demoEveryM1CandleMode:true,
      candidateStrategy:decision.ready?decision.strategy??null:null,
      waitReason:decision.ready?'CANDIDATE_READY':decision.reason,
      spreadUsd:spread,m1AtrUsd:atrM1,m1AtrToSpread:ratio,
      uniqueRecentTickSamples:verified?.ticks.length??0,
      lastClosedM1AgeMs:verified?.candles.c1.length?
        now-(verified.candles.c1.at(-1)!.time+60000):null,
      actualEaPolls:btcDemoWaitStats(now)
    },
    demoMarketDiagnostics:{
      marketSignalEnabled:getRuntimeEnv().MT5_BTC_DEMO_MARKET_SIGNALS_ENABLED==='true',
      candidateNow:market.ready,
      waitReason:market.ready?'CANDIDATE_READY':market.reason,
      actualMarketEaPolls:btcDemoMarketStats(now)
    }
  },{headers:{'Cache-Control':'private, no-store'}});
}
