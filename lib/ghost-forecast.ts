/**
 * Experimental, causal 3-step M1 ghost-candle model. Never an executable signal.
 * Every estimation uses only completed source bars; bodies/wicks are empirical
 * visual hypotheses, NOT calibrated next-candle OHLC or probabilities.
 */
export type GhostSide='BUY'|'SELL'|'WAIT';
export type GhostCandle={time:number;open:number;high:number;low:number;close:number;
  lowerBand:number;upperBand:number;step:1|2|3};
export type GhostValidation={samples:number;directionHits:number;maeAtr:number|null;bandHits:number;
  note:string};
export type GhostForecast={ready:boolean;reason:string;source:'CLOSED_M1_EMPIRICAL_SHADOW';
  baseAt:number|null;atr:number|null;side:GhostSide;candles:GhostCandle[];
  validation:GhostValidation};
type Bar={time:number;open:number;high:number;low:number;close:number};

const positive=(v:unknown):number|null=>{
  const n=Number(v);return v!=null&&v!==''&&Number.isFinite(n)&&n>0?n:null;
};
const finite=(v:unknown):number|null=>{
  const n=Number(v);return v!=null&&v!==''&&Number.isFinite(n)?n:null;
};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const median=(xs:number[])=>{
  const s=[...xs].sort((a,b)=>a-b),m=s.length>>1;
  return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0;
};
function cleanClosed(input:unknown,now:number):Bar[]{
  if(!Array.isArray(input))return [];
  const byTime=new Map<number,Bar>(),conflict=new Set<number>();
  for(const v of input){
    const time=finite(v?.time),open=positive(v?.open),high=positive(v?.high),
      low=positive(v?.low),close=positive(v?.close);
    if(time==null||time<=0||time%60000!==0||time+60000>now||
      time<now-7*86400000||open==null||high==null||low==null||close==null||
      high<Math.max(open,close)||low>Math.min(open,close))continue;
    const old=byTime.get(time);
    if(old&&(old.open!==open||old.high!==high||old.low!==low||old.close!==close))
      conflict.add(time);
    byTime.set(time,{time,open,high,low,close});
  }
  for(const t of conflict)byTime.delete(t);
  return [...byTime.values()].sort((a,b)=>a.time-b.time).slice(-260);
}
function atr(rows:Bar[]):number{
  const tail=rows.slice(-34);
  const tr=tail.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-tail[i].close),Math.abs(b.low-tail[i].close)));
  return median(tr);
}
function localSide(rows:Bar[],vol:number):GhostSide{
  const n=rows.length;if(n<60||vol<=0)return 'WAIT';
  const short=rows[n-1].close-rows[n-7].close;
  const long=rows[n-1].close-rows[n-13].close;
  if(short>vol*.32&&long>vol*.40)return 'BUY';
  if(short<-vol*.32&&long<-vol*.40)return 'SELL';
  return 'WAIT';
}
const CONTEXT=60,STEPS=3,NOTE=
  'قياس زمني تاريخي متدرج للنموذج الفني M1 فقط؛ لا يختبر دقة خطة السيرفر ولا التنفيذ أو الربحية.';
