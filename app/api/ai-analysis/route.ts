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
import {updateBtcMarketLead,updateGoldMarketLead} from '../../../lib/market-lead-ai';
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
import {buildMarketMakerIntent} from '../../../lib/market-maker-intent';
import {setAiSnapshot} from '../../../lib/ai-snapshot-cache';

export const dynamic='force-dynamic';
export const runtime='nodejs';
startServerTickBrain();
let lastDiagLog=0;
let lastAiPayload:any=null,lastAiPayloadAt=0,analysisBusy=false;
type ForwardCommit={side:'BUY'|'SELL';at:number;confidence:number;target:number|null;zone:any;windowSeconds:any;status:string;agreement:number;support:number};
let forwardCommitState:Record<'GOLD'|'BTC',ForwardCommit|null>={GOLD:null,BTC:null};
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
function buildH4Context(c60:any[],price:number|null,now=Date.now()){
  const hour=60*60*1000,block=4*hour;
  const rows=(Array.isArray(c60)?c60:[])
    .filter((c:any)=>Number.isFinite(Number(c?.time))&&Number(c.time)+hour<=now)
    .slice(-56);
  const groups=new Map<number,any[]>();
  for(const c of rows){
    const bucket=Math.floor(Number(c.time)/block)*block;
    const g=groups.get(bucket)||[];g.push(c);groups.set(bucket,g);
  }
  const bars=[...groups.entries()]
    .sort((a,b)=>a[0]-b[0])
    .filter(([,g])=>g.length>=4)
    .map(([time,g])=>{
      const x=g.slice().sort((a:any,b:any)=>Number(a.time)-Number(b.time));
      const open=Number(x[0]?.open),close=Number(x.at(-1)?.close);
      const high=Math.max(...x.map((v:any)=>Number(v.high)).filter(Number.isFinite));
      const low=Math.min(...x.map((v:any)=>Number(v.low)).filter(Number.isFinite));
      return {time,open,high,low,close};
    })
    .filter((b:any)=>[b.open,b.high,b.low,b.close].every(Number.isFinite))
    .slice(-10);
  if(bars.length<4)return {ok:false,side:'WAIT',confidence:0,structure:'غير كافٍ',support:null,resistance:null,checkedAt:now};
  const closes=bars.map((b:any)=>b.close),recent=bars.slice(-6),last=bars.at(-1)!,prev=bars.at(-2)!;
  const fast=closes.slice(-3).reduce((a:number,b:number)=>a+b,0)/Math.min(3,closes.length);
  const slow=closes.slice(-6).reduce((a:number,b:number)=>a+b,0)/Math.min(6,closes.length);
  let buy=0,sell=0;
  if(fast>slow)buy+=18;else if(fast<slow)sell+=18;
  const lastClose=Number(closes.at(-1)!),baseClose=Number(closes.at(-4)!);
  const slope=(lastClose-baseClose)/Math.max(1e-9,Math.abs(baseClose));
  if(slope>.0012)buy+=22;else if(slope<-.0012)sell+=22;else if(slope>0)buy+=9;else if(slope<0)sell+=9;
  if(last.high>prev.high&&last.low>prev.low)buy+=24;
  if(last.high<prev.high&&last.low<prev.low)sell+=24;
  const bodies=recent.slice(-4).map((b:any)=>(b.close-b.open)/Math.max(1e-9,b.high-b.low));
  const bodyAvg=bodies.reduce((a:number,b:number)=>a+b,0)/Math.max(1,bodies.length);
  if(bodyAvg>.14)buy+=16;else if(bodyAvg<-.14)sell+=16;
  const hi=Math.max(...recent.map((b:any)=>b.high)),lo=Math.min(...recent.map((b:any)=>b.low));
  const p=Number(price),pos=Number.isFinite(p)&&hi>lo?(p-lo)/(hi-lo):.5;
  if(pos>=.62)buy+=8;if(pos<=.38)sell+=8;
  const total=buy+sell,edge=total?Math.abs(buy-sell)/total*100:0;
  const side:'BUY'|'SELL'|'WAIT'=edge>=12?(buy>sell?'BUY':'SELL'):'WAIT';
  const confidence=Math.round(Math.max(0,Math.min(88,38+edge*.5+Math.min(10,bars.length))));
  const structure=last.high>prev.high&&last.low>prev.low?'قمم وقيعان أعلى':last.high<prev.high&&last.low<prev.low?'قمم وقيعان أدنى':'هيكل مختلط';
  return {
    ok:true,side,confidence,structure,
    support:Number(lo.toFixed(2)),resistance:Number(hi.toFixed(2)),
    lastClose:Number(last.close.toFixed(2)),slopePct:Number((slope*100).toFixed(3)),
    rangePosition:Math.round(pos*100),bars:bars.length,checkedAt:now
  };
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
  const finite=(k:string,min=-1000,max=1000)=>{const v=Number(url.searchParams.get(prefix+k));return Number.isFinite(v)&&v>=min&&v<=max?v:0;};
  return {
    ok:true,side,stage,score,confidence,at,
    velocity1s:finite('v1',-100,100),velocity3s:finite('v3',-200,200),
    acceleration:finite('ac',-100,100),persistence:finite('ps',0,100),
    imbalance:finite('im',-100,100),burstRate:finite('br',0,50),spreadCompression:finite('sp',-100,100),
    source:'browser live WebSocket'
  };
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

function applyMarketLeadToScalp(scalp:any,lead:any){
  if(!scalp||!lead?.available)return scalp;
  const action=scalp.action==='BUY'||scalp.action==='SELL'?scalp.action:'WAIT';
  const leadSide=lead.side==='BUY'||lead.side==='SELL'?lead.side:'WAIT';
  const armed=Boolean(lead.armed&&leadSide!=='WAIT'&&Number(lead.confidence||0)>=60);
  const building=Boolean(lead.stage==='BUILDING'&&leadSide!=='WAIT'&&Number(lead.confidence||0)>=48);
  let confidence=Number(scalp.confidence||0);
  let leadEffect='NEUTRAL';
  if(armed&&action!=='WAIT'&&action===leadSide){
    confidence=Math.min(88,confidence+5);
    leadEffect='ALIGNED_BOOST';
  }else if(armed&&action!=='WAIT'&&action!==leadSide){
    confidence=Math.max(0,confidence-10);
    leadEffect='OPPOSITION_PENALTY';
  }else if(building&&action!=='WAIT'&&action===leadSide){
    confidence=Math.min(84,confidence+2);
    leadEffect='BUILDING_SUPPORT';
  }
  return {
    ...scalp,
    confidence:Math.round(confidence),
    marketLead:{
      side:leadSide,
      stage:lead.stage||'OBSERVE',
      confidence:Number(lead.confidence||0),
      score:Number(lead.score||0),
      stability:Number(lead.stability||0),
      armed,
      effect:leadEffect
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
    const goldH4=buildH4Context(gm.c60,goldPrice,now);
    const bitcoinH4=buildH4Context(btc.c60,btcPrice,now);
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
    const goldMarketLead=updateGoldMarketLead(mt5GoldTick,now,goldWave||goldTick);
    const bitcoinMarketLead=updateBtcMarketLead(liquidity,now);
    const goldScalp=applyMarketLeadToScalp(
      buildScalpFusion(goldScalpRaw,goldLiquidity,goldMotion,goldLearner,null,goldPrice,goldAtr,goldScalpPrior,goldTick,goldAccumulation,'GOLD'),
      goldMarketLead
    );
    const predatorFusionV2=buildPredatorFusionV2({c1:gm.c1,c5:gm.c5,price:goldPrice,tick:goldTick,goldCore:goldForecastCore,now});
    const bitcoinScalp=applyMarketLeadToScalp(
      buildScalpFusion(bitcoinScalpRaw,liquidity,motion,bitcoinLearner,bitcoinMlRaw,btcPrice,btcAtr,bitcoinScalpPrior,bitcoinTick,bitcoinAccumulation,'BTC'),
      bitcoinMarketLead
    );
    const goldBehavior=studyMarketBehavior(gm.c1,gm.c5,now);
    const bitcoinBehavior=studyMarketBehavior(btc.c1,btc.c5,now);
    const goldStructure=analyzeWaveStructure(gm.c1,gm.c5,now);
    const bitcoinStructure=analyzeWaveStructure(btc.c1,btc.c5,now);
    const goldStateGraph=buildMarketStateGraph(gm.c1,now);
    const bitcoinStateGraph=buildMarketStateGraph(btc.c1,now);
    const goldIntent=buildMarketMakerIntent({
      asset:'GOLD',c1:gm.c1,c5:gm.c5,price:goldPrice,atr:goldAtr,liquidity:goldLiquidity,
      accumulation:goldAccumulation,structure:goldStructure,h4:goldH4,marketLead:goldMarketLead,now
    });
    const bitcoinIntent=buildMarketMakerIntent({
      asset:'BTC',c1:btc.c1,c5:btc.c5,price:btcPrice,atr:btcAtr,liquidity,
      accumulation:bitcoinAccumulation,structure:bitcoinStructure,h4:bitcoinH4,marketLead:bitcoinMarketLead,now
    });
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

    const goldLearningContext={structure:goldStructure,stateGraph:goldStateGraph,accumulation:goldAccumulation,liquidity:goldLiquidity,motion:goldMotion,behavior:goldBehavior,news:goldNews,scalp:goldScalp,decision:gold,marketLead:goldMarketLead,marketMakerIntent:goldIntent};
    const bitcoinLearningContext={structure:bitcoinStructure,stateGraph:bitcoinStateGraph,accumulation:bitcoinAccumulation,liquidity,motion,behavior:bitcoinBehavior,news:bitcoinNews,scalp:bitcoinScalp,decision:bitcoin,marketLead:bitcoinMarketLead,marketMakerIntent:bitcoinIntent};
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
    const goldMovement=buildMovementIntelligence('GOLD',{expected:goldExpectedLearning,stateGraph:goldStateGraph,liquidity:goldLiquidity,motion:goldMotion,structure:goldStructure,accumulation:goldAccumulation,behavior:goldBehavior,learning:goldLearning,tick:goldTick,scalp:goldScalp,decision:gold,evolution:goldEvolution,news:goldNews,price:goldPrice,atr:goldAtr,now,horizonLearning:goldHorizonLearning,marketLead:goldMarketLead});
    const bitcoinMovement=buildMovementIntelligence('BTC',{expected:bitcoinExpectedLearning,stateGraph:bitcoinStateGraph,liquidity,motion,structure:bitcoinStructure,accumulation:bitcoinAccumulation,behavior:bitcoinBehavior,learning:bitcoinLearning,tick:bitcoinTick,scalp:bitcoinScalp,decision:bitcoin,evolution:bitcoinEvolution,news:bitcoinNews,ml:bitcoinMl,price:btcPrice,atr:btcAtr,now,horizonLearning:bitcoinHorizonLearning,marketLead:bitcoinMarketLead});
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
    const buildForwardMove=(asset:'GOLD'|'BTC',hunt:any,scalp:any,movement:any,marketLead:any,pulse:any,liq:any,structure:any,accumulation:any,h4:any,intent:any)=>{
      const rows:Array<{side:'BUY'|'SELL';score:number;weight:number;name:string}>=[];
      const add=(name:string,s:any,score:any,weight:number)=>{
        if((s==='BUY'||s==='SELL')&&Number(score)>0&&weight>0)rows.push({name,side:s,score:Math.max(0,Math.min(92,Number(score))),weight});
      };
      const priceNow=Number.isFinite(Number(pulse?.price))&&Number(pulse.price)>0?Number(pulse.price):null;
      const adaptive15=getNextMoveOutcome(asset+'_FORWARD_15M',priceNow,now);
      const statDirectional=(v:any)=>Number(v?.hits||0)+Number(v?.fails||0);
      const statPosterior=(v:any)=>Number.isFinite(Number(v?.posteriorAccuracy))?Number(v.posteriorAccuracy):50;
      const adaptiveKey=(v:any)=>String(v||'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_\\-]/g,'_').slice(0,64)||'UNKNOWN';
      const leadSide=marketLead?.side;
      const leadStage=String(marketLead?.stage||'OBSERVE');
      const leadAge=Number(marketLead?.ageMs);
      const leadFresh=Boolean(marketLead?.available&&(!Number.isFinite(leadAge)||leadAge<=5000));
      const leadWeight=leadFresh?(marketLead?.armed?1.75:leadStage==='BUILDING'?1.25:.45):0;
      add('lead',leadSide,marketLead?.confidence||marketLead?.score,leadWeight);
      add('m1',movement?.horizons?.oneMinute?.side,movement?.horizons?.oneMinute?.confidence,1.30);
      add('m3',movement?.horizons?.threeMinute?.side,movement?.horizons?.threeMinute?.confidence,.78);
      add('path',hunt?.zoneForecast?.pathForecast?.side,hunt?.zoneForecast?.pathForecast?.confidence,.68);
      add('hunt',hunt?.nextMove?.side,hunt?.nextMove?.confidence,.66);
      add('scalp',scalp?.action,scalp?.confidence,.95);
      const liqSide=liq?.side==='BUY'||liq?.side==='SELL'?liq.side:'WAIT';
      const liqScore=Math.max(Number(liq?.strength||0),Number(liq?.quality||0),Number(liq?.buy||0),Number(liq?.sell||0));
      const accSide=accumulation?.side==='BUY'||accumulation?.side==='SELL'?accumulation.side:'WAIT';
      const accScore=accSide==='BUY'?Number(accumulation?.accumulationScore||0):accSide==='SELL'?Number(accumulation?.distributionScore||0):Math.max(Number(accumulation?.accumulationScore||0),Number(accumulation?.distributionScore||0));
      const structureSide=structure?.m1?.nextSide==='BUY'||structure?.m1?.nextSide==='SELL'?structure.m1.nextSide:(structure?.shortSide==='BUY'||structure?.shortSide==='SELL'?structure.shortSide:'WAIT');
      const structureScore=Math.max(Number(structure?.m1?.confidence||0),Number(structure?.m1?.nextScore||0),Number(structure?.confidence||0));
      add('liquidity',liqSide,liqScore,1.18);
      add('accumulation',accSide,Math.max(accScore,Number(accumulation?.breakoutReadiness||0)),1.12);
      add('structure',structureSide,structureScore,1.08);
      const h4Side=h4?.side==='BUY'||h4?.side==='SELL'?h4.side:'WAIT';
      const h4Confidence=Math.max(0,Math.min(88,Number(h4?.confidence||0)));
      add('H4',h4Side,h4Confidence,h4?.ok?1.02:0);
      const intentSide=intent?.side==='BUY'||intent?.side==='SELL'?intent.side:'WAIT';
      const intentConfidence=Math.max(0,Math.min(90,Number(intent?.confidence||0)));
      const intentPreMove=Boolean(intent?.preMove&&intentConfidence>=54);
      const intentStats=adaptive15?.bySource?.MARKET_MAKER_INTENT_15M||null;
      const intentSamples=statDirectional(intentStats);
      const intentPosterior=statPosterior(intentStats);
      const intentMaturity=Math.min(1,intentSamples/30);
      const intentWeightFactor=Math.max(.78,Math.min(1.18,1+((intentPosterior-50)/50)*.35*intentMaturity));
      const intentBaseWeight=intentPreMove?1.34:intentConfidence>=58?.92:.42;
      add('intent',intentSide,intentConfidence,intentBaseWeight*intentWeightFactor);

      let buy=0,sell=0;
      for(const r of rows){
        const v=r.score*r.weight;
        if(r.side==='BUY')buy+=v;else sell+=v;
      }
      const total=buy+sell;
      if(total<=0)return {side:'WAIT',confidence:0,status:'WAIT',target:null,zone:null,windowSeconds:null,expiresAt:null,reason:'لا يوجد ضغط مبكر متفق عليه حاليًا'};
      const winner:'BUY'|'SELL'=buy>=sell?'BUY':'SELL';
      const win=Math.max(buy,sell),lose=Math.min(buy,sell);
      const share=win/total*100,edge=(win-lose)/total*100;
      const support=rows.filter(r=>r.side===winner).length;
      const oppose=rows.filter(r=>r.side!==winner).length;
      const coreConfirmations=[
        liqSide===winner&&liqScore>=55,
        accSide===winner&&Math.max(accScore,Number(accumulation?.breakoutReadiness||0))>=52,
        structureSide===winner&&structureScore>=50
      ].filter(Boolean).length;
      const coreOpposition=[
        liqSide!=='WAIT'&&liqSide!==winner&&liqScore>=58,
        accSide!=='WAIT'&&accSide!==winner&&Math.max(accScore,Number(accumulation?.breakoutReadiness||0))>=56,
        structureSide!=='WAIT'&&structureSide!==winner&&structureScore>=54
      ].filter(Boolean).length;
      let confidence=Math.round(Math.max(0,Math.min(86,33+edge*.43+support*4.2-oppose*3.2+coreConfirmations*3.5-coreOpposition*5)));
      const adaptiveSource=intentPreMove&&intentSide===winner?'MARKET_MAKER_INTENT_15M':'H4_FORWARD_15M';
      const adaptiveRegime=adaptiveKey('H4_'+String(h4Side||'WAIT')+'__'+String(intent?.phase||'NEUTRAL'));
      const adaptiveSourceStats=adaptive15?.bySource?.[adaptiveSource]||null;
      const adaptiveRegimeStats=adaptive15?.byRegime?.[adaptiveRegime]||null;
      const adaptiveSrKey=adaptiveKey(adaptiveSource+'__'+adaptiveRegime);
      const adaptiveSrStats=adaptive15?.bySourceRegime?.[adaptiveSrKey]||null;
      const sourceSamples=statDirectional(adaptiveSourceStats),regimeSamples=statDirectional(adaptiveRegimeStats),srSamples=statDirectional(adaptiveSrStats);
      const sourcePosterior=statPosterior(adaptiveSourceStats),regimePosterior=statPosterior(adaptiveRegimeStats),srPosterior=statPosterior(adaptiveSrStats);
      let adaptiveAdjustment=0;
      if(sourceSamples>=5)adaptiveAdjustment+=Math.max(-5,Math.min(5,(sourcePosterior-50)*.18))*Math.min(1,sourceSamples/24);
      if(regimeSamples>=6)adaptiveAdjustment+=Math.max(-3,Math.min(3,(regimePosterior-50)*.12))*Math.min(1,regimeSamples/30);
      if(srSamples>=4)adaptiveAdjustment+=Math.max(-4,Math.min(4,(srPosterior-50)*.16))*Math.min(1,srSamples/18);
      const adaptiveFailureStreak=Number(adaptive15?.sourceRegimeFailureStreaks?.[adaptiveSrKey]||0);
      if(adaptiveFailureStreak>=3)adaptiveAdjustment-=6;else if(adaptiveFailureStreak===2)adaptiveAdjustment-=3;
      const adaptiveWf=adaptive15?.walkForwardBySource?.[adaptiveSource]||adaptive15?.walkForward||null;
      if(Number(adaptiveWf?.oos?.n||0)>=10){
        if(adaptiveWf?.status==='PASS')adaptiveAdjustment+=2;
        if(adaptiveWf?.status==='WATCH')adaptiveAdjustment-=2;
        if(adaptiveWf?.drift?.status==='DEGRADING')adaptiveAdjustment-=4;
      }
      adaptiveAdjustment=Math.round(Math.max(-12,Math.min(8,adaptiveAdjustment)));
      confidence+=adaptiveAdjustment;
      const adaptiveWeak=Boolean((sourceSamples>=8&&sourcePosterior<44)||(srSamples>=6&&srPosterior<43)||adaptiveFailureStreak>=3);
      const intentAligned=Boolean(intentSide===winner&&intentConfidence>=52);
      const intentOpposes=Boolean(intentSide!=='WAIT'&&intentSide!==winner&&intentConfidence>=60);
      if(intentAligned)confidence+=intentPreMove?8:4;
      if(intentOpposes)confidence-=intentConfidence>=72?13:8;

      const m5Side=movement?.horizons?.fiveMinute?.side;
      const m5Confidence=Number(movement?.horizons?.fiveMinute?.confidence||0);
      const m5Active=(m5Side==='BUY'||m5Side==='SELL')&&m5Confidence>=50;
      const m5Opposes=Boolean(m5Active&&m5Side!==winner);
      if(m5Opposes)confidence-=m5Confidence>=68?13:8;
      else if(m5Active&&m5Side===winner)confidence+=Math.min(4,Math.round((m5Confidence-48)/8));
      const h4Active=Boolean(h4?.ok&&(h4Side==='BUY'||h4Side==='SELL')&&h4Confidence>=48);
      const h4Opposes=Boolean(h4Active&&h4Side!==winner);
      if(h4Active&&h4Side===winner)confidence+=Math.min(7,Math.round((h4Confidence-42)/7));
      if(h4Opposes)confidence-=h4Confidence>=68?11:7;

      if(leadFresh&&marketLead?.armed&&leadSide===winner)confidence=Math.min(89,confidence+8);
      else if(leadFresh&&leadStage==='BUILDING'&&leadSide===winner)confidence=Math.min(87,confidence+4);
      if(!leadFresh&&marketLead?.available)confidence-=4;
      confidence=Math.max(0,Math.min(89,Math.round(confidence)));

      const leadSupports=Boolean(leadFresh&&leadSide===winner&&(marketLead?.armed||leadStage==='BUILDING'));
      const coreReadyBase=(coreConfirmations>=2||(coreConfirmations>=1&&leadSupports&&support>=3)||(intentPreMove&&intentAligned&&coreConfirmations>=1&&support>=3))&&(!h4Opposes||coreConfirmations>=2&&share>=61&&support>=3)&&(!intentOpposes||coreConfirmations===3&&share>=64);
      const coreReady=coreReadyBase&&(!adaptiveWeak||(coreConfirmations>=2&&share>=63&&support>=4));
      if(share<57||support<2||confidence<47||!coreReady)return {
        side:'WAIT',confidence,status:'WAIT',target:null,zone:null,windowSeconds:null,expiresAt:null,
        confirmations:{core:coreConfirmations,opposition:coreOpposition,liquidity:liqSide,accumulation:accSide,structure:structureSide,lead:leadSide,intent:intentSide},
        adaptiveLearning:{source:adaptiveSource,adjustment:adaptiveAdjustment,sourceSamples,sourcePosterior:Number(sourcePosterior.toFixed(1)),regimeSamples,regimePosterior:Number(regimePosterior.toFixed(1)),sourceRegimeSamples:srSamples,sourceRegimePosterior:Number(srPosterior.toFixed(1)),failureStreak:adaptiveFailureStreak,weak:adaptiveWeak,intentWeightFactor:Number(intentWeightFactor.toFixed(3))},
        reason:m5Opposes?'M5 يعاكس الإشارة القصيرة؛ تم إيقاف التوقع المبكر حتى يتضح المسار':!coreReady?'السيولة والتجميع وهيكل الحركة لم تتفق بعد بما يكفي لاعتماد الحركة القادمة':'الإشارات المبكرة ما زالت منقسمة؛ لا يوجد اتجاه أمامي كافٍ'
      };

      const ahead=(v:any)=>{
        const n=Number(v);if(priceNow==null||!Number.isFinite(n))return Number.isFinite(n);
        return winner==='BUY'?n>priceNow:n<priceNow;
      };
      const pd=hunt?.zoneForecast?.pathForecast?.priceDestination;
      const rawZone=pd?.zone&&pd?.side===winner?pd.zone:null;
      const zoneLow=Number(rawZone?.low),zoneHigh=Number(rawZone?.high),zoneMid=Number(rawZone?.mid);
      const zoneValid=Boolean(rawZone&&Number.isFinite(zoneLow)&&Number.isFinite(zoneHigh)&&Number.isFinite(zoneMid)&&(
        priceNow==null||(winner==='BUY'?zoneHigh>priceNow:zoneLow<priceNow)
      ));
      const pathZone=zoneValid?rawZone:null;
      const target15=hunt?.quickSignalTargets?.fifteenMinute||hunt?.fifteenMinuteTarget||null;
      const target15Price=target15?.side===winner&&ahead(target15?.price)?Number(target15.price):null;
      const quick=hunt?.quickSignalTargets?.fiveMinute||hunt?.quickSignalTargets?.oneMinute;
      const quickPrice=quick?.side===winner&&ahead(quick?.price)?Number(quick.price):null;
      const scalpNext=scalp?.nextPrice||scalp?.fusionV8?.nextPrice||scalp?.projection||null;
      const scalpPrice=(scalpNext?.side===winner||!scalpNext?.side)&&ahead(scalpNext?.price)?Number(scalpNext.price):null;
      const intentTarget=intentSide===winner&&ahead(intent?.targetPrice)?Number(intent.targetPrice):null;
      const target=intentTarget??target15Price??(pathZone&&ahead(pathZone.mid)?Number(pathZone.mid):quickPrice??scalpPrice??null);

      // Do not label a consumed/behind destination as "the next move".
      if(priceNow!=null&&target==null){
        confidence=Math.max(0,confidence-10);
        return {
          side:'WAIT',confidence,status:'WAIT',target:null,zone:null,windowSeconds:null,expiresAt:null,
          agreement:Math.round(share),support,opposition:oppose,priceNow,
          reason:'الاتجاه موجود لكن الهدف السابق تم استهلاكه أو أصبح خلف السعر؛ ننتظر وجهة جديدة أمامية'
        };
      }

      const released=Boolean(leadFresh&&marketLead?.released&&leadSide===winner);
      const momentum=Number(pulse?.momentum||0);
      const pulseDir=String(pulse?.direction||'FLAT');
      const pulseAligned=(winner==='BUY'&&pulseDir==='UP')||(winner==='SELL'&&pulseDir==='DOWN');
      const alreadyMoving=Boolean(released&&pulseAligned&&momentum>=72);
      if(alreadyMoving)confidence=Math.max(45,confidence-5);

      const armed=Boolean(leadFresh&&marketLead?.armed&&leadSide===winner&&!alreadyMoving);
      const intentArmed=Boolean(intentPreMove&&intentAligned&&!alreadyMoving);
      const building=Boolean(!armed&&!intentArmed&&leadFresh&&leadStage==='BUILDING'&&leadSide===winner&&!alreadyMoving);
      const status=alreadyMoving?'IN_PROGRESS':armed||intentArmed?'PRE_MOVE':building?'BUILDING':'SHORT_HORIZON';
      const leadWindow=marketLead?.windowSeconds;
      const hasLeadWindow=leadFresh&&leadSide===winner&&Number.isFinite(Number(leadWindow?.min))&&Number.isFinite(Number(leadWindow?.max));
      const fallbackWindow={min:120,max:900};
      const windowSeconds=hasLeadWindow
        ?{min:Math.max(60,Math.min(300,Math.round(Number(leadWindow?.min))*3)),max:Math.max(300,Math.min(900,Math.round(Number(leadWindow?.max))*6))}
        :fallbackWindow;
      if(windowSeconds.max<windowSeconds.min)windowSeconds.max=windowSeconds.min+5;

      const distancePct=priceNow!=null&&target!=null?Math.abs(target-priceNow)/priceNow*100:null;
      if(distancePct!=null&&distancePct<0.003&&alreadyMoving){
        return {
          side:'WAIT',confidence:Math.min(confidence,44),status:'TARGET_CONSUMED',target:null,zone:null,windowSeconds:null,expiresAt:null,
          agreement:Math.round(share),support,opposition:oppose,priceNow,
          reason:'الحركة وصلت تقريبًا للهدف؛ لا يتم عرضها كحركة قادمة جديدة'
        };
      }

      const sourceParts=rows.filter(r=>r.side===winner).sort((a,b)=>b.weight-a.weight).slice(0,3).map(r=>r.name);
      return {
        side:winner,confidence,status,target,horizonMinutes:15,h4Context:h4?.ok?{side:h4Side,confidence:h4Confidence,structure:h4.structure,support:h4.support,resistance:h4.resistance,rangePosition:h4.rangePosition}:null,
        zone:pathZone?{low:Number(pathZone.low),high:Number(pathZone.high),mid:Number(pathZone.mid)}:null,
        windowSeconds,expiresAt:now+windowSeconds.max*1000,agreement:Math.round(share),support,opposition:oppose,
        priceNow,distancePct:distancePct==null?null:Number(distancePct.toFixed(4)),
        freshness:{leadFresh,leadAgeMs:Number.isFinite(leadAge)?leadAge:null,m5Opposes,h4Opposes,intentOpposes,alreadyMoving},
        confirmations:{core:coreConfirmations,opposition:coreOpposition,liquidity:liqSide,accumulation:accSide,structure:structureSide,lead:leadSide,intent:intentSide},
        adaptiveLearning:{source:adaptiveSource,adjustment:adaptiveAdjustment,sourceSamples,sourcePosterior:Number(sourcePosterior.toFixed(1)),regimeSamples,regimePosterior:Number(regimePosterior.toFixed(1)),sourceRegimeSamples:srSamples,sourceRegimePosterior:Number(srPosterior.toFixed(1)),failureStreak:adaptiveFailureStreak,weak:adaptiveWeak,intentWeightFactor:Number(intentWeightFactor.toFixed(3))},
        reason:(alreadyMoving?'الحركة بدأت ولم تصل للوجهة بعد':armed?'ضغط سابق للحركة متماسك':intentArmed?'سحب سيولة/امتصاص يسبق الحركة':building?'ضغط مبكر يتكوّن':'ترجيح 15 دقيقة')+' · H4 '+(h4Side==='BUY'?'صاعد':h4Side==='SELL'?'هابط':'محايد')+' · تأكيد أساسي '+coreConfirmations+'/3 · '+sourceParts.join(' + ')
      };
    };
    const stabilizeForwardMove=(asset:'GOLD'|'BTC',candidate:any,pulse:any)=>{
      const prev=forwardCommitState[asset];
      const side:('BUY'|'SELL'|'WAIT')=candidate?.side==='BUY'||candidate?.side==='SELL'?candidate.side:'WAIT';
      const price=Number(pulse?.price);
      const priceOk=Number.isFinite(price)&&price>0;
      const ahead=(s:'BUY'|'SELL',target:number|null)=>{
        if(target==null||!Number.isFinite(Number(target))||!priceOk)return true;
        return s==='BUY'?Number(target)>price:Number(target)<price;
      };
      const prevAlive=Boolean(prev&&now-prev.at<=180000&&ahead(prev.side,prev.target));
      const keepPrev=(reason:string)=>{
        if(!prev)return candidate;
        const age=Math.max(0,now-prev.at);
        const decay=Math.floor(age/6000)*2;
        return {
          ...candidate,
          side:prev.side,
          confidence:Math.max(48,Math.min(86,prev.confidence-decay)),
          status:'STABILITY_HOLD',
          target:prev.target,
          zone:prev.zone,
          windowSeconds:prev.windowSeconds,
          expiresAt:now+Math.max(8000,Number(prev.windowSeconds?.max||25)*1000),
          agreement:Math.max(Number(candidate?.agreement||0),prev.agreement),
          support:Math.max(Number(candidate?.support||0),prev.support),
          stability:{locked:true,ageMs:age,flipBlocked:true},
          reason
        };
      };

      if(side==='WAIT'){
        if(prevAlive&&prev&&prev.confidence>=55&&now-prev.at<=90000){
          return keepPrev('الاتجاه السابق ما زال صالحًا؛ تم منع التردد اللحظي حتى يظهر انعكاس مؤكد');
        }
        if(!prevAlive)forwardCommitState[asset]=null;
        return candidate;
      }

      const confidence=Math.max(0,Math.min(89,Math.round(Number(candidate?.confidence||0))));
      const target=Number.isFinite(Number(candidate?.target))?Number(candidate.target):null;
      const commit=()=>{
        forwardCommitState[asset]={
          side,at:now,confidence,target,zone:candidate?.zone||null,windowSeconds:candidate?.windowSeconds||null,
          status:String(candidate?.status||'SHORT_HORIZON'),agreement:Number(candidate?.agreement||0),support:Number(candidate?.support||0)
        };
        return {...candidate,stability:{locked:true,ageMs:0,flipBlocked:false}};
      };

      if(!prev||!prevAlive||prev.side===side)return commit();

      const age=now-prev.at;
      const agreement=Number(candidate?.agreement||0);
      const support=Number(candidate?.support||0);
      const decisiveFlip=confidence>=Math.max(64,prev.confidence+8)&&agreement>=63&&support>=3;
      const preMoveFlip=String(candidate?.status)==='PRE_MOVE'&&confidence>=62&&agreement>=62&&support>=3;
      const agedFlip=age>=120000&&confidence>=58&&agreement>=60&&support>=2;
      if(decisiveFlip||preMoveFlip||agedFlip)return commit();

      return keepPrev('تم رفض انعكاس مؤقت؛ الاتجاه لا يتغير إلا بتفوق واضح ومستقل للإشارة العكسية');
    };
    const compactAsset=(asset:'GOLD'|'BTC',x:any,hunt:any,recommendation:any,stateGraph:any,scalp:any,pulse:any,goldCore?:any,predator?:any,marketLead?:any,movement?:any,liq?:any,structure?:any,accumulation?:any,h4?:any,intent?:any)=>({
      asset,
      forwardMove:stabilizeForwardMove(asset,buildForwardMove(asset,hunt,scalp,movement,marketLead,pulse,liq,structure,accumulation,h4,intent),pulse),
      h4Context:h4||null,
      marketMakerIntent:intent?{
        ok:Boolean(intent.ok),side:intent.side||'WAIT',phase:intent.phase||'NEUTRAL',confidence:Number(intent.confidence||0),score:Number(intent.score||0),preMove:Boolean(intent.preMove),
        liquidityTaken:intent.liquidityTaken||'NONE',sweepLevel:Number.isFinite(Number(intent.sweepLevel))?Number(intent.sweepLevel):null,targetPrice:Number.isFinite(Number(intent.targetPrice))?Number(intent.targetPrice):null,targetKind:intent.targetKind||'NONE',
        compression:Number(intent.compression||0),rejection:Number(intent.rejection||0),absorption:Number(intent.absorption||0),institutional:Number(intent.institutional||0),h4Alignment:intent.h4Alignment||'NEUTRAL',
        sequence:Array.isArray(intent.sequence)?intent.sequence.slice(0,8):[],reasons:Array.isArray(intent.reasons)?intent.reasons.slice(0,5):[]
      }:null,
      liquidity:liq?{
        side:liq.side||'WAIT',
        buy:Math.max(0,Math.min(100,Math.round(Number(liq.buy||0)))),
        sell:Math.max(0,Math.min(100,Math.round(Number(liq.sell||0)))),
        strength:Math.max(0,Math.min(100,Math.round(Number(liq.strength||0)))),
        quality:Math.max(0,Math.min(100,Math.round(Number(liq.quality||0)))),
        source:liq.source||null
      }:null,
      accumulation:accumulation?{
        ok:Boolean(accumulation.ok),
        phase:accumulation.phase||'NEUTRAL',
        side:accumulation.side||'WAIT',
        accumulationScore:Math.max(0,Math.min(100,Math.round(Number(accumulation.accumulationScore||0)))),
        distributionScore:Math.max(0,Math.min(100,Math.round(Number(accumulation.distributionScore||0)))),
        breakoutReadiness:Math.max(0,Math.min(100,Math.round(Number(accumulation.breakoutReadiness||0))))
      }:null,
      movementStructure:structure?{
        ok:Boolean(structure.ok),
        side:structure.side||'WAIT',
        confidence:Math.max(0,Math.min(100,Math.round(Number(structure.confidence||0)))),
        path:structure.path||'UNKNOWN',
        shortSide:structure.shortSide||'WAIT',
        followSide:structure.followSide||'WAIT',
        m1:structure.m1?{phase:structure.m1.phase||'TRANSITION',structure:structure.m1.structure||'MIXED',side:structure.m1.side||'WAIT',nextSide:structure.m1.nextSide||'WAIT',confidence:Math.max(0,Math.min(100,Math.round(Number(structure.m1.confidence||0))))}:null,
        m5:structure.m5?{phase:structure.m5.phase||'TRANSITION',structure:structure.m5.structure||'MIXED',side:structure.m5.side||'WAIT',nextSide:structure.m5.nextSide||'WAIT',confidence:Math.max(0,Math.min(100,Math.round(Number(structure.m5.confidence||0))))}:null
      }:null,
      price:Number.isFinite(Number(pulse?.price??x?.price))?Number(pulse?.price??x?.price):null,
      livePulse:pulse?{
        price:Number.isFinite(Number(pulse.price))?Number(pulse.price):null,
        sourceTime:Number(pulse.sourceTime||0),
        source:pulse.source||null,
        direction:pulse.direction||'FLAT',
        momentum:Number(pulse.momentum||0)
      }:null,
      marketLead:marketLead?{
        available:Boolean(marketLead.available),
        side:marketLead.side||'WAIT',
        stage:marketLead.stage||'OBSERVE',
        mode:marketLead.mode||'OFFLINE',
        score:Number(marketLead.score||0),
        confidence:Number(marketLead.confidence||0),
        armed:Boolean(marketLead.armed),
        released:Boolean(marketLead.released),
        quiet:Boolean(marketLead.quiet),
        support:Number(marketLead.support||0),
        opposition:Number(marketLead.opposition||0),
        stability:Number(marketLead.stability||0),
        source:marketLead.source||null,
        sourceAt:Number(marketLead.sourceAt||0),
        ageMs:Number(marketLead.ageMs||0),
        windowSeconds:marketLead.windowSeconds||null,
        reason:marketLead.reason||'',
        evidence:Array.isArray(marketLead.evidence)?marketLead.evidence.slice(0,4):[],
        metrics:marketLead.metrics||null
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
    // Numeric releases may legitimately wait for Actual. Speeches/remarks/minutes never do.
    // Narrative events are followed briefly for market reaction, then removed from the featured card.
    const releaseGraceMs=30*60*1000;
    const narrativeGraceMs=8*60*1000;
    const isNarrativeEvent=(e:any)=>/\b(speaks?|speech|remarks?|testif(?:y|ies|ied)|testimony|press conference|minutes|beige book|statement|hearing|panel discussion|interview)\b/i.test(String(e?.name||''));
    const expectsActual=(e:any)=>!isNarrativeEvent(e);
    const eventsSorted=[...(gm.events||[])].sort((a:any,b:any)=>a.time-b.time);
    const isAssetRelevantEvent=(e:any)=>{
      const name=String(e?.name||'');
      if(/API Weekly Statistical Bulletin|crude oil|gasoline|distillate|natural gas storage|EIA petroleum/i.test(name))return false;
      if(/CPI|PCE|PPI|inflation|price index|nonfarm|payroll|employment|unemployment|jobless|claims|JOLTS|GDP|retail sales|ISM|PMI|consumer confidence|durable goods|industrial production|FOMC|Fed\b|Powell|interest rate|rate decision|Treasury|yield/i.test(name))return true;
      return Number(e?.importance||0)>=2;
    };
    const pendingReleased=eventsSorted
      .filter((e:any)=>isAssetRelevantEvent(e)&&expectsActual(e)&&e.time<now&&now-e.time<=releaseGraceMs&&!String(e.actual||'').trim())
      .sort((a:any,b:any)=>b.time-a.time)[0]||null;
    const liveNarrative=eventsSorted
      .filter((e:any)=>isAssetRelevantEvent(e)&&isNarrativeEvent(e)&&e.time<=now&&now-e.time<=narrativeGraceMs)
      .sort((a:any,b:any)=>b.time-a.time)[0]||null;
    const futureEvents=eventsSorted.filter((e:any)=>e.time>=now&&isAssetRelevantEvent(e));
    const featuredEvent=pendingReleased||liveNarrative||futureEvents[0]||null;
    const featuredNarrative=Boolean(featuredEvent&&isNarrativeEvent(featuredEvent));
    const featuredEventStatus=featuredEvent
      ?(featuredEvent.time<now&&featuredNarrative?'TEXT_EVENT_LIVE':featuredEvent.time<now&&!String(featuredEvent.actual||'').trim()?'AWAITING_ACTUAL':String(featuredEvent.actual||'').trim()?'RELEASED':'UPCOMING')
      :null;
    const featuredGoldBase=featuredEvent?buildNewsIntelligence('GOLD',[featuredEvent],now):null;
    const featuredBtcBase=featuredEvent?buildNewsIntelligence('BTC',[featuredEvent],now):null;
    const featuredGoldNews=featuredGoldBase&&webIntel?mergeNewsWithWeb(featuredGoldBase,webIntel.gold):featuredGoldBase;
    const featuredBtcNews=featuredBtcBase&&webIntel?mergeNewsWithWeb(featuredBtcBase,webIntel.btc):featuredBtcBase;
    const compactNewsImpact=(x:any)=>{if(!x)return null;
      const side=String(x.side||'WAIT');
      const confidence=Math.max(0,Math.min(88,Number(x.confidence||0)));
      const preEvent=String(x.phase||'')==='PRE_EVENT';
      const edgeCap=featuredNarrative&&preEvent?8:preEvent?16:22;
      const edge=side==='BUY'||side==='SELL'?Math.min(edgeCap,confidence*.28):0;
      const upProbability=Math.round(Math.max(0,Math.min(100,50+(side==='BUY'?edge:side==='SELL'?-edge:0))));
      const downProbability=100-upProbability;
      return {
      side:x.side||'WAIT',
      confidence:Number(x.confidence||0),
      upProbability,
      downProbability,
      probabilityMode:preEvent?'PRE_EVENT':'LIVE_IMPACT',
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
    };};
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
        status:featuredEventStatus,
        eventType:featuredNarrative?'NARRATIVE':'NUMERIC',
        expectsActual:featuredEvent?expectsActual(featuredEvent):false,
        awaitingActual:featuredEventStatus==='AWAITING_ACTUAL',
        releaseAgeSeconds:featuredEvent.time<now?Math.round((now-featuredEvent.time)/1000):0,
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
          marketLead:{side:goldMarketLead.side,stage:goldMarketLead.stage,score:goldMarketLead.score,confidence:goldMarketLead.confidence,stability:goldMarketLead.stability,armed:goldMarketLead.armed},
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
          marketLead:{side:bitcoinMarketLead.side,stage:bitcoinMarketLead.stage,score:bitcoinMarketLead.score,confidence:bitcoinMarketLead.confidence,stability:bitcoinMarketLead.stability,armed:bitcoinMarketLead.armed},
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

    const orderedNewsEvents=eventsSorted
      .filter((e:any)=>{
        if(!isAssetRelevantEvent(e))return false;
        const t=Number(e?.time);if(!Number.isFinite(t))return false;
        if(t>=now)return t<=now+30*86400000;
        const age=now-t,hasActual=Boolean(String(e?.actual||'').trim());
        if(hasActual)return age<=10*60000;
        if(isNarrativeEvent(e))return age<=narrativeGraceMs;
        return expectsActual(e)&&age<=releaseGraceMs;
      })
      .sort((a:any,b:any)=>Number(a.time)-Number(b.time))
      .slice(0,12)
      .map((e:any)=>({
        id:e.id,name:e.name,time:Number(e.time),importance:Number(e.importance||1),
        actual:e.actual||'',forecast:e.forecast||'',previous:e.previous||'',source:e.source||'',
        eventType:isNarrativeEvent(e)?'NARRATIVE':'NUMERIC'
      }));

    const payload:any={
      ok:true,
      model:'Predator AI Lite',
      checkedAt:now,
      autopilot,
      newsEvents:orderedNewsEvents,
      webScout:webIntel?{
        ok:Boolean(webIntel.ok),checkedAt:webIntel.checkedAt,cached:Boolean(webIntel.cached),
        sources:webIntel.sources.map((s:any)=>({id:s.id,name:s.name,ok:Boolean(s.ok),itemCount:Number(s.itemCount||0),error:s.error||null})),
        gold:{side:webIntel.gold.side,confidence:webIntel.gold.confidence,risk:webIntel.gold.risk,sourceCount:webIntel.gold.sourceCount,freshCount:webIntel.gold.freshCount},
        btc:{side:webIntel.btc.side,confidence:webIntel.btc.confidence,risk:webIntel.btc.risk,sourceCount:webIntel.btc.sourceCount,freshCount:webIntel.btc.freshCount}
      }:null,
      gold:compactAsset('GOLD',gold,goldHunt,goldRecommendation,goldStateGraph,goldScalp,goldLivePulse,goldForecastCore,predatorFusionV2,goldMarketLead,goldMovement,goldLiquidity,goldStructure,goldAccumulation,goldH4,goldIntent),
      bitcoin:compactAsset('BTC',bitcoin,bitcoinHunt,bitcoinRecommendation,bitcoinStateGraph,bitcoinScalp,livePulse,undefined,undefined,bitcoinMarketLead,bitcoinMovement,liquidity,bitcoinStructure,bitcoinAccumulation,bitcoinH4,bitcoinIntent)
    };

    const compact15Validation=(v:any)=>v?{
      global:v.global||null,
      pending:Number(v.pending||0),
      learningSamples:Number(v.learningSamples||0),
      readyForLearning:Boolean(v.readyForLearning),
      recent:Array.isArray(v.recent)?v.recent.slice(0,5).map((r:any)=>({
        at:r.at,settledAt:r.settledAt,side:r.side,outcome:r.outcome,seconds:r.seconds,mfeBps:r.mfeBps,maeBps:r.maeBps,horizonLabel:r.horizonLabel
      })):[],
      walkForward:v.walkForward?{
        status:v.walkForward.status||'COLLECTING',
        ready:Boolean(v.walkForward.ready),
        directional:Number(v.walkForward.directional||0),
        oos:v.walkForward.oos?{n:Number(v.walkForward.oos.n||0),accuracy:v.walkForward.oos.accuracy,coverage:v.walkForward.oos.coverage}:null,
        drift:v.walkForward.drift?{status:v.walkForward.drift.status||'COLLECTING',recentAccuracy:v.walkForward.drift.recentAccuracy,delta:v.walkForward.drift.delta}:null
      }:null
    }:null;

    const recordForward15=(asset:'GOLD'|'BTC',node:any,price:any,atr:any,intent:any,h4:any)=>{
      const fm=node?.forwardMove||{};
      const s=fm?.side==='BUY'||fm?.side==='SELL'?fm.side:'WAIT';
      const source=intent?.preMove&&intent?.side===s?'MARKET_MAKER_INTENT_15M':'H4_FORWARD_15M';
      return recordNextMoveOutcome({
        asset:asset+'_FORWARD_15M',price:Number(price),atr:Number(atr),now,
        hunt:{nextMove:{
          side:s,confidence:Number(fm?.confidence||0),source,
          micro:{
            intentPhase:String(intent?.phase||'NEUTRAL'),
            liquidityTaken:String(intent?.liquidityTaken||'NONE'),
            h4Alignment:String(intent?.h4Alignment||'NEUTRAL'),
            intentPreMove:Boolean(intent?.preMove),
            intentConfidence:Number(intent?.confidence||0)
          }
        }},
        regime:'H4_'+String(h4?.side||'WAIT')+'__'+String(intent?.phase||'NEUTRAL'),
        horizonMs:15*60*1000,horizonLabel:'M15_FORWARD',
        targetPrice:Number.isFinite(Number(fm?.target))?Number(fm.target):null,
        stopPrice:Number.isFinite(Number(node?.huntForecast?.invalidation))?Number(node.huntForecast.invalidation):null,
        minRecordIntervalMs:3*60*1000,
        barrierScale:.55,minBarrierBps:asset==='GOLD'?2.5:7,maxBarrierBps:asset==='GOLD'?18:35
      });
    };

    const gold15Validation=recordForward15('GOLD',payload.gold,goldLearningPrice,goldAtr,goldIntent,goldH4);
    const bitcoin15Validation=recordForward15('BTC',payload.bitcoin,btcPrice,btcAtr,bitcoinIntent,bitcoinH4);
    payload.gold.forecastValidation15m=compact15Validation(gold15Validation);
    payload.bitcoin.forecastValidation15m=compact15Validation(bitcoin15Validation);

    lastAiPayload=payload;lastAiPayloadAt=Date.now();
    setAiSnapshot(payload,lastAiPayloadAt);
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
