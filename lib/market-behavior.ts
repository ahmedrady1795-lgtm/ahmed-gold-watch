import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';

type Features={
  netAtr:number;
  efficiency:number;
  rangeAtr:number;
  bodyBias:number;
  wickBias:number;
  rangePos:number;
  compression:number;
  lastImpulse:number;
};

type Analog={
  distance:number;
  similarity:number;
  ret3Atr:number;
  ret5Atr:number;
  side3:Side;
  side5:Side;
};

export type BehaviorStudy={
  ok:boolean;
  side:Side;
  score:number;
  confidence:number;
  pattern:string;
  analogCount:number;
  expectedMoveAtr:number;
  horizonMinutes:number;
  votes:{buy:number;sell:number;flat:number};
  m1:any;
  m5:any;
  reasons:string[];
};

const clamp=(n:number,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;

function atr(c:Candle[],n=14){
  const x=c.slice(-(n+1));if(x.length<3)return NaN;
  const tr:number[]=[];
  for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));
  return avg(tr.slice(-n));
}
function features(w:Candle[]):Features|null{
  if(w.length<8)return null;
  const a=atr(w,Math.min(14,w.length-1));if(!Number.isFinite(a)||a<=0)return null;
  const first=w[0],last=w.at(-1)!,net=last.close-first.open;
  const path=w.slice(1).reduce((s,c,i)=>s+Math.abs(c.close-w[i].close),0);
  const hi=Math.max(...w.map(x=>x.high)),lo=Math.min(...w.map(x=>x.low)),span=hi-lo;
  const bodySum=w.reduce((s,c)=>s+Math.abs(c.close-c.open),0);
  const signedBodies=w.reduce((s,c)=>s+(c.close-c.open),0);
  let upper=0,lower=0;
  for(const c of w){upper+=Math.max(0,c.high-Math.max(c.open,c.close));lower+=Math.max(0,Math.min(c.open,c.close)-c.low);}
  const recent=w.slice(-4),prior=w.slice(0,-4);
  const recentRange=avg(recent.map(c=>c.high-c.low)),priorRange=avg(prior.map(c=>c.high-c.low));
  return {
    netAtr:net/a,
    efficiency:path>0?Math.min(1,Math.abs(net)/path):0,
    rangeAtr:span/a,
    bodyBias:bodySum>0?signedBodies/bodySum:0,
    wickBias:(upper+lower)>0?(lower-upper)/(upper+lower):0,
    rangePos:span>0?(last.close-lo)/span:.5,
    compression:priorRange>0?recentRange/priorRange:1,
    lastImpulse:(last.close-last.open)/a
  };
}
function distance(a:Features,b:Features){
  const parts=[
    [a.netAtr-b.netAtr,.9],
    [a.efficiency-b.efficiency,1.2],
    [a.rangeAtr-b.rangeAtr,.45],
    [a.bodyBias-b.bodyBias,1.0],
    [a.wickBias-b.wickBias,.65],
    [a.rangePos-b.rangePos,.9],
    [a.compression-b.compression,.7],
    [a.lastImpulse-b.lastImpulse,.55]
  ] as [number,number][];
  return Math.sqrt(parts.reduce((s,[d,w])=>s+d*d*w,0));
}
function sideOf(v:number):Side{return v>=.28?'BUY':v<=-.28?'SELL':'WAIT';}
function classify(f:Features){
  if(f.compression<=.62&&f.efficiency<.42)return 'COMPRESSION';
  if(f.netAtr>=1.15&&f.efficiency>=.48)return 'IMPULSE_UP';
  if(f.netAtr<=-1.15&&f.efficiency>=.48)return 'IMPULSE_DOWN';
  if(f.bodyBias>=.28&&f.rangePos>=.64)return 'ACCUMULATION_UP';
  if(f.bodyBias<=-.28&&f.rangePos<=.36)return 'DISTRIBUTION_DOWN';
  if(f.wickBias>=.28&&f.rangePos<=.45)return 'LOW_REJECTION';
  if(f.wickBias<=-.28&&f.rangePos>=.55)return 'HIGH_REJECTION';
  return 'TRANSITION';
}
function studyFrame(series:Candle[],ms:number,now:number,window=12){
  const closed=series.filter(c=>c.time+ms<=now);
  if(closed.length<window+30)return null;
  const current=features(closed.slice(-window));if(!current)return null;
  const analogs:Analog[]=[];
  const end=closed.length-window-8;
  for(let i=window;i<end;i++){
    const w=closed.slice(i-window,i),f=features(w);if(!f)continue;
    const d=distance(current,f),similarity=1/(1+d);
    const localAtr=atr(w,Math.min(14,w.length-1));if(!Number.isFinite(localAtr)||localAtr<=0)continue;
    const p=closed[i-1].close,p3=closed[Math.min(i+2,closed.length-1)]?.close,p5=closed[Math.min(i+4,closed.length-1)]?.close;
    if(!Number.isFinite(p3)||!Number.isFinite(p5))continue;
    const r3=(p3-p)/localAtr,r5=(p5-p)/localAtr;
    analogs.push({distance:d,similarity,ret3Atr:r3,ret5Atr:r5,side3:sideOf(r3),side5:sideOf(r5)});
  }
  const best=analogs.sort((a,b)=>a.distance-b.distance).slice(0,14);
  if(best.length<6)return null;
  let buy=0,sell=0,flat=0,weightedMove=0,totalW=0;
  for(const a of best){
    const w=a.similarity*a.similarity;
    const s=a.side5;
    if(s==='BUY')buy+=w;else if(s==='SELL')sell+=w;else flat+=w;
    weightedMove+=a.ret5Atr*w;totalW+=w;
  }
  const total=buy+sell+flat||1,buyPct=buy/total*100,sellPct=sell/total*100,flatPct=flat/total*100;
  const gap=Math.abs(buyPct-sellPct),side:Side=buyPct-sellPct>=12?'BUY':sellPct-buyPct>=12?'SELL':'WAIT';
  const meanSim=avg(best.map(x=>x.similarity)),score=Math.min(90,Math.round(Math.max(buyPct,sellPct)*.70+gap*.20+meanSim*100*.10));
  const conf=Math.min(88,Math.round(score*.72+Math.min(100,best.length/14*100)*.18+meanSim*100*.10));
  return {
    side,score,confidence:conf,pattern:classify(current),analogCount:best.length,
    expectedMoveAtr:totalW?Number((weightedMove/totalW).toFixed(2)):0,
    votes:{buy:Math.round(buyPct),sell:Math.round(sellPct),flat:Math.round(flatPct)},
    similarity:Number(meanSim.toFixed(3)),
    features:current
  };
}

