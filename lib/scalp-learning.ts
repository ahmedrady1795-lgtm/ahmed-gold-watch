import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type FeatureRow={x:number[];y:number;fwdAtr:number;maeAtr:number;mfeAtr:number};

export type ScalpLearningResult={
  ok:boolean;side:Side;score:number;confidence:number;edge:number;
  sampleCount:number;trainCount:number;testCount:number;
  oosAccuracy:number;oosEdgeAtr:number;preferredHoldBars:number;
  exitPlan:{maxHoldSeconds:number;takeAtr:number;stopAtr:number;exitOnFlip:boolean};
  features:{name:string;weight:number;value:number;contribution:number}[];
  reasons:string[];
};

const names=['ret1','ret3','ret6','accel','bodyPressure','wickBias','rangeCompression','breakoutPos','trendSlope','volatility'];
const clamp=(n:number,a=-100,b=100)=>Math.max(a,Math.min(b,n));
const avg=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const sd=(x:number[])=>{const m=avg(x);return Math.sqrt(avg(x.map(v=>(v-m)*(v-m))))||1;};
const atr=(c:Candle[],n=14)=>{if(c.length<n+1)return NaN;const t:number[]=[];for(let i=c.length-n;i<c.length;i++){const p=c[i-1],x=c[i];t.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));}return avg(t);};

function feat(w:Candle[]){
  if(w.length<16)return null;
  const a=atr(w,14);if(!Number.isFinite(a)||a<=0)return null;
  const l=w.at(-1)!,p1=w.at(-2)!,p3=w.at(-4)!,p6=w.at(-7)!;
  const ret1=(l.close-p1.close)/a,ret3=(l.close-p3.close)/a,ret6=(l.close-p6.close)/a,accel=ret1-ret3/3;
  const last6=w.slice(-6),bodySum=last6.reduce((s,c)=>s+Math.abs(c.close-c.open),0)||1;
  const bodyPressure=last6.reduce((s,c)=>s+(c.close-c.open),0)/bodySum;
  let upper=0,lower=0;for(const c of last6){upper+=Math.max(0,c.high-Math.max(c.open,c.close));lower+=Math.max(0,Math.min(c.open,c.close)-c.low);}
  const wickBias=(lower-upper)/Math.max(1e-9,lower+upper);
  const recent=avg(w.slice(-4).map(c=>c.high-c.low)),prior=avg(w.slice(-12,-4).map(c=>c.high-c.low)),rangeCompression=prior>0?1-recent/prior:0;
  const base=w.slice(-16,-1),hi=Math.max(...base.map(c=>c.high)),lo=Math.min(...base.map(c=>c.low)),span=Math.max(1e-9,hi-lo),breakoutPos=((l.close-lo)/span-.5)*2;
  const trendSlope=(avg(w.slice(-4).map(c=>c.close))-avg(w.slice(-12,-8).map(c=>c.close)))/a;
  const volatility=recent/a;
  return [ret1,ret3,ret6,accel,bodyPressure,wickBias,rangeCompression,breakoutPos,trendSlope,volatility].map(v=>clamp(v,-4,4));
}
function buildRows(c:Candle[],horizon=3){
  const rows:FeatureRow[]=[];
  for(let i=20;i<c.length-horizon;i++){
    const x=feat(c.slice(Math.max(0,i-24),i+1));if(!x)continue;
    const a=atr(c.slice(Math.max(0,i-20),i+1),14);if(!Number.isFinite(a)||a<=0)continue;
    const entry=c[i].close,end=c[i+horizon].close,fwd=(end-entry)/a;
    let mfe=-Infinity,mae=Infinity;
    for(let j=i+1;j<=i+horizon;j++){mfe=Math.max(mfe,(c[j].high-entry)/a);mae=Math.min(mae,(c[j].low-entry)/a);}
    const y=fwd>=.22?1:fwd<=-.22?-1:0;
    rows.push({x,y,fwdAtr:fwd,maeAtr:mae,mfeAtr:mfe});
  }
  return rows;
}
function fit(rows:FeatureRow[]){
  const dims=names.length,means:number[]=[],sds:number[]=[];
  for(let j=0;j<dims;j++){const a=rows.map(r=>r.x[j]);means[j]=avg(a);sds[j]=sd(a);}
  const weights:number[]=[];
  for(let j=0;j<dims;j++){
    const vals=rows.map(r=>(r.x[j]-means[j])/sds[j]);
    const num=rows.reduce((s,r,i)=>s+vals[i]*r.y,0),den=Math.sqrt(rows.reduce((s,r)=>s+r.y*r.y,0)*vals.reduce((s,v)=>s+v*v,0))||1;
    weights[j]=clamp(num/den,-.65,.65);
  }
  return {means,sds,weights};
}
function predict(x:number[],m:ReturnType<typeof fit>){
  let z=0;for(let j=0;j<x.length;j++)z+=((x[j]-m.means[j])/m.sds[j])*m.weights[j];
  const raw=Math.tanh(z/1.8),side:Side=raw>=.12?'BUY':raw<=-.12?'SELL':'WAIT';
  return {raw,side,score:Math.min(90,Math.round(50+Math.abs(raw)*40))};
}
function validate(test:FeatureRow[],m:ReturnType<typeof fit>){
  let correct=0,used=0,edge=0;
  for(const r of test){const p=predict(r.x,m);if(p.side==='WAIT'||r.y===0)continue;used++;const s=p.side==='BUY'?1:-1;if(s===r.y)correct++;edge+=r.fwdAtr*s;}
  return {accuracy:used?100*correct/used:0,edge:used?edge/used:0,used};
}
function bestHorizon(c:Candle[]){
  let best={h:2,edge:-Infinity,take:.45,stop:.32};
  for(const h of [1,2,3,4,5]){
    const rows=buildRows(c,h),nz=rows.filter(r=>r.y!==0);
    if(nz.length<30)continue;
    const directional=avg(nz.map(r=>Math.abs(r.fwdAtr)));
    const adverse=avg(nz.map(r=>Math.min(Math.abs(r.maeAtr),Math.abs(r.mfeAtr))));
    const edge=directional-adverse*.45;
    if(edge>best.edge)best={h,edge,take:Math.max(.32,Math.min(.9,directional*.72)),stop:Math.max(.22,Math.min(.55,Math.max(.22,adverse*.9)))};
  }
  return best;
}

