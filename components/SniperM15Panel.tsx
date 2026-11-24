'use client';

import {buildNewsIntelligence} from '../lib/news-intelligence';
import {assessSniperMarketContext,type SentimentReading} from '../lib/sniper-market-context';
import {usePaxgComparison,usePaxgFlow} from './usePaxgComparison';
import type {PaxgSide} from '../lib/paxg-flow';
import {observeGoldProxyFlow} from '../lib/gold-proxy-readout';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import SniperM15Summary from './SniperM15Summary';
import EarlyMoveAlert from './EarlyMoveAlert';
import {buildM15HuntPreview} from '../lib/sniper-m15-hunt-preview';
import {detectLiquidityMagnets} from '../lib/sniper-liquidity-magnets';
import {fuseLocalSniper} from '../lib/sniper-local-fusion';
import {localCandleMl} from '../lib/local-candle-ml';
import {goldLiquidityMeter,combineGoldLiquidity} from '../lib/gold-liquidity-meter';
import {useBtcCrossFlow} from './useBtcCrossFlow';
import {reviewEarlyFailures} from '../lib/sniper-movement-proof';
import {assessFlowProfile} from '../lib/flow-profile-decision';
import {observeSniperOrderFlow} from '../lib/sniper-order-flow-observation';
import SniperOrderFlowStrip from './SniperOrderFlowStrip';
import {auditM15HuntDirection} from '../lib/sniper-m15-hunt-proof';
import {assessM1DirectionalPriority} from '../lib/sniper-m1-priority';
import {chartM5EarlyCue,cueForwardObservation} from '../lib/sniper-m5-early-cue';
import {btcOrderflowMatchesChart,detectShortTapeWatch} from '../lib/btc-orderflow';
import {detectM1ReclaimWatch} from '../lib/sniper-m1-reclaim-watch';
import SniperM15HuntOverlay from './SniperM15HuntOverlay';
import {analyzeM15MarketStructure} from '../lib/sniper-market-structure';
import SniperMarketStructureOverlay,{SniperStructureRSI} from './SniperMarketStructureOverlay';
import {extendIllustrativeM15ToTargets} from '../lib/sniper-m15-target-bridge';
import {buildM15WatchGuide} from '../lib/sniper-m15-watch-guide';
import OrderFlowRadar from './OrderFlowRadar';
import GoldRadarBadge from './GoldRadarBadge';
import {selectGoldSpotDisplay,type GoldPreparationView} from '../lib/gold-spot-fallback';
import {selectGoldLocalWatch,type GoldLocalWatchView} from '../lib/sniper-gold-local-watch';
import type {RadarView} from '../lib/order-flow-radar';
import {assessSniperEntryCandle} from '../lib/sniper-entry-candle';
import {assessRadarNextCandle} from '../lib/sniper-radar-next-candle';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {assessChartObservation} from '../lib/chart-observation-radar';
import {buildDistantMovementOutlook} from '../lib/sniper-movement-outlook';
import {buildM15Scenario,closedM15Bars,sampledLiveM15,observeM15Tick} from '../lib/sniper-m15-scenario';
import {mt5M15Viewport} from '../lib/sniper-m15-mt5-viewport';
import {assessM15FrozenChartAlignment} from '../lib/sniper-m15-visual-alignment';
import type {ObservedM15} from '../lib/sniper-m15-scenario';
import type {M15Scenario,M15Side} from '../lib/sniper-m15-scenario';
import {frozenM15Decision,retainM15Snapshot} from '../lib/sniper-m15-freeze';
import {observedM15Bias,m15ObservationSide} from '../lib/sniper-m15-bias';
import {verifiedM15Archive} from '../lib/sniper-m15-archive-store';
import {m15WalkForward,firstM15Evidence} from '../lib/sniper-m15-walkforward';
import {goldMarketSession,goldM15SessionBreakOnly} from '../lib/gold-market-session';
import {buildChartOverlay} from '../lib/chart-trading-overlay';
import {detectPreMovePressure} from '../lib/pre-move-pressure';
import {assessSniperLiveOpportunity} from '../lib/sniper-live-opportunity';
import {advanceEarlySetup,earlySetupOpportunity,type EarlySetup} from '../lib/sniper-early-setup';
import {assessM5CandleLean,observeClosedM5Trend} from '../lib/sniper-m5-candle-lean';
import SniperOpportunityMarkers from './SniperOpportunityMarkers';
import SniperOpportunityHistory from './SniperOpportunityHistory';
import {advanceMovementProof,movementProofScore,safeMovementProof,type MovementProof} from '../lib/sniper-movement-proof';
import {buildSniperM15Liquidity,compactM15ZoneAnnotations} from '../lib/sniper-m15-liquidity';
import {buildM15LiquidityBoard} from '../lib/sniper-m15-liquidity-board';
import {describeLiquidityBeforeMove} from '../lib/sniper-liquidity-readout';
import {assessM15RouteObstacle} from '../lib/sniper-m15-route-obstacle';
import {assessM15ScenarioIssuance} from '../lib/sniper-m15-evidence-issuance';
import {buildM15WatchPriceMap} from '../lib/sniper-m15-watch-prices';
import {buildM15ReactionMap,emptyReactionMap} from '../lib/sniper-m15-reactions';
import {futureM15WatchZones,conditionalM15BreakoutLevels} from '../lib/sniper-m15-future-zones';
import type {ForwardWatchZone} from '../lib/sniper-m15-future-zones';
import type {M15ReactionMap} from '../lib/sniper-m15-reactions';
import {evaluateM15ForwardProof} from '../lib/sniper-m15-forward-proof';
import {validateFrozenM15Snapshot} from '../lib/sniper-m15-snapshot';
import type {FrozenM15Snapshot} from '../lib/sniper-m15-snapshot';
import type {M15ForwardProof} from '../lib/sniper-m15-forward-proof';

const n=(x:number|null|undefined)=>x!=null&&Number.isFinite(x)?
 x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const h=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'});
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
type FrozenChart=FrozenM15Snapshot;
const noScenario:M15Scenario={ready:false,bars:[],reason:'لا تتوفر شموع سيناريو M15 مثبتة',
 sourceBars:0,archiveYears:0,origin:'NONE',touches:[],stopped:false,atr:null};


