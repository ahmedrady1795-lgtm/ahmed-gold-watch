import {analyze,defaults,ambushTechnicalHelper} from '../../../lib/engine';
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
import {buildOpportunitySet} from '../../../lib/multi-opportunity';
import {buildAmbushEngine} from '../../../lib/scalp-fusion';
import {recordNextMoveOutcome,getNextMoveOutcome,calibrateNextMoveConfidence} from '../../../lib/next-move-outcome';

export const dynamic='force-dynamic';
export const runtime='nodejs';
startServerTickBrain();
let lastDiagLog=0;
let lastAiPayload:any=null,lastAiPayloadAt=0,analysisBusy=false;
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
export async function GET(request:Request){
  const now=Date.now(),url=new URL(request.url),btcWave=waveFromParams(url,'b',now),goldWave=waveFromParams(url,'g',now);
  if(lastAiPayload&&now-lastAiPayloadAt<1600){
    return Response.json(lastAiPayload,{headers:{'Cache-Control':'no-store','X-AI-Cache':'fresh'}});
  }
  if(analysisBusy&&lastAiPayload&&now-lastAiPayloadAt<30000){
    return Response.json({...lastAiPayload,stale:true},{headers:{'Cache-Control':'no-store','X-AI-Cache':'busy'}});
  }
  analysisBusy=true;
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
    const goldScalpRaw=ambushTechnicalHelper(gm.c1,gm.c5,now,goldPrice);
    const bitcoinScalpRaw=ambushTechnicalHelper(btc.c1,btc.c5,now,btcPrice);
    const goldAtr=atrNow(gm.c1),btcAtr=a1,goldSpread=Number(quote?.spread);
    const goldCostAtr=goldAtr&&Number(goldAtr)>0&&Number.isFinite(goldSpread)?Math.max(.05,goldSpread/Number(goldAtr)+.03):.10;
    const btcBookSpread=Number(liquidity?.book?.spreadBps||0),btcSpreadUsd=Number.isFinite(Number(btcPrice))?Number(btcPrice)*btcBookSpread/10000:0;
    const btcCostAtr=btcAtr&&Number(btcAtr)>0&&btcSpreadUsd>0?Math.max(.04,btcSpreadUsd/Number(btcAtr)+.03):.08;
    const goldLearner=trainScalpLearner(gm.c1,now,goldCostAtr);
    const bitcoinLearner=trainScalpLearner(btc.c1,now,btcCostAtr);
    const goldAccumulation=buildAccumulationMap(gm.c1,gm.c5,goldPrice,null,now);
    const bitcoinAccumulation=buildAccumulationMap(btc.c1,btc.c5,btcPrice,liquidity,now);
    const goldTick=getServerTickSignal('GOLD',now)||goldWave;
    const motion=getMotionIntelligence(btcPrice,liquidity,btc.c1,now);
    const bitcoinScalpPrior=getNextMoveOutcome('BTC_SCALP_AMBUSH_V8',btcPrice,now);
    const mlPredictionPromise=getMlPrediction(btc.c1,now).catch(()=>({ok:false,status:'UNAVAILABLE',shadow:true} as any));
    const neuralPredictionPromise=getNeuralPrediction(now).catch(()=>({ok:false,status:'UNAVAILABLE',ready:false,side:'WAIT'} as any));
    const bitcoinMlRaw=await mlPredictionPromise;
    const bitcoinTick=getServerTickSignal('BTC',now)||btcWave;
    const goldScalp=buildAmbushEngine(goldScalpRaw,null,null,goldLearner,null,goldPrice,goldAtr,null,goldTick,goldAccumulation,'GOLD');
    const bitcoinScalp=buildAmbushEngine(bitcoinScalpRaw,liquidity,motion,bitcoinLearner,bitcoinMlRaw,btcPrice,btcAtr,bitcoinScalpPrior,bitcoinTick,bitcoinAccumulation,'BTC');
    const goldBehavior=studyMarketBehavior(gm.c1,gm.c5,now);
    const bitcoinBehavior=studyMarketBehavior(btc.c1,btc.c5,now);
    const goldStructure=analyzeWaveStructure(gm.c1,gm.c5,now);
    const bitcoinStructure=analyzeWaveStructure(btc.c1,btc.c5,now);
    const goldStateGraph=buildMarketStateGraph(gm.c1,now);
    const bitcoinStateGraph=buildMarketStateGraph(btc.c1,now);
    const goldNews=buildNewsIntelligence('GOLD',gm.events,now);
    const bitcoinNews=buildNewsIntelligence('BTC',gm.events,now);
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldPrice,{quote:quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults,null,null,goldScalp,null,goldBehavior);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:liveBtc?.source||btc.source,candles:btc.source},now,defaults,livePulse,liquidity,bitcoinScalp,motion,bitcoinBehavior);

    const goldLearningContext={structure:goldStructure,stateGraph:goldStateGraph,accumulation:goldAccumulation,liquidity:null,motion:null,behavior:goldBehavior,news:goldNews,scalp:goldScalp,decision:gold};
    const bitcoinLearningContext={structure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulation:bitcoinAccumulation,liquidity,motion,behavior:bitcoinBehavior,news:bitcoinNews,scalp:bitcoinScalp,decision:bitcoin};
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
    const bitcoinNeural=await neuralPredictionPromise;
    const bitcoinMl={...bitcoinMlRaw,neuralCore:bitcoinNeural};
    const goldMovement=buildMovementIntelligence('GOLD',{expected:goldExpectedLearning,stateGraph:goldStateGraph,liquidity:null,motion:null,structure:goldStructure,accumulation:goldAccumulation,behavior:goldBehavior,learning:goldLearning,tick:goldTick,scalp:goldScalp,decision:gold,evolution:goldEvolution,news:goldNews,price:goldPrice,atr:goldAtr,now});
    const bitcoinMovement=buildMovementIntelligence('BTC',{expected:bitcoinExpectedLearning,stateGraph:bitcoinStateGraph,liquidity,motion,structure:bitcoinStructure,accumulation:bitcoinAccumulation,behavior:bitcoinBehavior,learning:bitcoinLearning,tick:bitcoinTick,scalp:bitcoinScalp,decision:bitcoin,evolution:bitcoinEvolution,news:bitcoinNews,ml:bitcoinMl,price:btcPrice,atr:btcAtr,now});

    const goldBrainLearning=getBrainOutcomeLearning({asset:'GOLD',price:goldPrice,now});
    const bitcoinBrainLearning=getBrainOutcomeLearning({asset:'BTC',price:btcPrice,now});
    const goldMultiBrain=buildMultiBrainCore('GOLD',{decision:gold,scalp:goldScalp,movement:goldMovement,stateGraph:goldStateGraph,tick:goldTick,expected:goldExpectedLearning,learning:goldLearning,brainLearning:goldBrainLearning,now});
    const bitcoinMultiBrain=buildMultiBrainCore('BTC',{decision:bitcoin,scalp:bitcoinScalp,movement:bitcoinMovement,stateGraph:bitcoinStateGraph,tick:bitcoinTick,expected:bitcoinExpectedLearning,learning:bitcoinLearning,brainLearning:bitcoinBrainLearning,now});
    const goldBrainRecord=recordBrainOutcomeObservation({asset:'GOLD',price:goldPrice,atr:goldAtr,now,multiBrain:goldMultiBrain});
    const bitcoinBrainRecord=recordBrainOutcomeObservation({asset:'BTC',price:btcPrice,atr:btcAtr,now,multiBrain:bitcoinMultiBrain});
    const scalpFusionDiag=bitcoinScalp.fusionV8||{};
    const scalpTrackSource='SCALP_AMBUSH_TRADE_V8';
    const bitcoinScalpLive=recordNextMoveOutcome({
      asset:'BTC_SCALP_AMBUSH_V8',price:btcPrice,atr:btcAtr,now,
      hunt:{nextMove:{
        side:bitcoinScalp.action,confidence:Number(bitcoinScalp.confidence||0),source:scalpTrackSource,
        micro:scalpFusionDiag
      }},
      regime:bitcoinMultiBrain?.regime||bitcoinMovement?.regime,
      horizonMs:60000,barrierScale:.18,minBarrierBps:.7,maxBarrierBps:1.8
    });

    const goldMaster=masterArbitrate('GOLD',gold,goldScalp,now,goldLearner,goldLearning,goldEvolution,goldExpectedLearning,goldMovement,goldStateGraph,goldTick,goldMultiBrain);
    const bitcoinMaster=masterArbitrate('BTC',bitcoin,bitcoinScalp,now,bitcoinLearner,bitcoinLearning,bitcoinEvolution,bitcoinExpectedLearning,bitcoinMovement,bitcoinStateGraph,bitcoinTick,bitcoinMultiBrain,bitcoinMl);
    const goldNextMovePrior=getNextMoveOutcome('GOLD',goldPrice,now);
    const bitcoinNextMovePrior=getNextMoveOutcome('BTC',btcPrice,now);
    const goldHunt=buildHuntForecast('GOLD',{...gold,master:goldMaster},goldScalp,goldPrice,goldAtr,now,goldWave,goldLearner,goldStructure,goldAccumulation,goldLearning,goldEvolution,goldStateGraph,goldExpectedLearning,goldMovement,goldNextMovePrior);
    const bitcoinHunt=buildHuntForecast('BTC',{...bitcoin,master:bitcoinMaster},bitcoinScalp,btcPrice,btcAtr,now,btcWave,bitcoinLearner,bitcoinStructure,bitcoinAccumulation,bitcoinLearning,bitcoinEvolution,bitcoinStateGraph,bitcoinExpectedLearning,bitcoinMovement,bitcoinNextMovePrior);
    goldHunt.nextMove=calibrateNextMoveConfidence(goldHunt.nextMove,goldNextMovePrior,goldMultiBrain?.regime||goldMovement?.regime);
    bitcoinHunt.nextMove=calibrateNextMoveConfidence(bitcoinHunt.nextMove,bitcoinNextMovePrior,bitcoinMultiBrain?.regime||bitcoinMovement?.regime);
    const goldNextMoveLive=recordNextMoveOutcome({asset:'GOLD',price:goldPrice,atr:goldAtr,now,hunt:goldHunt,regime:goldMultiBrain?.regime||goldMovement?.regime});
    const bitcoinNextMoveLive=recordNextMoveOutcome({asset:'BTC',price:btcPrice,atr:btcAtr,now,hunt:bitcoinHunt,regime:bitcoinMultiBrain?.regime||bitcoinMovement?.regime});

    const [, , , , goldAutopsy, bitcoinAutopsy]=await Promise.all([
      recordMarketLearningObservation({asset:'GOLD',c1:gm.c1,price:goldPrice,atr:goldAtr,context:goldLearningContext,forecast:goldHunt,now}),
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
      recordFinalRecommendationOutcome({asset:'GOLD',c1:gm.c1,price:goldPrice,atr:goldAtr,context:goldLearningContext,recommendation:goldRecommendation,now}),
      recordFinalRecommendationOutcome({asset:'BTC',c1:btc.c1,price:btcPrice,atr:btcAtr,context:bitcoinLearningContext,recommendation:bitcoinRecommendation,now})
    ]);
    const goldOut={...gold,rawAction:gold.action,action:goldMaster.action,master:goldMaster,recommendation:goldRecommendation,opportunities:goldOpportunities,recommendationLearning:goldRecommendationLearning,huntForecast:goldHunt,waveStructure:goldStructure,stateGraph:goldStateGraph,accumulationMap:goldAccumulation,newsIntelligence:goldNews,marketLearning:goldLearning,expectedMoveLearning:goldExpectedLearning,movementIntelligence:goldMovement,multiBrainCore:goldMultiBrain,brainOutcomeLearning:goldBrainLearning,brainOutcomeRecord:goldBrainRecord,nextMoveLive:goldNextMoveLive,serverTickBrain:goldTick,selfEvolution:goldEvolution,evolutionAutopsy:goldAutopsy,scalpLearner:goldLearner,trade:goldMaster.trade};
    const bitcoinOut={...bitcoin,rawAction:bitcoin.action,action:bitcoinMaster.action,master:bitcoinMaster,recommendation:bitcoinRecommendation,opportunities:bitcoinOpportunities,recommendationLearning:bitcoinRecommendationLearning,huntForecast:bitcoinHunt,waveStructure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulationMap:bitcoinAccumulation,newsIntelligence:bitcoinNews,marketLearning:bitcoinLearning,expectedMoveLearning:bitcoinExpectedLearning,movementIntelligence:bitcoinMovement,mlCore:bitcoinMl,neuralCore:bitcoinNeural,multiBrainCore:bitcoinMultiBrain,brainOutcomeLearning:bitcoinBrainLearning,brainOutcomeRecord:bitcoinBrainRecord,nextMoveLive:bitcoinNextMoveLive,scalpLive:bitcoinScalpLive,serverTickBrain:bitcoinTick,selfEvolution:bitcoinEvolution,evolutionAutopsy:bitcoinAutopsy,scalpLearner:bitcoinLearner,trade:bitcoinMaster.trade};
    const radar=[
      {asset:'BTC',score:Math.min(92,Math.max(Number(bitcoin.fusion?.buy||0),Number(bitcoin.fusion?.sell||0),Number(bitcoin.hunter?.score||0),Number(bitcoinScalp.score?.long||0),Number(bitcoinScalp.score?.short||0))),status:bitcoinMaster.state,side:bitcoinMaster.action,watchSide:bitcoinMaster.watchSide,huntSide:bitcoinHunt.side,huntState:bitcoinHunt.state,huntConfidence:bitcoinHunt.confidence,mode:bitcoinMaster.state==='TRADE'?bitcoinMaster.trade?.mode:'MASTER'},
      {asset:'GOLD',score:Math.min(92,Math.max(Number(gold.fusion?.buy||0),Number(gold.fusion?.sell||0),Number(gold.hunter?.score||0),Number(goldScalp.score?.long||0),Number(goldScalp.score?.short||0))),status:goldMaster.state,side:goldMaster.action,watchSide:goldMaster.watchSide,huntSide:goldHunt.side,huntState:goldHunt.state,huntConfidence:goldHunt.confidence,mode:goldMaster.state==='TRADE'?goldMaster.trade?.mode:'MASTER'}
    ].sort((a,b)=>b.score-a.score);
    const goldMarketOpen=goldMarketOpenUTC(now);
    const recovered=actions.length>0&&(!goldMarketOpen||gm.pricesReady)&&Boolean(btc.c1.length)&&Boolean(btcPrice);
    const futureEvents=(gm.events||[]).filter((e:any)=>e.time>=now).sort((a:any,b:any)=>a.time-b.time);
    const warnings=[...new Set(gm.errors||[])].slice(0,8);
    const degraded=(goldMarketOpen&&!gm.pricesReady)||!gm.newsReady||!btc?.c1?.length||!btcPrice;
    const autopilot={status:recovered?'recovered':degraded?'degraded':'healthy',detected:[...new Set(detected)].slice(0,8),warnings,actions:[...new Set(actions)].slice(0,8),newsReady:gm.newsReady,eventCount:futureEvents.length,nextEvent:futureEvents[0]?{name:futureEvents[0].name,time:futureEvents[0].time,importance:futureEvents[0].importance}:null,pricesReady:gm.pricesReady,goldMarketOpen,goldSource:quote?.source||gm.priceSource||null,btcSource:liveBtc?.source||btc.source};
    if(now-lastDiagLog>30000){lastDiagLog=now;console.info('[AI-DIAG]',JSON.stringify({newsReady:autopilot.newsReady,eventCount:autopilot.eventCount,pricesReady:autopilot.pricesReady,goldSource:autopilot.goldSource,btcSource:autopilot.btcSource,goldAction:gold.action,goldConfidence:gold.confidence,goldLong:gold.longScore,goldShort:gold.shortScore,goldScalp:goldScalp.action,goldScalpLong:goldScalp.score?.long,goldScalpShort:goldScalp.score?.short,goldScalpReason:goldScalp.reason,btcAction:bitcoinMaster.action,btcMaster:bitcoinMaster,btcMl:bitcoinMl,btcNeural:bitcoinNeural,btcMultiBrain:bitcoinMultiBrain,btcBrainLearning:bitcoinBrainLearning,btcNextMoveLive:bitcoinNextMoveLive,btcHunt:bitcoinHunt,btcWaveLead:btcWave,btcLearner:{ok:bitcoinLearner.ok,side:bitcoinLearner.side,confidence:bitcoinLearner.confidence,oosAccuracy:bitcoinLearner.oosAccuracy,oosEdgeAtr:bitcoinLearner.oosEdgeAtr,profitFactor:bitcoinLearner.profitFactor,maxDrawdownAtr:bitcoinLearner.maxDrawdownAtr,costAtr:bitcoinLearner.costAtr,gate:bitcoinLearner.gate,hold:bitcoinLearner.exitPlan.maxHoldSeconds},btcConfidence:bitcoin.confidence,btcLong:bitcoin.longScore,btcShort:bitcoin.shortScore,btcVetoes:bitcoin.vetoes,btcScalp:bitcoinScalp.action,btcScalpLong:bitcoinScalp.score?.long,btcScalpShort:bitcoinScalp.score?.short,btcScalpReason:bitcoinScalp.reason,btcScalpFusion:bitcoinScalp.fusionV8,btcScalpPreMove:bitcoinScalp.preMove,btcScalpLive:bitcoinScalpLive,btcScalpRaw:{action:bitcoinScalpRaw.action,long:bitcoinScalpRaw.score?.long,short:bitcoinScalpRaw.score?.short,confidence:bitcoinScalpRaw.confidence},btcHunter:bitcoin.hunter?.status,btcHunterMode:bitcoin.hunter?.mode,btcHunterScore:bitcoin.hunter?.score,btcHunterThreshold:bitcoin.hunter?.threshold,btcHunterSide:bitcoin.hunter?.side,btcFusion:bitcoin.fusion,btcPhase:bitcoin.phase,btcLiquidity:bitcoin.liquidity?{side:bitcoin.liquidity.side,buy:bitcoin.liquidity.buy,sell:bitcoin.liquidity.sell,quality:bitcoin.liquidity.quality,pressure:bitcoin.liquidity.pressure,flowDeltaPct:bitcoin.liquidity.flow?.deltaPct,priceChangeBps:bitcoin.liquidity.flow?.priceChangeBps,depthImbalance:bitcoin.liquidity.book?.depthImbalance,absorption:bitcoin.liquidity.absorption}:null,btcAdaptiveCore:bitcoin.adaptiveCore,btcMotion:bitcoin.motion?{side:bitcoin.motion.side,stage:bitcoin.motion.stage,score:bitcoin.motion.score,confidence:bitcoin.motion.confidence,components:bitcoin.motion.components,diagnostics:bitcoin.motion.diagnostics}:null,btcBehavior:bitcoin.behavior?{side:bitcoin.behavior.side,score:bitcoin.behavior.score,confidence:bitcoin.behavior.confidence,pattern:bitcoin.behavior.pattern,analogCount:bitcoin.behavior.analogCount,expectedMoveAtr:bitcoin.behavior.expectedMoveAtr,votes:bitcoin.behavior.votes}:null,status:autopilot.status}));}
    const payload={ok:true,model:'Predator Neural Price-Path Core · DeepLOB + TCN + Selective SSM + M1 ML',checkedAt:now,autopilot,radar,gold:{...goldOut,scalp:goldScalp},bitcoin:{...bitcoinOut,livePulse,scalp:bitcoinScalp},safety:{execution:false,guaranteed:false,failClosed:true,temporalConfirmation:true,boundedRecovery:true,adaptiveThresholds:true,multiStrategyHunter:true,indicatorFusion:true,pullbackHunter:true,newsAwareBTC:true,liquidityIntelligence:true,adaptiveCore:true,liquidityConflictGate:true,spoofingAwareWalls:true,preMoveMotion:true,sequenceMemory:true,divergenceDetection:true,compressionDetection:true,sweepReclaim:true,marketBehaviorStudy:true,historicalAnalogs:true,behaviorConflictGate:true,exclusiveMasterDecision:true,reversalLock:true,singleActionOutput:false,multiOpportunityOutput:true,proactiveHuntForecast:true,waitStatePrediction:true,forecastMemory:true,tickWaveLead:true,subSecondPrecursors:true,clientWaveFusion:true,scalpLearning:true,outOfSampleValidation:true,adaptiveExitPlan:true,demoFirstMt5:true,directionalCommitment:true,hysteresisFlipControl:true,fastIgnitionOverride:true,finalHoldoutGate:true,costAwareValidation:true,profitFactorGate:true,drawdownGate:true,multiHorizonForecast:true,pathSequenceForecast:true,alternateScenario:true,waveStructureEngine:true,breakoutRetest:true,sweepReversal:true,pullbackPhase:true,exhaustionDetection:true,accumulationMap:true,distributionMap:true,liquidityAccumulationFusion:true,strongMoveReadiness:true,persistentMarketLearning:true,onlineOutcomeFeedback:true,nextMoveLiveOutcomeTracker:true,nextMoveFirstPassageSettlement:true,nextMoveEventDeduplication:true,componentReliabilityLearning:true,oneMinuteFiveMinuteMemory:true,learningExecution:false,marketStateGraph:true,sequenceTransitionLearning:true,changePointDetection:true,selfEvolutionLab:true,candidateCodeGeneration:true,shadowPromotion:true,automaticRollback:true,selfModifyingExecution:false,featureSynthesis:true,multiCandidateTournament:true,ablationTesting:true,failureAutopsy:true,regimeChampions:true,productionSourceWrite:false,expectedMoveWindows:true,twoMinuteForecast:true,fiveMinuteForecast:true,fifteenMinuteForecast:true,expectedMovePriority:true,horizonSpecificLearning:true,mfeMaeLearning:true,horizonCalibration:true,regimeMovementIntelligence:true,uncertaintyResolver:true,dynamicEvidenceWeights:true,externalMlEnsemble:true,xgboost:true,lightgbm:true,neuralMicrostructure:true,l2OrderBookSequences:true,deepLobBranch:true,tcnTemporalBranch:true,selectiveStateSpaceBranch:true,neuralMetaRouter:true,neuralPricePath:true,timeToHitForecast:true,firstPassagePrice:true,neuralHoldoutGate:true,mlHoldoutGate:true,mlM1SelectiveProduction:true,mlM5ShadowGate:true,mlShadowFallback:true,outcomeTrainedBrainRouter:true,regimeSpecificBrainReliability:true,bayesianBrainCalibration:true,confidenceCalibrationV3:true,scalpFusionV3:true,predatorScalpV7:true,temporalPredatorState:true,scalpFusionV6:true,scalpFusionV5:true,scalpFusionV4:true,preMoveScalp:true,reactionAwareScalp:true,accumulationAwareScalp:true,serverTickScalp:true,scalpInterceptV5:true,noChaseScalp:true,l2ScalpOverride:true,validatedM1MlScalp:true,nextMovePrecisionV3:true,oosPreDecisionGuard:true,scalpLiveOutcomeTracker:true,scalpFirstPassage60s:true,scalpOosSelfGuard:true,liveOutcomeConfidenceCap:true,walkForwardOosValidation:true,rollingOosThresholding:true,liveOosReconciliation:true,driftAwareConfidenceGuard:true,oosPromotionGate:true,nextMoveShadowUntilPass:true,liveStackCore:true,fastRegimeResolver:true,scalpLedMicrostructure:true,serverTickBrain:true,backgroundTickStream:true,probabilisticTargetRange:true,newsIntelligenceFusion:true,preEventRiskPenalty:true,postReleaseSurpriseFusion:true,crossExchangeLiquidity:true}};
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
