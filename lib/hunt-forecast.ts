import {commitDirection} from './direction-commitment';

type Side='BUY'|'SELL'|'WAIT';
type ForecastSample={at:number;side:Side;score:number};
type Horizon={side:Side;buy:number;sell:number;strength:number;gap:number};

const memory=new Map<string,ForecastSample[]>();
type ZoneCommit={forecast:any;side:Side;at:number;lastConfirmedAt:number;price:number;atr:number;flipsBlocked:number};
const zoneCommitMemory=new Map<string,ZoneCommit>();
type PathCommit={
  path:any;side:'BUY'|'SELL';at:number;lastConfirmedAt:number;anchor:number;atr:number;
  pendingSide:Side;pendingSince:number;pendingCount:number;
};
const pathCommitMemory=new Map<string,PathCommit>();
type LiveFailureGuard={side:Side;anchor:number;atr:number;at:number;blockedUntil:number;failures:number};
const liveFailureGuards=new Map<string,LiveFailureGuard>();
const cap=(n:number,min=0,max=92)=>Math.max(min,Math.min(max,n));
const sideScore=(s:Side,target:Side,v:number)=>s===target?v:0;
const sideOf=(buy:number,sell:number,gate=5):Side=>buy-sell>=gate?'BUY':sell-buy>=gate?'SELL':'WAIT';
const horizon=(buy:number,sell:number,gate=5):Horizon=>({side:sideOf(buy,sell,gate),buy:Math.round(buy),sell:Math.round(sell),strength:Math.round(cap(Math.max(buy,sell))),gap:Math.round(Math.abs(buy-sell))});

