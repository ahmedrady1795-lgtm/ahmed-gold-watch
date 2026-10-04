import {analyze,defaults,scalpAnalyze} from '../../../lib/engine';
import {getMarketSnapshot,getMarketData,getQuoteData} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {aiDecision} from '../../../lib/ai-analyst';
import {getBtcLiquidity} from '../../../lib/liquidity-intelligence';
import {getMotionIntelligence} from '../../../lib/motion-intelligence';
import {studyMarketBehavior} from '../../../lib/market-behavior';
import {masterArbitrate} from '../../../lib/master-arbiter';

export const dynamic='force-dynamic';
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
export async function GET(){
  const now=Date.now();
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
    const motion=getMotionIntelligence(btcPrice,liquidity,btc.c1,now);
    const goldBehavior=studyMarketBehavior(gm.c1,gm.c5,now);
    const bitcoinBehavior=studyMarketBehavior(btc.c1,btc.c5,now);
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldPrice,{quote:quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults,null,null,goldScalp,null,goldBehavior);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:liveBtc?.source||btc.source,candles:btc.source},now,defaults,livePulse,liquidity,bitcoinScalp,motion,bitcoinBehavior);
    const goldMaster=masterArbitrate('GOLD',gold,goldScalp,now);
    const bitcoinMaster=masterArbitrate('BTC',bitcoin,bitcoinScalp,now);
    const goldOut={...gold,rawAction:gold.action,action:goldMaster.action,master:goldMaster,trade:goldMaster.trade};
    const bitcoinOut={...bitcoin,rawAction:bitcoin.action,action:bitcoinMaster.action,master:bitcoinMaster,trade:bitcoinMaster.trade};
    const radar=[
      {asset:'BTC',score:Math.min(92,Math.max(Number(bitcoin.fusion?.buy||0),Number(bitcoin.fusion?.sell||0),Number(bitcoin.hunter?.score||0),Number(bitcoinScalp.score?.long||0),Number(bitcoinScalp.score?.short||0))),status:bitcoinMaster.state,side:bitcoinMaster.action,watchSide:bitcoinMaster.watchSide,mode:bitcoinMaster.state==='TRADE'?bitcoinMaster.trade?.mode:'MASTER'},
      {asset:'GOLD',score:Math.min(92,Math.max(Number(gold.fusion?.buy||0),Number(gold.fusion?.sell||0),Number(gold.hunter?.score||0),Number(goldScalp.score?.long||0),Number(goldScalp.score?.short||0))),status:goldMaster.state,side:goldMaster.action,watchSide:goldMaster.watchSide,mode:goldMaster.state==='TRADE'?goldMaster.trade?.mode:'MASTER'}
    ].sort((a,b)=>b.score-a.score);
    const recovered=actions.length>0&&gm.pricesReady&&Boolean(btc.c1.length)&&Boolean(goldPrice)&&Boolean(btcPrice);
    const futureEvents=(gm.events||[]).filter((e:any)=>e.time>=now).sort((a:any,b:any)=>a.time-b.time);
    const warnings=[...new Set(gm.errors||[])].slice(0,8);
    const autopilot={status:recovered?'recovered':(!gm.pricesReady||!gm.newsReady)?'degraded':'healthy',detected:[...new Set(detected)].slice(0,8),warnings,actions:[...new Set(actions)].slice(0,8),newsReady:gm.newsReady,eventCount:futureEvents.length,nextEvent:futureEvents[0]?{name:futureEvents[0].name,time:futureEvents[0].time,importance:futureEvents[0].importance}:null,pricesReady:gm.pricesReady,goldSource:quote?.source||gm.priceSource||null,btcSource:liveBtc?.source||btc.source};
    if(now-lastDiagLog>30000){lastDiagLog=now;console.info('[AI-DIAG]',JSON.stringify({newsReady:autopilot.newsReady,eventCount:autopilot.eventCount,pricesReady:autopilot.pricesReady,goldSource:autopilot.goldSource,btcSource:autopilot.btcSource,goldAction:gold.action,goldConfidence:gold.confidence,goldLong:gold.longScore,goldShort:gold.shortScore,goldScalp:goldScalp.action,goldScalpLong:goldScalp.score?.long,goldScalpShort:goldScalp.score?.short,goldScalpReason:goldScalp.reason,btcAction:bitcoinMaster.action,btcMaster:bitcoinMaster,btcConfidence:bitcoin.confidence,btcLong:bitcoin.longScore,btcShort:bitcoin.shortScore,btcVetoes:bitcoin.vetoes,btcScalp:bitcoinScalp.action,btcScalpLong:bitcoinScalp.score?.long,btcScalpShort:bitcoinScalp.score?.short,btcScalpReason:bitcoinScalp.reason,btcHunter:bitcoin.hunter?.status,btcHunterMode:bitcoin.hunter?.mode,btcHunterScore:bitcoin.hunter?.score,btcHunterThreshold:bitcoin.hunter?.threshold,btcHunterSide:bitcoin.hunter?.side,btcFusion:bitcoin.fusion,btcPhase:bitcoin.phase,btcLiquidity:bitcoin.liquidity?{side:bitcoin.liquidity.side,buy:bitcoin.liquidity.buy,sell:bitcoin.liquidity.sell,quality:bitcoin.liquidity.quality,pressure:bitcoin.liquidity.pressure,flowDeltaPct:bitcoin.liquidity.flow?.deltaPct,priceChangeBps:bitcoin.liquidity.flow?.priceChangeBps,depthImbalance:bitcoin.liquidity.book?.depthImbalance,absorption:bitcoin.liquidity.absorption}:null,btcAdaptiveCore:bitcoin.adaptiveCore,btcMotion:bitcoin.motion?{side:bitcoin.motion.side,stage:bitcoin.motion.stage,score:bitcoin.motion.score,confidence:bitcoin.motion.confidence,components:bitcoin.motion.components,diagnostics:bitcoin.motion.diagnostics}:null,btcBehavior:bitcoin.behavior?{side:bitcoin.behavior.side,score:bitcoin.behavior.score,confidence:bitcoin.behavior.confidence,pattern:bitcoin.behavior.pattern,analogCount:bitcoin.behavior.analogCount,expectedMoveAtr:bitcoin.behavior.expectedMoveAtr,votes:bitcoin.behavior.votes}:null,status:autopilot.status}));}
    return Response.json({ok:true,model:'Predator Core v8.1 · Exclusive Direction Arbiter',checkedAt:now,autopilot,radar,gold:{...goldOut,scalp:goldScalp},bitcoin:{...bitcoinOut,livePulse,scalp:bitcoinScalp},safety:{execution:false,guaranteed:false,failClosed:true,temporalConfirmation:true,boundedRecovery:true,adaptiveThresholds:true,multiStrategyHunter:true,indicatorFusion:true,pullbackHunter:true,newsAwareBTC:true,liquidityIntelligence:true,adaptiveCore:true,liquidityConflictGate:true,spoofingAwareWalls:true,preMoveMotion:true,sequenceMemory:true,divergenceDetection:true,compressionDetection:true,sweepReclaim:true,marketBehaviorStudy:true,historicalAnalogs:true,behaviorConflictGate:true,exclusiveMasterDecision:true,reversalLock:true,singleActionOutput:true}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,message:'تعذر تشغيل محرك التحليل المتقدم.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
