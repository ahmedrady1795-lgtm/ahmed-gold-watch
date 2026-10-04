import {commitDirection} from './direction-commitment';
import {evaluatePredatorScalp} from './predator-scalp-core';

type Side='BUY'|'SELL'|'WAIT';

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const side=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const signed=(s:Side,v:number)=>s==='BUY'?v:s==='SELL'?-v:0;

function technicalSide(raw:any):Side{
  const a=side(raw?.action);
  if(a!=='WAIT')return a;
  const l=Number(raw?.score?.long||0),s=Number(raw?.score?.short||0);
  if(Math.abs(l-s)<4)return 'WAIT';
  return l>s?'BUY':'SELL';
}
function liquidityStrength(liq:any){
  const q=cap(Number(liq?.quality||0),0,100)/100;
  const directional=Math.abs(Number(liq?.buy||50)-Number(liq?.sell||50));
  const pressure=Math.abs(Number(liq?.pressure||0));
  const depth=Math.abs(Number(liq?.book?.depthImbalance??liq?.book?.weightedImbalance??0));
  const flow=Math.abs(Number(liq?.flow?.deltaPct||0));
  return cap((directional*.55+pressure*.30+depth*.22+flow*.18)*(0.55+q*.45),0,92);
}
function mlStrength(ml:any){
  const m=ml?.oneMinute||ml?.m1||null;
  if(!m?.ready||!['BUY','SELL'].includes(String(m?.side)))return {side:'WAIT' as Side,score:0};
  const conf=Number(m?.confidence||0);
  const hold=Number(m?.metrics?.ensemble?.selectiveAccuracy||m?.selectiveAccuracy||0);
  const score=cap(conf*.68+(hold>0?hold*.32:0),0,88);
  return {side:side(m.side),score};
}
function tickStrength(tick:any){
  const s=side(tick?.side);
  if(!tick?.ok||s==='WAIT')return {side:'WAIT' as Side,score:0,confidence:0,stage:'OFFLINE'};
  const score=cap(Number(tick?.score||0)*.62+Number(tick?.confidence||0)*.38,0,90);
  return {side:s,score,confidence:cap(Number(tick?.confidence||0),0,90),stage:String(tick?.stage||'WARMING')};
}
function liveReliability(live:any,primary:string,fallback:string){
  const p=live?.bySource?.[primary]||{},f=live?.bySource?.[fallback]||{};
  const pn=Number(p?.hits||0)+Number(p?.fails||0),fn=Number(f?.hits||0)+Number(f?.fails||0);
  const source=pn>=6?primary:fn>=8?fallback:pn>0?primary:fn>0?fallback:primary;
  const s=source===primary?p:f;
  const n=Number(s?.hits||0)+Number(s?.fails||0);
  const posterior=Number(s?.posteriorAccuracy||50);
  const wf=live?.walkForwardBySource?.[source]||{};
  const wfN=Number(wf?.oos?.n||0),wfAcc=Number(wf?.oos?.accuracy);
  const score=cap(wfN>=10&&Number.isFinite(wfAcc)?posterior*.45+wfAcc*.55:posterior,35,68);
  const multiplier=cap(.90+(score-50)/80,.76,1.16);
  return {source,n,posterior:Number(posterior.toFixed(1)),wfN,wfAccuracy:Number.isFinite(wfAcc)?Number(wfAcc.toFixed(1)):null,score:Number(score.toFixed(1)),multiplier:Number(multiplier.toFixed(3)),status:String(wf?.status||'COLLECTING'),drift:String(wf?.drift?.status||'COLLECTING')};
}

function reactionContext(accumulation:any,price:number){
  const zones=Array.isArray(accumulation?.reactionZones)?accumulation.reactionZones:[];
  const p=Number(price);
  const normalized=zones
    .map((z:any)=>({
      side:side(z?.side),low:Number(z?.low),high:Number(z?.high),mid:Number(z?.mid),
      strength:cap(Number(z?.strength||0),0,94),distanceAtr:Number(z?.distanceAtr),status:String(z?.status||'FAR'),
      touches:Number(z?.touches||0),rejections:Number(z?.rejections||0),reason:String(z?.reason||'')
    }))
    .filter((z:any)=>z.side!=='WAIT'&&Number.isFinite(z.low)&&Number.isFinite(z.high)&&Number.isFinite(z.mid));
  const inside=normalized.filter((z:any)=>Number.isFinite(p)&&p>=z.low&&p<=z.high).sort((a:any,b:any)=>b.strength-a.strength)[0]||null;
  const nearest=inside||normalized.slice().sort((a:any,b:any)=>(Number.isFinite(a.distanceAtr)?a.distanceAtr:99)-(Number.isFinite(b.distanceAtr)?b.distanceAtr:99)||b.strength-a.strength)[0]||null;
  const active=Boolean(nearest&&nearest.strength>=58&&(inside||nearest.status==='NEAR'||Number(nearest.distanceAtr)<=.65));
  const reboundSide:Side=active?nearest.side:'WAIT';
  const targetFor=(s:Side)=>{
    if(s==='WAIT'||!Number.isFinite(p))return null;
    const targetSide:Side=s==='BUY'?'SELL':'BUY';
    return normalized
      .filter((z:any)=>z.side===targetSide&&((s==='BUY'&&z.mid>p)||(s==='SELL'&&z.mid<p)))
      .sort((a:any,b:any)=>Math.abs(a.mid-p)-Math.abs(b.mid-p)||b.strength-a.strength)[0]||null;
  };
  return {zones,normalized,inside,nearest,active,reboundSide,targetFor};
}

