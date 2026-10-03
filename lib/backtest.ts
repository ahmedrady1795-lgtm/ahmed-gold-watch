import {detectRegime,indicators,scoreFrames,type Candle,type Rules,defaults} from './engine';

type Side='buy'|'sell';
export type BacktestTrade={side:Side;entry:number;referenceEntry:number;sl:number;tp:number;openedAt:number;closedAt:number;exit:number;resultR:number;score:number;regime:string};
export type BacktestOptions={tradeFrom?:number;tradeTo?:number;spreadUsd?:number;slippageUsd?:number};
export type BacktestResult={trades:number;wins:number;losses:number;winRate:number;profitFactor:number|null;expectancyR:number;netR:number;maxDrawdownR:number;from:number|null;to:number|null;sampleCandles:number;assumptions:string[];recent:BacktestTrade[]};
export type WalkForwardFold={trainFrom:number;trainTo:number;testFrom:number;testTo:number;selectedRules:{minScore:number;adx:number;spike:number};train:{trades:number;expectancyR:number;maxDrawdownR:number};test:{trades:number;winRate:number;profitFactor:number|null;expectancyR:number;netR:number;maxDrawdownR:number}};
export type WalkForwardResult={folds:WalkForwardFold[];outOfSampleTrades:number;outOfSampleWinRate:number;outOfSampleProfitFactor:number|null;outOfSampleExpectancyR:number;outOfSampleNetR:number;outOfSampleMaxDrawdownR:number;positiveFolds:number;stabilityScore:number;notes:string[]};

function aggregate(candles:Candle[],minutes:number){
  const ms=minutes*60000,out:Candle[]=[];let cur:Candle|null=null,bucket=-1;
  for(const c of candles){const b=Math.floor(c.time/ms)*ms;if(!cur||b!==bucket){if(cur)out.push(cur);bucket=b;cur={time:b,open:c.open,high:c.high,low:c.low,close:c.close};}else{cur.high=Math.max(cur.high,c.high);cur.low=Math.min(cur.low,c.low);cur.close=c.close;}}
  if(cur)out.push(cur);return out;
}
function upperIndex(a:Candle[],time:number){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].time<=time)lo=m+1;else hi=m;}return lo;}
function round(v:number,d=3){const p=10**d;return Math.round(v*p)/p;}
function statsFromTrades(trades:BacktestTrade[]){
  let net=0,peak=0,maxDd=0,grossWin=0,grossLoss=0,wins=0;
  for(const t of trades){net+=t.resultR;peak=Math.max(peak,net);maxDd=Math.max(maxDd,peak-net);if(t.resultR>0){wins++;grossWin+=t.resultR;}else if(t.resultR<0)grossLoss+=Math.abs(t.resultR);}
  return {trades:trades.length,wins,losses:trades.length-wins,winRate:trades.length?round(100*wins/trades.length,1):0,profitFactor:grossLoss?round(grossWin/grossLoss,2):null,expectancyR:trades.length?round(net/trades.length,3):0,netR:round(net,2),maxDrawdownR:round(maxDd,2)};
}

