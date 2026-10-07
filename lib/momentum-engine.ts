type Side='BUY'|'SELL'|'WAIT';
type Phase='NEUTRAL'|'BUILDING'|'ACTIVE'|'EXHAUSTING'|'WEAK';

export type MomentumEngine={
  ok:boolean;
  asset:'GOLD'|'BTC';
  side:Side;
  phase:Phase;
  score:number;
  confidence:number;
  preMove:boolean;
  acceleration:number;
  persistence:number;
  expansion:number;
  efficiency:number;
  closePressure:number;
  impulse:number;
  exhaustion:number;
  tickSupport:number;
  multiTimeframe:number;
  stability:number;
  stateAgeSeconds:number;
  flipPending:boolean;
  mVolume:{
    available:boolean;phase:'QUIET'|'BUILDING'|'CONFIRMING'|'ABSORBING'|'CLIMAX'|'DIVERGENCE';side:Side;score:number;
    confidence:number;quality:number;relativeVolume:number;volumeAcceleration:number;directionalPressure:number;flowDelta:number;
    absorption:number;climax:number;effortResult:number;followThrough:number;divergence:number;cvdSide:Side;
  };
  targets:{
    target1:number|null;target2:number|null;invalidation:number|null;
    target1Kind:'LIQUIDITY'|'STRUCTURE'|'MOMENTUM'|'NONE';
    target2Kind:'LIQUIDITY'|'STRUCTURE'|'MOMENTUM'|'NONE';
    horizonMinutes:number;projectionAtr:number;confidence:number;
  };
  reasons:string[];
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const sideOf=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';

function closed(rows:any[],tfMs:number,now:number,n:number){
  return (Array.isArray(rows)?rows:[])
    .filter((c:any)=>Number.isFinite(Number(c?.time))&&Number(c.time)+tfMs<=now)
    .slice(-n);
}
function signedReturn(a:any,b:any,atr:number){
  const x=(Number(b?.close)-Number(a?.close))/Math.max(1e-9,atr);
  return Number.isFinite(x)?x:0;
}
function candleDrive(c:any){
  const o=Number(c?.open),h=Number(c?.high),l=Number(c?.low),cl=Number(c?.close);
  const r=Math.max(1e-9,h-l);
  return cap(((cl-o)/r)*100,-100,100);
}
function closeLocation(c:any){
  const h=Number(c?.high),l=Number(c?.low),cl=Number(c?.close);
  const r=Math.max(1e-9,h-l);
  return cap((((cl-l)/r)-.5)*200,-100,100);
}
type MomentumMemory={
  value:MomentumEngine;
  at:number;
  sideSince:number;
  pendingSide:Side;
  pendingCount:number;
  pendingSince:number;
};
function momentumMemory(){
  const g=globalThis as any;
  if(!g.__ahmedMomentumMemory)g.__ahmedMomentumMemory={GOLD:null,BTC:null};
  return g.__ahmedMomentumMemory as Record<'GOLD'|'BTC',MomentumMemory|null>;
}
const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
function stableTarget(prev:number|null,next:number|null,side:Side,price:number,atr:number,k=.24){
  const ahead=(v:number|null)=>v!=null&&Number.isFinite(v)&&(side==='BUY'?v>price+atr*.04:side==='SELL'?v<price-atr*.04:false);
  if(!ahead(prev))return ahead(next)?next:null;
  if(!ahead(next))return prev;
  const gap=Math.abs(Number(next)-Number(prev));
  if(gap>atr*.55)return prev;
  return Number(lerp(Number(prev),Number(next),k).toFixed(2));
}
function stabilizeMomentum(raw:MomentumEngine,price:number,atr:number,now:number):MomentumEngine{
  if(!raw.ok||!Number.isFinite(price)||!Number.isFinite(atr)||atr<=0)return raw;
  const mem=momentumMemory(),prev=mem[raw.asset];
  const commit=(value:MomentumEngine,sideSince=now)=>{
    const out={...value,stability:value.side==='WAIT'?32:58,stateAgeSeconds:0,flipPending:false};
    mem[raw.asset]={value:out,at:now,sideSince,pendingSide:'WAIT',pendingCount:0,pendingSince:0};
    return out;
  };
  if(!prev||now-prev.at>10*60*1000)return commit(raw);
  const age=Math.max(0,now-prev.sideSince),prevSide=prev.value.side;
  const prevTargetAhead=prev.value.targets?.target1!=null&&(
    prevSide==='BUY'?Number(prev.value.targets.target1)>price+atr*.04:
    prevSide==='SELL'?Number(prev.value.targets.target1)<price-atr*.04:false
  );

  if(raw.side===prevSide){
    const k=.28,kFast=.34;
    const phase:Phase=
      raw.phase==='EXHAUSTING'?'EXHAUSTING':
      prev.value.phase==='ACTIVE'&&raw.phase==='WEAK'&&raw.score>=45&&raw.exhaustion<58?'ACTIVE':
      prev.value.phase==='BUILDING'&&raw.phase==='WEAK'&&raw.score>=38&&raw.exhaustion<55?'BUILDING':
      raw.phase;
    const t1=stableTarget(prev.value.targets?.target1??null,raw.targets?.target1??null,raw.side,price,atr,.22);
    const t2=stableTarget(prev.value.targets?.target2??null,raw.targets?.target2??null,raw.side,price,atr,.20);
    const inv=stableTarget(prev.value.targets?.invalidation??null,raw.targets?.invalidation??null,raw.side==='BUY'?'SELL':raw.side==='SELL'?'BUY':'WAIT',price,atr,.28);
    const stability=Math.round(cap(
      58+Math.min(28,age/1000*.55)+(raw.multiTimeframe>=75?7:0)+(raw.mVolume?.phase==='CONFIRMING'?5:0)-raw.exhaustion*.10,
      35,96
    ));
    const out:MomentumEngine={
      ...raw,phase,
      score:Math.round(lerp(prev.value.score,raw.score,k)),
      confidence:Math.round(lerp(prev.value.confidence,raw.confidence,k)),
      acceleration:Math.round(lerp(prev.value.acceleration,raw.acceleration,kFast)),
      persistence:Math.round(lerp(prev.value.persistence,raw.persistence,k)),
      expansion:Math.round(lerp(prev.value.expansion,raw.expansion,k)),
      efficiency:Math.round(lerp(prev.value.efficiency,raw.efficiency,k)),
      closePressure:Math.round(lerp(prev.value.closePressure,raw.closePressure,kFast)),
      impulse:Math.round(lerp(prev.value.impulse,raw.impulse,k)),
      exhaustion:Math.round(lerp(prev.value.exhaustion,raw.exhaustion,.36)),
      tickSupport:Math.round(lerp(prev.value.tickSupport,raw.tickSupport,.38)),
      multiTimeframe:Math.round(lerp(prev.value.multiTimeframe,raw.multiTimeframe,.30)),
      stability,stateAgeSeconds:Math.round(age/1000),flipPending:false,
      mVolume:{
        ...raw.mVolume,
        score:Math.round(lerp(prev.value.mVolume?.score||0,raw.mVolume?.score||0,.30)),
        relativeVolume:Number(lerp(prev.value.mVolume?.relativeVolume||0,raw.mVolume?.relativeVolume||0,.32).toFixed(2)),
        volumeAcceleration:Math.round(lerp(prev.value.mVolume?.volumeAcceleration||0,raw.mVolume?.volumeAcceleration||0,.35)),
        directionalPressure:Math.round(lerp(prev.value.mVolume?.directionalPressure||0,raw.mVolume?.directionalPressure||0,.35)),
        confidence:Math.round(lerp(prev.value.mVolume?.confidence||0,raw.mVolume?.confidence||0,.32)),
        quality:Math.round(lerp(prev.value.mVolume?.quality||0,raw.mVolume?.quality||0,.22)),
        absorption:Math.round(lerp(prev.value.mVolume?.absorption||0,raw.mVolume?.absorption||0,.34)),
        climax:Math.round(lerp(prev.value.mVolume?.climax||0,raw.mVolume?.climax||0,.34)),
        effortResult:Math.round(lerp(prev.value.mVolume?.effortResult||0,raw.mVolume?.effortResult||0,.32)),
        followThrough:Math.round(lerp(prev.value.mVolume?.followThrough||0,raw.mVolume?.followThrough||0,.32)),
        divergence:Math.round(lerp(prev.value.mVolume?.divergence||0,raw.mVolume?.divergence||0,.32))
      },
      targets:{...raw.targets,target1:t1,target2:t2,invalidation:inv},
      reasons:[...raw.reasons.slice(0,6),'اتجاه المومنتم مثبت بذاكرة زمنية ويحتاج تفوقًا واضحًا للانعكاس.'].slice(0,7)
    };
    mem[raw.asset]={value:out,at:now,sideSince:prev.sideSince,pendingSide:'WAIT',pendingCount:0,pendingSince:0};
    return out;
  }

  if(raw.side==='WAIT'&&prevSide!=='WAIT'){
    if(age<=60000&&prevTargetAhead&&raw.confidence<=40){
      const out:MomentumEngine={
        ...prev.value,
        phase:prev.value.phase==='EXHAUSTING'?'EXHAUSTING':'WEAK',
        confidence:Math.max(30,prev.value.confidence-4),
        score:Math.max(28,prev.value.score-3),
        stability:Math.max(34,prev.value.stability-5),
        stateAgeSeconds:Math.round(age/1000),flipPending:false,
        reasons:['المومنتم اللحظي فقد الحسم لكن الاتجاه السابق ما زال محفوظًا مؤقتًا.',...prev.value.reasons].slice(0,7)
      };
      mem[raw.asset]={...prev,value:out,at:now,pendingSide:'WAIT',pendingCount:0,pendingSince:0};
      return out;
    }
    return commit(raw);
  }

  if(prevSide==='WAIT')return commit(raw);

  const samePending=prev.pendingSide===raw.side&&now-prev.at<=12000;
  const pendingCount=samePending?prev.pendingCount+1:1;
  const pendingSince=samePending&&prev.pendingSince?prev.pendingSince:now;
  const agePending=now-pendingSince;
  const volumeConfirms=raw.mVolume?.phase==='CONFIRMING'&&raw.mVolume?.side===raw.side;
  const decisive=raw.confidence>=72&&raw.score>=68&&raw.multiTimeframe>=75&&(volumeConfirms||raw.impulse>=72);
  const confirmed=pendingCount>=3&&agePending>=8000&&raw.confidence>=56&&raw.score>=52&&raw.multiTimeframe>=50;
  const targetConsumed=!prevTargetAhead;
  const earlyConfirmed=targetConsumed&&pendingCount>=2&&agePending>=4500&&raw.confidence>=60&&raw.score>=56;
  const canFlip=(decisive&&age>=12000)||(confirmed&&age>=25000)||earlyConfirmed;
  if(canFlip)return commit(raw);

  const pressure=Math.max(raw.confidence,raw.score);
  const out:MomentumEngine={
    ...prev.value,
    phase:pressure>=60||prev.value.exhaustion>=60?'EXHAUSTING':'WEAK',
    confidence:Math.max(30,prev.value.confidence-(pressure>=65?5:3)),
    score:Math.max(28,prev.value.score-(pressure>=65?4:2)),
    stability:Math.max(30,prev.value.stability-(pressure>=65?8:5)),
    stateAgeSeconds:Math.round(age/1000),flipPending:true,
    reasons:[
      'إشارة مومنتم عكسية تحت الاختبار؛ لن يتم قلب الاتجاه قبل تكرارها أو ظهور تفوق قوي.',
      ...prev.value.reasons
    ].slice(0,7)
  };
  mem[raw.asset]={...prev,value:out,at:now,pendingSide:raw.side,pendingCount,pendingSince};
  return out;
}

export function buildMomentumEngine(args:{
  asset:'GOLD'|'BTC';
  c1:any[];c5:any[];c15?:any[];
  price:number|null;atr:number|null;
  pulse?:any;marketLead?:any;structure?:any;liquidity?:any;
  now?:number;
}):MomentumEngine{
  const now=Number(args.now||Date.now());
  const c1=closed(args.c1,60000,now,36);
  const c5=closed(args.c5,300000,now,14);
  const c15=closed(args.c15||[],900000,now,8);
  const a=Number(args.atr);
  const empty:MomentumEngine={
    ok:false,asset:args.asset,side:'WAIT',phase:'NEUTRAL',score:0,confidence:0,preMove:false,
    acceleration:0,persistence:0,expansion:0,efficiency:0,closePressure:0,impulse:0,exhaustion:0,
    tickSupport:0,multiTimeframe:0,stability:0,stateAgeSeconds:0,flipPending:false,
    mVolume:{available:false,phase:'QUIET',side:'WAIT',score:0,confidence:0,quality:0,relativeVolume:0,volumeAcceleration:0,directionalPressure:0,flowDelta:0,absorption:0,climax:0,effortResult:0,followThrough:0,divergence:0,cvdSide:'WAIT'},
    targets:{target1:null,target2:null,invalidation:null,target1Kind:'NONE',target2Kind:'NONE',horizonMinutes:15,projectionAtr:0,confidence:0},
    reasons:['بيانات غير كافية لقراءة المومنتم.']
  };
  if(c1.length<16||!Number.isFinite(a)||a<=0)return empty;

  const returns:number[]=[];
  for(let i=1;i<c1.length;i++)returns.push(signedReturn(c1[i-1],c1[i],a));
  const r4=returns.slice(-4),r8=returns.slice(-8),prior4=returns.slice(-8,-4);
  const vNow=avg(r4),vPrev=avg(prior4);
  const accelRaw=vNow-vPrev;

  const dirSign=vNow>0?1:vNow<0?-1:0;
  const aligned8=r8.filter(v=>dirSign!==0&&Math.sign(v)===dirSign).length;
  const persistence=dirSign===0?0:aligned8/Math.max(1,r8.length)*100;

  const recentRanges=c1.slice(-4).map(c=>Number(c.high)-Number(c.low));
  const baseRanges=c1.slice(-20,-4).map(c=>Number(c.high)-Number(c.low));
  const rangeRatio=avg(recentRanges)/Math.max(1e-9,avg(baseRanges));
  const expansion=cap((rangeRatio-.72)*95,0,100);

  const volumeOf=(c:any)=>{
    const real=Number(c?.realVolume),tick=Number(c?.tickVolume),generic=Number(c?.volume);
    if(Number.isFinite(real)&&real>0)return real;
    if(Number.isFinite(tick)&&tick>0)return tick;
    if(Number.isFinite(generic)&&generic>0)return generic;
    return 0;
  };
  const volumeRows=c1.map(c=>({c,v:volumeOf(c)}));
  const usableVolumes=volumeRows.filter(x=>x.v>0);
  const recentVols=volumeRows.slice(-3).map(x=>x.v).filter(v=>v>0);
  const priorVols=volumeRows.slice(-18,-3).map(x=>x.v).filter(v=>v>0);
  const recentVolumeAvg=avg(recentVols),baseVolumeAvg=avg(priorVols);
  const relativeVolume=baseVolumeAvg>0?recentVolumeAvg/baseVolumeAvg:0;
  const prevVols=volumeRows.slice(-6,-3).map(x=>x.v).filter(v=>v>0);
  const prevVolumeAvg=avg(prevVols);
  const rawVolAcceleration=prevVolumeAvg>0?(recentVolumeAvg-prevVolumeAvg)/prevVolumeAvg*100:0;
  const volumeAcceleration=cap(rawVolAcceleration+50,0,100);

  let signedVolume=0,totalVolume=0;
  for(const x of volumeRows.slice(-6)){
    if(x.v<=0)continue;
    const d=candleDrive(x.c)/100;
    signedVolume+=x.v*d;
    totalVolume+=x.v;
  }
  const candleVolumePressure=totalVolume>0?cap(signedVolume/totalVolume*100,-100,100):0;
  const btcFlowDelta=Number(args.liquidity?.flow?.deltaPct);
  const flowDelta=Number.isFinite(btcFlowDelta)?cap(btcFlowDelta,-100,100):0;
  const flowPriceChangeBps=Number(args.liquidity?.flow?.priceChangeBps||0);
  const cvdSide=sideOf(args.liquidity?.flow?.cvdSide);
  const flowAcceleration=cap(Number(args.liquidity?.dynamics?.acceleration||0),-100,100);
  const absorptionSide=sideOf(args.liquidity?.absorption?.side);
  const externalAbsorption=cap(Number(args.liquidity?.absorption?.score||0),0,100);
  const combinedVolumePressure=usableVolumes.length>=6&&Number.isFinite(btcFlowDelta)
    ?candleVolumePressure*.48+flowDelta*.38+flowAcceleration*.14
    :Number.isFinite(btcFlowDelta)&&Math.abs(flowDelta)>0
      ?flowDelta*.78+flowAcceleration*.22
      :candleVolumePressure;


  const drives=c1.slice(-4).map(candleDrive);
  const closes=c1.slice(-4).map(closeLocation);
  const driveSigned=avg(drives);
  const closeSigned=avg(closes);

  const path=c1.slice(-8).map(c=>Number(c.close));
  let travel=0;
  for(let i=1;i<path.length;i++)travel+=Math.abs(path[i]-path[i-1]);
  const net=path.length>1?path.at(-1)!-path[0]:0;
  const efficiency=travel>0?cap(Math.abs(net)/travel*100,0,100):0;

  const recent=c1.slice(-3),last=recent.at(-1)!;
  const lr=Math.max(1e-9,Number(last.high)-Number(last.low));
  const upperWick=(Number(last.high)-Math.max(Number(last.open),Number(last.close)))/lr;
  const lowerWick=(Math.min(Number(last.open),Number(last.close))-Number(last.low))/lr;
  const opposingWick=dirSign>0?upperWick:dirSign<0?lowerWick:Math.max(upperWick,lowerWick);

  const m5ret=c5.length>=3?(Number(c5.at(-1)?.close)-Number(c5.at(-3)?.close))/Math.max(1e-9,a):0;
  const m15ret=c15.length>=2?(Number(c15.at(-1)?.close)-Number(c15.at(-2)?.close))/Math.max(1e-9,a):0;
  const pulseSide=args.pulse?.direction==='UP'?'BUY':args.pulse?.direction==='DOWN'?'SELL':'WAIT';
  const pulseScore=cap(Number(args.pulse?.momentum||0),0,100);
  const leadSide=sideOf(args.marketLead?.side);
  const leadScore=cap(Math.max(Number(args.marketLead?.confidence||0),Number(args.marketLead?.score||0)),0,100);
  const structureSide=sideOf(args.structure?.m1?.nextSide||args.structure?.shortSide||args.structure?.side);

  const signed=
    cap(vNow*62,-42,42)+
    cap(accelRaw*72,-25,25)+
    driveSigned*.16+
    closeSigned*.11+
    cap(m5ret*18,-16,16)+
    cap(m15ret*9,-10,10)+
    (pulseSide==='BUY'?pulseScore*.10:pulseSide==='SELL'?-pulseScore*.10:0)+
    (leadSide==='BUY'?leadScore*.08:leadSide==='SELL'?-leadScore*.08:0);

  let momentumSide:Side=signed>=13?'BUY':signed<=-13?'SELL':'WAIT';
  const absSigned=Math.abs(signed);

  const sideSign=momentumSide==='BUY'?1:momentumSide==='SELL'?-1:0;
  const accelDirectional=sideSign===0?0:cap((accelRaw*sideSign)*125+50,0,100);
  const driveDirectional=sideSign===0?0:cap((driveSigned*sideSign+100)/2,0,100);
  const closeDirectional=sideSign===0?0:cap((closeSigned*sideSign+100)/2,0,100);

  const tickAligned=sideSign!==0&&(
    (pulseSide===momentumSide&&pulseScore>=25)||
    (leadSide===momentumSide&&leadScore>=30)
  );
  const tickSupport=tickAligned?cap(Math.max(pulseScore,leadScore),0,100):0;

  const mtfVotes=[
    sideSign!==0&&Math.sign(vNow)===sideSign,
    sideSign!==0&&Math.sign(m5ret)===sideSign,
    sideSign!==0&&Math.sign(m15ret)===sideSign,
    structureSide===momentumSide
  ];
  const multiTimeframe=Math.round(mtfVotes.filter(Boolean).length/mtfVotes.length*100);

  const impulse=cap(
    absSigned*.72+
    persistence*.18+
    driveDirectional*.18+
    closeDirectional*.14+
    expansion*.16,
    0,100
  );

  const exhaustion=cap(
    opposingWick*100*.42+
    Math.max(0,expansion-70)*.45+
    Math.max(0,55-efficiency)*.38+
    (sideSign!==0&&Math.sign(accelRaw)===-sideSign?28:0),
    0,100
  );

  const volumeAvailable=usableVolumes.length>=6||Math.abs(flowDelta)>0||externalAbsorption>=35;
  let volumeSide:Side=combinedVolumePressure>=9?'BUY':combinedVolumePressure<=-9?'SELL':'WAIT';
  if(absorptionSide!=='WAIT'&&externalAbsorption>=62)volumeSide=absorptionSide;

  const volumeDirectional=sideSign===0?50:cap(50+combinedVolumePressure*sideSign*.5,0,100);
  const relativeVolumeScore=relativeVolume>0?cap((relativeVolume-.62)*82,0,100):0;
  const priceProgress=Math.abs(vNow)*100;
  const effort=Math.max(relativeVolumeScore,cap(Math.abs(combinedVolumePressure),0,100));
  const result=cap(priceProgress*.75+efficiency*.35+expansion*.20,0,100);
  const effortResult=volumeAvailable?cap(result-effort*.38+50,0,100):0;

  const inferredAbsorption=volumeAvailable?cap(
    Math.max(0,relativeVolumeScore-38)*.54+
    Math.max(0,60-efficiency)*.40+
    Math.max(0,35-priceProgress)*.34+
    opposingWick*100*.26,
    0,100
  ):0;
  const volumeAbsorption=Math.round(cap(Math.max(inferredAbsorption,externalAbsorption),0,100));

  const volumeClimax=volumeAvailable?cap(
    Math.max(0,relativeVolume-1.38)*64+
    Math.max(0,expansion-58)*.48+
    Math.max(0,Math.abs(combinedVolumePressure)-52)*.34,
    0,100
  ):0;

  const priceSide:Side=vNow>.025?'BUY':vNow<-.025?'SELL':'WAIT';
  const flowSide:Side=flowDelta>=12?'BUY':flowDelta<=-12?'SELL':cvdSide;
  const divergence=volumeAvailable&&priceSide!=='WAIT'&&volumeSide!=='WAIT'&&priceSide!==volumeSide
    ?cap(Math.abs(combinedVolumePressure)*.72+Math.abs(vNow)*38+(cvdSide!== 'WAIT'&&cvdSide!==priceSide?16:0),0,100)
    :0;

  const followThrough=volumeAvailable?cap(
    (volumeSide===priceSide&&priceSide!=='WAIT'?38:0)+
    Math.min(28,Math.abs(flowPriceChangeBps)*3.4)+
    Math.max(0,efficiency-40)*.48+
    Math.max(0,expansion-30)*.30,
    0,100
  ):0;

  const volumeQuality=cap(
    (usableVolumes.length>=12?34:usableVolumes.length>=6?24:0)+
    (Math.abs(flowDelta)>0?24:0)+
    (cvdSide!=='WAIT'?12:0)+
    (Number(args.liquidity?.quality||0)>=60?18:0)+
    (externalAbsorption>0?12:0),
    0,100
  );

  const volumeScore=volumeAvailable?cap(
    Math.min(100,Math.abs(combinedVolumePressure))*.26+
    relativeVolumeScore*.20+
    volumeAcceleration*.14+
    followThrough*.18+
    effortResult*.12+
    volumeQuality*.10-
    volumeAbsorption*.18-
    divergence*.16,
    0,96
  ):0;

  let volumePhase:'QUIET'|'BUILDING'|'CONFIRMING'|'ABSORBING'|'CLIMAX'|'DIVERGENCE'='QUIET';
  if(volumeAbsorption>=64)volumePhase='ABSORBING';
  else if(divergence>=62)volumePhase='DIVERGENCE';
  else if(volumeClimax>=74)volumePhase='CLIMAX';
  else if(volumeScore>=58&&volumeSide===momentumSide&&followThrough>=42)volumePhase='CONFIRMING';
  else if(volumeAvailable&&relativeVolume>=.88&&volumeAcceleration>=54&&volumeAbsorption<52)volumePhase='BUILDING';

  const volumeConfidence=Math.round(cap(
    volumeScore*.62+
    volumeQuality*.22+
    (volumePhase==='CONFIRMING'?10:0)+
    (volumePhase==='BUILDING'?6:0)-
    (volumePhase==='ABSORBING'?10:0)-
    (volumePhase==='DIVERGENCE'?8:0),
    0,92
  ));

  // Volume is now a first-class gate for price momentum.
  if(volumeAvailable&&volumeConfidence>=58){
    if(volumePhase==='CONFIRMING'&&volumeSide!=='WAIT'&&momentumSide==='WAIT')momentumSide=volumeSide;
    if(volumePhase==='DIVERGENCE'&&volumeSide!=='WAIT'&&momentumSide!==volumeSide){
      // do not flip immediately; neutralize weak price momentum until volume/price resolve
      if(absSigned<34)momentumSide='WAIT';
    }
    if(volumePhase==='ABSORBING'&&absorptionSide!=='WAIT'&&externalAbsorption>=68&&absSigned<40){
      momentumSide=absorptionSide;
    }
  }

  const score=cap(
    impulse*.30+
    persistence*.13+
    accelDirectional*.10+
    efficiency*.07+
    tickSupport*.05+
    multiTimeframe*.10+
    volumeScore*.28+
    volumeConfidence*.08-
    exhaustion*.13-
    (volumePhase==='ABSORBING'&&absorptionSide!==momentumSide?10:0)-
    (volumePhase==='DIVERGENCE'?8:0)-
    (volumePhase==='CLIMAX'&&volumeSide===momentumSide?4:0),
    0,96
  );

  let phase:Phase='NEUTRAL';
  const building=momentumSide!=='WAIT'&&score>=42&&score<70&&accelDirectional>=54&&expansion<70&&exhaustion<60&&(!volumeAvailable||volumePhase==='BUILDING'||volumePhase==='CONFIRMING'||volumeConfidence<48);
  const active=momentumSide!=='WAIT'&&score>=58&&persistence>=50&&expansion>=34&&exhaustion<66&&(!volumeAvailable||volumePhase==='CONFIRMING'||volumeConfidence<50);
  if(momentumSide==='WAIT')phase='NEUTRAL';
  else if(exhaustion>=64&&score<72)phase='EXHAUSTING';
  else if(active)phase='ACTIVE';
  else if(building)phase='BUILDING';
  else phase='WEAK';

  const preMove=Boolean(phase==='BUILDING'&&multiTimeframe>=50&&(tickSupport>=30||structureSide===momentumSide)&&(volumePhase==='BUILDING'||volumePhase==='CONFIRMING'||(!volumeAvailable&&score>=58)));
  let confidence=Math.round(cap(score*.58+multiTimeframe*.12+volumeConfidence*.22+(tickAligned?4:0)+(preMove?6:0),0,90));
  if(phase==='EXHAUSTING')confidence=Math.min(confidence,58);
  if(volumePhase==='DIVERGENCE')confidence=Math.min(confidence,54);
  if(volumePhase==='ABSORBING'&&absorptionSide!==momentumSide)confidence=Math.min(confidence,50);
  if(momentumSide==='WAIT')confidence=Math.min(confidence,35);

  const p=Number(args.price??c1.at(-1)?.close);
  const ahead=(v:number)=>Number.isFinite(v)&&v>0&&(
    momentumSide==='BUY'?v>p+a*.06:
    momentumSide==='SELL'?v<p-a*.06:false
  );
  const recentC1=c1.slice(-18),recentC5=c5.slice(-10);
  const structuralLevels:number[]=[];
  if(momentumSide==='BUY'){
    structuralLevels.push(
      ...recentC1.map(x=>Number(x.high)),
      ...recentC5.map(x=>Number(x.high)),
      Number(args.liquidity?.book?.askWall)
    );
  }else if(momentumSide==='SELL'){
    structuralLevels.push(
      ...recentC1.map(x=>Number(x.low)),
      ...recentC5.map(x=>Number(x.low)),
      Number(args.liquidity?.book?.bidWall)
    );
  }
  const minLevelGap=Math.max(Number(a)*.10,Number(p)*.00004);
  const uniqueLevels=[...new Set<number>(structuralLevels.filter(ahead).map(v=>Number(v.toFixed(6))))]
    .sort((x:number,y:number)=>momentumSide==='BUY'?x-y:y-x)
    .filter((v:number,i:number,arr:number[])=>i===0||Math.abs(v-Number(arr[i-1]))>=minLevelGap);

  const volumeBoost=volumePhase==='CONFIRMING'?0.18:volumePhase==='BUILDING'?0.10:volumePhase==='ABSORBING'?-0.14:volumePhase==='CLIMAX'?-0.08:0;
  const phaseBoost=phase==='ACTIVE'?0.16:phase==='BUILDING'?0.10:phase==='EXHAUSTING'?-0.18:0;
  const strengthFactor=cap((score-40)/100,0,.45);
  const projectionAtr=cap(.52+strengthFactor+volumeBoost+phaseBoost,0.28,1.28);
  const t1Distance=a*projectionAtr;
  const t2Distance=a*cap(projectionAtr*1.72,0.62,2.05);
  const projected1=momentumSide==='BUY'?p+t1Distance:momentumSide==='SELL'?p-t1Distance:NaN;
  const projected2=momentumSide==='BUY'?p+t2Distance:momentumSide==='SELL'?p-t2Distance:NaN;

  const pickLevel=(projected:number,minAtr:number,maxAtr:number)=>{
    if(momentumSide==='WAIT')return null;
    const candidates=uniqueLevels
      .map(v=>({v,d:Math.abs(v-p)/Math.max(a,1e-9)}))
      .filter(x=>x.d>=minAtr&&x.d<=maxAtr);
    if(!candidates.length)return null;
    return candidates.sort((x,y)=>Math.abs(x.v-projected)-Math.abs(y.v-projected))[0].v;
  };
  const level1=pickLevel(projected1,.12,1.35);
  const target1Raw=level1??projected1;
  const level2=pickLevel(projected2,Math.max(.45,Math.abs(target1Raw-p)/Math.max(a,1e-9)+.18),2.25);
  let target2Raw=level2??projected2;
  if(momentumSide==='BUY'&&Number.isFinite(target1Raw)&&target2Raw<=target1Raw+a*.08)target2Raw=target1Raw+a*Math.max(.35,projectionAtr*.55);
  if(momentumSide==='SELL'&&Number.isFinite(target1Raw)&&target2Raw>=target1Raw-a*.08)target2Raw=target1Raw-a*Math.max(.35,projectionAtr*.55);

  const invalidationDistance=a*cap(.38+(100-efficiency)/260+exhaustion/500,0.34,.82);
  const invalidationRaw=momentumSide==='BUY'?p-invalidationDistance:momentumSide==='SELL'?p+invalidationDistance:NaN;
  const targets={
    target1:momentumSide!=='WAIT'&&Number.isFinite(target1Raw)?Number(target1Raw.toFixed(2)):null,
    target2:momentumSide!=='WAIT'&&Number.isFinite(target2Raw)?Number(target2Raw.toFixed(2)):null,
    invalidation:momentumSide!=='WAIT'&&Number.isFinite(invalidationRaw)?Number(invalidationRaw.toFixed(2)):null,
    target1Kind:(momentumSide==='WAIT'?'NONE':level1!=null?'STRUCTURE':'MOMENTUM') as 'LIQUIDITY'|'STRUCTURE'|'MOMENTUM'|'NONE',
    target2Kind:(momentumSide==='WAIT'?'NONE':level2!=null?'STRUCTURE':'MOMENTUM') as 'LIQUIDITY'|'STRUCTURE'|'MOMENTUM'|'NONE',
    horizonMinutes:15,
    projectionAtr:Number(projectionAtr.toFixed(2)),
    confidence:Math.round(cap(confidence-(phase==='EXHAUSTING'?10:0)-(volumePhase==='ABSORBING'?8:0),0,90))
  };

  const reasons:string[]=[];
  if(preMove)reasons.push('التسارع يتكوّن قبل اتساع الحركة.');
  if(persistence>=66)reasons.push('استمرار الدفع في نفس الاتجاه مرتفع.');
  if(expansion>=60)reasons.push('مدى الشموع يتوسع مع الحركة.');
  if(efficiency>=60)reasons.push('الحركة الاتجاهية نظيفة نسبيًا وليست تذبذبًا عشوائيًا.');
  if(tickSupport>=40)reasons.push('الـtick flow وMarket Lead يدعمان المومنتم.');
  if(multiTimeframe>=75)reasons.push('توافق قوي بين أكثر من إطار زمني.');
  if(volumePhase==='BUILDING')reasons.push('M-Volume يرصد زيادة حجم قبل اتساع السعر.');
  if(volumePhase==='CONFIRMING')reasons.push('M-Volume يؤكد الدفع في نفس اتجاه المومنتم.');
  if(volumePhase==='ABSORBING')reasons.push('الحجم مرتفع لكن تقدم السعر ضعيف؛ احتمال امتصاص قائم.');
  if(volumePhase==='CLIMAX')reasons.push('حجم واندفاع مرتفعان جدًا؛ احتمال Volume Climax يحتاج حذرًا.');
  if(volumePhase==='DIVERGENCE')reasons.push('يوجد Divergence بين السعر والحجم؛ الحركة السعرية غير مؤكدة بالحجم.');
  if(effortResult<=38&&volumeAvailable)reasons.push('Effort vs Result ضعيف: حجم ملحوظ لكن النتيجة السعرية محدودة.');
  if(targets.target1!=null)reasons.push('هدف المومنتم الأول '+targets.target1.toFixed(2)+(targets.target1Kind==='STRUCTURE'?' مرتبط بمستوى سعري أمام الحركة.':' مبني على قوة الدفع الحالية.'));
  if(exhaustion>=60)reasons.push('توجد علامات إنهاك/رفض تقلل استمرار المومنتم.');

  const raw:MomentumEngine={
    ok:true,asset:args.asset,side:momentumSide,phase,
    score:Math.round(score),confidence,preMove,
    acceleration:Math.round(accelDirectional),
    persistence:Math.round(persistence),
    expansion:Math.round(expansion),
    efficiency:Math.round(efficiency),
    closePressure:Math.round(closeDirectional),
    impulse:Math.round(impulse),
    exhaustion:Math.round(exhaustion),
    tickSupport:Math.round(tickSupport),
    multiTimeframe,
    stability:0,stateAgeSeconds:0,flipPending:false,
    mVolume:{
      available:volumeAvailable,phase:volumePhase,side:volumeSide,score:Math.round(volumeScore),
      confidence:volumeConfidence,quality:Math.round(volumeQuality),
      relativeVolume:Number(relativeVolume.toFixed(2)),volumeAcceleration:Math.round(volumeAcceleration),
      directionalPressure:Math.round(combinedVolumePressure),flowDelta:Number(flowDelta.toFixed(1)),
      absorption:Math.round(volumeAbsorption),climax:Math.round(volumeClimax),
      effortResult:Math.round(effortResult),followThrough:Math.round(followThrough),divergence:Math.round(divergence),cvdSide
    },
    targets,
    reasons:reasons.slice(0,7)
  };
  return stabilizeMomentum(raw,p,a,now);
}