function preMoveSignal(liq:any,motion:any,tick:any){
  const q=cap(Number(liq?.quality||0),0,100),pressure=Number(liq?.pressure||0),micro=Number(liq?.book?.microEdge||0);
  const accel=Number(liq?.dynamics?.acceleration||0),delta=Number(liq?.flow?.deltaPct||0),priceBps=Number(liq?.flow?.priceChangeBps||0);
  const t=tickStrength(tick),motionSide=side(motion?.side),motionStage=String(motion?.stage||'WAIT');
  const precursorCount=Number(motion?.diagnostics?.precursorCount||0),compression=Number(motion?.components?.compression||0);
  let buy=0,sell=0,supportBuy=0,supportSell=0;
  const add=(s:Side,pts:number)=>{if(s==='BUY'){buy+=pts;supportBuy++;}else if(s==='SELL'){sell+=pts;supportSell++;}};
  if(q>=55&&Math.abs(pressure)>=8)add(pressure>0?'BUY':'SELL',Math.min(24,Math.abs(pressure)*.34));
  if(Math.abs(micro)>=14)add(micro>0?'BUY':'SELL',Math.min(18,Math.abs(micro)*.16));
  if(Math.abs(accel)>=7)add(accel>0?'BUY':'SELL',Math.min(16,Math.abs(accel)*.20));
  if(Math.abs(delta)>=16)add(delta>0?'BUY':'SELL',Math.min(14,Math.abs(delta)*.16));
  if(motionSide!=='WAIT'&&(motionStage==='PRE_MOVE'||motionStage==='IGNITION'))add(motionSide,Math.min(24,Number(motion?.score||0)*.28));
  if(t.side!=='WAIT'){
    const velocity3=Math.abs(Number(tick?.velocity3s||0)),acceleration=Math.abs(Number(tick?.acceleration||0)),persistence=Number(tick?.persistence||0);
    const preTick=velocity3<=3.6&&acceleration>=.18&&persistence>=56;
    if(preTick)add(t.side,Math.min(22,t.score*.24+Math.max(0,persistence-55)*.18));
  }
  const provisional:Side=buy-sell>=6?'BUY':sell-buy>=6?'SELL':'WAIT';
  if(provisional!=='WAIT'&&compression>=60){
    if(provisional==='BUY')buy+=Math.min(12,compression*.12);else sell+=Math.min(12,compression*.12);
  }
  const score=cap(Math.max(buy,sell),0,90),gap=Math.abs(buy-sell);
  const sideOut:Side=gap>=8&&score>=34?(buy>sell?'BUY':'SELL'):'WAIT';
  const support=sideOut==='BUY'?supportBuy:sideOut==='SELL'?supportSell:0;
  const tickVelocity3=Math.abs(Number(tick?.velocity3s||0));
  const priceStillCoiled=Math.abs(priceBps)<=2.6&&tickVelocity3<=3.8;
  const lateMomentum=Math.abs(priceBps)>3.2||tickVelocity3>4.8;
  const armed=Boolean(sideOut!=='WAIT'&&priceStillCoiled&&!lateMomentum&&score>=52&&support>=3&&(precursorCount>=2||compression>=60||t.side===sideOut));
  const ignition=Boolean(sideOut!=='WAIT'&&(motionStage==='IGNITION'||(t.stage==='IGNITION'&&t.side===sideOut)));
  const persistence=Number(tick?.persistence||0);
  const etaSeconds=sideOut==='WAIT'?null:Math.round(cap(
    27-Math.min(9,Math.abs(accel)*.32)-Math.min(7,Math.max(0,persistence-50)*.12)-Math.min(5,Math.max(0,compression-50)*.08),
    4,30
  ));
  return {side:sideOut,score:Number(score.toFixed(1)),gap:Number(gap.toFixed(1)),support,armed,ignition,priceStillCoiled,lateMomentum,etaSeconds,quality:q,pressure:Number(pressure.toFixed(1)),microEdge:Number(micro.toFixed(1)),acceleration:Number(accel.toFixed(1)),deltaPct:Number(delta.toFixed(1)),priceChangeBps:Number(priceBps.toFixed(2)),compression,precursorCount,tickSide:t.side,tickStage:t.stage,tickScore:Number(t.score.toFixed(1))};
}

