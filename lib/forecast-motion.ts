import type {DecisionSide} from './sniper-decision-guide';

export type MotionPoint={key:string;price:number;label:string;kind:'START'|'BREAK'|'HOLD'|'RETEST'|'TARGET'};

// Presentation only: steps share the server's targets and the closed-M5 guide.
// This path never qualifies a trade, adds a stop, or predicts arrival times.
export function buildForecastMotion(input:{
  visible:boolean;side:DecisionSide;price:number|null;
  targets:Array<{stage:number;price:number}>;
  breakout:{ready:boolean;trigger:number|null;confirmed:boolean;extension?:number|null};
}){
  const {visible,side,price,targets,breakout}=input;
  if(!visible||side==='WAIT'||price==null||!Number.isFinite(price)||price<=0)return [] as MotionPoint[];
  const sign=side==='BUY'?1:-1;
  if(!targets.length||targets.some((t,i)=>!Number.isFinite(t.price)||t.price<=0||
    sign*(t.price-price)<=0||(i>0&&sign*(t.price-targets[i-1].price)<=0)))return [] as MotionPoint[];
  const points:MotionPoint[]=[{key:'START',price,label:'بداية',kind:'START'}];
  const trigger=breakout.trigger;
  // Do not draw a fresh breakout behind price, or beyond the first objective.
  const usable=breakout.ready&&trigger!=null&&Number.isFinite(trigger)&&trigger>0&&
    sign*(targets[0].price-trigger)>0;
  if(usable){
    if(!breakout.confirmed&&sign*(trigger-price)>=0){
      points.push({key:'BREAK',price:trigger,label:'تفعيل مشروط',kind:'BREAK'});
      const extension=breakout.extension;
      if(extension!=null&&Number.isFinite(extension)&&extension>0){
        const hold=trigger+sign*Math.min(extension,Math.abs(targets[0].price-trigger)*.3);
        points.push({key:'HOLD',price:hold,label:'ثبات محتمل',kind:'HOLD'});
        points.push({key:'RETEST',price:trigger,label:'إعادة اختبار محتملة',kind:'RETEST'});
      }
    }else if(breakout.confirmed&&sign*(price-trigger)>0){
      points.push({key:'RETEST',price:trigger,label:'إعادة اختبار محتملة',kind:'RETEST'});
    }
  }
  points.push(...targets.map(t=>({key:'TP'+t.stage,price:t.price,label:'هدف '+t.stage,kind:'TARGET' as const})));
  return points;
}
