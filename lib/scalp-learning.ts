import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type FeatureRow={entryAt:number;exitAt:number;x:number[];fwdAtr:number;maeAtr:number;mfeAtr:number};
type Model={means:number[];sds:number[];weights:number[];threshold:number};
type Metrics={used:number;accuracy:number;grossEdgeAtr:number;netEdgeAtr:number;profitFactor:number;maxDrawdownAtr:number;wins:number;losses:number;signalRate:number};

export type ScalpLearningResult={
  evaluationVersion:'cost-aware-v2';ok:boolean;side:Side;score:number;confidence:number;edge:number;
  sampleCount:number;trainCount:number;validationCount:number;testCount:number;
  oosAccuracy:number;oosEdgeAtr:number;oosGrossEdgeAtr:number;profitFactor:number;maxDrawdownAtr:number;costAtr:number;
  preferredHoldBars:number;entryThreshold:number;validationSignalRate:number;testSignalRate:number;
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
    rows.push({entryAt:c[i].time+60000,exitAt:c[i+horizon].time+60000,x,fwdAtr:fwd,maeAtr:(low-entry)/a,mfeAtr:(high-entry)/a});
  }
  return rows;
}

function directionalTarget(r:FeatureRow,minMove:number){return r.fwdAtr>=minMove?1:r.fwdAtr<=-minMove?-1:0;}

function corrWeight(rows:FeatureRow[],j:number,minMove:number){
  if(rows.length<16)return 0;
  const vals=rows.map(r=>r.x[j]),m=avg(vals),s=sd(vals),ys=rows.map(r=>directionalTarget(r,minMove));
  const z=vals.map(v=>(v-m)/s),num=ys.reduce<number>((sum,y,i)=>sum+z[i]*y,0);
  const den=Math.sqrt(ys.reduce<number>((sum,y)=>sum+y*y,0)*z.reduce<number>((sum,v)=>sum+v*v,0))||1;
  return clamp(num/den,-.55,.55);
}

function fit(rows:FeatureRow[],minMove:number):Model{
  const dims=names.length,means:number[]=[],sds:number[]=[],weights:number[]=[];
  for(let j=0;j<dims;j++){const a=rows.map(r=>r.x[j]);means[j]=avg(a);sds[j]=sd(a);}
  const cut=Math.floor(rows.length*.5),left=rows.slice(0,cut),right=rows.slice(cut);
  for(let j=0;j<dims;j++){
    const full=corrWeight(rows,j,minMove),a=corrWeight(left,j,minMove),b=corrWeight(right,j,minMove);
    let stability=1;
    if(a*b<0)stability=.22;
    else{
      const gap=Math.abs(a-b);
      if(gap>.40)stability=.45;
      else if(gap>.25)stability=.68;
      else if(Math.min(Math.abs(a),Math.abs(b))<.035)stability=.78;
    }
    weights[j]=clamp(full*stability*.90,-.48,.48);
  }
  return {means,sds,weights,threshold:.26};
}

function predict(x:number[],m:Model){
  let z=0;for(let j=0;j<x.length;j++)z+=((x[j]-m.means[j])/m.sds[j])*m.weights[j];
  const raw=Math.tanh(z/1.9),side:Side=raw>=m.threshold?'BUY':raw<=-m.threshold?'SELL':'WAIT';
  const score=Math.min(90,Math.round(46+Math.abs(raw)*44));
  return {raw,side,score};
}

function evaluate(rows:FeatureRow[],m:Model,costAtr:number):Metrics{
  const returns:number[]=[];let wins=0,losses=0,gross=0,nextEntryAt=-Infinity;
  for(const r of rows){
    if(r.entryAt<nextEntryAt)continue;
    const p=predict(r.x,m);if(p.side==='WAIT')continue;
    nextEntryAt=r.exitAt;
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
    maxDrawdownAtr:maxDD,
    signalRate:rows.length?used/rows.length*100:0
  };
}

function splitRows(rows:FeatureRow[],horizon:number){
  const n=rows.length,a=Math.floor(n*.55),b=Math.floor(n*.78),purge=Math.max(2,horizon+1);
  return {
    train:rows.slice(0,Math.max(0,a-purge)),
    validation:rows.slice(Math.min(n,a+purge),Math.max(a+purge,b-purge)),
    test:rows.slice(Math.min(n,b+purge))
  };
}

