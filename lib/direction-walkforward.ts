import type {Candle} from './engine';

// Independent technical DIRECTION audit, not a test of the full ensemble or a
// broker-executable strategy. No training on holdout observations, no future
// candles in current predictions, and no optimistic interpretation of WAIT.
type Side='BUY'|'SELL'|'WAIT';
type Strategy='MOMENTUM_3'|'EMA_8_21'|'BREAKOUT_8'|'TREND_CONFIRM';
type Example={at:number;outcome:Side;signals:Record<Strategy,Side>};
const strategies:Strategy[]=['MOMENTUM_3','EMA_8_21','BREAKOUT_8','TREND_CONFIRM'];
const dir=(x:number,threshold:number):Side=>x>threshold?'BUY':x< -threshold?'SELL':'WAIT';
const round=(x:number)=>Number(x.toFixed(2));
function valid(c:Candle){return [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&
  c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);}
function ema(a:number[],period:number){
  const alpha=2/(period+1);let v=a[0];
  for(let i=1;i<a.length;i++)v=v+alpha*(a[i]-v);
  return v;
}
function signals(rows:Candle[],i:number,atr:number):Record<Strategy,Side>{
  const c=rows[i],closes=rows.slice(i-35,i+1).map(x=>x.close);
  const mom=dir(c.close-rows[i-3].close,atr*.16);
  const e=dir(ema(closes,8)-ema(closes,21),atr*.12);
  const prev=rows.slice(i-8,i),hi=Math.max(...prev.map(x=>x.high)),lo=Math.min(...prev.map(x=>x.low));
  const breakout:Side=c.close>hi+atr*.03?'BUY':c.close<lo-atr*.03?'SELL':'WAIT';
  const body=dir(c.close-c.open,atr*.10);
  return {MOMENTUM_3:mom,EMA_8_21:e,BREAKOUT_8:breakout,
    TREND_CONFIRM:mom!=='WAIT'&&mom===e&&body===mom?mom:'WAIT'};
}
function evaluate(rows:Example[],strategy:Strategy){
  let n=0,hits=0,signalsN=0,neutral=0;
  for(const r of rows){
    const prediction=r.signals[strategy];
    if(prediction==='WAIT')continue;
    signalsN++;
    if(r.outcome==='WAIT'){neutral++;continue;}
    n++;if(prediction===r.outcome)hits++;
  }
  const accuracy=n?hits/n*100:null;
  const p=n?hits/n:0,z=1.96,denom=1+z*z/Math.max(n,1);
  const lower=n?((p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/denom)*100:null;
  return {n,hits,signals:signalsN,neutral,accuracyPct:accuracy==null?null:round(accuracy),
    lower95Pct:lower==null?null:round(lower),
    coveragePct:rows.length?round(signalsN/rows.length*100):0};
}
export function validateDirectionChronologically(
  candles:Candle[],now:number,horizon:1|5,roundTripCost:number
){
  const base={
    status:'INSUFFICIENT' as 'INSUFFICIENT'|'SHADOW'|'QUALIFIED',
    assetMode:'TECHNICAL_DIRECTION_ONLY' as const,horizon,
    selected:'MOMENTUM_3' as Strategy,liveSide:'WAIT' as Side,
    closedBars:0,trainRows:0,testRows:0,
    train:null as ReturnType<typeof evaluate>|null,
    holdout:null as ReturnType<typeof evaluate>|null,
    baseline:null as ReturnType<typeof evaluate>|null,
    qualified:false,reason:'Insufficient independent time-ordered directional outcomes',
    // Explicitly not a measure of profitability or the ensemble's true accuracy.
    note:'Closed M1 candles, disjoint time holdout and conservative cost deadzone; NOT Exness fills or full ensemble validation'
  };
  if(!Number.isFinite(now)||!Number.isFinite(roundTripCost)||roundTripCost<0)return base;
  const closed=candles.filter(c=>valid(c)&&c.time+60000<=now&&c.time>=0).slice(-650);
  base.closedBars=closed.length;
  if(closed.length<110)return base;
  // Refuse an outdated/fragmented source rather than silently joining gaps.
  if(now-(closed.at(-1)!.time+60000)>90000||
    closed.slice(-90).some((c,i,a)=>i>0&&c.time-a[i-1].time!==60000)){
    return {...base,reason:'Stale or gapped latest M1 candles'};
  }
  const examples:Example[]=[];
  // Nonoverlapping outcome horizons avoid reporting five overlapping M5
  // predictions as five independent trials.
  for(let i=35;i+horizon<closed.length;i+=horizon){
    const anchor=closed[i],future=closed[i+horizon];
    const window=closed.slice(i-35,i+horizon+1);
    if(window.some((c,j)=>j>0&&c.time-window[j-1].time!==60000))continue;
    const past=closed.slice(i-13,i+1);
    const tr=past.slice(1).map((c,j)=>Math.max(c.high-c.low,Math.abs(c.high-past[j].close),Math.abs(c.low-past[j].close)));
    const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
    if(!(atr>0))continue;
    // A movement that cannot clear plausible round trip costs is neutral,
    // not a directional trading win. This is NOT an execution simulator.
    const deadzone=Math.max(atr*.18,roundTripCost*1.1);
    examples.push({at:anchor.time+60000,
      outcome:dir(future.close-anchor.close,deadzone),
      signals:signals(closed,i,atr)});
  }
  if(examples.length<50)return {...base,reason:'Fewer than 50 disjoint labelled historical decisions'};
  const cut=Math.floor(examples.length*.64);
  const train=examples.slice(0,cut),test=examples.slice(cut);
  const baselineTrain=evaluate(train,'MOMENTUM_3');
  const score=(x:ReturnType<typeof evaluate>)=>x.n>=16&&x.coveragePct>=10&&x.lower95Pct!=null?
    x.lower95Pct*(.75+.25*Math.min(1,x.coveragePct/40)):-Infinity;
  let selected:Strategy='MOMENTUM_3',best=score(baselineTrain);
  for(const strategy of strategies.slice(1)){
    const result=evaluate(train,strategy),rank=score(result);
    if(rank>best+1){selected=strategy;best=rank;}
  }
  const selectedTrain=evaluate(train,selected);
  const holdout=evaluate(test,selected),baseline=evaluate(test,'MOMENTUM_3');
  // Holdout is evaluated AFTER selection and never chooses which strategy
  // wins. A positive label requires adequate independent sample, a credible
  // lower Wilson bound and superiority to the fixed momentum baseline.
  const qualified=selected!=='MOMENTUM_3'&&holdout.n>=35&&
    holdout.coveragePct>=18&&holdout.accuracyPct!=null&&
    holdout.accuracyPct>=58&&holdout.lower95Pct!=null&&holdout.lower95Pct>50&&
    baseline.accuracyPct!=null&&holdout.accuracyPct>=baseline.accuracyPct+3;
  const atrRecent=closed.slice(-15).reduce((sum,c)=>sum+c.high-c.low,0)/15;
  const latest=signals(closed,closed.length-1,Math.max(.0000001,atrRecent));
  return {...base,status:qualified?'QUALIFIED' as const:'SHADOW' as const,
    selected,liveSide:latest[selected],trainRows:train.length,
    testRows:test.length,train:selectedTrain,holdout,baseline,qualified,
    reason:qualified?'Selected technical direction exceeded momentum baseline on untouched holdout':
      'No independent edge over fixed momentum baseline; candidate kept shadow only'};
}
