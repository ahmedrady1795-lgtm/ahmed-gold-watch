import type {M15GuideBar,M15WatchGuide} from './sniper-m15-watch-guide';

export type HuntSide='BUY'|'SELL';
export type HuntSweep='HIGH_REJECTION'|'LOW_REJECTION'|'NONE';
export type HuntPreviewCandle={
  time:number;open:number;high:number;low:number;close:number;
  side:HuntSide;step:number;illustrative:true
};
export type HuntPool={kind:'HIGH_POOL'|'LOW_POOL';price:number;low:number;high:number};
export type M15HuntObservation={
  buyPoints:number;sellPoints:number;
  preferred:HuntSide;quality:'CLEAR'|'MIXED'|'WEAK';
  reasons:string[];warnings:string[];
  conflicting:boolean;matchedFactors:number;
  // A pattern-comparison score, never a calibrated success probability.
  notTradeSignal:true
};
export type M15HuntPreview={
  ready:boolean;reason:string;anchor:number|null;anchorTime:number|null;
  preferred:HuntSide|'WAIT';strength:number;sweep:HuntSweep;
  referenceOnly:boolean;atr:number|null;
  buy:HuntPreviewCandle[];sell:HuntPreviewCandle[];pools:HuntPool[];
  observation?:M15HuntObservation;
};

const blank=(reason:string):M15HuntPreview=>({
  ready:false,reason,anchor:null,anchorTime:null,preferred:'WAIT',strength:0,
  sweep:'NONE',referenceOnly:true,atr:null,buy:[],sell:[],pools:[]
});
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const price=(v:number)=>Number(v.toFixed(6));
const offsets=[.18,.52,.43,.85,.70,1.52] as const;
const wicks=[.20,.14,.18,.16,.23,.19] as const;