function tuneThreshold(validation:FeatureRow[],model:Model,costAtr:number){
  const candidates=[.20,.24,.28,.32,.36,.40,.45,.50,.56];
  let best:{threshold:number;metrics:Metrics;rank:number;stability:number}|null=null;
  const mid=Math.floor(validation.length*.5),v1=validation.slice(0,mid),v2=validation.slice(mid);
  for(const threshold of candidates){
    const m={...model,threshold},metrics=evaluate(validation,m,costAtr),a=evaluate(v1,m,costAtr),b=evaluate(v2,m,costAtr);
    const minimumUsed=Math.max(12,Math.ceil(validation.length*.12));
    if(metrics.used<minimumUsed||a.used<5||b.used<5)continue;
    const worstEdge=Math.min(a.netEdgeAtr,b.netEdgeAtr),stability=Math.max(0,1-Math.abs(a.netEdgeAtr-b.netEdgeAtr)/Math.max(.20,Math.abs(metrics.netEdgeAtr)+.20));
    const rank=
      metrics.netEdgeAtr*1.75+
      worstEdge*1.10+
      Math.min(2.5,metrics.profitFactor)*.10+
      Math.max(-.12,Math.min(.12,(metrics.accuracy-50)/100))-
      metrics.maxDrawdownAtr*.035+
      Math.min(.08,metrics.signalRate/100*.16)+
      stability*.05;
    if(!best||rank>best.rank)best={threshold,metrics,rank,stability};
  }
  if(best)return best;
  const fallback={...model,threshold:.32},metrics=evaluate(validation,fallback,costAtr);
  return {threshold:.32,metrics,rank:-99,stability:0};
}

function planFrom(rows:FeatureRow[],h:number,costAtr:number,side:Side){
  const favorable=rows.map(r=>Math.max(0,side==='SELL'?-r.maeAtr:r.mfeAtr)).filter(Number.isFinite).sort((a,b)=>a-b);
  const adverse=rows.map(r=>Math.max(0,side==='SELL'?r.mfeAtr:-r.maeAtr)).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=(arr:number[],p:number,fallback:number)=>arr.length?arr[Math.min(arr.length-1,Math.floor((arr.length-1)*p))]:fallback;
  const take=Math.max(costAtr*2.4,.34,Math.min(.90,q(favorable,.58,.5)*.72));
  const stop=Math.max(costAtr*1.8,.22,Math.min(.48,q(adverse,.62,.35)*.90));
  return {maxHoldSeconds:h*60,takeAtr:Number(take.toFixed(2)),stopAtr:Number(stop.toFixed(2)),exitOnFlip:true};
}

