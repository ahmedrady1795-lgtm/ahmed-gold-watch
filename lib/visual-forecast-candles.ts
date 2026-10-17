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
/** Never match on the future sample. Candidate windows end before the last six
 * context bars, with no touching/overlap of the current market context.
 */
export function selectCandleAnalogue(history:Bar[],count:number,atr:number){
 const context=history.slice(-6);
 if(history.length<count+18||context.length!==6)return -1;
 const signature=(rows:Bar[],vol:number)=>rows.map(b=>[
   clamp((b.close-b.open)/vol,-3,3),
   clamp((b.high-b.low)/vol,0,5)
 ]);
 const target=signature(context,atr);
 let best=-1,bestScore=Infinity;
 for(let start=8;start<=history.length-count-8;start++){
   const contextStart=start-6;
   const full=history.slice(contextStart,start+count);
   if(full.length!==count+6||full.some((b,i)=>!valid(b)||
      (i>0&&b.time-full[i-1].time!==60000)))continue;
   const prior=history.slice(contextStart,start);
   const vol=median(prior.map((b,i)=>tr(b,prior[i-1])))||atr;
   if(vol<=0)continue;
   const candidate=signature(prior,vol);
   let score=0;
   for(let i=0;i<6;i++){
     score+=Math.min(6,Math.abs(candidate[i][0]-target[i][0]))*.7;
     score+=Math.min(6,Math.abs(candidate[i][1]-target[i][1]))*.27;
   }
   const lastTarget=context[5].close-context[0].open;
   const lastPrior=prior[5].close-prior[0].open;
   score+=Math.min(4,Math.abs(lastTarget/atr-lastPrior/vol))*.5;
   if(score<bestScore){bestScore=score;best=start;}
 }
 return best;
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
   const body=clamp(scaled-(analogue?0:fallbackMean*.7),-a*1.75,a*1.75);
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
