import {closedM1ChartBars,type M1Bar} from './sniper-mt5-m1';
import {assessM1DirectionalPriority} from './sniper-m1-priority';

/** A causal BUY/SELL hypothesis for EVERY adjacent, freshly closed minute.
 * Unlike the certified entry engine, low-pressure minutes are NOT discarded:
 * they receive a directional guess plus an explicit LOW_EVIDENCE warning.
 * Scores are signed pressure magnitudes, never calibrated win percentages.
 */
export type EveryM1Direction={
  issuedAt:number;side:'BUY'|'SELL';pressure:number;weak:boolean;
  atr:number;anchorTime:number;pattern:'SWEEP_REJECTION'|'MOMENTUM';
  directionReason:string;
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

export function everyM1Direction(raw:readonly M1Bar[],now:number):EveryM1Direction|null{
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
  const candidate=reversal||momentum;
  const adaptive=chooseAdaptive(rows);
  const alternative=adaptive.improved?rawCandidate(rows,adaptive.model):null;
  const side=alternative??candidate;
  const weak=adaptive.improved?false:
    p.side==='WAIT'||(reversal!=null&&reversal!==momentum)||p.pressureScore<35;
  return {issuedAt:last.time+60000,side,pressure:p.pressureScore,
    weak,atr,anchorTime:last.time,
    pattern:reversal?'SWEEP_REJECTION':'MOMENTUM',
    adaptive,
    directionReason:adaptive.improved?
      'اختيار متكيف بعد تحقق تاريخي متتابع؛ ليس ضمانًا لشمعة جديدة':
      reversal?'رفض كسر قمة/قاع بعد سحب سيولة في شمعة مغلقة':
      'ترجيح من إغلاق وزخم شموع ماضية فقط'};
}
