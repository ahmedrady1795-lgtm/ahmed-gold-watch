import {analyze,defaults,scalpAnalyze} from '../../../lib/engine';
import {getMarketSnapshot,getMarketData,getQuoteData,getMt5FastSignal} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {aiDecision} from '../../../lib/ai-analyst';
import {getBtcLiquidity} from '../../../lib/liquidity-intelligence';
import {getMotionIntelligence} from '../../../lib/motion-intelligence';
import {studyMarketBehavior} from '../../../lib/market-behavior';
import {masterArbitrate} from '../../../lib/master-arbiter';
import {buildHuntForecast} from '../../../lib/hunt-forecast';
import {trainScalpLearner} from '../../../lib/scalp-learning';
import {analyzeWaveStructure} from '../../../lib/wave-structure';
import {buildAccumulationMap} from '../../../lib/accumulation-map';
import {getMarketLearningSignal,recordMarketLearningObservation,recordFinalRecommendationOutcome} from '../../../lib/market-learning-core';
import {buildMarketStateGraph} from '../../../lib/market-state-graph';
import {evolveAnalysisPolicy,recordEvolutionAutopsy} from '../../../lib/self-evolution';
import {getExpectedMoveLearning,recordExpectedMoveObservation} from '../../../lib/expected-move-learning';
import {buildMovementIntelligence} from '../../../lib/movement-intelligence';
import {buildMultiBrainCore} from '../../../lib/multi-brain-core';
import {getMlPrediction} from '../../../lib/ml-prediction';
import {getNeuralPrediction} from '../../../lib/neural-prediction';
import {getBrainOutcomeLearning,recordBrainOutcomeObservation} from '../../../lib/brain-outcome-learning';
import {getServerTickSignal,startServerTickBrain} from '../../../lib/server-tick-brain';
import {buildNewsIntelligence} from '../../../lib/news-intelligence';
import {getWebMarketIntelligence,mergeNewsWithWeb,recordWebSourceOutcome} from '../../../lib/web-market-intelligence';
import {buildOpportunitySet} from '../../../lib/multi-opportunity';
import {buildScalpFusion} from '../../../lib/scalp-fusion';
import {recordNextMoveOutcome,getNextMoveOutcome,calibrateNextMoveConfidence} from '../../../lib/next-move-outcome';
import {buildGoldForecastCore} from '../../../lib/gold-forecast-core';
import {buildPredatorFusionV2} from '../../../lib/predator-fusion-v2';
import {getStructuralPathLearning,calibrateStructuralPathForecast,recordStructuralPathOutcome} from '../../../lib/structural-path-learning';
import {getHorizonBrainLearning,recordHorizonBrainOutcome} from '../../../lib/horizon-brain-learning';

