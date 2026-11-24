import {detectRegime,indicators,scoreFrames,type Candle,type Rules,defaults} from './engine';

type Side='buy'|'sell';
export type BacktestTrade={side:Side;entry:number;referenceEntry:number;sl:number;tp:number;openedAt:number;closedAt:number;exit:number;resultR:number;score:number;regime:string};
export type BacktestOptions={tradeFrom?:number;tradeTo?:number;spreadUsd?:number;slippageUsd?:number};
export type BacktestResult={trades:number;wins:number;losses:number;winRate:number;profitFactor:number|null;expectancyR:number;netR:number;maxDrawdownR:number;from:number|null;to:number|null;sampleCandles:number;assumptions:string[];recent:BacktestTrade[]};
export type WalkForwardFold={trainFrom:number;trainTo:number;testFrom:number;testTo:number;selectedRules:{minScore:number;adx:number;spike:number};train:{trades:number;expectancyR:number;maxDrawdownR:number};test:{trades:number;winRate:number;profitFactor:number|null;expectancyR:number;netR:number;maxDrawdownR:number}};
export type WalkForwardResult={folds:WalkForwardFold[];outOfSampleTrades:number;outOfSampleWinRate:number;outOfSampleProfitFactor:number|null;outOfSampleExpectancyR:number;outOfSampleNetR:number;outOfSampleMaxDrawdownR:number;positiveFolds:number;stabilityScore:number;notes:string[]};

export function aggregateComplete(candles:Candle[],minutes:number){
  const ms=minutes*60000,step=300000,out:Candle[]=[];
  const groups=new Map<number,Candle[]>();
  for(const c of candles){const at=Math.floor(c.time/ms)*ms;const g=groups.get(at)??[];g.push(c);groups.set(at,g);}
  for(const [at,g] of groups){
    if(g.length!==minutes/5||g.some((c,i)=>c.time!==at+i*step))continue;
    out.push({time:at,open:g[0].open,high:Math.max(...g.map(c=>c.high)),low:Math.min(...g.map(c=>c.low)),close:g.at(-1)!.close});
  }
  return out;
}
export function cleanBacktestCandles(input:Candle[],asOf=Infinity){
  const rows=new Map<number,Candle>(),bad=new Set<number>();
  for(const c of input){
    if(![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||c.time<=0||c.time%300000||c.time+300000>asOf||
      c.low<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))continue;
    const prev=rows.get(c.time);
    if(prev&&[prev.open,prev.high,prev.low,prev.close].some((v,i)=>v!==[c.open,c.high,c.low,c.close][i]))bad.add(c.time);
    rows.set(c.time,c);
  }
  return [...rows.values()].filter(c=>!bad.has(c.time)).sort((a,b)=>a.time-b.time);
}
function upperIndex(a:Candle[],time:number){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].time<=time)lo=m+1;else hi=m;}return lo;}
function round(v:number,d=3){const p=10**d;return Math.round(v*p)/p;}
export function statsFromTrades(trades:readonly Pick<BacktestTrade,'resultR'>[]){
  let net=0,peak=0,maxDd=0,grossWin=0,grossLoss=0,wins=0,losses=0;
  for(const t of trades){net+=t.resultR;peak=Math.max(peak,net);maxDd=Math.max(maxDd,peak-net);if(t.resultR>0){wins++;grossWin+=t.resultR;}else if(t.resultR<0){grossLoss+=Math.abs(t.resultR);losses++;}}
  return {trades:trades.length,wins,losses,winRate:trades.length?round(100*wins/trades.length,1):0,profitFactor:grossLoss?round(grossWin/grossLoss,2):null,expectancyR:trades.length?round(net/trades.length,3):0,netR:round(net,2),maxDrawdownR:round(maxDd,2)};
}

