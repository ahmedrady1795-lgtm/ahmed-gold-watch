type Side='BUY'|'SELL'|'WAIT';
type Stage='WATCH'|'SETUP'|'ENTRY';

const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
const side=(v:any):Side=>v==='BUY'?'BUY':v==='SELL'?'SELL':'WAIT';
const same=(a:Side,b:Side)=>a!=='WAIT'&&a===b;

function targetFor(hunt:any,key:'scalp'|'2m'|'5m'|'15m'){
  if(key==='scalp')return Number(hunt?.quickSignalTargets?.scalp?.price)||null;
  if(key==='2m')return Number(hunt?.movementStations?.[0]?.price??hunt?.quickSignalTargets?.oneMinute?.price)||null;
  if(key==='5m')return Number(hunt?.movementStations?.[1]?.price??hunt?.quickSignalTargets?.fiveMinute?.price)||null;
  return Number(hunt?.fifteenMinuteTarget?.price)||null;
}
function expectedSide(hunt:any,key:'2m'|'5m'|'15m'):Side{
  const e=hunt?.expectedMoveLearning;
  return side(key==='2m'?e?.twoMinute?.side:key==='5m'?e?.fiveMinute?.side:e?.fifteenMinute?.side);
}
function horizonNode(hunt:any,key:'2m'|'5m'|'15m'){
  return key==='2m'?hunt?.horizons?.twoMinute:key==='5m'?hunt?.horizons?.fiveMinute:hunt?.horizons?.fifteenMinute;
}

export function buildOpportunitySet(asset:string,master:any,hunt:any,learner:any,price:number|null,now=Date.now()){
  const px=Number(price),validPrice=Number.isFinite(px)&&px>0;
  if(!hunt||!validPrice)return [];

  const understanding=hunt?.marketUnderstanding||{};
  const firstSide=side(understanding?.firstMove?.side||hunt?.nextMove?.side);
  const followSide=side(understanding?.followMove?.side||hunt?.path?.followSide);
  const locked=side(master?.action);
  const weighted=side(master?.evidence?.weightedConsensus);
  const liveFailed=Boolean(hunt?.liveFailureGuard?.invalidated);
  const failedSide=side(hunt?.liveFailureGuard?.failedSide);
  const hardConflict=Boolean(master?.conflict);
  const learnerValid=Boolean(learner?.ok&&learner?.gate?.passed&&Number(learner?.oosAccuracy)>=56&&Number(learner?.oosEdgeAtr)>=.06&&Number(learner?.profitFactor)>=1.20);

  const defs=[
    {id:'scalp',label:'Scalp',mins:.5,node:hunt?.quickSignalTargets?.scalp,side:side(hunt?.quickSignalTargets?.scalp?.side),base:Number(hunt?.quickSignalTargets?.scalp?.confidence||0),minSetup:64,minWatch:54,needsLearner:true,follow:false},
    {id:'2m',label:'2 دقيقة',mins:2,node:horizonNode(hunt,'2m'),side:side(horizonNode(hunt,'2m')?.side),base:Number(horizonNode(hunt,'2m')?.strength||hunt?.nextMove?.confidence||0),minSetup:60,minWatch:50,needsLearner:false,follow:false},
    {id:'5m',label:'5 دقائق',mins:5,node:horizonNode(hunt,'5m'),side:side(horizonNode(hunt,'5m')?.side),base:Number(horizonNode(hunt,'5m')?.strength||0),minSetup:62,minWatch:52,needsLearner:false,follow:true},
    {id:'15m',label:'15 دقيقة',mins:15,node:horizonNode(hunt,'15m'),side:side(horizonNode(hunt,'15m')?.side||hunt?.fifteenMinuteTarget?.side),base:Number(horizonNode(hunt,'15m')?.strength||hunt?.fifteenMinuteTarget?.confidence||0),minSetup:64,minWatch:54,needsLearner:false,follow:true}
  ] as const;

  const out:any[]=[];
  for(const d of defs){
    if(d.side==='WAIT')continue;
    const exp=d.id==='scalp'?'WAIT':expectedSide(hunt,d.id as '2m'|'5m'|'15m');
    const structural=side(d.id==='15m'||d.id==='5m'?hunt?.waveStructure?.m5?.nextSide:hunt?.waveStructure?.m1?.nextSide);
    const phaseSide=d.follow?followSide:firstSide;
    const votes=[phaseSide,weighted,exp,structural].filter(v=>v!=='WAIT');
    const agree=votes.filter(v=>v===d.side).length;
    const oppose=votes.filter(v=>v!==d.side).length;
    let confidence=Number(d.base||0);
    confidence+=agree*5;
    confidence-=oppose*7;
    if(same(firstSide,d.side)&&!d.follow)confidence+=4;
    if(same(followSide,d.side)&&d.follow)confidence+=4;
    if(same(weighted,d.side))confidence+=3;
    if(hardConflict)confidence-=8;
    if(liveFailed&&failedSide===d.side)confidence-=18;
    if(d.needsLearner&&!learnerValid)confidence-=16;
    confidence=Math.round(cap(confidence,0,88));

    const blocked=Boolean((liveFailed&&failedSide===d.side)||(d.needsLearner&&!learnerValid));
    const horizonStrong=confidence>=d.minSetup+6&&agree>=2&&oppose<=1;
    let stage:Stage='WATCH';
    if(!blocked&&locked===d.side&&master?.state==='TRADE'&&confidence>=68)stage='ENTRY';
    else if(!blocked&&confidence>=d.minSetup&&agree>=2&&(!hardConflict||horizonStrong))stage='SETUP';

    if(confidence<d.minWatch&&stage==='WATCH')continue;

    const target=targetFor(hunt,d.id as any);
    const primarySide=side(hunt?.nextMove?.side||hunt?.path?.shortSide);
    const invalidation=primarySide===d.side&&Number.isFinite(Number(hunt?.invalidation))?Number(hunt.invalidation):null;
    const quality=Math.round(cap(
      confidence*.58+
      agree*7+
      Math.max(0,4-oppose)*2+
      (stage==='ENTRY'?8:stage==='SETUP'?4:0),
      0,90
    ));
    out.push({
      id:d.id,
      asset,
      label:d.label,
      horizonMinutes:d.mins,
      side:d.side,
      stage,
      confidence,
      quality,
      agreement:agree,
      opposition:oppose,
      entry:px,
      target:Number.isFinite(Number(target))?Number(target):null,
      invalidation,
      expiresAt:now+Math.max(2,d.mins)*60000,
      source:d.id==='scalp'?'SCALP_LEARNER':'MULTI_HORIZON_MOVEMENT',
      reason:blocked
        ?(d.needsLearner&&!learnerValid?'Scalp Learner غير مثبت على الـHoldout.':'الاتجاه داخل Live Failure Guard.')
        :stage==='ENTRY'
          ?'بوابة الدخول النهائية اجتازت مع توافق نفس الاتجاه.'
          :stage==='SETUP'
            ?(hardConflict?'Setup مستقل قوي رغم تعارض الـMaster؛ يُرسل كمراقبة ولا يتحول إلى ENTRY حتى يحسم التعارض.':'فرصة مستقلة اجتازت توافق الأفق والحركة المتوقعة.')
            :'ميل مفيد للمراقبة لكنه لم يصل لبوابة Setup.'
    });
  }

  return out.sort((a,b)=>{
    const rank=(x:any)=>x.stage==='ENTRY'?3:x.stage==='SETUP'?2:1;
    return rank(b)-rank(a)||b.quality-a.quality||b.confidence-a.confidence;
  }).slice(0,4);
}