export const dynamic='force-dynamic';
export const runtime='nodejs';
startServerTickBrain();
let lastDiagLog=0;
let lastAiPayload:any=null,lastAiPayloadAt=0,analysisBusy=false;
let stableGoldLiquidityState:{at:number;pressure:number;quality:number;side:'BUY'|'SELL'|'WAIT'}|null=null;
async function liveBtcSpot(){
  const now=Date.now();
  const providers=[
    async()=>{const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const price=Number(j?.price),sourceTime=Date.parse(j?.time);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad Coinbase Exchange btc');return {price,source:'Coinbase Exchange',sourceTime:Number.isFinite(sourceTime)?sourceTime:now};},
    async()=>{const r=await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const price=Number(j?.data?.amount);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad Coinbase Spot btc');return {price,source:'Coinbase Spot',sourceTime:now};},
    async()=>{const r=await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const row=Object.values(j?.result||{})[0] as any,price=Number(row?.c?.[0]);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad kraken live btc');return {price,source:'Kraken live ticker',sourceTime:now};}
  ];
  for(const provider of providers){try{return await provider();}catch{}}
  return null;
}
function goldMarketOpenUTC(now:number){
  const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours()+d.getUTCMinutes()/60;
  if(day===6)return false;
  if(day===0&&h<22)return false;
  if(day===5&&h>=21)return false;
  if(day>=1&&day<=4&&h>=21&&h<22)return false;
  return true;
}
function atrNow(c:any[]){
  const x=c.slice(-15);if(x.length<3)return null;let sum=0,n=0;
  for(let i=1;i<x.length;i++){const tr=Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close));if(Number.isFinite(tr)){sum+=tr;n++;}}
  return n?sum/n:null;
}
function alignGoldMarketToAnchor(market:any,anchorPrice:number|null){
  const p=Number(anchorPrice),last=Number(market?.c1?.at?.(-1)?.close),src=String(market?.priceSource||'');
  const proxy=/Yahoo Finance|GC=F|COMEX/i.test(src);
  if(!proxy||!Number.isFinite(p)||p<=0||!Number.isFinite(last)||last<=0)return {market,basisOffset:0,basisBps:0,aligned:false};
  const offset=p-last,bps=Math.abs(offset)/p*10000;
  if(!Number.isFinite(offset)||bps>350)return {market,basisOffset:0,basisBps:Number(bps.toFixed(1)),aligned:false};
  const shift=(rows:any[])=>Array.isArray(rows)?rows.map((c:any)=>({
    ...c,
    open:Number(c.open)+offset,
    high:Number(c.high)+offset,
    low:Number(c.low)+offset,
    close:Number(c.close)+offset
  })):[];
  return {
    market:{...market,c1:shift(market.c1),c5:shift(market.c5),c15:shift(market.c15),c60:shift(market.c60),priceSource:src+' · basis-aligned to XAU spot'},
    basisOffset:Number(offset.toFixed(4)),
    basisBps:Number(bps.toFixed(1)),
    aligned:true
  };
}

function candleLiquidityProxy(c1:any[],price:number|null){
  const rows=(Array.isArray(c1)?c1:[]).slice(-14);
  if(rows.length<5)return {pressure:0,quality:0,side:'WAIT' as const,volumeScore:0,flow:0,momentum:0,valid:false};
  let signed=0,totalVol=0,volSeen=0,validBars=0;
  for(const c of rows){
    const o=Number(c?.open),h=Number(c?.high),l=Number(c?.low),cl=Number(c?.close);
    if(![o,h,l,cl].every(Number.isFinite)||h<=l)continue;
    validBars++;
    const vol=Math.max(1,Number(c?.realVolume||c?.tickVolume||1));
    const body=(cl-o)/(h-l);
    signed+=body*vol;totalVol+=vol;if(Number(c?.realVolume||c?.tickVolume)>0)volSeen++;
  }
  if(validBars<5)return {pressure:0,quality:0,side:'WAIT' as const,volumeScore:0,flow:0,momentum:0,valid:false};
  const last=Number(rows.at(-1)?.close),old=Number(rows.at(-5)?.close);
  const flow=totalVol>0?signed/totalVol*100:0;
  const momentum=Number.isFinite(last)&&Number.isFinite(old)&&old>0?(last-old)/old*10000:0;
  const pressure=Math.max(-44,Math.min(44,flow*.72+momentum*1.7));
  const quality=Math.round(Math.max(48,Math.min(72,44+Math.min(12,validBars)+Math.min(16,volSeen*2))));
  const side=pressure>=6?'BUY':pressure<=-6?'SELL':'WAIT';
  const volumeScore=Math.round(Math.max(22,Math.min(74,Math.abs(flow)*.55+quality*.55)));
  return {
    pressure:Number(pressure.toFixed(1)),quality,side,volumeScore,
    flow:Number(flow.toFixed(1)),momentum:Number(momentum.toFixed(2)),valid:true
  };
}
function stabilizeGoldLiquidity(_raw:any,c1:any[],price:number|null,now=Date.now()){
  const proxy=candleLiquidityProxy(c1,price);
  const prev=stableGoldLiquidityState;
  const age=prev?Math.max(0,now-prev.at):Infinity;
  const holdMs=5*60*1000;
  let pressure=0,quality=48,heldLastGood=false;

  if(proxy.valid){
    const target=Number(proxy.pressure||0);
    pressure=target;
    if(prev&&age<holdMs){
      const alpha=.42;
      pressure=prev.pressure*(1-alpha)+target*alpha;
      if(Math.abs(target)<3&&Math.abs(prev.pressure)>=6)pressure=prev.pressure*.82+target*.18;
      const flipsSign=Math.sign(prev.pressure)!==0&&Math.sign(target)!==0&&Math.sign(prev.pressure)!==Math.sign(target);
      if(flipsSign&&Math.abs(target)<10)pressure=prev.pressure*.64+target*.36;
    }
    quality=Math.max(55,Number(proxy.quality||0));
  }else if(prev&&age<holdMs){
    pressure=prev.pressure;
    quality=Math.max(50,prev.quality-Math.floor(age/60000)*2);
    heldLastGood=true;
  }

  pressure=Math.max(-72,Math.min(72,pressure));
  const side=pressure>=6?'BUY':pressure<=-6?'SELL':'WAIT';
  const buy=Math.round(Math.max(12,Math.min(88,50+pressure/2))),sell=100-buy;
  const stableSide=(side==='BUY'||side==='SELL')?side:(prev&&age<holdMs?prev.side:'WAIT');
  if(proxy.valid){
    stableGoldLiquidityState={at:now,pressure,quality,side:stableSide};
  }else if(prev&&age<holdMs){
    stableGoldLiquidityState=prev;
  }

  return {
    ok:Boolean(proxy.valid||prev&&age<holdMs),
    mode:'BIQUOTE_CANDLE_FLOW',
    source:'Biquote · XAU/USD candle-volume',
    checkedAt:now,
    quality,
    side,
    buy,
    sell,
    strength:Math.max(50,buy,sell,Number(proxy.volumeScore||0)),
    pressure:Number(pressure.toFixed(1)),
    stable:true,
    singleSource:true,
    heldLastGood,
    proxy:{side:proxy.side,pressure:proxy.pressure,quality:proxy.quality,volumeScore:proxy.volumeScore},
    lastKnownGoodAgeMs:prev&&age<holdMs?age:null,
    book:{
      bestBid:null,bestAsk:null,spreadBps:0,bboImbalance:0,depthImbalance:0,
      weightedImbalance:0,microprice:null,microEdge:0,bidDepthUsd:0,askDepthUsd:0,
      bidWall:1,askWall:1,wallSide:'WAIT'
    },
    flow:{
      tradeCount:0,buyVolume:0,sellVolume:0,deltaVolume:0,
      deltaPct:Number(proxy.flow||0),priceChangeBps:Number(proxy.momentum||0),cvdSide:side
    },
    dynamics:{pressureChange:0,bidDepthChangePct:0,askDepthChangePct:0,acceleration:0},
    absorption:{side:'WAIT',score:0,reason:'Biquote single-source candle flow',trapDetected:false,followThrough:false},
    warnings:heldLastGood?['Biquote candle update delayed briefly; holding last valid liquidity reading']:[],
  };
}

function goldMicroFromMt5(mt5:any,tick:any,quote:any,price:number|null,c1:any[]=[]){
  const status=mt5?.status||null,book=status?.microstructure?.orderBook||null;
  const bids=(Array.isArray(book?.bids)?book.bids:[]).map((x:any)=>({price:Number(x?.price),volume:Number(x?.volume)})).filter((x:any)=>x.price>0&&x.volume>0).slice(0,16);
  const asks=(Array.isArray(book?.asks)?book.asks:[]).map((x:any)=>({price:Number(x?.price),volume:Number(x?.volume)})).filter((x:any)=>x.price>0&&x.volume>0).slice(0,16);
  const sum=(rows:any[])=>rows.reduce((s:number,x:any)=>s+x.volume,0);
  const weighted=(rows:any[])=>rows.reduce((s:number,x:any,i:number)=>s+x.volume/(1+i*.35),0);
  const bidVol=sum(bids),askVol=sum(asks),total=bidVol+askVol;
  const wBid=weighted(bids),wAsk=weighted(asks),wTotal=wBid+wAsk;
  const bestBid=Number(quote?.bid)>0?Number(quote.bid):Number(bids[0]?.price||0);
  const bestAsk=Number(quote?.ask)>0?Number(quote.ask):Number(asks[0]?.price||0);
  const mid=bestBid>0&&bestAsk>=bestBid?(bestBid+bestAsk)/2:Number(price||0);
  const spread=bestAsk>bestBid?bestAsk-bestBid:0;
  const depthImbalance=total>0?(bidVol-askVol)/total*100:0;
  const weightedImbalance=wTotal>0?(wBid-wAsk)/wTotal*100:depthImbalance;
  const topBid=Number(bids[0]?.volume||0),topAsk=Number(asks[0]?.volume||0),topTotal=topBid+topAsk;
  const bboImbalance=topTotal>0?(topBid-topAsk)/topTotal*100:depthImbalance;
  const microprice=bestBid>0&&bestAsk>0&&topTotal>0?(bestAsk*topBid+bestBid*topAsk)/topTotal:mid;
  const microEdge=spread>0&&Number.isFinite(microprice)?Math.max(-100,Math.min(100,(microprice-mid)/spread*200)):0;
  const bookReady=Boolean(mt5?.fresh&&bids.length&&asks.length&&bestBid>0&&bestAsk>0);
  const fastImbalance=Number(tick?.bookImbalance||0);
  const tickSide=tick?.side==='BUY'||tick?.side==='SELL'?tick.side:'WAIT';
  const tickConfidence=Math.max(0,Math.min(90,Number(tick?.confidence||0)));
  const tickPersistence=Math.max(0,Math.min(100,Number(tick?.persistence||0)));
  const pulseSigned=tickSide==='BUY'?1:tickSide==='SELL'?-1:0;
  const pulsePressure=pulseSigned*Math.min(46,tickConfidence*.34+Math.max(0,tickPersistence-50)*.24+Math.abs(Number(tick?.acceleration||0))*260);
  const pressure=bookReady?Math.max(-100,Math.min(100,weightedImbalance*.72+fastImbalance*.28)):Math.max(-46,Math.min(46,pulsePressure));
  const buy=Math.round(Math.max(5,Math.min(95,50+pressure/2))),sell=100-buy;
  const quality=bookReady?92:(tick?.ok?52:38);
  const accel=Math.max(-100,Math.min(100,Number(tick?.acceleration||0)*100));
  const pressureChange=bookReady?Math.max(-100,Math.min(100,Number(tick?.pressureChange||0))):0;
  const bidDepthChangePct=bookReady?Math.max(-100,Math.min(100,Number(tick?.bidDepthChangePct||0))):0;
  const askDepthChangePct=bookReady?Math.max(-100,Math.min(100,Number(tick?.askDepthChangePct||0))):0;
  const priceChangeBps=Number(tick?.velocity3s||tick?.velocity4s||0);
  const rawLiquidity={
    ok:bookReady,mode:bookReady?'DOM':'QUOTE_FLOW',source:bookReady?'Exness/MT5 DOM':'Biquote XAU/USD quote-flow · no DOM',checkedAt:Date.now(),quality,
    side:pressure>=10?'BUY':pressure<=-10?'SELL':'WAIT',buy,sell,strength:Math.max(buy,sell),pressure:Number(pressure.toFixed(1)),
    book:{
      bestBid:bestBid||null,bestAsk:bestAsk||null,spreadBps:mid>0&&spread>0?spread/mid*10000:0,
      bboImbalance:Number(bboImbalance.toFixed(1)),depthImbalance:Number(depthImbalance.toFixed(1)),weightedImbalance:Number(weightedImbalance.toFixed(1)),
      microprice:Number.isFinite(microprice)&&microprice>0?Number(microprice.toFixed(3)):null,microEdge:Number(microEdge.toFixed(1)),
      bidDepthUsd:bids.reduce((s:number,x:any)=>s+x.price*x.volume,0),askDepthUsd:asks.reduce((s:number,x:any)=>s+x.price*x.volume,0),
      bidWall:1,askWall:1,wallSide:weightedImbalance>=12?'BUY':weightedImbalance<=-12?'SELL':'WAIT'
    },
    flow:{tradeCount:0,buyVolume:0,sellVolume:0,deltaVolume:0,deltaPct:0,priceChangeBps:Number(priceChangeBps.toFixed(2)),cvdSide:'WAIT'},
    dynamics:{
      pressureChange:Number(pressureChange.toFixed(1)),
      bidDepthChangePct:Number(bidDepthChangePct.toFixed(1)),
      askDepthChangePct:Number(askDepthChangePct.toFixed(1)),
      acceleration:Number(accel.toFixed(1))
    },
    absorption:{side:'WAIT',score:0,reason:'Gold DOM / stable quote-flow helper',trapDetected:false,followThrough:false},
    warnings:bookReady?[]:['Exness/MT5 DOM unavailable; stable quote-flow fallback active']
  };
  const liquidity=stabilizeGoldLiquidity(rawLiquidity,c1,price,Date.now());
  const precursorCount=[
    bookReady&&Math.abs(weightedImbalance)>=10,
    bookReady&&Math.abs(Number(tick?.pressureChange||0))>=5,
    bookReady&&Math.abs(Number(tick?.replenishDelta||0))>=7,
    Math.abs(Number(tick?.acceleration||0))>=.018,
    Number(tick?.persistence||0)>=58,
    String(tick?.stage||'')==='PRE_TRIGGER'
  ].filter(Boolean).length;
  const motionSide=tick?.side==='BUY'||tick?.side==='SELL'?tick.side:'WAIT';
  const motion={
    ok:Boolean(tick?.ok),side:motionSide,
    stage:String(tick?.stage||'WAIT')==='BUILDING'?'WAVE_FORMING':String(tick?.stage||'WAIT'),
    score:Number(tick?.score||0),confidence:Number(tick?.confidence||0),
    components:{compression:Math.abs(Number(tick?.velocity15s||0))<=.45?68:28},
    diagnostics:{precursorCount,velocity1s:Number(tick?.velocity1s||0),velocity3s:Number(tick?.velocity3s||0),velocity8s:Number(tick?.velocity8s||0),persistence:Number(tick?.persistence||0),bookImbalance:Number(tick?.bookImbalance||0)}
  };
  return {liquidity,motion};
}

function buildRecommendation(master:any,hunt:any,price:number|null,now:number,nextMoveLive?:any){
  const action=master?.action==='BUY'||master?.action==='SELL'?master.action:'WAIT';
  if(action==='WAIT'||master?.state!=='TRADE'){
    return {active:false,action:'WAIT',confidence:0,entry:price??null,invalidation:null,targets:{scalp:null,oneMinute:null,fiveMinute:null,fifteenMinute:null},expiresAt:null,reasons:[]};
  }
  const q=Number(hunt?.quality??hunt?.confidence??0),next=Number(hunt?.nextMove?.confidence||0),core=Number(master?.evidence?.confidence||0),move=Number(hunt?.movementIntelligence?.confidence||0);
  const wfStatus=String(nextMoveLive?.walkForward?.status||'COLLECTING');
  const wfOosAcc=Number(nextMoveLive?.walkForward?.oos?.accuracy);
  const wfOosN=Number(nextMoveLive?.walkForward?.oos?.n||0);
  const wfDrift=String(nextMoveLive?.walkForward?.drift?.status||'COLLECTING');
  const nextPromotion=wfStatus==='PASS'&&wfOosN>=10&&Number.isFinite(wfOosAcc)&&wfOosAcc>=55&&wfDrift!=='DEGRADING';
  const nextWeight=nextPromotion?.25:wfStatus==='WATCH'?.08:.12;
  let confidence=q*(.42+(.25-nextWeight)*.55)+next*nextWeight+core*.18+move*(.15+(.25-nextWeight)*.45);
  if(hunt?.movementIntelligence?.side===action)confidence+=4;
  if(hunt?.strongMove?.side===action)confidence+=4;
  if(hunt?.expectedMoveCore?.conflict)confidence-=12;
  if(hunt?.liveFailureGuard?.invalidated)confidence-=24;
  if(hunt?.side&&hunt.side!=='WAIT'&&hunt.side!==action)confidence-=8;
  if(wfStatus==='WATCH')confidence-=3;
  if(wfDrift==='DEGRADING')confidence-=7;
  if(Number.isFinite(wfOosAcc)&&wfOosN>=10&&wfOosAcc<50)confidence-=4;
  if(master?.conflict)confidence=0;
  confidence=Math.max(0,Math.min(92,Math.round(confidence)));
  const aligned=(x:any)=>x?.side===action&&Number.isFinite(Number(x?.price))?Number(x.price):null;
  const t=hunt?.quickSignalTargets||{};
  const fifteen=hunt?.fifteenMinuteTarget?.side===action&&Number.isFinite(Number(hunt?.fifteenMinuteTarget?.price))?Number(hunt.fifteenMinuteTarget.price):null;
  return {
    active:true,action,confidence,entry:Number.isFinite(Number(price))?Number(price):null,
    invalidation:Number.isFinite(Number(hunt?.invalidation))?Number(hunt.invalidation):null,
    targets:{scalp:aligned(t?.scalp),oneMinute:aligned(t?.oneMinute),fiveMinute:aligned(t?.fiveMinute),fifteenMinute:fifteen},
    expiresAt:now+5*60000,
    reasons:[
      ...(Array.isArray(hunt?.reasons)?hunt.reasons.slice(0,3):[]),
      'Next-Move OOS '+wfStatus+' · '+(Number.isFinite(wfOosAcc)?wfOosAcc.toFixed(1):'—')+'% · '+(nextPromotion?'PROMOTED':'SHADOW')
    ],
    nextMoveValidation:{status:wfStatus,oosAccuracy:Number.isFinite(wfOosAcc)?wfOosAcc:null,oosN:wfOosN,drift:wfDrift,promoted:nextPromotion,weight:Number(nextWeight.toFixed(2))}
  };
}
function waveFromParams(url:URL,prefix:'b'|'g',now:number){
  const side=url.searchParams.get(prefix+'s'),stage=url.searchParams.get(prefix+'st'),score=Number(url.searchParams.get(prefix+'sc')),confidence=Number(url.searchParams.get(prefix+'cf')),at=Number(url.searchParams.get(prefix+'at'));
  if(!['BUY','SELL','WAIT'].includes(String(side))||!['WARMING','COILED','PRE_TRIGGER','WAVE_FORMING','IGNITION'].includes(String(stage))||!Number.isFinite(score)||!Number.isFinite(confidence)||!Number.isFinite(at)||score<0||score>92||confidence<0||confidence>88||now-at<0||now-at>3500)return null;
  return {ok:true,side,stage,score,confidence,at,source:'browser live WebSocket'};
}
function goldLiveFromParams(url:URL,external:any,candlePrice:any,now:number){
  const price=Number(url.searchParams.get('gp')),bid=Number(url.searchParams.get('gb')),ask=Number(url.searchParams.get('ga'));
  const sourceTime=Number(url.searchParams.get('gt')),receivedAt=Number(url.searchParams.get('gr')||sourceTime);
  const mode=String(url.searchParams.get('gmode')||'external');
  const rawStatus=String(url.searchParams.get('gstatus')||'unknown');
  if(!['broker','stream','external','analysis_proxy'].includes(mode)||!Number.isFinite(price)||price<=0||!Number.isFinite(receivedAt)||receivedAt<=0||now-receivedAt<0||now-receivedAt>10000)return null;
  const ext=Number(external?.price),candle=Number(candlePrice);
  const reference=mode==='analysis_proxy'?(Number.isFinite(candle)&&candle>0?candle:ext):(Number.isFinite(ext)&&ext>0?ext:candle);
  if(Number.isFinite(reference)&&reference>0){
    const deviationBps=Math.abs(price-reference)/reference*10000;
    const maxDeviation=mode==='analysis_proxy'?90:45;
    if(deviationBps>maxDeviation)return null;
  }
  const validBook=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid&&price>=bid&&price<=ask;
  const status:'live'|'delayed'|'closed_or_stale'|'unknown'=(mode==='broker'||mode==='stream')
    ?'live'
    :mode==='analysis_proxy'
      ?(rawStatus==='closed_or_stale'?'closed_or_stale':'delayed')
      :(rawStatus==='live'||rawStatus==='delayed'||rawStatus==='closed_or_stale'||rawStatus==='unknown'?rawStatus:'unknown');
  return {
    ok:true as const,symbol:'XAU/USD' as const,price,
    source:mode==='broker'?'Exness/MT5 live tick':mode==='stream'?'Biquote MT5 XAUUSD live stream':mode==='analysis_proxy'?'Browser-synced analytical Gold fallback':'Browser-synced XAU/USD external quote',
    sourceTime:Number.isFinite(sourceTime)&&sourceTime>0?sourceTime:receivedAt,fetchedAt:receivedAt,status,
    previousClose:external?.previousClose??null,change:external?.change??null,percentChange:external?.percentChange??null,
    bid:validBook?bid:null,ask:validBook?ask:null,spread:validBook?ask-bid:null,
    brokerSymbol:(mode==='broker'||mode==='stream')?(external?.brokerSymbol||'XAUUSD'):null,
    bridgeLatencyMs:mode==='broker'?Math.max(0,now-receivedAt):null
  };
}
function applyHorizonConsensusGuard(pathForecast:any,movement:any){
  if(!pathForecast)return pathForecast;
  const pd=pathForecast.priceDestination||null;
  const structuralSide=String(pathForecast.side||'WAIT');
  const targetSide=structuralSide!=='WAIT'?structuralSide:String(pd?.side||pathForecast.leanSide||'WAIT');
  if(!['BUY','SELL'].includes(targetSide))return pathForecast;

  const read=(h:any)=>{
    const side=String(h?.side||'WAIT');
    const confidence=Number(h?.confidence||0);
    const gate=String(h?.gateReason||'');
    const active=(side==='BUY'||side==='SELL')&&confidence>=55&&gate==='PASSED';
    return {side,confidence,gate,active};
  };
  const m1=read(movement?.horizons?.oneMinute);
  const m5=read(movement?.horizons?.fiveMinute);
  const rows=[m1,m5],active=rows.filter(x=>x.active);
  const aligned=active.filter(x=>x.side===targetSide).length;
  const opposed=active.filter(x=>x.side!==targetSide).length;
  const bothInactive=active.length===0;
  const split=aligned>0&&opposed>0;

  let side=structuralSide;
  let confidence=Number(pathForecast.confidence||0);
  let status='STRUCTURAL_ONLY';
  let reason='المسار الهيكلي يعمل بدون تأكيد زمني كافٍ';
  let cap=confidence;

  if(opposed===2){
    side='WAIT'; cap=34; status='BOTH_HORIZONS_OPPOSE';
    reason='M1 و M5 يعاكسان المسار؛ تم إيقاف الاتجاه القوي';
  }else if(split){
    side='WAIT'; cap=42; status='HORIZON_SPLIT';
    reason='M1 و M5 منقسمان؛ المسار تحت المراقبة فقط';
  }else if(opposed===1&&aligned===0){
    side='WAIT'; cap=40; status='ONE_HORIZON_OPPOSES';
    reason='إطار زمني نشط يعاكس المسار؛ خفض الثقة إلى مراقبة';
  }else if(bothInactive){
    side='WAIT'; cap=52; status='NO_HORIZON_CONFIRMATION';
    reason='M1 و M5 بدون تأكيد صالح؛ الوجهة تبقى ميلًا مراقبًا';
  }else if(aligned===1){
    cap=Math.min(confidence,70); status='ONE_HORIZON_CONFIRMS';
    reason='إطار زمني واحد يؤكد المسار؛ الثقة محدودة حتى يتفق الإطار الآخر';
  }else if(aligned===2){
    cap=Math.min(86,confidence+Math.min(5,Math.round((m1.confidence+m5.confidence-110)/12)));
    status='M1_M5_CONFIRMED';
    reason='M1 و M5 متفقان مع المسار';
  }

  const finalConfidence=Math.max(18,Math.min(confidence,cap));
  const priceDestination=pd?{
    ...pd,
    confidence:Math.round(Math.min(Number(pd.confidence||finalConfidence),finalConfidence))
  }:null;

  return {
    ...pathForecast,
    side,
    confidence:Math.round(finalConfidence),
    priceDestination,
    consensusGuard:{
      version:'HORIZON_CONSENSUS_V1',
      status,
      reason,
      targetSide,
      aligned,
      opposed,
      activeHorizons:active.length,
      m1:{side:m1.side,confidence:m1.confidence,gate:m1.gate},
      m5:{side:m5.side,confidence:m5.confidence,gate:m5.gate}
    }
  };
}

export async function GET(request:Request){
  const now=Date.now(),url=new URL(request.url),workerCycle=url.searchParams.get('worker')==='1',btcWave=waveFromParams(url,'b',now),goldWave=waveFromParams(url,'g',now);
  const clientGoldAt=Number(url.searchParams.get('gt'));
  const clientBtcAt=Number(url.searchParams.get('bat'));
  const clientGoldPrice=Number(url.searchParams.get('gp'));
  const clientBtcPrice=Number(url.searchParams.get('bp'));
  const hasNewLiveTick=(Number.isFinite(clientGoldAt)&&clientGoldAt>Number(lastAiPayload?.gold?.livePulse?.sourceTime||0))||(Number.isFinite(clientBtcAt)&&clientBtcAt>Number(lastAiPayload?.bitcoin?.livePulse?.sourceTime||0));
  const moveBps=(live:number,prev:any)=>{
    const p=Number(prev);
    return Number.isFinite(live)&&live>0&&Number.isFinite(p)&&p>0?Math.abs(live-p)/p*10000:0;
  };
  const goldMoveBps=moveBps(clientGoldPrice,lastAiPayload?.gold?.price??lastAiPayload?.gold?.livePulse?.price);
  const btcMoveBps=moveBps(clientBtcPrice,lastAiPayload?.bitcoin?.price??lastAiPayload?.bitcoin?.livePulse?.price);
  const significantLiveMove=Boolean(hasNewLiveTick&&(goldMoveBps>=1.15||btcMoveBps>=1.50));
  // Prices and fast scalp stay live on their own streams. Rebuild the expensive AI at a
  // controlled cadence, except when price actually moves enough to justify an early rebuild.
  const clientCacheMs=5000;
  const cacheMs=workerCycle?3200:clientCacheMs;
  const payloadAge=now-lastAiPayloadAt;
  const earlyRebuild=workerCycle&&significantLiveMove&&payloadAge>=1200;
  if(lastAiPayload&&payloadAge<cacheMs&&!earlyRebuild){
    return Response.json(lastAiPayload,{headers:{
      'Cache-Control':'no-store',
      'X-AI-Cache':significantLiveMove?'move-buffered':'fresh',
      'X-AI-Gold-Move-Bps':goldMoveBps.toFixed(2),
      'X-AI-Btc-Move-Bps':btcMoveBps.toFixed(2)
    }});
  }
  if(analysisBusy&&lastAiPayload&&now-lastAiPayloadAt<30000){
    return Response.json({...lastAiPayload,stale:true},{headers:{'Cache-Control':'no-store','X-AI-Cache':'busy'}});
  }
  analysisBusy=true;
  try{
    const actions:string[]=[],detected:string[]=[];
    const webIntelPromise=getWebMarketIntelligence(now).catch(()=>null);
    let [goldSnap,btc,liveBtc,liquidity]=await Promise.all([getMarketSnapshot(),getBtcMarket(),liveBtcSpot(),getBtcLiquidity().catch(()=>null)]);
    let gm=goldSnap.market,quote=goldSnap.quote;
    if(!gm.pricesReady||!gm.newsReady){
      detected.push(...(gm.errors||[]));
      const forced=await getMarketData({force:true}).catch(()=>null);
      if(forced){gm=forced;actions.push('إعادة تحميل Market Hub بالقوة');}
    }
    if(!quote){
      quote=await getQuoteData({forceExternal:true}).catch(()=>null);
      if(quote)actions.push('استعادة سعر الذهب من مصدر احتياطي');
    }
    const browserGold=goldLiveFromParams(url,quote,gm.c1.at(-1)?.close??null,now);
    if(browserGold){
      quote=browserGold;
      actions.push(browserGold.source);
    }
    const goldAnchorPrice=Number(quote?.price??NaN);
    const goldBasis=alignGoldMarketToAnchor(gm,Number.isFinite(goldAnchorPrice)&&goldAnchorPrice>0?goldAnchorPrice:null);
    gm=goldBasis.market;
    if(goldBasis.aligned)actions.push('مواءمة شموع COMEX proxy مع سعر XAU/USD الفعلي');
    if(!btc?.c1?.length){
      btc=await getBtcMarket(true);
      actions.push('إعادة تحميل شموع BTC بالقوة');
    }
    if(!liveBtc){
      liveBtc=await liveBtcSpot();
      if(liveBtc)actions.push('استعادة BTC Spot من مصدر حي بديل');
    }
    const goldAnalysis=analyze(gm.c1,gm.c5,gm.c15,gm.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const goldForecastCore=buildGoldForecastCore(gm.c1,gm.c5,gm.c15,gm.c60,quote?.price??gm.c1.at(-1)?.close??null,now);
    const btcAnalysis=analyze(btc.c1,btc.c5,btc.c15,btc.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const closedM1=btc.c1.filter((c:any)=>c.time+60000<=now).at(-1)||btc.c1.at(-1)||null;
    const btcPrice=liveBtc?.price??btc.c1.at(-1)?.close??null;
    const goldPrice=quote?.price??gm.c1.at(-1)?.close??null;
    // The 24/7 worker keeps BTC learning continuously. Gold learning is paused
    // while XAU/USD is closed so stale/flat prices cannot create fake NEUTRAL/FAIL outcomes.
    const goldLearningPrice=workerCycle&&!goldMarketOpenUTC(now)?null:goldPrice;
    const a1=atrNow(btc.c1),base=closedM1?.close??btcPrice,delta=Number.isFinite(Number(btcPrice))&&Number.isFinite(Number(base))?Number(btcPrice)-Number(base):0;
    const deltaPct=base?delta/base*100:0,momentum=a1&&a1>0?Math.min(100,Math.round(Math.abs(delta)/a1*100)):0;
    const pulseDirection:'UP'|'DOWN'|'FLAT'=delta>0?'UP':delta<0?'DOWN':'FLAT';
    const livePulse={price:btcPrice,basePrice:base,delta,deltaPct,momentum,direction:pulseDirection,source:liveBtc?.source||btc.source,sourceTime:liveBtc?.sourceTime||btc.checkedAt};
    const goldScalpRaw=scalpAnalyze(gm.c1,gm.c5,now,goldPrice);
    const bitcoinScalpRaw=scalpAnalyze(btc.c1,btc.c5,now,btcPrice);
    const goldAtr=atrNow(gm.c1),btcAtr=a1,goldSpread=Number(quote?.spread);
    const goldCostAtr=goldAtr&&Number(goldAtr)>0&&Number.isFinite(goldSpread)?Math.max(.05,goldSpread/Number(goldAtr)+.03):.10;
    const btcBookSpread=Number(liquidity?.book?.spreadBps||0),btcSpreadUsd=Number.isFinite(Number(btcPrice))?Number(btcPrice)*btcBookSpread/10000:0;
    const btcCostAtr=btcAtr&&Number(btcAtr)>0&&btcSpreadUsd>0?Math.max(.04,btcSpreadUsd/Number(btcAtr)+.03):.08;
    const goldLearner=trainScalpLearner(gm.c1,now,goldCostAtr);
    const bitcoinLearner=trainScalpLearner(btc.c1,now,btcCostAtr);
    const mt5GoldTick=getMt5FastSignal(now);
    const goldTick=mt5GoldTick?.ok?mt5GoldTick:(getServerTickSignal('GOLD',now)||goldWave);
    const goldMicro=goldMicroFromMt5(goldSnap.mt5,goldTick,quote,goldPrice,gm.c1);
    const goldLiquidity=goldMicro.liquidity,goldMotion=goldMicro.motion;
    const goldAccumulation=buildAccumulationMap(gm.c1,gm.c5,goldPrice,goldLiquidity,now);
    const bitcoinAccumulation=buildAccumulationMap(btc.c1,btc.c5,btcPrice,liquidity,now);
    const motion=getMotionIntelligence(btcPrice,liquidity,btc.c1,now);
    const goldScalpPrior=getNextMoveOutcome('GOLD_SCALP_AMBUSH_V10',goldLearningPrice,now);
    const bitcoinScalpPrior=getNextMoveOutcome('BTC_SCALP_AMBUSH_V10',btcPrice,now);
    const mlPredictionPromise=getMlPrediction(btc.c1,now).catch(()=>({ok:false,status:'UNAVAILABLE',shadow:true} as any));
    const neuralPredictionPromise=getNeuralPrediction(now).catch(()=>({ok:false,status:'UNAVAILABLE',ready:false,side:'WAIT'} as any));
    const bitcoinMlRaw=await mlPredictionPromise;
    const bitcoinTick=getServerTickSignal('BTC',now)||btcWave;
    const goldScalp=buildScalpFusion(goldScalpRaw,goldLiquidity,goldMotion,goldLearner,null,goldPrice,goldAtr,goldScalpPrior,goldTick,goldAccumulation,'GOLD');
    const predatorFusionV2=buildPredatorFusionV2({c1:gm.c1,c5:gm.c5,price:goldPrice,tick:goldTick,goldCore:goldForecastCore,now});
    const bitcoinScalp=buildScalpFusion(bitcoinScalpRaw,liquidity,motion,bitcoinLearner,bitcoinMlRaw,btcPrice,btcAtr,bitcoinScalpPrior,bitcoinTick,bitcoinAccumulation,'BTC');
    const goldBehavior=studyMarketBehavior(gm.c1,gm.c5,now);
    const bitcoinBehavior=studyMarketBehavior(btc.c1,btc.c5,now);
    const goldStructure=analyzeWaveStructure(gm.c1,gm.c5,now);
    const bitcoinStructure=analyzeWaveStructure(btc.c1,btc.c5,now);
    const goldStateGraph=buildMarketStateGraph(gm.c1,now);
    const bitcoinStateGraph=buildMarketStateGraph(btc.c1,now);
    const webIntel=await webIntelPromise;
    const goldWebLearning=webIntel?recordWebSourceOutcome({asset:'GOLD',price:goldLearningPrice,atr:goldAtr,signal:webIntel.gold,now}):null;
    const bitcoinWebLearning=webIntel?recordWebSourceOutcome({asset:'BTC',price:btcPrice,atr:btcAtr,signal:webIntel.btc,now}):null;
    if(webIntel){
      (webIntel.gold as any).outcomeLearning=goldWebLearning;
      (webIntel.btc as any).outcomeLearning=bitcoinWebLearning;
    }
    const goldNewsBase=buildNewsIntelligence('GOLD',gm.events,now);
    const bitcoinNewsBase=buildNewsIntelligence('BTC',gm.events,now);
    const goldNews=webIntel?mergeNewsWithWeb(goldNewsBase,webIntel.gold):goldNewsBase;
    const bitcoinNews=webIntel?mergeNewsWithWeb(bitcoinNewsBase,webIntel.btc):bitcoinNewsBase;
    const goldClosedM1=gm.c1.filter((c:any)=>c.time+60000<=now).at(-1)||gm.c1.at(-1)||null;
    const goldBase=Number(goldClosedM1?.close??goldPrice),goldDelta=Number.isFinite(Number(goldPrice))&&Number.isFinite(goldBase)?Number(goldPrice)-goldBase:0;
    const goldPulseDirection:'UP'|'DOWN'|'FLAT'=goldDelta>0?'UP':goldDelta<0?'DOWN':'FLAT';
    const goldLivePulse={price:goldPrice,basePrice:goldBase,delta:goldDelta,deltaPct:goldBase?goldDelta/goldBase*100:0,momentum:goldAtr&&goldAtr>0?Math.min(100,Math.round(Math.abs(goldDelta)/goldAtr*100)):0,direction:goldPulseDirection,source:quote?.source||gm.priceSource||'unknown',sourceTime:quote?.sourceTime||gm.checkedAt,status:quote?.status||'unknown'};
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldPrice,{quote:quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults,goldLivePulse,goldLiquidity,goldScalp,goldMotion,goldBehavior);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:liveBtc?.source||btc.source,candles:btc.source},now,defaults,livePulse,liquidity,bitcoinScalp,motion,bitcoinBehavior);

    const goldLearningContext={structure:goldStructure,stateGraph:goldStateGraph,accumulation:goldAccumulation,liquidity:goldLiquidity,motion:goldMotion,behavior:goldBehavior,news:goldNews,scalp:goldScalp,decision:gold};
    const bitcoinLearningContext={structure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulation:bitcoinAccumulation,liquidity,motion,behavior:bitcoinBehavior,news:bitcoinNews,scalp:bitcoinScalp,decision:bitcoin};
    const [goldLearning,bitcoinLearning]=await Promise.all([
      getMarketLearningSignal({asset:'GOLD',c1:gm.c1,c5:gm.c5,price:goldLearningPrice,atr:goldAtr,context:goldLearningContext,now}),
      getMarketLearningSignal({asset:'BTC',c1:btc.c1,c5:btc.c5,price:btcPrice,atr:btcAtr,context:bitcoinLearningContext,now})
    ]);
    const [goldExpectedLearning,bitcoinExpectedLearning]=await Promise.all([
      getExpectedMoveLearning({asset:'GOLD',c1:gm.c1,context:goldLearningContext,now}),
      getExpectedMoveLearning({asset:'BTC',c1:btc.c1,context:bitcoinLearningContext,now})
    ]);

    const [goldEvolution,bitcoinEvolution]=await Promise.all([
      evolveAnalysisPolicy({asset:'GOLD',learning:goldLearning,stateGraph:goldStateGraph,now}),
      evolveAnalysisPolicy({asset:'BTC',learning:bitcoinLearning,stateGraph:bitcoinStateGraph,now})
    ]);
    const bitcoinNeural=await neuralPredictionPromise;
    const bitcoinMl={...bitcoinMlRaw,neuralCore:bitcoinNeural};
    const goldHorizonLearning=getHorizonBrainLearning('GOLD',goldLearningPrice,now);
    const bitcoinHorizonLearning=getHorizonBrainLearning('BTC',btcPrice,now);
    const goldMovement=buildMovementIntelligence('GOLD',{expected:goldExpectedLearning,stateGraph:goldStateGraph,liquidity:goldLiquidity,motion:goldMotion,structure:goldStructure,accumulation:goldAccumulation,behavior:goldBehavior,learning:goldLearning,tick:goldTick,scalp:goldScalp,decision:gold,evolution:goldEvolution,news:goldNews,price:goldPrice,atr:goldAtr,now,horizonLearning:goldHorizonLearning});
    const bitcoinMovement=buildMovementIntelligence('BTC',{expected:bitcoinExpectedLearning,stateGraph:bitcoinStateGraph,liquidity,motion,structure:bitcoinStructure,accumulation:bitcoinAccumulation,behavior:bitcoinBehavior,learning:bitcoinLearning,tick:bitcoinTick,scalp:bitcoinScalp,decision:bitcoin,evolution:bitcoinEvolution,news:bitcoinNews,ml:bitcoinMl,price:btcPrice,atr:btcAtr,now,horizonLearning:bitcoinHorizonLearning});
    const goldHorizonLive=recordHorizonBrainOutcome({asset:'GOLD',price:goldLearningPrice,atr:goldAtr,now,horizons:goldMovement.horizons});
    const bitcoinHorizonLive=recordHorizonBrainOutcome({asset:'BTC',price:btcPrice,atr:btcAtr,now,horizons:bitcoinMovement.horizons});
    (goldMovement as any).horizonLearning=goldHorizonLive;
    (bitcoinMovement as any).horizonLearning=bitcoinHorizonLive;

    const goldBrainLearning=getBrainOutcomeLearning({asset:'GOLD',price:goldLearningPrice,now});
    const bitcoinBrainLearning=getBrainOutcomeLearning({asset:'BTC',price:btcPrice,now});
    const goldMultiBrain=buildMultiBrainCore('GOLD',{decision:gold,scalp:goldScalp,movement:goldMovement,stateGraph:goldStateGraph,tick:goldTick,expected:goldExpectedLearning,learning:goldLearning,brainLearning:goldBrainLearning,now});
    const bitcoinMultiBrain=buildMultiBrainCore('BTC',{decision:bitcoin,scalp:bitcoinScalp,movement:bitcoinMovement,stateGraph:bitcoinStateGraph,tick:bitcoinTick,expected:bitcoinExpectedLearning,learning:bitcoinLearning,brainLearning:bitcoinBrainLearning,now});
    const goldBrainRecord=recordBrainOutcomeObservation({asset:'GOLD',price:goldLearningPrice,atr:goldAtr,now,multiBrain:goldMultiBrain});
    const bitcoinBrainRecord=recordBrainOutcomeObservation({asset:'BTC',price:btcPrice,atr:btcAtr,now,multiBrain:bitcoinMultiBrain});
    const scalpTrackSource='SCALP_AMBUSH_TRADE_V10';
    const goldScalpFusionDiag=goldScalp.fusionV8||{};
    const bitcoinScalpFusionDiag=bitcoinScalp.fusionV8||{};
    const goldScalpLive=recordNextMoveOutcome({
      asset:'GOLD_SCALP_AMBUSH_V10',price:goldLearningPrice,atr:goldAtr,now,
      hunt:{nextMove:{
        side:goldScalp.action,confidence:Number(goldScalp.confidence||0),source:scalpTrackSource,
        micro:goldScalpFusionDiag
      }},
      regime:goldMultiBrain?.regime||goldMovement?.regime,
      horizonMs:60000,barrierScale:.16,minBarrierBps:.55,maxBarrierBps:1.6
    });
    const bitcoinScalpLive=recordNextMoveOutcome({
      asset:'BTC_SCALP_AMBUSH_V10',price:btcPrice,atr:btcAtr,now,
      hunt:{nextMove:{
        side:bitcoinScalp.action,confidence:Number(bitcoinScalp.confidence||0),source:scalpTrackSource,
        micro:bitcoinScalpFusionDiag
      }},
      regime:bitcoinMultiBrain?.regime||bitcoinMovement?.regime,
      horizonMs:60000,barrierScale:.18,minBarrierBps:.7,maxBarrierBps:1.8
    });

    const goldMaster=masterArbitrate('GOLD',gold,goldScalp,now,goldLearner,goldLearning,goldEvolution,goldExpectedLearning,goldMovement,goldStateGraph,goldTick,goldMultiBrain);
    const bitcoinMaster=masterArbitrate('BTC',bitcoin,bitcoinScalp,now,bitcoinLearner,bitcoinLearning,bitcoinEvolution,bitcoinExpectedLearning,bitcoinMovement,bitcoinStateGraph,bitcoinTick,bitcoinMultiBrain,bitcoinMl);
    const goldNextMovePrior=getNextMoveOutcome('GOLD',goldLearningPrice,now);
    const bitcoinNextMovePrior=getNextMoveOutcome('BTC',btcPrice,now);
    const goldPathPrior=getStructuralPathLearning('GOLD',goldLearningPrice,now);
    const bitcoinPathPrior=getStructuralPathLearning('BTC',btcPrice,now);
    const goldHunt=buildHuntForecast('GOLD',{...gold,master:goldMaster},goldScalp,goldPrice,goldAtr,now,goldWave,goldLearner,goldStructure,goldAccumulation,goldLearning,goldEvolution,goldStateGraph,goldExpectedLearning,goldMovement,goldNextMovePrior);
    const bitcoinHunt=buildHuntForecast('BTC',{...bitcoin,master:bitcoinMaster},bitcoinScalp,btcPrice,btcAtr,now,btcWave,bitcoinLearner,bitcoinStructure,bitcoinAccumulation,bitcoinLearning,bitcoinEvolution,bitcoinStateGraph,bitcoinExpectedLearning,bitcoinMovement,bitcoinNextMovePrior);
    goldHunt.nextMove=calibrateNextMoveConfidence(goldHunt.nextMove,goldNextMovePrior,goldMultiBrain?.regime||goldMovement?.regime);
    bitcoinHunt.nextMove=calibrateNextMoveConfidence(bitcoinHunt.nextMove,bitcoinNextMovePrior,bitcoinMultiBrain?.regime||bitcoinMovement?.regime);
    if(goldHunt?.zoneForecast?.pathForecast){
      goldHunt.zoneForecast.pathForecast=calibrateStructuralPathForecast(goldHunt.zoneForecast.pathForecast,goldPathPrior,goldHunt.zoneForecast.phase);
    }
    if(bitcoinHunt?.zoneForecast?.pathForecast){
      bitcoinHunt.zoneForecast.pathForecast=calibrateStructuralPathForecast(bitcoinHunt.zoneForecast.pathForecast,bitcoinPathPrior,bitcoinHunt.zoneForecast.phase);
    }
    if(goldHunt?.zoneForecast?.pathForecast){
      goldHunt.zoneForecast.pathForecast=applyHorizonConsensusGuard(goldHunt.zoneForecast.pathForecast,goldMovement);
    }
    if(bitcoinHunt?.zoneForecast?.pathForecast){
      bitcoinHunt.zoneForecast.pathForecast=applyHorizonConsensusGuard(bitcoinHunt.zoneForecast.pathForecast,bitcoinMovement);
    }
    const goldNextMoveLive=recordNextMoveOutcome({asset:'GOLD',price:goldLearningPrice,atr:goldAtr,now,hunt:goldHunt,regime:goldMultiBrain?.regime||goldMovement?.regime});
    const bitcoinNextMoveLive=recordNextMoveOutcome({asset:'BTC',price:btcPrice,atr:btcAtr,now,hunt:bitcoinHunt,regime:bitcoinMultiBrain?.regime||bitcoinMovement?.regime});
    const goldPathLive=recordStructuralPathOutcome({asset:'GOLD',price:goldLearningPrice,atr:goldAtr,now,pathForecast:goldHunt?.zoneForecast?.pathForecast,phase:goldHunt?.zoneForecast?.phase});
    const bitcoinPathLive=recordStructuralPathOutcome({asset:'BTC',price:btcPrice,atr:btcAtr,now,pathForecast:bitcoinHunt?.zoneForecast?.pathForecast,phase:bitcoinHunt?.zoneForecast?.phase});
    if(goldHunt?.zoneForecast?.pathForecast)goldHunt.zoneForecast.pathForecast.liveLearning=goldPathLive;
    if(bitcoinHunt?.zoneForecast?.pathForecast)bitcoinHunt.zoneForecast.pathForecast.liveLearning=bitcoinPathLive;

    const [, , , , goldAutopsy, bitcoinAutopsy]=await Promise.all([
      recordMarketLearningObservation({asset:'GOLD',c1:gm.c1,price:goldLearningPrice,atr:goldAtr,context:goldLearningContext,forecast:goldHunt,now}),
      recordMarketLearningObservation({asset:'BTC',c1:btc.c1,price:btcPrice,atr:btcAtr,context:bitcoinLearningContext,forecast:bitcoinHunt,now}),
      recordExpectedMoveObservation({asset:'GOLD',c1:gm.c1,context:goldLearningContext,forecast:goldHunt,now}),
      recordExpectedMoveObservation({asset:'BTC',c1:btc.c1,context:bitcoinLearningContext,forecast:bitcoinHunt,now}),
      recordEvolutionAutopsy({asset:'GOLD',hunt:goldHunt,learning:goldLearning,stateGraph:goldStateGraph,master:goldMaster,now}),
      recordEvolutionAutopsy({asset:'BTC',hunt:bitcoinHunt,learning:bitcoinLearning,stateGraph:bitcoinStateGraph,master:bitcoinMaster,now})
    ]);

    const goldRecommendation=buildRecommendation(goldMaster,goldHunt,goldPrice,now,goldNextMoveLive);
    const bitcoinRecommendation=buildRecommendation(bitcoinMaster,bitcoinHunt,btcPrice,now,bitcoinNextMoveLive);
    const goldOpportunities=buildOpportunitySet('GOLD',goldMaster,goldHunt,goldLearner,goldPrice,now);
    const bitcoinOpportunities=buildOpportunitySet('BTC',bitcoinMaster,bitcoinHunt,bitcoinLearner,btcPrice,now);
    const [goldRecommendationLearning,bitcoinRecommendationLearning]=await Promise.all([
      recordFinalRecommendationOutcome({asset:'GOLD',c1:gm.c1,price:goldLearningPrice,atr:goldAtr,context:goldLearningContext,recommendation:goldRecommendation,now}),
      recordFinalRecommendationOutcome({asset:'BTC',c1:btc.c1,price:btcPrice,atr:btcAtr,context:bitcoinLearningContext,recommendation:bitcoinRecommendation,now})
    ]);
    const compactHorizon=(h:any)=>h?{
      side:h.side??'WAIT',
      confidence:Number(h.confidence??h.strength??0),
      strength:Number(h.strength??h.confidence??0),
      expectedMove:Number.isFinite(Number(h.expectedMove))?Number(h.expectedMove):null,
      price:Number.isFinite(Number(h.price))?Number(h.price):null,
      low:Number.isFinite(Number(h.low))?Number(h.low):null,
      high:Number.isFinite(Number(h.high))?Number(h.high):null
    }:null;
    const compactTarget=(x:any)=>x?{
      side:x.side??'WAIT',
      price:Number.isFinite(Number(x.price))?Number(x.price):null,
      low:Number.isFinite(Number(x.low??x.zoneLow))?Number(x.low??x.zoneLow):null,
      high:Number.isFinite(Number(x.high??x.zoneHigh))?Number(x.high??x.zoneHigh):null,
      confidence:Number.isFinite(Number(x.confidence))?Number(x.confidence):null,
      source:x.source||null
    }:null;
    const compactZone=(z:any)=>z?{
      side:z.side||'WAIT',
      low:Number.isFinite(Number(z.low))?Number(z.low):null,
      high:Number.isFinite(Number(z.high))?Number(z.high):null,
      mid:Number.isFinite(Number(z.mid))?Number(z.mid):null,
      strength:Number(z.strength||0),
      distanceAtr:Number.isFinite(Number(z.distanceAtr))?Number(z.distanceAtr):null,
      kind:z.kind||null,
      liquidityScore:Number(z.liquidityScore||0),
      touches:Number(z.touches||0),
      rejections:Number(z.rejections||0)
    }:null;
    const compactAsset=(asset:'GOLD'|'BTC',x:any,hunt:any,recommendation:any,stateGraph:any,scalp:any,pulse:any,goldCore?:any,predator?:any)=>({
      asset,
      price:Number.isFinite(Number(pulse?.price??x?.price))?Number(pulse?.price??x?.price):null,
      livePulse:pulse?{
        price:Number.isFinite(Number(pulse.price))?Number(pulse.price):null,
        sourceTime:Number(pulse.sourceTime||0),
        source:pulse.source||null,
        direction:pulse.direction||'FLAT',
        momentum:Number(pulse.momentum||0)
      }:null,
      recommendation:recommendation?{
        active:Boolean(recommendation.active),
        action:recommendation.action||'WAIT',
        confidence:Number(recommendation.confidence||0),
        invalidation:Number.isFinite(Number(recommendation.invalidation))?Number(recommendation.invalidation):null,
        targets:recommendation.targets||null
      }:null,
      huntForecast:hunt?{
        confidence:Number(hunt.confidence||0),
        quality:Number(hunt.quality||0),
        invalidation:Number.isFinite(Number(hunt.invalidation))?Number(hunt.invalidation):null,
        nextMove:hunt.nextMove?{
          side:hunt.nextMove.side||'WAIT',
          confidence:Number(hunt.nextMove.confidence||0),
          firstHitMinutes:Number.isFinite(Number(hunt.nextMove.firstHitMinutes))?Number(hunt.nextMove.firstHitMinutes):null
        }:null,
        marketUnderstanding:hunt.marketUnderstanding?{
          summary:hunt.marketUnderstanding.summary||'',
          mode:hunt.marketUnderstanding.mode||'',
          firstMove:hunt.marketUnderstanding.firstMove?{
            side:hunt.marketUnderstanding.firstMove.side||'WAIT',
            confidence:Number(hunt.marketUnderstanding.firstMove.confidence||0)
          }:null,
          followMove:hunt.marketUnderstanding.followMove?{
            side:hunt.marketUnderstanding.followMove.side||'WAIT',
            confidence:Number(hunt.marketUnderstanding.followMove.confidence||0)
          }:null
        }:null,
        path:hunt.path?{
          label:hunt.path.label||'',
          shortSide:hunt.path.shortSide||'WAIT',
          followSide:hunt.path.followSide||'WAIT'
        }:null,
        horizons:{
          oneMinute:compactHorizon(hunt.horizons?.oneMinute),
          twoMinute:compactHorizon(hunt.horizons?.twoMinute),
          fiveMinute:compactHorizon(hunt.horizons?.fiveMinute),
          fifteenMinute:compactHorizon(hunt.horizons?.fifteenMinute),
          thirtyMinute:compactHorizon(hunt.horizons?.thirtyMinute)
        },
        quickSignalTargets:{
          scalp:compactTarget(hunt.quickSignalTargets?.scalp),
          oneMinute:compactTarget(hunt.quickSignalTargets?.oneMinute),
          fiveMinute:compactTarget(hunt.quickSignalTargets?.fiveMinute)
        },
        movementStations:Array.isArray(hunt.movementStations)?hunt.movementStations.slice(0,3).map(compactTarget):[],
        zoneForecast:hunt.zoneForecast?{
          side:hunt.zoneForecast.side||'WAIT',
          confidence:Number(hunt.zoneForecast.confidence||0),
          phase:hunt.zoneForecast.phase||'NEUTRAL',
          setup:hunt.zoneForecast.setup||'',
          summary:hunt.zoneForecast.summary||'',
          source:hunt.zoneForecast.source||'STRUCTURAL_ZONE_MAP',
          decisionReady:Boolean(hunt.zoneForecast.decisionReady),
          triggerReason:hunt.zoneForecast.triggerReason||'',
          horizonContext:hunt.zoneForecast.horizonContext||null,
          liquidityConfirmed:Boolean(hunt.zoneForecast.liquidityConfirmed),
          absorptionConfirmed:Boolean(hunt.zoneForecast.absorptionConfirmed),
          breakoutReadiness:Number(hunt.zoneForecast.breakoutReadiness||0),
          support:compactZone(hunt.zoneForecast.support),
          resistance:compactZone(hunt.zoneForecast.resistance),
          origin:compactZone(hunt.zoneForecast.origin),
          target:compactZone(hunt.zoneForecast.target),
          pathForecast:hunt.zoneForecast.pathForecast?{
            version:hunt.zoneForecast.pathForecast.version||'FORECAST_AI_V3',
            side:hunt.zoneForecast.pathForecast.side||'WAIT',
            leanSide:hunt.zoneForecast.pathForecast.leanSide||'WAIT',
            confidence:Number(hunt.zoneForecast.pathForecast.confidence||0),
            conviction:hunt.zoneForecast.pathForecast.conviction||'WEAK',
            clarity:Number(hunt.zoneForecast.pathForecast.clarity||0),
            rawConfidence:Number(hunt.zoneForecast.pathForecast.rawConfidence||hunt.zoneForecast.pathForecast.confidence||0),
            rawProbability:Number(hunt.zoneForecast.pathForecast.rawProbability||0),
            probabilities:hunt.zoneForecast.pathForecast.probabilities||null,
            scenario:hunt.zoneForecast.pathForecast.scenario||'',
            reason:hunt.zoneForecast.pathForecast.reason||'',
            phase:hunt.zoneForecast.pathForecast.phase||'NEUTRAL',
            upScore:Number(hunt.zoneForecast.pathForecast.upScore||0),
            downScore:Number(hunt.zoneForecast.pathForecast.downScore||0),
            destination:compactZone(hunt.zoneForecast.pathForecast.destination),
            priceDestination:hunt.zoneForecast.pathForecast.priceDestination?{
              side:hunt.zoneForecast.pathForecast.priceDestination.side||'WAIT',
              zone:compactZone(hunt.zoneForecast.pathForecast.priceDestination.zone),
              confidence:Number(hunt.zoneForecast.pathForecast.priceDestination.confidence||0),
              source:hunt.zoneForecast.pathForecast.priceDestination.source||null,
              projected:Boolean(hunt.zoneForecast.pathForecast.priceDestination.projected),
              distancePrice:Number(hunt.zoneForecast.pathForecast.priceDestination.distancePrice||0),
              distancePct:Number(hunt.zoneForecast.pathForecast.priceDestination.distancePct||0),
              distanceAtr:Number(hunt.zoneForecast.pathForecast.priceDestination.distanceAtr||0)
            }:null,
            reboundZone:compactZone(hunt.zoneForecast.pathForecast.reboundZone),
            upperLiquidity:compactZone(hunt.zoneForecast.pathForecast.upperLiquidity),
            lowerLiquidity:compactZone(hunt.zoneForecast.pathForecast.lowerLiquidity),
            alternate:hunt.zoneForecast.pathForecast.alternate?{
              side:hunt.zoneForecast.pathForecast.alternate.side||'WAIT',
              probability:Number(hunt.zoneForecast.pathForecast.alternate.probability||0),
              destination:compactZone(hunt.zoneForecast.pathForecast.alternate.destination)
            }:null,
            invalidation:hunt.zoneForecast.pathForecast.invalidation?{
              price:Number.isFinite(Number(hunt.zoneForecast.pathForecast.invalidation.price))?Number(hunt.zoneForecast.pathForecast.invalidation.price):null,
              zone:compactZone(hunt.zoneForecast.pathForecast.invalidation.zone),
              reason:hunt.zoneForecast.pathForecast.invalidation.reason||''
            }:null,
            evidence:hunt.zoneForecast.pathForecast.evidence||null,
            consensusGuard:hunt.zoneForecast.pathForecast.consensusGuard||null,
            learning:hunt.zoneForecast.pathForecast.learning||null,
            liveLearning:hunt.zoneForecast.pathForecast.liveLearning?{
              readyForCalibration:Boolean(hunt.zoneForecast.pathForecast.liveLearning.readyForCalibration),
              failureStreak:Number(hunt.zoneForecast.pathForecast.liveLearning.failureStreak||0),
              global:hunt.zoneForecast.pathForecast.liveLearning.global||null
            }:null
          }:null,
          stability:hunt.zoneForecast.stability?{
            locked:Boolean(hunt.zoneForecast.stability.locked),
            ageSeconds:Number(hunt.zoneForecast.stability.ageSeconds||0),
            flipsBlocked:Number(hunt.zoneForecast.stability.flipsBlocked||0),
            reason:hunt.zoneForecast.stability.reason||''
          }:null
        }:null
      }:null,
      stateGraph:stateGraph?{
        nextSide:stateGraph.nextSide||'WAIT',
        nextSideProbability:Number(stateGraph.nextSideProbability||0)
      }:null,
      scalp:scalp?{
        action:scalp.action||'WAIT',
        confidence:Number(scalp.confidence||0),
        nextPrice:compactTarget(scalp.nextPrice),
        target:compactTarget(scalp.target),
        ambushPlan:scalp.ambushPlan?{target:compactTarget(scalp.ambushPlan.target)}:null,
        fusionV8:scalp.fusionV8?{nextPrice:compactTarget(scalp.fusionV8.nextPrice)}:null
      }:null,
      goldForecastCore:goldCore?{
        ok:Boolean(goldCore.ok),
        side:goldCore.side||'WAIT',
        confidence:Number(goldCore.confidence||0),
        uncertainty:Number(goldCore.uncertainty||0),
        fakeoutRisk:Number(goldCore.fakeoutRisk||0),
        regime:goldCore.regime||null,
        horizons:{
          oneMinute:compactHorizon(goldCore.horizons?.oneMinute),
          fiveMinute:compactHorizon(goldCore.horizons?.fiveMinute)
        }
      }:undefined,
      predatorFusionV2:predator?{
        ok:Boolean(predator.ok),
        horizons:{
          thirtySeconds:compactHorizon(predator.horizons?.thirtySeconds),
          oneMinute:compactHorizon(predator.horizons?.oneMinute),
          threeMinutes:compactHorizon(predator.horizons?.threeMinutes),
          fiveMinutes:compactHorizon(predator.horizons?.fiveMinutes)
        }
      }:undefined
    });

    const goldMarketOpen=goldMarketOpenUTC(now);
    const actualRecoveryActions=actions.filter((a:string)=>/استعادة|إعادة تحميل/.test(a));
    const recovered=actualRecoveryActions.length>0&&(!goldMarketOpen||gm.pricesReady)&&Boolean(btc.c1.length)&&Boolean(btcPrice);
    const futureEvents=(gm.events||[]).filter((e:any)=>e.time>=now).sort((a:any,b:any)=>a.time-b.time);
    const featuredEvent=futureEvents[0]||null;
    const featuredGoldNews=featuredEvent?buildNewsIntelligence('GOLD',[featuredEvent],now):null;
    const featuredBtcNews=featuredEvent?buildNewsIntelligence('BTC',[featuredEvent],now):null;
    const compactNewsImpact=(x:any)=>x?{
      side:x.side||'WAIT',
      confidence:Number(x.confidence||0),
      risk:Number(x.risk||0),
      phase:x.phase||'CALM',
      directional:Boolean(x.directional),
      surprise:Number.isFinite(Number(x.surprise))?Number(x.surprise):null,
      reason:Array.isArray(x.reasons)?x.reasons.slice(0,2).join(' '):'',
      web:x.web?{
        side:x.web.side||'WAIT',
        confidence:Number(x.web.confidence||0),
        risk:Number(x.web.risk||0),
        sourceCount:Number(x.web.sourceCount||0),
        freshCount:Number(x.web.freshCount||0),
        top:Array.isArray(x.web.items)?x.web.items.slice(0,3).map((i:any)=>({
          source:i.source,title:i.title,ageMinutes:i.ageMinutes,side:i.side,impact:i.impact
        })):[]
      }:null
    }:null;
    const degraded=(goldMarketOpen&&!gm.pricesReady)||!gm.newsReady||!btc?.c1?.length||!btcPrice;
    const autopilot={
      status:recovered?'recovered':degraded?'degraded':'healthy',
      nextEvent:featuredEvent?{
        id:featuredEvent.id,
        name:featuredEvent.name,
        time:featuredEvent.time,
        importance:featuredEvent.importance,
        actual:featuredEvent.actual||'',
        forecast:featuredEvent.forecast||'',
        previous:featuredEvent.previous||'',
        source:featuredEvent.source||'',
        goldImpact:compactNewsImpact(featuredGoldNews),
        btcImpact:compactNewsImpact(featuredBtcNews)
      }:null
    };

    const huntZoneDiag=(h:any)=>h?.zoneForecast?{
      side:h.zoneForecast.side||'WAIT',
      confidence:Number(h.zoneForecast.confidence||0),
      decisionReady:Boolean(h.zoneForecast.decisionReady),
      triggerReason:h.zoneForecast.triggerReason||'',
      target:h.zoneForecast.target?{low:h.zoneForecast.target.low,high:h.zoneForecast.target.high,kind:h.zoneForecast.target.kind}:null,
      path:h.zoneForecast.pathForecast?{
        version:h.zoneForecast.pathForecast.version||'FORECAST_AI_V3',
        side:h.zoneForecast.pathForecast.side||'WAIT',
        confidence:Number(h.zoneForecast.pathForecast.confidence||0),
        probabilities:h.zoneForecast.pathForecast.probabilities||null,
        destination:h.zoneForecast.pathForecast.destination?{
          low:h.zoneForecast.pathForecast.destination.low,
          high:h.zoneForecast.pathForecast.destination.high,
          kind:h.zoneForecast.pathForecast.destination.kind
        }:null,
        rebound:h.zoneForecast.pathForecast.reboundZone?{
          low:h.zoneForecast.pathForecast.reboundZone.low,
          high:h.zoneForecast.pathForecast.reboundZone.high
        }:null,
        alternate:h.zoneForecast.pathForecast.alternate?{
          side:h.zoneForecast.pathForecast.alternate.side||'WAIT',
          probability:Number(h.zoneForecast.pathForecast.alternate.probability||0),
          destination:h.zoneForecast.pathForecast.alternate.destination?{
            low:h.zoneForecast.pathForecast.alternate.destination.low,
            high:h.zoneForecast.pathForecast.alternate.destination.high
          }:null
        }:null,
        priceDestination:h.zoneForecast.pathForecast.priceDestination?{
          side:h.zoneForecast.pathForecast.priceDestination.side||'WAIT',
          low:h.zoneForecast.pathForecast.priceDestination.zone?.low??null,
          high:h.zoneForecast.pathForecast.priceDestination.zone?.high??null,
          mid:h.zoneForecast.pathForecast.priceDestination.zone?.mid??null,
          projected:Boolean(h.zoneForecast.pathForecast.priceDestination.projected),
          confidence:Number(h.zoneForecast.pathForecast.priceDestination.confidence||0),
          source:h.zoneForecast.pathForecast.priceDestination.source||null
        }:null,
        invalidation:Number.isFinite(Number(h.zoneForecast.pathForecast.invalidation?.price))?Number(h.zoneForecast.pathForecast.invalidation.price):null,
        consensusGuard:h.zoneForecast.pathForecast.consensusGuard||null,
        learning:h.zoneForecast.pathForecast.learning?{
          status:h.zoneForecast.pathForecast.learning.status||null,
          samples:Number(h.zoneForecast.pathForecast.learning.samples||0),
          observedAccuracy:Number(h.zoneForecast.pathForecast.learning.observedAccuracy||0),
          globalPosterior:Number(h.zoneForecast.pathForecast.learning.globalPosterior||0),
          signaturePosterior:Number(h.zoneForecast.pathForecast.learning.signaturePosterior||0),
          targetKindPosterior:Number(h.zoneForecast.pathForecast.learning.targetKindPosterior||0),
          distancePosterior:Number(h.zoneForecast.pathForecast.learning.distancePosterior||0),
          hardVeto:Boolean(h.zoneForecast.pathForecast.learning.hardVeto),
          promoted:Boolean(h.zoneForecast.pathForecast.learning.promoted)
        }:null,
        liveLearning:h.zoneForecast.pathForecast.liveLearning?{
          recorded:Boolean(h.zoneForecast.pathForecast.liveLearning.recorded),
          reason:h.zoneForecast.pathForecast.liveLearning.reason||null,
          learningMode:h.zoneForecast.pathForecast.liveLearning.learningMode||null,
          signature:h.zoneForecast.pathForecast.liveLearning.signature||null,
          pending:Number(h.zoneForecast.pathForecast.liveLearning.pending||0),
          pendingLive:Number(h.zoneForecast.pathForecast.liveLearning.pendingLive||0),
          pendingShadow:Number(h.zoneForecast.pathForecast.liveLearning.pendingShadow||0),
          recentLive:Number(h.zoneForecast.pathForecast.liveLearning.recentLive||0),
          recentShadow:Number(h.zoneForecast.pathForecast.liveLearning.recentShadow||0)
        }:null
      }:null,
      locked:Boolean(h.zoneForecast.stability?.locked),
      stabilityReason:h.zoneForecast.stability?.reason||'',
      flipsBlocked:Number(h.zoneForecast.stability?.flipsBlocked||0)
    }:null;

    if(now-lastDiagLog>30000){
      lastDiagLog=now;
      const compactHorizonDiag=(h:any)=>h?{
        side:h.side||'WAIT',
        confidence:Number(h.confidence||0),
        agreement:Number(h.agreement||0),
        uncertainty:Number(h.uncertainty||0),
        independentFamilies:Number(h.independentFamilies||0),
        familyOpposition:Number(h.familyOpposition||0),
        gateReason:h.gateReason||null,
        learning:h.learning?{
          accuracy:Number(h.learning.accuracy||0),
          posterior:Number(h.learning.posterior||0),
          recentAccuracy:Number(h.learning.recent?.accuracy||0),
          last8Accuracy:Number(h.learning.recent?.last8Accuracy||0),
          failureStreak:Number(h.learning.failureStreak||0),
          recentKill:Boolean(h.learning.recentKill),
          recoveryReady:Boolean(h.learning.recoveryReady),
          quality:h.learning.quality||null
        }:null
      }:null;
      const compactHorizonLearningDiag=(x:any)=>x?{
        pending:Number(x.pending||0),
        pendingLive:Number(x.pendingLive||0),
        pendingShadow:Number(x.pendingShadow||0),
        m1:x.horizons?.M1?{
          accuracy:Number(x.horizons.M1.accuracy||0),
          posterior:Number(x.horizons.M1.posterior||0),
          recentAccuracy:Number(x.horizons.M1.recent?.accuracy||0),
          last8Accuracy:Number(x.horizons.M1.recent?.last8Accuracy||0),
          recentKill:Boolean(x.horizons.M1.recentKill)
        }:null,
        m5:x.horizons?.M5?{
          accuracy:Number(x.horizons.M5.accuracy||0),
          posterior:Number(x.horizons.M5.posterior||0),
          recentAccuracy:Number(x.horizons.M5.recent?.accuracy||0),
          last8Accuracy:Number(x.horizons.M5.recent?.last8Accuracy||0),
          recentKill:Boolean(x.horizons.M5.recentKill)
        }:null
      }:null;
      console.info('[AI-DIAG]',JSON.stringify({
        status:autopilot.status,
        recoveryActions:actualRecoveryActions.slice(0,5),
        webScout:webIntel?{
          ok:Boolean(webIntel.ok),cached:Boolean(webIntel.cached),
          sources:webIntel.sources.map((s:any)=>({id:s.id,ok:Boolean(s.ok),itemCount:Number(s.itemCount||0),error:s.error||null})),
          gold:{side:webIntel.gold.side,confidence:webIntel.gold.confidence,risk:webIntel.gold.risk,sourceCount:webIntel.gold.sourceCount,freshCount:webIntel.gold.freshCount},
          btc:{side:webIntel.btc.side,confidence:webIntel.btc.confidence,risk:webIntel.btc.risk,sourceCount:webIntel.btc.sourceCount,freshCount:webIntel.btc.freshCount}
        }:null,
        gold:{
          tick:{
            source:String(goldTick?.source||''),
            ok:Boolean(goldTick?.ok),
            side:String(goldTick?.side||'WAIT'),
            stage:String(goldTick?.stage||''),
            score:Number(goldTick?.score||0),
            confidence:Number(goldTick?.confidence||0),
            samples:Number((goldTick as any)?.samples||0),
            persistence:Number((goldTick as any)?.persistence||0)
          },
          price:Number(goldPrice||0),
          priceSource:goldLivePulse?.source||'unknown',
          candleSource:gm.priceSource||'unknown',
          candleClose:Number(gm.c1.at(-1)?.close||0),
          basis:{aligned:Boolean(goldBasis.aligned),offset:Number(goldBasis.basisOffset||0),bps:Number(goldBasis.basisBps||0)},
          zone:huntZoneDiag(goldHunt),
          horizonBrains:{
            m1:compactHorizonDiag(goldMovement?.horizons?.oneMinute),
            m3:compactHorizonDiag(goldMovement?.horizons?.threeMinute),
            m5:compactHorizonDiag(goldMovement?.horizons?.fiveMinute),
            learning:compactHorizonLearningDiag((goldMovement as any)?.horizonLearning)
          },
          action:goldMaster.action,
          scalp:goldScalp.action,
          confidence:Number(goldHunt?.nextMove?.confidence||0),
          scalpReason:String(goldScalp?.reason||''),
          scalpConfidence:Number(goldScalp?.confidence||0),
          scalpLong:Number(goldScalp?.score?.long||0),
          scalpShort:Number(goldScalp?.score?.short||0),
          fusion:{
            side:goldScalp?.fusionV8?.side||'WAIT',
            rawSide:goldScalp?.fusionV8?.rawSide||'WAIT',
            edge:Number(goldScalp?.fusionV8?.edge||0),
            evidence:Number(goldScalp?.fusionV8?.dominantEvidence||0),
            support:Number(goldScalp?.fusionV8?.support||0),
            liveSupport:Number(goldScalp?.fusionV8?.liveSupport||0),
            liveOpposition:Number(goldScalp?.fusionV8?.liveOpposition||0),
            intercept:goldScalp?.fusionV8?.intercept?.status||null,
            assistantCount:Number(goldScalp?.fusionV8?.assistantCount||0),
            tradeReady:Boolean(goldScalp?.fusionV8?.ambushTrade),
            pattern:String(goldScalp?.fusionV8?.predator?.pattern||'NO_EDGE'),
            predatorScore:Number(goldScalp?.fusionV8?.predator?.score||0),
            earlyFlowQuality:Boolean(goldScalp?.fusionV8?.liveGuard?.earlyFlowQuality),
            tickSequenceReady:Boolean(goldScalp?.fusionV8?.liveGuard?.tickSequenceReady),
            tickStage:String(goldScalp?.fusionV8?.predator?.tickSequence?.stage||''),
            tickSamples:Number(goldScalp?.fusionV8?.predator?.tickSequence?.samples||0),
            tickPersistence:Number(goldScalp?.fusionV8?.predator?.tickSequence?.persistence||0),
            microPersistence:Number(goldScalp?.fusionV8?.predator?.microstructure?.persistence||0),
            microSamples:Number(goldScalp?.fusionV8?.predator?.microstructure?.samples||0)
          }
        },
        btc:{
          zone:huntZoneDiag(bitcoinHunt),
          horizonBrains:{
            m1:compactHorizonDiag(bitcoinMovement?.horizons?.oneMinute),
            m3:compactHorizonDiag(bitcoinMovement?.horizons?.threeMinute),
            m5:compactHorizonDiag(bitcoinMovement?.horizons?.fiveMinute),
            learning:compactHorizonLearningDiag((bitcoinMovement as any)?.horizonLearning)
          },
          action:bitcoinMaster.action,
          scalp:bitcoinScalp.action,
          confidence:Number(bitcoinHunt?.nextMove?.confidence||0)
        },
        mlM1Ready:Boolean(bitcoinMl?.oneMinute?.ready),
        mlM5Ready:Boolean(bitcoinMl?.fiveMinute?.ready),
        neuralReady:Boolean(bitcoinNeural?.ready)
      }));
    }

    const payload={
      ok:true,
      model:'Predator AI Lite',
      checkedAt:now,
      autopilot,
      webScout:webIntel?{
        ok:Boolean(webIntel.ok),checkedAt:webIntel.checkedAt,cached:Boolean(webIntel.cached),
        sources:webIntel.sources.map((s:any)=>({id:s.id,name:s.name,ok:Boolean(s.ok),itemCount:Number(s.itemCount||0),error:s.error||null})),
        gold:{side:webIntel.gold.side,confidence:webIntel.gold.confidence,risk:webIntel.gold.risk,sourceCount:webIntel.gold.sourceCount,freshCount:webIntel.gold.freshCount},
        btc:{side:webIntel.btc.side,confidence:webIntel.btc.confidence,risk:webIntel.btc.risk,sourceCount:webIntel.btc.sourceCount,freshCount:webIntel.btc.freshCount}
      }:null,
      gold:compactAsset('GOLD',gold,goldHunt,goldRecommendation,goldStateGraph,goldScalp,goldLivePulse,goldForecastCore,predatorFusionV2),
      bitcoin:compactAsset('BTC',bitcoin,bitcoinHunt,bitcoinRecommendation,bitcoinStateGraph,bitcoinScalp,livePulse)
    };
    lastAiPayload=payload;lastAiPayloadAt=Date.now();
    return Response.json(payload,{headers:{'Cache-Control':'no-store','X-AI-Cache':'miss'}});
  }catch(e){
    console.error('[AI-ERROR]',e instanceof Error?(e.stack||e.message):e);
    if(lastAiPayload&&Date.now()-lastAiPayloadAt<30000){
      return Response.json({...lastAiPayload,stale:true},{headers:{'Cache-Control':'no-store','X-AI-Cache':'recovered'}});
    }
    return Response.json({ok:false,message:'تعذر تشغيل محرك التحليل المتقدم.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});
  }finally{
    analysisBusy=false;
  }
}