export function studyMarketBehavior(c1:Candle[],c5:Candle[],now=Date.now()):BehaviorStudy{
  const m1=studyFrame(c1,60000,now,12),m5=studyFrame(c5,300000,now,10);
  if(!m1&&!m5)return {ok:false,side:'WAIT',score:0,confidence:0,pattern:'UNKNOWN',analogCount:0,expectedMoveAtr:0,horizonMinutes:0,votes:{buy:0,sell:0,flat:100},m1:null,m5:null,reasons:['لا يوجد تاريخ كافٍ لدراسة سلوك الحركة.']};
  const b1=m1?.votes?.buy||0,s1=m1?.votes?.sell||0,b5=m5?.votes?.buy||0,s5=m5?.votes?.sell||0;
  const buy=b1*.68+b5*.32,sell=s1*.68+s5*.32,gap=Math.abs(buy-sell),side:Side=buy-sell>=10?'BUY':sell-buy>=10?'SELL':'WAIT';
  const score=Math.min(90,Math.round(Math.max(buy,sell)*.72+gap*.20+Math.max(m1?.confidence||0,m5?.confidence||0)*.08));
  const confidence=Math.min(88,Math.round((m1?.confidence||0)*.65+(m5?.confidence||0)*.35));
  const exp=Number((((m1?.expectedMoveAtr||0)*.7)+((m5?.expectedMoveAtr||0)*.3)).toFixed(2));
  const reasons:string[]=[];
  if(m1)reasons.push('M1 pattern '+m1.pattern+' · analogs '+m1.analogCount);
  if(m5)reasons.push('M5 pattern '+m5.pattern+' · analogs '+m5.analogCount);
  if(side!=='WAIT')reasons.push('الحركات التاريخية المشابهة تميل '+side+' بفارق '+Math.round(gap)+' نقطة');
  if(Math.abs(exp)>=.35)reasons.push('متوسط الحركة التالية تاريخيًا '+exp+' ATR');
  return {
    ok:true,side,score,confidence,pattern:m1?.pattern||m5?.pattern||'UNKNOWN',
    analogCount:(m1?.analogCount||0)+(m5?.analogCount||0),expectedMoveAtr:exp,horizonMinutes:5,
    votes:{buy:Math.round(buy),sell:Math.round(sell),flat:Math.max(0,100-Math.round(buy)-Math.round(sell))},
    m1,m5,reasons
  };
}