function pathOf(two:Side,five:Side,fifteen:Side){
  const short=two!=='WAIT'?two:five,long=fifteen!=='WAIT'?fifteen:five;
  if(short==='SELL'&&five==='BUY'&&long==='SELL')return 'DROP_BOUNCE_DROP';
  if(short==='BUY'&&five==='SELL'&&long==='BUY')return 'RISE_REJECT_RISE';
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
function buildZoneForecast(args:{
  price:number;atr:number;side:Side;confidence:number;accumulation:any;
  m1Side?:Side;m1Strength?:number;m5Side?:Side;m5Strength?:number;
  mlSide?:Side;mlStrength?:number;learnedSide?:Side;learnedStrength?:number;
  graphSide?:Side;graphStrength?:number;precisionGuard?:boolean
}){
  const p=Number(args.price),a=Number(args.atr),acc=args.accumulation||{};
  if(!Number.isFinite(p)||p<=0||!Number.isFinite(a)||a<=0)return null;
  const raw=Array.isArray(acc?.reactionZones)?acc.reactionZones:[];
  const zones=raw
    .map((z:any)=>({
      side:(z?.side==='BUY'?'BUY':z?.side==='SELL'?'SELL':'WAIT') as Side,
      low:Number(z?.low),high:Number(z?.high),mid:Number(z?.mid),
      strength:Number(z?.strength||0),touches:Number(z?.touches||0),rejections:Number(z?.rejections||0),
      volumeScore:Number(z?.volumeScore||0),impulseScore:Number(z?.impulseScore||0),
      distanceAtr:Number(z?.distanceAtr),
      reason:String(z?.reason||'')
    }))
    .filter((z:any)=>z.side!=='WAIT'&&Number.isFinite(z.low)&&Number.isFinite(z.high)&&Number.isFinite(z.mid)&&z.strength>=42);

  const distance=(z:any)=>p>=z.low&&p<=z.high?0:Math.min(Math.abs(p-z.low),Math.abs(p-z.high))/a;
  const below=(z:any)=>z.side==='BUY'&&z.mid<p+a*.12;
  const above=(z:any)=>z.side==='SELL'&&z.mid>p-a*.12;
  const rank=(arr:any[])=>arr.slice().sort((x,y)=>distance(x)-distance(y)||Number(y.strength)-Number(x.strength));
  const demand=rank(zones.filter(below))[0]||null;
  const supply=rank(zones.filter(above))[0]||null;
  const inside=rank(zones.filter((z:any)=>p>=z.low&&p<=z.high))[0]||null;

  const m1:Side=args.m1Side||'WAIT',m5:Side=args.m5Side||'WAIT';
  const m1Strength=Number(args.m1Strength||0),m5Strength=Number(args.m5Strength||0);
  const mlSide:Side=args.mlSide||'WAIT',learnedSide:Side=args.learnedSide||'WAIT',graphSide:Side=args.graphSide||'WAIT';
  const mlStrength=Number(args.mlStrength||0),learnedStrength=Number(args.learnedStrength||0),graphStrength=Number(args.graphStrength||0);
  const precisionGuard=Boolean(args.precisionGuard);
  const proposed:Side=args.side||'WAIT';
  const proposedVotes=[m1,m5].filter(s=>s!=='WAIT'&&s===proposed).length;
  const proposedOpposition=[m1,m5].filter(s=>s!=='WAIT'&&proposed!=='WAIT'&&s!==proposed).length;
  const horizonsConflict=Boolean(m1!=='WAIT'&&m5!=='WAIT'&&m1!==m5);

  const nearDemand=Boolean(demand&&distance(demand)<=.62);
  const nearSupply=Boolean(supply&&distance(supply)<=.62);
  const insideDemand=Boolean(inside?.side==='BUY');
  const insideSupply=Boolean(inside?.side==='SELL');
  const demandTrigger=Boolean(
    (insideDemand&&Number(inside?.strength||0)>=58)||
    (nearDemand&&Number(demand?.strength||0)>=60)
  );
  const supplyTrigger=Boolean(
    (insideSupply&&Number(inside?.strength||0)>=58)||
    (nearSupply&&Number(supply?.strength||0)>=60)
  );

  const accSide:Side=acc?.strongMoveSide==='BUY'?'BUY':acc?.strongMoveSide==='SELL'?'SELL':'WAIT';
  const readiness=Number(acc?.breakoutReadiness||0);
  const breakoutReady=Boolean(
    accSide!=='WAIT'&&readiness>=62&&
    (Boolean(acc?.liquidityConfirmed)||Boolean(acc?.absorptionConfirmed)||readiness>=72)
  );

  let side:Side='WAIT',triggerReason='NO_STRUCTURAL_TRIGGER';
  const horizonSupport=(s:Side)=>[m1,m5].filter(x=>x===s).length;
  const horizonAgainst=(s:Side)=>[m1,m5].filter(x=>x!=='WAIT'&&x!==s).length;
  const strongHorizon=(s:Side)=>(
    (m1===s&&m1Strength>=48)||
    (m5===s&&m5Strength>=52)||
    horizonSupport(s)>=2
  );

  if(demandTrigger&&(!supplyTrigger||Number(demand?.strength||inside?.strength||0)>=Number(supply?.strength||inside?.strength||0)+6)){
    const zoneStrength=Number((insideDemand?inside:demand)?.strength||0);
    if(strongHorizon('BUY')||zoneStrength>=72&&horizonAgainst('BUY')===0){
      side='BUY';triggerReason=insideDemand?'INSIDE_DEMAND_REBOUND':'NEAR_DEMAND_REBOUND';
    }
  }
  if(side==='WAIT'&&supplyTrigger&&(!demandTrigger||Number(supply?.strength||inside?.strength||0)>=Number(demand?.strength||inside?.strength||0)+6)){
    const zoneStrength=Number((insideSupply?inside:supply)?.strength||0);
    if(strongHorizon('SELL')||zoneStrength>=72&&horizonAgainst('SELL')===0){
      side='SELL';triggerReason=insideSupply?'INSIDE_SUPPLY_REJECTION':'NEAR_SUPPLY_REJECTION';
    }
  }
  if(side==='WAIT'&&breakoutReady){
    const align=strongHorizon(accSide)||(
      proposed===accSide&&Number(args.confidence||0)>=52&&proposedOpposition===0
    );
    if(align){
      side=accSide;triggerReason=accSide==='BUY'?'ACCUMULATION_BREAKOUT':'DISTRIBUTION_BREAKDOWN';
    }
  }

  // A model direction by itself is not enough. It can only confirm an existing structural trigger.
  if(side!=='WAIT'&&proposed!=='WAIT'&&proposed!==side&&Number(args.confidence||0)>=58&&proposedVotes>=1){
    side='WAIT';triggerReason='MODEL_ZONE_CONFLICT';
  }
  if(side!=='WAIT'&&horizonsConflict&&horizonSupport(side)===0){
    side='WAIT';triggerReason='M1_M5_CONFLICT';
  }

  const zoneObj=(z:any,kind:string)=>z?{
    side:z.side,low:Number(z.low.toFixed(2)),high:Number(z.high.toFixed(2)),mid:Number(z.mid.toFixed(2)),
    strength:Math.round(z.strength),touches:z.touches,rejections:z.rejections,
    distanceAtr:Number(distance(z).toFixed(2)),kind,
    liquidityScore:Math.round(Math.max(z.volumeScore||0,z.impulseScore||0)),
    reason:z.reason
  }:null;

  const support=zoneObj(demand,'DEMAND_SUPPORT');
  const resistance=zoneObj(supply,'SUPPLY_RESISTANCE');
  const originRaw=side==='BUY'?(insideDemand?inside:demand):side==='SELL'?(insideSupply?inside:supply):inside;
  const origin=zoneObj(originRaw,side==='BUY'?'REBOUND_DEMAND':side==='SELL'?'REJECTION_SUPPLY':'REACTION_ZONE');

  let targetRaw:any=null,targetKind='';
  if(side==='BUY'){
    targetRaw=zones.filter((z:any)=>z.side==='SELL'&&z.low>p+a*.10).sort((x:any,y:any)=>x.low-y.low||y.strength-x.strength)[0]||null;
    targetKind='SUPPLY_LIQUIDITY';
  }else if(side==='SELL'){
    targetRaw=zones.filter((z:any)=>z.side==='BUY'&&z.high<p-a*.10).sort((x:any,y:any)=>y.high-x.high||y.strength-x.strength)[0]||null;
    targetKind='DEMAND_LIQUIDITY';
  }
  let target=zoneObj(targetRaw,targetKind);

  if(!target&&side!=='WAIT'&&breakoutReady&&accSide===side){
    const level=side==='BUY'?Number(acc?.breakoutLevel):Number(acc?.breakdownLevel);
    const valid=Number.isFinite(level)&&level>0&&((side==='BUY'&&level>p+a*.10)||(side==='SELL'&&level<p-a*.10));
    if(valid){
      const pad=Math.max(a*.08,p*.00008);
      target={
        side:side==='BUY'?'SELL':'BUY',
        low:Number((level-pad).toFixed(2)),high:Number((level+pad).toFixed(2)),mid:Number(level.toFixed(2)),
        strength:Math.round(cap(readiness*.72+Number(acc?.strongMoveScore||0)*.28,0,88)),
        touches:0,rejections:0,distanceAtr:Number((Math.abs(level-p)/a).toFixed(2)),
        kind:side==='BUY'?'BREAKOUT_LIQUIDITY_ABOVE':'BREAKDOWN_LIQUIDITY_BELOW',
        liquidityScore:Number(acc?.liquidityConfirmed)?75:45,
        reason:side==='BUY'?'حد مقاومة/سيولة أعلى نطاق التجميع':'حد دعم/سيولة أسفل نطاق التوزيع'
      };
    }
  }

  const phase=String(acc?.phase||'NEUTRAL');
  const phaseText=phase==='ACCUMULATING'?'تجميع':phase==='DISTRIBUTING'?'تصريف':phase==='MARKUP_READY'?'تجميع جاهز للكسر الصاعد':phase==='MARKDOWN_READY'?'تصريف جاهز للكسر الهابط':'توازن';

  // Structural path forecast is separate from trade readiness: it answers "where is price most likely heading?"
  const zoneMagnetScore=(z:any)=>{
    const d=Math.max(0,distance(z));
    const liq=Math.max(Number(z?.volumeScore||0),Number(z?.impulseScore||0));
    const structural=Math.max(0,Number(z?.strength||0))*.40+Math.max(0,liq)*.24+
      Math.min(16,Number(z?.rejections||0)*3.6+Number(z?.touches||0)*1.25);
    // Prefer meaningful structural travel. Tiny nearby zones are treated as sweep candidates,
    // while extremely far zones are penalized for reachability.
    const travel=d<.22?-9:d<.38?2:d<=1.25?18-Math.abs(d-.78)*10:d<=1.85?12-(d-1.25)*12:Math.max(-10,5-(d-1.85)*14);
    return structural+travel;
  };
  const upperCandidates=zones
    .filter((z:any)=>z.side==='SELL'&&z.low>p+a*.06&&distance(z)<=2.6)
    .map((z:any)=>({...z,_d:distance(z),_magnet:zoneMagnetScore(z)}))
    .sort((x:any,y:any)=>Number(y._magnet)-Number(x._magnet)||Number(x._d)-Number(y._d));
  const lowerCandidates=zones
    .filter((z:any)=>z.side==='BUY'&&z.high<p-a*.06&&distance(z)<=2.6)
    .map((z:any)=>({...z,_d:distance(z),_magnet:zoneMagnetScore(z)}))
    .sort((x:any,y:any)=>Number(y._magnet)-Number(x._magnet)||Number(x._d)-Number(y._d));
  const nearestUpper=upperCandidates.slice().sort((x:any,y:any)=>Number(x._d)-Number(y._d))[0]||null;
  const nearestLower=lowerCandidates.slice().sort((x:any,y:any)=>Number(x._d)-Number(y._d))[0]||null;
  const chooseStructural=(arr:any[])=>{
    const top=arr[0]||null;
    if(!top)return null;
    if(Number(top._d)>=.38)return top;
    const farther=arr.find((z:any)=>Number(z._d)>=.38&&Number(z._d)<=2.2&&Number(z._magnet)>=Number(top._magnet)-14);
    if(farther)return farther;
    // A tiny pool is a sweep candidate, not a structural destination.
    return null;
  };
  const upperRaw=chooseStructural(upperCandidates);
  const lowerRaw=chooseStructural(lowerCandidates);
  const upperLiquidity=zoneObj(upperRaw,'UPPER_LIQUIDITY_SUPPLY');
  const lowerLiquidity=zoneObj(lowerRaw,'LOWER_LIQUIDITY_DEMAND');
  const upperSweep=nearestUpper&&Number(nearestUpper._d)<=.35
    ?zoneObj(nearestUpper,'UPPER_MICRO_SWEEP')
    :null;
  const lowerSweep=nearestLower&&Number(nearestLower._d)<=.35
    ?zoneObj(nearestLower,'LOWER_MICRO_SWEEP')
    :null;

  const syntheticLevel=(level:number,kind:string,zoneSide:Side)=> {
    if(!Number.isFinite(level)||level<=0)return null;
    const pad=Math.max(a*.08,p*.00008);
    return {
      side:zoneSide,
      low:Number((level-pad).toFixed(2)),
      high:Number((level+pad).toFixed(2)),
      mid:Number(level.toFixed(2)),
      strength:Math.round(cap(readiness*.72+Number(acc?.strongMoveScore||0)*.28,0,88)),
      touches:0,rejections:0,
      distanceAtr:Number((Math.abs(level-p)/a).toFixed(2)),
      kind,
      liquidityScore:Number(acc?.liquidityConfirmed)?75:45,
      reason:kind.includes('UPPER')?'سيولة أعلى النطاق/منطقة كسر محتملة':'سيولة أسفل النطاق/منطقة كسر محتملة'
    };
  };
  const upperBoundary=Number(acc?.breakoutLevel),lowerBoundary=Number(acc?.breakdownLevel);
  const upperFallback=!upperLiquidity&&Number.isFinite(upperBoundary)&&upperBoundary>p
    ?syntheticLevel(upperBoundary,readiness>=60?'UPPER_BREAKOUT_LIQUIDITY':'UPPER_RANGE_LIQUIDITY','SELL')
    :null;
  const lowerFallback=!lowerLiquidity&&Number.isFinite(lowerBoundary)&&lowerBoundary<p
    ?syntheticLevel(lowerBoundary,readiness>=60?'LOWER_BREAKDOWN_LIQUIDITY':'LOWER_RANGE_LIQUIDITY','BUY')
    :null;
  const upperDestination=upperLiquidity||upperFallback;
  const lowerDestination=lowerLiquidity||lowerFallback;

  // Liquidity-first path model: the destination and reaction structure choose the route.
  // Fast indicators can confirm or weaken that route, but they are not allowed to invent it.
  const attraction=(z:any)=>{
    if(!z)return 0;
    const d=Math.max(0,Number(z.distanceAtr||0));
    const strength=Math.max(0,Number(z.strength||0));
    const liq=Math.max(0,Number(z.liquidityScore||0));
    const touches=Math.max(0,Number(z.touches||0));
    const rejections=Math.max(0,Number(z.rejections||0));
    const proximity=Math.max(0,34-Math.min(34,d*12));
    const history=Math.min(14,touches*1.5+rejections*3);
    const syntheticPenalty=String(z.kind||'').includes('RANGE_LIQUIDITY')?4:0;
    return cap(strength*.34+liq*.20+proximity+history-syntheticPenalty,0,86);
  };
  const directionalUpper=upperDestination||(resistance&&Number(resistance.mid)>p?resistance:null);
  const directionalLower=lowerDestination||(support&&Number(support.mid)<p?support:null);
  const upperAttraction=attraction(directionalUpper);
  const lowerAttraction=attraction(directionalLower);
  const liquidityGap=Math.abs(upperAttraction-lowerAttraction);
  const liquiditySide:Side=upperAttraction-lowerAttraction>=9?'BUY':lowerAttraction-upperAttraction>=9?'SELL':'WAIT';

  let upScore=upperAttraction*1.18,downScore=lowerAttraction*1.18;
  const vote=(s:Side,pts:number)=>{if(s==='BUY')upScore+=Math.max(0,pts);else if(s==='SELL')downScore+=Math.max(0,pts);};

  // Structural context has meaningful weight.
  if(phase==='ACCUMULATING')upScore+=8;
  if(phase==='MARKUP_READY')upScore+=16;
  if(phase==='DISTRIBUTING')downScore+=8;
  if(phase==='MARKDOWN_READY')downScore+=16;
  if(demandTrigger)upScore+=insideDemand?14:10;
  if(supplyTrigger)downScore+=insideSupply?14:10;
  vote(accSide,readiness*.18);
  if(Boolean(acc?.absorptionConfirmed))vote(accSide,8);

  // Confirmation layer only. These inputs cannot create a path without a liquidity destination.
  vote(m1,m1Strength*.12);
  vote(m5,m5Strength*.15);
  vote(proposed,Number(args.confidence||0)*.08);
  if(mlStrength>=52)vote(mlSide,mlStrength*(precisionGuard?.04:.07));
  if(learnedStrength>=52)vote(learnedSide,learnedStrength*.07);
  if(graphStrength>=54)vote(graphSide,graphStrength*.06);

  if(!directionalUpper)upScore*=.28;
  if(!directionalLower)downScore*=.28;

  const pathDiff=upScore-downScore;
  const structuralGap=Math.abs(pathDiff);
  const prior=14;
  const probabilityTotal=Math.max(1,upScore+downScore+prior*2);
  let upProbability=(upScore+prior)/probabilityTotal*100;
  let downProbability=(downScore+prior)/probabilityTotal*100;
  if(horizonsConflict){upProbability=50+(upProbability-50)*.90;downProbability=100-upProbability;}
  if(precisionGuard){upProbability=50+(upProbability-50)*.92;downProbability=100-upProbability;}

  const dominantSide:Side=upProbability>=downProbability?'BUY':'SELL';
  const dominantProbability=Math.max(upProbability,downProbability);
  const dominantDestination=dominantSide==='BUY'?directionalUpper:directionalLower;
  let pathSide:Side='WAIT';

  // A directional forecast now needs an actual liquidity/structure destination.
  // 52/48 is no longer a forecast; it is treated as balance.
  if(liquiditySide!=='WAIT'){
    const liqDestination=liquiditySide==='BUY'?directionalUpper:directionalLower;
    const liqProbability=liquiditySide==='BUY'?upProbability:downProbability;
    if(liqDestination&&(liqProbability>=55||liquidityGap>=16)&&structuralGap>=7)pathSide=liquiditySide;
  }
  if(pathSide==='WAIT'&&dominantDestination&&dominantProbability>=61&&structuralGap>=12){
    pathSide=dominantSide;
  }
  if(pathSide==='WAIT'&&accSide!=='WAIT'&&readiness>=68){
    const accDestination=accSide==='BUY'?directionalUpper:directionalLower;
    const accProbability=accSide==='BUY'?upProbability:downProbability;
    if(accDestination&&accProbability>=58)pathSide=accSide;
  }

  const pathDestination=pathSide==='BUY'?directionalUpper:pathSide==='SELL'?directionalLower:null;
  const alternateSide:Side=pathSide==='BUY'?'SELL':pathSide==='SELL'?'BUY':'WAIT';
  const alternateDestination=alternateSide==='BUY'?directionalUpper:alternateSide==='SELL'?directionalLower:null;
  const pathRebound=pathSide==='BUY'?support:pathSide==='SELL'?resistance:null;
  const invalidateZone=pathSide==='BUY'?(support||directionalLower):pathSide==='SELL'?(resistance||directionalUpper):null;
  const invalidationPad=Math.max(a*.12,p*.00012);
  const invalidationPrice=pathSide==='BUY'
    ?(invalidateZone?Number((Number(invalidateZone.low)-invalidationPad).toFixed(2)):Number((p-a*.58).toFixed(2)))
    :pathSide==='SELL'
      ?(invalidateZone?Number((Number(invalidateZone.high)+invalidationPad).toFixed(2)):Number((p+a*.58).toFixed(2)))
      :null;
  const primaryProbability=pathSide==='BUY'?upProbability:pathSide==='SELL'?downProbability:50;
  const alternateProbability=pathSide==='BUY'?downProbability:pathSide==='SELL'?upProbability:50;
  const destinationQuality=Number(pathDestination?.strength||0);
  const evidenceFamilies=[
    m1!=='WAIT'?m1:null,m5!=='WAIT'?m5:null,proposed!=='WAIT'?proposed:null,
    accSide!=='WAIT'?accSide:null,mlStrength>=52?mlSide:null,learnedStrength>=52?learnedSide:null,graphStrength>=54?graphSide:null
  ].filter(Boolean);
  const familySupport=pathSide==='WAIT'?0:evidenceFamilies.filter(x=>x===pathSide).length;
  const familyOpposition=pathSide==='WAIT'?0:evidenceFamilies.filter(x=>x!==pathSide).length;
  const probabilityGap=Math.abs(upProbability-downProbability);
  const uncertainty=Math.round(cap(100-probabilityGap,12,100));
  const conviction:'STRONG'|'MODERATE'|'WEAK'=pathSide!=='WAIT'&&primaryProbability>=67&&probabilityGap>=22&&liquidityGap>=12
    ?'STRONG'
    :pathSide!=='WAIT'&&primaryProbability>=58&&probabilityGap>=12
      ?'MODERATE'
      :'WEAK';
  const uncertaintyPenalty=Math.max(0,(uncertainty-55)*.13);
  const pathConfidence=pathSide==='WAIT'
    ?Math.round(cap(38-probabilityGap*.25,18,42))
    :Math.round(cap(
      primaryProbability+destinationQuality*.06+Math.min(8,liquidityGap*.18)+familySupport*.8-familyOpposition*1.2+
      (pathSide===accSide?2:0)-uncertaintyPenalty,
      38,86
    ));

  // Price Destination layer: when the liquidity map is not strong enough to lock a structural
  // path, still expose a qualified directional price area instead of returning direction only.
  // Structural liquidity remains the preferred destination; ATR projection is clearly labelled.
  const leanSide:Side=pathSide!=='WAIT'
    ?pathSide
    :dominantProbability>=54&&structuralGap>=5
      ?dominantSide
      :m1!=='WAIT'&&m1===m5&&Math.max(m1Strength,m5Strength)>=46
        ?m1
        :proposed!=='WAIT'&&Number(args.confidence||0)>=56&&proposedOpposition===0
          ?proposed
          :'WAIT';
  const leanStrength=Math.max(
    leanSide===m1?m1Strength:0,
    leanSide===m5?m5Strength:0,
    leanSide===proposed?Number(args.confidence||0):0,
    leanSide===mlSide?mlStrength:0,
    leanSide===learnedSide?learnedStrength:0,
    leanSide===graphSide?graphStrength:0,
    leanSide===accSide?readiness:0
  );
  const projectedPriceZone=(s:Side)=>{
    if(s==='WAIT')return null;
    const d=s==='BUY'?1:-1;
    const travelAtr=Math.max(.32,Math.min(1.35,
      .34+leanStrength/120+Math.max(0,dominantProbability-50)/80+readiness/500
    ));
    const center=p+d*a*travelAtr;
    const halfBand=a*Math.max(.10,Math.min(.24,.10+(100-Math.min(100,leanStrength))/650));
    return {
      side:s==='BUY'?'SELL':'BUY',
      low:Number((center-halfBand).toFixed(2)),
      high:Number((center+halfBand).toFixed(2)),
      mid:Number(center.toFixed(2)),
      strength:Math.round(cap(leanStrength*.68+dominantProbability*.22+readiness*.10,34,82)),
      touches:0,rejections:0,
      distanceAtr:Number(travelAtr.toFixed(2)),
      kind:s==='BUY'?'PROJECTED_UPPER_PRICE_ZONE':'PROJECTED_LOWER_PRICE_ZONE',
      liquidityScore:0,
      reason:'منطقة سعرية متوقعة من ATR وتوافق M1/M5؛ ليست تجمع سيولة مؤكداً'
    };
  };
  const projectedDestination=pathDestination?null:projectedPriceZone(leanSide);
  const effectivePriceZone=pathDestination||projectedDestination;
  const destinationSource=pathDestination?'STRUCTURAL_LIQUIDITY':'ATR_HORIZON_PROJECTION';
  const destinationConfidence=leanSide==='WAIT'||!effectivePriceZone
    ?0
    :pathDestination
      ?pathConfidence
      :Math.round(cap(
        dominantProbability*.54+leanStrength*.30+
        (m1!=='WAIT'&&m1===m5&&m1===leanSide?8:0)+(leanSide===proposed?4:0)-
        (horizonsConflict?6:0),
        36,78
      ));
  const destinationMid=Number(effectivePriceZone?.mid);
  const priceDestination=leanSide==='WAIT'||!effectivePriceZone||!Number.isFinite(destinationMid)
    ?null
    :{
      side:leanSide,
      zone:effectivePriceZone,
      confidence:destinationConfidence,
      source:destinationSource,
      projected:!pathDestination,
      distancePrice:Number(Math.abs(destinationMid-p).toFixed(2)),
      distancePct:Number((Math.abs(destinationMid-p)/p*100).toFixed(3)),
      distanceAtr:Number((Math.abs(destinationMid-p)/a).toFixed(2))
    };

  const oppositeSweep=pathSide==='BUY'?lowerSweep:pathSide==='SELL'?upperSweep:null;
  const sameSideSweep=pathSide==='BUY'?upperSweep:pathSide==='SELL'?lowerSweep:null;
  const sweepFirst=Boolean(
    oppositeSweep&&Number(oppositeSweep.distanceAtr||99)<=.30&&
    pathDestination&&Number(pathDestination.distanceAtr||0)>=.38
  );
  const sequence=sweepFirst
    ?{
      type:'SWEEP_THEN_REVERSE',
      firstLeg:{side:pathSide==='BUY'?'SELL':'BUY',zone:oppositeSweep},
      secondLeg:{side:pathSide,zone:pathDestination},
      reason:'سيولة قريبة عكس المسار قد تُسحب أولًا قبل التوجه للمغناطيس الهيكلي الأقوى'
    }
    :sameSideSweep&&pathDestination
      ?{
        type:'SWEEP_THEN_CONTINUE',
        firstLeg:{side:pathSide,zone:sameSideSweep},
        secondLeg:{side:pathSide,zone:pathDestination},
        reason:'سيولة قريبة على نفس المسار مرشحة للسحب قبل استكمال الحركة للوجهة الهيكلية'
      }
      :{
        type:pathSide==='WAIT'?'BALANCED':'DIRECT',
        firstLeg:pathSide==='WAIT'?null:{side:pathSide,zone:pathDestination},
        secondLeg:null,
        reason:pathSide==='WAIT'?'لا يوجد تسلسل سيولة واضح':'المسار مباشر نحو أقوى مغناطيس سيولة'
      };
  const pathReason=[
    pathSide==='BUY'
      ?'مغناطيس السيولة الهيكلي الأقوى أعلى السعر'
      :pathSide==='SELL'
        ?'مغناطيس السيولة الهيكلي الأقوى أسفل السعر'
        :leanSide==='BUY'
          ?'الميل السعري الأقوى لأعلى حتى تتأكد السيولة الهيكلية'
          :leanSide==='SELL'
            ?'الميل السعري الأقوى لأسفل حتى تتأكد السيولة الهيكلية'
            :'السيولة متقاربة؛ لا يوجد اتجاه مهيمن',
    sweepFirst&&oppositeSweep?('احتمال سحب سيولة أولًا '+fmtZone(oppositeSweep.low,oppositeSweep.high)):'',
    effectivePriceZone?((pathDestination?'الوجهة الهيكلية ':'المنطقة السعرية المتوقعة ')+fmtZone(effectivePriceZone.low,effectivePriceZone.high)):'',
    pathRebound?('منطقة رد الفعل '+fmtZone(pathRebound.low,pathRebound.high)):'',
    ('جذب أعلى '+upperAttraction.toFixed(0)+' / أسفل '+lowerAttraction.toFixed(0)),
    invalidationPrice?('إبطال المسار قرب '+invalidationPrice.toFixed(2)):''
  ].filter(Boolean).join(' · ');
  const pathForecast={
    version:'FORECAST_AI_V6_PRICE_DESTINATION',
    side:pathSide,
    leanSide,
    confidence:pathConfidence,
    conviction,
    clarity:Math.max(0,100-uncertainty),
    rawProbability:Number(primaryProbability.toFixed(1)),
    probabilities:{up:Number(upProbability.toFixed(1)),down:Number(downProbability.toFixed(1)),uncertainty},
    destination:pathDestination,
    priceDestination,
    reboundZone:pathRebound,
    upperLiquidity:directionalUpper,
    lowerLiquidity:directionalLower,
    sweepZones:{upper:upperSweep,lower:lowerSweep},
    sequence,
    alternate:{
      side:alternateSide,
      probability:Number(alternateProbability.toFixed(1)),
      destination:alternateDestination
    },
    invalidation:{
      price:invalidationPrice,
      zone:invalidateZone,
      reason:pathSide==='BUY'?'كسر الدعم/الطلب يلغي المسار الصاعد':pathSide==='SELL'?'اختراق المقاومة/العرض يلغي المسار الهابط':'لا يوجد مسار مهيمن'
    },
    evidence:{
      familySupport,familyOpposition,
      m1:{side:m1,strength:m1Strength},m5:{side:m5,strength:m5Strength},
      ml:{side:mlSide,strength:mlStrength,used:mlStrength>=48},
      learned:{side:learnedSide,strength:learnedStrength,used:learnedStrength>=48},
      graph:{side:graphSide,strength:graphStrength,used:graphStrength>=50},
      accumulation:{side:accSide,readiness},
      liquidity:{driver:'LIQUIDITY_FIRST',side:liquiditySide,upperAttraction:Number(upperAttraction.toFixed(1)),lowerAttraction:Number(lowerAttraction.toFixed(1)),gap:Number(liquidityGap.toFixed(1)),structuralGap:Number(structuralGap.toFixed(1))},
      precisionGuard
    },
    upScore:Number(upScore.toFixed(1)),
    downScore:Number(downScore.toFixed(1)),
    phase,
    reason:pathReason,
    scenario:pathSide==='WAIT'
      ?priceDestination
        ?('ميل '+(priceDestination.side==='BUY'?'صاعد':'هابط')+' نحو المنطقة السعرية '+fmtZone(priceDestination.zone.low,priceDestination.zone.high)+' · '+priceDestination.confidence+'% · بانتظار تأكيد سيولة أقوى')
        :'لا يوجد مسار مهيمن؛ احتمالات الصعود والهبوط متقاربة'
      :sweepFirst&&oppositeSweep&&pathDestination
        ?('سحب سيولة '+(pathSide==='BUY'?'أسفل':'أعلى')+' أولًا قرب '+fmtZone(oppositeSweep.low,oppositeSweep.high)+' ثم انعكاس '+(pathSide==='BUY'?'صاعد':'هابط')+' نحو '+fmtZone(pathDestination.low,pathDestination.high))
        :conviction==='WEAK'
          ?('ميل '+(pathSide==='BUY'?'صاعد':'هابط')+' ضعيف'+(pathDestination?' نحو '+fmtZone(pathDestination.low,pathDestination.high):'')+' · الاحتمالات متقاربة')
          :conviction==='STRONG'
            ?('سيناريو '+(pathSide==='BUY'?'صاعد':'هابط')+' قوي'+(pathDestination?' نحو '+fmtZone(pathDestination.low,pathDestination.high):''))
            :(pathSide==='BUY'
              ?(pathDestination?'مرجح صعود نحو سيولة/مقاومة '+fmtZone(pathDestination.low,pathDestination.high):'ميل صاعد لكن الوجهة الهيكلية غير مؤكدة')
              :(pathDestination?'مرجح هبوط نحو دعم/سيولة '+fmtZone(pathDestination.low,pathDestination.high):'ميل هابط لكن الوجهة الهيكلية غير مؤكدة'))
  };
  const targetStrength=Number(target?.strength||0),originStrength=Number(origin?.strength||0);
  const zoneQuality=Math.max(targetStrength,originStrength,Number(support?.strength||0),Number(resistance?.strength||0));
  const horizonBonus=side==='WAIT'?0:horizonSupport(side)*8;
  const conflictPenalty=horizonsConflict?10:0;
  const confidence=side==='WAIT'
    ?Math.round(cap(zoneQuality*.22+Math.max(m1Strength,m5Strength)*.12-conflictPenalty,0,42))
    :Math.round(cap(
      Number(args.confidence||0)*.34+zoneQuality*.36+readiness*.14+horizonBonus-conflictPenalty,
      0,88
    ));
  const range=(z:any)=>z?fmtZone(z.low,z.high):'—';
  const directionWord=side==='BUY'?'صعود':side==='SELL'?'هبوط':'تذبذب';
  const targetLabel=target?(target.kind.includes('SUPPLY')||target.kind.includes('ABOVE')?'مقاومة/سيولة':'دعم/سيولة'):'بدون منطقة مؤكدة';
  const setup=origin
    ?(side==='BUY'?'ارتداد من منطقة طلب/دعم':'رفض من منطقة عرض/مقاومة')
    :(phase!=='NEUTRAL'?phaseText:'بين مناطق القرار');
  const summary=side==='WAIT'
    ?'السعر بين مناطق القرار؛ لا يوجد ارتداد أو كسر مؤكد كفاية لتوقع اتجاه الآن.'
    :target
      ?setup+' → '+directionWord+' نحو '+targetLabel+' '+range(target)
      :setup+'، والاتجاه مؤيد هيكليًا لكن لا توجد منطقة هدف قوية كفاية أمام السعر.';
  return {
    side,confidence,phase,setup,summary,
    support,resistance,origin,target,
    pathForecast,
    decisionReady:side!=='WAIT',
    triggerReason,
    horizonContext:{m1Side:m1,m1Strength,m5Side:m5,m5Strength,conflict:horizonsConflict},
    liquidityConfirmed:Boolean(acc?.liquidityConfirmed),
    absorptionConfirmed:Boolean(acc?.absorptionConfirmed),
    breakoutReadiness:readiness,
    source:'STRUCTURAL_ZONE_MAP_V2'
  };
}
function stabilizeStructuralPath(asset:string,current:any,price:number,atr:number,now:number){
  if(!current)return current;
  const key=String(asset||'ASSET').toUpperCase(),p=Number(price),a=Math.max(1e-9,Number(atr));
  if(!Number.isFinite(p)||p<=0||!Number.isFinite(a)||a<=0)return current;

  const side:Side=current?.side||'WAIT';
  const confidence=Number(current?.confidence||0);
  const up=Number(current?.probabilities?.up||50),down=Number(current?.probabilities?.down||50);
  const probabilityGap=Math.abs(up-down);
  const liqGap=Math.abs(
    Number(current?.evidence?.liquidity?.upperAttraction||0)-
    Number(current?.evidence?.liquidity?.lowerAttraction||0)
  );
  const hasDestination=Boolean(current?.destination&&Number.isFinite(Number(current.destination.mid)));
  const valid=Boolean(
    (side==='BUY'||side==='SELL')&&hasDestination&&confidence>=46&&
    (probabilityGap>=8||liqGap>=12)
  );

  let prev=pathCommitMemory.get(key);
  const targetReached=(x:PathCommit)=>{
    const mid=Number(x.path?.destination?.mid);
    if(!Number.isFinite(mid))return false;
    return x.side==='BUY'?p>=mid:p<=mid;
  };
  const invalidated=(x:PathCommit)=>{
    const inv=Number(x.path?.invalidation?.price);
    if(!Number.isFinite(inv)||inv<=0)return false;
    const pad=a*.04;
    return x.side==='BUY'?p<inv-pad:p>inv+pad;
  };

  if(prev&&(now-prev.lastConfirmedAt>(key==='GOLD'?240000:180000)||targetReached(prev)||invalidated(prev))){
    pathCommitMemory.delete(key);prev=undefined;
  }

  if(!prev){
    if(valid){
      const locked={...current,stability:{locked:true,reason:'LIQUIDITY_PATH_ACQUIRED',ageSeconds:0,pendingSide:'WAIT',pendingSeconds:0}};
      pathCommitMemory.set(key,{path:locked,side:side as 'BUY'|'SELL',at:now,lastConfirmedAt:now,anchor:p,atr:a,pendingSide:'WAIT',pendingSince:0,pendingCount:0});
      return locked;
    }
    return {...current,side:'WAIT',confidence:Math.min(42,confidence),conviction:'WEAK',stability:{locked:false,reason:'NO_LIQUIDITY_DOMINANCE',ageSeconds:0,pendingSide:'WAIT',pendingSeconds:0}};
  }

  const ageSeconds=Math.round((now-prev.at)/1000);
  if(valid&&side===prev.side){
    const merged={
      ...current,
      confidence:Math.round(cap(confidence*.72+Number(prev.path?.confidence||0)*.28,0,86)),
      stability:{locked:true,reason:'LIQUIDITY_PATH_CONFIRMED',ageSeconds,pendingSide:'WAIT',pendingSeconds:0}
    };
    pathCommitMemory.set(key,{...prev,path:merged,lastConfirmedAt:now,anchor:p,atr:a,pendingSide:'WAIT',pendingSince:0,pendingCount:0});
    return merged;
  }

  const opposite:Side=prev.side==='BUY'?'SELL':'BUY';
  if(valid&&side===opposite){
    const samePending=prev.pendingSide===side;
    const pendingSince=samePending&&prev.pendingSince?prev.pendingSince:now;
    const pendingCount=samePending?prev.pendingCount+1:1;
    const pendingMs=now-pendingSince;
    const decisive=Boolean(
      confidence>=60&&probabilityGap>=16&&liqGap>=10&&
      String(current?.conviction||'WEAK')!=='WEAK'&&
      (pendingMs>=8000||(confidence>=72&&probabilityGap>=24&&liqGap>=16))
    );
    if(decisive){
      const flipped={...current,stability:{locked:true,reason:'DECISIVE_LIQUIDITY_REVERSAL',ageSeconds:0,pendingSide:'WAIT',pendingSeconds:0}};
      pathCommitMemory.set(key,{path:flipped,side:side as 'BUY'|'SELL',at:now,lastConfirmedAt:now,anchor:p,atr:a,pendingSide:'WAIT',pendingSince:0,pendingCount:0});
      return flipped;
    }
    const heldConfidence=Math.max(36,Math.round(Number(prev.path?.confidence||0)-Math.min(8,(now-prev.lastConfirmedAt)/60000*2)));
    const held={
      ...prev.path,
      confidence:heldConfidence,
      stability:{
        locked:true,reason:'OPPOSITE_LIQUIDITY_PULSE_PENDING',ageSeconds,
        pendingSide:side,pendingSeconds:Math.round(pendingMs/1000),candidateConfidence:Math.round(confidence),
        candidateProbabilityGap:Number(probabilityGap.toFixed(1)),candidateLiquidityGap:Number(liqGap.toFixed(1))
      }
    };
    pathCommitMemory.set(key,{...prev,path:held,pendingSide:side,pendingSince,pendingCount});
    return held;
  }

  // If fresh evidence becomes balanced, keep the last valid liquidity map briefly instead of
  // printing BUY/SELL alternately. It expires naturally if it is not reconfirmed.
  const holdMs=key==='GOLD'?120000:90000;
  if(now-prev.lastConfirmedAt<=holdMs){
    const held={
      ...prev.path,
      confidence:Math.max(34,Math.round(Number(prev.path?.confidence||0)-Math.min(10,(now-prev.lastConfirmedAt)/60000*3))),
      stability:{locked:true,reason:'BALANCED_FLOW_HOLDING_LAST_LIQUIDITY_MAP',ageSeconds,pendingSide:'WAIT',pendingSeconds:0}
    };
    pathCommitMemory.set(key,{...prev,path:held,pendingSide:'WAIT',pendingSince:0,pendingCount:0});
    return held;
  }

  pathCommitMemory.delete(key);
  return {...current,side:'WAIT',confidence:Math.min(42,confidence),conviction:'WEAK',stability:{locked:false,reason:'LIQUIDITY_PATH_EXPIRED',ageSeconds,pendingSide:'WAIT',pendingSeconds:0}};
}

function fmtZone(low:number,high:number){
  const a=Number(low),b=Number(high);
  if(!Number.isFinite(a)||!Number.isFinite(b))return '—';
  return a.toFixed(2)+'–'+b.toFixed(2);
}

function stabilizeZoneForecast(asset:string,current:any,price:number,atr:number,now:number){
  const key=String(asset||'ASSET').toUpperCase(),prev=zoneCommitMemory.get(key);
  const p=Number(price),a=Math.max(1e-9,Number(atr));
  const currentDecisionReady=current?.decisionReady!==false;
  const validCurrent=Boolean(
    currentDecisionReady&&current&&['BUY','SELL'].includes(String(current.side||''))&&Number(current.confidence||0)>=24
  );

  const hasStructure=(f:any)=>Boolean(
    f?.target||
    (f?.origin&&Number(f.origin.strength||0)>=48)||
    (f?.support&&Number(f.support.strength||0)>=52)||
    (f?.resistance&&Number(f.resistance.strength||0)>=52)
  );

  const zoneBroken=(commit:ZoneCommit)=>{
    const f=commit.forecast||{},origin=f.origin||null,target=f.target||null,side=commit.side;
    if(side==='BUY'){
      const originBroken=origin&&Number.isFinite(Number(origin.low))&&p<Number(origin.low)-a*.18;
      const targetReached=target&&Number.isFinite(Number(target.high))&&p>Number(target.high)+a*.10;
      return Boolean(originBroken||targetReached);
    }
    if(side==='SELL'){
      const originBroken=origin&&Number.isFinite(Number(origin.high))&&p>Number(origin.high)+a*.18;
      const targetReached=target&&Number.isFinite(Number(target.low))&&p<Number(target.low)-a*.10;
      return Boolean(originBroken||targetReached);
    }
    return true;
  };

  if(!prev||zoneBroken(prev)){
    if(validCurrent&&hasStructure(current)){
      const committed={...current,stability:{locked:true,ageSeconds:0,flipsBlocked:0,reason:'NEW_ZONE_COMMIT'}};
      zoneCommitMemory.set(key,{forecast:committed,side:current.side,at:now,lastConfirmedAt:now,price:p,atr:a,flipsBlocked:0});
      return committed;
    }
    return current?{...current,stability:{locked:false,ageSeconds:0,flipsBlocked:0,reason:'NO_STRONG_ZONE'}}:null;
  }

  const age=now-prev.at,prevForecast=prev.forecast||{};
  if(current?.decisionReady===false){
    const grace=30000;
    if(age>grace||Number(prevForecast.confidence||0)<46){
      zoneCommitMemory.delete(key);
      return {...current,stability:{locked:false,ageSeconds:Math.round(age/1000),flipsBlocked:0,reason:'NO_STRUCTURAL_TRIGGER_RELEASE'}};
    }
  }
  const prevHasTarget=Boolean(prevForecast?.target);
  const prevStrength=Math.max(
    Number(prevForecast?.target?.strength||0),
    Number(prevForecast?.origin?.strength||0),
    Number(prevForecast?.support?.strength||0),
    Number(prevForecast?.resistance?.strength||0)
  );
  const prevConfidence=Number(prevForecast.confidence||0);

  // Weak/targetless zones are allowed to stabilize briefly, but must not freeze the forecast.
  const ttl=key==='GOLD'
    ?(prevHasTarget&&prevStrength>=58?180000:60000)
    :(prevHasTarget&&prevStrength>=58?120000:45000);
  const hardTtl=key==='GOLD'
    ?(prevHasTarget&&prevStrength>=58?300000:100000)
    :(prevHasTarget&&prevStrength>=58?210000:80000);

  if(age>hardTtl||prevConfidence<24||(!prevHasTarget&&prev.flipsBlocked>=4)){
    if(validCurrent&&hasStructure(current)){
      const committed={...current,stability:{locked:true,ageSeconds:0,flipsBlocked:0,reason:'STALE_ZONE_REPLACED'}};
      zoneCommitMemory.set(key,{forecast:committed,side:current.side,at:now,lastConfirmedAt:now,price:p,atr:a,flipsBlocked:0});
      return committed;
    }
    zoneCommitMemory.delete(key);
    return current?{...current,stability:{locked:false,ageSeconds:0,flipsBlocked:0,reason:'STALE_ZONE_RELEASED'}}:null;
  }

  if(validCurrent&&current.side===prev.side&&hasStructure(current)){
    const prevTarget=Number(prevForecast?.target?.mid),curTarget=Number(current?.target?.mid);
    const bothTargets=Number.isFinite(prevTarget)&&Number.isFinite(curTarget);
    const targetClose=bothTargets?Math.abs(prevTarget-curTarget)<=a*.55:true;
    const refresh=Number(current.confidence||0)>=Math.max(36,prevConfidence-12)&&targetClose;
    if(refresh){
      const currentPath=current?.pathForecast||null,prevPath=prevForecast?.pathForecast||null;
      const prevPathSide:Side=prevPath?.side||'WAIT',currentPathSide:Side=currentPath?.side||'WAIT';
      const pathFlip=Boolean(
        prevPath&&currentPath&&
        (prevPathSide==='BUY'||prevPathSide==='SELL')&&
        (currentPathSide==='BUY'||currentPathSide==='SELL')&&
        currentPathSide!==prevPathSide
      );
      const pathProbabilityGap=Math.abs(
        Number(currentPath?.probabilities?.up||50)-Number(currentPath?.probabilities?.down||50)
      );
      const decisivePathFlip=Boolean(
        pathFlip&&
        Number(currentPath?.confidence||0)>=Math.max(58,Number(prevPath?.confidence||0)+8)&&
        pathProbabilityGap>=14&&
        String(currentPath?.conviction||'WEAK')!=='WEAK'
      );
      const committedPath=pathFlip&&!decisivePathFlip
        ?{
          ...prevPath,
          stability:{
            locked:true,
            reason:'OPPOSITE_PATH_PULSE_BLOCKED',
            candidateSide:currentPathSide,
            candidateConfidence:Number(currentPath?.confidence||0),
            probabilityGap:Number(pathProbabilityGap.toFixed(1))
          }
        }
        :currentPath||prevPath;
      const merged={
        ...current,
        target:bothTargets&&targetClose&&prevForecast?.target?prevForecast.target:current.target,
        origin:current.origin||prevForecast?.origin||null,
        pathForecast:committedPath,
        confidence:Math.round(cap(Number(current.confidence||0)*.68+prevConfidence*.32,0,88)),
        stability:{locked:true,ageSeconds:Math.round(age/1000),flipsBlocked:0,reason:'SAME_ZONE_CONFIRMED'}
      };
      zoneCommitMemory.set(key,{forecast:merged,side:prev.side,at:prev.at,lastConfirmedAt:now,price:p,atr:a,flipsBlocked:0});
      return merged;
    }
  }

  if(validCurrent&&current.side!==prev.side&&hasStructure(current)){
    const curStrength=Math.max(
      Number(current?.target?.strength||0),
      Number(current?.origin?.strength||0),
      Number(current?.support?.strength||0),
      Number(current?.resistance?.strength||0)
    );
    const confidenceGap=Number(current.confidence||0)-prevConfidence;
    const repeatedOpposition=prev.flipsBlocked>=2;
    const prevWeak=!prevHasTarget||prevStrength<54||prevConfidence<38;
    const structuralUpgrade=Boolean(
      current?.target||
      curStrength>=Math.max(54,prevStrength+5)||
      Number(current.breakoutReadiness||0)>=58
    );
    const decisiveFlip=Boolean(
      structuralUpgrade&&(
        confidenceGap>=10||
        (repeatedOpposition&&confidenceGap>=4)||
        (prevWeak&&Number(current.confidence||0)>=38)
      )
    );
    if(decisiveFlip){
      const committed={...current,stability:{locked:true,ageSeconds:0,flipsBlocked:0,reason:'DECISIVE_STRUCTURAL_FLIP'}};
      zoneCommitMemory.set(key,{forecast:committed,side:current.side,at:now,lastConfirmedAt:now,price:p,atr:a,flipsBlocked:0});
      return committed;
    }
  }

  // Only hold the prior zone inside its TTL. This fixes the old freeze where an opposite side was blocked forever.
  if(age<=ttl){
    const blocked=(validCurrent&&current.side!==prev.side)?prev.flipsBlocked+1:Math.max(0,prev.flipsBlocked-1);
    const decay=Math.min(14,Math.max(0,(now-prev.lastConfirmedAt)/60000)*2.5);
    const heldConfidence=Math.round(cap(prevConfidence-decay,0,88));
    if(heldConfidence<24){
      zoneCommitMemory.delete(key);
      return current?{...current,stability:{locked:false,ageSeconds:0,flipsBlocked:0,reason:'LOW_CONFIDENCE_RELEASE'}}:null;
    }
    const held={
      ...prevForecast,
      confidence:heldConfidence,
      stability:{
        locked:true,
        ageSeconds:Math.round(age/1000),
        flipsBlocked:blocked,
        reason:validCurrent&&current.side!==prev.side?'OPPOSITE_PULSE_BLOCKED':'HOLD_ZONE_WHILE_SIGNAL_WEAK'
      }
    };
    zoneCommitMemory.set(key,{...prev,forecast:held,flipsBlocked:blocked});
    return held;
  }

  if(validCurrent&&hasStructure(current)){
    const committed={...current,stability:{locked:true,ageSeconds:0,flipsBlocked:0,reason:'ZONE_COMMIT_REFRESH'}};
    zoneCommitMemory.set(key,{forecast:committed,side:current.side,at:now,lastConfirmedAt:now,price:p,atr:a,flipsBlocked:0});
    return committed;
  }

  zoneCommitMemory.delete(key);
  return current?{...current,stability:{locked:false,ageSeconds:Math.round(age/1000),flipsBlocked:0,reason:'ZONE_COMMIT_EXPIRED'}}:null;
}

function pathAr(p:string){
  if(p==='DROP_BOUNCE_DROP')return 'هبوط قصير → ارتداد صاعد → عودة للهبوط';
  if(p==='RISE_REJECT_RISE')return 'صعود قصير → رفض هابط → عودة للصعود';
  if(p==='RISE_THEN_DROP')return 'صعود قصير ثم هبوط';
  if(p==='DROP_THEN_RISE')return 'هبوط قصير ثم صعود';
  if(p==='CONTINUATION_UP')return 'استمرار صاعد';
  if(p==='CONTINUATION_DOWN')return 'استمرار هابط';
  return 'تذبذب / كسر كاذب محتمل';
}

export function buildHuntForecast(asset:string,decision:any,scalp:any,price:number|null,atr:number|null,now=Date.now(),wave:any=null,learner:any=null,structure:any=null,accumulation:any=null,learning:any=null,evolution:any=null,stateGraph:any=null,expectedLearning:any=null,movementIntel:any=null,liveOutcome:any=null){
  const p=Number(price),a=Number(atr);
  const fusionBuy=Number(decision?.fusion?.buy||0),fusionSell=Number(decision?.fusion?.sell||0);
  const matrix=decision?.indicatorMatrix?.rows||{},m1=matrix?.m1||{},m5=matrix?.m5||{},m15=matrix?.m15||{};
  const m1Side:Side=m1?.bias||'WAIT',m5Side:Side=m5?.bias||'WAIT',m15Side:Side=m15?.bias||'WAIT';
  const m1Strength=Number(m1?.strength||0),m5Strength=Number(m5?.strength||0),m15Strength=Number(m15?.strength||0);
  const motionSide:Side=decision?.motion?.side||'WAIT',behaviorSide:Side=decision?.behavior?.side||'WAIT',liqSide:Side=decision?.liquidity?.side||'WAIT',hunterSide:Side=decision?.hunter?.side||'WAIT';
  const motionScore=Number(decision?.motion?.score||0),behaviorScore=Number(decision?.behavior?.score||0),liqStrength=Number(decision?.liquidity?.strength||0),hunterScore=Number(decision?.hunter?.score||0);
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0);
  const movementEvidence=Array.isArray(movementIntel?.evidence)?movementIntel.evidence:[];
  const evidenceOf=(name:string)=>movementEvidence.find((e:any)=>String(e?.name||'')===name)||null;
  const tickEv=evidenceOf('serverTick'),ml1Ev=evidenceOf('mlEnsemble1m');
  const tickSide:Side=tickEv?.side||'WAIT',tickScore=Number(tickEv?.score||0);
  const scalpFusion=scalp?.fusionV8||{};
  const validatedMlSide:Side=ml1Ev?.side||scalpFusion?.mlSide||'WAIT';
  const validatedMlScore=Number(ml1Ev?.score||0);
  const scalpFusionSide:Side=scalpFusion?.side||scalp?.action||'WAIT';
  const scalpFusionConfidence=Number(scalpFusion?.confidence||scalp?.confidence||Math.max(scalpLong,scalpShort));
  const scalpFusionStrong=Boolean(scalpFusion?.strong);
  const sourceWfV5=liveOutcome?.walkForwardBySource?.FAST_MICROSTRUCTURE_V5||null;
  const sourceWfV4=liveOutcome?.walkForwardBySource?.FAST_MICROSTRUCTURE_V4||null;
  const wfBase=Number(sourceWfV5?.directional||0)>=25?sourceWfV5:Number(sourceWfV4?.directional||0)>=25?sourceWfV4:(liveOutcome?.walkForward||{});
  const wfScope=Number(sourceWfV5?.directional||0)>=25?'V5_SOURCE':Number(sourceWfV4?.directional||0)>=25?'V4_SOURCE':'GLOBAL_PRIOR';
  const wfStatus=String(wfBase?.status||'COLLECTING');
  const wfDrift=String(wfBase?.drift?.status||'COLLECTING');
  const wfOosN=Number(wfBase?.oos?.n||0);
  const wfOosAccuracy=Number(wfBase?.oos?.accuracy);
  const precisionGuard=Boolean(wfOosN>=10&&(wfStatus==='WATCH'||wfDrift==='DEGRADING'||(Number.isFinite(wfOosAccuracy)&&wfOosAccuracy<53)));
  const severeDrift=Boolean(wfOosN>=10&&wfDrift==='DEGRADING'&&Number(liveOutcome?.walkForward?.drift?.delta||0)<=-15);

  const accumulationFresh=Boolean(accumulation?.ok&&accumulation?.side);
  const accumulationSide:Side=accumulationFresh?(accumulation?.side||'WAIT'):'WAIT';
  const accumulationScore=accumulationFresh?Number(accumulationSide==='BUY'?accumulation?.accumulationScore:accumulation?.distributionScore):0;
  const accumulationReadiness=accumulationFresh?Number(accumulation?.breakoutReadiness||0):0;
  const structureFresh=Boolean(structure?.ok&&structure?.side);
  const structureM1Side:Side=structureFresh?(structure?.m1?.nextSide||'WAIT'):'WAIT',structureM5Side:Side=structureFresh?(structure?.m5?.nextSide||structure?.followSide||'WAIT'):'WAIT';
  const structureM1Score=structureFresh?Number(structure?.m1?.nextScore||0):0,structureM5Score=structureFresh?Number(structure?.m5?.nextScore||0):0;
  const m1Phase=String(structure?.m1?.phase||'TRANSITION'),m5Phase=String(structure?.m5?.phase||'TRANSITION');
  const graphFresh=Boolean(stateGraph?.ok&&Number(stateGraph?.sequenceMatches||0)>=4);
  const graphChange=Boolean(stateGraph?.changePoint&&Number(stateGraph?.changePointScore||0)>=58);
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

  // Next-Move v2: resolve the first 30-120s from live microstructure first.
  // Slower horizon memory calibrates confidence; it cannot dominate a strong live micro edge.
  const scalpSide:Side=scalpFusionSide!=='WAIT'?scalpFusionSide:(scalpLong-scalpShort>=4?'BUY':scalpShort-scalpLong>=4?'SELL':'WAIT');
  const scalpEdge=Math.max(Math.abs(scalpLong-scalpShort),Number(scalpFusion?.edge||0));
  const reactionFast=accumulation?.nearestReaction||null;
  const reactionFastSide:Side=reactionFast?.side||'WAIT';
  const reactionFastStrength=Number(reactionFast?.strength||0);
  const reactionFastDistanceAtr=Number(reactionFast?.distanceAtr);
  // Forecast Council V6:
  // correlated fast signals are compressed into one MICRO family so confidence cannot
  // inflate just because liquidity / tick / motion / wave describe the same move.
  const nearReaction=Boolean(
    reactionFastSide!=='WAIT'&&reactionFastStrength>=70&&
    Number.isFinite(reactionFastDistanceAtr)&&reactionFastDistanceAtr<=.55
  );
  const microBaseBuy=Math.max(
    sideScore(liqSide,'BUY',liqStrength)*.88,
    sideScore(tickSide,'BUY',tickScore)*.94,
    sideScore(motionSide,'BUY',motionScore)*.84,
    sideScore(waveSide,'BUY',waveScore)*.72
  );
  const microBaseSell=Math.max(
    sideScore(liqSide,'SELL',liqStrength)*.88,
    sideScore(tickSide,'SELL',tickScore)*.94,
    sideScore(motionSide,'SELL',motionScore)*.84,
    sideScore(waveSide,'SELL',waveScore)*.72
  );
  const microFamilyBuy=cap(
    microBaseBuy+
    (trapSide==='BUY'&&trapScore>=55?Math.min(14,trapScore*.15):0)+
    (nearReaction&&reactionFastSide==='BUY'?Math.min(10,reactionFastStrength*.12):0),
    0,100
  );
  const microFamilySell=cap(
    microBaseSell+
    (trapSide==='SELL'&&trapScore>=55?Math.min(14,trapScore*.15):0)+
    (nearReaction&&reactionFastSide==='SELL'?Math.min(10,reactionFastStrength*.12):0),
    0,100
  );
  const structureFamilyBuy=cap(
    sideScore(structureM1Side,'BUY',structureM1Score)*.58+
    sideScore(graphFresh?graphSide:'WAIT','BUY',graphScore)*.42,
    0,100
  );
  const structureFamilySell=cap(
    sideScore(structureM1Side,'SELL',structureM1Score)*.58+
    sideScore(graphFresh?graphSide:'WAIT','SELL',graphScore)*.42,
    0,100
  );
  const learnedH1Side:Side=learningFresh?(learning?.horizon1?.side||'WAIT'):'WAIT';
  const learnedH1Score=learningFresh?Number(learning?.horizon1?.confidence||0):0;
  const learnedFamilyBuy=cap(
    sideScore(em2Side,'BUY',em2Score)*.62+
    sideScore(validatedMlSide,'BUY',validatedMlScore)*.22+
    sideScore(learnedH1Side,'BUY',learnedH1Score)*.16,
    0,100
  );
  const learnedFamilySell=cap(
    sideScore(em2Side,'SELL',em2Score)*.62+
    sideScore(validatedMlSide,'SELL',validatedMlScore)*.22+
    sideScore(learnedH1Side,'SELL',learnedH1Score)*.16,
    0,100
  );
  // Ambush can assist the general AI forecast but can never dominate it.
  const ambushFamilyBuy=sideScore(scalpSide,'BUY',Math.min(75,scalpFusionConfidence));
  const ambushFamilySell=sideScore(scalpSide,'SELL',Math.min(75,scalpFusionConfidence));

  const fastNextBuy=
    microFamilyBuy*.48+
    structureFamilyBuy*.24+
    learnedFamilyBuy*.22+
    ambushFamilyBuy*.06;
  const fastNextSell=
    microFamilySell*.48+
    structureFamilySell*.24+
    learnedFamilySell*.22+
    ambushFamilySell*.06;

  const familySide=(buy:number,sell:number):Side=>{
    const strength=Math.max(buy,sell),gap=Math.abs(buy-sell);
    return strength>=28&&gap>=8?(buy>sell?'BUY':'SELL'):'WAIT';
  };
  const microFamilySide=familySide(microFamilyBuy,microFamilySell);
  const structureFamilySide=familySide(structureFamilyBuy,structureFamilySell);
  const learnedFamilySide=familySide(learnedFamilyBuy,learnedFamilySell);
  const ambushFamilySide=familySide(ambushFamilyBuy,ambushFamilySell);
  const fastNextSide:Side=sideOf(fastNextBuy,fastNextSell,8);
  const fastNextEdge=Math.abs(fastNextBuy-fastNextSell);
  const independentFamilies=[microFamilySide,structureFamilySide,learnedFamilySide];
  const independentSupport=independentFamilies.filter(s=>s!=='WAIT'&&s===fastNextSide).length;
  const independentOpposition=independentFamilies.filter(s=>s!=='WAIT'&&fastNextSide!=='WAIT'&&s!==fastNextSide).length;
  const changePointConflict=Boolean(
    graphChange&&microFamilySide!=='WAIT'&&structureFamilySide!=='WAIT'&&microFamilySide!==structureFamilySide
  );
  const fastNextSupport=[
    scalpSide,liqSide,tickSide,motionSide,validatedMlSide,waveSide,trapSide,
    nearReaction?reactionFastSide:'WAIT'
  ].filter(s=>s!=='WAIT'&&s===fastNextSide).length;
  const fastNextOpposition=[
    scalpSide,liqSide,tickSide,motionSide,validatedMlSide,waveSide,trapSide,
    nearReaction?reactionFastSide:'WAIT'
  ].filter(s=>s!=='WAIT'&&fastNextSide!=='WAIT'&&s!==fastNextSide).length;
  const fastLiveSupport=[scalpSide,liqSide,tickSide,motionSide,validatedMlSide,trapSide].filter(s=>s!=='WAIT'&&s===fastNextSide).length;
  const fastLiveOpposition=[scalpSide,liqSide,tickSide,motionSide,validatedMlSide,trapSide].filter(s=>s!=='WAIT'&&fastNextSide!=='WAIT'&&s!==fastNextSide).length;
  const v4Stats=liveOutcome?.bySource?.FAST_MICROSTRUCTURE_V4||{};
  const v3Stats=liveOutcome?.bySource?.FAST_MICROSTRUCTURE_V3||{};
  const v2Stats=liveOutcome?.bySource?.FAST_MICROSTRUCTURE_V2||{};
  const histN4=Number(v4Stats?.hits||0)+Number(v4Stats?.fails||0);
  const histN3=Number(v3Stats?.hits||0)+Number(v3Stats?.fails||0);
  const priorStats=histN4>=8?v4Stats:histN3>=12?v3Stats:v2Stats;
  const priorN=Number(priorStats?.hits||0)+Number(priorStats?.fails||0);
  const priorPosterior=Number(priorStats?.posteriorAccuracy||50);
  const historicalWeak=Boolean((priorN>=8&&priorPosterior<50)||(priorN>=20&&priorPosterior<54));
  // V6 precision gate works on independent evidence families, not raw component count.
  const requiredEdge=severeDrift?30:precisionGuard?26:historicalWeak?23:19;
  const requiredSupport=severeDrift?3:2;
  const reactionConflict=Boolean(nearReaction&&reactionFastSide!=='WAIT'&&reactionFastSide!==fastNextSide);
  const validatedMlConflict=Boolean(validatedMlSide!=='WAIT'&&validatedMlSide!==fastNextSide);
  const slowDoubleConflict=Boolean(
    structureM1Side!=='WAIT'&&graphFresh&&
    structureM1Side!==fastNextSide&&String(stateGraph?.nextSide||'WAIT')!==fastNextSide
  );
  const noFastConflict=fastLiveOpposition<=1;
  const tickOrMotionAligned=(tickSide===fastNextSide&&tickScore>=35)||(motionSide===fastNextSide&&motionScore>=38);
  const scalpLiquidityPair=scalpSide===fastNextSide&&liqSide===fastNextSide;
  const crossFamilyConfirmed=Boolean(
    microFamilySide===fastNextSide&&
    (structureFamilySide===fastNextSide||learnedFamilySide===fastNextSide)
  );
  const fastNextStrong=Boolean(
    fastNextSide!=='WAIT'&&fastNextEdge>=requiredEdge&&
    independentSupport>=requiredSupport&&independentOpposition<=1&&
    crossFamilyConfirmed&&
    (!changePointConflict||independentSupport===3)&&
    (!reactionConflict||independentSupport===3)&&
    (!validatedMlConflict||fastNextEdge>=28)&&
    (!slowDoubleConflict||independentSupport===3)&&
    (!severeDrift||independentOpposition===0)
  );
  const familyConfidenceCap=changePointConflict?56:independentSupport>=3?88:independentSupport===2?78:52;
  const fastNextConfidence=Math.round(cap(
    Math.max(fastNextBuy,fastNextSell)*.74+
    Math.min(15,fastNextEdge*.62)+
    Math.min(9,independentSupport*3)-
    Math.min(14,independentOpposition*6),
    18,familyConfidenceCap
  ));
  const fastLeanThreshold=Math.max(10,requiredEdge*.55);
  const fastNextLean=Boolean(
    !fastNextStrong&&fastNextSide!=='WAIT'&&fastNextEdge>=fastLeanThreshold&&
    independentSupport>=1&&independentOpposition<=1&&
    !changePointConflict&&
    (!reactionConflict||independentSupport>=2)
  );
  const fastLeanConfidence=Math.round(cap(
    fastNextConfidence*.72+
    Math.min(8,fastNextEdge*.18)-
    (validatedMlConflict?6:0)-
    (slowDoubleConflict?4:0),
    24,validatedMlConflict?40:46
  ));
  let oneMinute:Horizon={...two,strength:Math.round(cap(two.strength*.84,0,82))};
  if(fastNextSide!=='WAIT'&&(fastNextStrong||fastNextLean)){
    const fastBuyShare=fastNextBuy/Math.max(1e-9,fastNextBuy+fastNextSell)*100;
    const fastSellShare=100-fastBuyShare;
    const oneStrength=Math.round(cap(
      fastNextStrong
        ?fastNextConfidence*.74+Math.max(fastNextBuy,fastNextSell)*.26
        :fastLeanConfidence*.78+Math.min(16,fastNextEdge*.22),
      0,88
    ));
    oneMinute={
      side:fastNextSide,
      buy:Math.round(fastBuyShare),
      sell:Math.round(fastSellShare),
      strength:oneStrength,
      gap:Math.round(Math.abs(fastBuyShare-fastSellShare))
    };
  }
  if(fastNextStrong){
    const fastBuyShare=fastNextBuy/Math.max(1e-9,fastNextBuy+fastNextSell)*100;
    const fastSellShare=100-fastBuyShare;
    const fastStrength=Math.round(cap(fastNextConfidence*.72+Math.max(fastNextBuy,fastNextSell)*.28,0,88));
    const fastH:Horizon={side:fastNextSide,buy:Math.round(fastBuyShare),sell:Math.round(fastSellShare),strength:fastStrength,gap:Math.round(Math.abs(fastBuyShare-fastSellShare))};
    if(two.side==='WAIT'||two.side===fastNextSide||fastNextEdge>=13||fastNextSupport>=3){
      two=fastH;
    }else{
      two={...two,strength:Math.round(cap(two.strength*.72,0,70)),gap:Math.min(two.gap,8)};
    }
  }

  const behaviorExp=Number(decision?.behavior?.expectedMoveAtr||0);
  if(behaviorExp>=.35)buy+=Math.min(7,Math.abs(behaviorExp)*4);
  if(behaviorExp<=-.35)sell+=Math.min(7,Math.abs(behaviorExp)*4);

  const memoryBaseValid=Boolean(expectedLearning?.ok&&['BUY','SELL'].includes(String(em2Side))&&Number(em2?.samples||0)>=6&&Number(em2?.confidence||0)>=38&&Number(em2?.decisiveRate||0)>=40);
  const firstMoveMemoryValid=Boolean(memoryBaseValid&&(!precisionGuard||wfOosN<10));
  const movementSide:Side=movementIntel?.side||'WAIT',movementLean:Side=movementIntel?.leanSide||'WAIT',movementConfidence=Number(movementIntel?.confidence||0);
  const movementUsable=Boolean(movementIntel?.ok&&movementSide!=='WAIT'&&movementConfidence>=(precisionGuard?42:34));
  let primaryMoveSide:Side=fastNextStrong?fastNextSide:fastNextLean?fastNextSide:movementUsable?movementSide:firstMoveMemoryValid?em2Side:(two.side!=='WAIT'?two.side:movementLean);
  let primaryMoveConfidence=Math.round(cap(
    fastNextStrong
      ?fastNextConfidence
      :fastNextLean
        ?fastLeanConfidence
        :movementUsable
          ?movementConfidence
          :firstMoveMemoryValid
            ?(Number(em2?.confidence||0)*.65+Number(em2?.decisiveRate||0)*.35)
            :two.strength,
    0,88
  ));

  // Phase-aware understanding: continuation, reversal and compression are not treated as the same market.
  const graphDirectional:Side=graphFresh?(stateGraph?.nextSide||'WAIT'):'WAIT';
  const graphDirectionalConfidence=graphFresh?Number(stateGraph?.nextSideProbability||0):0;
  const graphCurrentState=String(stateGraph?.current||'TRANSITION');
  const graphExpectedState=String(stateGraph?.nextState||'TRANSITION');
  const reversalPhase=['SWEEP_REVERSAL','EXHAUSTION'].includes(m1Phase);
  const m5ReversalPressure=['SWEEP_REVERSAL','EXHAUSTION','PULLBACK'].includes(m5Phase);
  const graphReversalPressure=/EXHAUSTION|PULLBACK|REVERSAL/.test(graphExpectedState);
  const reversalPressure=reversalPhase||m5ReversalPressure||graphReversalPressure;
  const continuationPhase=['BREAKOUT','IMPULSE','TREND','RETEST'].includes(m1Phase)&&!reversalPressure;
  const compressionPhase=m1Phase==='COMPRESSION'||String(movementIntel?.regime||'')==='COMPRESSION'||graphCurrentState==='COMPRESSION';
  const rangePhase=String(movementIntel?.regime||'')==='RANGE'||graphCurrentState==='RANGE'||m1Phase==='RANGE';
  const structureAgreement=structureM1Side!=='WAIT'&&structureM1Side===primaryMoveSide;
  const graphAgreement=graphDirectional!=='WAIT'&&graphDirectional===primaryMoveSide;
  const expectedAgreement=em2Side!=='WAIT'&&em2Side===primaryMoveSide;

  if(primaryMoveSide==='WAIT'&&structureM1Side!=='WAIT'&&graphDirectional===structureM1Side&&graphDirectionalConfidence>=55&&structureM1Score>=45){
    primaryMoveSide=structureM1Side;
    primaryMoveConfidence=Math.round(cap(graphDirectionalConfidence*.46+structureM1Score*.34+Number(em2?.confidence||0)*.20,0,84));
  }
  if(reversalPhase&&graphChange&&structureM1Side!=='WAIT'){
    const reversalSupport=(graphDirectional===structureM1Side?1:0)+(trapSide===structureM1Side&&trapScore>=60?1:0)+(em2Side===structureM1Side?1:0);
    if(reversalSupport>=2){
      primaryMoveSide=structureM1Side;
      primaryMoveConfidence=Math.round(cap(primaryMoveConfidence+8+Math.min(8,Number(stateGraph?.changePointScore||0)*.08),0,86));
    }
  }
  if(continuationPhase&&structureAgreement){
    primaryMoveConfidence=Math.round(cap(primaryMoveConfidence+5+(expectedAgreement?4:0)+(graphAgreement?3:0),0,88));
  }
  if(compressionPhase||rangePhase){
    const directionalVotes=[
      fastNextStrong?fastNextSide:'WAIT',
      fastNextStrong?fastNextSide:'WAIT',
      scalpFusionStrong&&scalpSide===fastNextSide?fastNextSide:'WAIT',
      movementSide,
      precisionGuard?'WAIT':em2Side,
      structureM1Side,graphDirectional
    ].filter(s=>s==='BUY'||s==='SELL');
    const buys=directionalVotes.filter(s=>s==='BUY').length,sells=directionalVotes.filter(s=>s==='SELL').length;
    const dominant:Side=buys>sells?'BUY':sells>buys?'SELL':'WAIT';
    const candidates:{side:Side;score:number}[]=[
      {side:fastNextStrong?fastNextSide:'WAIT',score:fastNextConfidence+Math.min(10,fastNextEdge*.35)},
      {side:movementSide!=='WAIT'?movementSide:movementLean,score:Math.max(movementConfidence,Number(movementIntel?.agreement||0)*.55)},
      {side:em2Side,score:Number(em2?.confidence||0)*.70+Number(em2?.decisiveRate||0)*.30},
      {side:structureM1Side,score:structureM1Score},
      {side:graphDirectional,score:graphDirectionalConfidence},
      {side:two.side,score:Number(two.strength||0)}
    ].filter(x=>x.side==='BUY'||x.side==='SELL').sort((a,b)=>b.score-a.score);
    const fastLock=Boolean(fastNextStrong&&fastLiveSupport>=2&&fastNextEdge>=requiredEdge);
    const fastLeanLock=Boolean(
      precisionGuard&&fastNextLean&&fastLiveSupport>=2&&fastLiveOpposition<=1&&
      fastNextEdge>=fastLeanThreshold&&!reactionConflict
    );
    const resolved:Side=fastLock||fastLeanLock?fastNextSide:(dominant!=='WAIT'?dominant:(candidates[0]?.side||primaryMoveSide));
    if(resolved!=='WAIT'){
      primaryMoveSide=resolved;
      const top=Number(candidates.find(x=>x.side===resolved)?.score||primaryMoveConfidence);
      const voteEdge=Math.abs(buys-sells);
      primaryMoveConfidence=Math.round(cap(
        Math.max(primaryMoveConfidence*.68,top*.52)+(voteEdge>=2?6:voteEdge===1?3:0),
        24,82
      ));
    }else if(primaryMoveSide!=='WAIT'){
      primaryMoveConfidence=Math.round(cap(primaryMoveConfidence*.72,22,46));
    }
  }
  if(primaryMoveSide!=='WAIT'&&graphDirectional!=='WAIT'&&graphDirectional!==primaryMoveSide&&graphDirectionalConfidence>=62){
    primaryMoveConfidence=Math.max(20,primaryMoveConfidence-(fastNextStrong?5:10));
  }
  if(fastNextStrong&&primaryMoveSide===fastNextSide){
    const slowOpposition=[movementSide,em2Side,graphDirectional].filter(s=>s!=='WAIT'&&s!==fastNextSide).length;
    primaryMoveConfidence=Math.round(cap(primaryMoveConfidence-slowOpposition*2+(fastNextSupport>=3?4:0),20,88));
  }
  if(reversalPressure&&graphChange){
    primaryMoveConfidence=Math.max(18,primaryMoveConfidence-(m5ReversalPressure?8:5));
  }

  // Live failure guard: a forecast that is materially invalidated cannot keep repeating unchanged.
  const guardValid=Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>0;
  const previousGuard=liveFailureGuards.get(asset);
  let liveInvalidated=false,failedSide:Side='WAIT',adverseAtr=0,guardBlockedUntil=0;
  if(guardValid&&previousGuard&&previousGuard.side!=='WAIT'){
    const scale=Math.max(1e-9,(previousGuard.atr+a)/2);
    adverseAtr=previousGuard.side==='BUY'?(previousGuard.anchor-p)/scale:(p-previousGuard.anchor)/scale;
    const hardFailure=adverseAtr>=.30&&now-previousGuard.at<=15*60000;
    const cooling=previousGuard.blockedUntil>now&&primaryMoveSide===previousGuard.side;
    if(hardFailure||cooling){
      liveInvalidated=true;failedSide=previousGuard.side;
      guardBlockedUntil=hardFailure?now+45*1000:previousGuard.blockedUntil;
      const reweight=(h:Horizon):Horizon=>h.side===failedSide?{...h,strength:Math.min(h.strength,34),gap:Math.min(h.gap,7)}:h;
      two=reweight(two);five=reweight(five);
      if(fifteen.side===failedSide&&Number(fifteen.strength||0)<62)fifteen=reweight(fifteen);
      if(primaryMoveSide===failedSide){
        const alternatives:{side:Side;score:number}[]=[
          {side:movementSide!=='WAIT'?movementSide:movementLean,score:movementConfidence},
          {side:graphDirectional,score:graphDirectionalConfidence},
          {side:structureM1Side,score:structureM1Score},
          {side:em2Side,score:Number(em2?.confidence||0)},
          {side:two.side,score:Number(two.strength||0)}
        ].filter(x=>x.side!=='WAIT'&&x.side!==failedSide).sort((a,b)=>b.score-a.score);
        if(alternatives[0]){
          primaryMoveSide=alternatives[0].side;
          primaryMoveConfidence=Math.round(cap(alternatives[0].score*.72,24,58));
        }else{
          primaryMoveConfidence=Math.round(cap(primaryMoveConfidence*.55,20,38));
        }
      }
      liveFailureGuards.set(asset,{...previousGuard,blockedUntil:guardBlockedUntil,failures:previousGuard.failures+(hardFailure?1:0)});
    }
  }
  if(guardValid&&!liveInvalidated&&primaryMoveSide!=='WAIT'&&primaryMoveConfidence>=34){
    const g=liveFailureGuards.get(asset);
    if(!g||g.side!==primaryMoveSide||now-g.at>15*60000||g.blockedUntil<=now){
      liveFailureGuards.set(asset,{side:primaryMoveSide,anchor:p,atr:a,at:now,blockedUntil:0,failures:g?.failures||0});
    }
  }

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

  const followVotes:{side:Side;w:number}[]=[
    {side:five.side,w:Number(five.strength||0)*.34},
    {side:fifteen.side,w:Number(fifteen.strength||0)*.28},
    {side:structureM5Side,w:Number(structureM5Score||0)*.20},
    {side:graphDirectional,w:graphDirectionalConfidence*.18}
  ];
  let followBuy=0,followSell=0;
  for(const v of followVotes){if(v.side==='BUY')followBuy+=v.w;else if(v.side==='SELL')followSell+=v.w;}
  let learnedFollowSide:Side=followBuy-followSell>=6?'BUY':followSell-followBuy>=6?'SELL':'WAIT';
  let learnedFollowConfidence=Math.round(cap(Math.max(followBuy,followSell),0,86));

  const reaction=accumulation?.nearestReaction||null;
  const reactionSide:Side=reaction?.side||'WAIT';
  const reactionStrength=Number(reaction?.strength||0),reactionDistanceAtr=Number(reaction?.distanceAtr);
  const reactionTurn=Boolean(
    reactionSide!=='WAIT'&&primaryMoveSide!=='WAIT'&&reactionSide!==primaryMoveSide&&
    reactionStrength>=72&&Number.isFinite(reactionDistanceAtr)&&reactionDistanceAtr<=2.2&&
    (m5ReversalPressure||graphChange)
  );
  if(reactionTurn){
    learnedFollowSide=reactionSide;
    learnedFollowConfidence=Math.round(cap(reactionStrength*.62+Number(stateGraph?.changePointScore||0)*.24+Number(structureM5Score||0)*.14,0,88));
  }

  const path=structuralPath||pathOf(primaryMoveSide,learnedFollowSide!=='WAIT'?learnedFollowSide:five.side,fifteen.side),pathLabel=pathAr(path);
  const understandingMode=
    reactionTurn?'REACTION':
    reversalPressure&&graphChange?'REVERSAL':
    reversalPressure?'TRANSITION':
    compressionPhase?'COMPRESSION':
    continuationPhase?'CONTINUATION':
    graphCurrentState==='RANGE'?'RANGE':'TRANSITION';
  const understandingAgreement=[movementSide,em2Side,structureM1Side,graphDirectional].filter(s=>s!=='WAIT'&&primaryMoveSide!=='WAIT'&&s===primaryMoveSide).length;
  const understandingConflict=[movementSide,em2Side,structureM1Side,graphDirectional].filter(s=>s!=='WAIT'&&primaryMoveSide!=='WAIT'&&s!==primaryMoveSide).length;
  const understandingConfidence=Math.round(cap(
    primaryMoveConfidence*.48+
    Number(two.strength||0)*.17+
    Number(stateGraph?.confidence||0)*.12+
    Number(structure?.confidence||0)*.13+
    Math.min(10,understandingAgreement*3)-
    understandingConflict*5-
    (graphChange&&!['REVERSAL','REACTION'].includes(understandingMode)?5:0)-
    (reactionTurn?(reactionDistanceAtr<=.35?8:3):0),
    0,88
  ));
  const currentState=graphCurrentState||m1Phase||'TRANSITION';
  const expectedState=graphExpectedState||m5Phase||'TRANSITION';
  const firstWord=primaryMoveSide==='BUY'?'صعود':primaryMoveSide==='SELL'?'هبوط':'تذبذب';
  const followWord=learnedFollowSide==='BUY'?'صعود':learnedFollowSide==='SELL'?'هبوط':'غير محسوم';
  const finalSide:Side=fifteen.side!=='WAIT'?fifteen.side:em15Side;
  const finalWord=finalSide==='BUY'?'صعود':finalSide==='SELL'?'هبوط':'غير محسوم';
  const reactionText=reactionTurn
    ?' نحو/داخل منطقة '+(reactionSide==='SELL'?'عرض':'طلب')+' قوية ('+Math.round(reactionStrength)+'%)'
    :'';
  const understandingSummary=
    understandingMode==='REACTION'
      ?'المسار المرجح: '+firstWord+reactionText+' → رد فعل '+followWord+(finalSide!=='WAIT'&&finalSide!==learnedFollowSide?' → ثم ميل '+finalWord+' على 15د.':'.')
      :understandingMode==='REVERSAL'
        ?'السوق قرب نقطة تحول؛ المتوقع أولًا '+firstWord+reactionText+' ثم '+followWord+' إذا ظهر رفض/تأكيد.'
        :understandingMode==='COMPRESSION'
          ?'السوق في ضغط/تجميع للحركة؛ أول حركة مرجحة '+firstWord+' والموجة التالية '+followWord+'.'
          :understandingMode==='CONTINUATION'
            ?'السوق يميل لاستمرار الحركة؛ المتوقع أولًا '+firstWord+' ثم '+followWord+'.'
            :understandingMode==='RANGE'
              ?'السوق داخل نطاق؛ المتوقع '+firstWord+' مع احتمال كسر كاذب قبل اتجاه أوضح.'
              :'السوق في انتقال بين حالتين؛ الحركة الأولى المرجحة '+firstWord+reactionText+' ثم '+followWord+'.';
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

  // 30-minute structural extension: slower than the live stack and driven by
  // the 15m ensemble, state graph, M15 context and learned follow-through.
  const thirtyBuy=
    sideScore(fifteen.side,'BUY',fifteen.strength)*.38+
    sideScore(graphSide,'BUY',graphScore)*.20+
    sideScore(m15Side,'BUY',m15Strength)*.16+
    sideScore(structureM5Side,'BUY',structureM5Score)*.10+
    sideScore(behaviorSide,'BUY',behaviorScore)*.08+
    sideScore(learning?.horizon5?.side,'BUY',Number(learning?.horizon5?.confidence||0))*.08;
  const thirtySell=
    sideScore(fifteen.side,'SELL',fifteen.strength)*.38+
    sideScore(graphSide,'SELL',graphScore)*.20+
    sideScore(m15Side,'SELL',m15Strength)*.16+
    sideScore(structureM5Side,'SELL',structureM5Score)*.10+
    sideScore(behaviorSide,'SELL',behaviorScore)*.08+
    sideScore(learning?.horizon5?.side,'SELL',Number(learning?.horizon5?.confidence||0))*.08;
  const thirty=horizon(thirtyBuy,thirtySell,5);
  const thirtyDir=thirty.side==='BUY'?1:thirty.side==='SELL'?-1:0;
  const sameAs15=thirty.side!=='WAIT'&&thirty.side===resolved15Side;
  let target30Atr=thirtyDir===0?0:
    sameAs15
      ?resolved15MoveAtr*.72+thirtyDir*(.34+Number(thirty.strength||0)/190)
      :thirtyDir*(.44+Number(thirty.strength||0)/150);
  target30Atr=Math.max(-3.2,Math.min(3.2,target30Atr));
  const target30Price=validPrice&&thirtyDir!==0?p+a*target30Atr:null;
  const target30Confidence=Math.round(cap(
    Number(thirty.strength||0)*.60+
    (sameAs15?10:0)+
    (graphSide===thirty.side?8:0)+
    (m15Side===thirty.side?6:0)-
    (graphChange?8:0),
    0,84
  ));
  const target30BandAtr=.34+(100-target30Confidence)/100*.52;
  const target30Low=target30Price==null?null:target30Price-a*target30BandAtr;
  const target30High=target30Price==null?null:target30Price+a*target30BandAtr;

  const movementStations=validPrice?buildMovementStations({
    price:p,atr:a,now,first:firstLeg,second:secondLeg,third:target15Price,
    two:{...two,firstHitMinutes:Number(em2?.firstHitMinutes||0)},five,fifteen,
    accumulation,primary:shortSide,follow:followSide
  }):[];
  const rawZoneForecastBase=validPrice?buildZoneForecast({
    price:p,atr:a,side:primaryMoveSide!=='WAIT'?primaryMoveSide:stableSide,
    confidence:primaryMoveConfidence,accumulation,
    m1Side:oneMinute.side,m1Strength:Number(oneMinute.strength||0),
    m5Side:five.side,m5Strength:Number(five.strength||0),
    mlSide:validatedMlSide,mlStrength:validatedMlScore,
    learnedSide:learningFresh?learningSide:'WAIT',learnedStrength:learningFresh?learningScore:0,
    graphSide:graphFresh?graphSide:'WAIT',graphStrength:graphFresh?graphScore:0,
    precisionGuard
  }):null;
  const rawZoneForecast=rawZoneForecastBase?{
    ...rawZoneForecastBase,
    pathForecast:stabilizeStructuralPath(asset,rawZoneForecastBase.pathForecast,p,a,now)
  }:null;
  const stabilizedZoneForecast=validPrice?stabilizeZoneForecast(asset,rawZoneForecast,p,a,now):rawZoneForecast;
  const zoneForecast=stabilizedZoneForecast&&rawZoneForecast?{
    ...stabilizedZoneForecast,
    // Keep the structural path committed too. Fresh pulses may update a same-side
    // path, but an opposite path must pass the decisive-flip gate in stabilizeZoneForecast.
    pathForecast:stabilizedZoneForecast.pathForecast??rawZoneForecast.pathForecast,
    support:rawZoneForecast.support??stabilizedZoneForecast.support,
    resistance:rawZoneForecast.resistance??stabilizedZoneForecast.resistance,
    phase:rawZoneForecast.phase||stabilizedZoneForecast.phase
  }:stabilizedZoneForecast;

  const quickTarget=(side:Side,strength:number,atrFactor:number,stationPrice:number|null=null)=>{
    if(!validPrice||side==='WAIT')return null;
    if(Number.isFinite(Number(stationPrice))&&Number(stationPrice)>0){
      const sp=Number(stationPrice);
      if((side==='BUY'&&sp>p)||(side==='SELL'&&sp<p))return Number(sp.toFixed(2));
    }
    const d=side==='BUY'?1:-1;
    const factor=Math.max(.10,Math.min(1.05,atrFactor+Math.max(0,Number(strength||0))/230));
    return Number((p+d*a*factor).toFixed(2));
  };
  const station1=movementStations?.[0]?.price??null,station2=movementStations?.[1]?.price??null;
  const scalpTargetSide:Side=scalp?.target?.side||scalp?.action||(scalpLong>scalpShort?'BUY':scalpShort>scalpLong?'SELL':'WAIT');
  const scalpContextPrice=Number(scalp?.target?.price);
  const scalpTargetPrice=Number.isFinite(scalpContextPrice)&&scalpContextPrice>0
    ?Number(scalpContextPrice.toFixed(2))
    :quickTarget(scalpTargetSide,Math.max(scalpLong,scalpShort),.10,null);
  const structuralTargetPrice=zoneForecast?.target?.mid??null;
  const structuralSide:Side=zoneForecast?.side||'WAIT';
  const quickSignalTargets={
    scalp:{side:scalpTargetSide,price:scalpTargetPrice,confidence:Math.round(cap(Number(scalp?.confidence||Math.max(scalpLong,scalpShort)),0,88)),horizonMinutes:.5,source:scalp?.target?.source||'DYNAMIC',contextMode:scalp?.target?.contextMode||null},
    oneMinute:{side:oneMinute.side,price:structuralSide===oneMinute.side&&structuralTargetPrice!=null?Number(structuralTargetPrice):quickTarget(oneMinute.side,oneMinute.strength,.12,station1),confidence:Math.round(cap(oneMinute.strength,0,88)),horizonMinutes:1,source:structuralSide===oneMinute.side&&structuralTargetPrice!=null?'STRUCTURAL_ZONE_MAP':'LIVE_FAST_STACK'},
    fiveMinute:{side:five.side,price:structuralSide===five.side&&structuralTargetPrice!=null?Number(structuralTargetPrice):quickTarget(five.side,five.strength,.30,station2),confidence:Math.round(cap(five.strength,0,88)),horizonMinutes:5,source:structuralSide===five.side&&structuralTargetPrice!=null?'STRUCTURAL_ZONE_MAP':'FIVE_MINUTE_ENSEMBLE'},
    fifteenMinute:{side:resolved15Side,price:target15Price==null?null:Number(target15Price.toFixed(2)),confidence:resolved15Confidence,horizonMinutes:15,source:memory15Usable?'15M_MEMORY_BLEND':'15M_LIVE_ENSEMBLE'},
    thirtyMinute:{side:thirty.side,price:target30Price==null?null:Number(target30Price.toFixed(2)),confidence:target30Confidence,horizonMinutes:30,source:'30M_STRUCTURAL_EXTENSION'}
  };

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
  if(liveInvalidated)reasons.push('LIVE RE-EVALUATION: فشل '+failedSide+' بعد حركة عكسية '+Number(Math.max(0,adverseAtr).toFixed(2))+' ATR؛ تم خفض وزنه وإعادة ترجيح الحركة بدل إيقاف التوقع');
  if(movementIntel?.ok)reasons.push('Movement Brain '+String(movementIntel.regime)+' · '+(movementIntel.side==='WAIT'?('lean '+movementIntel.leanSide):movementIntel.side)+' · '+movementConfidence);
  if(primaryMoveSide!=='WAIT')reasons.push('First-Move '+primaryMoveSide+' · confidence '+primaryMoveConfidence+' · first-hit '+Number(em2?.firstHitMinutes||0)+'m');
  if(fastNextStrong)reasons.push('Next-Move v5 CONFIRMED '+fastNextSide+' · micro edge '+Number(fastNextEdge.toFixed(1))+' · '+fastLiveSupport+' fast confirmations');
  else if(fastNextLean)reasons.push('Next-Move v5 LEAN '+fastNextSide+' · micro edge '+Number(fastNextEdge.toFixed(1))+' · confidence capped '+fastLeanConfidence);
  if(precisionGuard)reasons.push('OOS precision guard · '+wfStatus+' · OOS '+(Number.isFinite(wfOosAccuracy)?wfOosAccuracy.toFixed(1):'—')+'% · drift '+wfDrift);
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
    nextMove:{
      side:primaryMoveSide,confidence:primaryMoveConfidence,
      source:fastNextStrong?'FORECAST_COUNCIL_V6':fastNextLean?'FORECAST_COUNCIL_LEAN_V6':firstMoveMemoryValid?'FIRST_PASSAGE_MEMORY':'LIVE_2M_ENSEMBLE',
      firstHitMinutes:Number(em2?.firstHitMinutes||0),decisiveRate:Number(em2?.decisiveRate||0),
      conflictWithLockedDirection:primaryMoveConflict,
      micro:{
        side:fastNextSide,strong:fastNextStrong,lean:fastNextLean,confidence:fastNextConfidence,leanConfidence:fastLeanConfidence,
        buy:Number(fastNextBuy.toFixed(2)),sell:Number(fastNextSell.toFixed(2)),edge:Number(fastNextEdge.toFixed(2)),
        support:fastNextSupport,opposition:fastNextOpposition,liveSupport:fastLiveSupport,liveOpposition:fastLiveOpposition,nearReaction,
        requiredEdge,requiredSupport,fastLeanThreshold,precisionGuard,severeDrift,historicalWeak,priorN,priorPosterior,
        noFastConflict,tickOrMotionAligned,scalpLiquidityPair,
        independentSupport,independentOpposition,crossFamilyConfirmed,changePointConflict,familyConfidenceCap,
        families:{
          micro:{side:microFamilySide,buy:Number(microFamilyBuy.toFixed(1)),sell:Number(microFamilySell.toFixed(1))},
          structure:{side:structureFamilySide,buy:Number(structureFamilyBuy.toFixed(1)),sell:Number(structureFamilySell.toFixed(1))},
          learned:{side:learnedFamilySide,buy:Number(learnedFamilyBuy.toFixed(1)),sell:Number(learnedFamilySell.toFixed(1))},
          ambush:{side:ambushFamilySide,buy:Number(ambushFamilyBuy.toFixed(1)),sell:Number(ambushFamilySell.toFixed(1)),role:'ASSIST'}
        },
        reactionConflict,validatedMlConflict,slowDoubleConflict,wfStatus,wfScope,wfOosAccuracy:Number.isFinite(wfOosAccuracy)?wfOosAccuracy:null,wfDrift,
        scalp:scalpSide,scalpFusionStrong,liquidity:liqSide,tick:tickSide,motion:motionSide,ml1:validatedMlSide,trap:trapSide
      }
    },
    liveFailureGuard:{invalidated:liveInvalidated,failedSide,adverseAtr:Number(Math.max(0,adverseAtr).toFixed(3)),blockedUntil:guardBlockedUntil},
    buyScore:Math.round(buy),sellScore:Math.round(sell),horizonSeconds,expectedMoveAtr:Number(expAtr.toFixed(2)),
    trigger:trigger==null?null:Number(trigger.toFixed(2)),projected:projected==null?null:Number(projected.toFixed(2)),invalidation:invalidation==null?null:Number(invalidation.toFixed(2)),currentPrice:Number.isFinite(p)?p:null,
    path:{code:path,label:pathLabel,firstLeg:firstLeg==null?null:Number(firstLeg.toFixed(2)),secondLeg:secondLeg==null?null:Number(secondLeg.toFixed(2)),shortSide,followSide,structureDriven:Boolean(structuralPath),stations:movementStations},
    marketUnderstanding:{
      mode:understandingMode,
      currentState,
      expectedState,
      m1Phase,
      m5Phase,
      firstMove:{side:primaryMoveSide,confidence:understandingConfidence},
      followMove:{side:learnedFollowSide,confidence:learnedFollowConfidence},
      finalMove:{side:finalSide,confidence:Number(fifteen.strength||em15?.confidence||0),horizonMinutes:15},
      reactionZone:reactionTurn?{side:reactionSide,strength:reactionStrength,distanceAtr:reactionDistanceAtr,low:Number(reaction?.low||0),high:Number(reaction?.high||0)}:null,
      agreement:understandingAgreement,
      conflict:understandingConflict,
      changePoint:graphChange,
      changePointScore:Number(stateGraph?.changePointScore||0),
      summary:understandingSummary,
      evidence:[
        'Movement '+movementSide+' '+movementConfidence,
        'Expected-2m '+em2Side+' '+Number(em2?.confidence||0),
        'Structure-M1 '+structureM1Side+' '+structureM1Score,
        'StateGraph '+graphDirectional+' '+graphDirectionalConfidence
      ]
    },
    fifteenMinuteTarget:{side:resolved15Side,price:target15Price==null?null:Number(target15Price.toFixed(2)),low:target15Low==null?null:Number(target15Low.toFixed(2)),high:target15High==null?null:Number(target15High.toFixed(2)),confidence:resolved15Confidence,moveAtr:Number(resolved15MoveAtr.toFixed(3)),movePct:Number(target15MovePct.toFixed(3)),samples:em15Samples,source:miTarget?.source||(memory15Usable?'15M_MEMORY_BLEND':'15M_LIVE_ENSEMBLE'),targetAt:now+15*60000},
    thirtyMinuteTarget:{side:thirty.side,price:target30Price==null?null:Number(target30Price.toFixed(2)),low:target30Low==null?null:Number(target30Low.toFixed(2)),high:target30High==null?null:Number(target30High.toFixed(2)),confidence:target30Confidence,moveAtr:Number(target30Atr.toFixed(3)),source:'30M_STRUCTURAL_EXTENSION',targetAt:now+30*60000},
    movementStations,
    zoneForecast,
    quickSignalTargets,
    horizons:{oneMinute,twoMinute:two,fiveMinute:five,fifteenMinute:fifteen,thirtyMinute:thirty},
    forecastWindowsMinutes:[1,5,15,30],
    waveStructure:structureFresh?structure:null,
    accumulationMap:accumulationFresh?accumulation:null,
    learningBrain:learning?.ok?learning:null,
    expectedMoveLearning:expectedLearning?.ok?expectedLearning:null,
    movementIntelligence:movementIntel?.ok?movementIntel:null,
    expectedMoveCore:{primary:true,windows:[1,5,15,30],consensus:horizonConsensus,conflict:horizonConflict>0||expectedConflict||primaryMoveConflict,averageCalibration:expectedCal,target:'FIRST_PASSAGE',firstMoveSide:primaryMoveSide,firstMoveConfidence:primaryMoveConfidence},
    strongMove:accumulationFresh&&accumulation?.strongMoveSide!=='WAIT'&&Number(accumulation?.breakoutReadiness||0)>=strongMoveReadiness&&(primaryMoveSide==='WAIT'||accumulation.strongMoveSide===primaryMoveSide)?{side:accumulation.strongMoveSide,score:Number(accumulation.strongMoveScore||0),readiness:Number(accumulation.breakoutReadiness||0),phase:accumulation.phase,breakoutLevel:accumulation.breakoutLevel,breakdownLevel:accumulation.breakdownLevel,liquidityConfirmed:Boolean(accumulation.liquidityConfirmed),absorptionConfirmed:Boolean(accumulation.absorptionConfirmed)}:null,
    selfEvolution:evolution?.ok?{generation:evolution.generation,active:evolution.active,promoted:evolution.promoted,rolledBack:evolution.rolledBack,reason:evolution.reason}:null,
    alternative:{side:alternativeSide,strength:alternativeStrength,condition:alternativeSide==='WAIT'?'لا يوجد بديل واضح':`يتفعل إذا فشل Trigger أو كُسر Invalidation ويتحول الالتزام إلى ${alternativeSide}`},
    reasons:reasons.slice(0,8),commitment,
    waveLeadUsed:waveFresh?{side:waveSide,stage:wave?.stage,score:waveScore,confidence:waveConfidence,at:Number(wave?.at||0)}:null,
    scalpLearnerUsed:learnerFresh?{side:learnerSide,confidence:learnerScore,oosAccuracy:Number(learner?.oosAccuracy||0),oosEdgeAtr:Number(learner?.oosEdgeAtr||0),profitFactor:Number(learner?.profitFactor||0),holdSeconds:Number(learner?.exitPlan?.maxHoldSeconds||0)}:null,
    note:'توقع الحركة القادمة الرئيسي يعتمد على مناطق الدعم/المقاومة والسيولة والتجميع. توقعات الزمن القصير تبقى إشارات مساعدة وليست هدفًا سعريًا ثابت المسافة.'
  };
}
