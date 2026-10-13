/**
 * Independent-family quality gate for the 15-minute *forecast*, not an order.
 * Several indicators calculated from the same candles are ONE evidence family.
 * Agreement is a technical score, never a measured probability of profit.
 */
export type ForecastSide='BUY'|'SELL'|'WAIT';
export type ForwardVote={name:string;side:ForecastSide;score:number;weight:number};
type Family='price_structure'|'liquidity'|'fast_flow'|'external';
const familyOf=(name:string):Family=>{
  if(['M5','M15','H4','structure','path','pre-move'].includes(name))return 'price_structure';
  if(['liquidity','accumulation','intent'].includes(name))return 'liquidity';
  if(name==='tool mesh')return 'external';
  return 'fast_flow';
};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const finite=(x:any):number|null=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
export function assessForwardEvidence(input:{
  side:ForecastSide;votes:ForwardVote[];historicalDirectional:number;
  oosN:number;oosAccuracy:number|null;walkStatus?:string;driftStatus?:string;
}){
  const groups:Record<Family,{buy:number;sell:number}>={
    price_structure:{buy:0,sell:0},liquidity:{buy:0,sell:0},
    fast_flow:{buy:0,sell:0},external:{buy:0,sell:0}
  };
  for(const v of input.votes){
    if(!['BUY','SELL'].includes(v.side)||!Number.isFinite(v.score)||!Number.isFinite(v.weight)||
      v.score<35||v.weight<.15)continue;
    const row=groups[familyOf(v.name)];
    const power=clamp(v.score,0,92)*clamp(v.weight,0,2);
    if(v.side==='BUY')row.buy+=power;else row.sell+=power;
  }
  const familyBreakdown=Object.fromEntries(Object.entries(groups).map(([name,v])=>{
    const total=v.buy+v.sell,edge=total?Math.abs(v.buy-v.sell)/total:0;
    const minimum=name==='external'?22:name==='fast_flow'?26:35;
    const dominant=total>=minimum&&edge>=.22?(v.buy>v.sell?'BUY':'SELL'):'WAIT';
    return [name,{side:dominant,edgePct:Math.round(edge*100),strength:Math.round(Math.min(100,Math.max(v.buy,v.sell)))}];
  })) as Record<Family,{side:ForecastSide;edgePct:number;strength:number}>;
  const side=input.side;
  const supporting=Object.values(familyBreakdown).filter(x=>side!=='WAIT'&&x.side===side).length;
  const opposing=Object.values(familyBreakdown).filter(x=>x.side!=='WAIT'&&x.side!==side).length;
  const independentReady=side!=='WAIT'&&supporting>=2&&opposing<2&&
    familyBreakdown.price_structure.side===side;

  const oosN=Math.max(0,Math.floor(finite(input.oosN)??0));
  const directional=Math.max(0,Math.floor(finite(input.historicalDirectional)??0));
  const accuracy=finite(input.oosAccuracy);
  const accuracyUsable=oosN>=10&&accuracy!=null&&accuracy>=0&&accuracy<=100;
  const status=String(input.walkStatus||'COLLECTING').toUpperCase();
  const drift=String(input.driftStatus||'COLLECTING').toUpperCase();
  // Insufficient evidence must *not* inherit an optimistic confidence from votes.
  let confidenceCap=68;
  let validation:'COLLECTING'|'WEAK'|'MONITOR'|'SUPPORTED'='COLLECTING';
  if(accuracyUsable){
    if(accuracy<50){
      validation='WEAK';
      confidenceCap=oosN>=25?49:54;
    }else if(accuracy<55||status==='WATCH'){
      validation='MONITOR';
      confidenceCap=64;
    }else if(oosN>=30&&directional>=40&&status==='PASS'){
      validation='SUPPORTED';
      confidenceCap=clamp(Math.round(accuracy+12),68,84);
    }else{
      validation='MONITOR';
      confidenceCap=72;
    }
    if(drift==='DEGRADING'||drift==='BREAKDOWN'){
      validation='WEAK';confidenceCap=Math.min(confidenceCap,52);
    }
  }
  if(!independentReady)confidenceCap=Math.min(confidenceCap,54);
  return {
    version:'INDEPENDENT_FAMILIES_OOS_V1',
    supporting,opposing,independentReady,familyBreakdown,
    validation,confidenceCap,oosN,oosAccuracy:accuracyUsable?accuracy:null,
    walkStatus:status,driftStatus:drift,
    reason:!independentReady?'لا يوجد اتفاق بين عائلتين مستقلتين على الأقل مع تأكيد الهيكل':
      validation==='WEAK'?'الأداء المستقل متراجع؛ تم خفض الثقة':
      validation==='COLLECTING'?'النتائج المستقلة غير كافية؛ ثقة مراقبة محدودة':
      validation==='SUPPORTED'?'اتفاق عائلات مختلف مع دعم تاريخي مستقل':
      'اتفاق فني موجود لكن إثبات الأداء المستقل لم يكتمل'
  };
}