// Closed-candle observer is independent of both M15 trade certification and
// ML/Neural API availability. It never reads forming candles or future bars.
// Each directional point has an explicit source; price pools are destinations,
// NOT independent proof that either direction will be reached.
export function observeM15HuntPressure(
  closed:readonly M15GuideBar[],atr:number,
  guideBias:'BUY'|'SELL'|'WAIT',sweep:HuntSweep
):M15HuntObservation|null{
  if(closed.length<16||!Number.isFinite(atr)||atr<=0)return null;
  const a=closed.slice(-16),last=a[15];
  if(a.some((b,i)=>!Number.isSafeInteger(b.time)||
     [b.open,b.high,b.low,b.close].some(v=>!Number.isFinite(v)||v<=0)||
     b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||
     i>0&&b.time-a[i-1].time!==900000))return null;
  let buy=0,sell=0;
  const reasons:string[]=[],warnings:string[]=[];
  const vote=(side:HuntSide,points:number,reason:string)=>{
    if(side==='BUY')buy+=points;else sell+=points;
    reasons.push((side==='BUY'?'↑ ':'↓ ')+reason);
  };
  // Relative EMA momentum: reacts to acceleration without using future closes.
  const ema=(n:number)=>{
    let v=a[0].close,k=2/(n+1);
    for(const b of a.slice(1))v+=(b.close-v)*k;
    return v;
  };
  const spread=ema(5)-ema(13);
  if(Math.abs(spread)>=atr*.075)
    vote(spread>0?'BUY':'SELL',2,'ميل المتوسطات M15');
  // Short-horizon impulse, measured only at the most recent close.
  const impulse=last.close-a[11].close;
  if(Math.abs(impulse)>=atr*.18)
    vote(impulse>0?'BUY':'SELL',2,'زخم آخر 4 شمعات');
  // Bodies measure who actually won the CLOSE, not just wick extremes.
  const bodies=a.slice(-5).reduce((sum,b)=>sum+b.close-b.open,0);
  if(Math.abs(bodies)>=atr*.22)
    vote(bodies>0?'BUY':'SELL',2,'ضغط الإغلاقات');
  const previous=a.slice(3,-1);
  const high=Math.max(...previous.map(b=>b.high));
  const low=Math.min(...previous.map(b=>b.low));
  // Break of structure must CLOSE beyond a preceding observed swing.
  if(last.close>high+atr*.025)
    vote('BUY',3,'إغلاق فوق هيكل القمم');
  else if(last.close<low-atr*.025)
    vote('SELL',3,'إغلاق تحت هيكل القيعان');
  if(sweep==='HIGH_REJECTION')vote('SELL',10,'سحب قمة ثم رفض مؤكد');
  if(sweep==='LOW_REJECTION')vote('BUY',10,'سحب قاع ثم استرداد مؤكد');
  // Local price rejection: a closed pin with a clear wick dominance.
  const range=Math.max(last.high-last.low,atr*.01);
  const upper=(last.high-Math.max(last.open,last.close))/range;
  const lower=(Math.min(last.open,last.close)-last.low)/range;
  if(upper>=.46&&upper>lower*1.7&&last.close<=last.open)
    vote('SELL',1,'ذيل رفض علوي');
  if(lower>=.46&&lower>upper*1.7&&last.close>=last.open)
    vote('BUY',1,'ذيل رفض سفلي');
  if(guideBias!=='WAIT')
    vote(guideBias,1,'ميل نطاق M15');
  // A neutral chart still has a watch preference; never turn a faint pattern
  // into a certified trade. Both hypothetical paths remain available.
  const tie=last.close!==last.open?last.close>last.open:
    last.close>=a[14].close;
  const preferred:HuntSide=buy!==sell?buy>sell?'BUY':'SELL':
    guideBias!=='WAIT'?guideBias:tie?'BUY':'SELL';
  const matchedFactors=reasons.filter(s=>s.startsWith(preferred==='BUY'?'↑':'↓')).length;
  const weakDifference=Math.abs(buy-sell);
  const conflicting=buy>=3&&sell>=3;
  const quality:M15HuntObservation['quality']=
    weakDifference>=5&&matchedFactors>=3&&!conflicting?'CLEAR':
    weakDifference>=2?'MIXED':'WEAK';
  if(conflicting)warnings.push('تعارض أدلة الصعود والهبوط');
  if(last.high-last.low>=atr*2.5)
    warnings.push('شمعة طويلة؛ مطاردة الحركة خطرة');
  if(quality==='WEAK')warnings.push('ميل ضعيف؛ لا تأكيد دخول');
  if(!reasons.length)warnings.push('لا توجد دلائل اتجاه كافية؛ مجرد مراقبة');
  return {buyPoints:buy,sellPoints:sell,preferred,quality,
    reasons,warnings,conflicting,matchedFactors,notTradeSignal:true};
}


/**
 * An educational what-if sequence from 16 *closed* contiguous M15 bars.
 * Both scenarios exist even when bias is WAIT. These are NOT future trades
 * or a model trained/calibrated to predict individual candle closes.
 *
 * Real values only: guide anchor, historical ATR, observed swing pools.
 * Hypothetical values: the 6 future candle bodies/wicks and touch order.
 */
