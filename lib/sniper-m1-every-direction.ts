import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import type {FlowProfileDecision} from './flow-profile-decision';
import {assessM1DirectionalPriority} from './sniper-m1-priority';
import {assessM1Conflict,type M1ConflictResult} from './sniper-m1-conflict-arbiter';
import {selectM1RegimeRecovery,type M1RecoveryRow,type M1RecoveryModel} from './sniper-m1-regime-recovery';
import {selectM1RelativeEdge,type M1EdgeRow,type M1EdgeModel} from './sniper-m1-relative-edge';
import {detectM1PreBreak} from './sniper-m1-prebreak';
import {classifyM1MarketRegime,type M1MarketRegime} from './sniper-m1-market-regime';
import {selectRegimeM1Expert,type RegimeExpertRow,type RegimeExpert} from './sniper-m1-regime-selector';

/** A causal BUY/SELL hypothesis for EVERY adjacent, freshly closed minute.
 * Unlike the certified entry engine, low-pressure minutes are NOT discarded:
 * they receive a directional guess plus an explicit LOW_EVIDENCE warning.
 * Scores are signed pressure magnitudes, never calibrated win percentages.
 */
export type EveryM1Direction={
  issuedAt:number;side:'BUY'|'SELL';pressure:number;weak:boolean;
  atr:number;anchorTime:number;pattern:'SWEEP_REJECTION'|'MOMENTUM'|'PRE_BREAK';
  dataQuality:'NORMAL'|'FLAT_CLUSTER'|'LOW_ACTIVITY';flatRecent:number;preBreakCompression:number;
  marketRegime:M1MarketRegime;regimeEfficiency:number;regimeCompression:number;
  regimeExpert?:{applied:boolean;model:RegimeExpert|null;trainN:number;checkN:number;
    trainHits:number;checkHits:number;trainPressureHits:number;
    checkPressureHits:number;reason:string};
  directionReason:string;
  flowEvidence?:{side:'BUY'|'SELL';quality:FlowProfileDecision['quality'];
    strength:number;applied:boolean;preIssued:true};
  conflictOverride?:{applied:boolean;trainN:number;trainFollowHits:number;checkN:number;checkFollowHits:number};
  recentRecovery?:{applied:boolean;model:M1RecoveryModel|null;trainN:number;checkN:number;pressureTrain:number;pressureCheck:number;challengerTrain:number;challengerCheck:number};
  relativeEdge?:{applied:boolean;model:M1EdgeModel|null;trainN:number;checkN:number;trainHits:number;checkHits:number;trainPressureHits:number;checkPressureHits:number;reason:string};
  // A rolling, past-only comparison. Not an OOS broker/TP win rate.
  adaptive?:{
    model:'PRESSURE_SWEEP'|'BODY_FOLLOW'|'BODY_FADE'|'THREE_CLOSE'|'EXHAUSTION_FADE';
    trained:number;trainHits:number;
    checked:number;checkHits:number;simpleCheckHits:number;
    improved:boolean;
  }
};
type Side='BUY'|'SELL';
type Model=NonNullable<EveryM1Direction['adaptive']>['model'];
const MODELS:readonly Model[]=['PRESSURE_SWEEP','BODY_FOLLOW','BODY_FADE',
  'THREE_CLOSE','EXHAUSTION_FADE'] as const;
const opposite=(s:Side):Side=>s==='BUY'?'SELL':'BUY';
const body=(b:M1Bar):Side=>b.close>b.open?'BUY':'SELL';
const isContiguous=(rows:readonly M1Bar[])=>rows.every((b,i)=>
  i===0||b.time-rows[i-1].time===60000);

/** Each candidate reads at most candles whose CLOSE preceded issuance.
 * No currently forming bar, quote, forward labels, or live ledger outcome.
 */
