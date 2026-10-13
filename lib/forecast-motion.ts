import type {DecisionSide} from './sniper-decision-guide';

export type MotionPoint={
  key:string;price:number;label:string;
  kind:'START'|'BREAK'|'HOLD'|'RETEST'|'SWEEP'|'RECLAIM'|'TARGET'
};
type M5Bar={time:number;open:number;high:number;low:number;close:number};
type LiquidityPool={low:number;high:number;center:number;side:'LOWER'|'UPPER'};

// Illustration only. Server targets and the invalidation are never changed.
// A retest/sweep is a conditional route based on past closed candles and observed
// price zones, NOT a prediction of future candle shapes or arrival times.
const safe=(x:unknown):number|null=>
  x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const nprice=(x:unknown):number|null=>{
  const v=safe(x);return v!=null&&v>0?v:null;
};
function recentM5(rows:unknown,now:unknown){
  const at=safe(now);
  if(!Array.isArray(rows)||at==null||at<=0)return [] as M5Bar[];
  const seen=new Map<number,M5Bar>();
  for(const x of rows){
    const time=safe(x?.time),open=nprice(x?.open),high=nprice(x?.high),
      low=nprice(x?.low),close=nprice(x?.close);
    if(time==null||time<=0||time%300000!==0||time+300000>at||
      open==null||high==null||low==null||close==null||
      high<Math.max(open,close)||low>Math.min(open,close))continue;
    seen.set(time,{time,open,high,low,close});
  }
  const candles=[...seen.values()].sort((a,b)=>a.time-b.time).slice(-32);
  if(candles.length<18||at-(candles.at(-1)!.time+300000)>13*60000||
    candles.slice(-18).some((c,i,arr)=>i>0&&c.time-arr[i-1].time!==300000))return [];
  return candles;
}
function atrM5(rows:M5Bar[]){
  const slice=rows.slice(-15);
  if(slice.length<15)return null;
  const tr=slice.slice(1).map((c,i)=>Math.max(c.high-c.low,
    Math.abs(c.high-slice[i].close),Math.abs(c.low-slice[i].close)));
  const result=tr.reduce((a,b)=>a+b,0)/tr.length;
  return Number.isFinite(result)&&result>0?result:null;
}
function nearestRetestZone(
  level:number,side:DecisionSide,atr:number,zones:unknown
):number|null{
  if(!Array.isArray(zones))return null;
  const desired=side==='BUY'?['DEMAND','BUY_REBOUND']:['SUPPLY','SELL_REBOUND'];
  const matches=zones.filter(z=>desired.includes(String(z?.kind||'')))
    .map(z=>({low:nprice(z.low),high:nprice(z.high)}))
    .filter(z=>z.low!=null&&z.high!=null&&z.high>=z.low&&
      level>=z.low-atr*.30&&level<=z.high+atr*.30)
    .sort((a,b)=>Math.abs((a.low!+a.high!)*.5-level)-
      Math.abs((b.low!+b.high!)*.5-level));
  const nearest=matches[0];
  if(!nearest)return null;
  // A demand/supply boundary, not an invented retest at the price of a target.
  return side==='BUY'?nearest.high!:nearest.low!;
}
export function buildForecastMotion(input:{
  visible:boolean;side:DecisionSide;price:number|null;
  targets:Array<{stage:number;price:number}>;
  breakout:{ready:boolean;trigger:number|null;confirmed:boolean;extension?:number|null};
  now?:number;m5?:unknown;zones?:unknown;preMove?:any;liquidity?:{
    ready?:boolean;phaseKind?:string;atr?:number|null;upper?:LiquidityPool|null;lower?:LiquidityPool|null
  };invalidation?:number|null
}):MotionPoint[]{
  const {visible,side,price,targets,breakout}=input;
  if(!visible||side==='WAIT'||price==null||!Number.isFinite(price)||price<=0)
    return [];
  const sign=side==='BUY'?1:-1;
  if(!targets.length||targets.some((t,i)=>!Number.isFinite(t.price)||t.price<=0||
    sign*(t.price-price)<=0||(i>0&&sign*(t.price-targets[i-1].price)<=0)))return [];

  const points:MotionPoint[]=[{key:'START',price,label:'السعر الحالي',kind:'START'}];
  const goal=targets[0].price,firstDistance=sign*(goal-price);
  const hist=recentM5(input.m5,input.now);
  const atr=atrM5(hist)??(input.m5==null?nprice(input.liquidity?.atr):null)??null;
  const freshness=hist.length>=18;
  const lastTwo=freshness?hist.slice(-2):[];
  const impulse=atr!=null&&lastTwo.some(c=>Math.abs(c.close-c.open)>atr*.95);
  const bands=hist.slice(-15,-2);
  const referenceRange=bands.length?Math.max(...bands.map(c=>c.high))-Math.min(...bands.map(c=>c.low)):null;
  const previous=hist.slice(-28,-15);
  const previousRange=previous.length?previous.reduce((a,c)=>a+c.high-c.low,0)/previous.length:null;
  const recentRange=bands.length?bands.reduce((a,c)=>a+c.high-c.low,0)/bands.length:null;
  const compression=freshness&&previousRange!=null&&previousRange>0&&recentRange!=null&&
    recentRange/previousRange<=.85;
  const pre=input.preMove;
  const preFresh=Boolean(pre?.ok&&Number(pre?.sourceAt)>0&&Number.isFinite(Number(input.now))&&
    Number(input.now)-Number(pre.sourceAt)>=0&&Number(input.now)-Number(pre.sourceAt)<=180000&&
    (pre.side===side));
  const pressureSetup=Boolean(preFresh&&['ARMED','BUILDING'].includes(String(pre?.stage)));
  const stop=nprice(input.invalidation);
  const safeBeforeStop=(p:number)=>stop==null||sign*(p-stop)>(atr??Math.abs(price)*.00001)*.05;
  const targetSafe=(p:number)=>sign*(goal-p)>0;

  const level=nprice(breakout?.trigger);
  const usable=Boolean(breakout?.ready&&level!=null&&targetSafe(level));
  const extension=nprice(breakout?.extension)??(atr!=null?atr*.3:null);

  // A POSSIBLE sweep only when a real historical liquidity boundary is
  // nearby, a pressure setup is live, the sweep has not already occurred,
  // and it cannot cross the server invalidation.
  const pool=side==='BUY'?input.liquidity?.lower:input.liquidity?.upper;
  const sweepPrice=side==='BUY'?nprice(pool?.low):nprice(pool?.high);
  const sweepCompatible=side==='BUY'?input.liquidity?.phaseKind==='ACCUMULATION':
    input.liquidity?.phaseKind==='DISTRIBUTION';
  const pendingSweep=Boolean(freshness&&atr!=null&&input.liquidity?.ready&&
    pressureSetup&&pre.stage==='BUILDING'&&pre.sweep==='NONE'&&
    sweepCompatible&&sweepPrice!=null&&sign*(price-sweepPrice)>atr*.13&&
    sign*(price-sweepPrice)<atr*1.4&&safeBeforeStop(sweepPrice!)&&
    (!usable||sign*(goal-sweepPrice!)>0)&&!impulse);
  if(pendingSweep&&sweepPrice!=null){
    points.push({key:'SWEEP',price:sweepPrice,
      label:side==='BUY'?'احتمال سحب سيولة أسفل القاع':'احتمال سحب سيولة أعلى القمة',kind:'SWEEP'});
    points.push({key:'RECLAIM',price,
      label:'العودة المشروطة داخل النطاق',kind:'RECLAIM'});
  }

  if(usable&&level!=null){
    const ahead=sign*(level-price)>=0;
    const alreadyBeyond=sign*(price-level)>0;
    const distance=atr!=null?Math.abs(price-level)/atr:0;
    const farBeyond=Boolean(freshness&&atr!=null&&alreadyBeyond&&distance>1.6);
    const retestZone=atr!=null?nearestRetestZone(level,side,atr,input.zones):null;
    const retest=retestZone!=null&&safeBeforeStop(retestZone)&&targetSafe(retestZone)?
      retestZone:level;
    const structuralSetup=Boolean(!freshness||compression||pressureSetup||
      retestZone!=null||referenceRange!=null&&atr!=null&&referenceRange/atr<=3.3);
    const retestAllowed=structuralSetup&&!farBeyond&&!impulse&&!pendingSweep&&
      safeBeforeStop(retest)&&targetSafe(retest);

    if(!breakout.confirmed&&ahead){
      points.push({key:'BREAK',price:level,label:'اختراق مشروط لمستوى الكسر',kind:'BREAK'});
      if(retestAllowed&&extension!=null&&extension>0){
        const holdDistance=Math.min(extension,Math.abs(goal-level)*.33);
        const hold=level+sign*holdDistance;
        if(holdDistance>(atr??holdDistance)*.04&&sign*(hold-retest)>(atr??holdDistance)*.08&&
          targetSafe(hold)){
          points.push({key:'HOLD',price:hold,label:'امتداد مبدئي بعد الكسر',kind:'HOLD'});
          points.push({key:'RETEST',price:retest,
            label:'رجوع محتمل لاختبار '+(retestZone!=null?'منطقة العرض/الطلب':'خط الكسر'),
            kind:'RETEST'});
        }
      }
    }else if(breakout.confirmed&&alreadyBeyond&&retestAllowed&&
      (atr==null||distance>=.07)&&sign*(price-retest)>0){
      points.push({key:'RETEST',price:retest,
        label:'إعادة اختبار محتملة بعد الكسر المؤكد',kind:'RETEST'});
    }
  }

  points.push(...targets.map(t=>({key:'TP'+t.stage,price:t.price,
    label:'هدف '+t.stage,kind:'TARGET' as const})));
  return points;
}