export function trainScalpLearner(input:Candle[],now=Date.now()):ScalpLearningResult{
  const c=input.filter(x=>x.time+60000<=now).slice(-420);
  const empty:ScalpLearningResult={ok:false,side:'WAIT',score:0,confidence:0,edge:0,sampleCount:0,trainCount:0,testCount:0,oosAccuracy:0,oosEdgeAtr:0,preferredHoldBars:0,exitPlan:{maxHoldSeconds:0,takeAtr:0,stopAtr:0,exitOnFlip:true},features:[],reasons:['عينة M1 غير كافية لتدريب السكالب.']};
  if(c.length<140)return empty;
  const rows=buildRows(c,3);if(rows.length<90)return empty;
  const split=Math.floor(rows.length*.78),train=rows.slice(0,split),test=rows.slice(split),model=fit(train),val=validate(test,model);
  const x=feat(c.slice(-25));if(!x)return empty;
  const p=predict(x,model),h=bestHorizon(c);
  const contributions=names.map((name,j)=>({name,weight:Number(model.weights[j].toFixed(3)),value:Number(x[j].toFixed(3)),contribution:Number((((x[j]-model.means[j])/model.sds[j])*model.weights[j]).toFixed(3))})).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
  const evidence=Math.max(0,Math.min(1,(val.accuracy-45)/30)),edgeScore=Math.max(0,Math.min(1,(val.edge+.05)/.45));
  const confidence=Math.min(86,Math.round(p.score*.48+val.accuracy*.27+evidence*100*.12+edgeScore*100*.13));
  const valid=val.used>=12&&val.accuracy>=52&&val.edge>-.03;
  const side:Side=valid?p.side:'WAIT';
  const reasons=[`OOS ${val.accuracy.toFixed(1)}% على ${val.used} إشارات`,`OOS edge ${val.edge.toFixed(2)} ATR`,`أفضل Hold تاريخيًا ${h.h} دقيقة`,...contributions.slice(0,3).map(f=>`${f.name} contribution ${f.contribution}`)];
  return {ok:valid,side,score:p.score,confidence,edge:Number(p.raw.toFixed(3)),sampleCount:rows.length,trainCount:train.length,testCount:test.length,oosAccuracy:Number(val.accuracy.toFixed(1)),oosEdgeAtr:Number(val.edge.toFixed(3)),preferredHoldBars:h.h,exitPlan:{maxHoldSeconds:h.h*60,takeAtr:Number(h.take.toFixed(2)),stopAtr:Number(h.stop.toFixed(2)),exitOnFlip:true},features:contributions.slice(0,6),reasons};
}
