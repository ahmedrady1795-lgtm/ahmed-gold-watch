type Side='BUY'|'SELL'|'WAIT';
type LockState={side:Side;since:number;lastAt:number;pendingSide:Side;pendingCount:number};
const locks=new Map<string,LockState>();

const sideFrom=(x:any):Side=>x==='BUY'?'BUY':x==='SELL'?'SELL':'WAIT';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function directionPerformance(expected:any,side:Side){
  const s=expected?.directionStats||{};
  if(side==='WAIT')return {side,samples:0,success:0,fail:0,accuracy:50,rawAccuracy:50};
  const success=Number(side==='BUY'?s.buySuccess:s.sellSuccess)||0;
  const fail=Number(side==='BUY'?s.buyFail:s.sellFail)||0;
  const samples=success+fail;
  const accuracy=samples?Math.round((success+2)/(samples+4)*100):50;
  const rawAccuracy=samples?Math.round(success/samples*100):50;
  return {side,samples,success,fail,accuracy,rawAccuracy};
}
function expectedConsensus(expected:any){
  const rows=[
    {x:expected?.twoMinute,w:.40},
    {x:expected?.fiveMinute,w:.36},
    {x:expected?.fifteenMinute,w:.24}
  ];
  let buy=0,sell=0,total=0;
  for(const r of rows){
    const side=sideFrom(r.x?.side),conf=cap(Number(r.x?.confidence||0),0,100)/100;
    if(side==='WAIT'||conf<=0)continue;
    const w=r.w*conf;total+=w;if(side==='BUY')buy+=w;else sell+=w;
  }
  if(!total)return {side:'WAIT' as Side,confidence:0,buyShare:50,sellShare:50};
  const buyShare=buy/total*100,sellShare=sell/total*100,gap=Math.abs(buyShare-sellShare);
  const side:Side=gap>=18?(buy>sell?'BUY':'SELL'):'WAIT';
  return {side,confidence:Math.round(cap(gap+35,0,82)),buyShare:Math.round(buyShare),sellShare:Math.round(sellShare)};
}