function runBacktestLedger(input:Candle[],r:Rules=defaults,options:BacktestOptions={}):BacktestResult&{ledger:BacktestTrade[]}{
  const c5=cleanBacktestCandles(input),c15=aggregateComplete(c5,15),h1=aggregateComplete(c5,60),trades:BacktestTrade[]=[];
  const spread=Math.max(0,Number(options.spreadUsd||0)),slippage=Math.max(0,Number(options.slippageUsd||0));
  let i=0;
  while(i<c5.length-2){
    const t=c5[i].time+300000,i15=upperIndex(c15,t-900000)-1,i60=upperIndex(h1,t-3600000)-1;
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
    if(next.time!==t){i++;continue;}
    if(options.tradeFrom&&next.time<options.tradeFrom){i++;continue;}
    if(options.tradeTo&&next.time>options.tradeTo)break;
    const referenceEntry=next.open,recent=w5.slice(-12),swing=side==='buy'?Math.min(...recent.map(x=>x.low)):Math.max(...recent.map(x=>x.high)),raw=side==='buy'?Math.min(swing,referenceEntry-1.2*i5.atr):Math.max(swing,referenceEntry+1.2*i5.atr),cap=side==='buy'?referenceEntry-2.2*i5.atr:referenceEntry+2.2*i5.atr,sl=side==='buy'?Math.max(raw,cap):Math.min(raw,cap),referenceRisk=Math.abs(referenceEntry-sl);
    if(!(referenceRisk>0&&referenceRisk<=2.25*i5.atr)){i++;continue;}
    const tp=referenceEntry+(side==='buy'?1:-1)*1.8*referenceRisk,adverse=spread/2+slippage,entry=referenceEntry+(side==='buy'?1:-1)*adverse,actualRisk=Math.abs(entry-sl);
    if(actualRisk<=0){i++;continue;}
    const maxJ=Math.min(c5.length-1,i+1+96);let exit=entry,resultR=0,closedAt=next.time,j=i+1;
    for(;j<=maxJ;j++){
      const c=c5[j],stop=side==='buy'?c.low<=sl:c.high>=sl,target=side==='buy'?c.high>=tp:c.low<=tp;
      const sign=side==='buy'?1:-1;
      if(stop||target||j===maxJ){
        // Treat OHLC as reference prices; charge adverse execution on both legs.
        const referenceExit=stop?(side==='buy'?Math.min(sl,c.open):Math.max(sl,c.open)):target?tp:c.close;
        exit=referenceExit-sign*adverse;
        resultR=sign*(exit-entry)/actualRisk;closedAt=c.time+300000;break;
      }
    }
    trades.push({side,entry:round(entry),referenceEntry:round(referenceEntry),sl:round(sl),tp:round(tp),openedAt:next.time,closedAt,exit:round(exit),resultR,score:best,regime:regime.label});i=Math.max(i+1,j);
  }
  const st=statsFromTrades(trades);
  return {...st,ledger:trades,from:trades[0]?.openedAt??null,to:trades.at(-1)?.closedAt??null,sampleCandles:c5.length,assumptions:[
    'اختبار تقني على M5 مع إعادة بناء M15/H1؛ M5 يبقى بديلاً لتوقيت M1 في التاريخ العميق.',
    `تكلفة تنفيذ افتراضية: spread=${round(spread,3)} USD + slippage=${round(slippage,3)} USD لكل جانب من التنفيذ (الدخول والخروج).`,
    'الأخبار التاريخية غير مطبقة بعد؛ نتائج فترات الأخبار يجب تفسيرها بحذر.',
    'إذا لمس SL وTP داخل نفس شمعة، يُحسب SL أولاً بشكل محافظ.'
  ],recent:trades.slice(-12).reverse()};
}

export function runBacktest(input:Candle[],r:Rules=defaults,options:BacktestOptions={}):BacktestResult{
  const {ledger,...result}=runBacktestLedger(input,r,options);return result;
}

