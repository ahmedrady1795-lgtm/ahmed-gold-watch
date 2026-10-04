type Side='BUY'|'SELL'|'WAIT';
type ForecastSample={at:number;side:Side;score:number};

const memory=new Map<string,ForecastSample[]>();

const cap=(n:number,min=0,max=92)=>Math.max(min,Math.min(max,n));
const sideScore=(s:Side,target:Side,v:number)=>s===target?v:0;

export function buildHuntForecast(asset:string,decision:any,scalp:any,price:number|null,atr:number|null,now=Date.now(),wave:any=null,learner:any=null){
  const p=Number(price),a=Number(atr);
  const fusionBuy=Number(decision?.fusion?.buy||0),fusionSell=Number(decision?.fusion?.sell||0);
  const motionSide:Side=decision?.motion?.side||'WAIT',behaviorSide:Side=decision?.behavior?.side||'WAIT',liqSide:Side=decision?.liquidity?.side||'WAIT',hunterSide:Side=decision?.hunter?.side||'WAIT';
  const motionScore=Number(decision?.motion?.score||0),behaviorScore=Number(decision?.behavior?.score||0),liqStrength=Number(decision?.liquidity?.strength||0),hunterScore=Number(decision?.hunter?.score||0);
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0);

  const waveFresh=Boolean(wave?.ok&&['BUY','SELL'].includes(String(wave?.side))&&Number(wave?.score)>=35&&now-Number(wave?.at||0)<=3000);
  const waveSide:Side=waveFresh?(wave.side as Side):'WAIT',waveScore=waveFresh?Number(wave?.score||0):0;
  const learnerFresh=Boolean(learner?.ok&&['BUY','SELL'].includes(String(learner?.side))&&Number(learner?.oosAccuracy)>=52&&Number(learner?.confidence)>=50);
  const learnerSide:Side=learnerFresh?(learner.side as Side):'WAIT',learnerScore=learnerFresh?Number(learner?.confidence||0):0;
  let buy=fusionBuy*.22+sideScore(motionSide,'BUY',motionScore)*.15+sideScore(behaviorSide,'BUY',behaviorScore)*.11+sideScore(liqSide,'BUY',liqStrength)*.13+sideScore(hunterSide,'BUY',hunterScore)*.08+scalpLong*.08+sideScore(waveSide,'BUY',waveScore)*.12+sideScore(learnerSide,'BUY',learnerScore)*.11;
  let sell=fusionSell*.22+sideScore(motionSide,'SELL',motionScore)*.15+sideScore(behaviorSide,'SELL',behaviorScore)*.11+sideScore(liqSide,'SELL',liqStrength)*.13+sideScore(hunterSide,'SELL',hunterScore)*.08+scalpShort*.08+sideScore(waveSide,'SELL',waveScore)*.12+sideScore(learnerSide,'SELL',learnerScore)*.11;

  const trapSide:Side=decision?.liquidity?.absorption?.trapDetected?decision?.liquidity?.absorption?.side||'WAIT':'WAIT';
  const trapScore=Number(decision?.liquidity?.absorption?.score||0);
  if(trapSide==='BUY'){buy+=Math.min(12,trapScore*.12);sell*=.86;}
  if(trapSide==='SELL'){sell+=Math.min(12,trapScore*.12);buy*=.86;}

  const behaviorExp=Number(decision?.behavior?.expectedMoveAtr||0);
  if(behaviorExp>=.35)buy+=Math.min(8,Math.abs(behaviorExp)*4);
  if(behaviorExp<=-.35)sell+=Math.min(8,Math.abs(behaviorExp)*4);

  const rawGap=Math.abs(buy-sell),rawSide:Side=buy-sell>=3?'BUY':sell-buy>=3?'SELL':'WAIT';
  const rawScore=cap(Math.max(buy,sell));

  const old=(memory.get(asset)||[]).filter(x=>now-x.at<=45000);
  old.push({at:now,side:rawSide,score:rawScore});
  const recent=old.slice(-8);memory.set(asset,recent);

  const buySamples=recent.filter(x=>x.side==='BUY').length,sellSamples=recent.filter(x=>x.side==='SELL').length;
  const dominant:Side=buySamples>sellSamples?'BUY':sellSamples>buySamples?'SELL':rawSide;
  const persistence=recent.length?Math.round(Math.max(buySamples,sellSamples)/recent.length*100):0;
  const stableSide:Side=rawSide!=='WAIT'&&persistence>=50?dominant:rawSide;

  const contradiction=recent.some(x=>x.side==='BUY')&&recent.some(x=>x.side==='SELL');
  const conflictPenalty=decision?.master?.conflict?10:0;
  const flipPenalty=contradiction?Math.max(0,18-persistence*.12):0;
  const confidence=cap(rawScore*.62+Math.min(100,rawGap*2.2)*.18+persistence*.20-conflictPenalty-flipPenalty,0,88);

  const motionStage=String(decision?.motion?.stage||'WAIT');
  const compression=Number(decision?.motion?.components?.compression||0);
  const velocity=Math.abs(Number(decision?.motion?.components?.liveVelocityBps||0));
  const precursorCount=Number(decision?.motion?.diagnostics?.precursorCount||0);
  let state='STALKING';
  if(waveFresh&&waveSide===stableSide&&wave?.stage==='IGNITION')state='IGNITION';
  else if(waveFresh&&waveSide===stableSide&&wave?.stage==='WAVE_FORMING')state='WAVE_FORMING';
  else if(motionStage==='IGNITION'||velocity>=1.2)state='IGNITION';
  else if(motionStage==='REVERSAL_ALERT'||trapSide===stableSide&&trapScore>=68)state='REVERSAL_HUNT';
  else if(motionStage==='PRE_MOVE'||precursorCount>=3)state='PRE_MOVE';
  else if((waveFresh&&wave?.stage==='COILED')||compression>=60)state='COILED';

  let expAtr=Math.abs(behaviorExp);
  if(!Number.isFinite(expAtr)||expAtr<.2)expAtr=.45;
  expAtr=Math.min(1.6,Math.max(.3,expAtr));
  if(state==='IGNITION')expAtr=Math.min(1.8,expAtr*1.15);
  if(state==='COILED')expAtr=Math.max(.55,expAtr);

  const horizonSeconds=state==='IGNITION'?45:state==='WAVE_FORMING'?75:state==='PRE_MOVE'||state==='REVERSAL_HUNT'?120:state==='COILED'?180:240;
  const validPrice=Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>0;
  const dir=stableSide==='BUY'?1:stableSide==='SELL'?-1:0;
  const trigger=validPrice&&dir?p+dir*a*.12:null;
  const projected=validPrice&&dir?p+dir*a*expAtr:null;
  const invalidation=validPrice&&dir?p-dir*a*.32:null;

  const reasons:string[]=[];
  if(stableSide!=='WAIT')reasons.push('Core forecast يميل '+stableSide+' بفارق '+Math.round(rawGap));
  if(motionSide===stableSide&&motionScore>=50)reasons.push('Motion متوافق');
  if(liqSide===stableSide&&liqStrength>=55)reasons.push('السيولة متوافقة');
  if(behaviorSide===stableSide&&behaviorScore>=45)reasons.push('السلوك التاريخي متوافق');
  if((stableSide==='BUY'&&scalpLong>scalpShort)||(stableSide==='SELL'&&scalpShort>scalpLong))reasons.push('Micro/Scalp يميل لنفس الاتجاه');
  if(trapSide===stableSide&&trapScore>=60)reasons.push('Trap/Absorption يدعم الانعكاس');
  if(waveFresh&&waveSide===stableSide)reasons.push('Wave Lead tick-by-tick يسبق الحركة ومتوافق');
  if(waveFresh&&waveSide!==stableSide)reasons.push('Wave Lead السريع يعارض التوقع؛ الثقة مخفضة');
  if(learnerFresh&&learnerSide===stableSide)reasons.push('Scalp Learner OOS متوافق مع الحركة القادمة');
  if(learnerFresh&&learnerSide!==stableSide)reasons.push('Scalp Learner يعارض التوقع؛ الثقة مخفضة');
  if(contradiction)reasons.push('التوقع تغيّر داخل نافذة الذاكرة؛ الثبات أقل');

  return {
    side:stableSide,
    state,
    score:rawScore,
    confidence,
    persistence,
    samples:recent.length,
    buyScore:Math.round(buy),
    sellScore:Math.round(sell),
    horizonSeconds,
    expectedMoveAtr:Number(expAtr.toFixed(2)),
    trigger:trigger==null?null:Number(trigger.toFixed(2)),
    projected:projected==null?null:Number(projected.toFixed(2)),
    invalidation:invalidation==null?null:Number(invalidation.toFixed(2)),
    currentPrice:Number.isFinite(p)?p:null,
    reasons:reasons.slice(0,7),
    waveLeadUsed:waveFresh?{side:waveSide,stage:wave?.stage,score:waveScore,confidence:Number(wave?.confidence||0),at:Number(wave?.at||0)}:null,
    scalpLearnerUsed:learnerFresh?{side:learnerSide,confidence:learnerScore,oosAccuracy:Number(learner?.oosAccuracy||0),oosEdgeAtr:Number(learner?.oosEdgeAtr||0),holdSeconds:Number(learner?.exitPlan?.maxHoldSeconds||0)}:null,
    note:'توقع استباقي للحركة وليس أمر دخول أو ضمان نتيجة.'
  };
}
