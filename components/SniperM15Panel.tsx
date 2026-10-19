'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import OrderFlowRadar from './OrderFlowRadar';
import type {RadarView} from '../lib/order-flow-radar';
import {assessSniperEntryCandle} from '../lib/sniper-entry-candle';
import {assessRadarNextCandle} from '../lib/sniper-radar-next-candle';
import {buildForecastIllustration} from '../lib/forecast-illustration';
import {assessChartObservation} from '../lib/chart-observation-radar';
import {buildDistantMovementOutlook} from '../lib/sniper-movement-outlook';
import {buildM15Scenario,closedM15Bars,sampledLiveM15} from '../lib/sniper-m15-scenario';
import type {M15Scenario,M15Side} from '../lib/sniper-m15-scenario';
import {frozenM15Decision} from '../lib/sniper-m15-freeze';
import {sniperPhaseBadge} from '../lib/sniper-market-phase';
import {observedM15Bias} from '../lib/sniper-m15-bias';
import {verifiedM15Archive} from '../lib/sniper-m15-archive-store';
import {m15WalkForward} from '../lib/sniper-m15-walkforward';
import {goldMarketSession} from '../lib/gold-market-session';
import {buildChartOverlay} from '../lib/chart-trading-overlay';
import {buildSniperM15Liquidity,compactM15ZoneAnnotations} from '../lib/sniper-m15-liquidity';

const n=(x:number|null|undefined)=>x!=null&&Number.isFinite(x)?
 x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const h=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'});
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
type FrozenChart={asset:'GOLD'|'BTC';closedTime:number;createdAt:number;
 side:Exclude<M15Side,'WAIT'>;goals:Array<{stage:number;price:number}>;
 stop:number|null;scenario:M15Scenario};
const noScenario:M15Scenario={ready:false,bars:[],reason:'لا تتوفر شموع سيناريو M15 مثبتة',
 sourceBars:0,archiveYears:0,origin:'NONE',touches:[],stopped:false,atr:null};


