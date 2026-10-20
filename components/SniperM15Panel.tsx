'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import OrderFlowRadar from './OrderFlowRadar';
import GoldRadarBadge from './GoldRadarBadge';
import type {RadarView} from '../lib/order-flow-radar';
import {assessSniperEntryCandle} from '../lib/sniper-entry-candle';
import {assessRadarNextCandle} from '../lib/sniper-radar-next-candle';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {assessChartObservation} from '../lib/chart-observation-radar';
import {buildDistantMovementOutlook} from '../lib/sniper-movement-outlook';
import {buildM15Scenario,closedM15Bars,sampledLiveM15,observeM15Tick} from '../lib/sniper-m15-scenario';
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
import {buildSniperM15Liquidity,compactM15ZoneAnnotations} from '../lib/sniper-m15-liquidity';
import {buildM15ReactionMap,emptyReactionMap} from '../lib/sniper-m15-reactions';
import {futureM15WatchZones,conditionalM15BreakoutLevels} from '../lib/sniper-m15-future-zones';
import type {ForwardWatchZone} from '../lib/sniper-m15-future-zones';
import type {M15ReactionMap} from '../lib/sniper-m15-reactions';
import {evaluateM15ForwardProof} from '../lib/sniper-m15-forward-proof';
import {validateFrozenM15Snapshot} from '../lib/sniper-m15-snapshot';
import type {FrozenM15Snapshot} from '../lib/sniper-m15-snapshot';
import SniperPerformance from './SniperPerformance';
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
 const recent=actual.slice(-42);
 const historyFresh=actual.length>=24&&
   actual.slice(-24).every((b,i,a)=>i===0||b.time-a[i-1].time===900000)&&
   now-(actual.at(-1)!.time+900000)<=36*60000;
 const radar=assessChartObservation({now,priceFresh:m.sniper.view.priceFresh,
   historyFresh:m.historyFresh,marketOpen,m1:m.candles,m5:x?.chartHigherFrames?.m5});
 const m15Bias=useMemo(()=>observedM15Bias(actual),[actual]);
 const side: 'BUY'|'SELL'|'WAIT' =
   (m.ready||m.watchReady)&&m.displaySide!=='WAIT'?m.displaySide:
   m.observation.ready&&m.observation.side!=='WAIT'?m.observation.side:
   radar.status==='ALIGNED'?radar.side:m15ObservationSide(m15Bias.side,m.bias);
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
 const proposedGoals=targets.slice(0,3).map(t=>({stage:t.stage,price:t.price}));
 const forming=sampledLiveM15(m.candles,now,observedM15,String(x?.candleSource||''));
 // Live M15 combines closed M1 OHLC with actual same-venue sampled ticks.
 const lastClosedM1=m.candles.at(-1);
 const m1Recent=Boolean(lastClosedM1&&Number.isFinite(lastClosedM1.time)&&
   now-lastClosedM1.time-60000>=0&&now-lastClosedM1.time-60000<125000);
 const tickRecent=Boolean(observedM15&&observedM15.time===
   Math.floor(now/900000)*900000&&now-observedM15.lastAt<=10000);
 // Visible partial authentic M15 vs stricter forecast-issuance gate.
 const formingVisible=Boolean(forming&&historyFresh&&!providerTransition&&
   marketOpen&&forming.time===Math.floor(now/900000)*900000&&
   (m1Recent||tickRecent));
 const validLive=formingVisible&&m.historyFresh&&m.sniper.view.priceFresh;
 // Do not start an apparently FUTURE M15 route at the prior closed candle
 // while the current M15 candle has already moved. Anchor at the actually
 // observed same-venue PARTIAL candle; the first prediction is next FULL M15.
 const anchor=validLive&&forming?forming.close:null;
 const trueHistory=recent;
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
 const [resultsOpen,setResultsOpen]=useState(false);
 useEffect(()=>{
   const onHash=()=>{if(window.location.hash==='#sniper-performance')
      setResultsOpen(true);};
   window.addEventListener('hashchange',onHash);
   onHash();
   return ()=>window.removeEventListener('hashchange',onHash);
 },[]);
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
 const persistenceKey='qannas-m15-freeze-v2-'+asset;
 useEffect(()=>{
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
   if(restoredKey!==persistenceScope)return;
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
 const confirmedEvents=Array.isArray(m.fourHour?.events)?m.fourHour.events:[];
 const latestBos=confirmedEvents.filter((e:any)=>
   (e?.kind==='BOS_UP'||e?.kind==='BOS_DOWN')&&
   Number.isFinite(e.confirmedAt)&&e.confirmedAt<=now
 ).sort((a:any,b:any)=>a.confirmedAt-b.confirmedAt).at(-1);
 const preMove=useMemo(()=>detectPreMovePressure({
   asset,c1:m.candles,c5:Array.isArray(x?.chartHigherFrames?.m5)?
     x.chartHigherFrames.m5:[],now
 }),[asset,m.candles,x?.chartHigherFrames?.m5,now]);
 const preMoveReady=preMove.ok&&
   (preMove.stage==='BUILDING'||preMove.stage==='ARMED')&&
   preMove.side!=='WAIT';
 const evidenceNote=preMoveReady?
   'ضغط '+(preMove.side==='BUY'?'صعود':'هبوط')+
   ' قبل الكسر · اختبار '+n(preMove.trigger)+' / إبطال '+n(preMove.invalidation):
   'لا تهيئة مبكرة مؤكدة من M1/M5';
 const freshObservation=Boolean(validLive&&historyFresh&&m.sniper.view.priceFresh&&
   !providerTransition&&marketOpen);
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
   if(!freshObservation||safeSide==='WAIT'||anchor==null||
     !proposedGoals.length||lastAttempt.current===candleKey)return;
   if(preMove.ok&&preMove.stage==='ARMED'&&preMove.side!==safeSide){
     setBuildReason('ضغط M1/M5 المبكر يعارض الاتجاه؛ انتظار');
     return;
   }
   if(proposedStop!=null&&price!=null&&
      (safeSide==='BUY'?price<=proposedStop:price>=proposedStop))return;
   const scenario=buildM15Scenario({
     history:actual,
     archive:verifiedArchive.ready?verifiedArchive.rows:undefined,
     archiveYears:verifiedArchive.ready?verifiedArchive.years:0,
     now,anchor,side:safeSide,targets:proposedGoals,
     stop:proposedStop,steps:12
   });
   if(!scenario.ready){setBuildReason(scenario.reason);return;}
   setBuildReason('');
   lastAttempt.current=candleKey;
   const reactions=buildM15ReactionMap({
     scenario,liquidity,side:safeSide,anchor,now,stop:proposedStop
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
     side:safeSide,goals:proposedGoals,stop:proposedStop,scenario,reactions});
 },[asset,now,closedTime,candleKey,blockedKey,freezeDecision,frozen,
    restoredKey,persistenceScope,
    freshObservation,safeSide,anchor,forming?.time,actual,price,proposedStop,
    proposedGoals.map(g=>g.price).join('|'),latestBos?.confirmedAt,latestBos?.kind,
   verifiedArchive.ready,verifiedArchive.storedBars,liquidity,
   preMove.stage,preMove.side]);
 const stable=blockedKey!==candleKey&&
   retainM15Snapshot(freezeDecision,frozen,asset,now)&&
   frozen?.asset===asset&&frozen.source===String(x?.candleSource||'')?frozen:null;
 const paused=Boolean(stable&&freezeDecision==='PAUSE');
 const awaitingReplacement=Boolean(stable&&freezeDecision==='REBUILD');
 const lifecycle=paused?'السيناريو محفوظ · البيانات متأخرة':
   awaitingReplacement?'السيناريو السابق محفوظ · تقييم إغلاق M15':
   stable?.scenario.stopped?'محاكاة M15 لامست الإبطال عند الشمعة '+
     stable.scenario.bars.length+' · الأهداف المعروضة ليست نتائج فعلية':
   stable?'سيناريو ثابت منذ '+h(stable.createdAt)+' · لا يُعاد رسمه كل M15':
   blockedKey===candleKey?'السيناريو مُبطل · انتظار إغلاق M15':
   !marketOpen?'السوق مغلق':!freshObservation?'انتظار بيانات حديثة':
   safeSide==='WAIT'&&conditionalRange.valid?
     'توازن M15 · مراقبة إغلاق فوق '+n(conditionalRange.upper)+
       ' أو تحت '+n(conditionalRange.lower)+' · ليست إشارة دخول':
   safeSide==='WAIT'?'توازن السوق · لا اتجاه مرجح حاليًا':
   buildReason||(!proposedGoals.length?'لا توجد أهداف هيكلية صالحة حاليًا':'جارٍ تقييم سيناريو M15');
 // Structural H1/H4 pivots are only watch levels; TP prices on this M15
 // forecast rail must have an actual intersecting hypothetical wick.
 // A pinned route from a previous M15 window must never masquerade as a
 // fresh projection starting at the current live candle.
 const aligned=stable&&validLive&&forming&&
   stable.anchorTime<=forming.time&&
   forming.time<stable.anchorTime+12*900000?stable:null;
 const elapsedSteps=aligned&&forming?
   Math.max(0,Math.round((forming.time-aligned.anchorTime)/900000)):0;
 // Retain ORIGINAL forecast timestamps. On later real candles only the
 // not-yet-observed route goes right of NOW; the past is scored separately.
 const shownBars=aligned?.scenario.bars.slice(elapsedSteps,12)??[];
 const goals=aligned?.scenario.ready&&!aligned.scenario.stopped?
   aligned.goals.filter(g=>shownBars.some(b=>b.low<=g.price&&g.price<=b.high)):[];
 const stop=aligned?.stop??null;
 const projected=aligned?.scenario??noScenario;
 const reactionMap=aligned?{
   bands:aligned.reactions.bands,
   marks:aligned.reactions.marks.filter(m=>
     m.step>elapsedSteps&&m.step<=elapsedSteps+shownBars.length)
 }:emptyReactionMap();
 const savedProof=proofLedger.filter(p=>p.asset===asset&&
   p.source===String(x?.candleSource||'')&&p.anchorTime+2*900000<=now).at(-1);
 const proof=savedProof?evaluateM15ForwardProof(savedProof,actual,now):null;
 const proofLabel=proof&&proof.evaluated>0?
   'تحقق فعلي '+proof.directionMatches+'/'+proof.evaluated+
      ' · خطأ '+n(proof.meanAbsoluteCloseError):
   'التحقق: انتظار إغلاق شموع لاحقة';
 const chartSide=aligned?.side??safeSide;
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
 const phase=sniperPhaseBadge({ready:liquidity.ready,
   contextKind:liquidity.context?.kind,phase:liquidity.phase,side:chartSide});
 const W=430,H=704,left=8,split=184,end=357,axis=359,
   plotTop=26,plotBottom=H-33;
 // A single absolute price axis contains EVERY currently valid target and
 // stop. No fake vertical positioning of offscreen targets.
 const historyZoneSpan=trueHistory.length?
   Math.max(1,Math.max(...trueHistory.map(b=>b.high))-
     Math.min(...trueHistory.map(b=>b.low))):1;
 const visibleZones=liquidity.zones.filter(z=>
   Math.abs((z.low+z.high)/2-(price??anchor??0))<=historyZoneSpan*1.2);
 const important=[
   ...trueHistory.flatMap(c=>[c.high,c.low]),
   ...goals.map(t=>t.price),
   ...(stop!=null?[stop]:[]),...(price!=null?[price]:[]),
   ...shownBars.flatMap(c=>[c.high,c.low]),
   ...visibleZones.flatMap(z=>[z.low,z.high]),
   ...(showLiquidity?reactionMap.bands.flatMap(z=>[z.low,z.high]):[]),
   ...reactionMap.marks.map(z=>z.price),
   ...(showLiquidity?futureZones.flatMap(z=>[z.low,z.high]):[]),
   ...(formingVisible&&forming?[forming.open,forming.high,forming.low,forming.close]:[])
 ].filter(v=>Number.isFinite(v)&&v>0);
 // A missing LIVE candle is NOT a price of $1. In WAIT/stale states
 // that synthetic fallback made the BTC axis span 0–87k and flattened all
 // genuine M15 candles into a row at the top. Scale only observed prices.
 const chartReference=[formingVisible?forming?.close:null,price,
   trueHistory.at(-1)?.close,anchor].find(v=>
     typeof v==='number'&&Number.isFinite(v)&&v>0)??null;
 const min=important.length?Math.min(...important):(chartReference??1);
 const max=important.length?Math.max(...important):(chartReference??1);
 const spread=Math.max(max-min,(chartReference??max)*.0004,projected.atr??0,1);
 const lo=Math.max(.000001,min-spread*.065);
 const hi=max+spread*.065;
 const py=(p:number)=>plotTop+(hi-p)/(hi-lo)*(plotBottom-plotTop);
 const scaleLevels=[
   ...goals.map(g=>({key:'TP'+g.stage,price:g.price,kind:'TARGET'})),
   ...(stop!=null?[{key:'SL',price:stop,kind:'STOP'}]:[]),
   ...(price!=null?[{key:'LIVE',price,kind:'PRICE'}]:[])
 ];
 const rail=scaleLevels.map(v=>({...v,exactY:py(v.price),labelY:py(v.price)}))
   .sort((a,b)=>a.exactY-b.exactY);
 const railMargin=plotTop+15,railBottom=plotBottom-15,railGap=29;
 for(let i=0;i<rail.length;i++)
   rail[i].labelY=Math.max(rail[i].exactY,railMargin+i*railGap,
     i?rail[i-1].labelY+railGap:railMargin);
 const overhang=rail.length?Math.max(0,rail[rail.length-1].labelY-railBottom):0;
 if(overhang)for(const point of rail)point.labelY-=overhang;
 const underhang=rail.length?Math.max(0,railMargin-rail[0].labelY):0;
 if(underhang)for(const point of rail)point.labelY+=underhang;
 const actualStride=(split-left-5)/Math.max(trueHistory.length,1);
 const timeX=(time:number)=>left+
   clamp((time-(trueHistory[0]?.time??time))/900000,0,trueHistory.length)*actualStride;
 const liquidityColor=(kind:string)=>
   kind==='DEMAND'||kind==='LOW_POOL'||kind==='REBOUND_UP'?
   '#41cfab':'#ff7b90';
 // Every M15 is exactly one equally-spaced slot on either side of NOW.
 // Expanding a 4-bar stopped route into 14 huge slots distorted the candles.
 // If fewer analogues qualify, show fewer bars; never stretch or invent time.
 const projectedSlots=Math.max(40,shownBars.length);
 const projectedStride=(end-split-8)/projectedSlots;
 const candleWidth=clamp(Math.min(actualStride,projectedStride)*.60,1.7,3.2);
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
 // Right price rail is reserved for EVERY label. Live/TP/SL first.
 const reserved=rail.map(r=>r.labelY);
 const freeY=(y:number)=>{
   const mid=clamp(y,plotTop+12,plotBottom-12);
   for(const delta of [0,-18,18,-36,36,-54,54,-72,72,-90,90]){
     const q=mid+delta;
     if(q>=plotTop+12&&q<=plotBottom-12&&
       reserved.every(v=>Math.abs(v-q)>=19)){
       reserved.push(q);return q;
     }
   }
   return null;
 };
 const forwardLabels=futureZones.map(z=>({...z,exactY:py(z.price),
   labelY:null as number|null})).sort((a,b)=>a.exactY-b.exactY);
 for(const z of forwardLabels)z.labelY=freeY(z.exactY);
 const markRailLabels=reactionMap.marks.map(mark=>({
   mark,exactY:py(mark.price),labelY:null as number|null
 }));
 for(const z of markRailLabels)
   if(!forwardLabels.some(x=>Math.abs(x.exactY-z.exactY)<13))
     z.labelY=freeY(z.exactY);
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
 const labelBy=(s:string)=>s==='SL'?'إبطال':s==='LIVE'?'LIVE':s;
 const grid=Array.from({length:9},(_,i)=>lo+(hi-lo)*i/8);
 const latestClosed=actual.at(-1);
 return <section className="sniper-m15-panel" dir="rtl"
   aria-label="القناص: شموع ربع ساعة فعلية وسيناريو M15 تاريخي مشروط">
   <header className="sniper-m15-head">
     {assetView==='ALL'?<div className="sniper-m15-assets" role="group" aria-label="الأصل">
       <button type="button" onClick={()=>setChosen('GOLD')} aria-pressed={asset==='GOLD'}>XAUUSD</button>
       <button type="button" onClick={()=>setChosen('BTC')} aria-pressed={asset==='BTC'}>BTCUSD</button>
     </div>:<b>{asset==='GOLD'?'XAUUSD':'BTCUSD'}</b>}
     <b className="sniper-m15-frame">M15</b>
     <button type="button" className="sniper-m15-liquidity-toggle"
       aria-pressed={showLiquidity} onClick={()=>setShowLiquidity(v=>!v)}
       title="مناطق سيولة القمم والقيعان، الطلب والعرض والارتداد أو الرفض بعد إغلاق M15">
       {showLiquidity?'المناطق ✓':'المناطق'}</button>
     <span className={'sniper-m15-phase '+(phase.confirmed?'confirmed':'neutral')}
       title={(liquidity.ready?liquidity.reason:'لا توجد قراءة محدثة')+
         ' · تقييم زمني M15: '+walkForward.correct+'/'+walkForward.selected+
         ' من '+walkForward.evaluated+' نتيجة مرصودة، دون إثبات أفضلية'}>
       {'الحالة: '+phase.label}</span>
     <span className={'sniper-m15-bias '+(chartSide==='BUY'?'rise':chartSide==='SELL'?'fall':'hold')}>
       {direction}</span>
   </header>
   <div className={'sniper-m15-lifecycle'+(paused?' paused':'')} role="status">
     <span>{lifecycle}</span><span title={evidenceNote+' · '+
       (proof?.detail||'لا نتيجة مؤكدة قبل إغلاق M15')}>
       {preMoveReady?evidenceNote:proofLabel}</span>
   </div>
   <div className="sniper-m15-chart-box">
     <OrderFlowRadar key={asset} asset={asset} onView={onRadarView} compact/>
     {asset==='GOLD'&&<GoldRadarBadge/>}
     <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={
         'شموع M15 فعلية ثم شموع توقع افتراضي، مع مناطق ارتداد حقيقية وتلامس أو انعطاف محاكى، TP1 وTP2 وTP3 والإبطال. '+
         (verifiedArchive.ready?'أرشيف حقيقي متحقق '+verifiedArchive.storedBars+' شمعة':'أرشيف سنوات غير متاح')+
         '. تقييم خارج العينة '+walkForward.selected+' قرارًا، لا يثبت أفضلية.'
       }
       preserveAspectRatio="none">
       <defs>
         <clipPath id={'sniper-m15-clip-'+asset}>
           <rect x={left} y={plotTop} width={end-left} height={plotBottom-plotTop}/>
         </clipPath>
       </defs>
       <rect width={W} height={H} fill="#000"/>
       {grid.map((v,i)=><g key={'grid'+i}>
         <line x1={left} x2={end} y1={py(v)} y2={py(v)}
           stroke="#26323f" strokeDasharray="3 5" strokeWidth=".8"/>
         {!reserved.some(y=>Math.abs(y-py(v))<13)&&
           i%2===0&&<text x={W-5} y={py(v)+3} fill="#697986"
             fontSize="8.2" textAnchor="end" direction="ltr">{n(v)}</text>}
       </g>)}
       {Array.from({length:8},(_,i)=><line key={'vx'+i} x1={left+i*(end-left)/7}
         x2={left+i*(end-left)/7} y1={plotTop} y2={plotBottom}
         stroke="#1d2b3a" strokeDasharray="3 6" strokeWidth=".8"/>)}
       <g clipPath={'url(#sniper-m15-clip-'+asset+')'}>
         {/* Same black background for real and hypothetical candles. */}
         {showLiquidity&&liquidity.context&&(()=>{
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
         {showLiquidity&&liquidity.zones.map(z=>{
           if(!drawnZones.includes(z))return null;
           const color=liquidityColor(z.kind),top=py(z.high),bottom=py(z.low);
           const pool=z.kind==='HIGH_POOL'||z.kind==='LOW_POOL';
           const reaction=z.kind==='REBOUND_UP'||z.kind==='REBOUND_DOWN';
           return <g key={'zone-'+z.kind+'-'+z.low} className="sniper-m15-zone">
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
         {showLiquidity&&!futureZones.length&&projected.ready&&reactionMap.bands.map((z,i)=>{
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
         {showLiquidity&&forwardLabels.map(z=>{
           const buying=z.key==='DEMAND'||z.key==='LOW_POOL';
           const pool=z.key==='HIGH_POOL'||z.key==='LOW_POOL';
           const color=buying?'#4ee5b3':'#ff8497';
           return <g key={'future-level-'+z.key}
             className="sniper-m15-future-zone">
             {/* Dashes bound the historical price zone, not the future path. */}
             <line x1={split+4} x2={end-4}
               y1={py(z.high)} y2={py(z.high)}
               stroke={color} strokeOpacity=".62" strokeWidth=".8"
               strokeDasharray={pool?'2 5':'5 4'}/>
             {!pool&&<line x1={split+4} x2={end-4}
               y1={py(z.low)} y2={py(z.low)}
               stroke={color} strokeOpacity=".62" strokeWidth=".8"
               strokeDasharray="5 4"/>}
             <title>{z.subtitle+' · منطقة تاريخية '+n(z.low)+' – '+n(z.high)+
               ' · '+z.source+' · مستوى تأكيد '+n(z.confirm)+
               ' · إبطال '+n(z.invalidate)+
               ' · ليست أوامر مستقبلية أو إشارة صفقة'}</title>
           </g>;
         })}
         {trueHistory.map((b,i)=>candle(b.open,b.high,b.low,b.close,
           left+(i+.5)*actualStride,candleWidth,false,'real'+b.time))}
         <line x1={split} x2={split} y1={plotTop} y2={plotBottom}
           stroke="#7e9bb1" strokeWidth="1.25" strokeDasharray="5 5"/>
         {projected.ready&&shownBars.map((b,i)=>
           candle(b.open,b.high,b.low,b.close,split+5+(i+.5)*projectedStride,
             candleWidth,true,'future'+i))}
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
         {projected.ready&&reactionMap.marks.map((mark,i)=>{
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
         {showLiquidity&&compactZones.map((z,i)=>{
           const color=z.kind==='MIXED'?
             z.label.includes('ارتداد')?'#41cfab':
             z.label.includes('رفض')?'#ff7b90':'#e8c184':
             liquidityColor(z.kind);
           const y=zoneLabelPoints[i].y,xBadge=split-7;
           return <g key={'group-label-'+i+'-'+z.price.toFixed(2)}>
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
         {showLiquidity&&liquidity.events.map((e,i)=>{
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
             split-4,Math.max(3.6,candleWidth*1.6),false,
             'live-m15-'+forming.time)}
           <circle cx={split-4} cy={py(forming.close)} r="2.3"
             fill="#c0f7ff" stroke="#00212c" strokeWidth=".7"/>
           <text x={split-15} y={Math.max(plotTop+13,py(forming.high)-8)}
             fill="#b9efff" fontSize="8" fontWeight="700"
             textAnchor="end" direction="ltr">LIVE</text>
           <title>{'شمعة M15 جارية وليست مغلقة: '+n(forming.close)+
             ' · شموع M1 '+forming.minutes+
             ' · عينات تيك '+forming.sampledTicks}</title>
         </g>}
       </g>
       {scaleLevels.map(level=>{
         const target=level.kind==='TARGET',isStop=level.kind==='STOP';
         const color=target?'#43e7b4':isStop?'#ff748a':'#e4edf8';
         const y=py(level.price);
         return <g key={level.key}>
           <line x1={left} x2={end} y1={y} y2={y} stroke={color}
             strokeWidth={isStop?1.35:1.05} strokeDasharray={isStop?'6 4':'5 5'}
             opacity=".87"/>

         </g>;
       })}
       <line x1={end} x2={end} y1={plotTop} y2={plotBottom} stroke="#637480" strokeWidth="1"/>
       {rail.map(level=>{
         const color=level.kind==='TARGET'?'#56ebbb':
           level.kind==='STOP'?'#ff8196':'#dbe6f2';
         const fill=level.kind==='TARGET'?'#063e34':
           level.kind==='STOP'?'#46202a':'#20313e';
         return <g key={'rail'+level.key}>
           <line x1={end} x2={axis+3} y1={level.exactY} y2={level.labelY}
             stroke={color} strokeWidth="1.2"/>
           <rect x={axis+1} y={level.labelY-12.5} width={W-axis-4}
             height="25" rx="3" fill={fill} stroke={color} strokeWidth=".7"/>
           <text x={axis+5} y={level.labelY-3.7} fontSize="8.8" fontWeight="700" fill={color}
             textAnchor="start" direction="ltr">{labelBy(level.key)}</text>
           <text x={W-5} y={level.labelY+8.1} fontSize="10.3" fontWeight="700"
             fill={color} textAnchor="end" direction="ltr">{n(level.price)}</text>
         </g>;
       })}
       {/* Small word and quote live in the fixed price rail, not in SVG's
            clipped forecast candle viewport. */}
       {showLiquidity&&forwardLabels.map(z=>{
         if(z.labelY==null)return null;
         const color=z.key==='DEMAND'||z.key==='LOW_POOL'?'#4ee5b3':'#ff8497';
         const name=z.key==='SUPPLY'?'عرض':z.key==='DEMAND'?'طلب':
            z.key==='HIGH_POOL'?'قمم':'قيعان';
         return <g key={'zone-rail-'+z.key} className="sniper-m15-rail-zone">
           {Math.abs(z.exactY-z.labelY)>9&&<path
             d={'M '+(end+1)+' '+z.exactY+' H '+(axis+1)+' V '+z.labelY}
             stroke={color} strokeWidth=".7" strokeDasharray="2 3"
             fill="none" opacity=".5"/>}
           <text x={axis+3} y={z.labelY+3} fontSize="7.9"
             fill={color} fontWeight="700" textAnchor="start"
             direction="ltr">{name}</text>
           <text x={W-4} y={z.labelY+3} fontSize="8.4"
             fill={color} fontWeight="700" textAnchor="end"
             direction="ltr">{n(z.price)}</text>
           <title>{z.label+' · السعر الأوسط '+n(z.price)+
              ' · المنطقة كاملة '+n(z.low)+' – '+n(z.high)+
              ' · ليست أوامر مستقبلية'}</title>
         </g>;
       })}
       {projected.ready&&markRailLabels.map(({mark,exactY,labelY})=>{
         if(labelY==null)return null;
         const color=mark.direction==='UP'?'#6bffe0':'#ffad92';
         const name=mark.kind==='PATTERN_TURN'?'دوران':
            mark.direction==='UP'?'ارتداد':'رفض';
         return <g key={'mark-rail-'+mark.step} className="sniper-m15-rail-turn">
           {Math.abs(exactY-labelY)>9&&<path
             d={'M '+(end+1)+' '+exactY+' H '+(axis+1)+' V '+labelY}
             stroke={color} strokeWidth=".7" strokeDasharray="2 3"
             fill="none" opacity=".5"/>}
           <text x={axis+3} y={labelY+3} fontSize="7.7"
             fill={color} fontWeight="700" textAnchor="start"
             direction="ltr">{name}</text>
           <text x={W-4} y={labelY+3} fontSize="8.4"
             fill={color} fontWeight="700" textAnchor="end"
             direction="ltr">{n(mark.price)}</text>
           <title>{mark.detail+' · حركة افتراضية غير مؤكدة'}</title>
         </g>;
       })}
       {!paused&&!awaitingReplacement&&asset==='BTC'&&elapsedSteps===0&&
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
       {!projected.ready&&<g className="sniper-m15-empty-reason">
         <text x={(split+end)/2} y={plotTop+66} fill="#d6bd8f"
           fontSize="9" textAnchor="middle" direction="rtl">
           {blockedKey===candleKey?'السيناريو مُبطل':
             safeSide==='WAIT'?'نطاق سعري · راقب الكسر بعد الإغلاق':'انتظار سيناريو صالح'}</text>
         <text x={(split+end)/2} y={plotTop+83} fill="#9baaba"
           fontSize="8.3" textAnchor="middle" direction="rtl">
           {freshObservation&&conditionalRange.valid?
              'فوق '+n(conditionalRange.upper)+' | تحت '+n(conditionalRange.lower):
              freshObservation?'لا توجد إشارة مؤكدة':'بانتظار تحديث بيانات السوق'}</text>
         <title>{lifecycle}</title>
       </g>}
       {projected.ready&&shownBars.length>0&&<g className="sniper-m15-first-audit">
         <text x={split+6} y={plotTop+(asset==='BTC'?42:25)}
           fill={firstM15Stats.ready?'#b3d9ec':'#899baa'}
           fontSize="8.2" textAnchor="start" direction="rtl">
           {firstM15Stats.label}</text>
         <title>{firstM15Stats.detail}</title>
       </g>}
       <text x={left+3} y={17} fill="#ccd8e6" fontSize="10" direction="ltr" textAnchor="start">M15 · REAL</text>
       <text x={split+5} y={17} fill="#e0c08d" fontSize="10" textAnchor="start" direction="ltr">M15 · SCENARIO</text>
       {latestClosed&&<text x={left+2} y={H-17} fill="#93a4b3" fontSize="11"
         textAnchor="start" direction="ltr">{h(trueHistory[0]?.time??latestClosed.time)}</text>}
       {latestClosed&&<text x={split} y={H-17} fill="#bacbd7" fontSize="11" textAnchor="middle" direction="ltr">{h(validLive&&forming?forming.time:latestClosed.time)}</text>}
       {aligned&&<text x={split+8} y={H-4} fill="#8acfb9" fontSize="8"
         textAnchor="start" direction="ltr">{'→ '+h(aligned.anchorTime+900000)}</text>}
       <text x={end-2} y={H-17} fill="#aebdc8" fontSize="11" textAnchor="end" direction="ltr">
         {shownBars.length?'+'+shownBars.length+' × M15':'M15'}</text>
     </svg>
   </div>
   {/* Chart-only layout. All levels are shown inside the SVG; historical
       analogues are visibly separated from observations. */}
 </section>;
}
