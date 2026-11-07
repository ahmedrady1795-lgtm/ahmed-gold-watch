import type {M15GuideBar} from './sniper-m15-watch-guide';
import {buildM15WatchGuide} from './sniper-m15-watch-guide';
import {buildM15HuntPreview} from './sniper-m15-hunt-preview';

/** Historical forward replay of the EXACT M15 hunt preference rendered
 * on the chart, not an unrelated strategy's score or broker win rate.
 * At index i the predictor sees only bars < i; candle i is later graded.
 */
export type M15HuntProof={
 status:'COLLECTING'|'FORWARD_EDGE_CANDIDATE'|'NO_DEMONSTRATED_EDGE';
 n:number;modelHits:number;baselineHits:number;
 modelOnly:number;baselineOnly:number;
 modelPct:number|null;baselinePct:number|null;
 pairedWinLower95Pct:number|null;neutral:number;weakExcluded:number;
 source:'CLOSED_M15_REPLAY';isProfitProof:false;
};
const round=(x:number)=>Math.round(x*100)/100;
const wilsonLower=(hits:number,n:number)=>{
 if(!n)return null;
 const z=1.959963984540054,zz=z*z,p=hits/n;
 return (p+zz/(2*n)-z*Math.sqrt((p*(1-p)+zz/(4*n))/n))/(1+zz/n);
};
export function auditM15HuntDirection(closed:readonly M15GuideBar[],now:number,maxTests=120):M15HuntProof{
 const zero=():M15HuntProof=>({
  status:'COLLECTING',n:0,modelHits:0,baselineHits:0,
  modelOnly:0,baselineOnly:0,modelPct:null,baselinePct:null,
  pairedWinLower95Pct:null,neutral:0,weakExcluded:0,
  source:'CLOSED_M15_REPLAY',isProfitProof:false
 });
 const result=zero(),rows=closed.filter(b=>
  b&&Number.isFinite(b.time)&&b.time%900000===0&&b.time+900000<=now&&
  [b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.low>0&&
  b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close));
 const limit=Math.max(1,Math.min(120,Math.floor(maxTests)));
 for(let i=Math.max(16,rows.length-limit);i<rows.length;i++){
  const current=rows[i],prior=rows.slice(i-16,i);
  if(prior.length!==16||current.time!==prior[15].time+900000||
   prior.some((b,j)=>j>0&&b.time-prior[j-1].time!==900000))continue;
  const guide=buildM15WatchGuide(prior,current.time);
  const prediction=buildM15HuntPreview(prior,guide,current.time);
  if(!prediction.ready||prediction.observation?.quality==='WEAK'||
      prediction.observation?.conflicting||prediction.referenceOnly){
    result.weakExcluded++;continue;
  }
  if(current.close===current.open){result.neutral++;continue;}
  const prev=prior[15];
  if(prev.close===prev.open){result.weakExcluded++;continue;}
  const actual=current.close>current.open?'BUY':'SELL';
  const baseline=prev.close>prev.open?'BUY':'SELL';
  const model=prediction.preferred===actual,base=baseline===actual;
  result.n++;if(model)result.modelHits++;if(base)result.baselineHits++;
  if(model&&!base)result.modelOnly++;
  if(base&&!model)result.baselineOnly++;
 }
 if(result.n){
  result.modelPct=round(result.modelHits/result.n*100);
  result.baselinePct=round(result.baselineHits/result.n*100);
 }
 const disagreement=result.modelOnly+result.baselineOnly;
 const lower=wilsonLower(result.modelOnly,disagreement);
 result.pairedWinLower95Pct=lower==null?null:round(lower*100);
 if(result.n>=48&&disagreement>=20){
  result.status=lower!=null&&lower>.5?
   'FORWARD_EDGE_CANDIDATE':'NO_DEMONSTRATED_EDGE';
 }
 return result;
}