function rawCandidate(rows:readonly M1Bar[],model:Model):Side|null{
  if(rows.length<21||!isContiguous(rows.slice(-21)))return null;
  const last=rows.at(-1)!,previous=rows.at(-2)!;
  const p=assessM1DirectionalPriority(rows,last.time+60000);
  if(!p.ready)return null;
  const range=Math.max(last.high-last.low,1e-8);
  const upper=last.high-Math.max(last.open,last.close);
  const lower=Math.min(last.open,last.close)-last.low;
  const prior=rows.slice(-7,-1);
  const priorHigh=Math.max(...prior.map(b=>b.high));
  const priorLow=Math.min(...prior.map(b=>b.low));
  const sample=rows.slice(-15),tr=sample.map((b,i)=>
    i===0?b.high-b.low:Math.max(b.high-b.low,
      Math.abs(b.high-sample[i-1].close),Math.abs(b.low-sample[i-1].close)));
  const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
  if(!Number.isFinite(atr)||atr<=0)return null;
  const rejectHigh=last.high>priorHigh+atr*.03&&
    last.close<priorHigh-atr*.05&&upper/range>=.38&&last.close<last.open;
  const rejectLow=last.low<priorLow-atr*.03&&
    last.close>priorLow+atr*.05&&lower/range>=.38&&last.close>last.open;
  const lastSide=last.close===last.open?
    last.close>=previous.close?'BUY':'SELL':body(last);
  const signed=.48*p.emaSpreadAtr+.30*p.impulseAtr+.15*p.closeLocation;
  const pressure=p.side!=='WAIT'?p.side:
    signed>0?'BUY':signed<0?'SELL':lastSide;
  if(model==='PRESSURE_SWEEP')
    return rejectHigh&&!rejectLow?'SELL':rejectLow&&!rejectHigh?'BUY':pressure;
  if(model==='BODY_FOLLOW')return lastSide;
  if(model==='BODY_FADE')return opposite(lastSide);
  if(model==='THREE_CLOSE'){
    const three=last.close-rows.at(-4)!.close;
    return three>0?'BUY':three<0?'SELL':lastSide;
  }
  // End-of-impulse fade, not a blanket reversal: a large, one-sided
  // close after 2 or more reinforcing bodies is the exhaustion candidate.
  const prevSide=body(previous);
  const moved=Math.abs(last.close-rows.at(-3)!.close);
  const exhausted=lastSide===prevSide&&moved>=atr*.95&&
    Math.abs(last.close-last.open)>=atr*.36;
  return rejectHigh&&!rejectLow?'SELL':rejectLow&&!rejectHigh?'BUY':
    exhausted?opposite(lastSide):pressure;
}
type PastScore={n:number;hits:number;baselineHits:number};
function scorePast(rows:readonly M1Bar[],model:Model,start:number,end:number):PastScore{
  let n=0,hits=0,baselineHits=0;
  for(let i=start;i<end;i++){
    const observed=rows[i];
    if(!observed||observed.close===observed.open)continue;
    const prefix=rows.slice(0,i);
    const prediction=rawCandidate(prefix,model);
    const baseline=rawCandidate(prefix,'BODY_FOLLOW');
    if(!prediction||!baseline)continue;
    n++;
    const actual=body(observed);
    if(prediction===actual)hits++;
    if(baseline===actual)baselineHits++;
  }
  return {n,hits,baselineHits};
}
/**
 * Train on older closed observations, then check on a later disjoint 12-bar
 * chronological window. The check is used to gate a model switch, so it is
 * NOT independent forward proof of profit and must not be labelled as such.
 * On insufficient evidence, retain the original pressure model as WEAK.
 */
