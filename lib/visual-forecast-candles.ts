/**
 * Display-only next-M1-candle visualization, made from CLOSED historical OHLC
 * motifs instead of repetitive sine / step functions.
 *
 * Each candidate analogue is selected by comparing only the six PRECEDING
 * observed M1 candles with the last six completed candles. Its subsequent
 * historical candle shapes are then transplanted (body + both real wicks)
 * at the current M1 ATR. This is an illustration, NOT a backtested predictor:
 * no claim is made about the destination, times, accuracy, probability or edge.
 * Not consumed by trading, scoring, alerts or server-side signal pipelines.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Ghost={mode:'OFF'|'RANGE'|'CANDLES';atr:number|null;side:'BUY'|'SELL'|'WAIT';
 candles:Array<Bar>};
export type VisualFutureBar=Bar&{
 step:number;validatedShape:boolean;scenarioShape:boolean;
 analogue:boolean;
};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const median=(values:number[]):number=>{
 const v=values.filter(Number.isFinite).sort((a,b)=>a-b),n=v.length;
 return n?(n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2):0;
};
const tr=(b:Bar,prev?:Bar)=>Math.max(b.high-b.low,
 Math.abs(b.high-(prev?.close??b.open)),Math.abs(b.low-(prev?.close??b.open)));
const valid=(b:Bar)=>Boolean(b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
 b.open>0&&b.low>0&&b.low<=Math.min(b.open,b.close)&&
 b.high>=Math.max(b.open,b.close)&&b.high>=b.low);
/** Compare independent historical CLOSED sequences, never overlapping the
 * six-current-bar context or the candidate's following candles.
 */
export function rankCandleAnalogues(history:Bar[],count:number,atr:number,limit=5){
 const context=history.slice(-6);
 if(history.length<count+18||context.length!==6||atr<=0||
   context.some((b,i)=>!valid(b)||(i>0&&b.time-context[i-1].time!==60000)))return [];
 const signature=(rows:Bar[],vol:number)=>rows.map(b=>[
   clamp((b.close-b.open)/vol,-3,3),
   clamp((b.high-b.low)/vol,0,5),
   clamp((Math.min(b.open,b.close)-b.low)/vol,0,4),
   clamp((b.high-Math.max(b.open,b.close))/vol,0,4)
 ]);
 const wanted=signature(context,atr);
 const matches:Array<{start:number;distance:number;futureAtr:number}>=[];
 for(let index=8;index<=history.length-count-8;index++){
   const beginning=index-6,window=history.slice(beginning,index+count);
   if(window.length!==count+6||window.some((b,i)=>!valid(b)||
      (i>0&&b.time-window[i-1].time!==60000)))continue;
   const prior=history.slice(beginning,index);
   const vol=median(prior.map((b,i)=>tr(b,prior[i-1])))||atr;
   if(vol<=0)continue;
   const sig=signature(prior,vol);
   let distance=0;
   for(let i=0;i<6;i++){
     distance+=Math.min(6,Math.abs(sig[i][0]-wanted[i][0]))*.62;
     distance+=Math.min(6,Math.abs(sig[i][1]-wanted[i][1]))*.16;
     distance+=Math.min(5,Math.abs(sig[i][2]-wanted[i][2]))*.12;
     distance+=Math.min(5,Math.abs(sig[i][3]-wanted[i][3]))*.10;
   }
   const trajectory=context.at(-1)!.close-context[0].open;
   const priorTrajectory=prior.at(-1)!.close-prior[0].open;
   distance+=Math.min(6,Math.abs(trajectory/atr-priorTrajectory/vol))*.52;
   const following=history[index+count-1].close/history[index-1].close-1;
   const futureAtr=(history[index+count-1].close-history[index-1].close)/vol;
   if(!Number.isFinite(following)||!Number.isFinite(futureAtr))continue;
   matches.push({start:index,distance:Number(distance.toFixed(5)),futureAtr});
 }
 // Adjacent one-minute snapshots often belong to the SAME market event.
 // Do not count five overlapping contexts/outcomes as five independent analogues.
 // Greedy selection chooses the best representative of each distinct time
 // block; the entire preceding-context + future-candle window is embargoed.
 const ranked=matches.sort((a,b)=>a.distance-b.distance);
 const selected:typeof matches=[];
 const minGap=count+6;
 for(const candidate of ranked){
   if(selected.every(p=>Math.abs(p.start-candidate.start)>=minGap))
     selected.push(candidate);
   if(selected.length>=Math.max(1,Math.min(limit,8)))break;
 }
 return selected;
}
export function selectCandleAnalogue(history:Bar[],count:number,atr:number){
 const ranked=rankCandleAnalogues(history,count,atr,5);
 if(!ranked.length)return -1;
 if(ranked.length<3)return ranked[0].start;
 // The closest single neighbour may be an anomalous winner. Select the
 // top neighbour whose total future return is closest to their median.
 const typical=median(ranked.map(x=>x.futureAtr));
 const medoid=[...ranked].sort((a,b)=>
   (Math.abs(a.futureAtr-typical)+a.distance*.02)-
   (Math.abs(b.futureAtr-typical)+b.distance*.02))[0];
 return medoid.start;
}
type Audit={samples:number;signals:number;hits:number;accuracyPct:number|null;
 baselineHits:number;baselinePct:number|null;edgeSupported:boolean;status:'COLLECTING'|'NO_PROVEN_EDGE'};

