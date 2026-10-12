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
  targets:{
    target1:number|null;target2:number|null;invalidation:number|null;
    target1Kind:'STRUCTURE'|'MOMENTUM'|'NONE';
    target2Kind:'STRUCTURE'|'MOMENTUM'|'NONE';
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
  if(!g.__ahmedMomentumMemoryPriceOnly)g.__ahmedMomentumMemoryPriceOnly={GOLD:null,BTC:null};
  return g.__ahmedMomentumMemoryPriceOnly as Record<'GOLD'|'BTC',MomentumMemory|null>;
}
const lerp=(a:number,b:number,k:number)=>a+(b-a)*k;
function stableTarget(prev:number|null,next:number|null,side:Side,price:number,atr:number,k=.22){
  const ahead=(v:number|null)=>v!=null&&Number.isFinite(v)&&(side==='BUY'?v>price+atr*.04:side==='SELL'?v<price-atr*.04:false);
  if(!ahead(prev))return ahead(next)?next:null;
  if(!ahead(next))return prev;
  if(Math.abs(Number(next)-Number(prev))>atr*.65)return prev;
  return Number(lerp(Number(prev),Number(next),k).toFixed(2));
}

function stabilizeMomentum(raw:MomentumEngine,price:number,atr:number,now:number):MomentumEngine{
  if(!raw.ok||!Number.isFinite(price)||!Number.isFinite(atr)||atr<=0)return raw;
  const mem=momentumMemory(),prev=mem[raw.asset];
  const commit=(value:MomentumEngine,sideSince=now)=>{
    const out={...value,stability:value.side==='WAIT'?30:58,stateAgeSeconds:0,flipPending:false};
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
    const phase:Phase=
      raw.phase==='EXHAUSTING'?'EXHAUSTING':
      prev.value.phase==='ACTIVE'&&raw.phase==='WEAK'&&raw.score>=46&&raw.exhaustion<58?'ACTIVE':
      prev.value.phase==='BUILDING'&&raw.phase==='WEAK'&&raw.score>=40&&raw.exhaustion<56?'BUILDING':
      raw.phase;
    const t1=stableTarget(prev.value.targets?.target1??null,raw.targets?.target1??null,raw.side,price,atr,.20);
    const t2=stableTarget(prev.value.targets?.target2??null,raw.targets?.target2??null,raw.side,price,atr,.18);
    const inv=stableTarget(prev.value.targets?.invalidation??null,raw.targets?.invalidation??null,raw.side==='BUY'?'SELL':raw.side==='SELL'?'BUY':'WAIT',price,atr,.26);
    const out:MomentumEngine={
      ...raw,phase,
      score:Math.round(lerp(prev.value.score,raw.score,.28)),
      confidence:Math.round(lerp(prev.value.confidence,raw.confidence,.28)),
      acceleration:Math.round(lerp(prev.value.acceleration,raw.acceleration,.34)),
      persistence:Math.round(lerp(prev.value.persistence,raw.persistence,.28)),
      expansion:Math.round(lerp(prev.value.expansion,raw.expansion,.28)),
      efficiency:Math.round(lerp(prev.value.efficiency,raw.efficiency,.28)),
      closePressure:Math.round(lerp(prev.value.closePressure,raw.closePressure,.34)),
      impulse:Math.round(lerp(prev.value.impulse,raw.impulse,.28)),
      exhaustion:Math.round(lerp(prev.value.exhaustion,raw.exhaustion,.36)),
      tickSupport:Math.round(lerp(prev.value.tickSupport,raw.tickSupport,.36)),
      multiTimeframe:Math.round(lerp(prev.value.multiTimeframe,raw.multiTimeframe,.30)),
      stability:Math.round(cap(58+Math.min(28,age/1000*.5)+(raw.multiTimeframe>=75?8:0)-raw.exhaustion*.10,34,96)),
      stateAgeSeconds:Math.round(age/1000),flipPending:false,
      targets:{...raw.targets,target1:t1,target2:t2,invalidation:inv},
      reasons:[...raw.reasons.slice(0,6),'اتجاه المومنتم مثبت بذاكرة زمنية ولا ينعكس من نبضة واحدة.'].slice(0,7)
    };
    mem[raw.asset]={value:out,at:now,sideSince:prev.sideSince,pendingSide:'WAIT',pendingCount:0,pendingSince:0};
    return out;
  }

  if(raw.side==='WAIT'&&prevSide!=='WAIT'){
    if(age<=60000&&prevTargetAhead&&raw.confidence<=42){
      const out:MomentumEngine={
        ...prev.value,phase:prev.value.phase==='EXHAUSTING'?'EXHAUSTING':'WEAK',
        confidence:Math.max(28,prev.value.confidence-4),score:Math.max(26,prev.value.score-3),
        stability:Math.max(32,prev.value.stability-5),stateAgeSeconds:Math.round(age/1000),flipPending:false,
        reasons:['المومنتم فقد الحسم مؤقتًا لكن الاتجاه السابق لم يُلغَ بعد.',...prev.value.reasons].slice(0,7)
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
  const pendingAge=now-pendingSince;
  const decisive=raw.confidence>=74&&raw.score>=70&&raw.multiTimeframe>=75&&raw.impulse>=70;
  const confirmed=pendingCount>=3&&pendingAge>=8000&&raw.confidence>=58&&raw.score>=54&&raw.multiTimeframe>=50;
  const targetConsumed=!prevTargetAhead;
  const earlyConfirmed=targetConsumed&&pendingCount>=2&&pendingAge>=4500&&raw.confidence>=62&&raw.score>=58;
  if((decisive&&age>=12000)||(confirmed&&age>=25000)||earlyConfirmed)return commit(raw);

  const pressure=Math.max(raw.confidence,raw.score);
  const out:MomentumEngine={
    ...prev.value,phase:pressure>=60||prev.value.exhaustion>=60?'EXHAUSTING':'WEAK',
    confidence:Math.max(28,prev.value.confidence-(pressure>=65?5:3)),
    score:Math.max(26,prev.value.score-(pressure>=65?4:2)),
    stability:Math.max(28,prev.value.stability-(pressure>=65?8:5)),
    stateAgeSeconds:Math.round(age/1000),flipPending:true,
    reasons:['إشارة عكسية تحت الاختبار؛ لن يتم قلب المومنتم قبل تكرارها.',...prev.value.reasons].slice(0,7)
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
  const c1=closed(args.c1,60000,now,40);
  const c5=closed(args.c5,300000,now,16);
  const c15=closed(args.c15||[],900000,now,10);
  const a=Number(args.atr);
  const empty:MomentumEngine={
    ok:false,asset:args.asset,side:'WAIT',phase:'NEUTRAL',score:0,confidence:0,preMove:false,
    acceleration:0,persistence:0,expansion:0,efficiency:0,closePressure:0,impulse:0,exhaustion:0,
    tickSupport:0,multiTimeframe:0,stability:0,stateAgeSeconds:0,flipPending:false,
    targets:{target1:null,target2:null,invalidation:null,target1Kind:'NONE',target2Kind:'NONE',horizonMinutes:15,projectionAtr:0,confidence:0},
    reasons:['بيانات غير كافية لقراءة المومنتم.']
  };
  if(c1.length<18||c5.length<4||!Number.isFinite(a)||a<=0)return empty;

  const returns:number[]=[];
  for(let i=1;i<c1.length;i++)returns.push(signedReturn(c1[i-1],c1[i],a));
  const r4=returns.slice(-4),r8=returns.slice(-8),prior4=returns.slice(-8,-4);
  const vNow=avg(r4),vPrev=avg(prior4),accelRaw=vNow-vPrev;
  const dirSign=vNow>0?1:vNow<0?-1:0;
  const persistence=dirSign===0?0:r8.filter(v=>Math.sign(v)===dirSign).length/Math.max(1,r8.length)*100;

  const recentRanges=c1.slice(-4).map(c=>Number(c.high)-Number(c.low));
  const baseRanges=c1.slice(-20,-4).map(c=>Number(c.high)-Number(c.low));
  const rangeRatio=avg(recentRanges)/Math.max(1e-9,avg(baseRanges));
  const expansion=cap((rangeRatio-.72)*95,0,100);

  const driveSigned=avg(c1.slice(-4).map(candleDrive));
  const closeSigned=avg(c1.slice(-4).map(closeLocation));
  const path=c1.slice(-8).map(c=>Number(c.close));
  let travel=0;for(let i=1;i<path.length;i++)travel+=Math.abs(path[i]-path[i-1]);
  const net=path.length>1?path.at(-1)!-path[0]:0;
  const efficiency=travel>0?cap(Math.abs(net)/travel*100,0,100):0;

  const last=c1.at(-1)!;
  const lr=Math.max(1e-9,Number(last.high)-Number(last.low));
  const upperWick=(Number(last.high)-Math.max(Number(last.open),Number(last.close)))/lr;
  const lowerWick=(Math.min(Number(last.open),Number(last.close))-Number(last.low))/lr;

  const m5ret=c5.length>=3?(Number(c5.at(-1)?.close)-Number(c5.at(-3)?.close))/Math.max(1e-9,a):0;
  const m15ret=c15.length>=2?(Number(c15.at(-1)?.close)-Number(c15.at(-2)?.close))/Math.max(1e-9,a):0;
  const pulseSide=args.pulse?.direction==='UP'?'BUY':args.pulse?.direction==='DOWN'?'SELL':'WAIT';
  const pulseScore=cap(Number(args.pulse?.momentum||0),0,100);
  const leadSide=sideOf(args.marketLead?.side);
  const leadScore=cap(Math.max(Number(args.marketLead?.confidence||0),Number(args.marketLead?.score||0)),0,100);
  const structureSide=sideOf(args.structure?.m1?.nextSide||args.structure?.shortSide||args.structure?.side);

  // M5/M15 dominate the 15m momentum direction; M1 pulse only times it.
  const signed=
    cap(vNow*42,-30,30)+
    cap(accelRaw*54,-18,18)+
    driveSigned*.10+
    closeSigned*.08+
    cap(m5ret*28,-24,24)+
    cap(m15ret*26,-24,24)+
    (pulseSide==='BUY'?pulseScore*.04:pulseSide==='SELL'?-pulseScore*.04:0)+
    (leadSide==='BUY'?leadScore*.04:leadSide==='SELL'?-leadScore*.04:0);

  const momentumSide:Side=signed>=14?'BUY':signed<=-14?'SELL':'WAIT';
  const sideSign=momentumSide==='BUY'?1:momentumSide==='SELL'?-1:0;
  const accelDirectional=sideSign===0?0:cap((accelRaw*sideSign)*120+50,0,100);
  const driveDirectional=sideSign===0?0:cap((driveSigned*sideSign+100)/2,0,100);
  const closeDirectional=sideSign===0?0:cap((closeSigned*sideSign+100)/2,0,100);
  const opposingWick=sideSign>0?upperWick:sideSign<0?lowerWick:Math.max(upperWick,lowerWick);

  const tickAligned=sideSign!==0&&((pulseSide===momentumSide&&pulseScore>=30)||(leadSide===momentumSide&&leadScore>=35));
  const tickSupport=tickAligned?cap(Math.max(pulseScore,leadScore),0,100):0;
  const mtfVotes=[
    sideSign!==0&&Math.sign(vNow)===sideSign,
    sideSign!==0&&Math.sign(m5ret)===sideSign,
    sideSign!==0&&Math.sign(m15ret)===sideSign,
    structureSide===momentumSide
  ];
  const multiTimeframe=Math.round(mtfVotes.filter(Boolean).length/mtfVotes.length*100);
  const impulse=cap(Math.abs(signed)*.72+persistence*.18+driveDirectional*.16+closeDirectional*.12+expansion*.14,0,100);
  const exhaustion=cap(opposingWick*100*.46+Math.max(0,expansion-72)*.42+Math.max(0,52-efficiency)*.34+(sideSign!==0&&Math.sign(accelRaw)===-sideSign?26:0),0,100);

  const score=cap(
    impulse*.38+persistence*.17+accelDirectional*.12+efficiency*.10+
    multiTimeframe*.20+tickSupport*.03-exhaustion*.15,
    0,96
  );

  let phase:Phase='NEUTRAL';
  const building=momentumSide!=='WAIT'&&score>=44&&score<70&&accelDirectional>=56&&multiTimeframe>=50&&exhaustion<58;
  const active=momentumSide!=='WAIT'&&score>=60&&persistence>=50&&multiTimeframe>=50&&exhaustion<64;
  if(momentumSide==='WAIT')phase='NEUTRAL';
  else if(exhaustion>=64&&score<74)phase='EXHAUSTING';
  else if(active)phase='ACTIVE';
  else if(building)phase='BUILDING';
  else phase='WEAK';

  const preMove=Boolean(phase==='BUILDING'&&multiTimeframe>=75&&(structureSide===momentumSide||tickSupport>=40));
  let confidence=Math.round(cap(score*.70+multiTimeframe*.20+(tickAligned?4:0)+(preMove?5:0),0,90));
  if(phase==='EXHAUSTING')confidence=Math.min(confidence,58);
  if(momentumSide==='WAIT')confidence=Math.min(confidence,34);

  const p=Number(args.price??c1.at(-1)?.close);
  const ahead=(v:number)=>Number.isFinite(v)&&v>0&&(momentumSide==='BUY'?v>p+a*.06:momentumSide==='SELL'?v<p-a*.06:false);
  const structuralLevels:number[]=[];
  if(momentumSide==='BUY')structuralLevels.push(...c1.slice(-18).map(x=>Number(x.high)),...c5.slice(-10).map(x=>Number(x.high)));
  if(momentumSide==='SELL')structuralLevels.push(...c1.slice(-18).map(x=>Number(x.low)),...c5.slice(-10).map(x=>Number(x.low)));
  const minGap=Math.max(a*.10,p*.00004);
  const levels=[...new Set<number>(structuralLevels.filter(ahead).map(v=>Number(v.toFixed(6))))]
    .sort((x,y)=>momentumSide==='BUY'?x-y:y-x)
    .filter((v,i,arr)=>i===0||Math.abs(v-arr[i-1])>=minGap);

  const phaseBoost=phase==='ACTIVE'?.16:phase==='BUILDING'?.10:phase==='EXHAUSTING'?-.18:0;
  const projectionAtr=cap(.50+cap((score-42)/100,0,.42)+phaseBoost,0.30,1.18);
  const projected1=momentumSide==='BUY'?p+a*projectionAtr:momentumSide==='SELL'?p-a*projectionAtr:NaN;
  const projected2=momentumSide==='BUY'?p+a*cap(projectionAtr*1.68,.62,1.90):momentumSide==='SELL'?p-a*cap(projectionAtr*1.68,.62,1.90):NaN;
  const pick=(projected:number,minAtr:number,maxAtr:number)=>{
    const c=levels.map(v=>({v,d:Math.abs(v-p)/Math.max(a,1e-9)})).filter(x=>x.d>=minAtr&&x.d<=maxAtr);
    return c.length?c.sort((x,y)=>Math.abs(x.v-projected)-Math.abs(y.v-projected))[0].v:null;
  };
  const l1=momentumSide!=='WAIT'?pick(projected1,.14,1.30):null;
  const t1=l1??projected1;
  const l2=momentumSide!=='WAIT'?pick(projected2,Math.max(.48,Math.abs(t1-p)/Math.max(a,1e-9)+.18),2.0):null;
  let t2=l2??projected2;
  if(momentumSide==='BUY'&&Number.isFinite(t1)&&t2<=t1+a*.08)t2=t1+a*Math.max(.34,projectionAtr*.52);
  if(momentumSide==='SELL'&&Number.isFinite(t1)&&t2>=t1-a*.08)t2=t1-a*Math.max(.34,projectionAtr*.52);
  const invDist=a*cap(.40+(100-efficiency)/280+exhaustion/520,.34,.78);
  const inv=momentumSide==='BUY'?p-invDist:momentumSide==='SELL'?p+invDist:NaN;
  const targets={
    target1:momentumSide!=='WAIT'&&Number.isFinite(t1)?Number(t1.toFixed(2)):null,
    target2:momentumSide!=='WAIT'&&Number.isFinite(t2)?Number(t2.toFixed(2)):null,
    invalidation:momentumSide!=='WAIT'&&Number.isFinite(inv)?Number(inv.toFixed(2)):null,
    target1Kind:(momentumSide==='WAIT'?'NONE':l1!=null?'STRUCTURE':'MOMENTUM') as 'STRUCTURE'|'MOMENTUM'|'NONE',
    target2Kind:(momentumSide==='WAIT'?'NONE':l2!=null?'STRUCTURE':'MOMENTUM') as 'STRUCTURE'|'MOMENTUM'|'NONE',
    horizonMinutes:15,projectionAtr:Number(projectionAtr.toFixed(2)),
    confidence:Math.round(cap(confidence-(phase==='EXHAUSTING'?10:0),0,90))
  };

  const reasons:string[]=[];
  if(preMove)reasons.push('تسارع سعري متوافق مع M5/M15 قبل اتساع الحركة.');
  if(persistence>=66)reasons.push('استمرار الدفع في نفس الاتجاه مرتفع.');
  if(expansion>=60)reasons.push('مدى الشموع يتوسع مع الحركة.');
  if(efficiency>=60)reasons.push('الحركة الاتجاهية نظيفة نسبيًا.');
  if(multiTimeframe>=75)reasons.push('توافق قوي بين M5/M15 والهيكل.');
  if(exhaustion>=60)reasons.push('علامات إنهاك/رفض تقلل استمرار المومنتم.');
  if(targets.target1!=null)reasons.push('هدف المومنتم الأول '+targets.target1.toFixed(2)+'.');

  const raw:MomentumEngine={
    ok:true,asset:args.asset,side:momentumSide,phase,score:Math.round(score),confidence,preMove,
    acceleration:Math.round(accelDirectional),persistence:Math.round(persistence),expansion:Math.round(expansion),
    efficiency:Math.round(efficiency),closePressure:Math.round(closeDirectional),impulse:Math.round(impulse),
    exhaustion:Math.round(exhaustion),tickSupport:Math.round(tickSupport),multiTimeframe,
    stability:0,stateAgeSeconds:0,flipPending:false,targets,reasons:reasons.slice(0,7)
  };
  return stabilizeMomentum(raw,p,a,now);
}