function chooseAdaptive(rows:readonly M1Bar[]){
  const empty=()=>({model:'PRESSURE_SWEEP' as Model,trained:0,
    trainHits:0,checked:0,checkHits:0,simpleCheckHits:0,improved:false});
  if(rows.length<51||!isContiguous(rows.slice(-51)))return empty();
  const checkStart=rows.length-12;
  const trainStart=Math.max(21,checkStart-35);
  const training=MODELS.map(model=>({model,
    score:scorePast(rows,model,trainStart,checkStart)}))
    .filter(x=>x.score.n>=18);
  // Require a genuine difference versus last-body baseline in training.
  // Using a deterministic tie-breaker prevents order-dependent repaint.
  training.sort((a,b)=>{
    const aEdge=a.score.hits-a.score.baselineHits;
    const bEdge=b.score.hits-b.score.baselineHits;
    const aRank=(a.score.hits+1)/(a.score.n+2)+Math.min(4,aEdge)*.005;
    const bRank=(b.score.hits+1)/(b.score.n+2)+Math.min(4,bEdge)*.005;
    return bRank-aRank||MODELS.indexOf(a.model)-MODELS.indexOf(b.model);
  });
  const best=training[0];if(!best)return empty();
  const check=scorePast(rows,best.model,checkStart,rows.length);
  const improved=best.model!=='PRESSURE_SWEEP'&&
    best.score.hits>=Math.ceil(best.score.n*.62)&&
    check.n>=10&&check.hits>=Math.ceil(check.n*.67)&&
    check.hits-check.baselineHits>=2;
  // Critical audit fix: when a challenger fails its later check, the engine
  // uses PRESSURE_SWEEP. Report PRESSURE_SWEEP's actual train/check outcomes,
  // not the rejected challenger's hits under the fallback model label.
  const reportedModel:Model=improved?best.model:'PRESSURE_SWEEP';
  const reportedTrain=improved?best.score:
    training.find(x=>x.model==='PRESSURE_SWEEP')?.score??
      scorePast(rows,'PRESSURE_SWEEP',trainStart,checkStart);
  const reportedCheck=improved?check:
    scorePast(rows,'PRESSURE_SWEEP',checkStart,rows.length);
  return {model:reportedModel,
    trained:reportedTrain.n,trainHits:reportedTrain.hits,
    checked:reportedCheck.n,checkHits:reportedCheck.hits,
    simpleCheckHits:reportedCheck.baselineHits,improved};
}

/** Two separated past-only windows. Never score the current, unclosed M1.
 * Research arbitration applies only on a CURRENT pressure/body disagreement;
 * it cannot borrow the already-validated alternating-candle adaptive head.
 */
function pressureBodyConflict(rows:readonly M1Bar[]){
 if(rows.length<64||!isContiguous(rows.slice(-64)))return null;
 const train:M1ConflictResult[]=[],check:M1ConflictResult[]=[];
 const start=rows.length-42,split=rows.length-14;
 for(let i=start;i<rows.length;i++){
   const actual=rows[i];
   if(actual.close===actual.open)continue;
   const prefix=rows.slice(0,i);
   const pressure=rawCandidate(prefix,'PRESSURE_SWEEP');
   const follow=rawCandidate(prefix,'BODY_FOLLOW');
   if(!pressure||!follow||pressure===follow)continue;
   (i<split?train:check).push({pressure,follow,actual:body(actual)});
 }
 return assessM1Conflict(train,check);
}

/** Recover only if a new 8+8 *past* run jointly refutes the existing
 * pressure hypothesis; no current forming candle or future label is used.
 * All recovery outputs remain WEAK research until prospective proof exists.
 */
function recoverRecentM1(rows:readonly M1Bar[]){
 if(rows.length<52||!isContiguous(rows.slice(-52)))return null;
 const older:M1RecoveryRow[]=[],later:M1RecoveryRow[]=[];
 for(let i=rows.length-16;i<rows.length;i++){
   const prefix=rows.slice(0,i),actual=rows[i];
   if(actual.close===actual.open)continue;
   const pressure=rawCandidate(prefix,'PRESSURE_SWEEP');
   const bodyFollow=rawCandidate(prefix,'BODY_FOLLOW');
   const bodyFade=rawCandidate(prefix,'BODY_FADE');
   const threeClose=rawCandidate(prefix,'THREE_CLOSE');
   if(!pressure||!bodyFollow||!bodyFade||!threeClose)continue;
   (i<rows.length-8?older:later).push({
     pressure,bodyFollow,bodyFade,threeClose,observed:body(actual)});
 }
 return selectM1RegimeRecovery(older,later);
}

/**
 * Causally replay the SAME rawCandidate implementations, without looking at
 * the candle being graded. 12 older decisions choose the challenger, 12
 * later decisions check it. Disagreements and dojis cannot be counted as
 * wins; source/gap guards are identical to production M1.
 */