/** Purged chronological replay. On each fold, only the previously completed
 * prefix can select a candidate; the next 3 candles are used ONLY for scoring.
 * Disjoint evaluation horizon (stride 4) avoids claiming repeated win samples.
 * IMPORTANT: inclusion depends ONLY on pre-outcome candidate magnitude.
 * A small/flat realised future counts as a miss, never disappears post-hoc.
 */
export function auditCandleAnalogueDirection(rows:Bar[],atr:number):Audit{
 let samples=0,signals=0,hits=0,baselineHits=0;
 if(atr<=0||!Number.isFinite(atr))return {samples,signals,hits,accuracyPct:null,
   baselineHits,baselinePct:null,edgeSupported:false,status:'COLLECTING'};
 const start=Math.max(65,rows.length-156);
 for(let t=start;t<=rows.length-3;t+=4){
   const prefix=rows.slice(0,t);
   // The fold's volatility must be measured at its own historical cutoff.
   // Reusing today's ATR here would leak future scale into old test folds.
   const local=prefix.slice(-16);
   const localAtr=median(local.slice(1).map((bar,i)=>tr(bar,local[i])))||0;
   if(!Number.isFinite(localAtr)||localAtr<=0)continue;
   const idx=selectCandleAnalogue(prefix,3,localAtr);
   if(idx<0||prefix.length<6)continue;
   const f=rows.slice(t,t+3);
   if(f.length!==3||f.some((c,i)=>!valid(c)||
     (i===0?c.time-prefix.at(-1)!.time!==60000:
       c.time-f[i-1].time!==60000)))continue;
   const net=prefix[idx+2].close-prefix[idx-1].close;
   const move=f[2].close-prefix.at(-1)!.close;
   const baseline=prefix.at(-1)!.close-prefix.at(-4)!.close;
   // Selection uses only information known at the fold's forecast time.
   // Excluding small ACTUAL outcomes would cherry-pick the winning trades.
   if(Math.abs(net)<localAtr*.20)continue;
   signals++;samples++;
   if(Math.sign(net)===Math.sign(move))hits++;
   if(Math.sign(baseline)===Math.sign(move))baselineHits++;
 }
 const accuracyPct=samples?Math.round(hits/samples*100):null;
 const baselinePct=samples?Math.round(baselineHits/samples*100):null;
 // Merely passing a replay threshold is NOT a deployable trade signal.
 // Deliberately never qualify direction from a small single-session sample.
 return {samples,signals,hits,accuracyPct,baselineHits,baselinePct,
   edgeSupported:false,status:samples>=30?'NO_PROVEN_EDGE':'COLLECTING'};
}
export function buildVisualFuture(input:{
 candles:Bar[];forecast:Ghost;side:'BUY'|'SELL'|'WAIT';count?:number;
 // Compatibility only. Server H1/H4 objectives are intentionally ignored.
 scenarioPath?:Array<{price:number;key?:string}>;
}):VisualFutureBar[]{
 const bars=input.candles.filter(valid),last=bars.at(-1),a=input.forecast?.atr;
 if(!last||input.forecast.mode==='OFF'||a==null||!Number.isFinite(a)||a<=0)return [];
 const count=clamp(Math.floor(input.count??18),3,24);
 const g=input.forecast,certified=g.mode==='CANDLES'&&g.candles.length===3;
 // Source must be a contiguous genuine M1 run. Never extrapolate across a gap.
 if(bars.slice(-60).some((b,i,tail)=>i>0&&b.time-tail[i-1].time!==60000))return [];
 const start=selectCandleAnalogue(bars,count,a);
 const analogue=start>=0?bars.slice(start,start+count):null;
 const rangeDrift=input.forecast.mode==='RANGE'&&analogue?
   (analogue.at(-1)!.close-analogue[0].open)/count:0;
 const sampleVol=analogue?
   median(analogue.map((b,i)=>tr(b,analogue[i-1])))||a:a;
 const factor=clamp(a/sampleVol,.5,1.85);
 const fallback=bars.slice(-Math.max(10,count));
 const shapes=analogue??fallback;
 // Causal measured shapes, not arbitrary fixed sinusoids.
 const bodyMedian=median(bars.slice(-45).map(b=>Math.abs(b.close-b.open)))||a*.18;
 const wickUp=median(bars.slice(-45).map(b=>b.high-Math.max(b.open,b.close)))||a*.17;
 const wickDown=median(bars.slice(-45).map(b=>Math.min(b.open,b.close)-b.low))||a*.17;
 let prev=last.close;
 const result:VisualFutureBar[]=[];
 for(let i=0;i<count;i++){
   if(certified&&i<3){
     const c=g.candles[i];
     if(!valid(c)||Math.abs(c.open-prev)>Math.max(a*.2,prev*.00001))return [];
     result.push({...c,step:i+1,validatedShape:true,scenarioShape:false,analogue:false});
     prev=c.close;continue;
   }
   const source=shapes[i%shapes.length];
   const scaled=(source.close-source.open)*(analogue?factor:1);
   // In fallback mode a monotonically trending source is detrended so a
   // no-edge RANGE never masquerades as a directional signal.
   const fallbackMean=analogue?0:
     median(fallback.map(b=>b.close-b.open));
   const body=clamp(scaled-(analogue?rangeDrift*.68:fallbackMean*.7),-a*1.75,a*1.75);
   const open=prev;
   const close=Math.max(last.close*.01,
     clamp(open+body,last.close-a*7,last.close+a*7));
   // Preserve historical upper/lower wick asymmetry; bound outlier spikes.
   const up=clamp((source.high-Math.max(source.open,source.close))*
     (analogue?factor:1),a*.045,a*2.2);
   const down=clamp((Math.min(source.open,source.close)-source.low)*
     (analogue?factor:1),a*.045,a*2.2);
   const high=Math.max(open,close)+(Number.isFinite(up)?up:Math.min(a,wickUp));
   const low=Math.max(last.close*.005,Math.min(open,close)-
     (Number.isFinite(down)?down:Math.min(a,wickDown)));
   result.push({time:last.time+(i+1)*60000,open,high,low,close,
     step:i+1,validatedShape:false,scenarioShape:false,analogue:Boolean(analogue)});
   prev=close;
 }
 return result;
}
