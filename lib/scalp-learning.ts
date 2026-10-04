import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type FeatureRow={x:number[];fwdAtr:number;maeAtr:number;mfeAtr:number};
type Model={means:number[];sds:number[];weights:number[]};
type Metrics={used:number;accuracy:number;grossEdgeAtr:number;netEdgeAtr:number;profitFactor:number;maxDrawdownAtr:number;wins:number;losses:number};

export type ScalpLearningResult={
  ok:boolean;side:Side;score:number;confidence:number;edge:number;
  sampleCount:number;trainCount:number;validationCount:number;testCount:number;
  oosAccuracy:number;oosEdgeAtr:number;oosGrossEdgeAtr:number;profitFactor:number;maxDrawdownAtr:number;costAtr:number;
  preferredHoldBars:number;
  exitPlan:{maxHoldSeconds:number;takeAtr:number;stopAtr:number;exitOnFlip:boolean};
  features:{name:string;weight:number;value:number;contribution:number}[];
  gate:{passed:boolean;reasons:string[]};
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

function buildRows(c:Candle[],horizon:number){
  const rows:FeatureRow[]=[];
  for(let i=24;i<c.length-horizon;i++){
    const x=feat(c.slice(Math.max(0,i-24),i+1));if(!x)continue;
    const a=atr(c.slice(Math.max(0,i-20),i+1),14);if(!Number.isFinite(a)||a<=0)continue;
    const entry=c[i].close,end=c[i+horizon].close,fwd=(end-entry)/a;
    let high=-Infinity,low=Infinity;
    for(let j=i+1;j<=i+horizon;j++){high=Math.max(high,c[j].high);low=Math.min(low,c[j].low);}
    rows.push({x,fwdAtr:fwd,maeAtr:(low-entry)/a,mfeAtr:(high-entry)/a});
  }
  return rows;
}

function target(r:FeatureRow){return r.fwdAtr>=.24?1:r.fwdAtr<=-.24?-1:0;}

function fit(rows:FeatureRow[]):Model{
  const dims=names.length,means:number[]=[],sds:number[]=[];
  for(let j=0;j<dims;j++){const a=rows.map(r=>r.x[j]);means[j]=avg(a);sds[j]=sd(a);}
  const weights:number[]=[];
  for(let j=0;j<dims;j++){
    const vals=rows.map(r=>(r.x[j]-means[j])/sds[j]);
    const ys=rows.map(target),num=ys.reduce((s,y,i)=>s+vals[i]*y,0),den=Math.sqrt(ys.reduce((s,y)=>s+y*y,0)*vals.reduce((s,v)=>s+v*v,0))||1;
    weights[j]=clamp(num/den,-.55,.55);
  }
  return {means,sds,weights};
}

function predict(x:number[],m:Model){
  let z=0;for(let j=0;j<x.length;j++)z+=((x[j]-m.means[j])/m.sds[j])*m.weights[j];
  const raw=Math.tanh(z/1.9),side:Side=raw>=.20?'BUY':raw<=-.20?'SELL':'WAIT';
  return {raw,side,score:Math.min(88,Math.round(48+Math.abs(raw)*40))};
}

function evaluate(rows:FeatureRow[],m:Model,costAtr:number):Metrics{
  const returns:number[]=[];let wins=0,losses=0,gross=0;
  for(const r of rows){
    const p=predict(r.x,m);if(p.side==='WAIT')continue;
    const dir=p.side==='BUY'?1:-1,g=dir*r.fwdAtr,net=g-costAtr;
    gross+=g;returns.push(net);if(net>0)wins++;else losses++;
  }
  let equity=0,peak=0,maxDD=0,pos=0,neg=0;
  for(const r of returns){equity+=r;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);if(r>0)pos+=r;else neg+=Math.abs(r);}
  const used=returns.length;
  return {
    used,wins,losses,accuracy:used?wins/used*100:0,
    grossEdgeAtr:used?gross/used:0,
    netEdgeAtr:used?returns.reduce((a,b)=>a+b,0)/used:0,
    profitFactor:neg>0?pos/neg:(pos>0?9.99:0),
    maxDrawdownAtr:maxDD
  };
}

function splitRows(rows:FeatureRow[]){
  const n=rows.length,a=Math.floor(n*.55),b=Math.floor(n*.78);
  return {train:rows.slice(0,a),validation:rows.slice(a,b),test:rows.slice(b)};
}

function planFrom(rows:FeatureRow[],h:number){
  const abs=rows.map(r=>Math.abs(r.fwdAtr)).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=(p:number)=>abs.length?abs[Math.min(abs.length-1,Math.floor((abs.length-1)*p))]:.4;
  const take=Math.max(.34,Math.min(.85,q(.58)*.78));
  const stop=Math.max(.24,Math.min(.52,q(.38)*.72));
  return {maxHoldSeconds:h*60,takeAtr:Number(take.toFixed(2)),stopAtr:Number(stop.toFixed(2)),exitOnFlip:true};
}

