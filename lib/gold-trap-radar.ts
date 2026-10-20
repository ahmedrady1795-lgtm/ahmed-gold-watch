import type {Candle} from './engine';

/**
 * Gold liquidity-trap radar. This is an observable PRICE-ACTION proxy, not
 * access to a market maker's inventory, stop orders, or global spot DOM.
 * Actual order-book support is credited only for fresh, nonempty MT5 DOM.
 */
export type RadarSide='BUY'|'SELL'|'WAIT';
export type GoldTrapRadar={
  ok:boolean;
  state:'OFFLINE'|'WAIT'|'WATCH'|'SWEEP_RECLAIM'|'DOM_PRE_MOVE';
  side:RadarSide;
  score:number; // evidence strength; NOT a probability
  source:'MT5_BROKER_DOM'|'CANDLE_PROXY'|'NONE';
  sourceLabel:string;
  candleAt:number|null;
  quoteAt:number|null;
  upperLiquidity:number|null;
  lowerLiquidity:number|null;
  sweepLevel:number|null;
  sweepExtreme:number|null;
  target:number|null;
  invalidation:number|null;
  trigger:number|null;
  trap:'UPPER_SWEEP'|'LOWER_SWEEP'|'NONE';
  rationale:string;
  evidence:string[];
  warnings:string[];
};

const clamp=(n:number,low=0,high=100)=>Math.max(low,Math.min(high,n));
const round=(n:number|null)=>n!=null&&Number.isFinite(n)?Number(n.toFixed(2)):null;
const sideOf=(v:unknown):RadarSide=>v==='BUY'||v==='SELL'?v:'WAIT';
const valid=(x:Candle)=>Number.isFinite(x.time)&&x.time>0&&
  [x.open,x.high,x.low,x.close].every(v=>Number.isFinite(v)&&v>0)&&
  x.low<=Math.min(x.open,x.close)&&x.high>=Math.max(x.open,x.close);

function atr(c:Candle[]):number{
  if(c.length<17)return NaN;
  const v=c.slice(-17),r:number[]=[];
  for(let i=1;i<v.length;i++){
    const x=v[i],p=v[i-1];
    r.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)));
  }
  const tail=r.slice(-14);
  return tail.reduce((a,b)=>a+b,0)/tail.length;
}

