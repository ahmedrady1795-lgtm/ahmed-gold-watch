import type {Candle} from './engine';

export type MoveEnvelope={
  status:'READY'|'INSUFFICIENT_DATA'|'STALE_CANDLES';
  horizonMinutes:1|5|15;barMinutes:1|5;
  samples:number;requiredSamples:number;latestClosedAt:number|null;
  allSamples:number;conditioning:'MATCHED_3_BAR_TREND'|'UNCONDITIONAL';
  walkForward:{tested:number;nominalCoveragePct:50;intervalCoveragePct:number|null;
    directionN:number;directionalAccuracyPct:number|null;
    rangeQuality:'COLLECTING'|'IN_RANGE'|'MIS_CALIBRATED';
    directionQuality:'COLLECTING'|'OBSERVED_EDGE'|'NO_DEMONSTRATED_EDGE'};
  endpointP25:number|null;endpointMedian:number|null;endpointP75:number|null;
  upsideP55:number|null;upsideP75:number|null;
  downsideP55:number|null;downsideP75:number|null;
  lowerPrice:number|null;medianPrice:number|null;upperPrice:number|null;
  description:string;
};
const round=(n:number)=>Number(n.toFixed(3));
function quantile(input:number[],q:number){
  if(!input.length)return null;
  const v=[...input].sort((a,b)=>a-b),i=(v.length-1)*q;
  return v[Math.floor(i)]+(v[Math.ceil(i)]-v[Math.floor(i)])*(i-Math.floor(i));
}
function valid(c:Candle){
  return [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&
    c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);
}
// Pure historical baseline, NOT a trained classifier, not a win probability,
// and NOT a forward test of the strategy. Only completely CLOSED bars enter;
// each observation starts at a past completed close, followed by complete
// adjacent bars. Rolling windows are non-overlapping to limit sample dependence.
// M5 uses M1 closes; M15 uses M5 closes. No M1 ATR is scaled into a 15m target.
export function observedMoveEnvelope(
  bars:Candle[],barMinutes:1|5,horizonMinutes:1|5|15,
  now:number,price:number|null
):MoveEnvelope{
  const barMs=barMinutes*60000,k=horizonMinutes/barMinutes,requiredSamples=30;
  const base:MoveEnvelope={status:'INSUFFICIENT_DATA',horizonMinutes,barMinutes,
    samples:0,requiredSamples,latestClosedAt:null,
    allSamples:0,conditioning:'UNCONDITIONAL',
    walkForward:{tested:0,nominalCoveragePct:50,intervalCoveragePct:null,
      directionN:0,directionalAccuracyPct:null,rangeQuality:'COLLECTING',
      directionQuality:'COLLECTING'},
    endpointP25:null,endpointMedian:null,endpointP75:null,
    upsideP55:null,upsideP75:null,downsideP55:null,downsideP75:null,
    lowerPrice:null,medianPrice:null,upperPrice:null,
    description:'توزيع حركة لاحقة من شموع تاريخية مغلقة، وليس احتمال ربح أو تنفيذ وسيط'};
  if(!Number.isInteger(k)||k<1||!Number.isFinite(now)||price==null||
    !Number.isFinite(price)||price<=0)return base;
  const closed=bars.filter(c=>valid(c)&&c.time+barMs<=now&&c.time>=0).slice(-450);
  const last=closed.at(-1);
  if(!last)return base;
  base.latestClosedAt=last.time+barMs;
  // A stale history cannot justify a CURRENT estimated destination.
  if(now-base.latestClosedAt>Math.max(120000,barMs*2)){
    base.status='STALE_CANDLES';return base;
  }
  const all:{delta:number;up:number;down:number;trend:number}[]=[];
  const latestTrend=closed.length>=4?Math.sign(last.close-closed[closed.length-4].close):0;
  for(let i=closed.length-k-1;i>=3;i-=k){
    const anchor=closed[i],path=closed.slice(i+1,i+k+1);
    if(path.length!==k)continue;
    let previous=anchor.time,continuous=true;
    for(const c of path){
      if(c.time!==previous+barMs){continuous=false;break;}
      previous=c.time;
    }
    if(!continuous)continue;
    const high=Math.max(...path.map(c=>c.high)),low=Math.min(...path.map(c=>c.low));
    all.push({
      delta:path.at(-1)!.close-anchor.close,
      up:Math.max(0,high-anchor.close),
      down:Math.max(0,anchor.close-low),
      // Context is observable AT the hypothetical entry candle; no future
      // prices or subsequent labels participate in choosing this sign.
      trend:Math.sign(anchor.close-closed[i-3].close)
    });
  }
  base.allSamples=all.length;
  // Forward-only time split: each held-out prediction is calculated from
  // strictly EARLIER, non-overlapping samples. A later outcome must never
  // affect an earlier test fold. This audits the price-envelope baseline,
  // not the separate AI direction model or a broker trading strategy.
  const chronological=[...all].reverse();
  let tested=0,inBand=0,directionN=0,directionHits=0;
  for(let j=Math.max(30,Math.floor(chronological.length*.70));j<chronological.length;j++){
    const prior=chronological.slice(0,j),actual=chronological[j];
    const matchedPrior=actual.trend===0?[]:prior.filter(x=>x.trend===actual.trend);
    const train=matchedPrior.length>=requiredSamples?matchedPrior:prior;
    if(train.length<requiredSamples)continue;
    const returns=train.map(x=>x.delta);
    const lower=quantile(returns,.25)!,upper=quantile(returns,.75)!;
    const mid=quantile(returns,.5)!;
    tested++;if(actual.delta>=lower-1e-8&&actual.delta<=upper+1e-8)inBand++;
    if(Math.abs(mid)>1e-8&&Math.abs(actual.delta)>1e-8){
      directionN++;if(Math.sign(mid)===Math.sign(actual.delta))directionHits++;
    }
  }
  const realizedCoverage=tested?inBand/tested*100:null;
  const directionAccuracy=directionN?directionHits/directionN*100:null;
  // This is a MONITORING gate, not statistical proof. Require enough held-out
  // observations before declaring a range plausible; no model direction is
  // promoted unless a clear (>=55%) empirical directional edge exists.
  const rangeQuality=tested<25?'COLLECTING':
    realizedCoverage!=null&&realizedCoverage>=35&&realizedCoverage<=65?'IN_RANGE':'MIS_CALIBRATED';
  const directionQuality=directionN<25?'COLLECTING':
    directionAccuracy!=null&&directionAccuracy>=55?'OBSERVED_EDGE':'NO_DEMONSTRATED_EDGE';
  base.walkForward={tested,nominalCoveragePct:50,
    intervalCoveragePct:realizedCoverage==null?null:round(realizedCoverage),
    directionN,directionalAccuracyPct:directionAccuracy==null?null:round(directionAccuracy),
    rangeQuality,directionQuality};
  const matched=latestTrend===0?[]:all.filter(x=>x.trend===latestTrend);
  const selected=matched.length>=requiredSamples?matched:all;
  base.conditioning=selected===matched?'MATCHED_3_BAR_TREND':'UNCONDITIONAL';
  const deltas=selected.map(x=>x.delta),up=selected.map(x=>x.up),down=selected.map(x=>x.down);
  base.samples=deltas.length;
  if(base.samples<requiredSamples)return base;
  const p25=quantile(deltas,.25)!,median=quantile(deltas,.5)!,p75=quantile(deltas,.75)!;
  const u55=quantile(up,.55)!,u75=quantile(up,.75)!;
  const d55=quantile(down,.55)!,d75=quantile(down,.75)!;
  return {...base,status:'READY',endpointP25:round(p25),endpointMedian:round(median),
    endpointP75:round(p75),upsideP55:round(u55),upsideP75:round(u75),
    downsideP55:round(d55),downsideP75:round(d75),
    lowerPrice:round(price+p25),medianPrice:round(price+median),
    upperPrice:round(price+p75)};
}
