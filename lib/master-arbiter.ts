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

export function masterArbitrate(asset:string,decision:any,scalp:any,now=Date.now(),learner:any=null,marketLearning:any=null,evolution:any=null,expectedLearning:any=null,movementIntel:any=null,stateGraph:any=null,tick:any=null,multiBrain:any=null,ml:any=null){
  const rawAction=sideFrom(decision?.action),phase=String(decision?.phase||'WAIT'),fusion=sideFrom(decision?.fusion?.side);
  const motion=sideFrom(decision?.motion?.side),behavior=sideFrom(decision?.behavior?.side),liq=sideFrom(decision?.liquidity?.side);
  const hunter=sideFrom(decision?.hunter?.side);
  const movementSide:Side=sideFrom(movementIntel?.side!=='WAIT'?movementIntel?.side:movementIntel?.leanSide);
  const movementConfidence=Number(movementIntel?.confidence||0);
  const graphSide:Side=sideFrom(stateGraph?.nextSide);
  const graphConfidence=Number(stateGraph?.nextSideProbability||0);
  const tickSide:Side=sideFrom(tick?.side);
  const tickConfidence=Math.max(Number(tick?.confidence||0),Number(tick?.score||0));
  const regime=String(movementIntel?.regime||stateGraph?.current||'TRANSITION').toUpperCase();
  const multiSide:Side=sideFrom(multiBrain?.side);
  const multiConfidence=Number(multiBrain?.confidence||0);
  const multiGap=Number(multiBrain?.gap||0);
  const multiStrong=Boolean(multiBrain?.strong&&multiSide!=='WAIT'&&multiConfidence>=58&&multiGap>=22);
  const multiDecisive=Boolean(multiBrain?.decisive&&multiSide!=='WAIT'&&multiConfidence>=72&&multiGap>=34);
  const evo=evolution?.active||null;
  const minLearningConfidence=Number(evo?.thresholds?.minLearningConfidence||48),minLearningSamples=Number(evo?.thresholds?.minLearningSamples||10);
  const learningSide:Side=sideFrom(marketLearning?.side);
  const learningConfidence=Number(marketLearning?.confidence||0),learningSamples=Number(marketLearning?.effectiveSamples||0),learningReliability=Number(marketLearning?.selfCalibration?.reliability||50);
  const learningUsable=Boolean(marketLearning?.ok&&learningSide!=='WAIT'&&learningConfidence>=Math.max(54,minLearningConfidence)&&learningSamples>=minLearningSamples&&learningReliability>=45);
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0),scalpGap=Math.abs(scalpLong-scalpShort),scalpStrength=Math.max(scalpLong,scalpShort,Number(scalp?.confidence||0));
  const scalpSide:Side=scalp?.action==='BUY'?'BUY':scalp?.action==='SELL'?'SELL':scalpLong-scalpShort>=5?'BUY':scalpShort-scalpLong>=5?'SELL':'WAIT';
  const neural=ml?.neuralCore||{};
  const neuralReady=Boolean(neural?.ok&&neural?.ready&&sideFrom(neural?.side)!=='WAIT'&&Number(neural?.metrics?.holdout?.selectiveAccuracy||0)>=.58);
  const neuralSide:Side=neuralReady?sideFrom(neural?.side):'WAIT';
  const neuralConfidence=Number(neural?.confidence||0);
  const neuralLiveConfirmations=[scalpSide,movementSide,tickSide].filter(x=>x===neuralSide).length;
  const neuralFastAligned=Boolean(neuralReady&&neuralLiveConfirmations>=1&&neuralConfidence>=60);
  const neuralOverride=Boolean(neuralFastAligned&&neuralLiveConfirmations>=2&&neuralConfidence>=68&&rawAction!=='WAIT'&&neuralSide!==rawAction);
  const ml1Ready=Boolean(ml?.ok&&ml?.oneMinute?.ready&&!ml?.shadow);
  const ml5Ready=Boolean(ml?.ok&&ml?.fiveMinute?.ready&&!ml?.shadow);
  const ml1Side:Side=ml1Ready?sideFrom(ml?.oneMinute?.side):'WAIT';
  const ml5Side:Side=ml5Ready?sideFrom(ml?.fiveMinute?.side):'WAIT';
  const ml1Confidence=Number(ml?.oneMinute?.confidence||0);
  const ml5Confidence=Number(ml?.fiveMinute?.confidence||0);
  const mlBothAligned=Boolean(ml1Side!=='WAIT'&&ml5Side===ml1Side);
  const mlSide:Side=mlBothAligned?ml1Side:ml1Side!=='WAIT'?ml1Side:ml5Side;
  const mlConfidence=mlBothAligned?Math.round((ml1Confidence*.62)+(ml5Confidence*.38)):ml1Side!=='WAIT'?ml1Confidence:ml5Confidence;
  const mlReady=Boolean(mlSide!=='WAIT'&&((ml1Ready&&ml1Side!=='WAIT')||(ml5Ready&&ml5Side!=='WAIT'))&&mlConfidence>=58);
  const mlLiveConfirmations=[scalpSide,movementSide,tickSide].filter(x=>x===mlSide).length;
  const mlFastAligned=Boolean(mlReady&&mlLiveConfirmations>=1);
  const exp=expectedConsensus(expectedLearning);

  const liveRows=[
    {name:'movement',side:movementSide,w:1.35*Math.max(.55,Math.min(1.25,movementConfidence/62))},
    {name:'scalp',side:scalpSide,w:1.30*Math.max(.55,Math.min(1.30,scalpStrength/62))},
    {name:'tick',side:tickSide,w:1.25*Math.max(.55,Math.min(1.30,tickConfidence/62))},
    {name:'motion',side:motion,w:1.05*Math.max(.55,Math.min(1.20,Number(decision?.motion?.score||0)/62))},
    {name:'liquidity',side:liq,w:(asset==='BTC'?1.00:.35)},
    {name:'graph',side:graphSide,w:.82*Math.max(.55,Math.min(1.15,graphConfidence/60))}
  ].filter(x=>x.side!=='WAIT');
  const liveBuy=liveRows.filter(x=>x.side==='BUY').reduce((s,x)=>s+x.w,0),liveSell=liveRows.filter(x=>x.side==='SELL').reduce((s,x)=>s+x.w,0),liveTotal=liveBuy+liveSell;
  const liveGap=liveTotal?Math.abs(liveBuy-liveSell)/liveTotal*100:0;
  const liveConsensus:Side=liveTotal>=1.6&&liveGap>=18?(liveBuy>liveSell?'BUY':'SELL'):'WAIT';
  const liveAligned=liveRows.filter(x=>x.side===liveConsensus).length;
  const liveStrong=Boolean(liveConsensus!=='WAIT'&&liveAligned>=2&&liveGap>=30&&(movementConfidence>=42||scalpStrength>=62||tickConfidence>=58));
  const fastRegime=/EXPANSION|REVERSAL|RANGE|COMPRESSION/.test(regime);
  const mlOverride=Boolean(
    mlFastAligned&&mlLiveConfirmations>=2&&mlConfidence>=66&&rawAction!=='WAIT'&&mlSide!==rawAction
  );
  const multiOverride=Boolean(
    multiDecisive&&rawAction!=='WAIT'&&multiSide!==rawAction&&
    ((scalpSide===multiSide&&movementSide===multiSide)||(movementSide===multiSide&&graphSide===multiSide)||(scalpSide===multiSide&&graphSide===multiSide))
  );
  const action:Side=neuralOverride?neuralSide:mlOverride?mlSide:multiOverride?multiSide:rawAction!=='WAIT'?rawAction:(neuralFastAligned?neuralSide:mlFastAligned?mlSide:multiStrong?multiSide:liveStrong?liveConsensus:movementSide!=='WAIT'&&movementConfidence>=52?movementSide:'WAIT');

  const evolutionWeights=evo?.weights||{};
  const learnedWeights=marketLearning?.learnedWeights||{};
  const weight=(name:string,base=1)=>{
    const ew=Number(evolutionWeights?.[name]??1),lw=Number(learnedWeights?.[name]??1);
    return cap(base*(Number.isFinite(ew)?ew:1)*(Number.isFinite(lw)?lw:1),.35,1.85);
  };
  const fusionWeight=cap(1.18*((Number(evolutionWeights?.structure||1)+Number(evolutionWeights?.learning||1))/2),.65,1.75);
  const slowScale=((neuralFastAligned||multiStrong||liveStrong)&&fastRegime)?0.68:1;
  const voteRows=[
    {name:'neuralCore',side:neuralReady?neuralSide:'WAIT',w:neuralReady?cap(1.72*(neuralConfidence/65),.95,2.05):0},
    {name:'mlCore',side:mlReady?mlSide:'WAIT',w:mlReady?cap((mlBothAligned?1.55:1.28)*(mlConfidence/65),.72,1.90):0},
    {name:'multiBrain',side:multiSide,w:multiSide==='WAIT'?0:cap(1.36*(multiConfidence/62),.72,1.85)},
    {name:'fusion',side:fusion,w:fusionWeight},
    {name:'movement',side:movementSide,w:weight('motion',1.26)*Math.max(.72,Math.min(1.28,movementConfidence/60))},
    {name:'tick',side:tickSide,w:weight('wave',1.14)*Math.max(.70,Math.min(1.30,tickConfidence/62))},
    {name:'motion',side:motion,w:weight('motion',1.06)},
    {name:'behavior',side:behavior,w:weight('behavior',.72)*slowScale},
    {name:'liquidity',side:liq,w:weight('liquidity',1.08)},
    {name:'hunter',side:hunter,w:weight('wave',1.02)},
    {name:'scalp',side:scalpSide,w:weight('scalp',1.22)*Math.max(.76,Math.min(1.25,scalpStrength/62))},
    {name:'stateGraph',side:graphSide,w:weight('stateGraph',.84)*slowScale},
    {name:'learning',side:learningUsable?learningSide:'WAIT',w:weight('learning',.90)*slowScale},
    {name:'expectedMove',side:exp.side,w:cap(weight('learning',.78)*(exp.confidence/60)*slowScale,.28,1.25)}
  ].filter(v=>v.side!=='WAIT');
  const buyWeight=voteRows.filter(v=>v.side==='BUY').reduce((s,v)=>s+v.w,0);
  const sellWeight=voteRows.filter(v=>v.side==='SELL').reduce((s,v)=>s+v.w,0);
  const totalWeight=buyWeight+sellWeight;
  const weightedGap=totalWeight?Math.abs(buyWeight-sellWeight)/totalWeight*100:0;
  const weightedConsensus:Side=totalWeight>=2&&weightedGap>=22?(buyWeight>sellWeight?'BUY':'SELL'):'WAIT';

  const vetoes=(decision?.vetoes||[]).map(String);
  const criticalVeto=vetoes.some((v:string)=>/Conflict Gate|Liquidity Gate|Trap Gate/i.test(v));
  const phaseConflict=phase==='CONFLICT';
  const hardConflict=(criticalVeto||(phaseConflict&&weightedGap<42))&&!(neuralFastAligned&&neuralSide===action)&&!(mlFastAligned&&mlSide===action)&&!(multiStrong&&multiSide===action)&&!(liveStrong&&liveConsensus===action);
  const buys=voteRows.filter(v=>v.side==='BUY').length,sells=voteRows.filter(v=>v.side==='SELL').length;
  const splitConflict=buyWeight>=1.45&&sellWeight>=1.45&&weightedGap<24&&!(neuralFastAligned&&neuralSide===action)&&!(mlFastAligned&&mlSide===action)&&!(multiStrong&&multiSide===action)&&!(liveStrong&&liveConsensus===action);
  const learningConflict=Boolean(action!=='WAIT'&&learningUsable&&learningSide!==action&&learningConfidence>=64&&learningReliability>=52&&!(neuralFastAligned&&neuralSide===action)&&!(mlFastAligned&&mlSide===action)&&!(multiStrong&&multiSide===action)&&!(liveStrong&&liveConsensus===action));
  const expectedConflict=Boolean(action!=='WAIT'&&exp.side!=='WAIT'&&exp.side!==action&&exp.confidence>=64&&!expectedLearning?.conflict&&!(neuralFastAligned&&neuralSide===action)&&!(mlFastAligned&&mlSide===action)&&!(multiStrong&&multiSide===action)&&!(liveStrong&&liveConsensus===action));

  const perf=directionPerformance(expectedLearning,action);
  const oppositePerf=directionPerformance(expectedLearning,action==='BUY'?'SELL':action==='SELL'?'BUY':'WAIT');
  const performanceBlocked=Boolean(
    action!=='WAIT'&&!neuralFastAligned&&!mlFastAligned&&!multiStrong&&!liveStrong&&(
      (perf.samples>=8&&perf.accuracy<=42)||
      (perf.samples>=12&&perf.accuracy<48&&oppositePerf.samples>=6&&oppositePerf.accuracy>=perf.accuracy+15)
    )
  );
  const conflict=hardConflict||splitConflict||learningConflict||expectedConflict;

  const fusionGap=Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0));
  const confidence=Math.max(Number(decision?.confidence||0),movementConfidence*.92,neuralFastAligned?Math.min(91,neuralConfidence):0,mlFastAligned?Math.min(90,mlConfidence):0,multiStrong?Math.min(90,multiConfidence):0,liveStrong?Math.min(86,48+liveGap*.55):0);
  // The learner calibrates scalp quality but no longer hard-blocks every live scalp while it is training.
  const learnerSide:Side=sideFrom(learner?.side);
  const learnerMature=Boolean(Number(learner?.sampleCount||0)>=180&&Number(learner?.testCount||0)>=20);
  const learnerValid=Boolean(learner?.ok&&learner?.gate?.passed&&Number(learner?.oosAccuracy)>=54&&Number(learner?.oosEdgeAtr)>=.035&&Number(learner?.profitFactor)>=1.10);
  const learnerRequired=Boolean(learnerMature&&learnerValid);
  const learnerStrongOpposite=Boolean(
    learnerMature&&learnerSide!=='WAIT'&&learnerSide!==action&&
    Number(learner?.oosAccuracy||0)>=58&&Number(learner?.oosEdgeAtr||0)>=.07&&Number(learner?.profitFactor||0)>=1.22
  );
  const edgeAligned=Boolean(!learnerRequired||learnerSide===action);
  let requiredConfidence=fastRegime?65:68;
  if(perf.samples>=6&&perf.accuracy<52)requiredConfidence+=Math.min(5,Math.ceil((52-perf.accuracy)/2));
  if(exp.side===action&&exp.confidence>=68)requiredConfidence-=2;
  if(weightedConsensus===action&&weightedGap>=45)requiredConfidence-=2;
  if(liveStrong&&liveConsensus===action)requiredConfidence-=4;
  if(multiStrong&&multiSide===action)requiredConfidence-=5;
  if(multiDecisive&&multiSide===action)requiredConfidence-=2;
  if(mlFastAligned&&mlSide===action)requiredConfidence-=4;
  if(neuralFastAligned&&neuralSide===action)requiredConfidence-=5;
  requiredConfidence=Math.round(cap(requiredConfidence,60,78));
  const consensusAligned=weightedConsensus==='WAIT'||weightedConsensus===action;
  const scalpImpulse=Boolean(scalpSide===action&&scalpStrength>=60&&scalpGap>=6);
  if(scalpImpulse&&weightedConsensus===action)requiredConfidence=Math.max(62,requiredConfidence-3);
  const fusionRequirement=neuralFastAligned?0:mlFastAligned?0:multiStrong?0:liveStrong?3:7;
  const strongEvidence=action!=='WAIT'&&confidence>=requiredConfidence&&fusionGap>=fusionRequirement&&!conflict&&!performanceBlocked&&edgeAligned&&!learnerStrongOpposite&&(consensusAligned||liveConsensus===action||multiSide===action||mlSide===action||neuralSide===action);

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
  }else if(action!=='WAIT'&&learnerStrongOpposite){
    state='EDGE_CONFLICT';
    reason=`Scalp Learner ناضج ويعارض ${action} بقوة إحصائية؛ تم خفض/منع القرار حتى يتغير التفوق.`;
  }else if(action!=='WAIT'&&weightedConsensus!=='WAIT'&&weightedConsensus!==action&&!(neuralFastAligned&&neuralSide===action)&&!(mlFastAligned&&mlSide===action)&&!(multiStrong&&multiSide===action)){
    state='WEIGHTED_CONFLICT';
    reason=`أوزان النواة المتعلمة ترجح ${weightedConsensus} بينما القرار الخام ${action}؛ لا دخول حتى يتوافقا.`;
  }else if(strongEvidence){
    if(!lock||lock.side==='WAIT'||lock.side===action){
      masterAction=action;state='TRADE';
      reason='اتجاه واحد معتمد بعد توافق الأوزان المتعلمة، سجل النتائج، والنواة.';
      locks.set(asset,{side:action,since:lock?.side===action?lock.since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
    }else{
      const pendingCount=lock.pendingSide===action?lock.pendingCount+1:1;
      const fastReversal=liveStrong&&liveConsensus===action&&tickSide===action&&['IGNITION','WAVE_FORMING'].includes(String(tick?.stage||''))&&pendingCount>=2;
      const neuralFastReversal=neuralFastAligned&&neuralLiveConfirmations>=2&&neuralSide===action&&neuralConfidence>=72&&pendingCount>=1;
      const mlFastReversal=mlFastAligned&&mlLiveConfirmations>=2&&mlSide===action&&mlConfidence>=70&&pendingCount>=1;
      const brainFastReversal=multiDecisive&&multiSide===action&&scalpSide===action&&movementSide===action&&
        (String(multiBrain?.dominantBrain||'')==='REVERSAL'||tickSide===action)&&pendingCount>=1;
      const reversalStrong=neuralFastReversal||mlFastReversal||brainFastReversal||fastReversal||(confidence>=Math.max(74,requiredConfidence+4)&&fusionGap>=9&&weightedGap>=30&&pendingCount>=3);
      if(reversalStrong){
        masterAction=action;state='TRADE';
        reason=neuralFastReversal?'تم عكس الاتجاه سريعًا بعد توافق Neural L2 + الحركة الحية.':mlFastReversal?'تم عكس الاتجاه سريعًا بعد توافق ML + الحركة الحية.':brainFastReversal?'تم عكس الاتجاه سريعًا بعد توافق Multi-Brain + Scalp + Movement.':fastReversal?'تم عكس الاتجاه سريعًا بعد توافق Live Stack + Tick ignition.':'تم السماح بعكس الاتجاه بعد تأكيدات قوية متتالية وتوافق موزون.';
        locks.set(asset,{side:action,since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
      }else{
        state='REVERSAL_LOCK';
        reason=`منع قلب الاتجاه من ${lock.side} إلى ${action} حتى 3 تأكيدات قوية متتالية (${pendingCount}/3).`;
        locks.set(asset,{...lock,lastAt:now,pendingSide:action,pendingCount});
      }
    }
  }else{
    const candidates:[Side,number][]=[
      [neuralReady?neuralSide:'WAIT',neuralConfidence],
      [mlReady?mlSide:'WAIT',mlConfidence],
      [multiSide,multiConfidence],
      [liveConsensus,liveGap],
      [movementSide,movementConfidence],
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
      rawAction,neuralCore:{side:neuralSide,confidence:neuralConfidence,ready:neuralReady,fastAligned:neuralFastAligned,liveConfirmations:neuralLiveConfirmations,override:neuralOverride,holdoutSelectiveAccuracy:Number(neural?.metrics?.holdout?.selectiveAccuracy||0),holdoutSelectiveN:Number(neural?.metrics?.holdout?.selectiveN||0)},mlCore:{side:mlSide,confidence:mlConfidence,ready:mlReady,fastAligned:mlFastAligned,liveConfirmations:mlLiveConfirmations,override:mlOverride,oneMinute:{ready:ml1Ready,side:ml1Side,confidence:ml1Confidence,selectiveAccuracy:Number(ml?.oneMinute?.metrics?.ensemble?.selectiveAccuracy||0)},fiveMinute:{ready:ml5Ready,side:ml5Side,confidence:ml5Confidence,selectiveAccuracy:Number(ml?.fiveMinute?.metrics?.ensemble?.selectiveAccuracy||0)}},multiBrain:{side:multiSide,confidence:multiConfidence,gap:multiGap,strong:multiStrong,decisive:multiDecisive,dominant:multiBrain?.dominantBrain||null,fastAgreement:Number(multiBrain?.fastAgreement||0),totalAgreement:Number(multiBrain?.totalAgreement||0),override:multiOverride},fusion,scalp:scalpSide,scalpStrength,hunter,motion,behavior,liquidity:liq,movement:movementSide,movementConfidence,stateGraph:graphSide,graphConfidence,tick:tickSide,tickConfidence,liveConsensus,liveGap:Math.round(liveGap),liveAligned,liveStrong,regime,learning:learningUsable?learningSide:'WAIT',learningConfidence,learningReliability,learningSamples,
      expectedMove:exp,confidence,requiredConfidence,fusionGap,
      directionPerformance:perf,oppositeDirectionPerformance:oppositePerf,
      evolutionWeights:evolutionWeights,
      learner:{required:learnerRequired,mature:learnerMature,valid:learnerValid,strongOpposite:learnerStrongOpposite,side:learnerSide,oosAccuracy:Number(learner?.oosAccuracy||0),netEdgeAtr:Number(learner?.oosEdgeAtr||0),profitFactor:Number(learner?.profitFactor||0)}
    },
    trade:masterAction!=='WAIT'?decision?.trade||null:null
  };
}