function recentRelativeEdge(rows:readonly M1Bar[]){
  if(rows.length<52||!isContiguous(rows.slice(-52)))return null;
  const older:M1EdgeRow[]=[],later:M1EdgeRow[]=[];
  for(let i=rows.length-24;i<rows.length;i++){
    const p=rows.slice(0,i),actual=rows[i];
    if(actual.close===actual.open)continue;
    const pressure=rawCandidate(p,'PRESSURE_SWEEP');
    const bodyFollow=rawCandidate(p,'BODY_FOLLOW');
    const bodyFade=rawCandidate(p,'BODY_FADE');
    const threeClose=rawCandidate(p,'THREE_CLOSE');
    const exhaustionFade=rawCandidate(p,'EXHAUSTION_FADE');
    if(!pressure||!bodyFollow||!bodyFade||!threeClose||!exhaustionFade)
      continue;
    (i<rows.length-12?older:later).push({
      pressure,bodyFollow,bodyFade,threeClose,exhaustionFade,
      actual:body(actual)
    });
  }
  return selectM1RelativeEdge(older,later);
}

/** Same-regime research selection is split into 15 EARLIER and 15 LATER
 * past outcomes, strictly before the candle currently being predicted.
 * No partial candle, future bid/ask or hypothetical limit outcome is used.
 */
function historicalRegimeExpert(rows:readonly M1Bar[],regime:M1MarketRegime){
 if(rows.length<64||!isContiguous(rows.slice(-64)))return null;
 const older:RegimeExpertRow[]=[],later:RegimeExpertRow[]=[];
 for(let i=rows.length-30;i<rows.length;i++){
   const prefix=rows.slice(0,i),actual=rows[i];
   if(actual.close===actual.open)continue;
   const group=classifyM1MarketRegime(prefix,prefix.at(-1)!.time+60000);
   if(!group.ready)continue;
   const pressure=rawCandidate(prefix,'PRESSURE_SWEEP');
   const bodyFollow=rawCandidate(prefix,'BODY_FOLLOW');
   const bodyFade=rawCandidate(prefix,'BODY_FADE');
   const threeClose=rawCandidate(prefix,'THREE_CLOSE');
   const exhaustionFade=rawCandidate(prefix,'EXHAUSTION_FADE');
   if(!pressure||!bodyFollow||!bodyFade||!threeClose||!exhaustionFade)
     continue;
   (i<rows.length-15?older:later).push({
     regime:group.regime,observed:body(actual),pressure,bodyFollow,
     bodyFade,threeClose,exhaustionFade
   });
 }
 return selectRegimeM1Expert(regime,older,later);
}

// Kept local to the isolated, pure M1 predictor: research fixtures and
// the paper engine load it without network/DOM/singleton dependencies.
const preIssuedFlow=(flow:FlowProfileDecision|null|undefined,at:number)=>Boolean(
  flow?.ready&&flow.side!=='WAIT'&&flow.asOf!=null&&
  flow.observedAt!=null&&Number.isFinite(flow.observedAt)&&
  Number.isFinite(at)&&flow.asOf<=at&&at-flow.asOf<=15000&&
  flow.observedAt<=at&&at-flow.observedAt<=15000);