export function buildGoldTrapRadar(input:{
  c1:Candle[];
  c5?:Candle[];
  price?:number|null;
  quoteAt?:number|null;
  quoteStatus?:string|null;
  candleSource?:string|null;
  mt5Fast?:any;
  h4Side?:string|null;
  now?:number;
}):GoldTrapRadar{
  const now=input.now??Date.now();
  const empty:GoldTrapRadar={
    ok:false,state:'OFFLINE',side:'WAIT',score:0,source:'NONE',sourceLabel:'لا يوجد مصدر حديث',
    candleAt:null,quoteAt:null,upperLiquidity:null,lowerLiquidity:null,sweepLevel:null,
    sweepExtreme:null,target:null,invalidation:null,trigger:null,trap:'NONE',
    rationale:'بانتظار شموع ذهب مغلقة وسعر حديث من نفس السوق.',evidence:[],warnings:[]
  };
  const c1=(Array.isArray(input.c1)?input.c1:[])
    .filter(x=>valid(x)&&x.time+60000<=now&&x.time<=now).slice(-100);
  const c5=(Array.isArray(input.c5)?input.c5:[])
    .filter(x=>valid(x)&&x.time+300000<=now&&x.time<=now).slice(-25);
  if(c1.length<36||c5.length<8)return empty;
  const last=c1.at(-1)!;
  const candleAge=now-(last.time+60000);
  const quoteAt=Number(input.quoteAt);
  const price=Number(input.price);
  const a=atr(c1);
  const quoteFresh=Number.isFinite(quoteAt)&&quoteAt>0&&quoteAt<=now+1500&&now-quoteAt<=15000&&
    input.quoteStatus==='live';
  // A large source/basis mismatch is more dangerous than missing a trade.
  const aligned=Number.isFinite(price)&&price>0&&Number.isFinite(a)&&a>0&&
    Math.abs(price-last.close)<=Math.max(a*4,price*.0003);
  if(candleAge<0||candleAge>180000||!quoteFresh||!aligned){
    return {...empty,candleAt:last.time+60000,quoteAt:Number.isFinite(quoteAt)&&quoteAt>0?quoteAt:null,
      rationale:!quoteFresh?'سعر الذهب غير حيّ أو متأخر؛ لا يصح إصدار توقع مبكر.':
        candleAge>180000?'شموع M1 متأخرة؛ تم إيقاف رادار السيولة.':
        'مصدر السعر لا يتطابق مع الشموع؛ تم إيقاف التوقع.'};
  }
  const shelf=c1.slice(-48,-3);
  const hi=Math.max(...shelf.map(x=>x.high)),lo=Math.min(...shelf.map(x=>x.low));
  const tail=c1.slice(-3),maxHigh=Math.max(...tail.map(x=>x.high)),
    minLow=Math.min(...tail.map(x=>x.low));
  const tol=Math.max(a*.075,price*.00001);
  const highs=shelf.filter(x=>Math.abs(x.high-hi)<=a*.16).length;
  const lows=shelf.filter(x=>Math.abs(x.low-lo)<=a*.16).length;
  const upperSweep=maxHigh>hi+tol&&last.close<hi-a*.025;
  const lowerSweep=minLow<lo-tol&&last.close>lo+a*.025;
  const ambiguous=upperSweep&&lowerSweep;
  const trap:GoldTrapRadar['trap']=ambiguous?'NONE':upperSweep?'UPPER_SWEEP':
    lowerSweep?'LOWER_SWEEP':'NONE';
  const sweepSide:RadarSide=trap==='LOWER_SWEEP'?'BUY':trap==='UPPER_SWEEP'?'SELL':'WAIT';
  const prior=c1.at(-2)!;
  const wick=trap==='LOWER_SWEEP'?
    (Math.min(last.open,last.close)-last.low)/Math.max(a*.15,last.high-last.low):
    trap==='UPPER_SWEEP'?
      (last.high-Math.max(last.open,last.close))/Math.max(a*.15,last.high-last.low):0;
  const sameClose=trap==='LOWER_SWEEP'?last.close>prior.close:
    trap==='UPPER_SWEEP'?last.close<prior.close:false;
  const h4=sideOf(input.h4Side);
  const fast=input.mt5Fast;
  const dom=Boolean(fast?.ok===true&&Number(fast.samples)>=4&&
    Number.isFinite(Number(fast.receivedAt))&&now-Number(fast.receivedAt)>=0&&
    now-Number(fast.receivedAt)<=3000&&
    Number.isFinite(Number(fast.bookImbalance))&&
    // A velocity-only MT5 tick is NOT order book evidence.
    (Math.abs(Number(fast.bookImbalance))>0.01||
      Math.abs(Number(fast.bidDepthChangePct||0))>0.01||
      Math.abs(Number(fast.askDepthChangePct||0))>0.01));
  const domSide=dom?sideOf(fast.side):'WAIT';
  const domAligned=domSide!=='WAIT'&&sweepSide!== 'WAIT'&&domSide===sweepSide;
  const domPressure=dom?Number(fast.bookImbalance||0):0;
  const domBiasSide:RadarSide=dom&&Math.abs(domPressure)>=14&&
    (Number(fast.pressureChange||0)*Math.sign(domPressure)>=3)&&
    (Math.abs(Number(fast.velocity15s||0))<=.8)?(domPressure>0?'BUY':'SELL'):'WAIT';

  // A DOM pre-move requires independent price compression and sustained
  // pressure while still inside an observed historical range.
  const early=c1.slice(-10);
  const range= Math.max(...early.map(x=>x.high))-Math.min(...early.map(x=>x.low));
  const older=c1.slice(-35,-10);
  const olderRange=Math.max(...older.map(x=>x.high))-Math.min(...older.map(x=>x.low));
  const compressed=range>0&&olderRange>0&&range/olderRange<=.58;
  const domPreMove=trap==='NONE'&&!ambiguous&&compressed&&domBiasSide!=='WAIT'&&
    Number(fast?.persistence||0)>=60&&Number(fast?.samples||0)>=6;
  let side:RadarSide='WAIT';
  let state:GoldTrapRadar['state']='WAIT';
  if(trap!=='NONE'&&wick>=.23&&sameClose){
    side=sweepSide;state='SWEEP_RECLAIM';
  }else if(domPreMove){
    side=domBiasSide;state='DOM_PRE_MOVE';
  }else if(trap!=='NONE'){
    state='WATCH';
  }else if(compressed||domBiasSide!=='WAIT'){
    state='WATCH';
  }
  const evidence:string[]=[];
  const warnings:string[]=[];
  if(highs>=2)evidence.push('تكدس قمم متقاربة أعلى النطاق');
  if(lows>=2)evidence.push('تكدس قيعان متقاربة أسفل النطاق');
  if(trap==='LOWER_SWEEP')evidence.push('سحب قاع ثم إغلاق فوق مستوى السيولة');
  if(trap==='UPPER_SWEEP')evidence.push('سحب قمة ثم إغلاق تحت مستوى السيولة');
  if(compressed)evidence.push('انضغاط نطاق آخر 10 شموع');
  if(domPreMove)evidence.push('ضغط DOM الوسيط ثابت والسعر لم ينطلق بعد');
  else if(domAligned)evidence.push('ضغط DOM الوسيط يوافق انعكاس الشموع');
  if(ambiguous)warnings.push('تم مسح جانبي النطاق؛ الاتجاه غير محسوم');
  if(h4!=='WAIT'&&side!=='WAIT'&&h4!==side){
    warnings.push('اتجاه H4 معاكس؛ تمت معاقبة قوة الإشارة');
  }
  if(!dom)warnings.push('لا يوجد دفتر أوامر MT5 حي؛ امتصاص/فخ من الشموع فقط وليس أوامر فعلية');
  else warnings.push('DOM خاص بوسيط MT5؛ ليس دفتر أوامر الذهب العالمي');
  if(/proxy|futures|basis-aligned|COMEX/i.test(input.candleSource||'')){
    warnings.push('مستويات مشتقة من مصدر شموع بديل؛ لا تُعامل كسعر تنفيذ');
  }
  const level=trap==='LOWER_SWEEP'?lo:trap==='UPPER_SWEEP'?hi:null;
  const extreme=trap==='LOWER_SWEEP'?minLow:trap==='UPPER_SWEEP'?maxHigh:null;
  const opposing=side==='BUY'?hi:side==='SELL'?lo:null;
  const target=opposing!=null&&(side==='BUY'?opposing>price+a*.2:opposing<price-a*.2)?
    round(opposing):null;
  const invalidate=side==='BUY'?
    round(trap==='LOWER_SWEEP'?minLow-a*.12:lo-a*.12):
    side==='SELL'?round(trap==='UPPER_SWEEP'?maxHigh+a*.12:hi+a*.12):null;
  const trigger=side==='BUY'?round(hi+a*.03):side==='SELL'?round(lo-a*.03):null;
  let score=0;
  if(side!=='WAIT'){
    score=state==='SWEEP_RECLAIM'?49:44;
    score+=Math.min(12,Math.round(wick*18));
    score+=sameClose?7:0;
    score+=Math.min(8,(side==='BUY'?lows:highs)*2);
    score+=domAligned||domPreMove?12:0;
    score+=h4===side?5:h4!=='WAIT'?-14:0;
    if(!target)score-=18;
    if(dom&&domSide!=='WAIT'&&domSide!==side)score-=13;
    score=clamp(Math.round(score),0,89);
    if(score<52||!target){side='WAIT';state='WATCH';}
  }
  const rationale=state==='SWEEP_RECLAIM'?
    'فخ سيولة مرصود: تم مسح مستوى ثم عاد الإغلاق داخل النطاق؛ ننتظر تأكيد استمرار الحركة.':
    state==='DOM_PRE_MOVE'?
      'ضغط أوامر الوسيط مع نطاق مضغوط؛ احتمال تحرك مبكر مشروط بتأكيد الكسر.':
      state==='WATCH'?'منطقة مراقبة فقط؛ لا يوجد اتجاه مؤكد أو هدف صالح بعد.':
        'لا توجد مصيدة سيولة مكتملة حاليًا.';
  return {
    ok:true,state,side,score:side==='WAIT'?Math.min(score,49):score,
    source:dom?'MT5_BROKER_DOM':'CANDLE_PROXY',
    sourceLabel:dom?'MT5 · عمق وسيط':'XAUUSD · شموع مغلقة',
    candleAt:last.time+60000,quoteAt,
    upperLiquidity:round(hi),lowerLiquidity:round(lo),
    sweepLevel:state==='SWEEP_RECLAIM'?round(level):null,
    sweepExtreme:state==='SWEEP_RECLAIM'?round(extreme):null,
    target:side==='WAIT'?null:target,invalidation:side==='WAIT'?null:invalidate,
    trigger:side==='WAIT'?null:trigger,
    trap, rationale,evidence:evidence.slice(0,5),warnings
  };
}
