import type {ScalpPlan,ScalpQuote} from './scalp-opportunities';

export type ScalpEntryGateCode=
  'NO_SETUP'|'SETUP_QUALITY'|'TARGET_REACH'|'COST_UNVIABLE'|'STOP_OR_RISK'|
  'SCENARIO_ONLY'|'AWAITING_M1_CONFIRMATION'|'QUOTE_STALE'|'BAD_GEOMETRY'|
  'ENTRY_DRIFT'|'NET_REWARD_TOO_LOW'|'READY';
export type ScalpEntryAudit={
  approved:boolean;code:ScalpEntryGateCode;group:'SETUP'|'CONFIRMATION'|'FEED'|'COST'|'PRICE'|'RISK'|'APPROVED';
  reason:string;liveNetRR:number|null;distanceInRisk:number|null;
  costShareOfRiskPct:number|null;costEstimated:boolean;
};
const round=(v:number)=>Number(v.toFixed(2));
const result=(plan:ScalpPlan,code:ScalpEntryGateCode,group:ScalpEntryAudit['group'],reason:string,
  rr:number|null=null,distance:number|null=null,share:number|null=null):ScalpEntryAudit=>({
    approved:code==='READY',code,group,reason,
    liveNetRR:rr==null?null:round(rr),
    distanceInRisk:distance==null?null:round(distance),
    costShareOfRiskPct:share==null?null:round(share),
    costEstimated:plan.costEstimated
  });
function classifiedBlocker(plan:ScalpPlan){
  const b=plan.blockers[0]||plan.reason||'الشروط الفنية غير مكتملة';
  if(plan.blockers.some(x=>/التكلفة|سبريد|رسوم/.test(x)))
    return result(plan,'COST_UNVIABLE','COST','تكلفة التنفيذ غير مناسبة للتذبذب المتوقع؛ '+b);
  if(plan.blockers.some(x=>/الهدف أبعد|الحركة المواتية/.test(x)))
    return result(plan,'TARGET_REACH','RISK','الهدف غير مدعوم بالحركة التاريخية التالية للدخول؛ '+b);
  if(plan.blockers.some(x=>/الوقف|العائد بعد التكلفة/.test(x)))
    return result(plan,'STOP_OR_RISK','RISK',b);
  return result(plan,'SETUP_QUALITY','SETUP',b);
}
// The independently observed liquidity scenario is NOT a plan-specific hold.
// All geometry and cost checks refer to the actual CURRENT quote, not a
// stale theoretical entry or an unexecuted limit order.
// A candidate rejected by cost cannot be revived by confirmation alone.
export function auditScalpEntry(
  plan:ScalpPlan,quote:ScalpQuote,now:number,
  planHoldState:string|null,scenarioConfirmed=false
):ScalpEntryAudit{
  if(plan.status!=='ARMED'){
    if(plan.side==='WAIT'||plan.entry==null||plan.stop==null)
      return result(plan,'NO_SETUP','SETUP','لا توجد خطة سعرية مؤهلة حاليًا');
    return classifiedBlocker(plan);
  }
  if(!planHoldState){
    return result(plan,'SCENARIO_ONLY','CONFIRMATION',scenarioConfirmed?
      'تأكد سيناريو السيولة فقط؛ لم يثبت سعر دخول الخطة نفسها':
      'الإعداد مؤهل مبدئيًا لكن مراقبة مستوى الدخول لم تبدأ');
  }
  if(planHoldState!=='CONFIRMED'&&planHoldState!=='RETEST_READY')
    return result(plan,'AWAITING_M1_CONFIRMATION','CONFIRMATION',
      'ينتظر إغلاق M1 مؤيدًا ومستوى دخول ثابتًا بأسعار متجددة');
  const at=quote.at,price=quote.price;
  if(at==null||price==null||!Number.isFinite(now)||!Number.isFinite(at)||
     !Number.isFinite(price)||price<=0||now-at<0||now-at>10000)
    return result(plan,'QUOTE_STALE','FEED','السعر المرجعي غير حديث؛ تأكيد سابق لا يكفي للدخول');
  const entry=plan.entry,stop=plan.stop,target=plan.targets[0]?.price,cost=plan.cost;
  // NaN targets and infinities do not satisfy numerical <= comparisons, so
  // they MUST be rejected explicitly. Otherwise a mathematically impossible
  // plan can fall through to READY after a confirmed observation.
  if(plan.side!=='BUY'&&plan.side!=='SELL')return result(plan,'BAD_GEOMETRY','RISK','اتجاه الخطة غير صالح');
  if(entry==null||stop==null||target==null||
     ![entry,stop,target,cost,Number(plan.netRR)].every(Number.isFinite)||
     entry<=0||stop<=0||target<=0||cost<0)
    return result(plan,'BAD_GEOMETRY','RISK','مستويات الدخول أو الوقف أو الهدف غير صالحة');
  const dir=plan.side==='BUY'?1:-1;
  const anchorRisk=dir*(entry-stop),anchorReward=dir*(target-entry);
  const liveRisk=dir*(price-stop),liveReward=dir*(target-price);
  const share=liveRisk>0?cost/(liveRisk+cost)*100:null;
  const distance=anchorRisk>0?Math.abs(price-entry)/anchorRisk:null;
  const liveNetRR=liveRisk>0&&(liveRisk+cost)>0?(liveReward-cost)/(liveRisk+cost):null;
  if(anchorRisk<=0||anchorReward<=0||liveRisk<=0||liveReward<=0)
    return result(plan,'BAD_GEOMETRY','RISK','وقف الخسارة أو الهدف في الجهة الخاطئة من سعر التنفيذ',
      liveNetRR,distance,share);
  const maxDistance=planHoldState==='RETEST_READY'?.12:.35;
  if(distance==null||distance>maxDistance)
    return result(plan,'ENTRY_DRIFT','PRICE',
      'الاختراق تأكد لكن سعر التنفيذ ابتعد عن الدخول؛ انتظر إعادة اختبار آمنة',
      liveNetRR,distance,share);
  if(liveNetRR==null||!Number.isFinite(liveNetRR)||
     liveNetRR<1.25||Number(plan.netRR)<1.25)
    return result(plan,'NET_REWARD_TOO_LOW','COST',
      'العائد الصافي الفعلي أقل من 1.25R عند السعر الحالي؛ تكلفة/سعر التنفيذ لا يبرران الدخول',
      liveNetRR,distance,share);
  return result(plan,'READY','APPROVED','إشارة دخول ورقية مستوفية لتأكيد المستوى والتكلفة والوقف',
    liveNetRR,distance,share);
}
