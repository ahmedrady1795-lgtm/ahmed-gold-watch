// Evidence-only fast lane for Binance Spot. One fresh reading is a WATCH,
// two independent readings are needed for "persistent flow" confirmation.
import type {Candidate,Spot24hOutlook} from './spot-radar';
export function isSpotFastLane(coin:Candidate):boolean{
  return coin.volume24h>=1_500_000&&coin.change24h>=-8&&coin.change24h<12&&
    coin.change15m>=-.8&&coin.change15m<4&&
    coin.buyShare>=.54&&coin.volumeImpulse>=1.4&&
    coin.flowDelta5m>=Math.max(1000,coin.volume24h*.00025)&&
    !coin.trapRisk&&!!coin.book&&coin.book.bidShare>=.51&&
    coin.book.spreadBps>0&&coin.book.spreadBps<=24;
}
export function rankSpotFastLane(coin:Candidate,outlook:Spot24hOutlook,boost=0):Spot24hOutlook{
  // Only the SCORE-based 24h veto can be bypassed, never a real trap or chase.
  const fastLane=isSpotFastLane(coin)&&outlook.hourlyChange24<16&&!outlook.hardVeto;
  const rankScore=Math.min(100,Math.max(0,outlook.rankScore+boost+(fastLane?8:0)));
  const high=rankScore>=63&&outlook.takerBuyShare12>=.515&&
    outlook.volumeRatio24>=.85&&coin.buyShare>=.51;
  const state:Spot24hOutlook['state']=outlook.hardVeto?'AVOID':
    high?'HIGH':rankScore>=38||fastLane?'POSSIBLE':'AVOID';
  return {...outlook,rankScore,state,fastLane,reason:fastLane&&state!=='AVOID'?
    ['التقاط مبكر: شراء Spot منفّذ مع تسارع التداول',outlook.reason].filter(Boolean).join(' · '):
    outlook.reason};
}
