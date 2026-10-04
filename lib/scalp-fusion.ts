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

export function buildScalpFusion(raw:any,liq:any,motion:any,learner:any,ml:any,price:number|null,atr:number|null,liveOutcome:any=null){
  const techSide=technicalSide(raw);
  const long=Number(raw?.score?.long||0),short=Number(raw?.score?.short||0),techBest=Math.max(long,short),techGap=Math.abs(long-short);
  const liqSide=side(liq?.side),liqScore=liquidityStrength(liq);
  const motionSide=side(motion?.side),motionScore=cap(Number(motion?.score||motion?.confidence||0),0,88);
  const trapSide:Side=liq?.absorption?.trapDetected?side(liq?.absorption?.side):'WAIT';
  const trapScore=cap(Number(liq?.absorption?.score||0),0,90);
  const ml1=mlStrength(ml);
  const learnedSide:Side=learner?.ok&&learner?.gate?.passed?side(learner?.side):'WAIT';
  const learnedScore=learnedSide==='WAIT'?0:cap(Number(learner?.confidence||0)*.55+Number(learner?.oosAccuracy||0)*.45,0,82);

  const mode=String(raw?.adaptive?.mode||'FLOW').toUpperCase();
  const weights=mode==='COMPRESSION'
    ?{tech:.19,liq:.34,ml:.27,motion:.08,trap:.10,learn:.02}
    :mode==='REVERSAL'
      ?{tech:.23,liq:.25,ml:.22,motion:.07,trap:.20,learn:.03}
      :mode==='BREAKOUT'||mode==='MOMENTUM'
        ?{tech:.29,liq:.27,ml:.26,motion:.10,trap:.05,learn:.03}
        :{tech:.24,liq:.32,ml:.26,motion:.11,trap:.04,learn:.03};

  const techSignal=techSide==='WAIT'?0:cap(42+techBest*.46+techGap*.42,0,92);
  const rows=[
    {name:'TECH',side:techSide,score:techSignal,weight:weights.tech},
    {name:'L2',side:liqSide,score:liqScore,weight:weights.liq},
    {name:'ML1',side:ml1.side,score:ml1.score,weight:weights.ml},
    {name:'MOTION',side:motionSide,score:motionScore,weight:weights.motion},
    {name:'TRAP',side:trapSide,score:trapScore,weight:weights.trap},
    {name:'LEARNED',side:learnedSide,score:learnedScore,weight:weights.learn}
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

  // Trap / absorption gets veto-like power only when it is actually strong.
  if(trapSide!=='WAIT'&&trapScore>=62){
    if(trapSide==='BUY'){buy+=8;sell*=.78;}else{sell+=8;buy*=.78;}
  }

  const total=Math.max(1e-9,buy+sell),buyShare=buy/total*100,sellShare=100-buyShare,edge=Math.abs(buyShare-sellShare);
  const activeWeight=Math.max(.01,rows.reduce((s,r)=>s+r.weight,0));
  const buyEvidence=cap(buy/activeWeight,0,92),sellEvidence=cap(sell/activeWeight,0,92);
  const dominantEvidence=Math.max(buyEvidence,sellEvidence);
  const fusedSide:Side=edge>=4&&dominantEvidence>=28?(buy>sell?'BUY':'SELL'):'WAIT';
  const support=rows.filter(r=>r.side===fusedSide).length;
  const opposition=rows.filter(r=>fusedSide!=='WAIT'&&r.side!==fusedSide).length;
  const liveSupport=[liqSide,motionSide,trapSide,ml1.side].filter(s=>s!=='WAIT'&&s===fusedSide).length;
  const liveOpposition=[liqSide,motionSide,trapSide,ml1.side].filter(s=>s!=='WAIT'&&fusedSide!=='WAIT'&&s!==fusedSide).length;

  const scalpWf=liveOutcome?.walkForward||{};
  const scalpOosN=Number(scalpWf?.oos?.n||0),scalpOosAcc=Number(scalpWf?.oos?.accuracy);
  const scalpDrift=String(scalpWf?.drift?.status||'COLLECTING'),scalpWfStatus=String(scalpWf?.status||'COLLECTING');
  const scalpPrecisionGuard=Boolean(scalpOosN>=10&&(scalpWfStatus==='WATCH'||scalpDrift==='DEGRADING'||(Number.isFinite(scalpOosAcc)&&scalpOosAcc<53)));
  const scalpSevereDrift=Boolean(scalpOosN>=10&&scalpDrift==='DEGRADING'&&Number(scalpWf?.drift?.delta||0)<=-15);

  let confidence=cap(dominantEvidence*.58+edge*.20+support*2.6+liveSupport*2.8-liveOpposition*4.2,10,86);
  if(techL2Conflict&&!livePair)confidence-=5;
  if(learner&&!learner.ok&&liveSupport<2)confidence-=3;
  if(ml1.side==='WAIT'&&learnedSide==='WAIT')confidence=Math.min(confidence,74);
  if(scalpWfStatus==='WATCH'&&scalpOosN>=10)confidence-=4;
  if(scalpDrift==='DEGRADING'&&scalpOosN>=10)confidence-=7;
  if(Number.isFinite(scalpOosAcc)&&scalpOosN>=10&&scalpOosAcc<50)confidence-=4;
  confidence=Math.round(cap(confidence,10,86));

  const strongEdge=scalpSevereDrift?20:scalpPrecisionGuard?16:14;
  const strongEvidence=scalpSevereDrift?66:scalpPrecisionGuard?62:58;
  const strong=Boolean(
    fusedSide!=='WAIT'&&edge>=strongEdge&&dominantEvidence>=strongEvidence&&support>=2&&
    (liveSupport>=2||(ml1.side===fusedSide&&liqSide===fusedSide)||(trapSide===fusedSide&&trapScore>=68))&&
    (!scalpSevereDrift||liveOpposition===0||edge>=30)
  );
  const watch=Boolean(fusedSide!=='WAIT'&&edge>=6&&dominantEvidence>=46&&support>=2);
  const action:Side=strong||watch?fusedSide:'WAIT';
  const state=strong?'setup':watch?'watch':'wait';

  const p=Number(price),a=Number(atr);
  let trade:any=null;
  if(strong&&Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>0){
    const dir=fusedSide==='BUY'?1:-1;
    const risk=a*(mode==='BREAKOUT'||mode==='MOMENTUM'?.48:mode==='REVERSAL'?.42:.45);
    const rr=mode==='BREAKOUT'?1.35:mode==='MOMENTUM'?1.30:mode==='REVERSAL'?1.20:1.24;
    trade={mode:'scalp-fusion-v3-'+mode.toLowerCase(),side:fusedSide==='BUY'?'buy':'sell',entry:p,sl:p-dir*risk,tp:p+dir*risk*rr,rr,score:confidence,validForSeconds:35,time:Date.now()};
  }

  const outLong=Math.round(cap(buyEvidence+Math.max(0,buyShare-50)*.16,0,92));
  const outShort=Math.round(cap(sellEvidence+Math.max(0,sellShare-50)*.16,0,92));
  const changed=techSide!=='WAIT'&&fusedSide!=='WAIT'&&techSide!==fusedSide;

  return {
    ...raw,
    state,action,
    title:action==='BUY'?'M1 SCALP FUSION · BUY':action==='SELL'?'M1 SCALP FUSION · SELL':'M1 SCALP FUSION · WAIT',
    reason:action==='WAIT'
      ?'Scalp Fusion v3: لا يوجد edge حي كافٍ بين M1 وL2 وML.'
      :`Scalp Fusion v3 · ${fusedSide} · edge ${edge.toFixed(1)} · ${support} دعم / ${opposition} معارضة${changed?' · microstructure غيّر الميل الفني':''}.`,
    score:{long:outLong,short:outShort,threshold:58},
    confidence,
    trade,
    early:state==='watch',
    fusionV3:{
      side:fusedSide,confidence,strong,watch,
      buyShare:Number(buyShare.toFixed(1)),sellShare:Number(sellShare.toFixed(1)),edge:Number(edge.toFixed(1)),
      buyEvidence:Number(buyEvidence.toFixed(1)),sellEvidence:Number(sellEvidence.toFixed(1)),dominantEvidence:Number(dominantEvidence.toFixed(1)),
      support,opposition,liveSupport,liveOpposition,
      techSide,liqSide,motionSide,trapSide,mlSide:ml1.side,learnedSide,
      techL2Conflict,livePair,mode,
      oos:{status:scalpWfStatus,n:scalpOosN,accuracy:Number.isFinite(scalpOosAcc)?scalpOosAcc:null,drift:scalpDrift,precisionGuard:scalpPrecisionGuard,severeDrift:scalpSevereDrift,strongEdge,strongEvidence},
      components:rows.map(r=>({name:r.name,side:r.side,score:Number(r.score.toFixed(1)),weight:r.weight}))
    }
  };
}