export function buildM15HuntPreview(
  history:readonly M15GuideBar[],guide:M15WatchGuide,now:number
):M15HuntPreview{
  if(!guide.ready||guide.anchor==null||guide.anchorTime==null||
     guide.atr==null||guide.atr<=0||!Number.isFinite(now))
    return blank(guide.reason||'لا يوجد نطاق M15 صالح');
  const rows=history.slice(-16),last=rows.at(-1);
  if(!last||rows.length<16||last.time!==guide.anchorTime||
    last.close!==guide.anchor||last.time+900000>now)
    return blank('إغلاق M15 لا يطابق مرجع السيناريو');
  for(let i=1;i<rows.length;i++){
    if(rows[i].time-rows[i-1].time!==900000)return blank('فجوة بين شموع M15');
  }
  const atr=guide.atr,anchor=guide.anchor;
  const trailing=rows.slice(-13,-1);
  const previousHigh=Math.max(...trailing.map(b=>b.high));
  const previousLow=Math.min(...trailing.map(b=>b.low));
  // A sweep is only an observed wick past earlier highs/lows followed by
  // a CLOSED rejection. No access to hidden orders or institutional identity.
  const highRejection=last.high>previousHigh+atr*.04&&
    last.close<previousHigh&&last.close<last.open;
  const lowRejection=last.low<previousLow-atr*.04&&
    last.close>previousLow&&last.close>last.open;
  const sweep:HuntSweep=highRejection?'HIGH_REJECTION':
    lowRejection?'LOW_REJECTION':'NONE';
  const observation=observeM15HuntPressure(rows,atr,guide.bias,sweep);
  if(!observation)return blank('تعذر تحليل شموع M15 المغلقة');
  // Even weak/noisy observations remain visible as watch hypotheses;
  // execution and data-integrity gates are never bypassed.
  const preferred:HuntSide|'WAIT'=observation.preferred;
  const delta=Math.abs(observation.buyPoints-observation.sellPoints);
  // This is a descriptive pattern-strength index; NOT a win probability.
  const strength=Math.round(clamp(
    25+delta*5+observation.matchedFactors*3-
    (observation.conflicting?12:0),15,89
  ));
  const make=(side:HuntSide):HuntPreviewCandle[]=>{
    const polarity=side==='BUY'?1:-1;
    let prior=anchor;
    return offsets.map((stepOffset,i)=>{
      const open=prior;
      const close=price(anchor+polarity*stepOffset*atr);
      const high=price(Math.max(open,close)+wicks[i]*atr);
      const low=price(Math.max(.000001,Math.min(open,close)-
        (wicks[i]+(i%2)*.05)*atr));
      prior=close;
      return {time:guide.anchorTime!+(i+1)*900000,
        open:price(open),high,low,close,side,step:i+1,illustrative:true};
    });
  };
  const buffer=Math.max(atr*.13,anchor*.00001);
  const pools:HuntPool[]=[
    {kind:'HIGH_POOL',price:price(previousHigh),
      low:price(previousHigh-buffer),high:price(previousHigh+buffer)},
    {kind:'LOW_POOL',price:price(previousLow),
      low:price(Math.max(.000001,previousLow-buffer)),
      high:price(previousLow+buffer)}
  ];
  return {ready:true,reason:guide.reason,anchor,anchorTime:guide.anchorTime,
    preferred,strength,sweep,referenceOnly:guide.referenceOnly,atr,
    buy:make('BUY'),sell:make('SELL'),pools,observation};
}

/** Stop/target-like visual WATCH waypoints on the price axis.
 * The price-aligned horizontal line is never shifted. Only the text label
 * moves by a few pixels to avoid collisions on a narrow mobile screen.
 * These are simulated ATR stations, NOT broker TP/SL orders.
 */
export type HuntWaypoint={
 side:HuntSide;stage:1|2;price:number;lineY:number;labelY:number
};
export function placeHuntWaypoints(f:M15HuntPreview,
 priceToY:(value:number)=>number,top:number,bottom:number):HuntWaypoint[]{
 if(!f.ready||bottom-top<100)return [];
 const candidates:([HuntSide,1|2,number|undefined])[]=[
  ['BUY',1,f.buy[2]?.close],['BUY',2,f.buy[5]?.close],
  ['SELL',1,f.sell[2]?.close],['SELL',2,f.sell[5]?.close]
 ];
 const raw=candidates.filter(r=>r[2]!=null&&Number.isFinite(r[2])&&r[2]!>0)
  .map(([side,stage,value])=>{
   const price=value as number;
   return {side,stage,price,lineY:priceToY(price),labelY:0};
  }).filter(x=>Number.isFinite(x.lineY)&&x.lineY>=top+5&&x.lineY<=bottom-5)
   .sort((a,b)=>a.lineY-b.lineY);
 const labelMin=top+16,labelMax=bottom-8,spacing=16;
 let prior=labelMin-spacing;
 for(const x of raw){
  x.labelY=Math.max(prior+spacing,Math.max(labelMin,
    Math.min(labelMax,x.lineY-4)));
  prior=x.labelY;
 }
 const overflow=(raw.at(-1)?.labelY??labelMin)-labelMax;
 if(overflow>0)for(const x of raw)x.labelY-=overflow;
 return raw;
}