export function trainScalpLearner(input:Candle[],now=Date.now(),estimatedCostAtr=.10):ScalpLearningResult{
  // Never make expensive markets look profitable by capping their cost.
  const costKnown=Number.isFinite(estimatedCostAtr)&&estimatedCostAtr>=0;
  const costAtr=costKnown?Math.max(.04,estimatedCostAtr):0;
  const c=input.filter(x=>x.time+60000<=now).slice(-760);
  const empty:ScalpLearningResult={evaluationVersion:'cost-aware-v2',ok:false,side:'WAIT',score:0,confidence:0,edge:0,sampleCount:0,trainCount:0,validationCount:0,testCount:0,oosAccuracy:0,oosEdgeAtr:0,oosGrossEdgeAtr:0,profitFactor:0,maxDrawdownAtr:0,costAtr,preferredHoldBars:0,entryThreshold:0,validationSignalRate:0,testSignalRate:0,exitPlan:{maxHoldSeconds:0,takeAtr:0,stopAtr:0,exitOnFlip:true},features:[],gate:{passed:false,reasons:['عينة M1 غير كافية.']},reasons:['عينة M1 غير كافية لتقييم Edge حقيقي.']};
  const reject=(reason:string):ScalpLearningResult=>({...empty,gate:{passed:false,reasons:[reason]},reasons:[reason]});
  if(!costKnown)return reject('تكلفة التداول غير معروفة؛ التعلم لا يسمح بإشارة.');
  if(!Number.isFinite(now)||input.some(x=>!Number.isFinite(x.time)||x.time>now))
    return reject('توقيت الشموع غير صالح أو في المستقبل.');
  if(c.some((x,i)=>![x.open,x.high,x.low,x.close].every(v=>Number.isFinite(v)&&v>0)||
    x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close)||
    (i>0&&x.time-c[i-1].time!==60000)))
    return reject('شموع M1 غير صالحة أو متقطعة؛ أُوقف التعلم حتى اكتمال البيانات.');
  if(c.length&&now-(c.at(-1)!.time+60000)>90000)
    return reject('آخر شمعة مكتملة قديمة؛ الإشارة متوقفة.');
  if(c.length<220)return empty;

  const minMove=Math.max(.20,Math.min(.34,.12+costAtr*1.6));
  let chosen:{h:number;rows:FeatureRow[];train:FeatureRow[];validation:FeatureRow[];test:FeatureRow[];model:Model;vm:Metrics;rank:number;stability:number}|null=null;
  for(const h of [1,2,3,4,5]){
    const rows=buildRows(c,h);if(rows.length<180)continue;
    const {train,validation,test}=splitRows(rows,h);if(train.length<90||validation.length<36||test.length<36)continue;
    const base=fit(train,minMove),tuned=tuneThreshold(validation,base,costAtr),model={...base,threshold:tuned.threshold},vm=tuned.metrics;
    if(vm.used<12)continue;
    const rank=tuned.rank+Math.min(.06,vm.used/Math.max(1,validation.length)*.08);
    if(!chosen||rank>chosen.rank)chosen={h,rows,train,validation,test,model,vm,rank,stability:tuned.stability};
  }
  if(!chosen)return empty;

  const refitBase=fit([...chosen.train,...chosen.validation],minMove),refit={...refitBase,threshold:chosen.model.threshold};
  const tm=evaluate(chosen.test,refit,costAtr);
  const x=feat(c.slice(-25));if(!x)return empty;
  const p=predict(x,refit),exitPlan=planFrom([...chosen.train,...chosen.validation],chosen.h,costAtr,p.side);
  const contributions=names.map((name,j)=>({name,weight:Number(refit.weights[j].toFixed(3)),value:Number(x[j].toFixed(3)),contribution:Number((((x[j]-refit.means[j])/refit.sds[j])*refit.weights[j]).toFixed(3))})).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));

  const gateReasons:string[]=[];
  if(chosen.vm.netEdgeAtr<.04)gateReasons.push('Validation expectancy ضعيف بعد التكلفة');
  if(chosen.vm.profitFactor<1.10)gateReasons.push('Validation profit factor غير كافٍ');
  if(chosen.stability<.30)gateReasons.push('Validation غير مستقر بين النصفين');
  if(tm.used<20)gateReasons.push('عدد صفقات Final Holdout أقل من 20');
  if(tm.accuracy<56)gateReasons.push('Final Holdout accuracy أقل من 56%');
  if(tm.netEdgeAtr<.06)gateReasons.push('Final Holdout expectancy أقل من +0.06 ATR بعد التكلفة');
  if(tm.profitFactor<1.20)gateReasons.push('Final Holdout profit factor أقل من 1.20');
  if(tm.maxDrawdownAtr>2.8)gateReasons.push('Final Holdout drawdown مرتفع');
  if(tm.signalRate>72)gateReasons.push('النموذج يطلق إشارات أكثر من اللازم');
  if(p.side==='WAIT')gateReasons.push('الإشارة الحالية نفسها دون العتبة المتعلمة');
  const valid=gateReasons.length===0;

  const edgeQuality=Math.max(0,Math.min(1,tm.netEdgeAtr/.22)),pfQuality=Math.max(0,Math.min(1,(tm.profitFactor-1)/.8)),accQuality=Math.max(0,Math.min(1,(tm.accuracy-50)/25));
  const stabilityQuality=Math.max(0,Math.min(1,chosen.stability));
  const confidence=Math.min(86,Math.round(p.score*.36+edgeQuality*100*.24+pfQuality*100*.16+accQuality*100*.14+stabilityQuality*100*.10));
  const side:Side=valid?p.side:'WAIT';
  const reasons=[
    `FINAL HOLDOUT: ${tm.accuracy.toFixed(1)}% على ${tm.used} عينة اتجاه غير متداخلة · signal rate ${tm.signalRate.toFixed(0)}%`,
    'تقييم اتجاه عند نهاية الأفق؛ ليس اختبار تنفيذ أو إثبات ربح للهدف والوقف.',
    `Net expectancy ${tm.netEdgeAtr.toFixed(3)} ATR بعد تكلفة ${costAtr.toFixed(2)} ATR`,
    `Profit factor ${tm.profitFactor.toFixed(2)} · Max DD ${tm.maxDrawdownAtr.toFixed(2)} ATR`,
    `Validation expectancy ${chosen.vm.netEdgeAtr.toFixed(3)} ATR · stability ${Math.round(chosen.stability*100)}%`,
    `عتبة الدخول المتعلمة ${chosen.model.threshold.toFixed(2)} · أفضل Hold ${chosen.h} دقيقة`,
    ...contributions.slice(0,2).map(f=>`${f.name} contribution ${f.contribution}`)
  ];

  return {
    evaluationVersion:'cost-aware-v2',ok:valid,side,score:p.score,confidence,edge:Number(p.raw.toFixed(3)),
    sampleCount:chosen.rows.length,trainCount:chosen.train.length,validationCount:chosen.validation.length,testCount:chosen.test.length,
    oosAccuracy:Number(tm.accuracy.toFixed(1)),oosEdgeAtr:Number(tm.netEdgeAtr.toFixed(3)),oosGrossEdgeAtr:Number(tm.grossEdgeAtr.toFixed(3)),
    profitFactor:Number(tm.profitFactor.toFixed(2)),maxDrawdownAtr:Number(tm.maxDrawdownAtr.toFixed(2)),costAtr:Number(costAtr.toFixed(3)),
    preferredHoldBars:chosen.h,entryThreshold:Number(chosen.model.threshold.toFixed(2)),validationSignalRate:Number(chosen.vm.signalRate.toFixed(1)),testSignalRate:Number(tm.signalRate.toFixed(1)),
    exitPlan,features:contributions.slice(0,6),gate:{passed:valid,reasons:gateReasons},reasons
  };
}
