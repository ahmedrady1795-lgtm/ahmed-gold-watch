export type PredatorSide='BUY'|'SELL'|'WAIT';
export type PredatorPhase='HUNT'|'TRACK'|'AMBUSH'|'ATTACK'|'ABORT'|'COOLDOWN';

type Observation={
  at:number;price:number;side:PredatorSide;edge:number;evidence:number;liveSupport:number;liveOpposition:number;
  tickSide:PredatorSide;tickStage:string;tickScore:number;liqSide:PredatorSide;liqScore:number;
  motionSide:PredatorSide;motionStage:string;motionScore:number;preSide:PredatorSide;preScore:number;preArmed:boolean;
  late:boolean;trapSide:PredatorSide;trapScore:number;mode:string;accumulationPhase:string;accumulationReadiness:number;
  reactionAligned:boolean;accumulationAligned:boolean;
};

type PredatorState={
  candidate:PredatorSide;candidateSince:number;stableCount:number;lastSeenAt:number;
  lastAttackAt:number;lastAttackSide:PredatorSide;cooldownUntil:number;obs:Observation[];
};

type Root={states:Record<string,PredatorState>};
declare global {
  // eslint-disable-next-line no-var
  var __predatorScalpV7:Root|undefined;
}

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const side=(v:any):PredatorSide=>v==='BUY'||v==='SELL'?v:'WAIT';
function root():Root{if(!globalThis.__predatorScalpV7)globalThis.__predatorScalpV7={states:{}};return globalThis.__predatorScalpV7;}
function freshState(now:number):PredatorState{return{candidate:'WAIT',candidateSince:0,stableCount:0,lastSeenAt:now,lastAttackAt:0,lastAttackSide:'WAIT',cooldownUntil:0,obs:[]};}

