'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import SniperM15Summary from './SniperM15Summary';
import {buildM15HuntPreview} from '../lib/sniper-m15-hunt-preview';
import {assessM1DirectionalPriority} from '../lib/sniper-m1-priority';
import SniperLiquidityDecisionMap from './SniperLiquidityDecisionMap';
import {analyzeM15MarketStructure} from '../lib/sniper-market-structure';
import SniperMarketStructureOverlay,{SniperStructureRSI} from './SniperMarketStructureOverlay';
import SniperHuntHUD from './SniperHuntHUD';
import SniperM1CandleTape from './SniperM1CandleTape';
import {SniperLiquidityColumn,SniperScenarioColumn,SniperNextCandleCard} from './SniperHunterSidebars';
import SniperM1CandleHunter from './SniperM1CandleHunter';
import {buildM15WatchGuide} from '../lib/sniper-m15-watch-guide';
import OrderFlowRadar from './OrderFlowRadar';
import GoldRadarBadge from './GoldRadarBadge';
import type {RadarView} from '../lib/order-flow-radar';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {assessChartObservation} from '../lib/chart-observation-radar';
import {buildDistantMovementOutlook} from '../lib/sniper-movement-outlook';
import {buildM15Scenario,closedM15Bars,sampledLiveM15,observeM15Tick} from '../lib/sniper-m15-scenario';
import {mt5M15Viewport} from '../lib/sniper-m15-mt5-viewport';
import {assessM15FrozenChartAlignment} from '../lib/sniper-m15-visual-alignment';
import type {ObservedM15} from '../lib/sniper-m15-scenario';
import type {M15Scenario,M15Side} from '../lib/sniper-m15-scenario';
import {frozenM15Decision,retainM15Snapshot} from '../lib/sniper-m15-freeze';
import {sniperPhaseBadge} from '../lib/sniper-market-phase';
import {observedM15Bias,m15ObservationSide} from '../lib/sniper-m15-bias';
import {verifiedM15Archive} from '../lib/sniper-m15-archive-store';
import {m15WalkForward,firstM15Evidence} from '../lib/sniper-m15-walkforward';
import {goldMarketSession} from '../lib/gold-market-session';
import {buildChartOverlay} from '../lib/chart-trading-overlay';
import {detectPreMovePressure} from '../lib/pre-move-pressure';
import {assessSniperLiveOpportunity} from '../lib/sniper-live-opportunity';
import {advanceMovementProof,movementProofScore,safeMovementProof,type MovementProof} from '../lib/sniper-movement-proof';
import {buildSniperM15Liquidity,compactM15ZoneAnnotations} from '../lib/sniper-m15-liquidity';
import {buildM15LiquidityBoard} from '../lib/sniper-m15-liquidity-board';
import {assessM15ScenarioIssuance} from '../lib/sniper-m15-evidence-issuance';
import {buildM15WatchPriceMap} from '../lib/sniper-m15-watch-prices';
import {buildConditionalMovementRoute,type ConditionalMovementRoute} from '../lib/sniper-m15-smart-route';
import {closedM1ChartBars} from '../lib/sniper-mt5-m1';
import {buildM15ReactionMap} from '../lib/sniper-m15-reactions';
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
 const [chartMode,setChartMode]=useState<'M1'|'M15'>('M15');
 const [showExtra,setShowExtra]=useState(false);
 const [focusView,setFocusView]=useState(true);
 const [liveRadar,setLiveRadar]=useState<RadarView|null>(null);
 const onRadarView=useCallback((v:RadarView|null)=>setLiveRadar(v),[]);
 const asset=assetView==='ALL'?chosen:assetView;
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
 const liveQuote=asset==='GOLD'?goldLive:btcLive;
 const [observedM15,setObservedM15]=useState<ObservedM15|null>(null);
 // Use same-venue observed ticks to update the live M15 OHLC between M1 closes.
 useEffect(()=>{
   setObservedM15(prev=>observeM15Tick(prev,{
     now,at:Number(liveQuote?.sourceTime),price:Number(liveQuote?.price),
     source:String(liveQuote?.source||''),
     historySource:String(x?.candleSource||'')
   }));
 },[asset,now,liveQuote?.sourceTime,liveQuote?.price,liveQuote?.source,x?.candleSource]);
 const marketOpen=asset==='BTC'||goldMarketSession(now).open;
 const providerTransition=asset==='BTC'&&Boolean(x?.providerTransition);
 // The independent closed M1 chart continues to certify source/time and
 // qualified plan history; this new display never turns a watch into an order.
 const m=useMemo(()=>buildForecastIllustration(asset,x,liveQuote,now,snapshotAt,
   null,true,null,null,observationAt),
   [asset,x,liveQuote,now,snapshotAt,observationAt]);
 const actual=useMemo(()=>closedM15Bars(x?.chartHigherFrames?.m15,now,320),
   [x?.chartHigherFrames?.m15,now]);
 // A source-backed analysis lane remains drawable even when ML/Neural trade
 // qualification is unavailable. It NEVER creates broker-ready signals.
 const sourceGuide=useMemo(()=>buildM15WatchGuide(actual,now),[actual,now]);
 const watchGuide=(providerTransition||!marketOpen)&&sourceGuide.ready?
   {...sourceGuide,referenceOnly:true}:sourceGuide;
 const huntPreview=useMemo(()=>buildM15HuntPreview(actual,watchGuide,now),
   [actual,watchGuide,Math.floor(now/900000)]);
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
 const historyFresh=actual.length>=24&&
   actual.slice(-24).every((b,i,a)=>i===0||b.time-a[i-1].time===900000)&&
   now-(actual.at(-1)!.time+900000)<=36*60000;
 const radar=assessChartObservation({now,priceFresh:m.sniper.view.priceFresh,
   historyFresh:m.historyFresh,marketOpen,m1:m.candles,m5:x?.chartHigherFrames?.m5});
 const m15Bias=useMemo(()=>observedM15Bias(actual),[actual]);
 // Display M15 analysis independently of M1 trade-entry qualification.
 const preMove=useMemo(()=>detectPreMovePressure({
   asset,c1:m.candles,c5:Array.isArray(x?.chartHigherFrames?.m5)?
     x.chartHigherFrames.m5:[],now
 }),[asset,m.candles,x?.chartHigherFrames?.m5,now]);
 const observedSide=m15Bias.side;
 const side: 'BUY'|'SELL'|'WAIT' = m15ObservationSide(observedSide,m.bias);
 const safeSide=providerTransition||!marketOpen||!historyFresh||
   !m.sniper.view.priceFresh?'WAIT':side;
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
 const forming=sampledLiveM15(m.candles,now,observedM15,String(x?.candleSource||''));
 // Live M15 combines closed M1 OHLC with actual same-venue sampled ticks.
 const lastClosedM1=m.candles.at(-1);
 const m1Recent=Boolean(lastClosedM1&&Number.isFinite(lastClosedM1.time)&&
   now-lastClosedM1.time-60000>=0&&now-lastClosedM1.time-60000<125000);
 const tickRecent=Boolean(observedM15&&observedM15.time===
   Math.floor(now/900000)*900000&&now-observedM15.lastAt<=10000);
 // Show observed live partial M15 independently of gaps in older M15 bars.
 // Forecast issuance and trade eligibility still require verified history.
 const formingVisible=Boolean(forming&&!providerTransition&&
   marketOpen&&forming.time===Math.floor(now/900000)*900000&&
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
 // Draw the nearest 18 authentic M15 candles by default. Older, real
 // candles remain available via the context toggle; neither mode edits OHLC.
 const trueHistory=focusView?recent.slice(-18):recent;
 const price=m.price;
 const pools=useMemo(()=>buildChartOverlay({
   now,price:m.price,historyFresh:m.historyFresh,
   priceFresh:m.sniper.view.priceFresh&&!providerTransition&&marketOpen,
   fourHour:m.fourHour,m5:x?.chartHigherFrames?.m5,
   accumulation:x?.accumulation,targets:[]
 }),[now,m.price,m.historyFresh,m.sniper.view.priceFresh,providerTransition,
    marketOpen,m.fourHour,x?.chartHigherFrames?.m5,x?.accumulation]);
 const liquidity=useMemo(()=>buildSniperM15Liquidity({
   now,price,history:actual,sourceReady:historyFresh&&
      m.sniper.view.priceFresh&&!providerTransition&&marketOpen,
   fourHour:m.fourHour,pools
 }),[now,price,actual,historyFresh,m.sniper.view.priceFresh,
    providerTransition,marketOpen,m.fourHour,pools]);
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
   sourceReady:historyFresh&&m.sniper.view.priceFresh&&marketOpen&&
     !providerTransition,
   m15:actual,h1:x?.chartHigherFrames?.h1
 }),[now,price,actual,x?.chartHigherFrames?.h1,historyFresh,
   m.sniper.view.priceFresh,marketOpen,providerTransition]);
 const zoneBoard=useMemo(()=>buildM15LiquidityBoard({
   liquidity,watch:watchMap,history:actual,price,now
 }),[liquidity,watchMap,actual,price,now]);
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
   c1:m.candles,c5:x?.chartHigherFrames?.m5,preMove,watch:watchMap
 }),[now,price,marketOpen,m.sniper.view.priceFresh,m.historyFresh,
   providerTransition,m.candles,x?.chartHigherFrames?.m5,preMove,watchMap]);
 // Never derive BUY/SELL from the colour of an unfinished candle. The live
 // candle is display-only; direction comes from closed-bar PREMOVE or M1 proof.
 const formingBias: 'BUY'|'SELL'|'WAIT'='WAIT';
 const currentSignalSide=liveOpportunity.phase==='BREAK_CONFIRMED'||
   liveOpportunity.phase==='PREPARE'||liveOpportunity.phase==='TESTING'?
     liveOpportunity.side:'WAIT';
 const currentSignalLabel=liveOpportunity.phase==='BREAK_CONFIRMED'?
   (liveOpportunity.side==='BUY'?'شراء مؤكد بإغلاق M1':
    liveOpportunity.side==='SELL'?'بيع مؤكد بإغلاق M1':'انتظار'):
   liveOpportunity.phase==='PREPARE'?
    (liveOpportunity.side==='BUY'?'ترقب شراء قبل الكسر':'ترقب بيع قبل الكسر'):
   liveOpportunity.phase==='TESTING'?
    (liveOpportunity.side==='BUY'?'اختبار كسر صاعد':'اختبار كسر هابط'):
   liveOpportunity.phase==='CANCELLED'?'الكسر ملغي':
   liveOpportunity.phase==='OFFLINE'?'البيانات غير جاهزة':
   preMoveReady?'ضغط مبكر '+(preMove.side==='BUY'?'صاعد':'هابط')+' من شموع مغلقة':
   'انتظار قراءة مسبقة من M1/M5';
 const currentSignalPrice=formingVisible&&forming?forming.close:price;
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
     JSON.stringify(movementRecords.slice(-300)));}catch{}
 },[movementRecords,movementProofLoaded]);
 useEffect(()=>{
   if(!movementProofLoaded)return;
   setMovementRecords(prior=>advanceMovementProof({
     prior,now,asset,source:String(x?.candleSource||''),
     price,signal:liveOpportunity,bars:m.candles
   }));
 },[movementProofLoaded,now,asset,x?.candleSource,price,
   liveOpportunity,m.candles]);
 const movementStats=useMemo(()=>movementProofScore(movementRecords,asset),
   [movementRecords,asset]);
 const issuance=assessM15ScenarioIssuance({
   side:safeSide,qualified,radarStatus:radar.status,radarSide:radar.side,
   m15Side:m15Bias.side,m15Votes:m15Bias.votes,
   structuralActive:m.bias.active,structuralSide:m.bias.side,
   structuralAgreement:m.bias.agreement,fresh:freshObservation,
   goals:proposedGoals.length,stop:scenarioStop,anchor
 });
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
 // Keep the frozen route visually stable between CLOSED M15 candles.
 // Live ticks may update the real candle, but must not make the forecast pane
 // blink in/out as price briefly crosses the alignment threshold.
 const comparisonStep=stable&&forming?
   Math.max(0,Math.round((forming.time-stable.anchorTime)/900000)):0;
 const visualAlignment=stable&&validLive&&forming?
   assessM15FrozenChartAlignment({
     original:stable.scenario.bars,historical:actual,live:actual.at(-1)?.close??forming.close,
     atr:stable.scenario.atr,elapsedSteps:comparisonStep
   }):null;
 const detached=visualAlignment?.reason==='MOVED_AWAY';
 const lifecycle=paused?'السيناريو محفوظ · البيانات متأخرة':
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
 const elapsedSteps=aligned&&forming?
   Math.max(0,Math.round((forming.time-aligned.anchorTime)/900000)):0;
 // Keep the immutable twelve-candle hypothesis for scored historical audit,
 // not for drawing hypothetical OHLC in the live chart.
 const shownBars=aligned?.scenario.bars.slice(elapsedSteps,12)??[];
 const goals: {stage:number;price:number}[]=[];
 const visualGoals=aligned?.scenario.ready&&!aligned.scenario.stopped?
   aligned.goals:[];
 const stop=aligned?.stop??null;
 const projected=aligned?.scenario??noScenario;
 const showWatchGuide=!projected.ready&&watchGuide.ready;
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
 const phase=sniperPhaseBadge({ready:liquidity.ready,
   contextKind:liquidity.context?.kind,phase:liquidity.phase,side:chartSide});
 const W=430,H=704,left=8,split=215,end=422,
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
   ...visibleZones.flatMap(z=>[z.low,z.high]),
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
 const viewport=mt5M15Viewport({mode:focusView?'FOCUS':'ALL',allLow:min,allHigh:max,
   lastPrice:chartReference,history:trueHistory,
   // Simulated routes must never alter the price scale of real candles.
   forecast:[],
   atr:projected.atr??watchGuide.atr});
 const {lo,hi}=viewport;
 const py=(p:number)=>plotTop+(hi-p)/(hi-lo)*(plotBottom-plotTop);
 const mapReady=Boolean(watchMap.ready&&freshObservation&&marketOpen&&!providerTransition);
 const mapM1Side=marketOpen&&nextM1.ready?nextM1.side:'WAIT';
 // Only a COMPLETED M1 close anchors the route; quote ticks never re-anchor it.
 const routeClosedM1=closedM1ChartBars(m.candles,now,72).at(-1);
 const routeAnchor=nextM1.anchorTime!=null&&
   routeClosedM1?.time===nextM1.anchorTime?routeClosedM1.close:null;
 const routeScope=asset+'|'+String(x?.candleSource||'');
 const routeKey=routeScope+'|'+String(nextM1.anchorTime??'NONE');
 const candidateRoute=buildConditionalMovementRoute({
   now,source:String(x?.candleSource||''),sourceReady:mapReady,
   anchor:routeAnchor,issuedAt:nextM1.anchorTime==null?null:
     nextM1.anchorTime+60000,
   m1Ready:nextM1.ready,m1Side:mapM1Side,m15Side:safeSide,
   preMoveReady,preMoveSide:preMove.side,watch:watchMap,
   trigger:preMoveReady?preMove.trigger:null,
   invalidation:preMoveReady?preMove.invalidation:null
 });
 // Freeze one first-issued hypothesis per real M1 closure. Any same-minute
 // market updates can invalidate it, but cannot rewrite its anchor or targets.
 const [heldMovementRoute,setHeldMovementRoute]=useState<{
   key:string;route:ConditionalMovementRoute|null}|null>(null);
 useEffect(()=>{
   if(!mapReady||!nextM1.ready||nextM1.anchorTime==null){
     setHeldMovementRoute(null);return;
   }
   setHeldMovementRoute(old=>old?.key===routeKey?old:{
     key:routeKey,route:candidateRoute.ready?candidateRoute:null
   });
 },[mapReady,nextM1.ready,nextM1.anchorTime,routeKey,candidateRoute]);
 const activeMovementRoute=mapReady&&heldMovementRoute?.key===routeKey?
   heldMovementRoute.route:null;
 // Append-only local proposals, not evidence of an executed or profitable trade.
 useEffect(()=>{
   if(!activeMovementRoute)return;
   try{
     const storageKey='qannas-v3-price-path-history-'+asset;
     const saved=JSON.parse(window.localStorage.getItem(storageKey)||'[]');
     const rows=Array.isArray(saved)?saved.filter(v=>v&&typeof v.key==='string'):[];
     if(rows.some(v=>v.key===activeMovementRoute.key))return;
     window.localStorage.setItem(storageKey,JSON.stringify(
       [...rows,activeMovementRoute].slice(-80)));
   }catch{/* Storage restrictions must not disable the live visual. */}
 },[asset,activeMovementRoute]);
 const mapDirection=activeMovementRoute?.side??(mapReady?
   mapM1Side!=='WAIT'?mapM1Side:
   preMoveReady?preMove.side:safeSide:'WAIT');
 const scaleLevels=[
   ...goals.map(g=>({key:'TP'+g.stage,price:g.price,kind:'TARGET'})),
   ...visualGoals.map(g=>({key:'هدف مشروط '+g.stage,price:g.price,kind:'ILLUSTRATION'})),
   
   ...(stop!=null?[{key:'SL',price:stop,kind:'STOP'}]:[]),
   ...(price!=null?[{key:'LIVE',price,kind:'PRICE'}]:[])
 ];
 const actualStride=(split-left-5)/Math.max(trueHistory.length,1);
 const timeX=(time:number)=>left+
   clamp((time-(trueHistory[0]?.time??time))/900000,0,trueHistory.length)*actualStride;
 const liquidityColor=(kind:string)=>
   kind==='DEMAND'||kind==='LOW_POOL'||kind==='REBOUND_UP'?
   '#41cfab':'#ff7b90';
 // Real OHLC stays fixed; the level map has no generated future bodies.
 const realCandleWidth=clamp(actualStride*.68,2.2,5.2);
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
   future:boolean,key:string)=> {
   const up=close>=open,color=up?'#39d6cc':'#fa5970';
   const top=Math.min(py(open),py(close)),height=Math.max(1,Math.abs(py(open)-py(close)));
   return <g key={key} className={future?'sniper-m15-projected':'sniper-m15-real'}>
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
 const latestClosed=actual.at(-1);
 // Confirmed M15 pivot-break markers: only closed candles, never a live guess.
 // Historical BUY/SELL markers are deliberately not drawn on the ordinary
 // price chart. Direction belongs to the scenario pane and the live candle.
 return <section className="sniper-m15-panel" dir="rtl"
   aria-label="القناص: شموع M15 حقيقية وخريطة أسعار السيولة من M15 وH1">
   <header className="sniper-m15-head">
     {assetView==='ALL'?<div className="sniper-m15-assets" role="group" aria-label="الأصل">
       <button type="button" onClick={()=>setChosen('GOLD')} aria-pressed={asset==='GOLD'}>XAUUSD</button>
       <button type="button" onClick={()=>setChosen('BTC')} aria-pressed={asset==='BTC'}>BTCUSD</button>
     </div>:<b>{asset==='GOLD'?'XAUUSD':'BTCUSD'}</b>}
     <b className="sniper-m15-frame">{chartMode}</b>
     {chartMode==='M15'&&<button type="button" className="sniper-m15-liquidity-toggle"
       aria-pressed={showLiquidity} onClick={()=>setShowLiquidity(v=>!v)}
       title="مناطق سيولة القمم والقيعان، الطلب والعرض والارتداد أو الرفض بعد إغلاق M15">
       {showLiquidity?'المناطق ✓':'المناطق'}</button>}
   </header>
   <nav className="sniper-candle-mode" aria-label="اختيار سرعة القنص">
     <button type="button" aria-pressed={chartMode==='M1'}
       onClick={()=>setChartMode('M1')}>M1 · قنص كل شمعة</button>
     <button type="button" aria-pressed={chartMode==='M15'}
       onClick={()=>setChartMode('M15')}>M15 · خريطة السيولة</button>
   </nav>
   {chartMode==='M1'?<SniperM1CandleHunter asset={asset}
     history={m.candles} historicalSource={String(x?.candleSource||'')}
     quote={liveQuote} now={now} marketOpen={marketOpen}
     sourceReady={m.historyFresh&&m.sniper.view.priceFresh}
     providerTransition={providerTransition}/>:<>
   <SniperHuntHUD hunt={huntPreview} m1={nextM1}
      price={currentSignalPrice??null} marketOpen={marketOpen}
      qualified={projected.ready} qualifiedSide={chartSide}/>
   <details className="sniper-hunt-advanced">
     <summary>المستويات والتشخيص <span aria-hidden="true">＋</span></summary>
   <SniperM15Summary asset={asset} ready={projected.ready}
     saved={Boolean(stable&&!projected.ready)} paused={paused} detached={detached}
     marketOpen={marketOpen} providerTransition={providerTransition}
     fresh={freshObservation} side={projected.ready?chartSide:
       currentSignalSide!=='WAIT'?currentSignalSide:safeSide}
     price={currentSignalPrice}
     trigger={currentSignalSide!=='WAIT'?liveOpportunity.trigger:null}
     upper={safeSide==='WAIT'&&conditionalRange.valid?conditionalRange.upper:
       showWatchGuide?watchGuide.upperTrigger:null}
     lower={safeSide==='WAIT'&&conditionalRange.valid?conditionalRange.lower:
       showWatchGuide?watchGuide.lowerTrigger:null}
     stop={projected.ready?stop:stable?.stop??(currentSignalSide!=='WAIT'?liveOpportunity.invalidation:null)}
     targets={projected.ready||stable?stable?.goals??[]:
       currentSignalSide!=='WAIT'?liveOpportunity.targets.map((price,i)=>({stage:i+1,price})):[]}
      nextBar={null}
     signal={currentSignalSide!=='WAIT'?currentSignalLabel:null}
     noForecastReason={!projected.ready?lifecycle:null}
     watchGuide={showWatchGuide?watchGuide:null}/>
   </details>
   <div className="sniper-hunter-workbench">
     <SniperLiquidityColumn history={actual.slice(-48)}
       price={price??null} preview={huntPreview} liquidityOn={showLiquidity}
       structure={structure}/>
     <div className="sniper-hunter-center">
   <div className="sniper-m15-view-controls" aria-label="عرض سيناريو القناص">
     <button type="button" className="sniper-m15-focus-toggle"
       aria-pressed={focusView} onClick={()=>setFocusView(v=>!v)}
       title="تكبير الشموع الحقيقية ومناطق السيولة دون رسم شموع مستقبلية">
       {focusView?'سياق كامل':'تكبير الحركة القريبة'}</button>
     <button type="button" className="sniper-m15-extra-toggle"
       aria-pressed={showExtra} onClick={()=>setShowExtra(v=>!v)}
       title="عرض أو إخفاء التفاصيل الفنية الثانوية">
       {showExtra?'إخفاء علامات الرسم':'علامات الرسم'}</button>
   </div>
   <div className="sniper-m15-compact-status" role="status">
     <span>شموع M15 حقيقية · رادار حركة السيولة V4
       {focusView?' · آخر 18 شمعة':' · كل التاريخ'}</span>
     <b dir="ltr">{formingVisible&&forming?'LIVE '+n(forming.close):
       latestClosed?'CLOSE '+n(latestClosed.close):'—'}</b>
   </div>
   <div className="sniper-m15-chart-box" id="sniper-performance"
     data-clean={!showExtra}>
     <svg viewBox={'0 0 '+W+' '+H} role="img"
       aria-label="شموع M15 الحقيقية يسارًا وخريطة سيولة تاريخية من M15 وH1 يمينًا؛ لا شموع مستقبلية."
       preserveAspectRatio="none">
       <defs>
         <clipPath id={'sniper-m15-clip-'+asset}>
           <rect x={left} y={plotTop} width={end-left} height={plotBottom-plotTop}/>
         </clipPath>
       </defs>
       <rect width={W} height={H} fill="#000"/>
       {grid.map((v,i)=><line key={'grid'+i}
         x1={left} x2={end} y1={py(v)} y2={py(v)}
         stroke="#1a2933" strokeDasharray="3 7" strokeWidth=".55"/>)}
       {Array.from({length:8},(_,i)=><line key={'vx'+i} x1={left+i*(end-left)/7}
         x2={left+i*(end-left)/7} y1={plotTop} y2={plotBottom}
         stroke="#1d2b3a" strokeDasharray="3 6" strokeWidth=".8"/>)}
       <g clipPath={'url(#sniper-m15-clip-'+asset+')'}>
         {/* Only four authentic OHLC liquidity levels; colors match source areas. */}
         {showLiquidity&&liquidityLabels.map(z=><g key={'liquidity-band-'+z.key}
           className="sniper-m15-liquidity-line">
           <rect x={left} y={py(z.high!)} width={end-left}
             height={Math.max(1,py(z.low!)-py(z.high!))}
             fill={z.color} fillOpacity=".045"/>
           <line x1={left} x2={end} y1={py(z.price)} y2={py(z.price)}
             stroke={z.color} strokeWidth="1.5" strokeOpacity=".9"/>
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
               height={Math.max(2,bottom-top)} fill={color} fillOpacity=".13"
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
         {showLiquidity&&<SniperMarketStructureOverlay structure={structure}
           left={left} split={split} top={plotTop} bottom={plotBottom}
           py={py} timeX={timeX} visibleFrom={trueHistory[0]?.time}/>}
         {trueHistory.map((b,i)=>candle(b.open,b.high,b.low,b.close,
           left+(i+.5)*actualStride,realCandleWidth,false,'real'+b.time))}
         {/* The next-M1 watch is fixed by prior CLOSED minute candles,
              not guessed from the color of this unfinished candle. */}
         {formingVisible&&forming&&marketOpen&&nextM1.ready&&
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

         <SniperLiquidityDecisionMap watch={watchMap} ready={mapReady}
           direction={mapDirection} m1Side={mapM1Side} m15Side={safeSide}
           route={activeMovementRoute} instanceId={asset}
           price={formingVisible&&forming?forming.close:price}
           trigger={mapReady&&preMoveReady?preMove.trigger:null}
           invalidation={mapReady&&preMoveReady?preMove.invalidation:null}
           split={split} end={end} top={plotTop} bottom={plotBottom}
           lo={lo} hi={hi} py={py}/>
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
         {showLiquidity&&liquidity.context&&(()=>{
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
             split-4,Math.max(3.6,realCandleWidth*1.6),false,
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
           <title>{'شمعة M15 جارية وليست مغلقة: '+n(forming.close)+
             ' · شموع M1 '+forming.minutes+
              ' · عينات تيك '+forming.sampledTicks+
              (forming.minutes===0?' · رصد تيك جزئي، ليس شمعة مكتملة':'')}</title>
         </g>}
       </g>
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
       <text x={left+3} y={17} fill="#ccd8e6" fontSize="10" direction="ltr" textAnchor="start">M15 · REAL</text>
       <text x={split+5} y={17} fill="#9fc4d3" fontSize="10" textAnchor="start" direction="ltr">M15 · LIQUIDITY RADAR · V4</text>
       {showExtra&&<text className="sniper-m15-extra-caption" x={split+5} y={plotTop+18} fill="#a5a9ad" fontSize="8.4"
         textAnchor="start" direction="rtl">قنص الحركة · مسارات مراقبة مشروطة بمستويات مرصودة</text>}
       {latestClosed&&<text x={left+2} y={H-17} fill="#93a4b3" fontSize="11"
         textAnchor="start" direction="ltr">{h(trueHistory[0]?.time??latestClosed.time)}</text>}
       {latestClosed&&<text x={split} y={H-17} fill="#bacbd7" fontSize="11" textAnchor="middle" direction="ltr">{h(formingVisible&&forming?forming.time:latestClosed.time)}</text>}
       <text x={end-2} y={H-17} fill="#aebdc8" fontSize="11" textAnchor="end" direction="ltr">
         {mapReady?'M15/H1 LEVELS':'WAIT'}</text>
     </svg>
   </div>
     <SniperStructureRSI structure={structure}/>
     {(scaleLevels.some(level=>level.kind!=='PRICE')||
        showLiquidity&&positionedLiquidityLabels.length>0)&&
       <div className="sniper-m15-levels-below" aria-label="دليل المستويات أسفل الرسم">
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
       </div>}
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
     <SniperScenarioColumn watch={watchMap} priority={nextM1}
       price={price??null} marketOpen={marketOpen}
       structure={structure}/>
   </div>
   <div className="sniper-hunter-bottom">
     <SniperM1CandleTape history={m.candles} now={now}/>
     <SniperNextCandleCard priority={nextM1} marketOpen={marketOpen}/>
   </div>
   </>}
   <details className="sniper-m15-diagnostics">
     <summary>تفاصيل إضافية: الرادار والاختبارات والسيولة</summary>
     <div className="sniper-m15-diagnostics-content">
     <span className={'sniper-m15-phase '+(phase.confirmed?'confirmed':'neutral')}
       title={(liquidity.ready?liquidity.reason:'لا توجد قراءة محدثة')+
         ' · تقييم زمني M15: '+walkForward.correct+'/'+walkForward.selected+
         ' من '+walkForward.evaluated+' نتيجة مرصودة، دون إثبات أفضلية'}>
       {'السيولة: '+phase.label}</span>
     <span className={'sniper-m15-bias '+(chartSide==='BUY'?'rise':chartSide==='SELL'?'fall':'hold')}>
       {direction}</span>
   <div className={'sniper-m15-lifecycle'+(paused?' paused':'')} role="status">
     <span>{lifecycle}</span>
   </div>
   <div className={'sniper-live-opportunity phase-'+liveOpportunity.phase.toLowerCase()}
      role="status" aria-label="رصد الحركة اللحظية مستقل عن صفقة التداول">
     <div className="sniper-live-opportunity-head">
       <strong>رادار حركة M1/M5</strong>
       <b>{liveOpportunity.phase==='BREAK_CONFIRMED'?'كسر M1 مرصود':
         liveOpportunity.phase==='PREPARE'?'تحضير مبكر':
         liveOpportunity.phase==='TESTING'?'اختبار كسر':
         liveOpportunity.phase==='CANCELLED'?'فشل الكسر':
         liveOpportunity.phase==='OFFLINE'?'المصدر غير جاهز':'مراقبة'}</b>
     </div>
     {(liveOpportunity.side==='BUY'||liveOpportunity.side==='SELL')&&
       <div className="sniper-live-opportunity-levels">
         <span>{liveOpportunity.side==='BUY'?'↗ صعود':'↘ هبوط'}</span>
         <span>تفعيل <b dir="ltr">{n(liveOpportunity.trigger)}</b></span>
         <span>إبطال <b dir="ltr">{n(liveOpportunity.invalidation)}</b></span>
         <span>أهداف أمام السعر <b dir="ltr">
           {liveOpportunity.targets.map(t=>n(t)).join(' / ')||'—'}</b></span>
       </div>}
     <small>{liveOpportunity.reason}
       {liveOpportunity.side!=='WAIT'?' · '+liveOpportunity.targetNote:''}
       {liveOpportunity.higherFrame==='OPPOSED'?' · M5 يعارض الكسر':''}
       {' · رصد وليست إشارة تنفيذ'}</small>
   </div>
    <div className="sniper-movement-metrics" aria-label="نتائج رادار الحركة المقاسة من شموع لاحقة">
     <span>إنذارات <b>{movementStats.alerts}</b></span>
     <span>تحضير مبكر <b>{movementStats.early}</b></span>
     <span>كسور M1 <b>{movementStats.breaks}</b></span>
     <span>تأخر اكتشاف الكسر <b>{movementStats.averageLagSeconds==null?'—':
       movementStats.averageLagSeconds+'ث'}</b></span>
     <span>إنذار سبق الكسر <b>{movementStats.earlyLeads}/{movementStats.breaks}
       {movementStats.averageLeadSeconds!=null?' · '+movementStats.averageLeadSeconds+'ث':''}</b></span>
     <span>وصول T1 <b>{movementStats.hits}/{movementStats.settled}
       {movementStats.targetRate!=null?' ('+movementStats.targetRate+'%)':''}</b></span>
     <small>قياس محلي عند فتح الصفحة ومن شموع M1 أُغلقت بعد إصدار الإنذار ·
       {movementStats.pending?' '+movementStats.pending+' نتيجة معلقة ·':''}
       {movementStats.missingTarget?' '+movementStats.missingTarget+' بلا هدف ·':''}
       {movementStats.unscored?' '+movementStats.unscored+' غير محسومة ·':''}
       {movementStats.statisticallyThin?' عينة غير كافية ·':''}
       لا يشمل الحالات الملتبسة أو بلا هدف في نسبة النجاح</small>
   </div>
   {/* Radar details expand outside the M15 OHLC canvas instead of hiding candles. */}
   {asset==='GOLD'&&<GoldRadarBadge now={now}
        marketFresh={Boolean(m.sniper.view.priceFresh&&marketOpen&&
          !providerTransition)} watch={watchMap}/>}
   {asset==='BTC'&&<div className="sniper-m15-preparation-slot">
     <OrderFlowRadar key={asset} asset={asset} onView={onRadarView} compact/>
   </div>}

     </div>
   </details>
   {/* Performance records continue to be tracked, out of the trading chart. */}
 </section>;
}