// Core uses exactly CONTEXT closed candles. Refuses backward/future timestamps,
// gaps, stale input, side conflict and shock regimes.
function predict(rows:Bar[],side:GhostSide,now:number,price:number|null,priceGate:boolean){
  const last=rows.at(-1),last60=rows.slice(-CONTEXT);
  if(!priceGate||!last||side==='WAIT'||last60.length!==CONTEXT)
    return {reason:'لا يوجد سياق اتجاه مؤهل أو سعر حي موثوق',atr:null as number|null,candles:[] as GhostCandle[]};
  if(now-(last.time+60000)<0||now-(last.time+60000)>90000||
     last60.some((c,i)=>i>0&&c.time-last60[i-1].time!==60000))
    return {reason:'شموع M1 قديمة أو فيها فجوة؛ إيقاف الرسم التقديري',atr:null,candles:[] as GhostCandle[]};
  const a=atr(last60);
  if(!Number.isFinite(a)||a<=last.close*.000001||a>last.close*.025)
    return {reason:'تذبذب غير صالح أو خارج النطاق الآمن للعرض',atr:null,candles:[] as GhostCandle[]};
  if(!localSide(last60,a)||localSide(last60,a)!==side)
    return {reason:'اتجاه M1 غير متفق مع السيناريو؛ لا شموع مستقبلية',atr:a,candles:[] as GhostCandle[]};
  if(price==null||!Number.isFinite(price)||price<=0||
    Math.abs(price-last.close)>1.25*a)
    return {reason:'فجوة بين السعر الحي وآخر إغلاق تتجاوز قدرة نموذج M1',atr:a,candles:[] as GhostCandle[]};
  const recent=last60.slice(-20);
  const lastRange=last.high-last.low;
  if(lastRange>3.8*a)
    return {reason:'صدمة سعرية حديثة؛ رسم شموع قصيرة المدى مضلل',atr:a,candles:[] as GhostCandle[]};
  const sign=side==='BUY'?1:-1;
  const shortSlope=(last.close-last60.at(-7)!.close)/6;
  const longSlope=(last.close-last60.at(-13)!.close)/12;
  const drift=clamp(Math.abs(shortSlope*.6+longSlope*.4),a*.045,a*.24);
  const candleBodies=recent.map(b=>b.close-b.open);
  const upperWicks=recent.map(b=>b.high-Math.max(b.open,b.close));
  const lowerWicks=recent.map(b=>Math.min(b.open,b.close)-b.low);
  const up=clamp(median(upperWicks),a*.08,a*.40);
  const down=clamp(median(lowerWicks),a*.08,a*.40);
  const bodyNoise=clamp(median(candleBodies.map(Math.abs)),a*.07,a*.40);
  const candles:GhostCandle[]=[];let prev=last.close;
  for(let i=0;i<STEPS;i++){
    // A small bounded visual variation from already-closed body signs, rather
    // than arbitrary hardcoded all-green/all-red candles.
    const pastBody=candleBodies[recent.length-1-(i*3)%recent.length];
    const signed=clamp(sign*drift*(i===1?.73:i===2?1.08:.9)+
      Math.sign(pastBody)*Math.min(Math.abs(pastBody),bodyNoise)*.22,
      -a*.18,a*.30);
    const open=prev,close=open+signed;
    const high=Math.max(open,close)+up*(i%2?.85:1.08);
    const low=Math.min(open,close)-down*(i%2?1.09:.91);
    // Not a confidence interval: the envelope is a widening, uncalibrated
    // volatility marker and must never be presented as a 90%/95% band.
    const spread=a*.85*Math.sqrt(i+1);
    const lowerBand=Math.min(open,close-spread,low);
    const upperBand=Math.max(open,close+spread,high);
    candles.push({time:last.time+(i+1)*60000,open,high,low,close,
      lowerBand,upperBand,step:(i+1) as 1|2|3});
    prev=close;
  }
  return {reason:'شموع افتراضية من تقلب وحركة M1 تاريخية، غير معايرة للتوقع أو التنفيذ',
    atr:a,candles};
}
function emptyValidation():GhostValidation{return {samples:0,directionHits:0,maeAtr:null,bandHits:0,note:NOTE};}
export function evaluateGhostCandles(input:unknown,now:number):GhostValidation{
  const rows=cleanClosed(input,now),r=emptyValidation();
  // Disjoint three-bar outcomes and exclusively preceding input windows.
  // Historic side is reconstructed at EACH origin, not backfilled from now.
  for(let end=CONTEXT;end+STEPS<=rows.length;end+=STEPS){
    const context=rows.slice(end-CONTEXT,end),last=context.at(-1)!;
    if(context.some((c,i)=>i>0&&c.time-context[i-1].time!==60000))continue;
    const a=atr(context),side=localSide(context,a);
    const p=predict(context,side,last.time+60000,last.close,true);
    if(!p.candles.length||p.atr==null)continue;
    const actual=rows.slice(end,end+STEPS);
    if(actual.some((b,i)=>b.time!==last.time+(i+1)*60000))continue;
    const target=p.candles.at(-1)!,observed=actual.at(-1)!;
    r.samples++;
    if((side==='BUY'?1:-1)*(observed.close-last.close)>0)r.directionHits++;
    r.maeAtr=(r.maeAtr??0)+Math.abs(target.close-observed.close)/p.atr;
    if(actual.every((b,i)=>b.close>=p.candles[i].lowerBand&&b.close<=p.candles[i].upperBand))r.bandHits++;
  }
  if(r.samples&&r.maeAtr!=null)r.maeAtr=Number((r.maeAtr/r.samples).toFixed(3));
  return r;
}
export function buildGhostForecast(input:{
  candles:unknown;now:number;side:GhostSide;price:number|null;
  sourceReady:boolean;scenarioReady:boolean;
}):GhostForecast{
  const rows=cleanClosed(input.candles,input.now),baseAt=rows.at(-1)?.time??null;
  const validation=evaluateGhostCandles(input.candles,input.now);
  if(!input.scenarioReady)return {ready:false,reason:'لا يوجد سيناريو خادم حديث حتى تتوافق معه M1',
    source:'CLOSED_M1_EMPIRICAL_SHADOW',baseAt,atr:null,side:input.side,candles:[],validation};
  const result=predict(rows,input.side,input.now,input.price,input.sourceReady);
  return {ready:result.candles.length===STEPS,reason:result.reason,
    source:'CLOSED_M1_EMPIRICAL_SHADOW',baseAt,atr:result.atr,side:input.side,
    candles:result.candles,validation};
}