export function evaluatePredatorScalp(asset:string,input:any){
  const now=Number(input?.now)||Date.now(),key=String(asset||'BTC').toUpperCase(),r=root();
  let st=r.states[key]||freshState(now);
  if(now-st.lastSeenAt>45000)st=freshState(now);

  const o:Observation={
    at:now,price:Number(input?.price)||0,side:side(input?.side),edge:Number(input?.edge)||0,evidence:Number(input?.evidence)||0,
    liveSupport:Number(input?.liveSupport)||0,liveOpposition:Number(input?.liveOpposition)||0,
    tickSide:side(input?.tickSide),tickStage:String(input?.tickStage||'WARMING'),tickScore:Number(input?.tickScore)||0,
    liqSide:side(input?.liqSide),liqScore:Number(input?.liqScore)||0,
    motionSide:side(input?.motionSide),motionStage:String(input?.motionStage||'WAIT'),motionScore:Number(input?.motionScore)||0,
    preSide:side(input?.preSide),preScore:Number(input?.preScore)||0,preArmed:Boolean(input?.preArmed),
    late:Boolean(input?.late),trapSide:side(input?.trapSide),trapScore:Number(input?.trapScore)||0,
    mode:String(input?.mode||'FLOW').toUpperCase(),accumulationPhase:String(input?.accumulationPhase||'NEUTRAL'),
    accumulationReadiness:Number(input?.accumulationReadiness)||0,reactionAligned:Boolean(input?.reactionAligned),
    accumulationAligned:Boolean(input?.accumulationAligned)
  };

  const last=st.obs.at(-1);
  if(!last||now-last.at>=250||last.side!==o.side||Math.abs(last.price-o.price)>1e-8)st.obs.push(o);
  st.obs=st.obs.filter(x=>now-x.at<=12000).slice(-32);
  st.lastSeenAt=now;

  if(o.side==='WAIT'){
    if(now-st.candidateSince>3500){st.candidate='WAIT';st.stableCount=0;}
    r.states[key]=st;
    return {version:'predator-scalp-v7',phase:'HUNT' as PredatorPhase,side:'WAIT' as PredatorSide,score:0,attack:false,watch:false,
      pattern:'NO_EDGE',stableCount:st.stableCount,ageMs:0,reasons:['لا يوجد اتجاه حي متماسك'],cooldownMs:Math.max(0,st.cooldownUntil-now)};
  }

  if(st.candidate!==o.side){
    st.candidate=o.side;st.candidateSince=now;st.stableCount=1;
  }else{
    const prev=st.obs.length>=2?st.obs[st.obs.length-2]:null;
    if(!prev||prev.side===o.side)st.stableCount=Math.min(12,st.stableCount+1);
  }

  const recent=st.obs.filter(x=>now-x.at<=6500);
  const same=recent.filter(x=>x.side===o.side);
  const opposite=recent.filter(x=>x.side!=='WAIT'&&x.side!==o.side);
  const persistence=same.length/Math.max(1,same.length+opposite.length);
  const ageMs=Math.max(0,now-st.candidateSince);
  const firstSame=same[0]||o;
  const edgeSlope=o.edge-firstSame.edge;
  const evidenceSlope=o.evidence-firstSame.evidence;

  const tickAligned=o.tickSide===o.side&&o.tickScore>=48;
  const liqAligned=o.liqSide===o.side&&o.liqScore>=28;
  const motionAligned=o.motionSide===o.side&&o.motionScore>=42;
  const preAligned=o.preSide===o.side&&o.preScore>=48;
  const trapAligned=o.trapSide===o.side&&o.trapScore>=66;
  const hardOpposition=[o.tickSide,o.liqSide,o.motionSide,o.trapSide].filter(x=>x!=='WAIT'&&x!==o.side).length;

  const premoveAmbush=Boolean(o.preArmed&&preAligned&&tickAligned&&liqAligned&&!o.late);
  const trapReversal=Boolean(trapAligned&&motionAligned&&['REVERSAL_ALERT','PRE_MOVE','IGNITION'].includes(o.motionStage)&&(liqAligned||tickAligned));
  const breakoutPreload=Boolean(
    o.accumulationAligned&&o.accumulationReadiness>=56&&
    ['MARKUP_READY','MARKDOWN_READY','ACCUMULATING','DISTRIBUTING'].includes(o.accumulationPhase)&&
    liqAligned&&(tickAligned||motionAligned)&&!o.late
  );
  const compressionBreak=Boolean(
    o.mode==='COMPRESSION'&&preAligned&&tickAligned&&liqAligned&&motionAligned&&!o.late
  );
  const flowAmbush=Boolean(
    tickAligned&&liqAligned&&motionAligned&&o.liveSupport>=3&&o.liveOpposition===0&&
    o.edge>=72&&o.evidence>=68&&!o.late
  );

  let pattern='FLOW_TRACK';
  if(trapReversal)pattern='TRAP_REVERSAL';
  else if(premoveAmbush)pattern='PREMOVE_AMBUSH';
  else if(compressionBreak)pattern='COMPRESSION_BREAK';
  else if(breakoutPreload)pattern='BREAKOUT_PRELOAD';
  else if(flowAmbush)pattern='FLOW_AMBUSH';

  let score=0;
  score+=cap(o.edge,0,100)*.22+cap(o.evidence,0,92)*.20;
  score+=Math.min(18,o.liveSupport*4.2)-Math.min(20,o.liveOpposition*8);
  if(tickAligned)score+=9;if(liqAligned)score+=10;if(motionAligned)score+=9;if(preAligned)score+=8;if(trapAligned)score+=12;
  if(o.reactionAligned)score+=6;if(o.accumulationAligned)score+=5;
  score+=Math.min(10,Math.max(0,st.stableCount-1)*2.4);
  score+=Math.min(8,Math.max(0,persistence-.5)*16);
  score+=Math.min(6,Math.max(0,edgeSlope)*.18)+Math.min(4,Math.max(0,evidenceSlope)*.12);
  score-=hardOpposition*10;
  if(o.late)score-=22;
  if(pattern==='PREMOVE_AMBUSH')score+=10;
  if(pattern==='TRAP_REVERSAL')score+=12;
  if(pattern==='COMPRESSION_BREAK')score+=10;
  if(pattern==='BREAKOUT_PRELOAD')score+=7;
  score=cap(score,0,96);

  const flipAfterAttack=Boolean(st.lastAttackAt&&now-st.lastAttackAt<7000&&st.lastAttackSide!==o.side);
  if(flipAfterAttack)st.cooldownUntil=Math.max(st.cooldownUntil,now+3500);
  const inCooldown=now<st.cooldownUntil;

  const temporalReady=Boolean(st.stableCount>=2&&ageMs>=700&&persistence>=.66&&opposite.length<=1);
  // Shock patterns may reach AMBUSH quickly, but ATTACK still needs minimum temporal evidence.
  // This prevents one-snapshot trap/premove spikes from bypassing persistence confirmation.
  const shockTemporalReady=Boolean(st.stableCount>=2&&ageMs>=500&&persistence>=.75&&opposite.length===0);
  const shockReady=Boolean((pattern==='TRAP_REVERSAL'||pattern==='PREMOVE_AMBUSH')&&score>=84&&hardOpposition===0&&shockTemporalReady);
  const attackPattern=['PREMOVE_AMBUSH','TRAP_REVERSAL','COMPRESSION_BREAK','BREAKOUT_PRELOAD','FLOW_AMBUSH'].includes(pattern);
  const attack=Boolean(
    !inCooldown&&!o.late&&attackPattern&&score>=74&&hardOpposition===0&&
    o.liveOpposition===0&&(temporalReady||shockReady)
  );
  const watch=Boolean(!attack&&!inCooldown&&!o.late&&score>=56&&hardOpposition<=1&&(same.length>=2||pattern!=='FLOW_TRACK'));

  let phase:PredatorPhase='HUNT';
  if(inCooldown)phase='COOLDOWN';
  else if(o.late&&score>=45)phase='ABORT';
  else if(attack)phase='ATTACK';
  else if(watch)phase='AMBUSH';
  else if(score>=40)phase='TRACK';

  if(attack){st.lastAttackAt=now;st.lastAttackSide=o.side;}
  r.states[key]=st;

  const reasons:string[]=[];
  reasons.push(pattern);
  if(temporalReady)reasons.push('TEMPORAL_CONFIRM');
  if(shockReady)reasons.push('SHOCK_CONFIRM');
  if(tickAligned)reasons.push('TICK');
  if(liqAligned)reasons.push('L2');
  if(motionAligned)reasons.push('MOTION');
  if(preAligned)reasons.push('PREMOVE');
  if(trapAligned)reasons.push('TRAP');
  if(o.late)reasons.push('NO_CHASE');
  if(hardOpposition)reasons.push('OPPOSITION_'+hardOpposition);

  return {
    version:'predator-scalp-v7',phase,side:o.side,score:Math.round(score),attack,watch,pattern,
    stableCount:st.stableCount,ageMs,persistence:Number(persistence.toFixed(2)),edgeSlope:Number(edgeSlope.toFixed(1)),
    evidenceSlope:Number(evidenceSlope.toFixed(1)),hardOpposition,temporalReady,shockReady,inCooldown,
    cooldownMs:Math.max(0,st.cooldownUntil-now),late:o.late,
    alignment:{tick:tickAligned,liquidity:liqAligned,motion:motionAligned,premove:preAligned,trap:trapAligned},
    reasons
  };
}