export function buildScalpFusion(raw:any,liq:any,motion:any,learner:any,ml:any,price:number|null,atr:number|null,liveOutcome:any=null,tick:any=null,accumulation:any=null,asset='BTC'){
  const techSide=technicalSide(raw);
  const long=Number(raw?.score?.long||0),short=Number(raw?.score?.short||0),techBest=Math.max(long,short),techGap=Math.abs(long-short);
  const liqSide=side(liq?.side),liqScore=liquidityStrength(liq);
  const motionSide=side(motion?.side),motionScore=cap(Number(motion?.score||motion?.confidence||0),0,88);
  const trapSide:Side=liq?.absorption?.trapDetected?side(liq?.absorption?.side):'WAIT';
  const trapScore=cap(Number(liq?.absorption?.score||0),0,90);
  const ml1=mlStrength(ml);
  const tick1=tickStrength(tick);
  const preMove=preMoveSignal(liq,motion,tick);
  const p=Number(price),a=Number(atr);
  const reaction=reactionContext(accumulation,p);
  const accumulationSide:Side=accumulation?.ok?side(accumulation?.side):'WAIT';
  const accumulationScore=accumulationSide==='BUY'?Number(accumulation?.accumulationScore||0):accumulationSide==='SELL'?Number(accumulation?.distributionScore||0):0;
  const accumulationPhase=String(accumulation?.phase||'NEUTRAL');
  const accumulationReadiness=Number(accumulation?.breakoutReadiness||0);
  const reactionSide:Side=reaction.active?reaction.reboundSide:'WAIT';
  const reactionScore=reaction.active?cap(Number(reaction.nearest?.strength||0)+(reaction.inside?8:0),0,94):0;
  const reactionFastSupport=[tick1.side,preMove.side,motionSide,liqSide,trapSide].filter(s=>s!=='WAIT'&&s===reactionSide).length;
  const reactionFastOpposition=[motionSide,liqSide,trapSide].filter(s=>s!=='WAIT'&&reactionSide!=='WAIT'&&s!==reactionSide).length;
  const reactionConfirmed=Boolean(
    reactionSide!=='WAIT'&&reactionScore>=68&&
    (
      (tick1.side===reactionSide&&tick1.score>=54&&(preMove.side===reactionSide||motionSide===reactionSide))||
      (motionSide===reactionSide&&liqSide===reactionSide)||
      (trapSide===reactionSide&&trapScore>=68)
    )&&
    reactionFastOpposition<=2
  );
  const reactionCandidate=Boolean(reactionSide!=='WAIT'&&reactionScore>=68&&!reactionConfirmed);
  const confirmedReliability=liveReliability(liveOutcome,'SCALP_PREDATOR_ATTACK_V7','SCALP_PREDATOR_ATTACK_V7');
  const preMoveReliability=liveReliability(liveOutcome,'SCALP_PREDATOR_AMBUSH_V7','SCALP_PREDATOR_AMBUSH_V7');
  const confirmedStats=liveOutcome?.bySource?.SCALP_PREDATOR_ATTACK_V7||{};
  const confirmedHits=Number(confirmedStats?.hits||0),confirmedFails=Number(confirmedStats?.fails||0);
  const confirmedDirectional=confirmedHits+confirmedFails;
  const confirmedColdFailGuard=Boolean(
    confirmedDirectional>=3&&confirmedFails>=3&&confirmedHits===0
  );
  const learnedSide:Side=learner?.ok&&learner?.gate?.passed?side(learner?.side):'WAIT';
  const learnedScore=learnedSide==='WAIT'?0:cap(Number(learner?.confidence||0)*.55+Number(learner?.oosAccuracy||0)*.45,0,82);

  const mode=String(raw?.adaptive?.mode||'FLOW').toUpperCase();
  // v4 deliberately shifts weight away from lagging candle confirmation toward
  // live order-flow, server tick acceleration and a dedicated pre-move precursor.
  const weights=mode==='COMPRESSION'
    ?{tech:.08,liq:.20,ml:.12,motion:.10,trap:.12,learn:.02,tick:.10,premove:.10,accum:.08,reaction:.08}
    :mode==='REVERSAL'
      ?{tech:.10,liq:.15,ml:.10,motion:.08,trap:.18,learn:.02,tick:.07,premove:.05,accum:.10,reaction:.15}
      :mode==='BREAKOUT'||mode==='MOMENTUM'
        ?{tech:.14,liq:.20,ml:.13,motion:.10,trap:.05,learn:.02,tick:.12,premove:.10,accum:.08,reaction:.06}
        :{tech:.12,liq:.22,ml:.14,motion:.09,trap:.06,learn:.02,tick:.10,premove:.10,accum:.08,reaction:.07};

  const techSignal=techSide==='WAIT'?0:cap(42+techBest*.46+techGap*.42,0,92);
  const rows=[
    {name:'TECH',side:techSide,score:techSignal,weight:weights.tech},
    {name:'L2',side:liqSide,score:liqScore,weight:weights.liq},
    {name:'ML1',side:ml1.side,score:ml1.score,weight:weights.ml},
    {name:'MOTION',side:motionSide,score:motionScore,weight:weights.motion},
    {name:'TRAP',side:trapSide,score:trapScore,weight:weights.trap},
    {name:'LEARNED',side:learnedSide,score:learnedScore,weight:weights.learn},
    {name:'TICK',side:tick1.side,score:tick1.score,weight:weights.tick},
    {name:'PREMOVE',side:preMove.side,score:preMove.score,weight:weights.premove*preMoveReliability.multiplier},
    {name:'ACCUM',side:accumulationSide,score:cap(accumulationScore*.72+accumulationReadiness*.28,0,92),weight:weights.accum},
    {name:'REACTION',side:reactionSide,score:reactionScore,weight:weights.reaction*(reactionConfirmed?1:.22)}
  ].filter(x=>x.side!=='WAIT'&&x.score>0);

  let buy=0,sell=0;
  for(const r of rows){
    const v=r.score*r.weight;
    if(r.side==='BUY')buy+=v;else sell+=v;
  }

  // A high-quality L2 + validated ML agreement may overturn a stale/lagging technical candle.
  const livePair=liqSide!=='WAIT'&&ml1.side!=='WAIT'&&liqSide===ml1.side;
  if(livePair&&liqScore>=34&&ml1.score>=48){
    const boost=Math.min(13,(liqScore+ml1.score)*.075);
    if(liqSide==='BUY')buy+=boost;else sell+=boost;
  }

  // Opposing high-quality L2 should materially suppress a technical-only call.
  const techL2Conflict=techSide!=='WAIT'&&liqSide!=='WAIT'&&techSide!==liqSide&&Number(liq?.quality||0)>=75&&liqScore>=26;
  if(techL2Conflict){
    if(techSide==='BUY')buy*=.76;else sell*=.76;
  }

  // PRE-MOVE bonus: pressure + server tick agrees while price is still coiled.
  // This is the anticipatory path that can arm before a candle breakout confirms.
  const fastPair=preMove.armed&&preMove.side!=='WAIT'&&tick1.side===preMove.side&&liqSide===preMove.side;
  if(fastPair){
    const boost=Math.min(15,preMove.score*.10+tick1.score*.06+liqScore*.04);
    if(preMove.side==='BUY')buy+=boost;else sell+=boost;
  }

  // Trap / absorption gets veto-like power only when it is actually strong.
  if(trapSide!=='WAIT'&&trapScore>=62){
    if(trapSide==='BUY'){buy+=8;sell*=.78;}else{sell+=8;buy*=.78;}
  }

  // A reaction zone is LOCATION evidence, not direction by itself.
  // It only gets reversal authority after fast flow confirms the turn.
  if(reactionConfirmed){
    const boost=Math.min(reaction.inside?18:12,reactionScore*(reaction.inside?.18:.11));
    if(reactionSide==='BUY'){buy+=boost;if(reaction.inside&&reactionScore>=76)sell*=.80;}
    else {sell+=boost;if(reaction.inside&&reactionScore>=76)buy*=.80;}
  }
  if(accumulationSide!=='WAIT'&&accumulationReadiness>=52){
    const boost=Math.min(10,accumulationReadiness*.10);
    if(accumulationSide==='BUY')buy+=boost;else sell+=boost;
  }

  const total=Math.max(1e-9,buy+sell),buyShare=buy/total*100,sellShare=100-buyShare,edge=Math.abs(buyShare-sellShare);
  const activeWeight=Math.max(.01,rows.reduce((s,r)=>s+r.weight,0));
  const buyEvidence=cap(buy/activeWeight,0,92),sellEvidence=cap(sell/activeWeight,0,92);
  const dominantEvidence=Math.max(buyEvidence,sellEvidence);
  const rawFusedSide:Side=edge>=4&&dominantEvidence>=28?(buy>sell?'BUY':'SELL'):'WAIT';
  const rawSupport=rows.filter(r=>r.side===rawFusedSide).length;
  const rawOpposition=rows.filter(r=>rawFusedSide!=='WAIT'&&r.side!==rawFusedSide).length;
  const rawLiveSupport=[liqSide,motionSide,trapSide,ml1.side,tick1.side,preMove.side].filter(s=>s!=='WAIT'&&s===rawFusedSide).length;
  const rawLiveOpposition=[liqSide,motionSide,trapSide,ml1.side,tick1.side,preMove.side].filter(s=>s!=='WAIT'&&rawFusedSide!=='WAIT'&&s!==rawFusedSide).length;
  const commitment=commitDirection(
    String(asset||'BTC').toUpperCase()+':SCALP_FUSION_V6',buyEvidence,sellEvidence,Date.now(),
    {side:tick1.side,stage:tick1.stage,score:tick1.score,confidence:tick1.confidence}
  );
  const flipSuppressed=Boolean(rawFusedSide!=='WAIT'&&commitment.side!=='WAIT'&&commitment.side!==rawFusedSide);
  const fusedSide:Side=flipSuppressed?'WAIT':rawFusedSide;
  const support=fusedSide==='WAIT'?0:rawSupport;
  const opposition=fusedSide==='WAIT'?rawOpposition:rawOpposition;
  const liveSupport=fusedSide==='WAIT'?0:rawLiveSupport;
  const liveOpposition=fusedSide==='WAIT'?rawLiveOpposition:rawLiveOpposition;
  const preMoveAligned=Boolean(fusedSide!=='WAIT'&&preMove.armed&&preMove.side===fusedSide);
  const tickAligned=Boolean(fusedSide!=='WAIT'&&tick1.side===fusedSide&&tick1.score>=44);
  const mlConflict=Boolean(ml1.side!=='WAIT'&&fusedSide!=='WAIT'&&ml1.side!==fusedSide);
  const strongReaction=Boolean(reactionSide!=='WAIT'&&reactionScore>=68&&(reaction.inside||Number(reaction.nearest?.distanceAtr)<=.45));
  const reactionConflict=Boolean(reactionConfirmed&&fusedSide!=='WAIT'&&reactionSide!==fusedSide);
  const reactionAligned=Boolean(reactionConfirmed&&reactionSide===fusedSide);
  const unconfirmedReactionAgainstFlow=Boolean(
    reactionCandidate&&fusedSide===reactionSide&&reactionFastOpposition>=2
  );
  const accumulationAligned=Boolean(accumulationSide!=='WAIT'&&accumulationSide===fusedSide&&accumulationReadiness>=48);
  const contextMode=reactionAligned
    ?(reactionSide==='BUY'?'DEMAND_REBOUND':'SUPPLY_REJECTION')
    :accumulationPhase==='ACCUMULATING'?'ACCUMULATION'
    :accumulationPhase==='DISTRIBUTING'?'DISTRIBUTION'
    :accumulationPhase==='MARKUP_READY'?'BREAKOUT_BUILD_UP'
    :accumulationPhase==='MARKDOWN_READY'?'BREAKOUT_BUILD_DOWN'
    :mode;

  const scalpWf=liveOutcome?.walkForward||{};
  const scalpOosN=Number(scalpWf?.oos?.n||0),scalpOosAcc=Number(scalpWf?.oos?.accuracy);
  const scalpDrift=String(scalpWf?.drift?.status||'COLLECTING'),scalpWfStatus=String(scalpWf?.status||'COLLECTING');
  const scalpPrecisionGuard=Boolean(scalpOosN>=10&&(scalpWfStatus==='WATCH'||scalpDrift==='DEGRADING'||(Number.isFinite(scalpOosAcc)&&scalpOosAcc<53)));
  const scalpSevereDrift=Boolean(scalpOosN>=10&&scalpDrift==='DEGRADING'&&Number(scalpWf?.drift?.delta||0)<=-15);

  const activeReliability=preMoveAligned?preMoveReliability:confirmedReliability;
  let confidence=cap(dominantEvidence*.54+edge*.18+support*2.4+liveSupport*3.1-liveOpposition*4.4,10,88);
  if(preMoveAligned)confidence+=5;
  if(preMove.ignition&&preMove.side===fusedSide)confidence+=3;
  if(tickAligned&&liqSide===fusedSide)confidence+=3;
  if(techL2Conflict&&!livePair&&!preMoveAligned)confidence-=5;
  if(learner&&!learner.ok&&liveSupport<2)confidence-=3;
  if(ml1.side==='WAIT'&&learnedSide==='WAIT'&&!fastPair)confidence=Math.min(confidence,76);
  if(scalpWfStatus==='WATCH'&&scalpOosN>=10)confidence-=4;
  if(scalpDrift==='DEGRADING'&&scalpOosN>=10)confidence-=7;
  if(Number.isFinite(scalpOosAcc)&&scalpOosN>=10&&scalpOosAcc<50)confidence-=4;
  if(activeReliability.n>=6)confidence+=cap((activeReliability.score-50)*.16,-4,4);
  if(reactionAligned)confidence+=reaction.inside?6:4;
  if(reactionCandidate)confidence-=reactionFastOpposition>=2?8:3;
  if(accumulationAligned)confidence+=3;
  if(reactionConflict)confidence-=12;
  if(confirmedColdFailGuard)confidence-=8;
  if(flipSuppressed)confidence-=12;
  confidence=Math.round(cap(confidence,10,88));

  const reliabilityPenalty=activeReliability.n>=6?(activeReliability.score<48?7:activeReliability.score<52?4:activeReliability.score<55?2:activeReliability.score>=60?-2:0):0;
  const strongEdge=(scalpSevereDrift?20:scalpPrecisionGuard?16:14)+reliabilityPenalty;
  const strongEvidence=(scalpSevereDrift?66:scalpPrecisionGuard?62:58)+Math.max(0,reliabilityPenalty*.7);
  const classicStrong=Boolean(
    fusedSide!=='WAIT'&&edge>=strongEdge&&dominantEvidence>=strongEvidence&&support>=2&&
    (liveSupport>=2||(ml1.side===fusedSide&&liqSide===fusedSide)||(trapSide===fusedSide&&trapScore>=68))&&
    (!scalpSevereDrift||liveOpposition===0||edge>=30)&&
    (!reactionConflict||edge>=30&&liveSupport>=3)
  );
  const anticipatoryStrong=Boolean(
    fusedSide!=='WAIT'&&preMoveAligned&&fastPair&&edge>=12&&dominantEvidence>=56&&support>=2&&liveSupport>=3&&
    (!mlConflict||edge>=20||preMove.score>=68)&&
    (!scalpPrecisionGuard||edge>=18)&&
    (!scalpSevereDrift||liveOpposition===0)&&
    !preMove.lateMomentum&&
    (preMoveReliability.n<8||preMoveReliability.score>=48||edge>=24)&&
    (!reactionConflict||reactionScore<76&&edge>=28)
  );
  const chaseRisk=Boolean(
    fusedSide!=='WAIT'&&preMove.lateMomentum&&mode!=='REVERSAL'&&
    !(trapSide===fusedSide&&trapScore>=68)
  );
  const compressionConfirmed=Boolean(
    mode!=='COMPRESSION'||
    (
      fusedSide!=='WAIT'&&liveOpposition===0&&tickAligned&&
      liqSide===fusedSide&&
      (motionSide===fusedSide||preMoveAligned||reactionAligned)
    )
  );
  const recoveryOverride=Boolean(
    confirmedColdFailGuard&&fusedSide!=='WAIT'&&
    edge>=82&&dominantEvidence>=78&&liveSupport>=4&&liveOpposition===0&&
    tickAligned&&liqSide===fusedSide&&motionSide===fusedSide&&
    (preMoveAligned||reactionAligned)
  );
  const rawStrong=classicStrong||anticipatoryStrong;
  const legacyStrong=Boolean(
    rawStrong&&!chaseRisk&&!flipSuppressed&&compressionConfirmed&&
    (!confirmedColdFailGuard||recoveryOverride)
  );
  const earlyWatch=Boolean(
    fusedSide!=='WAIT'&&preMoveAligned&&edge>=8&&dominantEvidence>=42&&support>=2&&liveSupport>=2&&liveOpposition<=1
  );
  const lateWatch=Boolean(rawStrong&&chaseRisk);
  const guardedWatch=Boolean(rawStrong&&(!compressionConfirmed||confirmedColdFailGuard)&&fusedSide!=='WAIT');
  const legacyWatch=Boolean(
    fusedSide!=='WAIT'&&!unconfirmedReactionAgainstFlow&&
    ((edge>=6&&dominantEvidence>=46&&support>=2)||earlyWatch||lateWatch||guardedWatch)
  );
  const predator=evaluatePredatorScalp(asset,{
    now:Date.now(),price:p,side:fusedSide,edge,evidence:dominantEvidence,liveSupport,liveOpposition,
    tickSide:tick1.side,tickStage:tick1.stage,tickScore:tick1.score,
    liqSide,liqScore,motionSide,motionStage:String(motion?.stage||'WAIT'),motionScore,
    preSide:preMove.side,preScore:preMove.score,preArmed:preMove.armed,late:chaseRisk||preMove.lateMomentum,
    trapSide,trapScore,mode,accumulationPhase,accumulationReadiness,reactionAligned,accumulationAligned
  });
  const predatorAttack=Boolean(
    predator?.attack&&fusedSide!=='WAIT'&&!flipSuppressed&&!chaseRisk&&
    (legacyStrong||earlyWatch||Number(predator?.score||0)>=84)
  );
  const predatorWatch=Boolean(
    !predatorAttack&&predator?.watch&&fusedSide!=='WAIT'&&
    (legacyWatch||rawStrong||Number(predator?.score||0)>=62)
  );
  const strong=predatorAttack;
  const watch=predatorWatch;
  const action:Side=strong||watch?fusedSide:'WAIT';
  const state=strong?'setup':watch?'watch':predator?.phase==='ABORT'?'abort':'wait';

  const bid=Number(liq?.book?.bestBid),ask=Number(liq?.book?.bestAsk),microprice=Number(liq?.book?.microprice);
  const validBid=Number.isFinite(bid)&&bid>0,validAsk=Number.isFinite(ask)&&ask>0,validMicro=Number.isFinite(microprice)&&microprice>0;
  const spreadUsd=validBid&&validAsk&&ask>bid?ask-bid:(Number.isFinite(p)&&p>0?Math.abs(Number(liq?.book?.spreadBps||0))*p/10000:0);
  const interceptSide:Side=fusedSide!=='WAIT'?fusedSide:rawFusedSide;
  const dir=interceptSide==='BUY'?1:interceptSide==='SELL'?-1:0;
  const launchLine=interceptSide==='BUY'
    ?(validAsk?ask:validMicro?microprice:p)
    :interceptSide==='SELL'
      ?(validBid?bid:validMicro?microprice:p)
      :p;
  const zonePad=Number.isFinite(a)&&a>0?Math.max(spreadUsd*1.6,a*.045):Math.max(spreadUsd*1.6,Number.isFinite(p)&&p>0?p*.000035:0);
  const zoneLow=dir>0?launchLine-zonePad:dir<0?launchLine-zonePad*.22:launchLine;
  const zoneHigh=dir>0?launchLine+zonePad*.22:dir<0?launchLine+zonePad:launchLine;
  const chaseDistance=Number.isFinite(a)&&a>0?a*.10:Math.max(spreadUsd*3,Number.isFinite(p)&&p>0?p*.00008:0);
  const chaseBoundary=dir>0?launchLine+chaseDistance:dir<0?launchLine-chaseDistance:launchLine;
  const inInterceptZone=Boolean(
    dir!==0&&Number.isFinite(p)&&p>0&&Number.isFinite(zoneLow)&&Number.isFinite(zoneHigh)&&p>=zoneLow&&p<=zoneHigh
  );
  const priceRanAway=Boolean(
    dir>0&&Number.isFinite(p)&&p>chaseBoundary||
    dir<0&&Number.isFinite(p)&&p<chaseBoundary
  );
  const intercept={
    side:interceptSide,
    status:dir===0?'NO_EDGE':priceRanAway?'NO_CHASE':inInterceptZone?'READY':'WAIT_ZONE',
    ready:Boolean(dir!==0&&inInterceptZone&&!priceRanAway&&!flipSuppressed),
    launchLine:Number.isFinite(launchLine)?Number(launchLine.toFixed(2)):null,
    zoneLow:Number.isFinite(zoneLow)?Number(zoneLow.toFixed(2)):null,
    zoneHigh:Number.isFinite(zoneHigh)?Number(zoneHigh.toFixed(2)):null,
    chaseBoundary:Number.isFinite(chaseBoundary)?Number(chaseBoundary.toFixed(2)):null,
    etaSeconds:preMove.etaSeconds,
    microprice:validMicro?Number(microprice.toFixed(2)):null,
    bestBid:validBid?Number(bid.toFixed(2)):null,
    bestAsk:validAsk?Number(ask.toFixed(2)):null,
    priceStillCoiled:preMove.priceStillCoiled,
    lateMomentum:preMove.lateMomentum
  };
  const targetSide:Side=fusedSide!=='WAIT'?fusedSide:rawFusedSide;
  const targetZone=reaction.targetFor(targetSide);
  const breakoutLevel=targetSide==='BUY'?Number(accumulation?.breakoutLevel):targetSide==='SELL'?Number(accumulation?.breakdownLevel):NaN;
  const zoneDirectionValid=Boolean(targetZone&&((targetSide==='BUY'&&Number(targetZone.mid)>p)||(targetSide==='SELL'&&Number(targetZone.mid)<p)));
  const zoneDistanceAtr=zoneDirectionValid&&Number.isFinite(a)&&a>0?Math.abs(Number(targetZone.mid)-p)/a:Infinity;
  const zoneTargetValid=Boolean(zoneDirectionValid&&zoneDistanceAtr<=.72);
  const breakoutDistanceAtr=Number.isFinite(breakoutLevel)&&Number.isFinite(a)&&a>0?Math.abs(breakoutLevel-p)/a:Infinity;
  const breakoutTargetValid=Boolean(Number.isFinite(breakoutLevel)&&breakoutDistanceAtr<=.62&&((targetSide==='BUY'&&breakoutLevel>p)||(targetSide==='SELL'&&breakoutLevel<p)));
  const fallbackTarget=Number.isFinite(a)&&a>0&&targetSide!=='WAIT'?p+(targetSide==='BUY'?1:-1)*a*Math.max(.14,Math.min(.48,.16+dominantEvidence/260)):null;
  const approachTarget=zoneDirectionValid&&Number.isFinite(a)&&a>0&&targetSide!=='WAIT'
    ?p+(targetSide==='BUY'?1:-1)*a*.48
    :null;
  const targetPrice=zoneTargetValid?Number(targetZone.mid):breakoutTargetValid?breakoutLevel:(approachTarget??fallbackTarget);
  const target={
    side:targetSide,
    price:targetPrice!=null&&Number.isFinite(Number(targetPrice))?Number(Number(targetPrice).toFixed(2)):null,
    zoneLow:zoneTargetValid?Number(targetZone.low.toFixed(2)):null,
    zoneHigh:zoneTargetValid?Number(targetZone.high.toFixed(2)):null,
    source:zoneTargetValid?'REACTION_ZONE':breakoutTargetValid?'RANGE_BOUNDARY':zoneDirectionValid?'APPROACH_REACTION_ZONE':'DYNAMIC_ATR',
    expectedAtTarget:zoneTargetValid?(Number(targetZone.strength)>=68?(targetZone.side==='SELL'?'REJECT_OR_BREAK':'BOUNCE_OR_BREAK'):'TEST'):'CONTINUATION',
    zoneStrength:zoneTargetValid?Number(targetZone.strength):0,
    contextMode
  };
  let trade:any=null;
  if(strong&&intercept.ready&&Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>0){
    const dir=fusedSide==='BUY'?1:-1;
    const risk=a*(mode==='BREAKOUT'||mode==='MOMENTUM'?.48:mode==='REVERSAL'?.42:.45);
    const rr=mode==='BREAKOUT'?1.35:mode==='MOMENTUM'?1.30:mode==='REVERSAL'?1.20:1.24;
    const contextualTp=Number(target?.price);
    const fallbackTp=p+dir*risk*rr;
    const tp=Number.isFinite(contextualTp)&&((dir>0&&contextualTp>p)||(dir<0&&contextualTp<p))?contextualTp:fallbackTp;
    trade={mode:'predator-scalp-v7-'+String(predator?.pattern||contextMode).toLowerCase(),side:fusedSide==='BUY'?'buy':'sell',entry:p,sl:p-dir*risk,tp,rr:Number((Math.abs(tp-p)/Math.max(1e-9,risk)).toFixed(2)),score:confidence,validForSeconds:anticipatoryStrong?20:32,time:Date.now()};
  }

  const outLong=Math.round(cap(buyEvidence+Math.max(0,buyShare-50)*.16,0,92));
  const outShort=Math.round(cap(sellEvidence+Math.max(0,sellShare-50)*.16,0,92));
  const changed=techSide!=='WAIT'&&fusedSide!=='WAIT'&&techSide!==fusedSide;

  return {
    ...raw,
    state,action,
    title:action==='BUY'?'PREDATOR SCALP V7 · BUY':action==='SELL'?'PREDATOR SCALP V7 · SELL':'PREDATOR SCALP V7 · WAIT',
    reason:action==='WAIT'
      ?`Predator V7 · ${String(predator?.phase||'HUNT')} · ${String(predator?.pattern||'NO_EDGE')} · لا هجوم الآن${chaseRisk?' · NO CHASE':''}${reactionConflict?' · REACTION BLOCK':''}${flipSuppressed?' · FLIP FILTER':''}.`
      :`Predator V7 · ${String(predator?.phase||'AMBUSH')} · ${String(predator?.pattern||contextMode)} · ${fusedSide} · score ${Number(predator?.score||0)} · edge ${edge.toFixed(1)} · stable ${Number(predator?.stableCount||0)}${reactionAligned?' · REACTION':''}${accumulationAligned?' · ACCUMULATION':''}${preMoveAligned?' · PRE-MOVE':''}${changed?' · microstructure غيّر الميل الفني':''}.`,
    score:{long:outLong,short:outShort,threshold:58},
    confidence,
    trade,
    early:state==='watch'||anticipatoryStrong,
    preMove,
    intercept,
    target,
    reaction:{active:reaction.active,inside:Boolean(reaction.inside),side:reactionSide,strength:reactionScore,confirmed:reactionConfirmed,candidate:reactionCandidate,fastSupport:reactionFastSupport,fastOpposition:reactionFastOpposition,nearest:reaction.nearest||null,contextMode},
    fusionV7:{
      side:fusedSide,rawSide:rawFusedSide,confidence,strong,watch,rawStrong,legacyStrong,legacyWatch,predator,
      classicStrong,anticipatoryStrong,earlyWatch,lateWatch,chaseRisk,flipSuppressed,commitment,
      contextMode,reactionAligned,reactionConflict,reactionConfirmed,reactionCandidate,reactionFastSupport,reactionFastOpposition,
      accumulationAligned,accumulationPhase,accumulationReadiness,target,intercept,
      reliability:{active:activeReliability,confirmed:confirmedReliability,premove:preMoveReliability,reliabilityPenalty},
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,tickSide:tick1.side,accumulationSide,reactionSide,
      techL2Conflict,livePair,fastPair,preMoveAligned,tickAligned,mlConflict,mode,
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    },
    fusionV6:{
      side:fusedSide,rawSide:rawFusedSide,confidence,strong,rawStrong,classicStrong,anticipatoryStrong,watch,earlyWatch,lateWatch,chaseRisk,flipSuppressed,commitment,
      contextMode,reactionAligned,reactionConflict,reactionConfirmed,reactionCandidate,reactionFastSupport,reactionFastOpposition,unconfirmedReactionAgainstFlow,accumulationAligned,accumulationPhase,accumulationReadiness,target,confirmedColdFailGuard,confirmedHits,confirmedFails,confirmedDirectional,compressionConfirmed,recoveryOverride,
      intercept,
      reliability:{active:activeReliability,confirmed:confirmedReliability,premove:preMoveReliability,reliabilityPenalty},
      ignitionEtaSeconds:preMove.etaSeconds,
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,tickSide:tick1.side,accumulationSide,reactionSide,
      techL2Conflict,livePair,fastPair,preMoveAligned,tickAligned,mlConflict,mode,
      oos:{status:scalpWfStatus,n:scalpOosN,accuracy:Number.isFinite(scalpOosAcc)?scalpOosAcc:null,drift:scalpDrift,precisionGuard:scalpPrecisionGuard,severeDrift:scalpSevereDrift,strongEdge,strongEvidence},
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    },
    fusionV5:{
      side:fusedSide,rawSide:rawFusedSide,confidence,strong,rawStrong,classicStrong,anticipatoryStrong,watch,earlyWatch,lateWatch,chaseRisk,flipSuppressed,commitment,
      contextMode,reactionAligned,reactionConflict,accumulationAligned,accumulationPhase,accumulationReadiness,target,
      intercept,
      reliability:{active:activeReliability,confirmed:confirmedReliability,premove:preMoveReliability,reliabilityPenalty},
      ignitionEtaSeconds:preMove.etaSeconds,
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,tickSide:tick1.side,
      techL2Conflict,livePair,fastPair,preMoveAligned,tickAligned,mlConflict,mode,
      oos:{status:scalpWfStatus,n:scalpOosN,accuracy:Number.isFinite(scalpOosAcc)?scalpOosAcc:null,drift:scalpDrift,precisionGuard:scalpPrecisionGuard,severeDrift:scalpSevereDrift,strongEdge,strongEvidence},
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    },
    // Compatibility aliases while downstream layers migrate to v5.
    fusionV4:{
      side:fusedSide,rawSide:rawFusedSide,confidence,strong,rawStrong,classicStrong,anticipatoryStrong,watch,earlyWatch,lateWatch,chaseRisk,flipSuppressed,commitment,
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,tickSide:tick1.side,
      techL2Conflict,livePair,fastPair,preMoveAligned,tickAligned,mlConflict,mode,
      reliability:{active:activeReliability,confirmed:confirmedReliability,premove:preMoveReliability,reliabilityPenalty},
      ignitionEtaSeconds:preMove.etaSeconds,
      oos:{status:scalpWfStatus,n:scalpOosN,accuracy:Number.isFinite(scalpOosAcc)?scalpOosAcc:null,drift:scalpDrift,precisionGuard:scalpPrecisionGuard,severeDrift:scalpSevereDrift,strongEdge,strongEvidence},
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    },
    // Keep v3 key as a compatibility alias for the forecast/master layers while they migrate.
    fusionV3:{
      side:fusedSide,confidence,strong,watch,
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,tickSide:tick1.side,
      techL2Conflict,livePair,fastPair,preMoveAligned,anticipatoryStrong,mode,
      oos:{status:scalpWfStatus,n:scalpOosN,accuracy:Number.isFinite(scalpOosAcc)?scalpOosAcc:null,drift:scalpDrift,precisionGuard:scalpPrecisionGuard,severeDrift:scalpSevereDrift,strongEdge,strongEvidence},
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    }
  };
}
