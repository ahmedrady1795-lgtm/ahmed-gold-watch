/**
 * Additional server-side certification for optional BTC predictors.
 *
 * Provider flags alone cannot authorize a model as production-qualified:
 * independently held-out selective samples and coverage must be auditable.
 * This does not retrain the model, inflate its confidence, or validate GOLD.
 */
type Verdict={ready:boolean;status:'QUALIFIED'|'SHADOW';reason:string;
  oosSamples:number;selectiveSamples:number;selectiveAccuracy:number;
  selectiveCoverage:number;wilsonLower:number};

const positive=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:0;
const rate=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1?x:null;
export function wilsonLowerBound(successes:number,total:number,z=1.96){
  if(!Number.isFinite(successes)||!Number.isFinite(total)||total<=0||successes<0||successes>total)return 0;
  const p=successes/total,z2=z*z,denom=1+z2/total;
  return Math.max(0,(p+z2/(2*total)-z*Math.sqrt((p*(1-p)+z2/(4*total))/total))/denom);
}
export function certifyHoldout(metrics:any,providerReady:boolean):Verdict{
  const n=Math.floor(positive(metrics?.n)),selected=Math.floor(positive(metrics?.selectiveN));
  const accuracy=rate(metrics?.selectiveAccuracy),coverage=rate(metrics?.selectiveCoverage);
  const lower=accuracy!=null&&selected>0?wilsonLowerBound(accuracy*selected,selected):0;
  let reason='';
  if(!providerReady)reason='Provider has not qualified independent model validation';
  else if(n<120||selected<80||selected>n)reason='Not enough independent out-of-sample directional decisions';
  else if(accuracy==null||coverage==null||coverage<.10)reason='Holdout accuracy or trade coverage is unavailable/too low';
  else if(lower<=.50)reason='95% Wilson lower bound does not exceed a 50% direction baseline';
  return {ready:reason==='',status:reason?'SHADOW':'QUALIFIED',reason:reason||'Independently sampled and statistically qualified; not a profit guarantee',
    oosSamples:n,selectiveSamples:selected,selectiveAccuracy:accuracy??0,
    selectiveCoverage:coverage??0,wilsonLower:Number(lower.toFixed(4))};
}
export function certifyMlResponse(input:any){
  if(!input||typeof input!=='object'||!input.ok)return input;
  let anyBlocked=false;
  const result={...input};
  for(const key of ['oneMinute','fiveMinute'] as const){
    const horizon=input[key];
    if(!horizon||typeof horizon!=='object')continue;
    const verdict=certifyHoldout(horizon.metrics?.ensemble,Boolean(horizon.ready));
    if(Boolean(horizon.ready)&&!verdict.ready)anyBlocked=true;
    result[key]={...horizon,ready:verdict.ready,
      certification:verdict,reason:verdict.ready?horizon.reason:verdict.reason};
  }
  // Keep directional ML in SHADOW unless its individual M1/M5 horizon qualifies.
  if(anyBlocked){result.status='SHADOW';result.shadow=true;}
  return result;
}
export function certifyNeuralResponse(input:any){
  if(!input||typeof input!=='object'||!input.ok)return input;
  const age=Number(input.snapshotAgeMs);
  const fresh=Number.isFinite(age)&&age>=0&&age<=45000;
  const verdict=certifyHoldout(input.metrics?.holdout,Boolean(input.ready)&&fresh);
  const reason=!fresh?'Neural inference snapshot age missing, invalid, or older than 45 seconds':verdict.reason;
  return {...input,ready:verdict.ready&&fresh,
    side:verdict.ready&&fresh?input.side:'WAIT',
    status:verdict.ready&&fresh?input.status:'SHADOW',
    certification:{...verdict,ready:verdict.ready&&fresh,reason},reason:verdict.ready&&fresh?input.reason:reason};
}