export default function SniperM15Panel({data,now,snapshotAt,goldLive,btcLive,assetView='ALL',
 observationAt=snapshotAt,audit,auditLoaded=false}:{
 data:any;now:number;snapshotAt:unknown;observationAt?:unknown;
 goldLive?:any;btcLive?:any;assetView?:'ALL'|'GOLD'|'BTC';
 journals?:any;audit?:any;auditLoaded?:boolean;
}){
 const [chosen,setChosen]=useState<'GOLD'|'BTC'>('GOLD');
 const [showLiquidity,setShowLiquidity]=useState(true);
 const [showExtra,setShowExtra]=useState(false);
 const [showHistoricalExtension,setShowHistoricalExtension]=useState(false);
 const [focusView,setFocusView]=useState(true);
 const [liveRadar,setLiveRadar]=useState<RadarView|null>(null);
 const onRadarView=useCallback((v:RadarView|null)=>setLiveRadar(v),[]);
 // Keep real pre-move observations without a standalone radar panel.
 const [chartLead,setChartLead]=useState<{
   asset?:string;side?:'BUY'|'SELL'|'WAIT';stage?:string;mode?:string;
   armed?:boolean;source?:string;sourceAt?:number;reason?:string;score?:number
 }|null>(null);
 const onChartLead=useCallback((reading:{
   asset?:string;side?:'BUY'|'SELL'|'WAIT';stage?:string;mode?:string;
   armed?:boolean;source?:string;sourceAt?:number;reason?:string;score?:number
 }|null)=>setChartLead(reading),[]);
 // Existing server gold-preparation recorder already freezes a real M1
 // pre-break plan. Reuse its ONE poll (in GoldRadarBadge) instead of adding
 // another network stream or pretending Biquote exposes Exness DOM.
 const [goldPreparationView,setGoldPreparationView]=useState<GoldPreparationView|null>(null);
 const onGoldPreparationView=useCallback((v:GoldPreparationView|null)=>
   setGoldPreparationView(v),[]);
 // Reuse the existing GOLD radar cadence to consume the already-running
 // local M1 scout when remote ML/Neural services are rate-limited.
 const [goldScalpEarly,setGoldScalpEarly]=useState<GoldLocalWatchView|null>(null);
 const onGoldScalpEarly=useCallback((v:GoldLocalWatchView|null)=>
   setGoldScalpEarly(v),[]);
 const asset=assetView==='ALL'?chosen:assetView;
 // Optional context has its own cadence; never wait for AI services to draw signals.
 const [contextPacket,setContextPacket]=useState<{asset:'GOLD'|'BTC';news:any;observedAt:number;sentiment:SentimentReading|null}|null>(null);
 useEffect(()=>{
   let closed=false,busy=false;const controller=new AbortController();
   const read=async()=>{
     if(closed||busy||document.visibilityState!=='visible')return;
     busy=true;
     const json=async(url:string)=>{const r=await fetch(url,{cache:'no-store',
       signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6500)])});
       if(!r.ok)throw new Error('context unavailable');return r.json();};
     try{
       const [news,sentiment]=await Promise.allSettled([json('/api/news'),json('/api/market-sentiment?asset='+asset)]);
       if(!closed)setContextPacket({asset,observedAt:Date.now(),
         news:news.status==='fulfilled'?news.value:null,
         sentiment:sentiment.status==='fulfilled'?sentiment.value:null});
     }finally{busy=false;}
   };
   void read();const timer=setInterval(()=>{void read();},90000);
   return()=>{closed=true;controller.abort();clearInterval(timer);};
 },[asset]);
 const marketContext=useMemo(()=>{
   const packet=contextPacket?.asset===asset?contextPacket:null;
   const feed=packet?.news;
   return assessSniperMarketContext({asset,now,
     news:feed?.ok?buildNewsIntelligence(asset,Array.isArray(feed.events)?feed.events:[],now):null,
     newsObservedAt:feed?.checkedAt,newsReady:Boolean(feed?.newsReady),
     sentiment:packet?.sentiment});
 },[asset,now,contextPacket]);
 const flowCandleSource=asset==='BTC'?data?.bitcoin?.candleSource:
   data?.gold?.candleSource;
 const [flowPacket,setFlowPacket]=useState<{asset:'GOLD'|'BTC';data:any;observedAt:number}|null>(null);
 useEffect(()=>{
   let closed=false,busy=false;
   const controller=new AbortController();
   const read=async()=>{
     if(closed||busy||document.visibilityState!=='visible')return;
     busy=true;
     try{
       const venue=asset==='BTC'&&/kraken/i.test(String(flowCandleSource||''))?
         '/api/orderflow?venue=kraken':'/api/orderflow';
       const r=await fetch(asset==='BTC'?venue:'/api/gold-tick',{
         cache:'no-store',signal:AbortSignal.any([
           controller.signal,AbortSignal.timeout(6000)])});
       const data=await r.json();
       if(!closed)setFlowPacket({asset,data:r.ok?data:null,observedAt:Date.now()});
     }catch{if(!closed)setFlowPacket(null);}
     finally{busy=false;}
   };
   void read();
   const timer=setInterval(()=>{void read();},6000);
   return()=>{closed=true;controller.abort();clearInterval(timer);};
 },[asset,flowCandleSource]);
 const [archiveState,setArchiveState]=useState<{
   asset:'GOLD'|'BTC';ledger:unknown;status:string}|null>(null);
 const lastArchivePoll=useRef<{asset:string;at:number}|null>(null);
 useEffect(()=>{
   // Poll at most every 20 minutes, only for this selected asset, and do not
   // block the live candlestick feed when GitHub archive is unavailable.
   if(lastArchivePoll.current?.asset===asset&&
     Date.now()-lastArchivePoll.current.at<20*60000)return;
   lastArchivePoll.current={asset,at:Date.now()};
   let canceled=false;
   fetch('/api/sniper-m15-archive?asset='+asset,{cache:'no-store',
      signal:AbortSignal.timeout(8500)})
    .then(r=>r.json())
    .then(j=>{if(!canceled)setArchiveState({asset,
      ledger:j?.ok?j.ledger:null,status:String(j?.status||'ARCHIVE_UNAVAILABLE')});})
    .catch(()=>{if(!canceled)setArchiveState({asset,ledger:null,
      status:'ARCHIVE_UNAVAILABLE'});});
   return ()=>{canceled=true};
 },[asset,Math.floor(now/900000)]);
 const x=asset==='GOLD'?data?.gold:data?.bitcoin;
 const historicalOnly=Boolean(x?.historicalOnly);
 // Cached bars are only a picture of REAL past prices: never marry them to
 // an independent current tick or yesterday's scenario to emit BUY/SELL.
 const liveQuote=historicalOnly?null:asset==='GOLD'?goldLive:btcLive;
 const analysisInput=historicalOnly?{...x,livePulse:null,scalpDesk:null,forwardMove:null}:x;
 const [observedM15,setObservedM15]=useState<(ObservedM15 & {previousQuote?:{at:number;price:number};feedKey?:string})|null>(null);
 const observedFeedKey=useRef('');
 // Preserve observed M5 extrema across a temporary quote outage, never across feeds.
 useEffect(()=>{
   const key=[asset,x?.candleSource,liveQuote?.source].join(':');
   const sameFeed=observedFeedKey.current===key;
   observedFeedKey.current=key;
   setObservedM15(prev=>{
     const tick=observeM15Tick(sameFeed?prev:null,{
     now,at:Number(liveQuote?.sourceTime),price:Number(liveQuote?.price),
     source:String(liveQuote?.source||''),
     historySource:String(x?.candleSource||''),period:300000
   });
     if(!tick)return sameFeed&&prev?.time===Math.floor(now/300000)*300000?prev:null;
     if(tick===prev)return prev;
     const previousQuote=sameFeed&&prev&&prev.lastAt<tick.lastAt?
       {at:prev.lastAt,price:prev.close}:undefined;
     return {...tick,feedKey:key,previousQuote};
   });
 },[asset,now,liveQuote?.sourceTime,liveQuote?.price,liveQuote?.source,x?.candleSource]);
 const marketOpen=asset==='BTC'||goldMarketSession(now).open;
 const providerTransition=historicalOnly||(asset==='BTC'&&Boolean(x?.providerTransition));
 // The independent closed M1 chart continues to certify source/time and
 // qualified plan history; this new display never turns a watch into an order.
 const m=useMemo(()=>buildForecastIllustration(asset,analysisInput,liveQuote,now,snapshotAt,
   null,true,null,null,observationAt),
   [asset,analysisInput,liveQuote,now,snapshotAt,observationAt]);
 const actual=useMemo(()=>closedM15Bars(x?.chartHigherFrames?.m15,now,320),
   [x?.chartHigherFrames?.m15,now]);
 // A source-backed analysis lane remains drawable even when ML/Neural trade
 // qualification is unavailable. It NEVER creates broker-ready signals.
 const sourceGuide=useMemo(()=>buildM15WatchGuide(actual,now),[actual,now]);
 const watchGuide=(providerTransition||!marketOpen)&&sourceGuide.ready?
   {...sourceGuide,referenceOnly:true}:sourceGuide;
 const huntPreview=useMemo(()=>({...buildM15HuntPreview(actual,watchGuide,now),
   sessionBreakOnly:asset==='GOLD'&&goldM15SessionBreakOnly(actual.slice(-16))}),
   [asset,actual,watchGuide,Math.floor(now/900000)]);
 // Audit the EXACT observer driving the WATCH overlay, not the separate
 // M15Bias experiment. This is historical replay, never broker profit.
 const huntProof=useMemo(()=>auditM15HuntDirection(actual,now,120),
   [actual,Math.floor(now/900000)]);
 const structure=useMemo(()=>analyzeM15MarketStructure(actual,now),
   [actual,Math.floor(now/900000)]);
 const nextM1=useMemo(()=>assessM1DirectionalPriority(m.candles,now),
   [m.candles,Math.floor(now/60000)]);
 const verifiedArchive=useMemo(()=>verifiedM15Archive({
   ledger:archiveState?.asset===asset?archiveState.ledger:null,
   asset,source:String(x?.candleSource||''),now,live:actual
 }),[archiveState,asset,x?.candleSource,actual,Math.floor(now/900000)]);
 const archiveRows=verifiedArchive.ready?verifiedArchive.rows:[];
 const walkForward=useMemo(()=>m15WalkForward(
   verifiedArchive.ready?archiveRows:actual,now,120),
   [archiveState,asset,x?.candleSource,actual.at(-1)?.time,now>0?
     Math.floor(now/900000):0]);
 const firstM15Stats=firstM15Evidence(walkForward);
 const recent=actual.slice(-72);
 // LIVE market reading can resume after 16 genuine continuous closes.
 // Trading qualification and frozen forward-outcome evidence still use 24.
 const last16M15=actual.slice(-16);
 const continuousM15=last16M15.every((b,i,a)=>
   i===0||b.time-a[i-1].time===900000);
 const scheduledGoldGap=asset==='GOLD'&&last16M15.length===16&&
   goldM15SessionBreakOnly(last16M15);
 // Valid NY maintenance is not a missing live candle. Read-only M15
 // context can resume across this exact scheduled gap. Scenario and
 // trade qualification below still require strict continuous evidence.
 const m15AnalysisReady=last16M15.length===16&&
   (continuousM15||scheduledGoldGap)&&
   now-(actual.at(-1)!.time+900000)<=36*60000;
 const historyFresh=actual.length>=24&&
   actual.slice(-24).every((b,i,a)=>i===0||b.time-a[i-1].time===900000)&&
   now-(actual.at(-1)!.time+900000)<=36*60000;
 // Read-only status: show exactly how many contiguous CLOSED M15 candles
 // are available after a session break. 24/24 is data readiness, NOT
 // a prediction win rate or permission to BUY/SELL.
 const consecutiveM15=(()=>{
   let count=0;
   for(let i=actual.length-1;i>=0&&count<24;i--){
     if(count>0&&actual[i+1].time-actual[i].time!==900000)break;
     count++;
   }
   return count;
 })();
 const sessionDataShort=marketOpen&&!historyFresh&&
   actual.length>0&&now-(actual.at(-1)!.time+900000)<=36*60000;
 const radar=assessChartObservation({now,priceFresh:m.sniper.view.priceFresh,
   historyFresh:m.historyFresh,marketOpen,m1:m.candles,m5:x?.chartHigherFrames?.m5});
 const verifiedBiasSessionGap=asset==='GOLD'&&actual.length>=26&&
   goldM15SessionBreakOnly(actual.slice(-26));
 const m15Bias=useMemo(()=>observedM15Bias(actual,verifiedBiasSessionGap),
   [actual,verifiedBiasSessionGap]);
 // Display M15 analysis independently of M1 trade-entry qualification.
 const preMove=useMemo(()=>detectPreMovePressure({
   asset,c1:m.candles,c5:Array.isArray(x?.chartHigherFrames?.m5)?
     x.chartHigherFrames.m5:[],now
 }),[asset,m.candles,x?.chartHigherFrames?.m5,now]);
 const liquidityMagnets=useMemo(()=>detectLiquidityMagnets(actual,now,64),
   [actual,Math.floor(now/900000)]);
 const actualFlowSameVenue=asset==='BTC'?
   btcOrderflowMatchesChart(x?.candleSource,liveQuote?.source,
     flowPacket?.asset==='BTC'?flowPacket?.data?.source:null):
   (/exness\/mt5/i.test(String(x?.candleSource||''))&&
    /exness\/mt5/i.test(String(liveQuote?.source||'')));
 const flowProfile=useMemo(()=>assessFlowProfile({
   asset,now,price:m.price,
   observedAt:flowPacket?.observedAt??null,
   sourceMatches:actualFlowSameVenue,
   btc:asset==='BTC'&&flowPacket?.asset==='BTC'?flowPacket.data:null,
   gold:asset==='GOLD'&&flowPacket?.asset==='GOLD'?flowPacket.data:null,
   bookSide:asset==='BTC'&&liveRadar&&
     (liveRadar.phase==='PREPARE'||liveRadar.phase==='CONFIRMED')?
       liveRadar.side:'WAIT'
 }),[asset,now,m.price,actualFlowSameVenue,flowPacket,liveRadar]);
 // The live Order Flow band reads only the same provider as this chart.
 // Missing broker depth is shown as quote activity or price-action proxy,
 // never as an executed trade or an actionable BUY/SELL.
 const flowObservation=useMemo(()=>observeSniperOrderFlow({
   asset,now,flow:flowProfile,marketFresh:marketOpen&&
     Boolean(m.sniper.view.priceFresh)&&!providerTransition,
   sourceMatches:actualFlowSameVenue,
   m1:m.candles,
   brokerDepth:asset==='GOLD'&&flowPacket?.asset==='GOLD'?
     flowPacket.data?.brokerDepth:null
 }),[asset,now,flowProfile,marketOpen,m.sniper.view.priceFresh,
    providerTransition,actualFlowSameVenue,m.candles,flowPacket]);
 const localFusion=useMemo(()=>fuseLocalSniper({
   preMove,hunt:huntPreview,m1:nextM1,liquidity:liquidityMagnets,
   marketOpen,fresh:Boolean(m.sniper.view.priceFresh&&
     m.historyFresh),m15Fresh:m15AnalysisReady,providerTransition,flowProfile
 }),[preMove,huntPreview,nextM1,liquidityMagnets,marketOpen,
    m.sniper.view.priceFresh,m.historyFresh,m15AnalysisReady,providerTransition,flowProfile]);
 const observedSide=m15Bias.side;
 const side: 'BUY'|'SELL'|'WAIT' = m15ObservationSide(observedSide,m.bias);
 // Flow/profile is primary when fresh and aligned with closed-candle votes.
 // Missing flow leaves the historical analysis available as a WATCH; conflicting
 // flow cannot issue a frozen bullish/bearish scenario against the tape.
 const evidenceSide=flowProfile.ready&&flowProfile.side!=='WAIT'?
   localFusion.side:side;
 const safeSide=providerTransition||!marketOpen||!historyFresh||
   !m.sniper.view.priceFresh?'WAIT':evidenceSide;
 const outlook=useMemo(()=>buildDistantMovementOutlook({
   asset,side:safeSide,price:m.price,now,priceFresh:m.sniper.view.priceFresh&&
     m.observationFresh,historyFresh,marketOpen,providerTransition,
   frames:x?.chartHigherFrames,
   evidenceStrength:m.ready?'QUALIFIED':radar.status==='ALIGNED'?'ALIGNED':'PARTIAL',
   invalidation:m.displayStop??m.observation.invalidation??null
 }),[asset,safeSide,m.price,now,m.sniper.view.priceFresh,m.observationFresh,
   historyFresh,marketOpen,providerTransition,x?.chartHigherFrames,
   m.ready,m.displayStop,m.observation.invalidation,radar.status]);
 const qualified=m.ready&&m.displayTargets.length>0;
 const targets=qualified?m.displayTargets:outlook.targets.length?outlook.targets:
    m.watchReady?m.displayTargets:[];
 const proposedStop=qualified?m.displayStop:
   outlook.invalidation??(m.watchReady?m.displayStop:null);
 // The chart may use closed M15/H1 targets even when no qualified trade exists.
 // Missing targets do not force an invented TP or a permanently blank chart.
 const forming=sampledLiveM15(m.candles,now,observedM15,String(x?.candleSource||''),300000);
 // Live M5 combines closed M1 OHLC with actual same-venue sampled ticks.
 const lastClosedM1=m.candles.at(-1);
 const m1Recent=Boolean(lastClosedM1&&Number.isFinite(lastClosedM1.time)&&
   now-lastClosedM1.time-60000>=0&&now-lastClosedM1.time-60000<125000);
 const tickRecent=Boolean(observedM15&&observedM15.time===
   Math.floor(now/300000)*300000&&now-observedM15.lastAt<=10000);
 // Show observed live partial M5 independently of gaps in older analysis bars.
 // Forecast issuance and trade eligibility still require verified history.
 const formingVisible=Boolean(forming&&!providerTransition&&
   marketOpen&&forming.time===Math.floor(now/300000)*300000&&
   (m1Recent||tickRecent));
 const validLive=formingVisible&&m.historyFresh&&m.sniper.view.priceFresh;
 // Do not start an apparently FUTURE M15 route at the prior closed candle
 // while the current M15 candle has already moved. Anchor at the actually
 // observed same-venue PARTIAL candle; the first prediction is next FULL M15.
 // Use the latest CLOSED M1 close as the scenario anchor. The live partial
 // candle continues moving on the chart, but quote ticks cannot re-anchor
 // and redraw the forecast every few seconds.
 const anchor=validLive&&forming&&m.candles.at(-1)?
   m.candles.at(-1)!.close:null;
 // The context toggle adds older actual candles without changing their OHLC.
 // Keep analysis on M15, but render genuine source-backed M5 OHLC.
 const realM5=useMemo(()=>{
   const raw=Array.isArray(x?.chartHigherFrames?.m5)?x.chartHigherFrames.m5:[];
   const bars=raw.filter((b:any)=>b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
     b.time>0&&b.time%300000===0&&b.time+300000<=now&&b.low>0&&
     b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
   return [...new Map<number,{time:number;open:number;high:number;low:number;close:number}>(
     bars.map((b:any)=>[b.time,b] as const)).values()].sort((a,b)=>a.time-b.time);
 },[x?.chartHigherFrames?.m5,now]);
 const trueHistory=realM5.slice(focusView?-48:-144);
 const price=m.price;
 // Historical M15 supply/demand is independent of incomplete M1 entry data.
 // If the live quote is unavailable, use only the same-chart CLOSED M15
 // anchor as an explicitly historical reference, not an entry.
 const latestM15=actual.at(-1);
 const m15LiquidityFresh=actual.length>=26&&marketOpen&&!providerTransition&&
   latestM15!=null&&now-(latestM15.time+900000)>=0&&
   now-(latestM15.time+900000)<=36*60000;
 const liquidityReferencePrice=m.sniper.view.priceFresh&&price!=null?
   price:latestM15?.close??null;
 const pools=useMemo(()=>buildChartOverlay({
   now,price:m.price,historyFresh:m.historyFresh,
   priceFresh:m.sniper.view.priceFresh&&!providerTransition&&marketOpen,
   fourHour:m.fourHour,m5:x?.chartHigherFrames?.m5,
   accumulation:x?.accumulation,targets:[]
 }),[now,m.price,m.historyFresh,m.sniper.view.priceFresh,providerTransition,
    marketOpen,m.fourHour,x?.chartHigherFrames?.m5,x?.accumulation]);
 const liquidity=useMemo(()=>buildSniperM15Liquidity({
   now,price:liquidityReferencePrice,history:actual,
   sourceReady:m15LiquidityFresh,fourHour:m.fourHour,pools
 }),[now,liquidityReferencePrice,actual,m15LiquidityFresh,m.fourHour,pools]);
 // Freeze a read-only scenario to its last fully closed M15 candle. Incoming
 // quote ticks still move LIVE but cannot repaint the projected candle route.
 const [frozen,setFrozen]=useState<FrozenChart|null>(null);
 const [restoredKey,setRestoredKey]=useState('');
 // Immutable, browser-local forward records: stored BEFORE a future full M15
 // exists; never rewrite their OHLC with observed outcomes.
 const [proofLedger,setProofLedger]=useState<M15ForwardProof[]>([]);
 const [proofsLoaded,setProofsLoaded]=useState(false);
 useEffect(()=>{
   try {
     const previous=JSON.parse(window.localStorage.getItem('qannas-m15-proof-v1')||'[]');
     if(Array.isArray(previous))setProofLedger(prior=>[
       ...previous.filter((r:any)=>r&&Number.isFinite(r.createdAt)&&
         Number.isFinite(r.anchorTime)&&Array.isArray(r.bars)&&
         (r.asset==='GOLD'||r.asset==='BTC')&&typeof r.source==='string'),
       ...prior
     ].slice(-36));
   } catch {}
   setProofsLoaded(true);
 },[]);
 useEffect(()=>{
   if(!proofsLoaded)return;
   try {window.localStorage.setItem('qannas-m15-proof-v1',
     JSON.stringify(proofLedger.slice(-36)));} catch {}
 },[proofLedger,proofsLoaded]);
 const [blockedKey,setBlockedKey]=useState('');
 const [buildReason,setBuildReason]=useState('');
 const lastAttempt=useRef('');
 const closedTime=actual.at(-1)?.time??0;
 const candleKey=asset+':'+String(x?.candleSource||'')+':'+closedTime;
 const currentSource=String(x?.candleSource||'');
 const persistenceScope=asset+':'+currentSource;
 const persistenceKey='qannas-m15-freeze-analysis-v3-'+asset;
 useEffect(()=>{
   if(!currentSource)return;
   let restored:FrozenChart|null=null;
   try {
     const raw=window.localStorage.getItem(persistenceKey);
     restored=validateFrozenM15Snapshot(raw?JSON.parse(raw):null,{
       asset,source:currentSource,now
     });
   }catch{}
   setFrozen(prev=>prev?.asset===asset&&prev.source===currentSource?
     prev:restored);
   lastAttempt.current='';
   setRestoredKey(persistenceScope);
 },[persistenceScope,persistenceKey]);
 useEffect(()=>{
   if(!currentSource||restoredKey!==persistenceScope)return;
   try {
     if(frozen?.asset===asset&&frozen.source===currentSource)
       window.localStorage.setItem(persistenceKey,JSON.stringify(frozen));
     else window.localStorage.removeItem(persistenceKey);
   }catch{}
 },[restoredKey,persistenceScope,persistenceKey,frozen,asset,currentSource]);
 // Historical forecast-side test areas stay fixed across quote ticks.
 const [forwardSnapshot,setForwardSnapshot]=useState<{
   key:string;zones:ForwardWatchZone[]}|null>(null);
 useEffect(()=>{
   if(!historyFresh||!liquidity.ready)return;
   setForwardSnapshot(prev=>prev?.key===candleKey?prev:{
     key:candleKey,zones:futureM15WatchZones({
       now,history:actual,liquidity,sourceReady:historyFresh
     })
   });
 },[candleKey,historyFresh,liquidity.ready,actual.at(-1)?.time]);
 const futureZones=forwardSnapshot?.key===candleKey?forwardSnapshot.zones:[];
 const conditionalRange=conditionalM15BreakoutLevels({
   now,history:actual,sourceReady:historyFresh
 });
 // Read-only watch levels from FINISHED M15/H1 prices. The reference remains
 // the last closed M15 candle, so browser tick updates do not chase targets.
 const watchMap=useMemo(()=>buildM15WatchPriceMap({
   now,price:price??null,
   sourceReady:m15LiquidityFresh&&m.sniper.view.priceFresh,
   m15:actual,h1:x?.chartHigherFrames?.h1
 }),[now,price,actual,x?.chartHigherFrames?.h1,historyFresh,
   m.sniper.view.priceFresh,marketOpen,providerTransition]);
 const zoneBoard=useMemo(()=>buildM15LiquidityBoard({
   liquidity,watch:watchMap,history:actual,price:liquidityReferencePrice,now
 }),[liquidity,watchMap,actual,liquidityReferencePrice,now]);
 const liquidityReadout=useMemo(()=>describeLiquidityBeforeMove({
   now,price,marketFresh:marketOpen&&Boolean(m.sniper.view.priceFresh)&&
     !providerTransition,context:zoneBoard.context,preMove
 }),[now,price,marketOpen,m.sniper.view.priceFresh,providerTransition,
   zoneBoard.context,preMove]);
 const validObjective=(v:number)=>anchor!=null&&Number.isFinite(v)&&v>0&&
   (safeSide==='BUY'?v>anchor:safeSide==='SELL'?v<anchor:false);
 const explicitGoals=targets.map(t=>t.price).filter(validObjective);
 const backupGoals=watchMap.ready?
   (safeSide==='BUY'?watchMap.upper:watchMap.lower)
      .map(t=>t.price).filter(validObjective):[];
 const candidateGoals=(explicitGoals.length?explicitGoals:backupGoals)
   .sort((a,b)=>safeSide==='BUY'?a-b:b-a);
 const selectedGoals:number[]=[];
 const objectiveGap=Math.max(.01,(watchMap.atr??0)*.18);
 for(const candidate of candidateGoals){
   if(selectedGoals.length===3)break;
   if(!selectedGoals.some(p=>Math.abs(candidate-p)<objectiveGap))
      selectedGoals.push(candidate);
 }
 const proposedGoals=selectedGoals.map((price,i)=>({stage:i+1,price}));
 // The technical stop, when needed, is an OBSERVED closed-M15 swing.
 // It is not a broker stop or automatic permission to execute a trade.
 const swingTail=actual.slice(-10);
 const swingStop=swingTail.length===10?
   safeSide==='BUY'?Math.min(...swingTail.map(b=>b.low)):
   safeSide==='SELL'?Math.max(...swingTail.map(b=>b.high)):null:null;
 const validStop=(v:number|null)=>v!=null&&Number.isFinite(v)&&v>0&&
   anchor!=null&&(safeSide==='BUY'?v<anchor:
     safeSide==='SELL'?v>anchor:false);
 const scenarioStop=validStop(proposedStop)?proposedStop:
   validStop(swingStop)?swingStop:null;
 const routeObstacle=assessM15RouteObstacle({
   side:asset==='GOLD'?safeSide:'WAIT',anchor,goals:proposedGoals,
   zones:zoneBoard.items,closed:actual,now,atr:watchMap.atr
 });
 const confirmedEvents=Array.isArray(m.fourHour?.events)?m.fourHour.events:[];
 const latestBos=confirmedEvents.filter((e:any)=>
   (e?.kind==='BOS_UP'||e?.kind==='BOS_DOWN')&&
   Number.isFinite(e.confirmedAt)&&e.confirmedAt<=now
 ).sort((a:any,b:any)=>a.confirmedAt-b.confirmedAt).at(-1);
 const preMoveReady=preMove.ok&&
   (preMove.stage==='BUILDING'||preMove.stage==='ARMED')&&
   preMove.side!=='WAIT';
 const evidenceNote=preMoveReady?
   'ضغط '+(preMove.side==='BUY'?'صعود':'هبوط')+
   ' قبل الكسر · اختبار '+n(preMove.trigger)+' / إبطال '+n(preMove.invalidation):
   'لا تهيئة مبكرة مؤكدة من M1/M5';
 const freshObservation=Boolean(validLive&&historyFresh&&m.sniper.view.priceFresh&&
   !providerTransition&&marketOpen);
 // Fast movement evidence is separate from the frozen M15 analogue and
 // from strict trade execution. Fresh M1/M5 breaks still appear on screen.
 const liveOpportunity=useMemo(()=>assessSniperLiveOpportunity({
   // The live M1 observer validates its own candle freshness/continuity.
   // Do not let stale M5/M15/H1 history suppress an otherwise valid M1 watch.
   now,price,sourceReady:marketOpen&&m.sniper.view.priceFresh&&
     !providerTransition,
   c1:m.candles,c5:x?.chartHigherFrames?.m5,preMove,watch:watchMap,
   m15Side:m15AnalysisReady?m15Bias.side:'WAIT'
 }),[now,price,marketOpen,m.sniper.view.priceFresh,m.historyFresh,
   providerTransition,m.candles,x?.chartHigherFrames?.m5,preMove,watchMap,
   m15AnalysisReady,m15Bias.side]);
 // Use the direct closed-M15 bias for entry context. The separate visual
 // scenario can be reference-only without disabling local M1 preparation.
 const entryTrend=m15AnalysisReady?m15Bias.side:'WAIT';
 // Never derive BUY/SELL from the colour of an unfinished candle. The live
 // candle is display-only; direction comes from closed-bar PREMOVE or M1 proof.
 const formingBias: 'BUY'|'SELL'|'WAIT'='WAIT';
 // Earlier closed M1 at the open/final-minute cutoff predicts M5 direction.
 const candleLean=useMemo(()=>assessM5CandleLean({
   now,price,sourceReady:marketOpen&&m.sniper.view.priceFresh&&
     !providerTransition,
   m1:m.candles,m5:x?.chartHigherFrames?.m5,flow:flowProfile,
   m1Side:nextM1.ready?nextM1.side:'WAIT',
   m15Side:entryTrend
 }),[now,price,marketOpen,m.historyFresh,m.sniper.view.priceFresh,
   providerTransition,m.candles,x?.chartHigherFrames?.m5,flowProfile,
   nextM1.ready,nextM1.side,entryTrend]);
 // A non-entry M5 context remains visible when M1 closes are delayed. Never
 // upgrade this slower reading to an early BUY/SELL or journal it as a signal.
 const closedM5Context=useMemo(()=>observeClosedM5Trend({
   now,price,sourceReady:marketOpen&&m.sniper.view.priceFresh&&
     !providerTransition,m5:x?.chartHigherFrames?.m5
 }),[now,price,marketOpen,m.sniper.view.priceFresh,
   providerTransition,x?.chartHigherFrames?.m5]);
 const tapeWatch=useMemo(()=>asset==='BTC'&&marketOpen&&m.sniper.view.priceFresh&&!providerTransition?
   detectShortTapeWatch({now,price,sourceMatches:actualFlowSameVenue,
     tape:flowPacket?.asset==='BTC'?flowPacket.data:null,
     observedAt:flowPacket?.observedAt??null,m1:m.candles}):null,
   [asset,marketOpen,m.sniper.view.priceFresh,providerTransition,now,price,actualFlowSameVenue,flowPacket,m.candles]);
 // Arm in this session before crossing. Historical momentum markers are
 // retained for audit but never reused as the current early opportunity.
 const [earlyState,setEarlyState]=useState<EarlySetup|null>(null);
 const paxg=usePaxgFlow(asset==='GOLD'&&marketOpen);
 const goldPerp=usePaxgFlow(asset==='GOLD'&&marketOpen,'/api/gold-perp-flow');
 const btcCross=useBtcCrossFlow(asset==='BTC'&&marketOpen);
 const localMl=useMemo(()=>localCandleMl(asset+':'+String(x?.candleSource||''),m.candles,now,
   marketOpen&&m.historyFresh&&m.sniper.view.priceFresh&&!providerTransition&&Boolean(x?.candleSource)),
   [asset,x?.candleSource,m.candles,now,marketOpen,m.historyFresh,m.sniper.view.priceFresh,providerTransition]);
 const combinedGold=useMemo(()=>combineGoldLiquidity(goldPerp,paxg,now,asset==='GOLD'&&marketOpen),[goldPerp,paxg,now,asset,marketOpen]);
 const trackedSetup=useMemo(()=>advanceEarlySetup({
   prior:earlyState,scope:asset+':'+String(x?.candleSource||''),now,price,
   previousQuote:observedM15?.feedKey===[asset,x?.candleSource,liveQuote?.source].join(':')&&
     observedM15?.lastAt===Number(liveQuote?.sourceTime)&&observedM15?.close===price?
     observedM15?.previousQuote:null,
   quoteAt:Number.isFinite(Number(liveQuote?.sourceTime))?
     Number(liveQuote?.sourceTime):null,
   ready:marketOpen&&m.sniper.view.priceFresh&&!providerTransition&&
     liveOpportunity.phase!=='OFFLINE',
   bars:m.candles,opportunity:liveOpportunity,lean:candleLean,localMl,btcCross,goldCombined:combinedGold,
   zones:liquidity.zones,proxy:asset==='GOLD'?
     (goldPerp&&goldPerp.side!=='UNAVAILABLE'&&goldPerp.tradeAt<=now&&now-goldPerp.tradeAt<=8000&&
       (goldPerp.crossFlow?.consensus==='BUY'||goldPerp.crossFlow?.consensus==='SELL'||
        goldPerp.crossFlow?.consensus==='CONFLICT'||(goldPerp.count>=12&&
         Number.isFinite(goldPerp.tradeDeltaPct)&&(Math.abs(goldPerp.tradeDeltaPct!)>=55||
          goldPerp.absorptionWatch!=null||goldPerp.accelerationSide!=null)))?goldPerp:paxg):null,flow:flowProfile,shortTape:tapeWatch,liquidity:liquidityMagnets,watch:watchMap,marketContext,
   m1Side:nextM1.ready?nextM1.side:'WAIT',
   m15Side:entryTrend
 }),[earlyState,asset,paxg,goldPerp,localMl,btcCross,combinedGold,liquidity.zones,x?.candleSource,now,price,liveQuote?.sourceTime,liveQuote?.source,observedM15,
   marketOpen,m.sniper.view.priceFresh,providerTransition,m.candles,
   liveOpportunity,candleLean,flowProfile,tapeWatch,liquidityMagnets,watchMap,marketContext,
   nextM1.ready,nextM1.side,entryTrend]);
 useEffect(()=>{if(trackedSetup!==earlyState)setEarlyState(trackedSetup);},[trackedSetup,earlyState]);
 // Record the next candle while its opening price is still unknown.
 const forecastScope=JSON.stringify([asset,x?.candleSource,liveQuote?.source]);

 type PreOpen={priceAt?:number;proxy?:PaxgSide;proxySource?:string;scope:string;target:number;issued:number;side:'BUY'|'SELL';reason:string};
 const [preOpen,setPreOpen]=useState<PreOpen|null>(null);
 useEffect(()=>{
   const key='qannas-preopen-m5-v1:'+forecastScope;
   const issued=Date.now();
   const target=(Math.floor(issued/300000)+1)*300000;
   try{
     const saved=JSON.parse(window.localStorage.getItem(key)||'null') as PreOpen|null;
     if(saved&&saved.scope===forecastScope&&saved.target>issued-300000&&
       saved.target<=target&&saved.issued<saved.target&&saved.issued>=saved.target-15000&&
       (saved.side==='BUY'||saved.side==='SELL')){
       if(!preOpen||preOpen.scope!==forecastScope||preOpen.target<saved.target){
         setPreOpen(saved);return;
       }
     }
   }catch{}
   if(target-issued>15000||Math.abs(issued-now)>3000||document.hidden||
     !marketOpen||providerTransition||!m.sniper.view.priceFresh||
     !x?.candleSource||!liveQuote?.source||
     (preOpen?.scope===forecastScope&&preOpen.target===target))return;
   const armed=trackedSetup?.phase==='ARMED'&&trackedSetup.crossedAt==null&&
     trackedSetup.expiresAt>issued?trackedSetup:null;
   const eligible=armed&&!armed.selectionConflict?armed:null;
   const side=eligible?.side??(candleLean.phase==='CLOSE'?candleLean.side:'WAIT');
   if(side==='WAIT')return;
   const sweep=liquidityMagnets.ready&&liquidityMagnets.sourceAt!=null&&
     issued>=liquidityMagnets.sourceAt&&issued-liquidityMagnets.sourceAt<=600000?
     liquidityMagnets.sweep:'NONE';
   if((side==='BUY'&&sweep==='HIGH_RECLAIMED_DOWN')||
     (side==='SELL'&&sweep==='LOW_RECLAIMED_UP'))return;
   const freshProxy=asset==='GOLD'&&paxg&&paxg.observedAt<=issued&&
     issued-paxg.observedAt<=12000&&paxg.tradeAt<=issued&&issued-paxg.tradeAt<=15000;
   const proxy=asset==='GOLD'?(freshProxy?paxg.side:'UNAVAILABLE'):undefined;
   const record={scope:forecastScope,target,issued,side,proxy,proxySource:freshProxy?paxg?.source:undefined,priceAt:price??undefined,
     reason:(eligible?.reason??candleLean.reason)+(sweep==='NONE'?'':' · سحب سيولة M15')};
   setPreOpen(record);
   try{window.localStorage.setItem(key,JSON.stringify(record));}catch{}
 },[forecastScope,now,preOpen,marketOpen,providerTransition,m.sniper.view.priceFresh,
   x?.candleSource,liveQuote?.source,trackedSetup,candleLean,liquidityMagnets,paxg,asset,price]);
 const visiblePreOpen=preOpen?.scope===forecastScope&&now>=preOpen.issued-3000&&
   now<preOpen.target+300000?preOpen:null;
 const [previousCalls,setPreviousCalls]=useState<PreOpen[]>([]);
 useEffect(()=>{
   const key='qannas-preopen-chart:'+forecastScope;
   let rows:PreOpen[]=[];
   try{
     const raw=JSON.parse(localStorage.getItem(key)||'[]');
     if(Array.isArray(raw))rows=raw.filter(r=>r?.scope===forecastScope&&
       (r.side==='BUY'||r.side==='SELL')&&Number.isFinite(r.target)&&
       r.issued<r.target&&r.issued>=r.target-15000);
   }catch{}
   if(preOpen?.scope===forecastScope&&!rows.some(r=>r.target===preOpen.target)){
     rows=[...rows,preOpen].slice(-144);
     try{localStorage.setItem(key,JSON.stringify(rows));}catch{}
   }
   setPreviousCalls(rows);
 },[forecastScope,preOpen]);
 const trial=useMemo(()=>preOpen?.scope===forecastScope&&preOpen.proxy?
   {...preOpen,proxy:preOpen.proxy}:null,[preOpen,forecastScope]);
 const paxgComparison=usePaxgComparison(asset==='GOLD'?forecastScope:'',trial,realM5);
 const earlyOpportunity=useMemo(()=>earlySetupOpportunity(trackedSetup),[trackedSetup]);
 // Pure price-only GOLD alternative when Exness DOM has no usable depth.
 // STRICTLY read-only: Biquote XAUUSD M1 does not give executed order flow.
 // The server issued and archived this plan before any future breakout.
 const goldSpotPlan=useMemo(()=>asset==='GOLD'?
   selectGoldSpotDisplay({
     now,marketFresh:marketOpen&&Boolean(m.sniper.view.priceFresh)&&!providerTransition,
     chartSource:String(x?.candleSource||''),
     quoteSource:String(liveQuote?.source||''),
     quoteAt:Number.isFinite(Number(liveQuote?.sourceTime))?
       Number(liveQuote.sourceTime):null,
     price,view:goldPreparationView
   }):null,[asset,now,marketOpen,m.sniper.view.priceFresh,providerTransition,
     x?.candleSource,liveQuote?.source,liveQuote?.sourceTime,price,goldPreparationView]);
 // This non-execution GOLD M1 scout was previously confined to Scalp Lab.
 // Validate its original source/time before displaying its local watch.
 const goldLocalWatch=useMemo(()=>asset==='GOLD'?selectGoldLocalWatch({
   now,marketOpen,priceFresh:Boolean(m.sniper.view.priceFresh),
   providerTransition,price,quoteSource:String(liveQuote?.source||''),
   chartSource:String(x?.candleSource||''),view:goldScalpEarly
 }):null,[asset,now,marketOpen,m.sniper.view.priceFresh,providerTransition,
   price,liveQuote?.source,x?.candleSource,goldScalpEarly]);
 // Independent, read-only M1/M5 early hypothesis; not vetoed by weak M15.
 const m1Reclaim=useMemo(()=>detectM1ReclaimWatch({now,price,marketOpen,
   priceFresh:Boolean(m.sniper.view.priceFresh),providerTransition,
   m1:m.candles,m5:x?.chartHigherFrames?.m5
 }),[now,price,marketOpen,m.sniper.view.priceFresh,providerTransition,
   m.candles,x?.chartHigherFrames?.m5]);
 const m5Cue=useMemo(()=>chartM5EarlyCue({now,price,marketOpen,
   priceFresh:Boolean(m.sniper.view.priceFresh),providerTransition,
   preMove,opportunity:liveOpportunity,lean:candleLean,
   reclaim:m1Reclaim,shortTape:tapeWatch,m5Follow:closedM5Context
 }),[now,price,marketOpen,m.sniper.view.priceFresh,providerTransition,
   preMove,liveOpportunity,candleLean,m1Reclaim,tapeWatch,closedM5Context]);
 // Match the actual visible PREBREAK to a forward-only audit candidate.
 // The original time and trigger are never recreated after price crosses.
 const cueAuditCandidate=useMemo(()=>cueForwardObservation(m5Cue,now,price),
   [m5Cue,now,price]);
 const cuePrebreak=m5Cue.stage==='PREBREAK';
 const cueVisible=m5Cue.side!=='WAIT'&&!['OFFLINE','NONE','LATE'].includes(m5Cue.stage);
 // A genuine first-seen reclaim is written into the same forward-only
 // audit as older early hypotheses. It is an observational WATCH with no TP
 // and no automatic order; do not create a retroactive signal on a breakout.
 const movementSignal=useMemo(()=>{
   if(earlyOpportunity.phase==='PREPARE'||earlyOpportunity.phase==='BREAK_CONFIRMED'||
      earlyOpportunity.phase==='TESTING')return earlyOpportunity;
   if(tapeWatch&&cuePrebreak&&m5Cue.asOf===tapeWatch.asOf&&m5Cue.trigger===tapeWatch.trigger){
     return {...earlyOpportunity,phase:'PREPARE' as const,side:tapeWatch.side,
       sourceAt:tapeWatch.asOf,trigger:tapeWatch.trigger,invalidation:tapeWatch.invalidation,
       targets:[],strength:0,quality:'OBSERVATION' as const,setupKind:'PRESSURE' as const,
       reason:'ضغط تنفيذ قصير قبل مستوى كسر لاحق · '+tapeWatch.source,
       tradeEligible:false as const};
   }
   if(!m1Reclaim||
       !cuePrebreak||m5Cue.asOf!==m1Reclaim.asOf||
       m5Cue.trigger!==m1Reclaim.trigger)return earlyOpportunity;
   return {...earlyOpportunity,phase:'PREPARE' as const,
     side:m1Reclaim.side,sourceAt:m1Reclaim.asOf,
     trigger:m1Reclaim.trigger,invalidation:m1Reclaim.invalidation,
     targets:[],strength:0,quality:'OBSERVATION' as const,setupKind:'PULLBACK' as const,
     reason:'ترقب استرداد M1 قبل مستوى الكسر التالي؛ OHLC مغلق دون تدفق تنفيذي مؤكد',
     tradeEligible:false as const};
 },[earlyOpportunity,m1Reclaim,tapeWatch,cuePrebreak,m5Cue.asOf,m5Cue.trigger]);
 // Show the closed-M1 directional hypothesis as WATCH when no pre-break
 // setup was armed; never promote it into an execution-worthy BUY/SELL.
 const hasDirectionalWatch=earlyOpportunity.side==='WAIT'&&
   candleLean.side!=='WAIT'&&candleLean.phase!=='WAIT';
 const hasM5Fallback=earlyOpportunity.side==='WAIT'&&!hasDirectionalWatch&&
   closedM5Context.ready&&closedM5Context.side!=='WAIT';
 const watchIsReversal=hasDirectionalWatch&&candleLean.reason.includes('انعكاس محتمل');
 const watchAgainstM15=hasDirectionalWatch&&!watchIsReversal&&
   entryTrend!=='WAIT'&&candleLean.side!==entryTrend;
 const currentSignalSide=earlyOpportunity.side;
 const currentSignalLabel=earlyOpportunity.phase==='PREPARE'?
   (earlyOpportunity.side==='BUY'?'ترقب شراء قبل الكسر':'ترقب بيع قبل الكسر'):
   earlyOpportunity.phase==='BREAK_CONFIRMED'?
   (earlyOpportunity.side==='BUY'?'شراء من إعداد مسبق':'بيع من إعداد مسبق'):
   earlyOpportunity.reason;
 const currentSignalPrice=trackedSetup?.phase==='TRIGGERED'?trackedSetup.priceAt:price;
 // Keep first-issued target levels immutable; only future CLOSED M1 can score them.
 const [movementRecords,setMovementRecords]=useState<MovementProof[]>([]);
 const [movementProofLoaded,setMovementProofLoaded]=useState(false);
 useEffect(()=>{
   try{
     const raw=window.localStorage.getItem('qannas-movement-proof-v1');
     setMovementRecords(safeMovementProof(raw?JSON.parse(raw):[]));
   }catch{setMovementRecords([]);}
   setMovementProofLoaded(true);
 },[]);
 useEffect(()=>{
   if(!movementProofLoaded)return;
   try{window.localStorage.setItem('qannas-movement-proof-v1',
     JSON.stringify(movementRecords.slice(-2000)));}catch{}
 },[movementRecords,movementProofLoaded]);
 useEffect(()=>{
   if(!movementProofLoaded)return;
   setMovementRecords(prior=>{
     const source=String(x?.candleSource||'');
     const observedEvidence={
       flowStatus:flowObservation.status,flowSource:flowObservation.source,
       flowSide:flowProfile.side,liquidityReady:liquidity.ready,
       m1Side:nextM1.ready?nextM1.side:'WAIT' as const,
       m15Side:entryTrend,proxySide:paxg&&paxg.observedAt<=now&&
         now-paxg.observedAt<=12000&&paxg.tradeAt<=now&&
         now-paxg.tradeAt<=15000?paxg.side:'UNAVAILABLE'
     };
     const first=advanceMovementProof({
       prior,now,asset,source,price,signal:movementSignal,bars:m.candles,
       m5Bars:x?.chartHigherFrames?.m5,frameTrend:entryTrend,
       setupState:trackedSetup,
       evidence:{...observedEvidence,reason:movementSignal.reason},
       // Preserve ordinary M1 wave records, even if no prebreak qualified.
       candleLean:hasDirectionalWatch?candleLean:undefined
     });
     // Independent visible PREBREAKs were previously missing from the scorecard
     // unless chosen by the tracked setup, tape, or reclaim path. Record them
     // at this actual observation, including when another older setup remains.
     // Same-side identical sourceAt ids are deduplicated in advanceMovementProof.
     return cueAuditCandidate?advanceMovementProof({
       prior:first,now,asset,source,price,signal:cueAuditCandidate,
       bars:m.candles,m5Bars:x?.chartHigherFrames?.m5,frameTrend:entryTrend,
       evidence:{...observedEvidence,reason:cueAuditCandidate.reason}
     }):first;
   });
 },[movementProofLoaded,now,asset,x?.candleSource,price,
   earlyOpportunity,movementSignal,cueAuditCandidate,candleLean,hasDirectionalWatch,m.candles,
   x?.chartHigherFrames?.m5,entryTrend,trackedSetup,flowObservation,flowProfile.side,
   liquidity.ready,nextM1.ready,nextM1.side,paxg]);
 const movementStats=useMemo(()=>movementProofScore(movementRecords,asset),
   [movementRecords,asset]);
 const failureAudit=useMemo(()=>reviewEarlyFailures(movementRecords,asset,String(x?.candleSource||''),now),
   [movementRecords,asset,x?.candleSource,Math.floor(now/60000)]);
 const showZoneObservation=trackedSetup?.phase==='OBSERVING';
 const showPreparation=earlyOpportunity.phase==='PREPARE';
 // A bounded forward setup has a known trigger, invalidation and an actual
 // historical price target. Label it as a CONDITIONAL plan before the break;
 // never call it a confirmed trade or manufacture an ATR profit level.
 const planDirection=earlyOpportunity.side==='BUY'?1:-1;
 const planRisk=earlyOpportunity.trigger!=null&&earlyOpportunity.invalidation!=null?
   planDirection*(earlyOpportunity.trigger-earlyOpportunity.invalidation):0;
 const planRoom=earlyOpportunity.trigger!=null&&earlyOpportunity.targets.length?
   planDirection*(earlyOpportunity.targets[0]-earlyOpportunity.trigger):0;
 const conditionalEntry=showPreparation&&earlyOpportunity.side!=='WAIT'&&
   earlyOpportunity.strength>=40&&earlyOpportunity.m15Context!=='OPPOSED'&&
   planRisk>0&&planRoom>=planRisk;
 const showCrossTest=earlyOpportunity.phase==='TESTING';
 const showRejected=trackedSetup?.phase==='CANCELLED'&&
   trackedSetup.reason.includes('فشل اختبار الاختراق')||
   trackedSetup?.phase==='CANCELLED'&&trackedSetup.reason.includes('فشل اختراق');
 const earlySide=showRejected?trackedSetup!.side:
   hasDirectionalWatch?candleLean.side:earlyOpportunity.side;
 const hasEarlySignal=earlyOpportunity.phase==='BREAK_CONFIRMED';
 // All default analysis appears on the chart. Full explanations are available
 // in an optional closed drawer, not in multi-line blocks above the candles.
 const mainSetup=showPreparation||showCrossTest||showRejected||hasEarlySignal;
 // Only one predominant label: a validated tracked setup outranks the
 // independently issued GOLD price preparation, which outranks lagging M5.
 const showGoldSpotPlan=Boolean(goldSpotPlan&&!mainSetup&&!cuePrebreak);
 // An older setup must not hide a distinct, still-before-trigger M1/M5 cue.
 const distinctPrebreak=cuePrebreak&&(!mainSetup||
   m5Cue.side!==earlyOpportunity.side||m5Cue.trigger!==earlyOpportunity.trigger||
   showRejected)&&!(
     movementSignal.phase==='PREPARE'&&movementSignal.side===m5Cue.side&&
     movementSignal.trigger===m5Cue.trigger&&movementSignal.sourceAt===m5Cue.asOf
   );
 const drawingSide=mainSetup?trackedSetup?.side??'WAIT':
   cuePrebreak?m5Cue.side:showGoldSpotPlan?goldSpotPlan!.side:
   showZoneObservation?'WAIT':
   cueVisible?m5Cue.side:
   hasDirectionalWatch?candleLean.side:
   hasM5Fallback?closedM5Context.side:'WAIT';
 const drawingLabel=cuePrebreak&&!mainSetup?m5Cue.headline:
   showGoldSpotPlan?goldSpotPlan!.label:showZoneObservation?
   (trackedSetup?.side==='BUY'?'دعم · مراقبة':'مقاومة · مراقبة'):
   showPreparation?(conditionalEntry?
     (drawingSide==='BUY'?'شراء مشروط':'بيع مشروط'):
     (drawingSide==='BUY'?'ترقب صعود':'ترقب هبوط')):
   showCrossTest?(drawingSide==='BUY'?'اختبار صعود':'اختبار هبوط'):
   showRejected?'× كسر فاشل':
   hasEarlySignal?(earlyOpportunity.quality==='SETUP'?
     (drawingSide==='BUY'?'شراء':'بيع'):
     (drawingSide==='BUY'?'↗ رصد':'↘ رصد')):
   cueVisible&&!mainSetup?m5Cue.headline:
   hasDirectionalWatch?(watchIsReversal?
     (drawingSide==='BUY'?'↗ انعكاس؟':'↘ انعكاس؟'):
     watchAgainstM15?(drawingSide==='BUY'?'↗ ارتداد':'↘ ارتداد'):
     (drawingSide==='BUY'?'↗ صعود':'↘ هبوط')):
   hasM5Fallback?(drawingSide==='BUY'?'↗ M5':'↘ M5'):
   marketOpen&&m.sniper.view.priceFresh&&!providerTransition?
     closedM5Context.ready?'↔ نطاق':'M1/M5 ناقص':
   'المصدر متأخر';
 // Qualitative evidence checklist, not a predicted success rate.
 // The checklist score is kept in the tooltip; it is NOT win probability.
 // Plain BUY/SELL appears only after a genuinely qualified confirmation.
 const passiveWatch=!mainSetup&&!showGoldSpotPlan&&
   (cueVisible||(!showZoneObservation&&!showRejected&&(hasDirectionalWatch||hasM5Fallback)));
 const markerPrice=hasEarlySignal?currentSignalPrice:earlyOpportunity.trigger;
 const drawingBadge=passiveWatch?
   (cueVisible?m5Cue.headline+' · ليس دخولًا':
    drawingSide==='BUY'?'↗ رصد صعود · ليس دخولًا':
    drawingSide==='SELL'?'↘ رصد هبوط · ليس دخولًا':
    'مراقبة · لا توجد إشارة دخول'):drawingLabel;
 const drawingReason=showGoldSpotPlan?
   goldSpotPlan!.reason+' · من M1 الفوري فقط، دون عمق Exness أو صفقات منفذة · تفعيل '+
   n(goldSpotPlan!.trigger)+' · إبطال '+n(goldSpotPlan!.invalidation)+
   ' · هدف تاريخي '+n(goldSpotPlan!.target)+' · اختبار غير قابل للتنفيذ':
   cuePrebreak&&!mainSetup?m5Cue.detail+
   ' · تفعيل '+n(m5Cue.trigger)+' · إبطال '+n(m5Cue.invalidation):
   cueVisible&&!mainSetup?m5Cue.detail:showZoneObservation?
   (trackedSetup?.reason||'')+' · مستوى مراقبة فقط؛ لا توجد إشارة شراء/بيع مؤهلة':
   showPreparation||showCrossTest||showRejected||hasEarlySignal?
   (trackedSetup?.reason||'إعداد غير متاح'):
   hasDirectionalWatch?(watchIsReversal?'احتمال انعكاس غير مؤكد':
     watchAgainstM15?'ارتداد عكس سياق M15؛ ليس إشارة دخول':
     'اتجاه مرصود بعد بدء الحركة؛ ليس إنذارًا مبكرًا أو أمر دخول'):
   hasM5Fallback?closedM5Context.reason:
   marketOpen&&m.sniper.view.priceFresh&&!providerTransition?
     candleLean.reason+' · '+closedM5Context.reason:
   earlyOpportunity.reason;
 const drawingColor=passiveWatch&&drawingSide==='WAIT'?'#aebbc8':
   showZoneObservation&&!cuePrebreak?'#ebd08d':
   drawingSide==='BUY'?'#64e8b2':
   drawingSide==='SELL'?'#fa92a4':'#ebd08d';
 const rawIssuance=assessM15ScenarioIssuance({
   side:safeSide,qualified,radarStatus:radar.status,radarSide:radar.side,
   m15Side:m15Bias.side,m15Votes:m15Bias.votes,
   structuralActive:m.bias.active,structuralSide:m.bias.side,
   structuralAgreement:m.bias.agreement,fresh:freshObservation,
   goals:proposedGoals.length,stop:scenarioStop,anchor
 });
 // Supply/demand must be crossed before a NEW directional route is issued.
 // Frozen prior forecasts are preserved for honest walk-forward scoring.
 const issuance=routeObstacle.blocked?{
   allowed:false,level:'WAIT' as const,reason:routeObstacle.reason
 }:rawIssuance;
 const freezeDecision=frozenM15Decision({
   old:frozen&&frozen.source===String(x?.candleSource||'')?{asset:frozen.asset,closedTime:frozen.closedTime,
     side:frozen.side,stop:frozen.stop,createdAt:frozen.createdAt,
     anchorTime:frozen.anchorTime}:null,
   asset,closedTime,quote:price,fresh:freshObservation,
   marketOpen,now,opposingBosConfirmedAt:latestBos?.confirmedAt,
   opposingBosSide:latestBos?.kind==='BOS_UP'?'BUY':
     latestBos?.kind==='BOS_DOWN'?'SELL':null
 });
 useEffect(()=>{
   if(restoredKey!==persistenceScope)return;
   if(blockedKey===candleKey)return;
   if(freezeDecision==='HOLD'||freezeDecision==='PAUSE')return;
   if(freezeDecision==='CLEAR'){
     if(frozen&&frozen.asset===asset&&frozen.closedTime===closedTime){
       const breached=frozen.stop!=null&&price!=null&&
         (frozen.side==='BUY'?price<=frozen.stop:price>=frozen.stop);
       const opposed=Boolean(latestBos&&latestBos.confirmedAt>frozen.createdAt&&
         (latestBos.kind==='BOS_UP'?'BUY':'SELL')!==frozen.side);
       if(breached||opposed)setBlockedKey(candleKey);
     }
     if(frozen)setFrozen(null);
     lastAttempt.current='';
     return;
   }
   if(!issuance.allowed||safeSide==='WAIT'||anchor==null||
     lastAttempt.current===candleKey)return;
   if(scenarioStop!=null&&price!=null&&
      (safeSide==='BUY'?price<=scenarioStop:price>=scenarioStop))return;
   const modelInput={
     history:actual,
     archive:verifiedArchive.ready?verifiedArchive.rows:undefined,
     archiveYears:verifiedArchive.ready?verifiedArchive.years:0,
     now,anchor,side:safeSide,targets:proposedGoals,
     stop:scenarioStop,allowNoTargets:true
   };
   const scenario=buildM15Scenario({...modelInput,steps:12});
   if(!scenario.ready){setBuildReason(scenario.reason);return;}
   // Old classic view: 48 natural historical-analogue future bodies.
   // Preserve the exact ORIGINAL first twelve bars for evaluation.
   const longer=buildM15Scenario({...modelInput,steps:48});
   const prefixMatches=longer.ready&&longer.bars.length>=scenario.bars.length&&
     scenario.bars.every((b,i)=>longer.bars[i]&&
       [b.open,b.close,b.high,b.low].every((value,k)=>
         Math.abs(value-[longer.bars[i].open,longer.bars[i].close,
           longer.bars[i].high,longer.bars[i].low][k])<.000001));
   const visualBars=prefixMatches?longer.bars:scenario.bars;
   setBuildReason('');
   lastAttempt.current=candleKey;
   const reactions=buildM15ReactionMap({
     scenario,liquidity,side:safeSide,anchor,now,stop:scenarioStop
   });
   const source=String(x?.candleSource||'');
   const anchorTime=forming!.time;
   // A fixed record can later be compared against exactly-timed CLOSED bars.
   if(scenario.bars[0]?.open!==anchor)return;
   setProofLedger(old=>old.some(p=>p.asset===asset&&p.source===source&&
       p.anchorTime===anchorTime)?old:[...old,{
       asset,source,anchorTime,anchorPrice:anchor,createdAt:now,
       bars:scenario.bars.map(b=>({open:b.open,high:b.high,low:b.low,close:b.close}))
     }].slice(-36));
   setFrozen({asset,source,closedTime,anchorTime,createdAt:now,
     side:safeSide,goals:proposedGoals,stop:scenarioStop,scenario,reactions,
     visualBars,evidenceLevel:issuance.level==='WAIT'?undefined:issuance.level});
 },[asset,now,closedTime,candleKey,blockedKey,freezeDecision,frozen,
    restoredKey,persistenceScope,
    freshObservation,safeSide,anchor,forming?.time,actual,price,scenarioStop,
    proposedGoals.map(g=>g.price).join('|'),latestBos?.confirmedAt,latestBos?.kind,
   verifiedArchive.ready,verifiedArchive.storedBars,liquidity,
   preMove.stage,preMove.side,issuance.allowed,issuance.level]);
 const stable=blockedKey!==candleKey&&
   retainM15Snapshot(freezeDecision,frozen,asset,now)&&
   frozen?.asset===asset&&frozen.source===String(x?.candleSource||'')?frozen:null;
 const paused=Boolean(stable&&freezeDecision==='PAUSE');
 const awaitingReplacement=Boolean(stable&&freezeDecision==='REBUILD');
 // Compare the saved route to the observed M5 price on screen.
 const comparisonStep=stable&&forming?
   Math.max(0,Math.floor((forming.time-stable.anchorTime)/900000)):0;
 const visualAlignment=stable&&validLive&&forming?
   assessM15FrozenChartAlignment({
     original:stable.scenario.bars,historical:actual,live:forming.close,
     atr:stable.scenario.atr,elapsedSteps:comparisonStep
   }):null;
 const detached=visualAlignment?.reason==='MOVED_AWAY';
 const lifecycle=routeObstacle.blocked?
   (stable?'سيناريو سابق محفوظ للمراجعة · ':'')+routeObstacle.reason:
   paused?'السيناريو محفوظ · البيانات متأخرة':
   awaitingReplacement?'السيناريو السابق محفوظ · تقييم إغلاق M15':
   detached?'حركة LIVE تجاوزت نطاق توقع M15 المحفوظ · انتظار إغلاق الشمعة دون إعادة رسم':
   stable?.scenario.stopped?'محاكاة M15 لامست الإبطال عند الشمعة '+
     stable.scenario.bars.length+' · الأهداف المعروضة ليست نتائج فعلية':
   stable?(stable.evidenceLevel==='PRELIMINARY'?'ترجيح مبدئي':
     stable.evidenceLevel==='CONFLUENCE'?'ترجيح مدعوم بأكثر من إطار':
     'سيناريو تحليلي مؤهل')+' '+(stable.side==='BUY'?'للصعود':'للهبوط')+
     ' منذ '+h(stable.createdAt)+
     (stable.goals.length?' · أهداف تاريخية للمراقبة':' · لا أهداف هيكلية موثقة')+
     (stable.stop==null?' · الإبطال غير متاح':' · الإبطال '+n(stable.stop))+
     ' · ليس إشارة دخول · لا يُعاد رسمه كل M15':
   blockedKey===candleKey?'السيناريو مُبطل · انتظار إغلاق M15':
   !marketOpen?'السوق مغلق':!freshObservation?'انتظار بيانات حديثة':
   safeSide==='WAIT'&&conditionalRange.valid?
     'توازن M15 · مراقبة إغلاق فوق '+n(conditionalRange.upper)+
       ' أو تحت '+n(conditionalRange.lower)+' · ليست إشارة دخول':
   safeSide==='WAIT'?'توازن السوق · لا اتجاه مرجح حاليًا':
   !issuance.allowed?issuance.reason:
   buildReason||(!proposedGoals.length?'لا توجد أهداف هيكلية صالحة حاليًا':'جارٍ تقييم سيناريو M15');
 // Structural H1/H4 pivots are only watch levels; TP prices on this M15
 // forecast rail must have an actual intersecting hypothetical wick.
 // A pinned route from a previous M15 window must never masquerade as a
 // fresh projection starting at the current live candle.
 // Keep the original forecast visible even after live price diverges.
 // Divergence changes its status to detached; it must not make the candles blink.
 const aligned=stable&&validLive&&forming&&
   stable.anchorTime<=forming.time&&
   forming.time<stable.anchorTime+12*900000&&!detached?stable:null;
 const elapsedSteps=aligned?comparisonStep:0;
 // Retain ORIGINAL forecast timestamps. On later real candles only the
 // not-yet-observed route goes right of NOW; the past is scored separately.
 const shownBars=aligned?.scenario.bars.slice(elapsedSteps,12)??[];
 // Keep the original frozen analogue as the basis of the displayed route.
 const displayBars=aligned?.visualBars?.slice(elapsedSteps)??shownBars;
 // Only the first 12 bars enter the timestamped forecast score.
 const targetRoute=aligned?extendIllustrativeM15ToTargets({
   model:aligned.visualBars??aligned.scenario.bars,goals:aligned.goals,
   side:aligned.side,atr:aligned.scenario.atr,stop:aligned.stop,maxCandles:96
 }):null;
 // Target continuation is a conditional drawing; the scored OHLC stays frozen.
 const renderedBars=showHistoricalExtension?
   (targetRoute?.bars.slice(elapsedSteps)??displayBars):shownBars;
 const goals=aligned?.scenario.ready&&!aligned.scenario.stopped?
   aligned.goals.filter(g=>shownBars.some(b=>b.low<=g.price&&g.price<=b.high)):[];
 const visualGoals=aligned?.scenario.ready&&!aligned.scenario.stopped?
   aligned.goals.filter(g=>!goals.some(hit=>hit.stage===g.stage)):[];
 const stop=aligned?.stop??null;
 const projected=aligned?.scenario??noScenario;
 const showWatchGuide=!projected.ready&&watchGuide.ready;
 const reactionMap=aligned?{
   bands:aligned.reactions.bands,
   marks:aligned.reactions.marks.filter(m=>
     m.step>elapsedSteps&&m.step<=elapsedSteps+shownBars.length)
 }:emptyReactionMap();
 const verifiedM15Records=proofLedger.filter(p=>p.asset===asset&&
   p.source===String(x?.candleSource||'')&&p.anchorTime+2*900000<=now)
   .map(record=>evaluateM15ForwardProof(record,actual,now))
   .filter(v=>v.evaluated>0);
 const totalM15Bars=verifiedM15Records.reduce((sum,r)=>sum+r.evaluated,0);
 const matchedM15Bars=verifiedM15Records.reduce((sum,r)=>sum+r.directionMatches,0);
 const averageM15Error=totalM15Bars?
   verifiedM15Records.reduce((sum,r)=>
     sum+(r.meanAbsoluteCloseError??0)*r.evaluated,0)/totalM15Bars:null;
 const savedProof=proofLedger.filter(p=>p.asset===asset&&
   p.source===String(x?.candleSource||'')&&p.anchorTime+2*900000<=now).at(-1);
 const proof=savedProof?evaluateM15ForwardProof(savedProof,actual,now):null;
 const proofLabel=proof&&proof.evaluated>0?
   'تحقق فعلي '+proof.directionMatches+'/'+proof.evaluated+
      ' · خطأ '+n(proof.meanAbsoluteCloseError):
   'التحقق: انتظار إغلاق شموع لاحقة';
 const chartSide=aligned?.side??safeSide;
 // Targets not actually intersected by future simulated candles are NOT TP.
 // Show historical watch destinations separately, even when no route exists.
 const mapPrices=watchMap.ready?chartSide==='BUY'?
   [...watchMap.upper.slice(0,3),...watchMap.lower.slice(0,1)]:
   chartSide==='SELL'?
     [...watchMap.lower.slice(0,3),...watchMap.upper.slice(0,1)]:
     [...watchMap.upper.slice(0,2),...watchMap.lower.slice(0,2)]:[];
 const watchPrices=mapPrices.filter(v=>
   price!=null&&Number.isFinite(price)&&
   (v.side==='BUY'?v.price>price:v.price<price)&&
   !goals.some(g=>Math.abs(g.price-v.price)<Math.max(.01,(watchMap.atr??0)*.2))
 ).slice(0,4);
 // Radar cannot change the M15 targets, direction, forecast OHLC or freeze
 // lifecycle. It can only verify/cancel the FIRST candidate candle, after an
 // independent, later closed M1 has agreed with the same Coinbase feed.
 const entryCandle=useMemo(()=>assessSniperEntryCandle({
   history:m.candles,now,side:chartSide,price,
   sourceReady:freshObservation&&m.historyFresh
 }),[m.candles,now,chartSide,price,freshObservation,m.historyFresh]);
 const firstRadarCandle=assessRadarNextCandle({
   asset,candleSource:String(x?.candleSource||''),side:chartSide,
   price,priceFresh:freshObservation&&m.historyFresh,
   now,radar:liveRadar,m1:entryCandle
 });
 const W=492,H=704,left=8,split=320,end=422,
   plotTop=26,plotBottom=H-33;
 // A single absolute price axis contains EVERY currently valid target and
 // stop. No fake vertical positioning of offscreen targets.
 const historyZoneSpan=trueHistory.length?
   Math.max(1,Math.max(...trueHistory.map(b=>b.high))-
     Math.min(...trueHistory.map(b=>b.low))):1;
 const visibleZones=liquidity.zones.filter(z=>
   Math.abs((z.low+z.high)/2-(price??anchor??0))<=historyZoneSpan*1.2);
 const liveScaleValues=formingVisible&&forming?[forming.open,forming.high,forming.low,forming.close]:[];
 const important=[
   ...trueHistory.flatMap(c=>[c.high,c.low]),
   ...goals.map(t=>t.price),
   // Distant watch-only objectives must not stretch the price axis and
   // flatten the actual candles. Unreached levels remain in the side labels.
   // Do not let tick-by-tick quotes or price-filtered watch labels rescale
   // the entire candle field. The viewport follows closed bars and frozen levels.
   ...(stop!=null?[stop]:[]),
   ...renderedBars.map(c=>c.close),
   ...(showWatchGuide?[
     ...watchGuide.up,...watchGuide.down,
     watchGuide.upperTrigger??0,watchGuide.lowerTrigger??0
   ]:[]),
   ...visibleZones.flatMap(z=>[z.low,z.high]),
   ...(showLiquidity?reactionMap.bands.flatMap(z=>[z.low,z.high]):[]),
   ...reactionMap.marks.map(z=>z.price),
   ...(showLiquidity?futureZones.flatMap(z=>[z.low,z.high]):[]),
   ...(showLiquidity?zoneBoard.items.flatMap(z=>z.low!=null&&z.high!=null?
     [z.low,z.high]:[]):[]),
   ...liveScaleValues
 ].filter(v=>Number.isFinite(v)&&v>0);
 // A missing LIVE candle is NOT a price of $1. In WAIT/stale states
 // that synthetic fallback made the BTC axis span 0–87k and flattened all
 // genuine M15 candles into a row at the top. Scale only observed prices.
 const chartReference=[formingVisible?forming?.close:null,
   trueHistory.at(-1)?.close,anchor].find(v=>
     typeof v==='number'&&Number.isFinite(v)&&v>0)??null;
 const min=important.length?Math.min(...important):(chartReference??1);
 const max=important.length?Math.max(...important):(chartReference??1);
 const viewport=mt5M15Viewport({mode:'ALL',allLow:Math.min(...trueHistory.flatMap(b=>[b.low]),...liveScaleValues,chartReference??min),
   allHigh:Math.max(...trueHistory.flatMap(b=>[b.high]),...liveScaleValues,chartReference??max),
   lastPrice:chartReference,history:trueHistory,
   // In WATCH mode use both closed-M15-derived illustrative routes to size
   // the display. Ignore remote levels for vertical zoom; never move prices.
   forecast:[],
   atr:projected.atr??watchGuide.atr});
 const {lo,hi}=viewport;
 const py=(p:number)=>plotTop+(hi-p)/(hi-lo)*(plotBottom-plotTop);
 const scaleLevels=[
   ...goals.map(g=>({key:'TP'+g.stage,price:g.price,kind:'TARGET'})),
   ...visualGoals.map(g=>({key:'هدف مشروط '+g.stage,price:g.price,kind:'ILLUSTRATION'})),
   
   ...(stop!=null?[{key:'SL',price:stop,kind:'STOP'}]:[]),
   ...(price!=null?[{key:'LIVE',price,kind:'PRICE'}]:[])
 ];
 const actualStride=(split-left-5)/Math.max(trueHistory.length,1);
 const timeX=(time:number)=>{
   const i=trueHistory.findIndex(b=>b.time>time);
   if(i===0)return left;
   const index=i<0?trueHistory.length-1:i-1;
   const bar=trueHistory[index];
   return left+(bar?index+clamp((time-bar.time)/300000,0,1):0)*actualStride;
 };
 const liquidityColor=(kind:string)=>
   kind==='DEMAND'||kind==='LOW_POOL'||kind==='REBOUND_UP'?
   '#41cfab':'#ff7b90';
 // Identical M15 candle geometry on both sides. The original forecast is
 // 12 scored hypothesis bars plus an explicitly unscored target illustration.
 const projectedStride=(end-split-8)/Math.max(12,renderedBars.length);
 const realCandleWidth=clamp(actualStride*.68,.8,5.2);
  // Display a maximum of five DISTINCT actual OHLC zones. Several demand,
 // rejection and sweep levels can occupy the exact same pixels; painting
 // each translucent band over the others created the misleading red blob.
 // Keep ALL source zones in liquidity for analysis, suppress visual doubles.
 const priority=(kind:string)=>kind.startsWith('REBOUND_')?3:
   kind==='DEMAND'||kind==='SUPPLY'?2:1;
 const drawnZones=liquidity.zones.filter((z,i,all)=>{
   const center=(z.low+z.high)/2;
   const rank=priority(z.kind);
   return !all.some((other,j)=>j!==i&&
     Math.abs(py((other.low+other.high)/2)-py(center))<15&&
     (priority(other.kind)>rank||
       (priority(other.kind)===rank&&j<i)));
 }).sort((a,b)=>Math.abs((a.low+a.high)/2-(price??0))-
                   Math.abs((b.low+b.high)/2-(price??0))).slice(0,5);
 // Labels have their own non-overlapping lane on the historical side.
 const compactZones=compactM15ZoneAnnotations(drawnZones,price??0,py,2,34);
 const zoneLabelPoints=compactZones.map((z,i)=>({i,y:py(z.price)}));
 for(let i=0;i<zoneLabelPoints.length;i++)
   zoneLabelPoints[i].y=Math.max(clamp(zoneLabelPoints[i].y,plotTop+17,plotBottom-15),
     i?zoneLabelPoints[i-1].y+25:plotTop+17);
 const zoneOverhang=zoneLabelPoints.length?
   Math.max(0,zoneLabelPoints[zoneLabelPoints.length-1].y-(plotBottom-15)):0;
 if(zoneOverhang)for(const z of zoneLabelPoints)z.y-=zoneOverhang;
 // Four evidence-backed areas share the chart (not a duplicate price rail).
 // Space labels only, keeping their horizontal lines on the EXACT price.
 // Keep the core hunter levels visible in the clean chart; secondary
 // diagnostics remain behind the details toggle.
 const watchLabels=showLiquidity&&showExtra?watchPrices.filter(z=>
   z.price>=lo&&z.price<=hi).map(z=>({...z,exactY:py(z.price)})):[];
 const forwardLabels=showLiquidity&&showExtra?futureZones.filter(z=>
   z.price>=lo&&z.price<=hi).map(z=>({...z,exactY:py(z.price)})):[];
 const liquidityPalette={
   SELL:'#ff8393',BUY:'#51e5b8',HIGH_LIQ:'#e9bf66',LOW_LIQ:'#67d9ed'
 } as const;
 const liquidityLabels=showLiquidity&&zoneBoard.ready?
   zoneBoard.items.filter(z=>z.low!=null&&z.high!=null).map(z=>({
     ...z,label:z.key==='BUY'?'طلب · صعود محتمل':z.key==='SELL'?'عرض · هبوط محتمل':z.label,
     price:(z.low!+z.high!)/2,color:liquidityPalette[z.key]
   })).filter(z=>Number.isFinite(z.price)&&z.price>0):[];
 const positionedLiquidityLabels=liquidityLabels.map(z=>({
   ...z,exactY:py(z.price),labelY:clamp(py(z.price),plotTop+20,plotBottom-20)
 })).sort((a,b)=>a.labelY-b.labelY);
 for(let i=1;i<positionedLiquidityLabels.length;i++)
   positionedLiquidityLabels[i].labelY=Math.max(
     positionedLiquidityLabels[i].labelY,positionedLiquidityLabels[i-1].labelY+25);
 const labelOverflow=positionedLiquidityLabels.length?
   Math.max(0,positionedLiquidityLabels.at(-1)!.labelY-(plotBottom-20)):0;
 if(labelOverflow)for(const label of positionedLiquidityLabels)
   label.labelY-=labelOverflow;
 const candle=(open:number,high:number,low:number,close:number,xpos:number,width:number,
   key:string)=> {
   const up=close>=open,color=up?'#39d6cc':'#fa5970';
   const top=Math.min(py(open),py(close)),height=Math.max(1,Math.abs(py(open)-py(close)));
   return <g key={key} className="sniper-m15-real">
     <line x1={xpos} x2={xpos} y1={py(high)} y2={py(low)}
       stroke={color} strokeWidth="1.05"/>
     <rect x={xpos-width/2} y={top} width={width} height={height}
       fill={color} stroke={color} strokeWidth=".35"/>
   </g>;
 };
 const direction=chartSide==='BUY'?'↗ صعود':chartSide==='SELL'?'↘ هبوط':'↔ انتظار';
 const labelBy=(s:string)=>s==='SL'?'إبطال':s==='LIVE'?'LIVE':
   s.startsWith('WATCH')?'رصد'+s.slice(5):s;
 const grid=Array.from({length:9},(_,i)=>lo+(hi-lo)*i/8);
 const latestClosed=trueHistory.at(-1);
 // Chart decision is prospective: WAIT or PREBREAK WATCH, unless a real
 // setup was issued and subsequently confirmed. Historical/price-only flow
 // cannot be upgraded to broker executions or hindsight BUY/SELL.
 const leadTime=Number(chartLead?.sourceAt||0);
 const leadFresh=Boolean(marketOpen&&freshObservation&&
   chartLead?.asset===asset&&leadTime>0&&leadTime<=now+1500&&now-leadTime<=5000);
 const leadVerified=Boolean(leadFresh&&chartLead?.armed&&
   chartLead?.stage==='ARMED'&&
   chartLead?.mode===(asset==='GOLD'?'DOM':'CROSS_EXCHANGE')&&
   (chartLead?.side==='BUY'||chartLead?.side==='SELL'));
 const leadPriceWatch=Boolean(asset==='GOLD'&&leadFresh&&
   chartLead?.mode==='MICRO_FLOW'&&chartLead?.stage==='BUILDING'&&
   chartLead?.source==='Gold live price-tick watch · no broker DOM'&&
   !chartLead?.armed&&
   (chartLead?.side==='BUY'||chartLead?.side==='SELL'));
 // Independent local M1 observations must not be silenced by unrelated
 // M15 archive gaps. Only the qualified executable-style label keeps the
 // full chart history readiness requirement.
 const commandFastLive=marketOpen&&Boolean(m.sniper.view.priceFresh)&&!providerTransition;
 const commandLive=commandFastLive&&m.historyFresh;
 const commandConfirmed=commandLive&&
   earlyOpportunity.phase==='BREAK_CONFIRMED'&&
   earlyOpportunity.quality==='SETUP'&&
   earlyOpportunity.side!=='WAIT';
 const commandM1=commandFastLive&&movementSignal.phase==='PREPARE'&&
   movementSignal.side!=='WAIT'&&movementSignal.trigger!=null&&
   price!=null&&(movementSignal.side==='BUY'?
     movementSignal.trigger>price:movementSignal.trigger<price);
 const commandM5=commandFastLive&&!commandM1&&cuePrebreak&&
   m5Cue.trigger!=null&&price!=null&&
   (m5Cue.side==='BUY'?m5Cue.trigger>price:m5Cue.trigger<price);
 const commandGold=commandFastLive&&!commandM1&&!commandM5&&
   showGoldSpotPlan&&goldSpotPlan!=null&&price!=null&&
   (goldSpotPlan.side==='BUY'?goldSpotPlan.trigger>price:goldSpotPlan.trigger<price);
 // The cached GOLD M1 scout carries no broker trigger and is non-executable.
 const commandLocalGold=commandFastLive&&!commandConfirmed&&!commandM1&&
   !commandM5&&!commandGold&&goldLocalWatch!=null;
 const commandLead=commandFastLive&&!commandConfirmed&&!commandM1&&
   !commandM5&&!commandGold&&!commandLocalGold&&(leadVerified||leadPriceWatch);
 const commandWatch=!commandConfirmed&&(commandM1||commandM5||
   commandGold||commandLocalGold||commandLead);
 // A direction observed after the move starts is not an early opportunity.
 const commandFollowing=commandFastLive&&!commandWatch&&!commandConfirmed&&
   (m5Cue.stage==='M5_FOLLOWING'||m5Cue.stage==='M1_DIRECTION_WATCH')&&
   (m5Cue.side==='BUY'||m5Cue.side==='SELL');
 const commandSide=commandConfirmed?earlyOpportunity.side:
   commandM1?movementSignal.side:commandM5?m5Cue.side:
   commandGold?goldSpotPlan!.side:
   commandLocalGold?goldLocalWatch!.side:
   commandLead?(chartLead?.side??'WAIT'):
   commandFollowing?m5Cue.side:'WAIT';
 const commandState=commandConfirmed?'CONFIRMED':
   commandWatch?'WATCH':commandFollowing?'OBSERVE':
   commandFastLive?'WAIT':'OFFLINE';
 // Display GOLD's truly separate PAXG exchange book/tape as proxy evidence
 // only; it never upgrades a price-only XAU observation to a broker flow vote.
 const goldMeter=asset==='GOLD'?goldLiquidityMeter(goldPerp,paxg,now,marketOpen):null;
 const goldProxyReadout=asset==='GOLD'?observeGoldProxyFlow({
   now,marketOpen,flow:paxg,chartSide:liquidityReadout.aheadSide
 }):null;
 // The existing BTC pre-break detector already tests a recent same-venue
 // execution sample against local price structure. Show its evidence without
 // adding a trade signal or interpreting unavailable flow as balanced.
 const goldPerpReadout=asset==='GOLD'?observeGoldProxyFlow({
   now,marketOpen,flow:goldPerp,chartSide:liquidityReadout.aheadSide,instrument:'XAUUSDT'
 }):null;
 const crossFlow=goldPerpReadout?.status!=='UNAVAILABLE'&&goldPerpReadout?goldPerp?.crossFlow:null;
 const crossLabel=crossFlow?.consensus==='BUY'?'اتفاق منصتين ↑':
   crossFlow?.consensus==='SELL'?'اتفاق منصتين ↓':
   crossFlow?.consensus==='CONFLICT'?'تعارض المنصات':null;
 const crossDetail=crossFlow?crossFlow.venues.map(v=>v.source+' · CVD مرصود 60ث '+v.sampledCvd60s.toFixed(3)+
   ' · '+v.count+' تنفيذ · انتقال أكبر عرض/طلب '+(v.askWallShift?.toFixed(2)??'—')+'/'+(v.bidWallShift?.toFixed(2)??'—')).join(' | ')+
   (crossFlow.leader?' · تقدم مرصود بين العقود: '+crossFlow.leader+' ('+crossFlow.leadPairs+' مقارنة؛ ليس قيادة XAUUSD)':''):null;
 const btcCrossFresh=asset==='BTC'&&marketOpen&&btcCross&&
   btcCross.observedAt<=now&&now-btcCross.observedAt<=10000&&
   btcCross.venues.every(v=>v.asOf<=now&&now-v.asOf<=10000)?btcCross:null;
 const btcCrossLabel=btcCrossFresh?.consensus==='BUY'?'اتفاق BTC ↑':
   btcCrossFresh?.consensus==='SELL'?'اتفاق BTC ↓':
   btcCrossFresh?.consensus==='CONFLICT'?'تعارض منصات BTC':null;
 const btcLiquidityLabel=asset==='BTC'&&tapeWatch?
   tapeWatch.kind==='ABSORPTION'?
     (tapeWatch.side==='BUY'?'امتصاص بيع محتمل ↑':'امتصاص شراء محتمل ↓'):
     (tapeWatch.side==='BUY'?'ضغط تنفيذ شراء ↑':'ضغط تنفيذ بيع ↓'):null;
 const commandHeadline=commandConfirmed?
   commandSide==='BUY'?'BUY · شراء':'SELL · بيع':
   commandLocalGold?commandSide==='BUY'?'WATCH BUY · سعري':'WATCH SELL · سعري':
   commandWatch?commandSide==='BUY'?'WATCH BUY':'WATCH SELL':
   commandFollowing?commandSide==='BUY'?'↗ صعود مرصود':'↘ هبوط مرصود':
   commandFastLive?'WAIT':'تحديث السوق';
 const commandTrigger=commandConfirmed||commandM1?movementSignal.trigger:
   commandM5?m5Cue.trigger:commandGold?goldSpotPlan!.trigger:null;
 const commandInvalidation=commandConfirmed||commandM1?
   movementSignal.invalidation:commandM5?m5Cue.invalidation:
   commandGold?goldSpotPlan!.invalidation:null;
 const commandTarget=commandConfirmed||commandM1?movementSignal.targets?.[0]??null:
   commandGold?goldSpotPlan!.target:null;
 const commandWhy=commandConfirmed||commandM1?movementSignal.reason:
   commandM5?m5Cue.detail:commandGold?goldSpotPlan!.reason:
   commandLocalGold?'رصد سعري M1 دون عمق أوامر Exness · '+goldLocalWatch!.reason:
   commandLead?(leadVerified?'رصد دفتر أوامر مؤهل للمراقبة فقط · ':'رصد تغيرات سعرية فقط · ')+
     String(chartLead?.reason||''):
   commandFollowing?'حركة مرصودة بعد بدايتها · ليست تنبيه دخول مبكر · '+m5Cue.detail:
   commandFastLive?'لا توجد تهيئة مبكرة مكتملة':'تجديد بيانات السعر';
 const commandText=String(commandWhy||'').split(' · ')[0].slice(0,68);
 // Opportunity labels use the live observer and its immutable issued records.
 return <section className="sniper-m15-panel" dir="rtl"
   aria-label="القناص: شموع خمس دقائق فعلية وسياق تحليل M15 مشروط">
   <header className="sniper-m15-head">
     {assetView==='ALL'?<div className="sniper-m15-assets" role="group" aria-label="الأصل">
       <button type="button" onClick={()=>setChosen('GOLD')} aria-pressed={asset==='GOLD'}>XAUUSD</button>
       <button type="button" onClick={()=>setChosen('BTC')} aria-pressed={asset==='BTC'}>BTCUSD</button>
     </div>:<b>{asset==='GOLD'?'XAUUSD':'BTCUSD'}</b>}
     <b className="sniper-m15-frame">M5</b>
     <button type="button" className="sniper-m15-liquidity-toggle"
       aria-pressed={showLiquidity} onClick={()=>setShowLiquidity(v=>!v)}
       title="مناطق سيولة القمم والقيعان، الطلب والعرض والارتداد أو الرفض بعد إغلاق M15">
       {showLiquidity?'المناطق ✓':'المناطق'}</button>
   </header>
   
   <div className="sniper-hunter-workbench" style={{display:"block"}}>
     
     <div className="sniper-hunter-center" style={{width:"100%",maxWidth:"none"}}>
   <div className="sniper-m15-view-controls" aria-label="عرض سيناريو القناص">
     <button type="button" className="sniper-m15-focus-toggle"
       aria-pressed={focusView} onClick={()=>setFocusView(v=>!v)}
       title="تكبير الشموع الحقيقية ومسار السعر المشروط">
       {focusView?'سياق كامل':'تكبير الحركة القريبة'}</button>
     <button type="button" className="sniper-m15-extra-toggle"
       aria-pressed={showExtra} onClick={()=>setShowExtra(v=>!v)}
       title="عرض أو إخفاء التفاصيل الفنية الثانوية">
       {showExtra?'إخفاء علامات الرسم':'علامات الرسم'}</button>
     {projected.ready&&<button type="button" className="sniper-m15-extension-toggle"
       aria-pressed={showHistoricalExtension}
       onClick={()=>setShowHistoricalExtension(v=>!v)}
       title="مد مسار السعر المشروط دون أي شموع مستقبلية">
       {showHistoricalExtension?'أول 12 خطوة':'مد المسار للأهداف'}</button>}
   </div>
   {/* Compact signal status is printed INSIDE real M5 SVG, not a giant paragraph. */}
   <div className="sniper-m15-chart-box" id="sniper-performance"
     data-clean={!showExtra}>
     <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={
         (projected.ready?'شموع M5 حقيقية ومسار M15 مشروط بلا شموع مستقبلية؛ ليس توقعًا مضمونًا. ':
           showWatchGuide?'شموع M5 مغلقة ومساران مشروطان من ATR للمراقبة، وليسا توقع شموع أو أوامر. ':
           'شموع M5 مغلقة فقط؛ لا يوجد نطاق مراقبة موثوق حاليًا. ')+
         (verifiedArchive.ready?'أرشيف حقيقي متحقق '+verifiedArchive.storedBars+' شمعة':'أرشيف سنوات غير متاح')+
         '. تقييم خارج العينة '+walkForward.selected+' قرارًا، لا يثبت أفضلية.'
       }
       preserveAspectRatio="none">
       <defs>
         <clipPath id={'sniper-m15-clip-'+asset}>
           <rect x={left} y={plotTop} width={end-left} height={plotBottom-plotTop}/>
         </clipPath>
       </defs>
       <rect width={W} height={H} fill="#050b13"/>
       {grid.map((v,i)=><line key={'grid'+i}
         x1={left} x2={end} y1={py(v)} y2={py(v)}
         stroke="#193549" strokeDasharray="2 8" strokeWidth=".7"/>)}
       {Array.from({length:8},(_,i)=><line key={'vx'+i} x1={left+i*(end-left)/7}
         x2={left+i*(end-left)/7} y1={plotTop} y2={plotBottom}
         stroke="#1a3543" strokeDasharray="2 9" strokeWidth=".65"/>)}
       <g clipPath={'url(#sniper-m15-clip-'+asset+')'}>
         {/* Only four authentic OHLC liquidity levels; colors match source areas. */}
         {showLiquidity&&liquidityLabels.map(z=><g key={'liquidity-band-'+z.key}
           className="sniper-m15-liquidity-line">
           <rect x={left} y={py(z.high!)} width={end-left}
             height={Math.max(1,py(z.low!)-py(z.high!))}
             fill={z.color} fillOpacity=".045"/>
           <line x1={left} x2={end} y1={py(z.price)} y2={py(z.price)}
             stroke={z.color} strokeWidth="1.15" strokeOpacity=".72"/>
           <title>{z.label+' · المنطقة المرصودة '+n(z.low)+' – '+n(z.high)+
             ' · '+z.source+' · للمراقبة فقط'}</title>
         </g>)}
         {showLiquidity&&showExtra&&zoneBoard.context&&
           <text className="sniper-m15-chart-context" x={left+5}
             y={plotTop+17} fill={zoneBoard.context.label.includes('تجميع')?
               '#6ee9bc':zoneBoard.context.label.includes('تصريف')?
               '#ff9aaa':'#e6c68b'}
             fontSize="8.5" fontWeight="700" textAnchor="end"
             direction="rtl" stroke="#000" strokeWidth="2"
             paintOrder="stroke">
             {zoneBoard.context.label+(zoneBoard.context.historical?
               ' · تاريخي':' · مرصود')}
           </text>}
         {/* Same black background for real and hypothetical candles. */}
         {showLiquidity&&showExtra&&liquidity.context&&(()=>{
           const z=liquidity.context!;
           const xa=timeX(z.from),xb=Math.min(split,timeX(z.to));
           const top=py(z.high),bottom=py(z.low);
           const color=z.kind==='ACCUMULATION'?'#43e0aa':
             z.kind==='DISTRIBUTION'?'#ff9d7f':'#e7bc78';
           return <g className="sniper-m15-context" key="liquidity-context">
             <rect x={xa} y={top} width={Math.max(2,xb-xa)}
               height={Math.max(2,bottom-top)} fill={color} fillOpacity=".055"
               stroke={color} strokeWidth="1" strokeDasharray="5 4"/>
             <title>{z.label+' · '+n(z.low)+' – '+n(z.high)+
               ' · منطقة M5 مثبتة بشموع مغلقة، ليست أوامر مؤسسات'}</title>
           </g>;
         })()}
         {showLiquidity&&showExtra&&liquidity.zones.map(z=>{
           if(!drawnZones.includes(z))return null;
           const color=liquidityColor(z.kind),top=py(z.high),bottom=py(z.low);
           const pool=z.kind==='HIGH_POOL'||z.kind==='LOW_POOL';
           const reaction=z.kind==='REBOUND_UP'||z.kind==='REBOUND_DOWN';
           return <g key={'zone-'+z.kind+'-'+z.low} className="sniper-m15-zone">
             <rect x={left+2} y={top} width={split-left-6}
               height={Math.max(1,bottom-top)} fill={color}
               fillOpacity={pool?'.012':reaction?'.035':'.04'}/>
             <line x1={left+2} x2={split-4} y1={top} y2={top}
               stroke={color} strokeWidth=".85" strokeOpacity=".55"
               strokeDasharray={pool?'2 5':reaction?'2 3':'5 5'}/>
             <line x1={left+2} x2={split-4} y1={bottom} y2={bottom}
               stroke={color} strokeWidth=".85" strokeOpacity=".55"
               strokeDasharray={pool?'2 5':reaction?'2 3':'5 5'}/>
             <title>{z.label+' · '+n(z.low)+' – '+n(z.high)+
               (z.invalidation!=null?' · إبطال '+n(z.invalidation):'')+
               ' · '+z.source+' · شموع مغلقة، لا أوامر مؤسسات'}</title>
           </g>;
         })}
         {/* Price-true M15 demand/supply continued only as a
              hypothetical reaction area, not a future event. */}
         {showLiquidity&&showExtra&&!futureZones.length&&projected.ready&&reactionMap.bands.map((z,i)=>{
           const color=z.kind==='DEMAND'||z.kind==='REBOUND_UP'?'#44dab2':'#ff8c9b';
           return <g className="sniper-m15-reaction-band" key={'bounce-band-'+i}>
             <line x1={split+4} x2={end-4}
               y1={py(z.high)} y2={py(z.high)}
               stroke={color} strokeWidth=".85" strokeDasharray="3 5" opacity=".55"/>
             <line x1={split+4} x2={end-4}
               y1={py(z.low)} y2={py(z.low)}
               stroke={color} strokeWidth=".85" strokeDasharray="3 5" opacity=".55"/>
             <title>{z.label+' · '+n(z.low)+' – '+n(z.high)+
               ' · '+z.source+' · منطقة تاريخية، والارتداد المستقبلي مشروط'+
               ' · إبطال المنطقة '+n(z.invalidation)}</title>
           </g>;
         })}
         {/* Historic M15 supply/demand and liquidity TEST zones projected
              into the future pane, including BTC neutral/WAIT states. */}
         {showLiquidity&&watchLabels.map(t=>{
            const color=t.side==='BUY'?'#48e5b9':'#ffa6a0';
            return <g key={'watch-line-'+t.key} className="sniper-m15-watch-target">
              <line x1={split+3} x2={end-3} y1={t.exactY} y2={t.exactY}
                stroke={color} strokeWidth="1.15" strokeDasharray="6 5"
                strokeOpacity=".82"/>
              <circle cx={end-4} cy={t.exactY} r="1.8" fill={color}/>
              <text x={end-8} y={t.exactY-5} textAnchor="end"
                fill={color} fontSize="8" stroke="#000" strokeWidth="2"
                paintOrder="stroke">{(t.side==='BUY'?'سيولة صعود ':'سيولة هبوط ')+n(t.price)}</text>
              <title>{'مستوى '+(t.side==='BUY'?'سيولة صعود':'سيولة هبوط')+
                ' للمراقبة '+n(t.price)+' · قمة/قاع '+t.source+
                ' مغلق · ليس TP محققًا ولا أمر دخول'}</title>
            </g>;
          })}
          {showLiquidity&&forwardLabels.map(z=>{
           const buying=z.key==='DEMAND'||z.key==='LOW_POOL';
           const pool=z.key==='HIGH_POOL'||z.key==='LOW_POOL';
           const color=buying?'#4ee5b3':'#ff8497';
           return <g key={'future-level-'+z.key}
             className="sniper-m15-future-zone">
             {/* Translucent evidence-based price zone, NOT predicted future orders. */}
              <path d={'M '+(split+4)+' '+py(z.high)+
                ' H '+(end-4)+' V '+py(z.low)+
                ' H '+(split+4)+' Z'}
                fill={color} opacity=".085"/>
             <line x1={split+4} x2={end-4}
               y1={py(z.high)} y2={py(z.high)}
               stroke={color} strokeOpacity=".86" strokeWidth="1.1"
               strokeDasharray={pool?'2 5':'5 4'}/>
             {!pool&&<line x1={split+4} x2={end-4}
               y1={py(z.low)} y2={py(z.low)}
               stroke={color} strokeOpacity=".86" strokeWidth="1.1"
               strokeDasharray="5 4"/>}
             <text x={end-8} y={(py(z.high)+py(z.low))/2-4}
               textAnchor="end" fill={color} fontSize="8" stroke="#000"
               strokeWidth="2" paintOrder="stroke">{z.label+' '+n(z.price)}</text>
             <title>{z.subtitle+' · منطقة تاريخية '+n(z.low)+' – '+n(z.high)+
               ' · '+z.source+' · مستوى تأكيد '+n(z.confirm)+
               ' · إبطال '+n(z.invalidate)+
               ' · ليست أوامر مستقبلية أو إشارة صفقة'}</title>
           </g>;
         })}
         {showLiquidity&&<SniperMarketStructureOverlay structure={structure}
           left={left} split={split} top={plotTop} bottom={plotBottom}
           py={py} timeX={timeX} visibleFrom={trueHistory[0]?.time}/>}
         {trueHistory.map((b,i)=>candle(b.open,b.high,b.low,b.close,
           left+(i+.5)*actualStride,realCandleWidth,'real'+b.time))}
         {/* The next-M1 watch is fixed by prior CLOSED minute candles,
              not guessed from the color of this unfinished candle. */}
         {showExtra&&!visiblePreOpen&&formingVisible&&forming&&marketOpen&&nextM1.ready&&
           nextM1.side!=='WAIT'&&<g className="sniper-hunt-live-direction">
             <text x={split-7}
               y={clamp(py(forming.close)+23,plotTop+28,plotBottom-12)}
               textAnchor="end" direction="rtl"
               fill={nextM1.side==='BUY'?'#7effbf':'#ff8aa4'}
               fontSize="9" fontWeight="800" stroke="#02090e"
               strokeWidth="2.5" paintOrder="stroke">
               {nextM1.side==='BUY'?'↑ M1 مراقبة':'↓ M1 مراقبة'}
             </text>
           </g>}

         {showWatchGuide&&watchGuide.anchor!=null&&
           <g className="sniper-m15-watch-guide">
             <SniperM15HuntOverlay forecast={huntPreview} proof={huntProof} asset={asset}
               m1={nextM1} marketOpen={marketOpen}
               observed={formingVisible&&forming?[...realM5,forming]:realM5}
               flowSide={flowProfile.ready?flowProfile.side:'WAIT'}
               obstruction={routeObstacle}
               left={left} split={split} end={end}
               top={plotTop} bottom={plotBottom} py={py}
               liquidity={showLiquidity}/>
           </g>}
         {projected.ready&&<line x1={split} x2={split} y1={plotTop} y2={plotBottom}
           stroke="#7e9bb1" strokeWidth="1.25" strokeDasharray="5 5"/>}
         {projected.ready&&showExtra&&<text x={end-8} y={plotTop+13}
           textAnchor="end" fill={chartSide==='BUY'?'#55e5b6':'#ff8195'}
           fontSize="9" fontWeight="800" stroke="#000" strokeWidth="2"
           paintOrder="stroke">
           {'سيناريو '+(chartSide==='BUY'?'صعود':'هبوط')}
         </text>}
         {/* The forecast is a conditional PRICE PATH, never hypothetical candlesticks. */}
         {projected.ready&&renderedBars.length>0&&<g
           className="sniper-m15-conditional-route">
           <polyline
             points={[[split-3,py(renderedBars[0].open)],
               ...renderedBars.map((b,i)=>[
                 split+5+(i+.5)*projectedStride,py(b.close)]
               )].map(point=>point.join(',')).join(' ')}
             stroke={chartSide==='BUY'?'#53e8b8':'#ff7798'}
             strokeWidth="2" strokeDasharray="6 5" fill="none"
             opacity={routeObstacle.blocked?.25:.85}/>
           <circle cx={split-3} cy={py(renderedBars[0].open)}
             r="3.2" fill="#061a20" stroke="#e8c477" strokeWidth="1.6"/>
           <title>مسار سعري مشروط من الشموع المغلقة؛ لا توجد شموع مستقبلية</title>
         </g>}
         {projected.ready&&aligned&&forming&&elapsedSteps===0&&
           <g className="sniper-m15-anchor-link">
           {/* Pin the ORIGINAL observed issuance price. Live ticks must never
               re-anchor or silently erase a forecast after it is recorded. */}
           <line x1={split-3} y1={py(projected.bars[0].open)}
             x2={split+5+.5*projectedStride} y2={py(projected.bars[0].open)}
             stroke="#aaf5de" strokeWidth="1.7"/>
           <circle cx={split-3} cy={py(projected.bars[0].open)} r="2.2"
             fill="#aaf5de" stroke="#031310" strokeWidth=".6"/>
           <circle cx={split+5+.5*projectedStride}
             cy={py(projected.bars[0].open)} r="2.2"
             fill="#aaf5de" stroke="#031310" strokeWidth=".6"/>
           {Math.abs(forming.close-projected.bars[0].open)>0.0000001&&
             <line x1={split-3} y1={py(forming.close)}
               x2={split-3} y2={py(projected.bars[0].open)}
               stroke="#d7b779" strokeDasharray="2 3" strokeWidth=".8"/>}
           <title>{'توقع ثابت من السعر الحقيقي عند إصدار السيناريو '+
             n(projected.bars[0].open)+' · السعر الحي الآن '+n(forming.close)+
             ' · أول شمعة متوقعة تبدأ '+h(aligned.anchorTime+900000)+
             ' · اختلاف السعر بعد التثبيت لا يعيد كتابة توقع قديم'}</title>
         </g>}
         {projected.ready&&showExtra&&reactionMap.marks.map((mark,i)=>{
           const barX=split+5+(mark.step-elapsedSteps-.5)*projectedStride;
           const dotY=py(mark.price),color=mark.direction==='UP'?'#6bffe0':'#ffad92';
           // Place text in the quiet far-right lane rather than on top of
           // the first projected candles and original SL/zone badges.
           return <g className="sniper-m15-reaction-mark"
             key={'reaction-mark-'+mark.step+'-'+i}>
             <circle cx={barX} cy={dotY} r="4.2" fill="#000"
               stroke={color} strokeWidth="1.9"/>
             <path d={mark.direction==='UP'?
                'M '+(barX-5)+' '+(dotY+9)+' L '+barX+' '+(dotY+4)+
                  ' L '+(barX+5)+' '+(dotY+9):
                'M '+(barX-5)+' '+(dotY-9)+' L '+barX+' '+(dotY-4)+
                  ' L '+(barX+5)+' '+(dotY-9)}
               fill="none" stroke={color} strokeWidth="1.35"/>
             <title>{mark.detail+' · سعر السيناريو '+n(mark.price)+
               (mark.invalidation!=null?' · إبطال '+n(mark.invalidation):'')+
               ' · شموع توقع غير مؤكدة'}</title>
           </g>;
         })}
         {showLiquidity&&showExtra&&compactZones.map((z,i)=>{
           const color=z.kind==='MIXED'?
             z.label.includes('ارتداد')?'#41cfab':
             z.label.includes('رفض')?'#ff7b90':'#e8c184':
             liquidityColor(z.kind);
           const y=zoneLabelPoints[i].y,xBadge=split-7;
           return <g className="sniper-m15-zone-annotation"
             key={'group-label-'+i+'-'+z.price.toFixed(2)}>
             <line x1={split-15} x2={xBadge-1} y1={py(z.price)} y2={y}
               stroke={color} strokeOpacity=".44" strokeWidth=".7"/>
             <text x={xBadge} y={y+3} fill={color} fontSize="8.3"
               fontWeight="700" textAnchor="end" direction="rtl"
               stroke="#000" strokeWidth="2" paintOrder="stroke">
               {z.kind==='MIXED'?'مناطق':z.label.replace(/ ×\d+$/,'')}
             </text>
             <title>{z.detail}</title>
           </g>;
         })}
         {showLiquidity&&showExtra&&liquidity.context&&(()=>{
           const z=liquidity.context!,color=z.kind==='ACCUMULATION'?'#66e9b9':
             z.kind==='DISTRIBUTION'?'#ffac8e':'#eccc87';
           const xa=timeX(z.from),xb=Math.min(split,timeX(z.to));
           return <g className="sniper-m15-context-label">
             <text x={clamp((xa+xb)/2,left+43,split-39)}
               y={clamp(py(z.high)-8,plotTop+14,plotBottom-9)}
               fontSize="8.2" fill={color} textAnchor="middle" fontWeight="700"
               stroke="#000" strokeWidth="2" paintOrder="stroke">
               {z.kind==='ACCUMULATION'?'تجميع':z.kind==='DISTRIBUTION'?'تصريف':'انضغاط'}</text>
           </g>;
         })()}
         {showLiquidity&&showExtra&&liquidity.events.map((e,i)=>{
           const mark=e.kind==='SWEEP_LOW'?'سحب قاع':
             e.kind==='SWEEP_HIGH'?'سحب قمة':
             e.kind==='BOS_UP'?'BOS ↑':'BOS ↓';
           const color=e.kind==='BOS_UP'||e.kind==='SWEEP_LOW'?'#53ddb7':'#ffa0b0';
           const xMark=timeX(e.at),yMark=clamp(py(e.price),plotTop+12,plotBottom-15);
           return <g key={'liquidity-event-'+i} className="sniper-m15-event">
             <circle cx={xMark} cy={yMark} r="2.6" fill={color}/>
             <title>{e.label+' · '+n(e.price)+' · إغلاق مؤكّد'}</title>
             {i===liquidity.events.length-1&&
               !compactZones.some(z=>Math.abs(py(z.price)-yMark)<24)&&
               <text x={clamp(xMark,left+34,split-34)}
               y={clamp(yMark-13,plotTop+15,plotBottom-8)}
               fontSize="9" fill={color} fontWeight="700" textAnchor="middle"
               direction="rtl">{mark}</text>}
           </g>;
         })}
         {formingVisible&&forming&&<g className="sniper-m15-live-partial">
           <rect x={split-11} y={Math.max(plotTop,py(forming.high)-5)}
             width="14" height={Math.max(12,py(forming.low)-py(forming.high)+10)}
             fill="none" stroke="#a9e9ff" strokeOpacity=".5"
             strokeWidth=".7" strokeDasharray="2 3"/>
           {candle(forming.open,forming.high,forming.low,forming.close,
             split-4,realCandleWidth,
             'live-m15-'+forming.time)}
           <circle cx={split-4} cy={py(forming.close)} r="2.3"
             fill="#c0f7ff" stroke="#00212c" strokeWidth=".7"/>
           {showExtra&&<text x={split-15} y={Math.max(plotTop+13,py(forming.high)-8)}
             fill="#b9efff" fontSize="8.2" fontWeight="700"
             textAnchor="end" direction="ltr" stroke="#000"
             strokeWidth="2.5" paintOrder="stroke">{'LIVE '+n(forming.close)}</text>}
           {showExtra&&formingBias!=='WAIT'&&<g className={'sniper-live-candle-bias '+(formingBias==='BUY'?'is-buy':'is-sell')}>
             <rect x={split-49} y={clamp(py(forming.close)-24,plotTop+5,plotBottom-20)}
               width="34" height="15" rx="3"
               fill={formingBias==='BUY'?'#0a3b30':'#481d29'}
               stroke={formingBias==='BUY'?'#55e5b6':'#ff8195'} strokeWidth="1"/>
             <text x={split-32} y={clamp(py(forming.close)-13,plotTop+16,plotBottom-9)}
               fill={formingBias==='BUY'?'#75f0c5':'#ff9bad'}
               fontSize="8" fontWeight="800" textAnchor="middle">
               {formingBias==='BUY'?'BUY':'SELL'}
             </text>
           </g>}
           <title>{'شمعة M5 جارية وليست مغلقة: '+n(forming.close)+
             ' · شموع M1 '+forming.minutes+
              ' · عينات تيك '+forming.sampledTicks+
              (forming.minutes===0?' · رصد تيك جزئي، ليس شمعة مكتملة':'')}</title>
         </g>}
       </g>
       {/* Small LIVE/TP/stop notes inside the plot, never a wide right rail. */}
       {scaleLevels.filter(level=>level.kind!=='PRICE'&&
          level.price>=lo&&level.price<=hi)
          .map(level=>{
         const color=level.kind==='TARGET'?'#55eab9':
           level.kind==='STOP'?'#ff8093':
           level.kind==='ILLUSTRATION'?'#e2c585':'#d9ecf4';
         const y=py(level.price);
         return <g key={'inline-'+level.key} className="sniper-m15-inline-price">
           <line x1={end-19} x2={end-5} y1={y} y2={y}
             stroke={color} strokeWidth="1.2" opacity=".95"/>
           {showExtra&&<text x={split+8} y={clamp(y-4,plotTop+12,plotBottom-8)}
             fill={color} fontSize="8.6" fontWeight="700"
             textAnchor="start" direction="ltr"
             stroke="#000" strokeWidth="2.4" paintOrder="stroke">
             {labelBy(level.key)+' '+n(level.price)}</text>}
         </g>;
       })}
       {showLiquidity&&showExtra&&positionedLiquidityLabels.map(z=><g key={'liq-label-'+z.key}
          className="sniper-m15-liquidity-label">
         {Math.abs(z.labelY-z.exactY)>10&&
           <line x1={end-15} x2={end-15} y1={z.exactY} y2={z.labelY}
             stroke={z.color} strokeDasharray="2 3" strokeWidth=".65"/>}
         <text x={end-6} y={z.labelY-4} fill={z.color}
            fontSize="8.2" fontWeight="700" textAnchor="start"
            direction="rtl" stroke="#000" strokeWidth="2.4" paintOrder="stroke">
            {z.label}
         </text>
         <text x={end-6} y={z.labelY+8} fill={z.color}
            fontSize="9.7" fontWeight="700" textAnchor="end"
            direction="ltr" stroke="#000" strokeWidth="2.4" paintOrder="stroke">
            {n(z.price)}
         </text>
       </g>)}
       {showExtra&&!paused&&!awaitingReplacement&&asset==='BTC'&&elapsedSteps===0&&
         projected.ready&&shownBars.length>0&&(()=>{
         const first=projected.bars[0],cx=split+5+.5*projectedStride;
         const color=firstRadarCandle.phase==='VERIFIED'?'#4de7ab':
           firstRadarCandle.phase==='CANCELLED'||firstRadarCandle.phase==='CONFLICT'?
             '#ff7187':'#dfba77';
         return <g className="sniper-m15-first-candle" aria-label={
           'أول شمعة متوقعة: '+firstRadarCandle.label}>
           <circle cx={cx} cy={py(first.close)} r="5.5" fill="none"
             stroke={color} strokeWidth="1.2"/>
           <line x1={cx} x2={cx} y1={Math.max(plotTop+10,py(first.high)-8)}
             y2={Math.max(plotTop+12,py(first.high)-2)}
             stroke={color} strokeWidth="1.1"/>
           <text x={split+6} y={plotTop+25} fill={color} fontSize="9.1"
             fontWeight="700" direction="rtl" textAnchor="start">
             {'الأولى: '+firstRadarCandle.label}</text>
           <title>{firstRadarCandle.reason+
             ' · تأكيد الرادار '+n(firstRadarCandle.confirm)+
             ' · إلغاؤه '+n(firstRadarCandle.invalidate)+
             ' · لا يمثل نسبة نجاح أو إذن تنفيذ'}</title>
         </g>;
       })()}
       {!projected.ready&&!showWatchGuide&&<g className="sniper-m15-empty-reason">
         <text x={(split+end)/2} y={plotTop+66} fill="#d6bd8f"
           fontSize="9" textAnchor="middle" direction="rtl">
           {detached?'السعر الحي ابتعد عن التوقع المحفوظ':
             blockedKey===candleKey?'السيناريو مُبطل':
             safeSide==='WAIT'?'نطاق سعري · راقب الكسر بعد الإغلاق':'انتظار سيناريو صالح'}</text>
         <text x={(split+end)/2} y={plotTop+83} fill="#9baaba"
           fontSize="8.3" textAnchor="middle" direction="rtl">
           {detached?'الشموع المتوقعة لم تتغير · انتظار إغلاق M15':
              freshObservation&&conditionalRange.valid?
              'فوق '+n(conditionalRange.upper)+' | تحت '+n(conditionalRange.lower):
              freshObservation?'لا توجد إشارة مؤكدة':'بانتظار تحديث بيانات السوق'}</text>
         <title>{lifecycle}</title>
       </g>}
       {projected.ready&&showExtra&&shownBars.length>0&&<g className="sniper-m15-first-audit">
         <text x={split+6} y={plotTop+(asset==='BTC'?42:25)}
           fill={firstM15Stats.ready?'#b3d9ec':'#899baa'}
           fontSize="8.2" textAnchor="start" direction="rtl">
           {firstM15Stats.label}</text>
         <title>{firstM15Stats.detail}</title>
       </g>}
       {trueHistory.length===0&&<g className="sniper-m15-history-empty" role="status"
         data-chart-history-state="NO_VERIFIED_CANDLES">
         <text x={(left+split)/2} y={plotTop+195} textAnchor="middle"
           fontSize="15" fill="#f0c481" direction="rtl">{asset==='GOLD'?'شموع الذهب غير متاحة من المصدر':'شموع البيتكوين غير متاحة من المصدر'}</text>
         <text x={(left+split)/2} y={plotTop+222} textAnchor="middle"
           fontSize="11" fill="#a4b9c5" direction="rtl">جارٍ إعادة الاتصال · لا إشارات على بيانات مفقودة</text>
       </g>}
       {trueHistory.length>0&&<g className="sniper-price-axis" aria-label="تدريج السعر">
         <rect x={end+1} y={plotTop} width={W-end-1} height={plotBottom-plotTop} fill="#0b1722"/>
         {grid.map((v,i)=><text key={i} x={W-4} y={py(v)+4} textAnchor="end"
           direction="ltr" fill="#c6d6e4" fontSize="10">{v.toFixed(2)}</text>)}
         {chartReference!=null&&<>
           <line x1={left} x2={end} y1={py(chartReference)} y2={py(chartReference)}
             stroke="#60dfd0" strokeDasharray="3 3" strokeWidth=".8"/>
           <rect x={end+1} y={clamp(py(chartReference)-11,plotTop,plotBottom-22)} width={W-end-2} height="22" fill="#12685f"/>
           <text x={W-4} y={clamp(py(chartReference)-11,plotTop,plotBottom-22)+15}
             textAnchor="end" direction="ltr" fontSize="10" fontWeight="800" fill="white">{chartReference.toFixed(2)}</text>
         </>}
       </g>}
       {/* Already-server-archived GOLD M1 pressure plan, NOT a qualified
           Exness order or evidence of bank liquidity. Show only while its
           original trigger is still ahead of the fresh matched quote. */}
       {showGoldSpotPlan&&goldSpotPlan&&
        goldSpotPlan.trigger>=lo&&goldSpotPlan.trigger<=hi&&
        <g data-gold-spot-fallback="read-only" data-issued-at={goldSpotPlan.issuedAt}
          data-side={goldSpotPlan.side} className="sniper-gold-spot-early-plan">
          <line x1={Math.max(left+16,split-125)} x2={split-5}
            y1={py(goldSpotPlan.trigger)} y2={py(goldSpotPlan.trigger)}
            stroke={goldSpotPlan.side==='BUY'?'#58e6bf':'#ff87a0'}
            strokeDasharray="3 5" strokeWidth="1.1" opacity=".9"/>
          <circle cx={split-5} cy={py(goldSpotPlan.trigger)} r="3.2"
            fill={goldSpotPlan.side==='BUY'?'#58e6bf':'#ff87a0'}
            stroke="#07111b" strokeWidth="1"/>
          <text x={split-13} y={clamp(py(goldSpotPlan.trigger)-11,plotTop+14,plotBottom-13)}
            textAnchor="end" direction="rtl" fontSize="9.4" fontWeight="900"
            fill={goldSpotPlan.side==='BUY'?'#83f3cb':'#ff9eb3'}
            stroke="#07111b" strokeWidth="3" paintOrder="stroke">
            {(goldSpotPlan.side==='BUY'?'شراء مبكر مشروط':'بيع مبكر مشروط')+
             ' · '+n(goldSpotPlan.trigger)}
          </text>
          <title>{goldSpotPlan.reason+' · تفعيل '+n(goldSpotPlan.trigger)+
            ' · هدف تاريخي '+n(goldSpotPlan.target)+
            ' · إبطال '+n(goldSpotPlan.invalidation)+
            ' · M1 spot فقط · لا يوجد DOM Exness، ليست صفقة منفذة'}</title>
        </g>}
       <SniperOpportunityMarkers signal={movementSignal} confirmedPrice={trackedSetup?.phase==='TRIGGERED'?trackedSetup.priceAt:null} records={movementRecords}
         evidenceScore={trackedSetup?.score??null}
         asset={asset} source={String(x?.candleSource||'')}
         from={trueHistory[0]?.time??now} now={now} left={left} split={split}
         end={end} top={plotTop} bottom={plotBottom} py={py} timeX={timeX}/>
       {previousCalls.filter(r=>r.scope===forecastScope).map(r=>{
         const index=trueHistory.findIndex(b=>b.time===r.target);
         const current=r.target===visiblePreOpen?.target;
         const open=index>=0?trueHistory[index].open:
           current&&forming?.time===r.target?forming.open:r.priceAt;
         if((index<0&&!current)||open==null||!Number.isFinite(open)||open<lo||open>hi)return null;
         const px=index>=0?left+(index+.5)*actualStride:split-4;
         const y=py(open),color=r.side==='BUY'?'#7effbf':'#ff8aa4';
         const lead=Math.ceil((r.target-r.issued)/1000);
         const adverse=current&&formingVisible&&forming?.time===r.target&&
           m.sniper.view.priceFresh&&price!=null&&(r.side==='BUY'?price<open:price>open);
         const label=(r.side==='BUY'?'شراء':'بيع')+' · قبلها '+lead+'ث'+(adverse?' · عكسه الآن':'');
         const ly=clamp(y+(r.side==='BUY'?27:-26),plotTop+15,plotBottom-12);
         return <g key={r.target} data-preopen-m5={r.target}>
           <title>{label+' · '+h(r.target)+' · '+r.reason}</title>
           <circle cx={px} cy={y} r={current?3.5:2.8} stroke={color} strokeWidth="1.4" fill="#07111b"/>
           {current&&!movementRecords.some(v=>v.asset===asset&&v.source===String(x?.candleSource||'')&&
             v.issuedAt>=r.issued&&v.issuedAt<=now&&v.kind==='EARLY')&&<>
             <line x1={px} y1={y} x2={px-34} y2={ly-3} stroke={color} strokeWidth=".8"/>
             <text x={px-68} y={ly} textAnchor="middle" direction="rtl" fill={color}
               stroke="#07111b" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="800">{label}</text>
           </>}
         </g>;
       })}
       {/* Closed-bar prebreak cue is separate from both M15 dual paths.
            It stays on a true price coordinate and never simulates TP. */}
       {distinctPrebreak&&m5Cue.trigger!=null&&m5Cue.invalidation!=null&&
         m5Cue.trigger>=lo&&m5Cue.trigger<=hi&&
         <g className="sniper-m5-prebreak-cue"
           data-m5-prebreak-side={m5Cue.side} data-issued-at={m5Cue.asOf}>
           <line x1={Math.max(left+16,split-140)} x2={split-5}
             y1={py(m5Cue.trigger)} y2={py(m5Cue.trigger)}
             stroke={m5Cue.side==='BUY'?'#58e6bf':'#ff87a0'}
             strokeWidth="1.4" strokeDasharray="4 4" opacity=".86"/>
           <text x={split-8} y={plotTop+42} textAnchor="end"
             direction="rtl" fontSize="9" fontWeight="800"
             fill={m5Cue.side==='BUY'?'#73efc7':'#ff9bb1'}
             stroke="#07111b" strokeWidth="3" paintOrder="stroke">
             {(tapeWatch&&m5Cue.asOf===tapeWatch.asOf&&m5Cue.trigger===tapeWatch.trigger?
               (m5Cue.side==='BUY'?'شراء مبكر؟':'بيع مبكر؟'):
               (m5Cue.side==='BUY'?'ترقب شراء':'ترقب بيع'))+
              ' · تفعيل '+n(m5Cue.trigger)}
           </text>
           <title>{m5Cue.detail+' · إبطال '+n(m5Cue.invalidation)+
             ' · M1/M5 فقط، لا توجد صفقة منفذة'}</title>
         </g>}
       {/* Distinct original PREBREAK must remain readable when its real trigger
           falls outside the visible historical price axis. Never move the price. */}
       {distinctPrebreak&&m5Cue.trigger!=null&&
         (m5Cue.trigger<lo||m5Cue.trigger>hi)&&
         <g data-m5-prebreak-offscreen={m5Cue.side}
           data-issued-at={m5Cue.asOf} className="sniper-m5-offscreen-cue">
           <text x={split-8} y={plotTop+42} textAnchor="end"
             direction="rtl" fontSize="9" fontWeight="800"
             fill={m5Cue.side==='BUY'?'#73efc7':'#ff9bb1'}
             stroke="#07111b" strokeWidth="3" paintOrder="stroke">
             {m5Cue.headline+' · تفعيل '+n(m5Cue.trigger)+' خارج الإطار'}
           </text>
           <title>{m5Cue.detail+' · إبطال '+n(m5Cue.invalidation)+
             ' · رصد مبكر قبل الكسر، وليس صفقة منفذة'}</title>
         </g>}
       {/* Genuine fresh lead, drawn within chart (no second box).
            A started/released move is NEVER promoted to early BUY/SELL. */}
       {!commandConfirmed&&!commandWatch&&(leadVerified||leadPriceWatch)&&
         <g className="sniper-chart-early-direction"
           data-qannas-chart-early={leadVerified?'DEPTH_WATCH':'PRICE_WATCH'}
           data-qannas-chart-early-side={chartLead?.side||'WAIT'}>
           <text x={split-7} y={plotTop+64} textAnchor="end"
             direction="ltr" fontSize="10" fontWeight="850"
             fill={chartLead?.side==='BUY'?'#6df2c2':'#ff9cb1'}
             stroke="#06131e" strokeWidth="3" paintOrder="stroke">
             {(chartLead?.side==='BUY'?'WATCH BUY':'WATCH SELL')+
               (leadVerified?' · FLOW':' · PRICE')}
           </text>
           <title>{(chartLead?.reason||'')+
             ' · رصد مبكر مستقل، ليس إذن تنفيذ أو هدفًا مضمونًا'}</title>
         </g>}
       {/* Compact box-free text. Details remain in hover/assistive title. */}
       <g className="sniper-m5-chart-status" role="status"
         aria-label={drawingBadge+' · '+drawingReason+' · '+marketContext.reason}>
         <title>{drawingBadge+' · '+drawingReason+' · '+marketContext.reason+
           (trackedSetup?.score!=null?' · أدلة '+trackedSetup.score+'/10 (ليست نسبة نجاح)':'')+
           ' · متابعة الحركة ليست توصية تداول'}</title>
         {/* A live on-price BUY?/SELL? label already exists beside its
             real trigger. Do not print the same cue a second time in the
             chart corner. Fallback headline remains for off-screen setups. */}
         {!((showGoldSpotPlan&&goldSpotPlan&&goldSpotPlan.trigger>=lo&&goldSpotPlan.trigger<=hi)||
           ((movementSignal.phase==='PREPARE'||
             movementSignal.phase==='TESTING'||
             movementSignal.phase==='BREAK_CONFIRMED')&&
             movementSignal.trigger!=null&&
             py(movementSignal.trigger)>=plotTop&&py(movementSignal.trigger)<=plotBottom))&&
           <text x={left+13} y={plotTop+21} textAnchor="end"
             direction="rtl" fill={drawingColor} fontSize="10"
             fontWeight="900" stroke="#07111b" strokeWidth="3.1"
             paintOrder="stroke">
             {drawingBadge}
           </text>}
       </g>
       <text x={left+3} y={17} fill="#ccd8e6" fontSize="10" direction="ltr" textAnchor="start">
          {trueHistory.length===0?'M5 · NO DATA':historicalOnly?(/COMEX/i.test(String(x?.candleSource||''))?'M5 · GC REF':'M5 · HISTORY'):'M5 · REAL'}
        </text>
       <text x={split+5} y={17} fill={projected.ready?'#e0c08d':'#9fc4d3'}
         fontSize="10" textAnchor="start" direction="ltr">
         {projected.ready?'M15 · PATH':detached&&visualAlignment?
           'انفصل المسار · '+n(visualAlignment.difference):sessionDataShort?
           'M15 · '+consecutiveM15+'/24':
           historicalOnly?'M15 · HISTORY':showWatchGuide?'M15 · WATCH':trueHistory.length===0?'M15 · NO DATA':'M15 · LIVE'}
         <title>{sessionDataShort?
           'آخر '+consecutiveM15+' من 24 إغلاق M15 متصل متاح؛ بيانات السيناريو المعتمد غير مكتملة بعد الجلسة، ولا يعني اكتمالها وجود صفقة':
           projected.ready?'مسار تحليلي مشروط محفوظ':
           'M15 للمراقبة؛ ليس أمر تداول أو ضمان نجاح'}</title>
       </text>
       {showExtra&&<text className="sniper-m15-extra-caption" x={split+5} y={plotTop+18} fill="#a5a9ad" fontSize="8.4"
         textAnchor="start" direction="rtl">{projected.ready?'مسار مشروط دون شموع مستقبلية؛ التوقع الأصلي محفوظ للتقييم فقط':showWatchGuide?'مساران مشروطان من M15 مغلق · ليست شموع مستقبلية':'شموع فعلية متصلة · لا توجد شموع توقع معتمدة الآن'}</text>}
       {latestClosed&&<text x={left+2} y={H-17} fill="#93a4b3" fontSize="11"
         textAnchor="start" direction="ltr">{h(trueHistory[0]?.time??latestClosed.time)}</text>}
       {latestClosed&&<text x={split} y={H-17} fill="#bacbd7" fontSize="11" textAnchor="middle" direction="ltr">{h(formingVisible&&forming?forming.time:latestClosed.time)}</text>}
       {aligned&&<text x={split+8} y={H-4} fill="#8acfb9" fontSize="8"
         textAnchor="start" direction="ltr">{'→ '+h(aligned.anchorTime+900000)}</text>}
       <text x={end-2} y={H-17} fill="#aebdc8" fontSize="11" textAnchor="end" direction="ltr">
         {renderedBars.length?'PATH'+(showHistoricalExtension?' · أهداف':''):'M5'}</text>
     </svg>
   {goldMeter&&goldProxyReadout&&<aside className="gold-meter-left sniper-chart-gold-proxy"
     data-gold-proxy-status={goldProxyReadout.status} data-gold-perp-status={goldPerpReadout?.status}
     data-meter-state={combinedGold.state} title={combinedGold.detail}>
     <div className="gold-liquidity-meter" data-meter-state={combinedGold.state}>
       <b className="gold-meter-label">السيولة · {combinedGold.sources.length}/4</b>
       {(['BUY','SELL'] as const).map(side=>{
         const value=side==='BUY'?combinedGold.buyPct:combinedGold.sellPct;
         return <div key={side} className="gold-meter-row" data-side={side}>
           <div className="gold-meter-head"><b>{side==='BUY'?'شراء ↑':'بيع ↓'}</b><strong dir="ltr">{value==null?'—':value+'%'}</strong></div>
           <div className="gold-meter-battery" aria-label={side+' '+(value??'غير متاح')}>
             {Array.from({length:10},(_,i)=><span key={i} className={value!=null&&i*10<value?'is-lit':''}/>)}
           </div>
         </div>;
       })}
       <span className="gold-meter-source">{combinedGold.state==='CONFLICT'?'تعارض المصادر':combinedGold.state==='UNAVAILABLE'?'غير متاح':combinedGold.state==='BUY'?'ضغط شراء':combinedGold.state==='SELL'?'ضغط بيع':'متوازن'}{combinedGold.ageSeconds!=null?' · '+combinedGold.ageSeconds+'ث':''}</span>
       {goldMeter.dynamic&&<span className="gold-meter-source" title={goldMeter.detail}>{goldMeter.dynamic}</span>}
     </div>
   </aside>}
   <aside className={'sniper-chart-command is-'+commandState.toLowerCase()}
     data-qannas-chart-signal={commandState}
     data-qannas-chart-side={commandSide}
     aria-label={'حالة القناص: '+commandHeadline}>
     <div className="sniper-chart-command-head">
       <small>M1/M5</small>
       <strong>{commandHeadline}</strong>
     </div>
     <div className="sniper-chart-command-frames">
       <span>{'M1 '+(nextM1.ready?
         nextM1.side==='BUY'?'↑':nextM1.side==='SELL'?'↓':'—':'—')}</span>
       <span>{'M15 '+(entryTrend==='BUY'?'↑':entryTrend==='SELL'?'↓':'—')}</span>
     </div>
     <div className={'sniper-chart-liquidity is-'+liquidityReadout.state.toLowerCase()}
       data-qannas-liquidity-state={liquidityReadout.state}
       title={liquidityReadout.reason}>
       {asset!=='GOLD'&&<b>{liquidityReadout.label}</b>}
       {asset!=='GOLD'&&liquidityReadout.aheadSide!=='WAIT'&&liquidityReadout.trigger!=null&&
         <small>{'قبل الكسر · '+(liquidityReadout.aheadSide==='BUY'?'شراء ':'بيع ')+
           n(liquidityReadout.trigger)}</small>}
       {(btcLiquidityLabel||btcCrossLabel)&&<small className="sniper-chart-gold-proxy"
         title={'رصد تنفيذ BTC وليس أمر دخول · '+(btcCrossFresh?.venues.map(v=>v.source+' Δ '+v.deltaPct.toFixed(1)+'% ('+v.trades+')').join(' | ')??'')}
         data-btc-tape-watch={tapeWatch?.kind} data-btc-cross={btcCrossFresh?.consensus}>{btcLiquidityLabel??btcCrossLabel}</small>}
     </div>
     {commandTrigger!=null&&<div className="sniper-chart-command-trigger">
       <span>تفعيل</span><b dir="ltr">{n(commandTrigger)}</b>
     </div>}
     <details className="sniper-chart-command-details">
       <summary>المستويات والسبب</summary>
       {goldMeter&&<small title={combinedGold.detail}>{liquidityReadout.label} · {crossLabel??goldPerpReadout?.label??goldProxyReadout?.label} · {combinedGold.sources.join(' / ')}{crossDetail?' · '+crossDetail:''}</small>}
       <small title="نموذج محلي من الشموع المغلقة؛ اختبار تاريخي منفصل زمنيًا وليس دقة تداول حي، ولا يصرح بالدخول">
         {'ML محلي تجريبي · '+(['m1','m5'] as const).map(h=>{
           const v=localMl[h];
           return h.toUpperCase()+' '+(v.side==='WAIT'?'—':v.side)+' '+(v.validationCount?v.validationHits+'/'+v.validationCount:'عينة غير كافية');
         }).join(' · ')}
       </small>
       <small title="شبكة عصبية محلية من الشموع؛ نتائج تاريخية تجريبية فقط">
         {'Neural محلي · '+(['neuralM1','neuralM5'] as const).map((h,i)=>{
           const v=localMl[h];return (i?'M5 ':'M1 ')+(v.side==='WAIT'?'—':v.side)+' '+(v.validationCount?v.validationHits+'/'+v.validationCount:'—');
         }).join(' · ')}
       </small>
       <div className="sniper-chart-command-levels">
         <span>تفعيل <b dir="ltr">{n(commandTrigger)}</b></span>
         <span>إبطال <b dir="ltr">{n(commandInvalidation)}</b></span>
         <span>هدف 1 <b dir="ltr">{n(commandTarget)}</b></span>
         <span>سيولة ↑ <b dir="ltr">{n(liquidityMagnets.above?.price)}</b></span>
         <span>سيولة ↓ <b dir="ltr">{n(liquidityMagnets.below?.price)}</b></span>
       </div>
       <p title={commandWhy}>{commandText}</p>
       <small className="sniper-chart-command-caution">
         {commandConfirmed?'رصد كسر مؤهل · ليس صفقة منفذة':
         commandLocalGold?'رصد سعري M1 فقط · دون DOM أو إذن دخول':
         commandWatch?'ترقب قبل التفعيل · ليس أمر دخول':
         commandFollowing?'الحركة بدأت · متابعة فقط، ليست قنصًا مبكرًا':
         'لا توجد إشارة دخول'}
       </small>
     </details>
     {/* Compact early lead keeps its stream and callbacks alive without a second panel. */}
     <EarlyMoveAlert key={asset} asset={asset} now={now}
       marketOpen={marketOpen} onSignal={onChartLead} compact/>
   </aside>
   </div>
     <small className="sniper-chart-source-note">
       شموع M5 فعلية · {String(x?.candleSource||'المصدر غير متاح')}
     </small>
     <details className="sniper-hunt-advanced">
     <summary>المستويات والتشخيص <span aria-hidden="true">＋</span></summary>
     <SniperOrderFlowStrip data={flowObservation}/>
     {asset==='GOLD'&&visiblePreOpen?.proxy&&<small>{'قراءة '+(visiblePreOpen.proxySource||'PAXG فوري')+' وقت التوقع · '}{
       {BUY:'ضغط شراء',SELL:'ضغط بيع',NEUTRAL:'الدفتر والتنفيذ بلا اتجاه مشترك',
        UNAVAILABLE:'لا توجد عينة حديثة كافية'}[visiblePreOpen.proxy]}</small>}
   <SniperM15Summary asset={asset} ready={projected.ready}
     saved={Boolean(stable&&!projected.ready)} paused={paused} detached={detached}
     marketOpen={marketOpen} providerTransition={providerTransition}
     fresh={freshObservation} side={projected.ready?chartSide:
       currentSignalSide!=='WAIT'?currentSignalSide:safeSide}
     price={currentSignalPrice}
     trigger={currentSignalSide!=='WAIT'?trackedSetup?.trigger??null:null}
     upper={safeSide==='WAIT'&&conditionalRange.valid?conditionalRange.upper:
       showWatchGuide?watchGuide.upperTrigger:null}
     lower={safeSide==='WAIT'&&conditionalRange.valid?conditionalRange.lower:
       showWatchGuide?watchGuide.lowerTrigger:null}
     stop={projected.ready?stop:stable?.stop??(currentSignalSide!=='WAIT'?trackedSetup?.invalidation??null:null)}
     targets={projected.ready||stable?stable?.goals??[]:
       currentSignalSide!=='WAIT'?(trackedSetup?.targets??[]).map((price,i)=>({stage:i+1,price})):[]}
     nextBar={projected.ready?shownBars[0]??null:null}
     signal={currentSignalSide!=='WAIT'?currentSignalLabel:null}
     noForecastReason={!projected.ready?lifecycle:null}
     watchGuide={showWatchGuide?watchGuide:null}/>
   </details>
   
      <details className="sniper-performance-drawer">
       <div data-sniper-decision-provenance style={{padding:'4px 12px',fontSize:11,color:'#91b5c6'}}>
         {movementSignal.phase==='PREPARE'&&movementSignal.side!=='WAIT'?
           'مرشح قبل الكسر · '+(movementSignal.setupKind??'M1/M5')+
           ' · '+(actualFlowSameVenue?'تنفيذ من نفس المنصة':'تنفيذ نفس المنصة غير مثبت'):
           cueVisible&&m5Cue.stage==='M5_FOLLOWING'?
             'الحركة الحالية متابعة متأخرة؛ لا نعيد تصنيفها دخولًا مبكرًا':
             trackedSetup?.phase==='CANCELLED'?
               'الإعداد أُلغي: '+trackedSetup.reason:
               'لا توجد خطة دخول نشطة؛ تسجيل الرصد مستمر'}
       </div>
       <div style={{padding:'8px 12px',fontSize:12,color:'#b8d9e5'}}>
         انعكاس مبكر: {movementStats.reversalHits}/{movementStats.reversalScored}
         {' · '}استمرار: {movementStats.continuationHits}/{movementStats.continuationScored}
       </div>
       <summary>نتيجة قنص M5 · بداية {movementStats.openingHits}/{movementStats.openingScored} · متابعة {movementStats.followingHits}/{movementStats.followingScored} · نهاية {movementStats.closingHits}/{movementStats.closingScored} <span>＋</span></summary>
     <div className="sniper-movement-summary" role="status" style={{
       display:'flex',flexWrap:'wrap',gap:'8px 15px',padding:'9px 12px',
       fontSize:12,color:'#bad8e6',borderBottom:'1px solid #27465a'}}>
       {asset==='GOLD'&&<span>{paxgComparison}</span>}
       <span>إشارات بداية M5: <b>{movementStats.openingHits}/{movementStats.openingScored}</b></span>
       <span>إشارات نهاية M5: <b>{movementStats.closingHits}/{movementStats.closingScored}</b></span>
       <span>كسور مؤهلة مشروطًا: <b>{movementStats.qualified}</b></span>
       <span>أهداف محققة: <b>{movementStats.qualifiedHits}/{movementStats.qualifiedSettled}</b>
         {movementStats.qualifiedRate!=null?' · '+movementStats.qualifiedRate+'%':''}</span>
       <span>كسور عكس الاتجاه: <b>{movementStats.countertrend}</b></span>
       <span>إشارات قديمة غير مصنفة: <b>{movementStats.legacy}</b></span>
       <span>اتجاه الكسر في أول M5 كامل: <b>{movementStats.m5Correct}/{movementStats.m5Scored}</b>
         {movementStats.m5Rate!=null?' · '+movementStats.m5Rate+'%':''}</span>
       <span>الإنذار المبكر في أول M5 كامل: <b>{movementStats.earlyM5Correct}/{movementStats.earlyM5Scored}</b>
         {movementStats.earlyM5Rate!=null?' · '+movementStats.earlyM5Rate+'%':''}</span>
       <span>بداية موجة خلال 3 شموع M1 بعد الترصد: <b>
         {movementStats.onsetFirst}/{movementStats.onsetAudited}</b>
         {' · '}تحرك ضدها أولًا {movementStats.onsetAdverse}
         {' · '}بلا حركة {movementStats.onsetNoMove}
         {' · '}غير محسوم {movementStats.onsetUncertain}
         {' · '}معلق {movementStats.onsetPending}
         {movementStats.onsetMeanDelaySeconds!=null?
           ' · زمن الرصد حتى أول حركة محسومة '+movementStats.onsetMeanDelaySeconds+'ث':''}
       </span>
       <small>مراجعة أخطاء مبكرة من نفس المصدر: {failureAudit.total} رصد غير متداخل
          {failureAudit.groups.filter(g=>g.review).map(g=>' · '+g.pattern+' يحتاج مراجعة').join('')}</small>
        {movementStats.byPattern.length>0&&
         <div style={{flexBasis:'100%',fontSize:11,
           borderTop:'1px solid #27465a',paddingTop:7}}>
           <strong>تقييم كل نموذج قنص من وقت صدور إشاراته:</strong>
           {movementStats.byPattern.map(p=>
             <span key={p.pattern} style={{display:'inline-block',
               margin:'4px 9px 2px 0'}}>
               {({
                 PRESSURE:'ضغط',SWEEP:'سحب سيولة',COMPRESSION:'انضغاط',
                 RECLAIM:'استرداد',MICRO:'نطاق ضيق',COIL:'انكماش',
                 ZONE:'مراقبة منطقة',PULLBACK:'استئناف',PROFILE:'بروفايل',
                 STRUCTURE:'كسر هيكل'
               })[p.pattern]}: <b>{p.favorable}/{p.resolved}</b>
               {p.resolved>=30&&p.onsetRate!=null?
                 ' · '+p.onsetRate+'%':' · عينة أولية'}
               {p.observedInterval?' · نطاق تكرار أول حركة '+
                 p.observedInterval.low+'–'+p.observedInterval.high+'%':''}
               {' · '}عكس {p.adverse} · بلا حركة {p.noMove}
               {' · '}M5 {p.m5Correct}/{p.m5Scored}
             </span>)}
           <small style={{display:'block',opacity:.72}}>
             الأعداد تخص أول حركة بعد الإنذار خلال 3 دقائق، وليست أرباحًا.
             النطاق الإحصائي يظهر بعد 30 نتيجة واضحة على الأقل، ولا يُستخدم
             لضبط الأوزان تلقائيًا أو لتوقع ربح صفقة.
           </small>
         </div>}
       <small style={{flexBasis:'100%',opacity:.75}}>النتائج من شموع مغلقة بعد الرصد،
         ولا أرباح صفقات. M5 يُقاس بعد أول شمعة كاملة تبدأ عقب الرصد؛
         ولا يُعاد تصنيف السجل القديم.</small>
     </div>
     <SniperOpportunityHistory key={asset} records={movementRecords} asset={asset}/>
     <SniperStructureRSI structure={structure}/>
     </details>
     {(scaleLevels.some(level=>level.kind!=='PRICE')||
        showLiquidity&&positionedLiquidityLabels.length>0)&&
       <details className="sniper-m15-levels-below" aria-label="دليل المستويات أسفل الرسم">
         <summary>مستويات أخرى · تفاصيل اختيارية</summary>
         <div className="sniper-m15-level-key">
           {scaleLevels.filter(level=>level.kind!=='PRICE').slice(0,4).map(level=>
             <span className={'sniper-m15-level-chip '+(level.kind==='STOP'?'is-stop':
               level.kind==='ILLUSTRATION'?'is-illustration':'is-target')}
               key={'chip-'+level.key}>
               <small>{labelBy(level.key)}</small>
               <b dir="ltr">{n(level.price)}</b>
             </span>)}
           {showLiquidity&&positionedLiquidityLabels.map(z=>
             <span className="sniper-m15-level-chip is-zone"
               key={'chip-'+z.key} style={{borderInlineStartColor:z.color}}>
               <small>{z.label}</small>
               <b dir="ltr">{n(z.price)}</b>
             </span>)}
         </div>
       </details>}
     {showLiquidity&&showExtra&&<div className="sniper-m15-watch-strip"
       aria-label="مستويات السيولة والأهداف الهيكلية للمراقبة" role="status">
       {watchMap.ready?<>
         <span>↑ سيولة القمم:
           <b dir="ltr">{watchMap.upper.slice(0,3).filter(t=>
             price!=null&&t.price>price).map(t=>n(t.price)).join(' · ')||'لا مستوى أعلى مرصود'}</b>
         </span>
         <span>↓ سيولة القيعان:
           <b dir="ltr">{watchMap.lower.slice(0,3).filter(t=>
             price!=null&&t.price<price).map(t=>n(t.price)).join(' · ')||'لا مستوى أدنى مرصود'}</b>
         </span>
         <small>مراقبة فقط · قمم وقيعان M15/H1 المغلقة · ليست TP مضمونًا</small>
       </>:<small>{watchMap.reason} · لا أهداف افتراضية</small>}
     </div>}
     </div>
     
   </div>
   {/* Keep diagnostics short. All actionable context is already beside
         the true M5 candles, with earlier BUY/SELL records on the SVG. */}
    <details className="sniper-m15-diagnostics">
      <summary>تفاصيل إضافية</summary>
      <div className="sniper-diagnostic-mini">
        <span>M1: <b>{nextM1.ready?nextM1.side:'WAIT'}</b></span>
        <span>M15: <b>{entryTrend}</b></span>
        <span>التدفق: <b>{actualFlowSameVenue?'عينة موثقة':'غير مؤكد'}</b></span>
        <span>السيولة: <b>{liquidityMagnets.above||liquidityMagnets.below?
          'قمم وقيعان مرصودة':'لا مستوى حاسم'}</b></span>
        <small title={commandWhy}>{commandText} · قراءة فنية، ليست صفقة منفذة</small>
      </div>
    </details>
    {/* Preserve existing server-recorded GOLD/BTC early feeds, but keep them
        off the visible page. These update the SAME on-chart evidence. */}
    <div className="sniper-background-feeds" hidden aria-hidden="true">
      {asset==='GOLD'&&<GoldRadarBadge now={now}
        marketFresh={Boolean(m.sniper.view.priceFresh&&marketOpen&&
          !providerTransition)} watch={watchMap}
        onPreparationView={onGoldPreparationView}
        onScalpEarlyView={onGoldScalpEarly}/>}
      {asset==='BTC'&&<OrderFlowRadar key={asset} asset={asset}
        onView={onRadarView} compact/>}
    </div>
    {/* Performance records continue to be tracked, out of the trading chart. */}
 </section>;
}
