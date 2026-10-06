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
  mVolume:{
    available:boolean;phase:'QUIET'|'BUILDING'|'CONFIRMING'|'ABSORBING'|'CLIMAX';side:Side;score:number;
    relativeVolume:number;volumeAcceleration:number;directionalPressure:number;flowDelta:number;absorption:number;climax:number;
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
    tickSupport:0,multiTimeframe:0,
    mVolume:{available:false,phase:'QUIET',side:'WAIT',score:0,relativeVolume:0,volumeAcceleration:0,directionalPressure:0,flowDelta:0,absorption:0,climax:0},
    reasons:['بيانات غير كافية لقراءة المومنتم.']
  };
  if(c1.length<16||!Number.isFinite(a)||a<=0)return empty;

  const returns:number[]=[];
  for(let i=1;i<c1.length;i++)returns.push(signedReturn(c1[i-1],c1[i],a));
  const r3=returns.slice(-3),r6=returns.slice(-6),prior3=returns.slice(-6,-3);
  const vNow=avg(r3),vPrev=avg(prior3);
  const accelRaw=vNow-vPrev;

  const dirSign=vNow>0?1:vNow<0?-1:0;
  const aligned6=r6.filter(v=>dirSign!==0&&Math.sign(v)===dirSign).length;
  const persistence=dirSign===0?0:aligned6/Math.max(1,r6.length)*100;

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
  const combinedVolumePressure=usableVolumes.length>=6&&Number.isFinite(btcFlowDelta)
    ?candleVolumePressure*.58+flowDelta*.42
    :Number.isFinite(btcFlowDelta)&&Math.abs(flowDelta)>0?flowDelta:candleVolumePressure;


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

  let momentumSide:Side=signed>=10?'BUY':signed<=-10?'SELL':'WAIT';
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

  const volumeAvailable=usableVolumes.length>=6||Math.abs(flowDelta)>0;
  const volumeSide:Side=combinedVolumePressure>=10?'BUY':combinedVolumePressure<=-10?'SELL':'WAIT';
  const volumeDirectional=sideSign===0?0:cap(50+combinedVolumePressure*sideSign*.5,0,100);
  const relativeVolumeScore=relativeVolume>0?cap((relativeVolume-.65)*78,0,100):0;
  const priceProgress=Math.abs(vNow)*100;
  const volumeAbsorption=volumeAvailable?cap(
    Math.max(0,relativeVolumeScore-42)*.58+
    Math.max(0,62-efficiency)*.42+
    Math.max(0,38-priceProgress)*.35+
    opposingWick*100*.28,
    0,100
  ):0;
  const volumeClimax=volumeAvailable?cap(
    Math.max(0,relativeVolume-1.45)*62+
    Math.max(0,expansion-62)*.52+
    Math.max(0,Math.abs(combinedVolumePressure)-55)*.36,
    0,100
  ):0;
  const volumeScore=volumeAvailable?cap(
    volumeDirectional*.38+
    relativeVolumeScore*.24+
    volumeAcceleration*.17+
    Math.min(100,Math.abs(combinedVolumePressure))*.21-
    volumeAbsorption*.24,
    0,96
  ):0;
  let volumePhase:'QUIET'|'BUILDING'|'CONFIRMING'|'ABSORBING'|'CLIMAX'='QUIET';
  if(volumeAbsorption>=62)volumePhase='ABSORBING';
  else if(volumeClimax>=72)volumePhase='CLIMAX';
  else if(volumeScore>=60&&volumeSide===momentumSide)volumePhase='CONFIRMING';
  else if(volumeAvailable&&relativeVolume>=.92&&volumeAcceleration>=56)volumePhase='BUILDING';


  const score=cap(
    impulse*.45+
    persistence*.18+
    accelDirectional*.14+
    efficiency*.10+
    tickSupport*.07+
    multiTimeframe*.12+
    volumeScore*.13-
    exhaustion*.16-
    (volumePhase==='ABSORBING'?6:0)-
    (volumePhase==='CLIMAX'&&volumeSide===momentumSide?3:0),
    0,96
  );

  let phase:Phase='NEUTRAL';
  const building=momentumSide!=='WAIT'&&score>=42&&score<68&&accelDirectional>=58&&expansion<68&&exhaustion<58&&(volumePhase!=='ABSORBING');
  const active=momentumSide!=='WAIT'&&score>=58&&persistence>=50&&expansion>=36&&exhaustion<66&&volumePhase!=='ABSORBING';
  if(momentumSide==='WAIT')phase='NEUTRAL';
  else if(exhaustion>=64&&score<72)phase='EXHAUSTING';
  else if(active)phase='ACTIVE';
  else if(building)phase='BUILDING';
  else phase='WEAK';

  const preMove=Boolean(phase==='BUILDING'&&multiTimeframe>=50&&(tickSupport>=35||structureSide===momentumSide)&&(!volumeAvailable||volumePhase==='BUILDING'||volumePhase==='CONFIRMING'));
  let confidence=Math.round(cap(score*.72+multiTimeframe*.16+(tickAligned?6:0)+(preMove?5:0),0,90));
  if(phase==='EXHAUSTING')confidence=Math.min(confidence,58);
  if(momentumSide==='WAIT')confidence=Math.min(confidence,35);

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
  if(exhaustion>=60)reasons.push('توجد علامات إنهاك/رفض تقلل استمرار المومنتم.');

  return {
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
    mVolume:{
      available:volumeAvailable,phase:volumePhase,side:volumeSide,score:Math.round(volumeScore),
      relativeVolume:Number(relativeVolume.toFixed(2)),volumeAcceleration:Math.round(volumeAcceleration),
      directionalPressure:Math.round(combinedVolumePressure),flowDelta:Number(flowDelta.toFixed(1)),
      absorption:Math.round(volumeAbsorption),climax:Math.round(volumeClimax)
    },
    reasons:reasons.slice(0,6)
  };
}
