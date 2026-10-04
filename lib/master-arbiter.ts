type Side='BUY'|'SELL'|'WAIT';
type LockState={side:Side;since:number;lastAt:number;pendingSide:Side;pendingCount:number};
const locks=new Map<string,LockState>();

const sideFrom=(x:any):Side=>x==='BUY'?'BUY':x==='SELL'?'SELL':'WAIT';

export function masterArbitrate(asset:string,decision:any,scalp:any,now=Date.now(),learner:any=null,marketLearning:any=null,evolution:any=null){
  const action=sideFrom(decision?.action),phase=String(decision?.phase||'WAIT'),fusion=sideFrom(decision?.fusion?.side);
  const motion=sideFrom(decision?.motion?.side),behavior=sideFrom(decision?.behavior?.side),liq=sideFrom(decision?.liquidity?.side);
  const hunter=sideFrom(decision?.hunter?.side);
  const evo=evolution?.active||null;
  const minLearningConfidence=Number(evo?.thresholds?.minLearningConfidence||48),minLearningSamples=Number(evo?.thresholds?.minLearningSamples||10);
  const learningSide:Side=sideFrom(marketLearning?.side);
  const learningConfidence=Number(marketLearning?.confidence||0),learningSamples=Number(marketLearning?.effectiveSamples||0),learningReliability=Number(marketLearning?.selfCalibration?.reliability||50);
  const learningUsable=Boolean(marketLearning?.ok&&learningSide!=='WAIT'&&learningConfidence>=Math.max(54,minLearningConfidence)&&learningSamples>=minLearningSamples&&learningReliability>=45);
  const scalpSide:Side=scalp?.action==='BUY'?'BUY':scalp?.action==='SELL'?'SELL':Number(scalp?.score?.long||0)-Number(scalp?.score?.short||0)>=18?'BUY':Number(scalp?.score?.short||0)-Number(scalp?.score?.long||0)>=18?'SELL':'WAIT';

  const vetoes=(decision?.vetoes||[]).map(String);
  const hardConflict=phase==='CONFLICT'||vetoes.some((v:string)=>/Conflict Gate|Liquidity Gate|Trap Gate|Micro Gate|Motion Gate|Behavior Gate/i.test(v));
  const votes=[fusion,motion,behavior,liq,hunter,scalpSide,learningUsable?learningSide:'WAIT'].filter(x=>x!=='WAIT');
  const buys=votes.filter(x=>x==='BUY').length,sells=votes.filter(x=>x==='SELL').length;
  const splitConflict=buys>=2&&sells>=2;
  const learningConflict=Boolean(action!=='WAIT'&&learningUsable&&learningSide!==action&&learningConfidence>=64&&learningReliability>=52);
  const conflict=hardConflict||splitConflict||learningConflict;

  const fusionGap=Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0));
  const confidence=Number(decision?.confidence||0);
  const learnerRequired=Boolean(learner);
  const learnerValid=Boolean(learner?.ok&&learner?.gate?.passed&&Number(learner?.oosAccuracy)>=56&&Number(learner?.oosEdgeAtr)>=.06&&Number(learner?.profitFactor)>=1.20);
  const learnerSide:Side=sideFrom(learner?.side);
  const edgeAligned=Boolean(!learnerRequired||(learnerValid&&learnerSide===action));
  const strongEvidence=action!=='WAIT'&&confidence>=68&&fusionGap>=8&&!conflict&&edgeAligned;

  let lock=locks.get(asset);
  if(lock&&now-lock.lastAt>120000){locks.delete(asset);lock=undefined;}

  let masterAction:Side='WAIT',state='WAIT',reason='لا يوجد توافق كافٍ لإصدار اتجاه واحد.';
  let watchSide:Side='WAIT';

  if(conflict){
    state=learningConflict?'LEARNING_CONFLICT':'CONFLICT';
    reason=learningConflict?'ذاكرة السوق المتعلمة تعارض اتجاه الصفقة بثقة كافية؛ تم منع الدخول حتى يظهر توافق جديد.':'المحركات الداخلية متعارضة؛ تم إلغاء أي BUY/SELL حتى يختفي التعارض.';
  }else if(action!=='WAIT'&&learnerRequired&&!learnerValid){
    state='EDGE_BLOCKED';
    reason='تم منع الصفقة: Scalp Learner لم يثبت أفضلية موجبة كافية على Final Holdout بعد التكلفة.';
  }else if(action!=='WAIT'&&learnerRequired&&learnerSide!==action){
    state='EDGE_CONFLICT';
    reason=`تم منع الصفقة: اتجاه النواة ${action} يعارض Scalp Learner ${learnerSide}.`;
  }else if(strongEvidence){
    if(!lock||lock.side==='WAIT'||lock.side===action){
      masterAction=action;state='TRADE';
      reason='اتجاه واحد معتمد بعد توافق النواة وعدم وجود تعارض.';
      locks.set(asset,{side:action,since:lock?.side===action?lock.since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
    }else{
      const pendingCount=lock.pendingSide===action?lock.pendingCount+1:1;
      const reversalStrong=confidence>=76&&fusionGap>=12&&pendingCount>=3;
      if(reversalStrong){
        masterAction=action;state='TRADE';
        reason='تم السماح بعكس الاتجاه بعد 3 تأكيدات متتالية وتوافق قوي.';
        locks.set(asset,{side:action,since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
      }else{
        state='REVERSAL_LOCK';
        reason=`منع قلب الاتجاه من ${lock.side} إلى ${action} حتى 3 تأكيدات قوية متتالية (${pendingCount}/3).`;
        locks.set(asset,{...lock,lastAt:now,pendingSide:action,pendingCount});
      }
    }
  }else{
    const candidates:[Side,number][]=[
      [fusion,Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0))],
      [motion,Number(decision?.motion?.score||0)],
      [behavior,Number(decision?.behavior?.score||0)],
      [liq,Math.abs(Number(decision?.liquidity?.buy||0)-Number(decision?.liquidity?.sell||0))]
    ];
    const best=candidates.filter(([s])=>s!=='WAIT').sort((a,b)=>b[1]-a[1])[0];
    watchSide=best?.[0]||'WAIT';
    if(watchSide!=='WAIT'){
      state='WATCH';
      reason='يوجد ميل سوقي للمراقبة فقط، لكنه غير معتمد كصفقة.';
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
    evidence:{buyVotes:buys,sellVotes:sells,fusion,scalp:scalpSide,hunter,motion,behavior,liquidity:liq,learning:learningUsable?learningSide:'WAIT',learningConfidence,learningReliability,learningSamples,confidence,fusionGap,learner:{required:learnerRequired,valid:learnerValid,side:learnerSide,oosAccuracy:Number(learner?.oosAccuracy||0),netEdgeAtr:Number(learner?.oosEdgeAtr||0),profitFactor:Number(learner?.profitFactor||0)}},
    trade:masterAction!=='WAIT'?decision?.trade||null:null
  };
}
