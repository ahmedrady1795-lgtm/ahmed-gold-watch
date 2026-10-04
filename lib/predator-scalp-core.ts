export type PredatorSide='BUY'|'SELL'|'WAIT';
export type PredatorPhase='HUNT'|'TRACK'|'AMBUSH'|'ATTACK'|'ABORT'|'COOLDOWN';

type Observation={
  at:number;price:number;side:PredatorSide;edge:number;evidence:number;liveSupport:number;liveOpposition:number;
  tickSide:PredatorSide;tickStage:string;tickScore:number;liqSide:PredatorSide;liqScore:number;
  motionSide:PredatorSide;motionStage:string;motionScore:number;preSide:PredatorSide;preScore:number;preArmed:boolean;
  late:boolean;trapSide:PredatorSide;trapScore:number;mode:string;accumulationPhase:string;accumulationReadiness:number;
  reactionAligned:boolean;accumulationAligned:boolean;
  microAvailable:boolean;pressure:number;depthImbalance:number;weightedImbalance:number;microEdge:number;
  flowDelta:number;priceChangeBps:number;pressureChange:number;bidDepthChange:number;askDepthChange:number;acceleration:number;
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
    accumulationAligned:Boolean(input?.accumulationAligned),
    microAvailable:Boolean(input?.microAvailable),pressure:Number(input?.pressure)||0,
    depthImbalance:Number(input?.depthImbalance)||0,weightedImbalance:Number(input?.weightedImbalance)||0,
    microEdge:Number(input?.microEdge)||0,flowDelta:Number(input?.flowDelta)||0,priceChangeBps:Number(input?.priceChangeBps)||0,
    pressureChange:Number(input?.pressureChange)||0,bidDepthChange:Number(input?.bidDepthChange)||0,
    askDepthChange:Number(input?.askDepthChange)||0,acceleration:Number(input?.acceleration)||0
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
  const dir=o.side==='BUY'?1:-1;
  const microDirectionalScore=(x:Observation)=>{
    const replenish=dir>0?x.bidDepthChange-x.askDepthChange:x.askDepthChange-x.bidDepthChange;
    const trapAlignedHere=x.trapSide===o.side&&x.trapScore>=66;
    const flowTerm=trapAlignedHere?0:x.flowDelta*.12;
    return cap(
      dir*x.pressure*.22+
      dir*x.depthImbalance*.16+
      dir*x.weightedImbalance*.10+
      dir*x.microEdge*.16+
      dir*x.pressureChange*.08+
      dir*x.acceleration*.08+
      replenish*.08+
      dir*flowTerm,
      -100,100
    );
  };
  const microRecent=recent.filter(x=>x.microAvailable&&now-x.at<=5000);
  const microScores=microRecent.map(microDirectionalScore);
  const microMean=microScores.length?microScores.reduce((s,v)=>s+v,0)/microScores.length:0;
  const microPersistence=microScores.length?microScores.filter(v=>v>=8).length/microScores.length:0;
  const microOpposition=microScores.length?microScores.filter(v=>v<=-8).length/microScores.length:0;
  const microTrend=microScores.length>=2?microScores.at(-1)!-microScores[0]:0;
  const microReady=Boolean(
    !o.microAvailable||
    (microScores.length>=2&&microPersistence>=.60&&microOpposition<=.25&&microMean>=10)
  );
  const compressionMicroReady=Boolean(
    o.mode!=='COMPRESSION'||!o.microAvailable||
    (microScores.length>=2&&microPersistence>=.70&&microOpposition===0&&microMean>=13)
  );
  const microExhausted=Boolean(
    o.microAvailable&&Math.abs(o.priceChangeBps)>=3.5&&microScores.length>=2&&
    (microMean<5||microTrend<=-18)
  );

  const tickAligned=o.tickSide===o.side&&o.tickScore>=48;
  const liqAligned=o.liqSide===o.side&&o.liqScore>=28;
  const motionAligned=o.motionSide===o.side&&o.motionScore>=42;
  const preAligned=o.preSide===o.side&&o.preScore>=48;
  const trapAligned=o.trapSide===o.side&&o.trapScore>=66;
  const hardOpposition=[o.tickSide,o.liqSide,o.motionSide,o.trapSide].filter(x=>x!=='WAIT'&&x!==o.side).length;

  const premoveAmbush=Boolean(o.preArmed&&preAligned&&tickAligned&&liqAligned&&!o.late);
  const trapMicroReady=Boolean(
    !o.microAvailable||
    (microReady&&microPersistence>=.65&&microOpposition<=.20&&(liqAligned||microMean>=18))
  );
  const trapReversal=Boolean(
    trapAligned&&motionAligned&&['REVERSAL_ALERT','PRE_MOVE','IGNITION'].includes(o.motionStage)&&
    (liqAligned||tickAligned)&&trapMicroReady
  );
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
  if(o.microAvailable){
    score+=Math.min(12,Math.max(0,microMean)*.18);
    score+=Math.min(6,Math.max(0,microPersistence-.5)*12);
    score-=Math.min(14,Math.max(0,-microMean)*.20);
    if(microTrend>=10)score+=3;
    if(microExhausted)score-=16;
  }
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
  const attackAssist=Boolean(
    !inCooldown&&!o.late&&!microExhausted&&attackPattern&&score>=74&&hardOpposition===0&&
    o.liveOpposition===0&&microReady&&compressionMicroReady&&(temporalReady||shockReady)
  );
  // AMBUSH is the single early-warning scalp: it may arm before ATTACK, but it must be coherent.
  // Require two aligned observations for ordinary flow; strong pre-move structures can arm earlier
  // only when live opposition is absent and liquidity/tick context agrees.
  const ambushStructure=Boolean(
    pattern!=='FLOW_TRACK'&&(preAligned||motionAligned||o.accumulationAligned||o.reactionAligned)
  );
  const ambushTemporal=Boolean(
    (same.length>=2&&persistence>=.66)||
    (ambushStructure&&same.length>=1&&persistence>=.75&&o.liveOpposition===0)
  );
  const ambushMicroReady=Boolean(
    !o.microAvailable||
    (microScores.length>=2&&microPersistence>=.50&&microOpposition<=.35&&microMean>=4)
  );
  const ambush=Boolean(
    !inCooldown&&!o.late&&!microExhausted&&score>=58&&hardOpposition<=1&&
    o.liveOpposition===0&&ambushTemporal&&ambushMicroReady&&
    (
      pattern!=='FLOW_TRACK'||
      (temporalReady&&microReady&&(tickAligned||liqAligned||motionAligned))
    )
  );
  const watch=ambush;

  let phase:PredatorPhase='HUNT';
  if(inCooldown)phase='COOLDOWN';
  else if((o.late||microExhausted)&&score>=45)phase='ABORT';
  else if(ambush)phase='AMBUSH';
  else if(score>=40)phase='TRACK';

  if(ambush){st.lastAttackAt=now;st.lastAttackSide=o.side;}
  r.states[key]=st;

  const reasons:string[]=[];
  reasons.push(pattern);
  if(temporalReady)reasons.push('TEMPORAL_CONFIRM');
  if(shockReady)reasons.push('SHOCK_CONFIRM');
  if(attackAssist)reasons.push('ATTACK_ASSIST');
  if(tickAligned)reasons.push('TICK');
  if(liqAligned)reasons.push('L2');
  if(motionAligned)reasons.push('MOTION');
  if(preAligned)reasons.push('PREMOVE');
  if(trapAligned)reasons.push('TRAP');
  if(o.microAvailable&&microReady)reasons.push('MICRO_SEQUENCE');
  if(o.microAvailable&&!microReady)reasons.push('MICRO_UNSTABLE');
  if(microExhausted)reasons.push('MICRO_EXHAUSTED');
  if(o.late)reasons.push('NO_CHASE');
  if(hardOpposition)reasons.push('OPPOSITION_'+hardOpposition);

  return {
    version:'predator-scalp-v8-ambush',phase,side:o.side,score:Math.round(score),attack:false,attackAssist,watch,ambush,pattern,
    stableCount:st.stableCount,ageMs,persistence:Number(persistence.toFixed(2)),edgeSlope:Number(edgeSlope.toFixed(1)),
    evidenceSlope:Number(evidenceSlope.toFixed(1)),hardOpposition,temporalReady,shockReady,ambushTemporal,inCooldown,
    microstructure:{
      available:o.microAvailable,ready:microReady,compressionReady:compressionMicroReady,trapReady:trapMicroReady,
      ambushReady:ambushMicroReady,mean:Number(microMean.toFixed(1)),persistence:Number(microPersistence.toFixed(2)),
      opposition:Number(microOpposition.toFixed(2)),trend:Number(microTrend.toFixed(1)),samples:microScores.length,exhausted:microExhausted
    },
    cooldownMs:Math.max(0,st.cooldownUntil-now),late:o.late||microExhausted,
    alignment:{tick:tickAligned,liquidity:liqAligned,motion:motionAligned,premove:preAligned,trap:trapAligned},
    reasons
  };
}
