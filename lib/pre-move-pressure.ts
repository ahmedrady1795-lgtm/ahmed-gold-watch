import type {Candle} from './engine';

/**
 * PREMOVE V1: causal, lightweight pre-expansion monitor.
 *
 * All signals use CLOSED M1/M5 candles only. No current forming candle,
 * future outcome, interpolated volume or implied institutional order flow.
 * Its readiness score is NOT a backtested win probability or a trade entry.
 */
type Side='BUY'|'SELL'|'WAIT';
type Stage='OFFLINE'|'OBSERVE'|'BUILDING'|'ARMED'|'RELEASED'|'REJECTED';
type FrameSide='BUY'|'SELL'|'WAIT';
export type PreMovePressure={
  ok:boolean;asset:'GOLD'|'BTC';stage:Stage;side:Side;readiness:number;
  sourceAt:number;ageMs:number;closedBars:number;
  trigger:number|null;invalidation:number|null;
  range:{low:number;high:number;widthAtr:number}|null;
  compression:number;pressure:number;sweep:'LOWER'|'UPPER'|'NONE';
  m5Side:FrameSide;h4Side:FrameSide;volumeBasis:'REAL'|'TICK'|'NONE';
  evidence:string[];reason:string;status:'CONDITIONAL_WATCH'|'NOT_READY'|'STALE';
};
const cap=(x:number,lo=0,hi=100)=>Math.max(lo,Math.min(hi,x));
const num=(v:any)=>Number(v);
const valid=(c:any)=>[c?.time,c?.open,c?.high,c?.low,c?.close].every((v:any)=>v!=null&&Number.isFinite(num(v)))&&
  c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.high>=c.low&&c.low>0;
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const side=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const format=(p:number)=>Number(p.toFixed(6));
function closed(rows:Candle[],now:number,periodMs:number){
  const sorted=(Array.isArray(rows)?rows:[]).filter(valid)
    .filter(x=>Number(x.time)>0&&Number(x.time)+periodMs<=now)
    .sort((a,b)=>a.time-b.time);
  const unique:Candle[]=[];
  for(const row of sorted){
    if(unique.length&&unique.at(-1)!.time===row.time)unique[unique.length-1]=row;
    else unique.push(row);
  }
  return unique;
}
function trueRange(rows:Candle[]){
  return rows.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-rows[i].close),Math.abs(x.low-rows[i].close)));
}
export function detectPreMovePressure(args:{
  asset:'GOLD'|'BTC';c1:Candle[];c5:Candle[];now:number;h4?:any
}):PreMovePressure{
  const now=num(args.now);
  const m1=closed(args.c1,now,60000).slice(-90);
  const m5=closed(args.c5,now,300000).slice(-25);
  const last=m1.at(-1);
  const sourceAt=last?Number(last.time)+60000:0;
  const ageMs=sourceAt?now-sourceAt:Infinity;
  const empty=(reason:string,stage:Stage='OFFLINE'):PreMovePressure=>({
    ok:false,asset:args.asset,stage,side:'WAIT',readiness:0,sourceAt,
    ageMs:Number.isFinite(ageMs)?ageMs:-1,closedBars:m1.length,
    trigger:null,invalidation:null,range:null,compression:0,pressure:0,
    sweep:'NONE',m5Side:'WAIT',h4Side:side(args.h4?.side),volumeBasis:'NONE',
    evidence:[],reason,status:'STALE'
  });
  if(!Number.isFinite(now)||now<=0||m1.length<55||m5.length<9)
    return empty('شموع M1/M5 المغلقة غير كافية لرصد التهيئة المبكرة.');
  if(ageMs<0||ageMs>180000||now-(m5.at(-1)!.time+300000)>900000)
    return empty('شموع السوق متأخرة؛ لا نعرض ضغطًا سعريًا على أنه إشارة حية.');
  if(m1.slice(-25).some((v,i,arr)=>i>0&&v.time-arr[i-1].time!==60000))
    return empty('توجد فجوات في سجل M1؛ تم إيقاف رصد الضغط.');
  if(m5.slice(-8).some((v,i,arr)=>i>0&&v.time-arr[i-1].time!==300000))
    return empty('توجد فجوات في سجل M5؛ تأكيد الإطار الأعلى غير موثوق.');

  const baseline=m1.slice(-48,-16);
  const box=m1.slice(-14,-2);
  const lastTwo=m1.slice(-2);
  const baseTR=trueRange(baseline);
  const atr=avg(baseTR.slice(-24));
  if(!Number.isFinite(atr)||atr<=0)return empty('تذبذب البيانات غير صالح.');
  const baseRange=avg(baseline.map(x=>x.high-x.low));
  const boxRange=avg(box.map(x=>x.high-x.low));
  const ratio=boxRange/Math.max(atr*.2,baseRange,1e-9);
  const high=Math.max(...box.map(x=>x.high)),low=Math.min(...box.map(x=>x.low));
  const width=high-low,widthAtr=width/atr;
  const compression=Math.round(cap((1.08-ratio)/.60*100,0,100));
  const compact=ratio<=.86&&widthAtr<=3.8;
  const boxPips=width>0?width:atr;
  const margin=Math.max(atr*.09,Number(last!.close)*.000008);
  const upperTrigger=high+margin,lowerTrigger=low-margin;
  const latest=lastTwo.at(-1)!;
  const lastClose=latest.close;
  const brokenUp=lastClose>upperTrigger,brokenDown=lastClose<lowerTrigger;
  const prior=m1.slice(-26,-2),priorHigh=Math.max(...prior.map(x=>x.high)),priorLow=Math.min(...prior.map(x=>x.low));
  const sweepLow=lastTwo.some(x=>x.low<priorLow-atr*.025)&&lastClose>priorLow+atr*.015;
  const sweepHigh=lastTwo.some(x=>x.high>priorHigh+atr*.025)&&lastClose<priorHigh-atr*.015;
  const sweep:PreMovePressure['sweep']=sweepLow&&!sweepHigh?'LOWER':sweepHigh&&!sweepLow?'UPPER':'NONE';

  const prev=m1.slice(-7,-4),recent=m1.slice(-4,-1);
  const avgLowDelta=avg(recent.map(x=>x.low))-avg(prev.map(x=>x.low));
  const avgHighDelta=avg(recent.map(x=>x.high))-avg(prev.map(x=>x.high));
  const lastFive=m1.slice(-5);
  const clv=avg(lastFive.map(x=>(2*x.close-x.high-x.low)/Math.max(1e-9,x.high-x.low)));
  const bodies=avg(lastFive.map(x=>(x.close-x.open)/atr));
  const quiet=lastTwo.every(x=>Math.abs(x.close-x.open)<=atr*.68)&&
    Math.abs(lastTwo[1].close-lastTwo[0].close)<=atr*.65;
  const upward=clv>.22&&bodies>.035&&avgLowDelta>atr*.018;
  const downward=clv<-.22&&bodies<-.035&&avgHighDelta< -atr*.018;
  const upperPressure=cap((clv-.08)*95+(bodies-.015)*46+avgLowDelta/atr*35,0,90);
  const lowerPressure=cap((-clv-.08)*95+(-bodies-.015)*46-avgHighDelta/atr*35,0,90);

  const m5Net=m5.at(-1)!.close-m5.at(-3)!.close;
  const m5Atr=avg(trueRange(m5.slice(-12)));
  const m5Side:FrameSide=Math.abs(m5Net)<Math.max(atr*.18,m5Atr*.12)?'WAIT':m5Net>0?'BUY':'SELL';
  const h4Side=side(args.h4?.ok?args.h4?.side:'WAIT');
  const volumeBasis:PreMovePressure['volumeBasis']=lastFive.some(x=>Number(x.realVolume)>0)?'REAL':
    lastFive.some(x=>Number(x.tickVolume)>0)?'TICK':'NONE';
  let selected:Side='WAIT';
  if(sweepLow)selected='BUY';
  else if(sweepHigh)selected='SELL';
  else if(upward&&!downward)selected='BUY';
  else if(downward&&!upward)selected='SELL';
  const rawPressure=selected==='BUY'?upperPressure:selected==='SELL'?lowerPressure:0;
  const m5Opposed=selected!=='WAIT'&&m5Side!=='WAIT'&&m5Side!==selected;
  const h4Opposed=selected!=='WAIT'&&h4Side!=='WAIT'&&h4Side!==selected&&Number(args.h4?.confidence||0)>=62;
  const released=selected==='BUY'?brokenUp:selected==='SELL'?brokenDown:false;
  const rejected=selected==='BUY'?brokenDown:selected==='SELL'?brokenUp:false;
  const validPressure=selected!=='WAIT'&&(compact||sweep!=='NONE')&&rawPressure>=27;
  const readiness=Math.round(cap((compact?compression*.46:0)+rawPressure*.35+
    (sweep!=='NONE'?22:0)+(m5Side===selected?9:0)+(h4Side===selected?5:0)-
    (m5Opposed?18:0)-(h4Opposed?13:0)-(quiet?0:16),0,84));
  const eligible=validPressure&&!m5Opposed&&!h4Opposed&&quiet&&!released&&!rejected;
  const stage:Stage=rejected?'REJECTED':released?'RELEASED':
    eligible&&readiness>=61?'ARMED':
    validPressure&&readiness>=43?'BUILDING':'OBSERVE';
  const active=(stage==='ARMED'||stage==='BUILDING')&&selected!=='WAIT';
  const evidence:string[]=[];
  if(compact)evidence.push('ضغط سعري مرصود من شموع M1 المغلقة');
  if(sweepLow)evidence.push('كسر وهمي أسفل نطاق سابق ثم استرداد الإغلاق');
  if(sweepHigh)evidence.push('كسر وهمي أعلى نطاق سابق ثم استرداد الإغلاق');
  if(upward)evidence.push('ارتفاع قيعان قصيرة مع إغلاقات تميل لأعلى');
  if(downward)evidence.push('انخفاض قمم قصيرة مع إغلاقات تميل لأسفل');
  if(quiet)evidence.push('لم تظهر شمعة اندفاع كبيرة بعد');
  if(m5Side===selected)evidence.push('M5 يدعم اتجاه الضغط');
  if(m5Opposed)evidence.push('M5 يعارض السيناريو');
  if(h4Opposed)evidence.push('H4 القوي يعارض السيناريو');
  const reason=stage==='ARMED'?'تهيئة سعرية مرصودة قبل تجاوز مستوى التفعيل؛ يلزم كسر مؤكد.':
    stage==='BUILDING'?'الضغط يتكون لكنه لم يجتز كل شروط التأكيد.':
    stage==='RELEASED'?'كُسر نطاق الضغط بالفعل؛ لم تعد هذه حركة سابقة للانطلاق.':
    stage==='REJECTED'?'السعر اخترق عكس اتجاه الضغط؛ أُلغي السيناريو.':
    'لا توجد دلائل مغلقة كافية لترجيح اتجاه الحركة المقبلة.';
  return {
    ok:true,asset:args.asset,stage,side:active?selected:'WAIT',
    readiness:active?Math.min(readiness,68):Math.min(readiness,48),
    sourceAt,ageMs,closedBars:m1.length,
    trigger:active?format(selected==='BUY'?upperTrigger:lowerTrigger):null,
    invalidation:active?format(selected==='BUY'?low-margin:high+margin):null,
    range:{low:format(low),high:format(high),widthAtr:Number(widthAtr.toFixed(2))},
    compression,pressure:Math.round(rawPressure),sweep,m5Side,h4Side,volumeBasis,
    evidence:evidence.slice(0,5),reason,
    status:active?'CONDITIONAL_WATCH':'NOT_READY'
  };
}