export function runBacktest(input:Candle[],r:Rules=defaults,options:BacktestOptions={}):BacktestResult{
  const c5=[...input].sort((a,b)=>a.time-b.time),c15=aggregate(c5,15),h1=aggregate(c5,60),trades:BacktestTrade[]=[];
  const spread=Math.max(0,Number(options.spreadUsd||0)),slippage=Math.max(0,Number(options.slippageUsd||0));
  let i=0;
  while(i<c5.length-2){
    const t=c5[i].time,i15=upperIndex(c15,t)-1,i60=upperIndex(h1,t)-1;
    if(i<260||i15<220||i60<220){i++;continue;}
    const w5=c5.slice(Math.max(0,i-279),i+1),w15=c15.slice(Math.max(0,i15-239),i15+1),w60=h1.slice(Math.max(0,i60-239),i60+1);
    const i5=indicators(w5),i15set=indicators(w15),i60set=indicators(w60);if(![i5.atr,i5.adx,i15set.adx,i60set.adx].every(Number.isFinite)){i++;continue;}
    const last5=w5.at(-1)!,last15=w15.at(-1)!,last60=w60.at(-1)!,past=w5.slice(-21,-1);if(past.length<20){i++;continue;}
    const hi=Math.max(...past.map(x=>x.high)),lo=Math.min(...past.map(x=>x.low)),longBreak=last5.close>hi,shortBreak=last5.close<lo;
    const frames={m1:i5,m5:i5,m15:i15set,h1:i60set},last={m1:last5.close,m5:last5.close,m15:last15.close,h1:last60.close};
    const long=scoreFrames('long',frames,last,longBreak),short=scoreFrames('short',frames,last,shortBreak),side:Side=long>=short?'buy':'sell',best=Math.max(long,short),gap=Math.abs(long-short),regime=detectRegime(frames,last5.close,longBreak,shortBreak);
    const threshold=r.minScore+(regime.key==='range'?6:regime.key==='high_vol'?4:0),sideOk=side==='buy'?regime.key!=='trend_down':regime.key!=='trend_up',breakOk=regime.key!=='range'||(side==='buy'?longBreak:shortBreak);
    if(regime.key==='shock'||i5.adx<r.adx||i5.volatility>r.spike||best<threshold||gap<12||!sideOk||!breakOk){i++;continue;}
    const next=c5[i+1];
    if(options.tradeFrom&&next.time<options.tradeFrom){i++;continue;}
    if(options.tradeTo&&next.time>options.tradeTo)break;
    const referenceEntry=next.open,recent=w5.slice(-12),swing=side==='buy'?Math.min(...recent.map(x=>x.low)):Math.max(...recent.map(x=>x.high)),raw=side==='buy'?Math.min(swing,referenceEntry-1.2*i5.atr):Math.max(swing,referenceEntry+1.2*i5.atr),cap=side==='buy'?referenceEntry-2.2*i5.atr:referenceEntry+2.2*i5.atr,sl=side==='buy'?Math.max(raw,cap):Math.min(raw,cap),referenceRisk=Math.abs(referenceEntry-sl);
    if(!(referenceRisk>0&&referenceRisk<=2.25*i5.atr)){i++;continue;}
    const tp=referenceEntry+(side==='buy'?1:-1)*1.8*referenceRisk,adverse=spread/2+slippage,entry=referenceEntry+(side==='buy'?1:-1)*adverse,actualRisk=Math.abs(entry-sl);
    if(actualRisk<=0){i++;continue;}
    const maxJ=Math.min(c5.length-1,i+1+96);let exit=entry,resultR=0,closedAt=next.time,j=i+1;
    for(;j<=maxJ;j++){
      const c=c5[j],stop=side==='buy'?c.low<=sl:c.high>=sl,target=side==='buy'?c.high>=tp:c.low<=tp;
      if(stop){exit=sl;resultR=-1;closedAt=c.time;break;}
      if(target){exit=tp;resultR=(side==='buy'?(tp-entry):(entry-tp))/actualRisk;closedAt=c.time;break;}
      if(j===maxJ){exit=c.close;resultR=(side==='buy'?(exit-entry):(entry-exit))/actualRisk;closedAt=c.time;}
    }
    resultR=Math.max(-1,Math.min(2,resultR));trades.push({side,entry:round(entry),referenceEntry:round(referenceEntry),sl:round(sl),tp:round(tp),openedAt:next.time,closedAt,exit:round(exit),resultR:round(resultR),score:best,regime:regime.label});i=Math.max(i+1,j);
  }
  const st=statsFromTrades(trades);
  return {...st,from:trades[0]?.openedAt??null,to:trades.at(-1)?.closedAt??null,sampleCandles:c5.length,assumptions:[
    'اختبار تقني على M5 مع إعادة بناء M15/H1؛ M5 يبقى بديلاً لتوقيت M1 في التاريخ العميق.',
    `تكلفة تنفيذ افتراضية: spread=${round(spread,3)} USD + slippage=${round(slippage,3)} USD لكل دخول.`,
    'الأخبار التاريخية غير مطبقة بعد؛ نتائج فترات الأخبار يجب تفسيرها بحذر.',
    'إذا لمس SL وTP داخل نفس شمعة، يُحسب SL أولاً بشكل محافظ.'
  ],recent:trades.slice(-12).reverse()};
}

function candidateRules(base:Rules):Rules[]{
  const raw=[base,{...base,minScore:Math.min(90,base.minScore+4)},{...base,adx:Math.min(30,base.adx+2)}],seen=new Set<string>();
  return raw.filter(x=>{const k=x.minScore+':'+x.adx+':'+x.spike;if(seen.has(k))return false;seen.add(k);return true;});
}
function fitness(r:BacktestResult){if(r.trades<5)return -999;return r.expectancyR*Math.sqrt(r.trades)-0.06*r.maxDrawdownR;}