export function trainScalpLearner(input:Candle[],now=Date.now(),estimatedCostAtr=.10):ScalpLearningResult{
  const c=input.filter(x=>x.time+60000<=now).slice(-520),costAtr=Math.max(.04,Math.min(.28,Number(estimatedCostAtr)||.10));
  const empty:ScalpLearningResult={ok:false,side:'WAIT',score:0,confidence:0,edge:0,sampleCount:0,trainCount:0,validationCount:0,testCount:0,oosAccuracy:0,oosEdgeAtr:0,oosGrossEdgeAtr:0,profitFactor:0,maxDrawdownAtr:0,costAtr,preferredHoldBars:0,exitPlan:{maxHoldSeconds:0,takeAtr:0,stopAtr:0,exitOnFlip:true},features:[],gate:{passed:false,reasons:['عينة M1 غير كافية.']},reasons:['عينة M1 غير كافية لتقييم Edge حقيقي.']};
  if(c.length<180)return empty;

  let chosen:{h:number;rows:FeatureRow[];train:FeatureRow[];validation:FeatureRow[];test:FeatureRow[];model:Model;vm:Metrics;rank:number}|null=null;
  for(const h of [1,2,3,4,5]){
    const rows=buildRows(c,h);if(rows.length<130)continue;
    const {train,validation,test}=splitRows(rows);if(train.length<70||validation.length<24||test.length<24)continue;
    const model=fit(train),vm=evaluate(validation,model,costAtr);
    if(vm.used<12)continue;
    const rank=vm.netEdgeAtr*1.8+Math.min(2,vm.profitFactor)*.12-vm.maxDrawdownAtr*.025;
    if(!chosen||rank>chosen.rank)chosen={h,rows,train,validation,test,model,vm,rank};
  }
  if(!chosen)return empty;

  const refit=fit([...chosen.train,...chosen.validation]),tm=evaluate(chosen.test,refit,costAtr);
  const x=feat(c.slice(-25));if(!x)return empty;
  const p=predict(x,refit),exitPlan=planFrom([...chosen.train,...chosen.validation],chosen.h);
  const contributions=names.map((name,j)=>({name,weight:Number(refit.weights[j].toFixed(3)),value:Number(x[j].toFixed(3)),contribution:Number((((x[j]-refit.means[j])/refit.sds[j])*refit.weights[j]).toFixed(3))})).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));

  const gateReasons:string[]=[];
  if(chosen.vm.netEdgeAtr<.035)gateReasons.push('Validation expectancy ضعيف بعد التكلفة');
  if(chosen.vm.profitFactor<1.08)gateReasons.push('Validation profit factor غير كافٍ');
  if(tm.used<20)gateReasons.push('عدد صفقات Final Holdout أقل من 20');
  if(tm.accuracy<56)gateReasons.push('Final Holdout accuracy أقل من 56%');
  if(tm.netEdgeAtr<.06)gateReasons.push('Final Holdout expectancy أقل من +0.06 ATR بعد التكلفة');
  if(tm.profitFactor<1.20)gateReasons.push('Final Holdout profit factor أقل من 1.20');
  if(tm.maxDrawdownAtr>2.6)gateReasons.push('Final Holdout drawdown مرتفع');
  if(p.side==='WAIT')gateReasons.push('الإشارة الحالية نفسها ضعيفة');
  const valid=gateReasons.length===0;

  const edgeQuality=Math.max(0,Math.min(1,tm.netEdgeAtr/.22)),pfQuality=Math.max(0,Math.min(1,(tm.profitFactor-1)/.8)),accQuality=Math.max(0,Math.min(1,(tm.accuracy-50)/25));
  const confidence=Math.min(84,Math.round(p.score*.42+edgeQuality*100*.24+pfQuality*100*.18+accQuality*100*.16));
  const side:Side=valid?p.side:'WAIT';
  const reasons=[
    `FINAL HOLDOUT: ${tm.accuracy.toFixed(1)}% على ${tm.used} صفقة`,
    `Net expectancy ${tm.netEdgeAtr.toFixed(3)} ATR بعد تكلفة ${costAtr.toFixed(2)} ATR`,
    `Profit factor ${tm.profitFactor.toFixed(2)} · Max DD ${tm.maxDrawdownAtr.toFixed(2)} ATR`,
    `Validation expectancy ${chosen.vm.netEdgeAtr.toFixed(3)} ATR`,
    `أفضل Hold من Validation: ${chosen.h} دقيقة`,
    ...contributions.slice(0,2).map(f=>`${f.name} contribution ${f.contribution}`)
  ];

  return {
    ok:valid,side,score:p.score,confidence,edge:Number(p.raw.toFixed(3)),
    sampleCount:chosen.rows.length,trainCount:chosen.train.length,validationCount:chosen.validation.length,testCount:chosen.test.length,
    oosAccuracy:Number(tm.accuracy.toFixed(1)),oosEdgeAtr:Number(tm.netEdgeAtr.toFixed(3)),oosGrossEdgeAtr:Number(tm.grossEdgeAtr.toFixed(3)),
    profitFactor:Number(tm.profitFactor.toFixed(2)),maxDrawdownAtr:Number(tm.maxDrawdownAtr.toFixed(2)),costAtr:Number(costAtr.toFixed(3)),
    preferredHoldBars:chosen.h,exitPlan,features:contributions.slice(0,6),gate:{passed:valid,reasons:gateReasons},reasons
  };
}
