import {commitDirection} from './direction-commitment';

type Side='BUY'|'SELL'|'WAIT';
type ForecastSample={at:number;side:Side;score:number};
type Horizon={side:Side;buy:number;sell:number;strength:number;gap:number};

const memory=new Map<string,ForecastSample[]>();
const cap=(n:number,min=0,max=92)=>Math.max(min,Math.min(max,n));
const sideScore=(s:Side,target:Side,v:number)=>s===target?v:0;
const sideOf=(buy:number,sell:number,gate=5):Side=>buy-sell>=gate?'BUY':sell-buy>=gate?'SELL':'WAIT';
const horizon=(buy:number,sell:number,gate=5):Horizon=>({side:sideOf(buy,sell,gate),buy:Math.round(buy),sell:Math.round(sell),strength:Math.round(cap(Math.max(buy,sell))),gap:Math.round(Math.abs(buy-sell))});

function pathOf(two:Side,five:Side,fifteen:Side){
  const short=two!=='WAIT'?two:five,long=fifteen!=='WAIT'?fifteen:five;
  if(short==='BUY'&&long==='SELL')return 'RISE_THEN_DROP';
  if(short==='SELL'&&long==='BUY')return 'DROP_THEN_RISE';
  if(short==='BUY'&&(five==='BUY'||long==='BUY'))return 'CONTINUATION_UP';
  if(short==='SELL'&&(five==='SELL'||long==='SELL'))return 'CONTINUATION_DOWN';
  return 'RANGE_OR_FAKEOUT';
}
function buildMovementStations(args:{price:number;atr:number;now:number;first:number|null;second:number|null;third:number|null;two:any;five:any;fifteen:any;accumulation:any;primary:Side;follow:Side}){
  const zones=Array.isArray(args.accumulation?.reactionZones)?args.accumulation.reactionZones:[];
  const horizonDefs=[
    {key:'P1',raw:args.first,horizon:args.two,minutes:Math.max(.5,Number(args.two?.firstHitMinutes||0)||2),fallbackSide:args.primary},
    {key:'P2',raw:args.second,horizon:args.five,minutes:5,fallbackSide:args.follow},
    {key:'P3',raw:args.third,horizon:args.fifteen,minutes:15,fallbackSide:args.fifteen?.side||args.follow}
  ];
  return horizonDefs.map((h,index)=>{
    const raw=Number(h.raw),hasRaw=Number.isFinite(raw)&&raw>0;
    const candidate=hasRaw?zones
      .map((z:any)=>({...z,d:Math.abs(Number(z.mid)-raw)/Math.max(1e-9,args.atr)}))
      .filter((z:any)=>Number.isFinite(z.d)&&z.d<=.8)
      .sort((a:any,b:any)=>a.d-b.d||Number(b.strength)-Number(a.strength))[0]:null;
    const zone=candidate||null;
    const price=zone?Number(zone.mid):hasRaw?raw:null;
    const low=zone?Number(zone.low):price==null?null:price-args.atr*.12;
    const high=zone?Number(zone.high):price==null?null:price+args.atr*.12;
    const incoming:Side=price==null?'WAIT':price>=args.price?'BUY':'SELL';
    const reactionSide:Side=zone?(zone.side as Side):(h.horizon?.side||h.fallbackSide||'WAIT');
    const zoneKind=zone?(zone.side==='BUY'?'DEMAND_ACCUMULATION':'SUPPLY_DISTRIBUTION'):'PROJECTED_LEVEL';
    const bounceExpected=Boolean(zone&&Number(zone.strength)>=58);
    const actionAfter:Side=bounceExpected?reactionSide:(h.horizon?.side||reactionSide);
    const interaction=bounceExpected?(zone.side==='BUY'?'BOUNCE_UP':'REJECT_DOWN'):(actionAfter===incoming?'BREAK_CONTINUE':'PAUSE_OR_REVERSAL');
    const baseConf=Math.max(Number(h.horizon?.strength||0),Number(h.horizon?.confidence||0));
    const zoneBoost=zone?Math.min(14,Number(zone.strength||0)*.14):0;
    const confidence=Math.round(cap(baseConf*.82+zoneBoost,0,88));
    const etaMinutes=Math.max(.5,Number(h.minutes||0));
    return {
      index:index+1,key:h.key,price:price==null?null:Number(price.toFixed(2)),
      zoneLow:low==null?null:Number(low.toFixed(2)),zoneHigh:high==null?null:Number(high.toFixed(2)),
      zoneType:zoneKind,zoneStrength:zone?Number(zone.strength||0):0,
      touches:zone?Number(zone.touches||0):0,rejections:zone?Number(zone.rejections||0):0,
      incomingSide:incoming,expectedReaction:interaction,actionAfter,confidence,
      etaMinutes:Number(etaMinutes.toFixed(1)),etaAt:args.now+Math.round(etaMinutes*60000),
      accumulationExpected:Boolean(zone&&zone.side==='BUY'),distributionExpected:Boolean(zone&&zone.side==='SELL'),
      source:zone?'REACTION_ZONE_FUSION':'HORIZON_PROJECTION',
      reason:zone?String(zone.reason||'منطقة تفاعل تاريخية قوية'):'مستوى متوقع من محرك الحركة ولا توجد منطقة تاريخية قريبة بما يكفي.'
    };
  });
}
function pathAr(p:string){
  if(p==='RISE_THEN_DROP')return 'صعود قصير ثم هبوط';
  if(p==='DROP_THEN_RISE')return 'هبوط قصير ثم صعود';
  if(p==='CONTINUATION_UP')return 'استمرار صاعد';
  if(p==='CONTINUATION_DOWN')return 'استمرار هابط';
  return 'تذبذب / كسر كاذب محتمل';
}