export default function SniperM15Panel({data,now,snapshotAt,goldLive,btcLive,assetView='ALL',
 observationAt=snapshotAt}:{
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
   radar.status==='ALIGNED'?radar.side:m15Bias.side;
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
 const anchor=actual.at(-1)?.close??null;
 const proposedGoals=targets.slice(0,3).map(t=>({stage:t.stage,price:t.price}));
 const forming=sampledLiveM15(m.candles,now);
 // A live partial candle is sourced only from true closed M1 bars.
 const validLive=forming!=null&&historyFresh&&m.historyFresh&&
   !providerTransition&&marketOpen&&m.sniper.view.priceFresh;
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
 const [blockedKey,setBlockedKey]=useState('');
 const lastAttempt=useRef('');
 const closedTime=actual.at(-1)?.time??0;
 const candleKey=asset+':'+closedTime;
 const confirmedEvents=Array.isArray(m.fourHour?.events)?m.fourHour.events:[];
 const latestBos=confirmedEvents.filter((e:any)=>
   (e?.kind==='BOS_UP'||e?.kind==='BOS_DOWN')&&
   Number.isFinite(e.confirmedAt)&&e.confirmedAt<=now
 ).sort((a:any,b:any)=>a.confirmedAt-b.confirmedAt).at(-1);
 const freshObservation=Boolean(historyFresh&&m.sniper.view.priceFresh&&
   !providerTransition&&marketOpen);
 const freezeDecision=frozenM15Decision({
   old:frozen?{asset:frozen.asset,closedTime:frozen.closedTime,
     side:frozen.side,stop:frozen.stop,createdAt:frozen.createdAt}:null,
   asset,closedTime,quote:price,fresh:freshObservation,
   marketOpen,now,opposingBosConfirmedAt:latestBos?.confirmedAt,
   opposingBosSide:latestBos?.kind==='BOS_UP'?'BUY':
     latestBos?.kind==='BOS_DOWN'?'SELL':null
 });
 useEffect(()=>{
   if(blockedKey===candleKey)return;
   if(freezeDecision==='HOLD')return;
   if(freezeDecision==='CLEAR'){
     if(frozen&&frozen.asset===asset&&frozen.closedTime===closedTime){
       const breached=frozen.stop!=null&&price!=null&&
         (frozen.side==='BUY'?price<=frozen.stop:price>=frozen.stop);
       const opposed=Boolean(latestBos&&latestBos.confirmedAt>frozen.createdAt&&
         (latestBos.kind==='BOS_UP'?'BUY':'SELL')!==frozen.side);
       if(breached||opposed)setBlockedKey(candleKey);
     }
     if(frozen)setFrozen(null);
     return;
   }
   if(!freshObservation||safeSide==='WAIT'||anchor==null||
     !proposedGoals.length||lastAttempt.current===candleKey)return;
   if(proposedStop!=null&&price!=null&&
      (safeSide==='BUY'?price<=proposedStop:price>=proposedStop))return;
   lastAttempt.current=candleKey;
   const scenario=buildM15Scenario({
     history:actual,
     archive:verifiedArchive.ready?verifiedArchive.rows:undefined,
     archiveYears:verifiedArchive.ready?verifiedArchive.years:0,
     now,anchor,side:safeSide,targets:proposedGoals,
     stop:proposedStop,steps:48
   });
   if(!scenario.ready)return;
   setFrozen({asset,closedTime,createdAt:now,
     side:safeSide,goals:proposedGoals,stop:proposedStop,scenario});
 },[asset,now,closedTime,candleKey,blockedKey,freezeDecision,frozen,
    freshObservation,safeSide,anchor,actual,price,proposedStop,
    proposedGoals.map(g=>g.price).join('|'),latestBos?.confirmedAt,latestBos?.kind,
   verifiedArchive.ready,verifiedArchive.storedBars]);
 const stable=blockedKey!==candleKey&&freezeDecision==='HOLD'&&
   frozen?.asset===asset?frozen:null;
 const goals=stable?.goals??(freezeDecision==='REBUILD'&&
   blockedKey!==candleKey&&safeSide!=='WAIT'&&freshObservation?proposedGoals:[]);
 const stop=stable?.stop??(freezeDecision==='REBUILD'&&
   blockedKey!==candleKey&&freshObservation?proposedStop:null);
 const projected=stable?.scenario??noScenario;
 const chartSide=stable?.side??safeSide;
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
 const important=[
   ...trueHistory.flatMap(c=>[c.high,c.low]),
   ...goals.map(t=>t.price),
   ...(stop!=null?[stop]:[]),...(price!=null?[price]:[]),
   ...projected.bars.flatMap(c=>[c.high,c.low])
 ].filter(v=>Number.isFinite(v)&&v>0);
 const min=Math.min(...important,anchor??1);
 const max=Math.max(...important,anchor??1);
 const spread=Math.max(max-min,(anchor??1)*.0004,projected.atr??0,1);
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
 const liquidityColor=(kind:string)=>kind==='DEMAND'||kind==='LOW_POOL'?
   '#41cfab':'#ff7b90';
 const projectedStride=(end-split-8)/Math.max(projected.bars.length,48);
 // Price zones keep their true coordinates; only nearby labels merge.
 const compactZones=compactM15ZoneAnnotations(liquidity.zones,price??0,py,3,34);
 const zoneLabelPoints=compactZones.map((z,i)=>({i,y:py(z.price)}));
 for(let i=0;i<zoneLabelPoints.length;i++)
   zoneLabelPoints[i].y=Math.max(clamp(zoneLabelPoints[i].y,plotTop+17,plotBottom-15),
     i?zoneLabelPoints[i-1].y+25:plotTop+17);
 const zoneOverhang=zoneLabelPoints.length?
   Math.max(0,zoneLabelPoints[zoneLabelPoints.length-1].y-(plotBottom-15)):0;
 if(zoneOverhang)for(const z of zoneLabelPoints)z.y-=zoneOverhang;
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
       title="إظهار أو إخفاء مناطق الطلب والعرض والسيولة والتجميع">
       {showLiquidity?'سيولة ✓':'سيولة'}</button>
     <span className={'sniper-m15-phase '+(phase.confirmed?'confirmed':'neutral')}
       title={(liquidity.ready?liquidity.reason:'لا توجد قراءة محدثة')+
         ' · تقييم زمني M15: '+walkForward.correct+'/'+walkForward.selected+
         ' من '+walkForward.evaluated+' نتيجة مرصودة، دون إثبات أفضلية'}>
       {'الحالة: '+phase.label}</span>
     <span className={'sniper-m15-bias '+(chartSide==='BUY'?'rise':chartSide==='SELL'?'fall':'hold')}>
       {direction}</span>
   </header>
   <OrderFlowRadar key={asset} asset={asset} onView={onRadarView}/>
   <div className="sniper-m15-chart-box">
     <svg viewBox={'0 0 '+W+' '+H} role="img" aria-label={
         'شموع M15 فعلية ثم شموع توقع افتراضي، مع TP1 وTP2 وTP3 والإبطال. '+
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
         {!rail.some(level=>Math.abs(level.labelY-py(v))<17)&&
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
           const color=liquidityColor(z.kind),top=py(z.high),bottom=py(z.low);
           const pool=z.kind==='HIGH_POOL'||z.kind==='LOW_POOL';
           return <g key={'zone-'+z.kind+'-'+z.low} className="sniper-m15-zone">
             <rect x={left+2} y={top} width={split-left-5}
               height={Math.max(2,bottom-top)} fill={color}
               fillOpacity={pool?0.11:0.18} stroke={color}
               strokeOpacity=".94" strokeWidth={pool?1.2:1.3}
               strokeDasharray={pool?'3 6':'6 4'}/>
             <title>{z.label+' · '+n(z.low)+' – '+n(z.high)+
               ' · '+z.source+' · مستويات سعرية وليست حجم أوامر فعلي'}</title>
           </g>;
         })}
         {trueHistory.map((b,i)=>candle(b.open,b.high,b.low,b.close,
           left+(i+.5)*actualStride,clamp(actualStride*.60,1.7,4),false,'real'+b.time))}
         <line x1={split} x2={split} y1={plotTop} y2={plotBottom}
           stroke="#7e9bb1" strokeWidth="1.25" strokeDasharray="5 5"/>
         {projected.ready&&projected.bars.map((b,i)=>
           candle(b.open,b.high,b.low,b.close,split+5+(i+.5)*projectedStride,
             clamp(projectedStride*.62,1.5,3.1),true,'future'+i))}
         {showLiquidity&&compactZones.map((z,i)=>{
           const color=z.kind==='MIXED'?'#e8c184':liquidityColor(z.kind);
           const y=zoneLabelPoints[i].y,xBadge=split-82;
           return <g key={'group-label-'+i+'-'+z.price.toFixed(2)}>
             <line x1={split-5} x2={xBadge+74} y1={py(z.price)} y2={y}
               stroke={color} strokeOpacity=".64" strokeWidth=".8"/>
             <rect x={xBadge} y={y-10} width="74" height="20" rx="4"
               fill="#07161d" fillOpacity=".98" stroke={color} strokeOpacity=".76"/>
             <text x={xBadge+37} y={y+3.2} fill={color} fontSize="9"
               fontWeight="700" textAnchor="middle" direction="rtl">{z.label}</text>
             <title>{z.detail}</title>
           </g>;
         })}
         {showLiquidity&&liquidity.context&&(()=>{
           const z=liquidity.context!,color=z.kind==='ACCUMULATION'?'#66e9b9':
             z.kind==='DISTRIBUTION'?'#ffac8e':'#eccc87';
           const xa=timeX(z.from),xb=Math.min(split,timeX(z.to));
           return <g className="sniper-m15-context-label">
             <rect x={clamp((xa+xb)/2-37,left+6,split-76)}
               y={clamp(py(z.high)-20,plotTop+2,plotBottom-21)}
               width="74" height="17" rx="3" fill="#061017" fillOpacity=".85"
               stroke={color} strokeOpacity=".7"/>
             <text x={clamp((xa+xb)/2,left+43,split-39)}
               y={clamp(py(z.high)-8,plotTop+14,plotBottom-9)}
               fontSize="9" fill={color} textAnchor="middle" fontWeight="700">
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
             {i===liquidity.events.length-1&&<text x={clamp(xMark,left+34,split-34)}
               y={clamp(yMark-13,plotTop+15,plotBottom-8)}
               fontSize="9" fill={color} fontWeight="700" textAnchor="middle"
               direction="rtl">{mark}</text>}
           </g>;
         })}
         {validLive&&forming&&candle(forming.open,forming.high,forming.low,
           forming.close,split-3,clamp(actualStride*.60,1.7,4),false,
           'live-m15-'+forming.time)}
         {validLive&&forming&&<circle cx={split-3} cy={py(forming.close)} r="1.7"
           fill="#b0ffea" stroke="#001614" strokeWidth=".4"/>}
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
       {asset==='BTC'&&projected.ready&&projected.bars.length>0&&(()=>{
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
       <text x={left+3} y={17} fill="#ccd8e6" fontSize="10" direction="ltr" textAnchor="start">M15 · REAL</text>
       <text x={split+5} y={17} fill="#e0c08d" fontSize="10" textAnchor="start" direction="ltr">M15 · FORECAST</text>
       {latestClosed&&<text x={left+2} y={H-17} fill="#93a4b3" fontSize="11"
         textAnchor="start" direction="ltr">{h(trueHistory[0]?.time??latestClosed.time)}</text>}
       {latestClosed&&<text x={split} y={H-17} fill="#bacbd7" fontSize="11" textAnchor="middle" direction="ltr">{h(latestClosed.time)}</text>}
       <text x={end-2} y={H-17} fill="#aebdc8" fontSize="11" textAnchor="end" direction="ltr">
         {projected.bars.length?'+'+projected.bars.length+' × M15':'M15'}</text>
     </svg>
   </div>
   {/* Chart-only layout. All levels are shown inside the SVG; historical
       analogues are visibly separated from observations. */}
 </section>;
}