export function everyM1Direction(raw:readonly M1Bar[],now:number,
 flow?:FlowProfileDecision|null):EveryM1Direction|null{
  const rows=closedM1ChartBars(raw,now,72),last=rows.at(-1);
  if(rows.length<21||!last||now-last.time-60000<0||
    now-last.time-60000>=60000)return null;
  // One-minute research cannot claim a new signal from a stitched,
  // discontinuous candle feed. A missing minute is missing evidence.
  const window=rows.slice(-21);
  if(window.some((bar,i)=>i>0&&bar.time-window[i-1].time!==60000))
    return null;
  const p=assessM1DirectionalPriority(rows,now);
  if(!p.ready)return null;
  const ranges=rows.slice(-15).map((b,i,a)=>i===0?b.high-b.low:
    Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
      Math.abs(b.low-a[i-1].close)));
  const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;
  if(!Number.isFinite(atr)||atr<=0)return null;
  const prior=rows.slice(-7,-1);
  const priorHigh=Math.max(...prior.map(x=>x.high));
  const priorLow=Math.min(...prior.map(x=>x.low));
  const candleRange=Math.max(atr*.08,last.high-last.low);
  const upperWick=last.high-Math.max(last.open,last.close);
  const lowerWick=Math.min(last.open,last.close)-last.low;
  // Closed-bar sweep followed by a rejection is a genuinely new reason
  // to prefer a reversal over lagging EMA momentum. No future candle/tick.
  const rejectHigh=last.high>priorHigh+atr*.03&&
    last.close<priorHigh-atr*.05&&
    upperWick/candleRange>=.38&&last.close<last.open;
  const rejectLow=last.low<priorLow-atr*.03&&
    last.close>priorLow+atr*.05&&
    lowerWick/candleRange>=.38&&last.close>last.open;
  const reversal:EveryM1Direction['side']|null=
    rejectHigh&&!rejectLow?'SELL':rejectLow&&!rejectHigh?'BUY':null;
  const signed=.48*p.emaSpreadAtr+.30*p.impulseAtr+.15*p.closeLocation;
  const prev=rows.at(-2)!;
  const momentum:EveryM1Direction['side']=p.side!=='WAIT'?p.side:
    signed>0?'BUY':signed<0?'SELL':
      last.close>last.open?'BUY':last.close<last.open?'SELL':
        last.close>=prev.close?'BUY':'SELL';
  const early=rows.length>=32?detectM1PreBreak(rows,now):null;
  const flatRecent=rows.slice(-6).filter(b=>b.open===b.close).length;
  const flatCluster=flatRecent>=4;
  const marketRegime=classifyM1MarketRegime(rows,now);
  const lowActivity=marketRegime.regime==='LOW_ACTIVITY';
  const candidate=reversal||momentum;
  const adaptive=chooseAdaptive(rows);
  const alternative=adaptive.improved?rawCandidate(rows,adaptive.model):null;
  const regimeExpert=adaptive.improved||reversal!=null||!marketRegime.ready?
    null:historicalRegimeExpert(rows,marketRegime.regime);
  const pastConflict=adaptive.improved?null:pressureBodyConflict(rows);
  const recovery=adaptive.improved||reversal!=null?null:recoverRecentM1(rows);
  const relative=adaptive.improved||reversal!=null?null:recentRelativeEdge(rows);
  const pressureNow=rawCandidate(rows,'PRESSURE_SWEEP');
  const regimeNow=regimeExpert?.model?rawCandidate(rows,regimeExpert.model):null;
  const applyRegime=Boolean(!flatCluster&&!lowActivity&&regimeNow&&
    pressureNow===candidate&&regimeNow!==candidate);
  const followNow=rawCandidate(rows,'BODY_FOLLOW');
  const recoveryNow=recovery?.model?rawCandidate(rows,recovery.model):null;
  const relativeNow=relative?.model?rawCandidate(rows,relative.model):null;
  const applyRelative=Boolean(!applyRegime&&relativeNow&&pressureNow===candidate&&
    relativeNow!==candidate);
  const applyRecovery=Boolean(!applyRegime&&!applyRelative&&recoveryNow&&pressureNow===candidate&&
    recoveryNow!==candidate);
  const applyConflict=Boolean(!applyRegime&&!applyRelative&&!applyRecovery&&pastConflict?.useFollow&&
    pressureNow===candidate&&followNow&&followNow!==pressureNow);
  // A new pre-break pattern can correct a weak momentum guess, but must not
  // override a verified adaptive model, an observed sweep reversal or a
  // challenger already selected using two historical windows.
  const applyEarly=Boolean(!flatCluster&&!lowActivity&&!applyRegime&&!reversal&&!adaptive.improved&&
    !applyRelative&&!applyRecovery&&!applyConflict&&
    early?.ready&&early.side!=='WAIT'&&early.side!==candidate&&
    (p.side==='WAIT'||p.pressureScore<35));
  const side=alternative??(applyRegime?regimeNow!:
    applyRelative?relativeNow!:applyRecovery?recoveryNow!:
    applyConflict?followNow!:applyEarly?early!.side as 'BUY'|'SELL':candidate);
  // A newly selected historical conflict challenger is NOT automatically
  // qualified for broker execution. It remains weak until new forward proof.
  const weak=flatCluster||lowActivity||applyRegime||applyEarly||applyRelative||applyRecovery||applyConflict?true:adaptive.improved?false:
    p.side==='WAIT'||(reversal!=null&&reversal!==momentum)||p.pressureScore<35;
  // Only evidence actually received before the next minute may influence the
  // first hypothesis; later flow cannot repaint a prior forecast.
  const causalFlow=preIssuedFlow(flow,last.time+60000)&&
    (flow?.side==='BUY'||flow?.side==='SELL')?flow:null;
  const flowOpposes=Boolean(causalFlow&&causalFlow.side!==side);
  const flowApplied=Boolean(causalFlow&&weak&&
    !flatCluster&&!lowActivity&&causalFlow.strength>=45);
  const selectedSide:'BUY'|'SELL'=flowApplied?
    causalFlow!.side as 'BUY'|'SELL':side;
  const selectedWeak=weak||flowOpposes||
    Boolean(causalFlow?.quality==='INDICATIVE_BROKER');
  return {issuedAt:last.time+60000,side:selectedSide,pressure:p.pressureScore,
    weak:selectedWeak,atr,anchorTime:last.time,
    flowEvidence:causalFlow?{
      side:causalFlow.side as 'BUY'|'SELL',quality:causalFlow.quality,
      strength:causalFlow.strength,applied:flowApplied,preIssued:true as const
    }:undefined,
    pattern:reversal?'SWEEP_REJECTION':applyEarly?'PRE_BREAK':'MOMENTUM',
    dataQuality:flatCluster?'FLAT_CLUSTER':lowActivity?'LOW_ACTIVITY':'NORMAL',flatRecent,
    preBreakCompression:early?.compression??0,
    marketRegime:marketRegime.regime,
    regimeEfficiency:marketRegime.efficiency,
    regimeCompression:marketRegime.compression,
    regimeExpert:regimeExpert?{...regimeExpert,applied:applyRegime}:undefined,
    adaptive,
    conflictOverride:pastConflict?{
      applied:applyConflict,trainN:pastConflict.trainN,
      trainFollowHits:pastConflict.trainFollowHits,checkN:pastConflict.checkN,
      checkFollowHits:pastConflict.checkFollowHits
    }:undefined,
    recentRecovery:recovery?{...recovery,applied:applyRecovery}:undefined,
    relativeEdge:relative?{...relative,applied:applyRelative}:undefined,
    directionReason:flowApplied?
      (causalFlow!.quality==='EXECUTED_SAMPLE'?
       'ترجيح M1 البحثي من POC ودلتا صفقات منفذة لوحظت قبل الدقيقة':
       'ترجيح M1 البحثي من نشاط أسعار وعمق وسيط MT5، لا من حجم عقود منفذ'):
      flowOpposes?'تعارض قراءة الأسعار مع تدفق موثّق قبل الشمعة؛ الثقة ضعيفة':
      flatCluster?
      'تكرار شموع M1 محايدة؛ احتمال دقة تغذية ضعيفة، التوقع بحثي ولا يرفع الثقة':
      lowActivity?
      'حركة دقيقة ضعيفة أو شموع محايدة؛ لا ترخيص سكالب من اتجاه بحثي':
      applyRegime?
      'اختيار نموذج M1 مناسب لحالة السوق بعد تفوق في فترتين تاريخيتين منفصلتين؛ يحتاج إثباتًا جديدًا':
      
      applyEarly?
      'انضغاط نطاق M1 وقيعان صاعدة/قمم هابطة قبل الكسر؛ تجربة بحثية ضعيفة الثقة':
      applyRelative?
      'نموذج اتجاه بديل تفوق نسبيًا في فترتين تاريخيتين منفصلتين؛ يخضع للاختبار الأمامي':
      applyRecovery?
      'مرشح إنقاذ بحثي بعد 8 تدريب + 8 مراجعة سابقة؛ ليس نتيجة LIVE مثبتة':
      applyConflict?
      'تجربة ترجيح اتجاه الجسم بعد تفوق في عينتين سابقتين؛ تحتاج إثباتًا أماميًا جديدًا':
      adaptive.improved?
      'اختيار متكيف بعد تحقق تاريخي متتابع؛ ليس ضمانًا لشمعة جديدة':
      reversal?'رفض كسر قمة/قاع بعد سحب سيولة في شمعة مغلقة':
      'ترجيح من إغلاق وزخم شموع ماضية فقط'};
}