export function buildHuntForecast(asset:string,decision:any,scalp:any,price:number|null,atr:number|null,now=Date.now(),wave:any=null,learner:any=null,structure:any=null,accumulation:any=null,learning:any=null,evolution:any=null,stateGraph:any=null,expectedLearning:any=null,movementIntel:any=null){
  const p=Number(price),a=Number(atr);
  const fusionBuy=Number(decision?.fusion?.buy||0),fusionSell=Number(decision?.fusion?.sell||0);
  const matrix=decision?.indicatorMatrix?.rows||{},m1=matrix?.m1||{},m5=matrix?.m5||{},m15=matrix?.m15||{};
  const m1Side:Side=m1?.bias||'WAIT',m5Side:Side=m5?.bias||'WAIT',m15Side:Side=m15?.bias||'WAIT';
  const m1Strength=Number(m1?.strength||0),m5Strength=Number(m5?.strength||0),m15Strength=Number(m15?.strength||0);
  const motionSide:Side=decision?.motion?.side||'WAIT',behaviorSide:Side=decision?.behavior?.side||'WAIT',liqSide:Side=decision?.liquidity?.side||'WAIT',hunterSide:Side=decision?.hunter?.side||'WAIT';
  const motionScore=Number(decision?.motion?.score||0),behaviorScore=Number(decision?.behavior?.score||0),liqStrength=Number(decision?.liquidity?.strength||0),hunterScore=Number(decision?.hunter?.score||0);
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0);

  const accumulationFresh=Boolean(accumulation?.ok&&accumulation?.side);
  const accumulationSide:Side=accumulationFresh?(accumulation?.side||'WAIT'):'WAIT';
  const accumulationScore=accumulationFresh?Number(accumulationSide==='BUY'?accumulation?.accumulationScore:accumulation?.distributionScore):0;
  const accumulationReadiness=accumulationFresh?Number(accumulation?.breakoutReadiness||0):0;
  const structureFresh=Boolean(structure?.ok&&structure?.side);
  const structureM1Side:Side=structureFresh?(structure?.m1?.nextSide||'WAIT'):'WAIT',structureM5Side:Side=structureFresh?(structure?.m5?.nextSide||structure?.followSide||'WAIT'):'WAIT';
  const structureM1Score=structureFresh?Number(structure?.m1?.nextScore||0):0,structureM5Score=structureFresh?Number(structure?.m5?.nextScore||0):0;
  const waveFresh=Boolean(wave?.ok&&['BUY','SELL'].includes(String(wave?.side))&&Number(wave?.score)>=30&&now-Number(wave?.at||0)<=3000);
  const waveSide:Side=waveFresh?(wave.side as Side):'WAIT',waveScore=waveFresh?Number(wave?.score||0):0,waveConfidence=Number(wave?.confidence||0);
  const learnerFresh=Boolean(learner?.ok&&learner?.gate?.passed&&['BUY','SELL'].includes(String(learner?.side))&&Number(learner?.oosAccuracy)>=56&&Number(learner?.oosEdgeAtr)>=.06&&Number(learner?.profitFactor)>=1.20);
  const learnerSide:Side=learnerFresh?(learner.side as Side):'WAIT',learnerScore=learnerFresh?Number(learner?.confidence||0):0;
  const ep=evolution?.active||null,ew=(name:string)=>Number(ep?.weights?.[name]||1);
  const minLearningConfidence=Number(ep?.thresholds?.minLearningConfidence||48),minLearningSamples=Number(ep?.thresholds?.minLearningSamples||10),structurePathConfidence=Number(ep?.thresholds?.structurePathConfidence||48),strongMoveReadiness=Number(ep?.thresholds?.strongMoveReadiness||60),modelConflictPenalty=Number(ep?.thresholds?.modelConflictPenalty||8);
  const selfReliability=Number(learning?.selfCalibration?.reliability||50);
  const learningFresh=Boolean(learning?.ok&&['BUY','SELL'].includes(String(learning?.side))&&Number(learning?.confidence)>=minLearningConfidence&&Number(learning?.effectiveSamples)>=minLearningSamples&&selfReliability>=40);
  const learningSide:Side=learningFresh?(learning.side as Side):'WAIT',learningScore=learningFresh?Number(learning?.confidence||0)*ew('learning'):0;
  const lw=(name:string)=>((learningFresh?Number(learning?.learnedWeights?.[name]||1):1)*ew(name));
  const graphSide:Side=stateGraph?.nextSide||'WAIT',graphScore=Number(stateGraph?.nextSideProbability||0)*ew('stateGraph');
  const em2=expectedLearning?.twoMinute||{},em5=expectedLearning?.fiveMinute||{},em15=expectedLearning?.fifteenMinute||{};
  const em2Side:Side=em2?.side||'WAIT',em5Side:Side=em5?.side||'WAIT',em15Side:Side=em15?.side||'WAIT';
  const emQuality=(x:any)=>Math.max(.55,Math.min(1,Number(x?.decisiveRate||60)/100));
  const em2Score=Number(em2?.confidence||0)*Math.max(.75,Number(em2?.calibration||50)/50)*emQuality(em2),em5Score=Number(em5?.confidence||0)*Math.max(.75,Number(em5?.calibration||50)/50)*emQuality(em5),em15Score=Number(em15?.confidence||0)*Math.max(.75,Number(em15?.calibration||50)/50)*emQuality(em15);
  const adjMotion=motionScore*lw('motion'),adjBehavior=behaviorScore*lw('behavior'),adjLiquidity=liqStrength*lw('liquidity'),adjScalpLong=scalpLong*lw('scalp'),adjScalpShort=scalpShort*lw('scalp'),adjStructureM1=structureM1Score*lw('structure'),adjStructureM5=structureM5Score*lw('structure'),adjAccum=accumulationScore*lw('accumulation'),adjM1=m1Strength*lw('m1'),adjM5=m5Strength*lw('m5'),adjM15=m15Strength;

  const evolvedWaveScore=waveScore*ew('wave');
  const twoBuy=adjM1*(m1Side==='BUY'?.16:0)+adjScalpLong*.09+sideScore(waveSide,'BUY',evolvedWaveScore)*.10+sideScore(motionSide,'BUY',adjMotion)*.10+sideScore(liqSide,'BUY',adjLiquidity)*.07+sideScore(structureM1Side,'BUY',adjStructureM1)*.10+sideScore(accumulationSide,'BUY',adjAccum)*.06+sideScore(learning?.horizon1?.side,'BUY',Number(learning?.horizon1?.confidence||0))*.07+sideScore(em2Side,'BUY',em2Score)*.25;
  const twoSell=adjM1*(m1Side==='SELL'?.16:0)+adjScalpShort*.09+sideScore(waveSide,'SELL',evolvedWaveScore)*.10+sideScore(motionSide,'SELL',adjMotion)*.10+sideScore(liqSide,'SELL',adjLiquidity)*.07+sideScore(structureM1Side,'SELL',adjStructureM1)*.10+sideScore(accumulationSide,'SELL',adjAccum)*.06+sideScore(learning?.horizon1?.side,'SELL',Number(learning?.horizon1?.confidence||0))*.07+sideScore(em2Side,'SELL',em2Score)*.25;
  let two=horizon(twoBuy,twoSell,6);

  const fiveBuy=adjM5*(m5Side==='BUY'?.14:0)+fusionBuy*.08+sideScore(behaviorSide,'BUY',adjBehavior)*.08+sideScore(hunterSide,'BUY',hunterScore)*.05+sideScore(learnerSide,'BUY',learnerScore)*.07+sideScore(structureM5Side,'BUY',adjStructureM5)*.10+sideScore(accumulationSide,'BUY',adjAccum)*.07+sideScore(learning?.horizon5?.side,'BUY',Number(learning?.horizon5?.confidence||0))*.09+sideScore(graphSide,'BUY',graphScore)*.05+sideScore(em5Side,'BUY',em5Score)*.27;
  const fiveSell=adjM5*(m5Side==='SELL'?.14:0)+fusionSell*.08+sideScore(behaviorSide,'SELL',adjBehavior)*.08+sideScore(hunterSide,'SELL',hunterScore)*.05+sideScore(learnerSide,'SELL',learnerScore)*.07+sideScore(structureM5Side,'SELL',adjStructureM5)*.10+sideScore(accumulationSide,'SELL',adjAccum)*.07+sideScore(learning?.horizon5?.side,'SELL',Number(learning?.horizon5?.confidence||0))*.09+sideScore(graphSide,'SELL',graphScore)*.05+sideScore(em5Side,'SELL',em5Score)*.27;
  let five=horizon(fiveBuy,fiveSell,6);

  const fifteenBuy=adjM15*(m15Side==='BUY'?.18:0)+adjM5*(m5Side==='BUY'?.06:0)+fusionBuy*.07+sideScore(behaviorSide,'BUY',adjBehavior)*.09+sideScore(structureM5Side,'BUY',adjStructureM5)*.06+sideScore(accumulationSide,'BUY',adjAccum)*.04+sideScore(learning?.horizon5?.side,'BUY',Number(learning?.horizon5?.confidence||0))*.05+sideScore(graphSide,'BUY',graphScore)*.10+sideScore(em15Side,'BUY',em15Score)*.35;
  const fifteenSell=adjM15*(m15Side==='SELL'?.18:0)+adjM5*(m5Side==='SELL'?.06:0)+fusionSell*.07+sideScore(behaviorSide,'SELL',adjBehavior)*.09+sideScore(structureM5Side,'SELL',adjStructureM5)*.06+sideScore(accumulationSide,'SELL',adjAccum)*.04+sideScore(learning?.horizon5?.side,'SELL',Number(learning?.horizon5?.confidence||0))*.05+sideScore(graphSide,'SELL',graphScore)*.10+sideScore(em15Side,'SELL',em15Score)*.35;
  let fifteen=horizon(fifteenBuy,fifteenSell,7);

  if(movementIntel?.ok){
    const adopt=(base:Horizon,mi:any,min=36):Horizon=>{
      const s:Side=mi?.side||'WAIT',conf=Number(mi?.confidence||0);
      if(s==='WAIT'||conf<min)return base;
      return {side:s,buy:Number(mi?.buyShare||base.buy),sell:Number(mi?.sellShare||base.sell),strength:Math.round(Math.max(base.strength,conf)),gap:Math.round(Math.max(base.gap,Math.abs(Number(mi?.buyShare||50)-Number(mi?.sellShare||50))))};
    };
    two=adopt(two,movementIntel?.horizons?.twoMinute,34);
    five=adopt(five,movementIntel?.horizons?.fiveMinute,38);
    fifteen=adopt(fifteen,movementIntel?.horizons?.fifteenMinute,40);
  }

  let buy=fusionBuy*.05+sideScore(motionSide,'BUY',adjMotion)*.05+sideScore(behaviorSide,'BUY',adjBehavior)*.04+sideScore(liqSide,'BUY',adjLiquidity)*.05+sideScore(hunterSide,'BUY',hunterScore)*.03+adjScalpLong*.03+sideScore(waveSide,'BUY',evolvedWaveScore)*.05+sideScore(learnerSide,'BUY',learnerScore)*.04+sideScore(two.side,'BUY',two.strength)*.14+sideScore(five.side,'BUY',five.strength)*.17+sideScore(fifteen.side,'BUY',fifteen.strength)*.16+sideScore(structureM1Side,'BUY',adjStructureM1)*.04+sideScore(structureM5Side,'BUY',adjStructureM5)*.04+sideScore(accumulationSide,'BUY',adjAccum)*.06+sideScore(learningSide,'BUY',learningScore)*.07+sideScore(graphSide,'BUY',graphScore)*.08;
  let sell=fusionSell*.05+sideScore(motionSide,'SELL',adjMotion)*.05+sideScore(behaviorSide,'SELL',adjBehavior)*.04+sideScore(liqSide,'SELL',adjLiquidity)*.05+sideScore(hunterSide,'SELL',hunterScore)*.03+adjScalpShort*.03+sideScore(waveSide,'SELL',evolvedWaveScore)*.05+sideScore(learnerSide,'SELL',learnerScore)*.04+sideScore(two.side,'SELL',two.strength)*.14+sideScore(five.side,'SELL',five.strength)*.17+sideScore(fifteen.side,'SELL',fifteen.strength)*.16+sideScore(structureM1Side,'SELL',adjStructureM1)*.04+sideScore(structureM5Side,'SELL',adjStructureM5)*.04+sideScore(accumulationSide,'SELL',adjAccum)*.06+sideScore(learningSide,'SELL',learningScore)*.07+sideScore(graphSide,'SELL',graphScore)*.08;

  const trapSide:Side=decision?.liquidity?.absorption?.trapDetected?decision?.liquidity?.absorption?.side||'WAIT':'WAIT';
  const trapScore=Number(decision?.liquidity?.absorption?.score||0);
  if(trapSide==='BUY'){buy+=Math.min(12,trapScore*.12);sell*=.84;}
  if(trapSide==='SELL'){sell+=Math.min(12,trapScore*.12);buy*=.84;}

  const behaviorExp=Number(decision?.behavior?.expectedMoveAtr||0);
  if(behaviorExp>=.35)buy+=Math.min(7,Math.abs(behaviorExp)*4);
  if(behaviorExp<=-.35)sell+=Math.min(7,Math.abs(behaviorExp)*4);

  const firstMoveMemoryValid=Boolean(expectedLearning?.ok&&['BUY','SELL'].includes(String(em2Side))&&Number(em2?.samples||0)>=6&&Number(em2?.confidence||0)>=38&&Number(em2?.decisiveRate||0)>=40);
  const movementSide:Side=movementIntel?.side||'WAIT',movementLean:Side=movementIntel?.leanSide||'WAIT',movementConfidence=Number(movementIntel?.confidence||0);
  const movementUsable=Boolean(movementIntel?.ok&&movementSide!=='WAIT'&&movementConfidence>=34);
  const primaryMoveSide:Side=movementUsable?movementSide:firstMoveMemoryValid?em2Side:(two.side!=='WAIT'?two.side:movementLean);
  const primaryMoveConfidence=Math.round(cap(movementUsable?movementConfidence:firstMoveMemoryValid?(Number(em2?.confidence||0)*.65+Number(em2?.decisiveRate||0)*.35):two.strength,0,88));
  const rawGap=Math.abs(buy-sell),rawSide:Side=sideOf(buy,sell,3),rawScore=cap(Math.max(buy,sell));
  const old=(memory.get(asset)||[]).filter(x=>now-x.at<=45000);
  old.push({at:now,side:rawSide,score:rawScore});
  const recent=old.slice(-10);memory.set(asset,recent);
  const buySamples=recent.filter(x=>x.side==='BUY').length,sellSamples=recent.filter(x=>x.side==='SELL').length;
  const persistence=recent.length?Math.round(Math.max(buySamples,sellSamples)/recent.length*100):0;
  const commitment=commitDirection('hunt:'+asset,buy,sell,now,waveFresh?{side:waveSide,stage:wave?.stage,score:waveScore,confidence:waveConfidence}:null);
  const stableSide:Side=commitment.side as Side;

  const contradiction=recent.some(x=>x.side==='BUY')&&recent.some(x=>x.side==='SELL');
  const conflictPenalty=decision?.master?.conflict?10:0,flipPenalty=contradiction?Math.max(0,16-persistence*.10):0,hysteresisPenalty=commitment.heldByHysteresis?7:0;
  const forecastAnchorSide:Side=primaryMoveSide!=='WAIT'?primaryMoveSide:stableSide;
  const horizonConsensus=[two.side,five.side,fifteen.side].filter(s=>s!=='WAIT'&&s===forecastAnchorSide).length;
  const horizonConflict=[two.side,five.side,fifteen.side].filter(s=>s!=='WAIT'&&forecastAnchorSide!=='WAIT'&&s!==forecastAnchorSide).length;
  const primaryMoveConflict=Boolean(primaryMoveSide!=='WAIT'&&stableSide!=='WAIT'&&primaryMoveSide!==stableSide);
  const confidence=cap(rawScore*.43+Math.min(100,rawGap*2.4)*.14+persistence*.12+commitment.strength*.12+horizonConsensus*7-horizonConflict*6+(waveFresh&&waveSide===stableSide?5:0)-conflictPenalty-flipPenalty-hysteresisPenalty,0,88);

  const motionStage=String(decision?.motion?.stage||'WAIT'),compression=Number(decision?.motion?.components?.compression||0),velocity=Math.abs(Number(decision?.motion?.components?.liveVelocityBps||0)),precursorCount=Number(decision?.motion?.diagnostics?.precursorCount||0);
  let state='STALKING';
  if(accumulationFresh&&accumulation?.phase==='MARKUP_READY'&&accumulationSide==='BUY'&&stableSide==='BUY'&&accumulationReadiness>=60)state='MARKUP_READY';
  else if(accumulationFresh&&accumulation?.phase==='MARKDOWN_READY'&&accumulationSide==='SELL'&&stableSide==='SELL'&&accumulationReadiness>=60)state='MARKDOWN_READY';
  else if(waveFresh&&waveSide===stableSide&&wave?.stage==='IGNITION')state='IGNITION';
  else if(waveFresh&&waveSide===stableSide&&wave?.stage==='WAVE_FORMING')state='WAVE_FORMING';
  else if(motionStage==='REVERSAL_ALERT'||trapSide===stableSide&&trapScore>=68)state='REVERSAL_HUNT';
  else if(motionStage==='PRE_MOVE'||precursorCount>=3)state='PRE_MOVE';
  else if((waveFresh&&wave?.stage==='COILED')||compression>=60)state='COILED';
  if(primaryMoveConflict)state='NEXT_MOVE_CONFLICT';

  const structurePathConsistent=Boolean(structure?.shortSide==='WAIT'||two.side==='WAIT'||structure?.shortSide===two.side)&&Boolean(structure?.followSide==='WAIT'||fifteen.side==='WAIT'||structure?.followSide===fifteen.side);
  const structuralPath=structureFresh&&Number(structure?.confidence||0)>=structurePathConfidence&&structurePathConsistent&&structure?.path&&structure.path!=='UNKNOWN'?String(structure.path):null;
  const path=structuralPath||pathOf(primaryMoveSide,five.side,fifteen.side),pathLabel=pathAr(path);
  let expAtr=Math.abs(behaviorExp);
  if(!Number.isFinite(expAtr)||expAtr<.2)expAtr=.42;
  expAtr=Math.min(1.7,Math.max(.28,expAtr));
  if(state==='IGNITION')expAtr=Math.min(1.9,expAtr*1.18);
  if(state==='WAVE_FORMING')expAtr=Math.max(.5,expAtr);
  if(state==='COILED')expAtr=Math.max(.58,expAtr);

  const horizonSeconds=900;
  const validPrice=Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>0;
  const projectionSide:Side=primaryMoveSide!=='WAIT'?primaryMoveSide:stableSide;
  const dir=projectionSide==='BUY'?1:projectionSide==='SELL'?-1:0;
  const triggerAtr=state==='MARKUP_READY'||state==='MARKDOWN_READY'?.06:state==='IGNITION'?.07:state==='WAVE_FORMING'?.09:.12;
  const invalidAtr=state==='MARKUP_READY'||state==='MARKDOWN_READY'?.30:state==='IGNITION'?.24:state==='WAVE_FORMING'?.28:.34;
  const trigger=validPrice&&dir?p+dir*a*triggerAtr:null;
  const projected=validPrice&&dir?p+dir*a*expAtr:null;
  const invalidation=validPrice&&dir?p-dir*a*invalidAtr:null;

  const shortSide:Side=structuralPath?(structure?.shortSide||primaryMoveSide):primaryMoveSide,followSide:Side=structuralPath?(structure?.followSide||fifteen.side):fifteen.side;
  const shortDir=shortSide==='BUY'?1:shortSide==='SELL'?-1:0,followDir=followSide==='BUY'?1:followSide==='SELL'?-1:0;
  const firstLeg=validPrice&&shortDir?p+shortDir*a*Math.min(.72,Math.max(.24,two.strength/145)):null;
  const secondLeg=validPrice&&followDir?p+followDir*a*Math.min(1.65,Math.max(.55,fifteen.strength/72)):null;

  const em15Samples=Number(em15?.samples||0),em15Confidence=Number(em15?.confidence||0),em15Calibration=Number(em15?.calibration||50);
  const em15CloseAtr=Number(em15?.meanCloseAtr||0);
  const ensemble15Side:Side=fifteen.side!=='WAIT'?fifteen.side:em15Side;
  const ensemble15Dir=ensemble15Side==='BUY'?1:ensemble15Side==='SELL'?-1:0;
  const fallback15Atr=ensemble15Dir*(.28+Math.min(1.05,Number(fifteen.strength||0)/80));
  const memory15Usable=em15Samples>=6&&Math.abs(em15CloseAtr)>=.08;
  let target15Atr=memory15Usable?em15CloseAtr*.72+fallback15Atr*.28:fallback15Atr;
  target15Atr=Math.max(-2.4,Math.min(2.4,target15Atr));
  const target15Side:Side=target15Atr>=.08?'BUY':target15Atr<=-.08?'SELL':'WAIT';
  const target15Confidence=Math.round(cap(
    memory15Usable
      ? em15Confidence*.48+em15Calibration*.22+Number(fifteen.strength||0)*.20+Math.min(10,em15Samples/3)
      : Number(fifteen.strength||0)*.62+Number(em15?.decisiveRate||0)*.18+18,
    0,86
  ));
  const miTarget=movementIntel?.target15||null;
  const target15Price=miTarget?.price!=null?Number(miTarget.price):(validPrice&&target15Side!=='WAIT'?p+a*target15Atr:null);
  const target15BandAtr=.24+(100-target15Confidence)/100*.42;
  const target15Low=miTarget?.low!=null?Number(miTarget.low):(target15Price==null?null:target15Price-a*target15BandAtr);
  const target15High=miTarget?.high!=null?Number(miTarget.high):(target15Price==null?null:target15Price+a*target15BandAtr);
  const resolved15Confidence=miTarget?.confidence!=null?Number(miTarget.confidence):target15Confidence;
  const resolved15Side:Side=miTarget?.side||target15Side;
  const resolved15MoveAtr=miTarget?.moveAtr!=null?Number(miTarget.moveAtr):target15Atr;
  const target15MovePct=target15Price!=null&&p>0?(target15Price-p)/p*100:0;

  const movementStations=validPrice?buildMovementStations({
    price:p,atr:a,now,first:firstLeg,second:secondLeg,third:target15Price,
    two:{...two,firstHitMinutes:Number(em2?.firstHitMinutes||0)},five,fifteen,
    accumulation,primary:shortSide,follow:followSide
  }):[];

  const alternativeSide:Side=projectionSide==='BUY'?'SELL':projectionSide==='SELL'?'BUY':'WAIT';
  const alternativeStrength=projectionSide==='BUY'?Math.round(cap(sell)):projectionSide==='SELL'?Math.round(cap(buy)):Math.round(Math.min(buy,sell));
  const accumulationBonus=accumulationFresh&&accumulationSide===stableSide?Math.min(12,accumulationReadiness*.12):0;
  const learnedConflict=learningFresh&&learningSide!==stableSide?modelConflictPenalty:0;
  const expectedCal=Math.round((Number(em2?.calibration||50)+Number(em5?.calibration||50)+Number(em15?.calibration||50))/3);
  const expectedConflict=Boolean(expectedLearning?.conflict);
  const movementConflict=Boolean(movementIntel?.conflict);
  const firstMoveBonus=firstMoveMemoryValid?Math.min(14,primaryMoveConfidence*.12+Number(em2?.decisiveRate||0)*.05):0;
  const movementBonus=movementIntel?.ok?Math.min(12,Number(movementIntel?.agreement||0)*.06+movementConfidence*.06):0;
  const quality=cap(confidence*.28+persistence*.08+Math.min(100,(horizonConsensus/3)*100)*.13+expectedCal*.10+primaryMoveConfidence*.18+movementBonus+firstMoveBonus+(learnerFresh?4:0)+accumulationBonus-horizonConflict*6-learnedConflict-(expectedConflict?8:0)-(movementConflict?8:0)-(primaryMoveConflict?10:0),0,90);

  const reasons:string[]=[];
  if(movementIntel?.ok)reasons.push('Movement Brain '+String(movementIntel.regime)+' · '+(movementIntel.side==='WAIT'?('lean '+movementIntel.leanSide):movementIntel.side)+' · '+movementConfidence);
  if(primaryMoveSide!=='WAIT')reasons.push('First-Move '+primaryMoveSide+' · confidence '+primaryMoveConfidence+' · first-hit '+Number(em2?.firstHitMinutes||0)+'m');
  if(primaryMoveConflict)reasons.push('الاتجاه المثبت '+stableSide+' متأخر/متعارض مع الحركة الأولى '+primaryMoveSide);
  else if(stableSide!=='WAIT')reasons.push('الاتجاه المثبت '+stableSide+' · edge '+commitment.smoothedEdge);
  reasons.push('الحركة المتوقعة: '+pathLabel);
  if(horizonConsensus>=2)reasons.push(horizonConsensus+'/3 توقعات 2/5/15 متوافقة');
  if(expectedLearning?.ok)reasons.push('Expected-Move Memory: 2m '+em2Side+' / 5m '+em5Side+' / 15m '+em15Side+' · cal '+expectedCal);
  if(expectedConflict)reasons.push('تعارض داخل ذاكرة الحركة المتوقعة؛ تم تخفيض الجودة');
  if(accumulationFresh)reasons.push('Accumulation Map: '+accumulation.phase+' · '+accumulationSide+' · readiness '+accumulationReadiness);
  if(learningFresh)reasons.push('Market Learning: '+learningSide+' · confidence '+Math.round(learningScore)+' · samples '+Number(learning?.effectiveSamples||0)+' · self '+selfReliability);
  if(evolution?.ok)reasons.push('Self-Evolution g'+Number(evolution?.generation||0)+' · '+String(evolution?.reason||'monitoring'));
  if(accumulationFresh&&accumulation?.liquidityConfirmed)reasons.push('السيولة تؤكد منطقة التجميع/التوزيع');
  if(accumulationFresh&&accumulation?.absorptionConfirmed)reasons.push('الامتصاص يؤكد التجميع قبل الكسر');
  if(structureFresh&&structure?.m1)reasons.push('Wave Structure M1: '+structure.m1.phase+' · '+structure.m1.structure+' · next '+structure.m1.nextSide);
  if(structureFresh&&structure?.m5)reasons.push('Wave Structure M5: '+structure.m5.phase+' · '+structure.m5.structure+' · next '+structure.m5.nextSide);
  if(horizonConflict>=1)reasons.push('يوجد تعارض بين توقع 2 / 5 / 15 دقيقة');
  if(waveFresh&&waveSide===stableSide)reasons.push('Wave Lead متوافق قبل الحركة');
  if(motionSide===stableSide&&motionScore>=50)reasons.push('Motion متوافق');
  if(liqSide===stableSide&&liqStrength>=55)reasons.push('السيولة متوافقة');
  if(behaviorSide===followSide&&behaviorScore>=45)reasons.push('Behavior يدعم الجزء التالي من المسار');
  if(learnerFresh&&learnerSide===stableSide)reasons.push('Scalp Learner Holdout متوافق');
  if(trapSide===stableSide&&trapScore>=60)reasons.push('Absorption/Trap يدعم الانعكاس');

  return {
    side:stableSide,state,score:rawScore,confidence,quality,persistence,samples:recent.length,
    nextMove:{side:primaryMoveSide,confidence:primaryMoveConfidence,source:firstMoveMemoryValid?'FIRST_PASSAGE_MEMORY':'LIVE_2M_ENSEMBLE',firstHitMinutes:Number(em2?.firstHitMinutes||0),decisiveRate:Number(em2?.decisiveRate||0),conflictWithLockedDirection:primaryMoveConflict},
    buyScore:Math.round(buy),sellScore:Math.round(sell),horizonSeconds,expectedMoveAtr:Number(expAtr.toFixed(2)),
    trigger:trigger==null?null:Number(trigger.toFixed(2)),projected:projected==null?null:Number(projected.toFixed(2)),invalidation:invalidation==null?null:Number(invalidation.toFixed(2)),currentPrice:Number.isFinite(p)?p:null,
    path:{code:path,label:pathLabel,firstLeg:firstLeg==null?null:Number(firstLeg.toFixed(2)),secondLeg:secondLeg==null?null:Number(secondLeg.toFixed(2)),shortSide,followSide,structureDriven:Boolean(structuralPath),stations:movementStations},
    fifteenMinuteTarget:{side:resolved15Side,price:target15Price==null?null:Number(target15Price.toFixed(2)),low:target15Low==null?null:Number(target15Low.toFixed(2)),high:target15High==null?null:Number(target15High.toFixed(2)),confidence:resolved15Confidence,moveAtr:Number(resolved15MoveAtr.toFixed(3)),movePct:Number(target15MovePct.toFixed(3)),samples:em15Samples,source:miTarget?.source||(memory15Usable?'15M_MEMORY_BLEND':'15M_LIVE_ENSEMBLE'),targetAt:now+15*60000},
    movementStations,
    horizons:{twoMinute:two,fiveMinute:five,fifteenMinute:fifteen},
    forecastWindowsMinutes:[2,5,15],
    waveStructure:structureFresh?structure:null,
    accumulationMap:accumulationFresh?accumulation:null,
    learningBrain:learning?.ok?learning:null,
    expectedMoveLearning:expectedLearning?.ok?expectedLearning:null,
    movementIntelligence:movementIntel?.ok?movementIntel:null,
    expectedMoveCore:{primary:true,windows:[2,5,15],consensus:horizonConsensus,conflict:horizonConflict>0||expectedConflict||primaryMoveConflict,averageCalibration:expectedCal,target:'FIRST_PASSAGE',firstMoveSide:primaryMoveSide,firstMoveConfidence:primaryMoveConfidence},
    strongMove:accumulationFresh&&accumulation?.strongMoveSide!=='WAIT'&&Number(accumulation?.breakoutReadiness||0)>=strongMoveReadiness&&(primaryMoveSide==='WAIT'||accumulation.strongMoveSide===primaryMoveSide)?{side:accumulation.strongMoveSide,score:Number(accumulation.strongMoveScore||0),readiness:Number(accumulation.breakoutReadiness||0),phase:accumulation.phase,breakoutLevel:accumulation.breakoutLevel,breakdownLevel:accumulation.breakdownLevel,liquidityConfirmed:Boolean(accumulation.liquidityConfirmed),absorptionConfirmed:Boolean(accumulation.absorptionConfirmed)}:null,
    selfEvolution:evolution?.ok?{generation:evolution.generation,active:evolution.active,promoted:evolution.promoted,rolledBack:evolution.rolledBack,reason:evolution.reason}:null,
    alternative:{side:alternativeSide,strength:alternativeStrength,condition:alternativeSide==='WAIT'?'لا يوجد بديل واضح':`يتفعل إذا فشل Trigger أو كُسر Invalidation ويتحول الالتزام إلى ${alternativeSide}`},
    reasons:reasons.slice(0,8),commitment,
    waveLeadUsed:waveFresh?{side:waveSide,stage:wave?.stage,score:waveScore,confidence:waveConfidence,at:Number(wave?.at||0)}:null,
    scalpLearnerUsed:learnerFresh?{side:learnerSide,confidence:learnerScore,oosAccuracy:Number(learner?.oosAccuracy||0),oosEdgeAtr:Number(learner?.oosEdgeAtr||0),profitFactor:Number(learner?.profitFactor||0),holdSeconds:Number(learner?.exitPlan?.maxHoldSeconds||0)}:null,
    note:'الحركة الأولى تُدرَّب على First-Passage، بينما سعر 15 دقيقة يقدّر مستوى نهاية النافذة من ذاكرة 15m + ATR + قوة الاتجاه؛ هو نطاق احتمالي وليس سعرًا مضمونًا.'
  };
}
