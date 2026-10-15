/** One auditable conservative decision, NEVER a broker execution authority.
 * Uses only completed candle evidence and the paper scalp plan; strength is
 * a technical ranking indicator, not a calibrated probability of profit.
 */
import type {ScalpPlan,ScalpQuote} from './scalp-opportunities';
import type {Candle} from './engine';
import {detectLiquiditySweeps,activeConfirmedSweep} from './liquidity-sweep';
import {detectDisplacementObFvg,activeStructureRetest} from './institutional-price-action';
import {requiredScalpNetR} from './scalp-risk-policy';

export const SNIPER_DECISION_VERSION='SNIPER-DECISION-V1';
export {requiredScalpNetR} from './scalp-risk-policy';
type GateResult='PASS'|'WAIT'|'FAIL';
export type SniperFactor={id:string;result:GateResult;reason:string};
export type SniperDecision={
  version:typeof SNIPER_DECISION_VERSION;status:'QUALIFIED_WATCH'|'WAIT'|'BLOCKED';
  side:'BUY'|'SELL'|'WAIT';setup:string;horizon:1|5;
  score:number;scoreBasis:'TECHNICAL_HEURISTIC_NOT_WIN_RATE';requiredNetR:number;
  liveNetR:number|null;checkedAt:number;factors:SniperFactor[];
  blockers:string[];note:string;executionAuthority:false;aiCertification:'SHADOW_UNQUALIFIED';
};
export function buildSniperDecision(input:{
  plan:ScalpPlan;quote:ScalpQuote;now:number;c1:readonly Candle[];
  c5:readonly Candle[];marketOpen:boolean;newsReady:boolean;
  externalBlockers?:readonly string[];
}):SniperDecision{
  const {plan,quote,now,c1,c5}=input,blocks:string[]=[],factors:SniperFactor[]=[];
  const factor=(id:string,result:GateResult,reason:string)=>{
    factors.push({id,result,reason});if(result==='FAIL')blocks.push(reason);
  };
  const side=plan.side==='BUY'||plan.side==='SELL'?plan.side:'WAIT';
  const direction=side==='BUY'?1:side==='SELL'?-1:0;
  const money=[quote.price,quote.at,plan.entry,plan.stop,plan.targets[0]?.price,plan.cost];
  const numbersValid=money.every(v=>v!=null&&Number.isFinite(Number(v)))&&
    Number(quote.price)>0&&Number(plan.entry)>0&&Number(plan.stop)>0&&
    Number(plan.targets[0]?.price)>0&&Number(plan.cost)>=0;
  const quoteOk=numbersValid&&Number(quote.at)<=now+1000&&
    now-Number(quote.at)>=0&&now-Number(quote.at)<=10000;
  factor('SOURCE',quoteOk?'PASS':'FAIL','السعر أو التوقيت غير حديث/غير صالح لتأهيل القنص');
  const frame=(rows:readonly Candle[],ms:number,maxAge:number)=>{
    if(!Array.isArray(rows))return false;
    const closed=rows.filter(c=>c&&c.time+ms<=now);
    if(closed.length<60)return false;
    const tail=closed.slice(-20);
    return tail.every((c,i)=>Number.isFinite(c.time)&&c.time%ms===0&&
      [c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&
      c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&
      (i===0||c.time-tail[i-1].time===ms))&&
      now-(tail.at(-1)!.time+ms)>=0&&now-(tail.at(-1)!.time+ms)<=maxAge;
  };
  const candlesOk=frame(c1,60000,90000)&&frame(c5,300000,330000);
  factor('CANDLES',candlesOk?'PASS':'FAIL','شموع M1/M5 المغلقة غير متصلة أو متأخرة');
  factor('SESSION',input.marketOpen?'PASS':'FAIL','الجلسة غير متاحة؛ انتظار فتح السوق');
  // An unavailable calendar is a visible uncertainty but is not itself a
  // fabricated high-impact event; an actual event veto is in the base plan.
  factor('NEWS',input.newsReady?'PASS':'WAIT','تغطية الأخبار غير مكتملة؛ تأكد من التقويم');
  const sourceSide=plan.evidence.find(e=>e.label==='اتجاه M1')?.side;
  const higherSide=plan.evidence.find(e=>e.label==='سياق M5')?.side;
  const trendOK=sourceSide===side&&higherSide===side;
  factor('TREND',direction===0?'WAIT':trendOK?'PASS':'WAIT',
    'اتجاه M1 وM5 غير متفق بالكامل مع خطة '+plan.setup);
  // These are supporting observations for general setups, not a requirement
  // that every breakout must happen after a sweep or an OB+FVG.
  const sweep=candlesOk?activeConfirmedSweep(detectLiquiditySweeps(c1,now),now,90000):null;
  if(plan.setup==='SWEEP')factor('SWEEP',
    sweep&&sweep.side===side?'PASS':'FAIL',
    'سحب السيولة يحتاج استرداد مستوى وتأكيد M1 مغلق حديث بنفس الاتجاه');
  else factor('SWEEP',sweep?(sweep.side===side?'PASS':'WAIT'):'WAIT',
    'سحب السيولة دليل مساعد، وليس شرطًا إلزاميًا لكل أنواع القنص');
  const pattern=candlesOk?activeStructureRetest(detectDisplacementObFvg(c1,now),now,90000):null;
  if(plan.setup==='OB_FVG')factor('OB_FVG',
    pattern&&pattern.id===plan.setupOriginId&&pattern.side===side?'PASS':'FAIL',
    'إعادة اختبار OB/FVG الأصلية غير مؤكدة أو انتهت/أُبطلت');
  else factor('OB_FVG',pattern?(pattern.side===side?'PASS':'WAIT'):'WAIT',
    'اندفاع BOS وOB/FVG دليل مساعد حين يوجد، وليس إشارة تنفيذ');
  const entry=Number(plan.entry),stop=Number(plan.stop),target=Number(plan.targets[0]?.price);
  const anchorRisk=direction*(entry-stop),anchorReward=direction*(target-entry);
  const liveRisk=direction*(Number(quote.price)-stop);
  const liveReward=direction*(target-Number(quote.price));
  const cost=Number(plan.cost);
  const liveNetR=numbersValid&&direction!==0&&liveRisk>0?
    (liveReward-cost)/(liveRisk+cost):null;
  const requiredNetR=requiredScalpNetR(plan);
  const geometry=numbersValid&&direction!==0&&anchorRisk>0&&anchorReward>0&&
    liveRisk>0&&liveReward>0;
  factor('GEOMETRY',geometry?'PASS':'FAIL','مستوى الدخول/الوقف/الهدف غير صالح عند السعر الحالي');
  const rrOK=geometry&&liveNetR!=null&&Number.isFinite(liveNetR)&&
    liveNetR>=requiredNetR&&(anchorReward-cost)/(anchorRisk+cost)>=requiredNetR;
  factor('NET_RR',rrOK?'PASS':'FAIL',
    'العائد بعد السبريد والرسوم والانزلاق أقل من '+requiredNetR.toFixed(2)+'R');
  const costShare=geometry?cost/(liveRisk+cost):Infinity;
  const costOK=Number.isFinite(costShare)&&costShare<=.32&&
    plan.costBreakdown!=null&&Number.isFinite(Number(plan.costBreakdown.spread));
  factor('COST',costOK?'PASS':'FAIL','تكلفة القنص عالية نسبةً للوقف أو مجهولة');
  // Never replace the original per-strategy vetoes: the decision is strictly
  // an additional final fail-closed gate.
  factor('ORIGINAL_PLAN',
    plan.status==='ARMED'&&plan.blockers.length===0?'PASS':'FAIL',
    plan.blockers[0]||'الاستراتيجية لم تجتز شروط التأهيل الأصلية');
  const external=input.externalBlockers?.filter(Boolean)||[];
  factor('MARKET_RISK',external.length?'FAIL':'PASS',
    external[0]||'لا توجد موانع سيولة/جودة إضافية');
  const hardPass=blocks.length===0;
  const status:SniperDecision['status']=hardPass?'QUALIFIED_WATCH':
    plan.status==='BLOCKED'||!quoteOk||!candlesOk?'BLOCKED':'WAIT';
  const score=Math.max(0,Math.min(100,Math.round(
    Number(plan.score||0)*.74+
    (trendOK?10:0)+(sweep?.side===side?5:0)+(pattern?.side===side?6:0)+
    (rrOK?5:0)-(hardPass?0:20)
  )));
  return {version:SNIPER_DECISION_VERSION,status,side,setup:plan.setup,
    horizon:plan.horizon,score,scoreBasis:'TECHNICAL_HEURISTIC_NOT_WIN_RATE',
    requiredNetR,liveNetR:liveNetR!=null&&Number.isFinite(liveNetR)?
      Number(liveNetR.toFixed(3)):null,checkedAt:now,factors,blockers:blocks,
    note:'تقييم فني ورقي، ليس احتمال ربح ولا إذنًا للتنفيذ الحقيقي.',
    executionAuthority:false,aiCertification:'SHADOW_UNQUALIFIED'};
}