export function masterArbitrate(asset:string,decision:any,scalp:any,now=Date.now(),learner:any=null,marketLearning:any=null,evolution:any=null,expectedLearning:any=null){
  const action=sideFrom(decision?.action),phase=String(decision?.phase||'WAIT'),fusion=sideFrom(decision?.fusion?.side);
  const motion=sideFrom(decision?.motion?.side),behavior=sideFrom(decision?.behavior?.side),liq=sideFrom(decision?.liquidity?.side);
  const hunter=sideFrom(decision?.hunter?.side);
  const evo=evolution?.active||null;
  const minLearningConfidence=Number(evo?.thresholds?.minLearningConfidence||48),minLearningSamples=Number(evo?.thresholds?.minLearningSamples||10);
  const learningSide:Side=sideFrom(marketLearning?.side);
  const learningConfidence=Number(marketLearning?.confidence||0),learningSamples=Number(marketLearning?.effectiveSamples||0),learningReliability=Number(marketLearning?.selfCalibration?.reliability||50);
  const learningUsable=Boolean(marketLearning?.ok&&learningSide!=='WAIT'&&learningConfidence>=Math.max(54,minLearningConfidence)&&learningSamples>=minLearningSamples&&learningReliability>=45);
  const scalpSide:Side=scalp?.action==='BUY'?'BUY':scalp?.action==='SELL'?'SELL':Number(scalp?.score?.long||0)-Number(scalp?.score?.short||0)>=18?'BUY':Number(scalp?.score?.short||0)-Number(scalp?.score?.long||0)>=18?'SELL':'WAIT';
  const exp=expectedConsensus(expectedLearning);

  const evolutionWeights=evo?.weights||{};
  const learnedWeights=marketLearning?.learnedWeights||{};
  const weight=(name:string,base=1)=>{
    const ew=Number(evolutionWeights?.[name]??1),lw=Number(learnedWeights?.[name]??1);
    return cap(base*(Number.isFinite(ew)?ew:1)*(Number.isFinite(lw)?lw:1),.35,1.85);
  };
  const fusionWeight=cap(1.18*((Number(evolutionWeights?.structure||1)+Number(evolutionWeights?.learning||1))/2),.65,1.75);
  const voteRows=[
    {name:'fusion',side:fusion,w:fusionWeight},
    {name:'motion',side:motion,w:weight('motion',1)},
    {name:'behavior',side:behavior,w:weight('behavior',.82)},
    {name:'liquidity',side:liq,w:weight('liquidity',1.08)},
    {name:'hunter',side:hunter,w:weight('wave',1.02)},
    {name:'scalp',side:scalpSide,w:weight('scalp',1.06)},
    {name:'learning',side:learningUsable?learningSide:'WAIT',w:weight('learning',1.12)},
    {name:'expectedMove',side:exp.side,w:cap(weight('learning',.92)*(exp.confidence/60),.35,1.45)}
  ].filter(v=>v.side!=='WAIT');
  const buyWeight=voteRows.filter(v=>v.side==='BUY').reduce((s,v)=>s+v.w,0);
  const sellWeight=voteRows.filter(v=>v.side==='SELL').reduce((s,v)=>s+v.w,0);
  const totalWeight=buyWeight+sellWeight;
  const weightedGap=totalWeight?Math.abs(buyWeight-sellWeight)/totalWeight*100:0;
  const weightedConsensus:Side=totalWeight>=2&&weightedGap>=22?(buyWeight>sellWeight?'BUY':'SELL'):'WAIT';

  const vetoes=(decision?.vetoes||[]).map(String);
  const criticalVeto=vetoes.some((v:string)=>/Conflict Gate|Liquidity Gate|Trap Gate/i.test(v));
  const phaseConflict=phase==='CONFLICT';
  const hardConflict=criticalVeto||(phaseConflict&&weightedGap<42);
  const buys=voteRows.filter(v=>v.side==='BUY').length,sells=voteRows.filter(v=>v.side==='SELL').length;
  const splitConflict=buyWeight>=1.45&&sellWeight>=1.45&&weightedGap<24;
  const learningConflict=Boolean(action!=='WAIT'&&learningUsable&&learningSide!==action&&learningConfidence>=64&&learningReliability>=52);
  const expectedConflict=Boolean(action!=='WAIT'&&exp.side!=='WAIT'&&exp.side!==action&&exp.confidence>=64&&!expectedLearning?.conflict);

  const perf=directionPerformance(expectedLearning,action);
  const oppositePerf=directionPerformance(expectedLearning,action==='BUY'?'SELL':action==='SELL'?'BUY':'WAIT');
  const performanceBlocked=Boolean(
    action!=='WAIT'&&(
      (perf.samples>=8&&perf.accuracy<=42)||
      (perf.samples>=12&&perf.accuracy<48&&oppositePerf.samples>=6&&oppositePerf.accuracy>=perf.accuracy+15)
    )
  );
  const conflict=hardConflict||splitConflict||learningConflict||expectedConflict;

  const fusionGap=Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0));
  const confidence=Number(decision?.confidence||0);
  const learnerRequired=Boolean(learner);
  const learnerValid=Boolean(learner?.ok&&learner?.gate?.passed&&Number(learner?.oosAccuracy)>=56&&Number(learner?.oosEdgeAtr)>=.06&&Number(learner?.profitFactor)>=1.20);
  const learnerSide:Side=sideFrom(learner?.side);
  const edgeAligned=Boolean(!learnerRequired||(learnerValid&&learnerSide===action));
  let requiredConfidence=68;
  if(perf.samples>=6&&perf.accuracy<52)requiredConfidence+=Math.min(5,Math.ceil((52-perf.accuracy)/2));
  if(exp.side===action&&exp.confidence>=68)requiredConfidence-=2;
  if(weightedConsensus===action&&weightedGap>=45)requiredConfidence-=2;
  requiredConfidence=Math.round(cap(requiredConfidence,64,78));
  const consensusAligned=weightedConsensus==='WAIT'||weightedConsensus===action;
  const strongEvidence=action!=='WAIT'&&confidence>=requiredConfidence&&fusionGap>=8&&!conflict&&!performanceBlocked&&edgeAligned&&consensusAligned;

  let lock=locks.get(asset);
  if(lock&&now-lock.lastAt>120000){locks.delete(asset);lock=undefined;}

  let masterAction:Side='WAIT',state='WAIT',reason='لا يوجد توافق كافٍ لإصدار اتجاه واحد.';
  let watchSide:Side='WAIT';

  if(performanceBlocked){
    state='PERFORMANCE_BLOCKED';
    reason=`تم منع ${action}: دقة النتائج المحققة لهذا الاتجاه منخفضة (${perf.accuracy}% من ${perf.samples} عينات مستقلة).`;
  }else if(conflict){
    state=expectedConflict?'EXPECTED_MOVE_CONFLICT':learningConflict?'LEARNING_CONFLICT':'CONFLICT';
    reason=expectedConflict?'ذاكرة الحركة المتوقعة تعارض اتجاه الصفقة؛ تم منع الدخول حتى يتوافق المسار القصير.':learningConflict?'ذاكرة السوق المتعلمة تعارض اتجاه الصفقة بثقة كافية؛ تم منع الدخول حتى يظهر توافق جديد.':'المحركات الموثوقة ما زالت متعارضة؛ تم إلغاء BUY/SELL حتى يظهر تفوق موزون واضح.';
  }else if(action!=='WAIT'&&learnerRequired&&!learnerValid){
    state='EDGE_BLOCKED';
    reason='تم منع الصفقة: Scalp Learner لم يثبت أفضلية موجبة كافية على Final Holdout بعد التكلفة.';
  }else if(action!=='WAIT'&&learnerRequired&&learnerSide!==action){
    state='EDGE_CONFLICT';
    reason=`تم منع الصفقة: اتجاه النواة ${action} يعارض Scalp Learner ${learnerSide}.`;
  }else if(action!=='WAIT'&&weightedConsensus!=='WAIT'&&weightedConsensus!==action){
    state='WEIGHTED_CONFLICT';
    reason=`أوزان النواة المتعلمة ترجح ${weightedConsensus} بينما القرار الخام ${action}؛ لا دخول حتى يتوافقا.`;
  }else if(strongEvidence){
    if(!lock||lock.side==='WAIT'||lock.side===action){
      masterAction=action;state='TRADE';
      reason='اتجاه واحد معتمد بعد توافق الأوزان المتعلمة، سجل النتائج، والنواة.';
      locks.set(asset,{side:action,since:lock?.side===action?lock.since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
    }else{
      const pendingCount=lock.pendingSide===action?lock.pendingCount+1:1;
      const reversalStrong=confidence>=Math.max(76,requiredConfidence+5)&&fusionGap>=12&&weightedGap>=34&&pendingCount>=3;
      if(reversalStrong){
        masterAction=action;state='TRADE';
        reason='تم السماح بعكس الاتجاه بعد 3 تأكيدات قوية متتالية وتوافق موزون.';
        locks.set(asset,{side:action,since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
      }else{
        state='REVERSAL_LOCK';
        reason=`منع قلب الاتجاه من ${lock.side} إلى ${action} حتى 3 تأكيدات قوية متتالية (${pendingCount}/3).`;
        locks.set(asset,{...lock,lastAt:now,pendingSide:action,pendingCount});
      }
    }
  }else{
    const candidates:[Side,number][]=[
      [weightedConsensus,weightedGap],
      [exp.side,exp.confidence],
      [learningUsable?learningSide:'WAIT',learningConfidence],
      [fusion,Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0))],
      [motion,Number(decision?.motion?.score||0)],
      [behavior,Number(decision?.behavior?.score||0)],
      [liq,Math.abs(Number(decision?.liquidity?.buy||0)-Number(decision?.liquidity?.sell||0))]
    ];
    const best=candidates.filter(([s])=>s!=='WAIT').sort((a,b)=>b[1]-a[1])[0];
    watchSide=best?.[0]||'WAIT';
    if(watchSide!=='WAIT'){
      state='WATCH';
      reason='يوجد ميل سوقي للمراقبة فقط، لكنه لم يجتز بوابات الدقة والتوافق.';
    }
    if(lock)locks.set(asset,{...lock,lastAt:now,pendingSide:'WAIT',pendingCount:0});
  }

  const locked=locks.get(asset);
  return {
    action:masterAction,
    state,
    watchSide,
    conflict,
    reason,
    lockedSide:locked?.side||'WAIT',
    lockAgeSeconds:locked?Math.max(0,Math.round((now-locked.since)/1000)):0,
    pendingReversal:locked?.pendingSide||'WAIT',
    pendingCount:locked?.pendingCount||0,
    evidence:{
      buyVotes:buys,sellVotes:sells,buyWeight:Number(buyWeight.toFixed(2)),sellWeight:Number(sellWeight.toFixed(2)),weightedGap:Math.round(weightedGap),weightedConsensus,
      fusion,scalp:scalpSide,hunter,motion,behavior,liquidity:liq,learning:learningUsable?learningSide:'WAIT',learningConfidence,learningReliability,learningSamples,
      expectedMove:exp,confidence,requiredConfidence,fusionGap,
      directionPerformance:perf,oppositeDirectionPerformance:oppositePerf,
      evolutionWeights:evolutionWeights,
      learner:{required:learnerRequired,valid:learnerValid,side:learnerSide,oosAccuracy:Number(learner?.oosAccuracy||0),netEdgeAtr:Number(learner?.oosEdgeAtr||0),profitFactor:Number(learner?.profitFactor||0)}
    },
    trade:masterAction!=='WAIT'?decision?.trade||null:null
  };
}
