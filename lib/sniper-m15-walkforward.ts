/** Past-only M15 walk-forward scoreboard; read-only and never an order.
 * Features are built from bars ending BEFORE each evaluated outcome.
 * "ML qualified" remains false until a separately certified model exists.
 */
import type {M15Bar} from './sniper-m15-scenario';
import {observedM15Bias} from './sniper-m15-bias';
export type M15WalkForward={
 evaluated:number;selected:number;correct:number;coverage:number;
 accuracy:number;baselineAccuracy:number;baselineEvaluated:number;
 wilsonLower:number;firstTestAt:number|null;lastTestAt:number|null;
 qualified:false;status:'INSUFFICIENT'|'SHADOW';sourceBars:number;
};
export function m15WalkForward(raw:readonly M15Bar[],now:number,maxTests=120):M15WalkForward{
 const empty=():M15WalkForward=>({evaluated:0,selected:0,correct:0,
  coverage:0,accuracy:0,baselineAccuracy:0,baselineEvaluated:0,
  wilsonLower:0,firstTestAt:null,lastTestAt:null,qualified:false,
  status:'INSUFFICIENT',sourceBars:0});
 const rows=raw.filter(b=>b&&Number.isFinite(b.time)&&b.time%900000===0&&
   b.time+900000<=now&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
   b.low<=Math.min(b.open,b.close)&&
   [b.open,b.high,b.low,b.close].every(Number.isFinite))
   .sort((a,b)=>a.time-b.time).slice(-6000);
 const out=empty();out.sourceBars=rows.length;
 if(rows.length<70)return out;
 let baselineRight=0,baselineTests=0;
 const start=Math.max(40,rows.length-1-Math.max(30,Math.min(240,maxTests)));
 for(let i=start;i<rows.length-1;i++){
  const prior=rows.slice(i-25,i+1);
  const future=rows[i+1];
  if(prior.length!==26||prior.some((b,j)=>j&&b.time-prior[j-1].time!==900000)||
    future.time-rows[i].time!==900000)continue;
  const tr=prior.slice(1).map((b,j)=>Math.max(
    b.high-b.low,Math.abs(b.high-prior[j].close),Math.abs(b.low-prior[j].close)));
  const atr=tr.slice(-14).reduce((s,v)=>s+v,0)/14;
  if(!(atr>0))continue;
  const delta=future.close-rows[i].close;
  if(Math.abs(delta)<=atr*.09)continue;
  out.evaluated++;
  if(out.firstTestAt==null)out.firstTestAt=future.time;
  out.lastTestAt=future.time;
  const actual=delta>0?'BUY':'SELL';
  const base=rows[i].close-rows[i-6].close;
  if(Math.abs(base)>atr*.22){baselineTests++;if((base>0?'BUY':'SELL')===actual)baselineRight++;}
  const forecast=observedM15Bias(prior);
  if(forecast.side==='WAIT')continue;
  out.selected++;
  if(forecast.side===actual)out.correct++;
 }
 out.coverage=out.evaluated?Number((out.selected/out.evaluated).toFixed(4)):0;
 out.accuracy=out.selected?Number((out.correct/out.selected).toFixed(4)):0;
 out.baselineEvaluated=baselineTests;
 out.baselineAccuracy=baselineTests?Number((baselineRight/baselineTests).toFixed(4)):0;
 const n=out.selected,z=1.96;
 if(n){
  const p=out.correct/n,a=z*z;
  out.wilsonLower=Number(Math.max(0,(p+a/(2*n)-
    z*Math.sqrt((p*(1-p)+a/(4*n))/n))/(1+a/n)).toFixed(4));
 }
 // This test is an observation of historical rules, NOT independent model
 // certification, even if the counts eventually look favourable.
 out.status=out.evaluated>=60&&out.selected>=40?'SHADOW':'INSUFFICIENT';
 return out;
}
