import {analyze,defaults,scalpAnalyze} from '../../../lib/engine';
import {getMarketSnapshot,getMarketData,getQuoteData} from '../../../lib/market-hub';
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
import {getMarketLearningSignal,recordMarketLearningObservation} from '../../../lib/market-learning-core';
import {buildMarketStateGraph} from '../../../lib/market-state-graph';
import {evolveAnalysisPolicy,recordEvolutionAutopsy} from '../../../lib/self-evolution';
import {getExpectedMoveLearning,recordExpectedMoveObservation} from '../../../lib/expected-move-learning';

export const dynamic='force-dynamic';
export const runtime='nodejs';
let lastDiagLog=0;
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
function atrNow(c:any[]){
  const x=c.slice(-15);if(x.length<3)return null;let sum=0,n=0;
  for(let i=1;i<x.length;i++){const tr=Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close));if(Number.isFinite(tr)){sum+=tr;n++;}}
  return n?sum/n:null;
}
function waveFromParams(url:URL,prefix:'b'|'g',now:number){
  const side=url.searchParams.get(prefix+'s'),stage=url.searchParams.get(prefix+'st'),score=Number(url.searchParams.get(prefix+'sc')),confidence=Number(url.searchParams.get(prefix+'cf')),at=Number(url.searchParams.get(prefix+'at'));
  if(!['BUY','SELL','WAIT'].includes(String(side))||!['WARMING','COILED','WAVE_FORMING','IGNITION'].includes(String(stage))||!Number.isFinite(score)||!Number.isFinite(confidence)||!Number.isFinite(at)||score<0||score>92||confidence<0||confidence>88||now-at<0||now-at>3500)return null;
  return {ok:true,side,stage,score,confidence,at,source:'browser live WebSocket'};
}
export async function GET(request:Request){
  const now=Date.now(),url=new URL(request.url),btcWave=waveFromParams(url,'b',now),goldWave=waveFromParams(url,'g',now);
  try{
    const actions:string[]=[],detected:string[]=[];
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
    if(!btc?.c1?.length){
      btc=await getBtcMarket(true);
      actions.push('إعادة تحميل شموع BTC بالقوة');
    }
    if(!liveBtc){
      liveBtc=await liveBtcSpot();
      if(liveBtc)actions.push('استعادة BTC Spot من مصدر حي بديل');
    }
    const goldAnalysis=analyze(gm.c1,gm.c5,gm.c15,gm.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const btcAnalysis=analyze(btc.c1,btc.c5,btc.c15,btc.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const closedM1=btc.c1.filter((c:any)=>c.time+60000<=now).at(-1)||btc.c1.at(-1)||null;
    const btcPrice=liveBtc?.price??btc.c1.at(-1)?.close??null;
    const goldPrice=quote?.price??gm.c1.at(-1)?.close??null;
    const a1=atrNow(btc.c1),base=closedM1?.close??btcPrice,delta=Number.isFinite(Number(btcPrice))&&Number.isFinite(Number(base))?Number(btcPrice)-Number(base):0;
    const deltaPct=base?delta/base*100:0,momentum=a1&&a1>0?Math.min(100,Math.round(Math.abs(delta)/a1*100)):0;
    const pulseDirection:'UP'|'DOWN'|'FLAT'=delta>0?'UP':delta<0?'DOWN':'FLAT';
    const livePulse={price:btcPrice,basePrice:base,delta,deltaPct,momentum,direction:pulseDirection,source:liveBtc?.source||btc.source,sourceTime:liveBtc?.sourceTime||btc.checkedAt};
    const goldScalp=scalpAnalyze(gm.c1,gm.c5,now,goldPrice);
    const bitcoinScalp=scalpAnalyze(btc.c1,btc.c5,now,btcPrice);
    const goldAtr=atrNow(gm.c1),btcAtr=a1,goldSpread=Number(quote?.spread);
    const goldCostAtr=goldAtr&&Number(goldAtr)>0&&Number.isFinite(goldSpread)?Math.max(.05,goldSpread/Number(goldAtr)+.03):.10;
    const btcBookSpread=Number(liquidity?.book?.spreadBps||0),btcSpreadUsd=Number.isFinite(Number(btcPrice))?Number(btcPrice)*btcBookSpread/10000:0;
    const btcCostAtr=btcAtr&&Number(btcAtr)>0&&btcSpreadUsd>0?Math.max(.04,btcSpreadUsd/Number(btcAtr)+.03):.08;
    const goldLearner=trainScalpLearner(gm.c1,now,goldCostAtr);
    const bitcoinLearner=trainScalpLearner(btc.c1,now,btcCostAtr);
    const motion=getMotionIntelligence(btcPrice,liquidity,btc.c1,now);
    const goldBehavior=studyMarketBehavior(gm.c1,gm.c5,now);
    const bitcoinBehavior=studyMarketBehavior(btc.c1,btc.c5,now);
    const goldStructure=analyzeWaveStructure(gm.c1,gm.c5,now);
    const bitcoinStructure=analyzeWaveStructure(btc.c1,btc.c5,now);
    const goldStateGraph=buildMarketStateGraph(gm.c1,now);
    const bitcoinStateGraph=buildMarketStateGraph(btc.c1,now);
    const goldAccumulation=buildAccumulationMap(gm.c1,gm.c5,goldPrice,null,now);
    const bitcoinAccumulation=buildAccumulationMap(btc.c1,btc.c5,btcPrice,liquidity,now);
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldPrice,{quote:quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults,null,null,goldScalp,null,goldBehavior);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:liveBtc?.source||btc.source,candles:btc.source},now,defaults,livePulse,liquidity,bitcoinScalp,motion,bitcoinBehavior);

    const goldLearningContext={structure:goldStructure,stateGraph:goldStateGraph,accumulation:goldAccumulation,liquidity:null,motion:null,behavior:goldBehavior,scalp:goldScalp,decision:gold};
    const bitcoinLearningContext={structure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulation:bitcoinAccumulation,liquidity,motion,behavior:bitcoinBehavior,scalp:bitcoinScalp,decision:bitcoin};
    const [goldLearning,bitcoinLearning]=await Promise.all([
      getMarketLearningSignal({asset:'GOLD',c1:gm.c1,c5:gm.c5,price:goldPrice,atr:goldAtr,context:goldLearningContext,now}),
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

    const goldMaster=masterArbitrate('GOLD',gold,goldScalp,now,goldLearner);
    const bitcoinMaster=masterArbitrate('BTC',bitcoin,bitcoinScalp,now,bitcoinLearner);
    const goldHunt=buildHuntForecast('GOLD',{...gold,master:goldMaster},goldScalp,goldPrice,goldAtr,now,goldWave,goldLearner,goldStructure,goldAccumulation,goldLearning,goldEvolution,goldStateGraph,goldExpectedLearning);
    const bitcoinHunt=buildHuntForecast('BTC',{...bitcoin,master:bitcoinMaster},bitcoinScalp,btcPrice,btcAtr,now,btcWave,bitcoinLearner,bitcoinStructure,bitcoinAccumulation,bitcoinLearning,bitcoinEvolution,bitcoinStateGraph,bitcoinExpectedLearning);

    const [, , , , goldAutopsy, bitcoinAutopsy]=await Promise.all([
      recordMarketLearningObservation({asset:'GOLD',c1:gm.c1,price:goldPrice,atr:goldAtr,context:goldLearningContext,forecast:goldHunt,now}),
      recordMarketLearningObservation({asset:'BTC',c1:btc.c1,price:btcPrice,atr:btcAtr,context:bitcoinLearningContext,forecast:bitcoinHunt,now}),
      recordExpectedMoveObservation({asset:'GOLD',c1:gm.c1,context:goldLearningContext,forecast:goldHunt,now}),
      recordExpectedMoveObservation({asset:'BTC',c1:btc.c1,context:bitcoinLearningContext,forecast:bitcoinHunt,now}),
      recordEvolutionAutopsy({asset:'GOLD',hunt:goldHunt,learning:goldLearning,stateGraph:goldStateGraph,master:goldMaster,now}),
      recordEvolutionAutopsy({asset:'BTC',hunt:bitcoinHunt,learning:bitcoinLearning,stateGraph:bitcoinStateGraph,master:bitcoinMaster,now})
    ]);

    const goldOut={...gold,rawAction:gold.action,action:goldMaster.action,master:goldMaster,huntForecast:goldHunt,waveStructure:goldStructure,stateGraph:goldStateGraph,accumulationMap:goldAccumulation,marketLearning:goldLearning,expectedMoveLearning:goldExpectedLearning,selfEvolution:goldEvolution,evolutionAutopsy:goldAutopsy,scalpLearner:goldLearner,trade:goldMaster.trade};
    const bitcoinOut={...bitcoin,rawAction:bitcoin.action,action:bitcoinMaster.action,master:bitcoinMaster,huntForecast:bitcoinHunt,waveStructure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulationMap:bitcoinAccumulation,marketLearning:bitcoinLearning,expectedMoveLearning:bitcoinExpectedLearning,selfEvolution:bitcoinEvolution,evolutionAutopsy:bitcoinAutopsy,scalpLearner:bitcoinLearner,trade:bitcoinMaster.trade};
    const radar=[
      {asset:'BTC',score:Math.min(92,Math.max(Number(bitcoin.fusion?.buy||0),Number(bitcoin.fusion?.sell||0),Number(bitcoin.hunter?.score||0),Number(bitcoinScalp.score?.long||0),Number(bitcoinScalp.score?.short||0))),status:bitcoinMaster.state,side:bitcoinMaster.action,watchSide:bitcoinMaster.watchSide,huntSide:bitcoinHunt.side,huntState:bitcoinHunt.state,huntConfidence:bitcoinHunt.confidence,mode:bitcoinMaster.state==='TRADE'?bitcoinMaster.trade?.mode:'MASTER'},
      {asset:'GOLD',score:Math.min(92,Math.max(Number(gold.fusion?.buy||0),Number(gold.fusion?.sell||0),Number(gold.hunter?.score||0),Number(goldScalp.score?.long||0),Number(goldScalp.score?.short||0))),status:goldMaster.state,side:goldMaster.action,watchSide:goldMaster.watchSide,huntSide:goldHunt.side,huntState:goldHunt.state,huntConfidence:goldHunt.confidence,mode:goldMaster.state==='TRADE'?goldMaster.trade?.mode:'MASTER'}
    ].sort((a,b)=>b.score-a.score);
    const recovered=actions.length>0&&gm.pricesReady&&Boolean(btc.c1.length)&&Boolean(goldPrice)&&Boolean(btcPrice);
    const futureEvents=(gm.events||[]).filter((e:any)=>e.time>=now).sort((a:any,b:any)=>a.time-b.time);
    const warnings=[...new Set(gm.errors||[])].slice(0,8);
    const autopilot={status:recovered?'recovered':(!gm.pricesReady||!gm.newsReady)?'degraded':'healthy',detected:[...new Set(detected)].slice(0,8),warnings,actions:[...new Set(actions)].slice(0,8),newsReady:gm.newsReady,eventCount:futureEvents.length,nextEvent:futureEvents[0]?{name:futureEvents[0].name,time:futureEvents[0].time,importance:futureEvents[0].importance}:null,pricesReady:gm.pricesReady,goldSource:quote?.source||gm.priceSource||null,btcSource:liveBtc?.source||btc.source};
    if(now-lastDiagLog>30000){lastDiagLog=now;console.info('[AI-DIAG]',JSON.stringify({newsReady:autopilot.newsReady,eventCount:autopilot.eventCount,pricesReady:autopilot.pricesReady,goldSource:autopilot.goldSource,btcSource:autopilot.btcSource,goldAction:gold.action,goldConfidence:gold.confidence,goldLong:gold.longScore,goldShort:gold.shortScore,goldScalp:goldScalp.action,goldScalpLong:goldScalp.score?.long,goldScalpShort:goldScalp.score?.short,goldScalpReason:goldScalp.reason,btcAction:bitcoinMaster.action,btcMaster:bitcoinMaster,btcHunt:bitcoinHunt,btcWaveLead:btcWave,btcLearner:{ok:bitcoinLearner.ok,side:bitcoinLearner.side,confidence:bitcoinLearner.confidence,oosAccuracy:bitcoinLearner.oosAccuracy,oosEdgeAtr:bitcoinLearner.oosEdgeAtr,profitFactor:bitcoinLearner.profitFactor,maxDrawdownAtr:bitcoinLearner.maxDrawdownAtr,costAtr:bitcoinLearner.costAtr,gate:bitcoinLearner.gate,hold:bitcoinLearner.exitPlan.maxHoldSeconds},btcConfidence:bitcoin.confidence,btcLong:bitcoin.longScore,btcShort:bitcoin.shortScore,btcVetoes:bitcoin.vetoes,btcScalp:bitcoinScalp.action,btcScalpLong:bitcoinScalp.score?.long,btcScalpShort:bitcoinScalp.score?.short,btcScalpReason:bitcoinScalp.reason,btcHunter:bitcoin.hunter?.status,btcHunterMode:bitcoin.hunter?.mode,btcHunterScore:bitcoin.hunter?.score,btcHunterThreshold:bitcoin.hunter?.threshold,btcHunterSide:bitcoin.hunter?.side,btcFusion:bitcoin.fusion,btcPhase:bitcoin.phase,btcLiquidity:bitcoin.liquidity?{side:bitcoin.liquidity.side,buy:bitcoin.liquidity.buy,sell:bitcoin.liquidity.sell,quality:bitcoin.liquidity.quality,pressure:bitcoin.liquidity.pressure,flowDeltaPct:bitcoin.liquidity.flow?.deltaPct,priceChangeBps:bitcoin.liquidity.flow?.priceChangeBps,depthImbalance:bitcoin.liquidity.book?.depthImbalance,absorption:bitcoin.liquidity.absorption}:null,btcAdaptiveCore:bitcoin.adaptiveCore,btcMotion:bitcoin.motion?{side:bitcoin.motion.side,stage:bitcoin.motion.stage,score:bitcoin.motion.score,confidence:bitcoin.motion.confidence,components:bitcoin.motion.components,diagnostics:bitcoin.motion.diagnostics}:null,btcBehavior:bitcoin.behavior?{side:bitcoin.behavior.side,score:bitcoin.behavior.score,confidence:bitcoin.behavior.confidence,pattern:bitcoin.behavior.pattern,analogCount:bitcoin.behavior.analogCount,expectedMoveAtr:bitcoin.behavior.expectedMoveAtr,votes:bitcoin.behavior.votes}:null,status:autopilot.status}));}
    return Response.json({ok:true,model:'Predator Core v9.6 · Expected Move Priority Brain',checkedAt:now,autopilot,radar,gold:{...goldOut,scalp:goldScalp},bitcoin:{...bitcoinOut,livePulse,scalp:bitcoinScalp},safety:{execution:false,guaranteed:false,failClosed:true,temporalConfirmation:true,boundedRecovery:true,adaptiveThresholds:true,multiStrategyHunter:true,indicatorFusion:true,pullbackHunter:true,newsAwareBTC:true,liquidityIntelligence:true,adaptiveCore:true,liquidityConflictGate:true,spoofingAwareWalls:true,preMoveMotion:true,sequenceMemory:true,divergenceDetection:true,compressionDetection:true,sweepReclaim:true,marketBehaviorStudy:true,historicalAnalogs:true,behaviorConflictGate:true,exclusiveMasterDecision:true,reversalLock:true,singleActionOutput:true,proactiveHuntForecast:true,waitStatePrediction:true,forecastMemory:true,tickWaveLead:true,subSecondPrecursors:true,clientWaveFusion:true,scalpLearning:true,outOfSampleValidation:true,adaptiveExitPlan:true,demoFirstMt5:true,directionalCommitment:true,hysteresisFlipControl:true,fastIgnitionOverride:true,finalHoldoutGate:true,costAwareValidation:true,profitFactorGate:true,drawdownGate:true,multiHorizonForecast:true,pathSequenceForecast:true,alternateScenario:true,waveStructureEngine:true,breakoutRetest:true,sweepReversal:true,pullbackPhase:true,exhaustionDetection:true,accumulationMap:true,distributionMap:true,liquidityAccumulationFusion:true,strongMoveReadiness:true,persistentMarketLearning:true,onlineOutcomeFeedback:true,componentReliabilityLearning:true,oneMinuteFiveMinuteMemory:true,learningExecution:false,marketStateGraph:true,sequenceTransitionLearning:true,changePointDetection:true,selfEvolutionLab:true,candidateCodeGeneration:true,shadowPromotion:true,automaticRollback:true,selfModifyingExecution:false,featureSynthesis:true,multiCandidateTournament:true,ablationTesting:true,failureAutopsy:true,regimeChampions:true,productionSourceWrite:false,expectedMoveWindows:true,twoMinuteForecast:true,fiveMinuteForecast:true,fifteenMinuteForecast:true,expectedMovePriority:true,horizonSpecificLearning:true,mfeMaeLearning:true,horizonCalibration:true}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,message:'تعذر تشغيل محرك التحليل المتقدم.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