export function runWalkForward(input:Candle[],base:Rules=defaults,options:BacktestOptions={}):WalkForwardResult{
  const c=[...input].sort((a,b)=>a.time-b.time),trainBars=Math.min(5000,Math.max(3200,Math.floor(c.length*.28))),testBars=Math.min(1500,Math.max(900,Math.floor(c.length*.08))),folds:WalkForwardFold[]=[];
  if(c.length<trainBars+testBars+500)return {folds:[],outOfSampleTrades:0,outOfSampleWinRate:0,outOfSampleProfitFactor:null,outOfSampleExpectancyR:0,outOfSampleNetR:0,outOfSampleMaxDrawdownR:0,positiveFolds:0,stabilityScore:0,notes:['العينة التاريخية غير كافية لـWalk-Forward موثوق.']};
  const firstTest=Math.max(trainBars,c.length-(trainBars+3*testBars));
  for(let testStart=firstTest;testStart+testBars<=c.length&&folds.length<3;testStart+=testBars){
    const trainStart=Math.max(0,testStart-trainBars),trainEnd=testStart-1,testEnd=testStart+testBars-1,train=c.slice(trainStart,testStart),historyStart=Math.max(0,testStart-2200),withHistory=c.slice(historyStart,testEnd+1),testFrom=c[testStart].time,testTo=c[testEnd].time;
    let best=base,bestResult=runBacktest(train,base,options),bestFit=fitness(bestResult);
    for(const candidate of candidateRules(base)){const r=runBacktest(train,candidate,options),f=fitness(r);if(f>bestFit){best=candidate;bestResult=r;bestFit=f;}}
    const test=runBacktest(withHistory,best,{...options,tradeFrom:testFrom,tradeTo:testTo});
    folds.push({trainFrom:c[trainStart].time,trainTo:c[trainEnd].time,testFrom,testTo,selectedRules:{minScore:best.minScore,adx:best.adx,spike:best.spike},train:{trades:bestResult.trades,expectancyR:bestResult.expectancyR,maxDrawdownR:bestResult.maxDrawdownR},test:{trades:test.trades,winRate:test.winRate,profitFactor:test.profitFactor,expectancyR:test.expectancyR,netR:test.netR,maxDrawdownR:test.maxDrawdownR}});
  }
  const synthetic:BacktestTrade[]=[];
  const trades=folds.reduce((s,f)=>s+f.test.trades,0),net=folds.reduce((s,f)=>s+f.test.netR,0),winsApprox=folds.reduce((s,f)=>s+f.test.trades*f.test.winRate/100,0),positive=folds.filter(f=>f.test.netR>0&&f.test.expectancyR>0).length;
  let grossWin=0,grossLoss=0;for(const f of folds){if(f.test.profitFactor!=null&&f.test.trades){const avg=f.test.expectancyR;const wr=f.test.winRate/100;const lossRate=1-wr;if(lossRate>0&&wr>0){const avgLoss=Math.max(.01,(wr*1.2-avg)/lossRate);grossLoss+=avgLoss*lossRate*f.test.trades;grossWin+=f.test.profitFactor*avgLoss*lossRate*f.test.trades;}}}
  const maxDd=Math.max(0,...folds.map(f=>f.test.maxDrawdownR)),expectancy=trades?net/trades:0,stability=Math.max(0,Math.min(100,Math.round((folds.length?positive/folds.length:0)*60+Math.max(0,Math.min(1,expectancy/.25))*25+Math.max(0,1-Math.min(1,maxDd/10))*15)));
  void synthetic;
  return {folds,outOfSampleTrades:trades,outOfSampleWinRate:trades?round(100*winsApprox/trades,1):0,outOfSampleProfitFactor:grossLoss?round(grossWin/grossLoss,2):null,outOfSampleExpectancyR:round(expectancy,3),outOfSampleNetR:round(net,2),outOfSampleMaxDrawdownR:round(maxDd,2),positiveFolds:positive,stabilityScore:stability,notes:['Walk-Forward يختار إعدادات minScore/ADX على نافذة تدريب سابقة ثم يقيسها على نافذة تالية لم تدخل في الاختيار.','Stability Score مقياس داخلي لاستقرار الاختبار وليس احتمال نجاح صفقة مستقبلية.','النتائج ما زالت لا تتضمن إعادة بناء الأخبار التاريخية لحظة بلحظة.']};
}