function candidateRules(base:Rules):Rules[]{
  const raw=[base,{...base,minScore:Math.min(90,base.minScore+4)},{...base,adx:Math.min(30,base.adx+2)}],seen=new Set<string>();
  return raw.filter(x=>{const k=x.minScore+':'+x.adx+':'+x.spike;if(seen.has(k))return false;seen.add(k);return true;});
}
function fitness(r:BacktestResult){if(r.trades<5)return -999;return r.expectancyR*Math.sqrt(r.trades)-0.06*r.maxDrawdownR;}

export function runWalkForward(input:Candle[],base:Rules=defaults,options:BacktestOptions={}):WalkForwardResult{
  const c=cleanBacktestCandles(input),trainBars=Math.min(5000,Math.max(3200,Math.floor(c.length*.28))),testBars=Math.min(1500,Math.max(900,Math.floor(c.length*.08))),folds:WalkForwardFold[]=[],oos:BacktestTrade[]=[];
  if(c.length<trainBars+testBars+500)return {folds:[],outOfSampleTrades:0,outOfSampleWinRate:0,outOfSampleProfitFactor:null,outOfSampleExpectancyR:0,outOfSampleNetR:0,outOfSampleMaxDrawdownR:0,positiveFolds:0,stabilityScore:0,notes:['العينة التاريخية غير كافية لـWalk-Forward موثوق.']};
  const firstTest=Math.max(trainBars,c.length-(trainBars+3*testBars));
  for(let testStart=firstTest;testStart+testBars<=c.length&&folds.length<3;testStart+=testBars){
    const trainStart=Math.max(0,testStart-trainBars),trainEnd=testStart-1,testEnd=testStart+testBars-1,train=c.slice(trainStart,testStart),historyStart=Math.max(0,testStart-2880),withHistory=c.slice(historyStart,testEnd+1),testFrom=c[testStart].time,testTo=c[testEnd].time;
    let best=base,bestResult=runBacktest(train,base,options),bestFit=fitness(bestResult);
    for(const candidate of candidateRules(base)){const r=runBacktest(train,candidate,options),f=fitness(r);if(f>bestFit){best=candidate;bestResult=r;bestFit=f;}}
    const test=runBacktestLedger(withHistory,best,{...options,tradeFrom:testFrom,tradeTo:testTo});
    oos.push(...test.ledger);
    folds.push({trainFrom:c[trainStart].time,trainTo:c[trainEnd].time,testFrom,testTo,selectedRules:{minScore:best.minScore,adx:best.adx,spike:best.spike},train:{trades:bestResult.trades,expectancyR:bestResult.expectancyR,maxDrawdownR:bestResult.maxDrawdownR},test:{trades:test.trades,winRate:test.winRate,profitFactor:test.profitFactor,expectancyR:test.expectancyR,netR:test.netR,maxDrawdownR:test.maxDrawdownR}});
  }
  const st=statsFromTrades(oos),positive=folds.filter(f=>f.test.netR>0&&f.test.expectancyR>0).length;
  const stability=Math.max(0,Math.min(100,Math.round((folds.length?positive/folds.length:0)*60+Math.max(0,Math.min(1,st.expectancyR/.25))*25+Math.max(0,1-Math.min(1,st.maxDrawdownR/10))*15)));
  return {folds,outOfSampleTrades:st.trades,outOfSampleWinRate:st.winRate,outOfSampleProfitFactor:st.profitFactor,outOfSampleExpectancyR:st.expectancyR,outOfSampleNetR:st.netR,outOfSampleMaxDrawdownR:st.maxDrawdownR,positiveFolds:positive,stabilityScore:st.trades?stability:0,notes:['Walk-Forward يختار إعدادات minScore/ADX على نافذة تدريب سابقة ثم يقيسها على نافذة تالية لم تدخل في الاختيار.','Stability Score مقياس داخلي لاستقرار الاختبار وليس احتمال نجاح صفقة مستقبلية.','إغلاق إجباري عند نهاية كل نافذة؛ النتائج تجمع الصفقات الفعلية على منحنى R متصل، لا تقديرات اصطناعية.','النتائج ما زالت لا تتضمن إعادة بناء الأخبار التاريخية لحظة بلحظة.']};
}
