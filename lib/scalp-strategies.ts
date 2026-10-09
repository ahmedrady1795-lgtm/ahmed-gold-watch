// One auditable registry for every supported scalp strategy.
// Detect on CLOSED M1 candles; execution authorization remains with the
// per-plan spread, stop, reward, news and exact M1 entry-confirmation gates.
// A technical setup score is NOT an estimated win probability.
export type StrategyId='BREAKOUT'|'PULLBACK'|'SWEEP'|'CONTINUATION';
export type Direction='BUY'|'SELL'|'WAIT';
export type StrategyCandidate={side:'BUY'|'SELL';setup:StrategyId;triggerScore:number;anchor:number};
export type StrategyRank=StrategyCandidate&{score:number};
export type StrategyBar={open:number;high:number;low:number;close:number};
export const SCALP_STRATEGIES=[
  {id:'BREAKOUT',label:'اختراق نطاق',principle:'إغلاق خارج نطاق القمم أو القيعان مع زخم M1',family:'MOMENTUM'},
  {id:'PULLBACK',label:'إعادة اختبار',principle:'استئناف الاتجاه بعد اختبار EMA ومستوى الشمعة السابقة',family:'TREND'},
  {id:'CONTINUATION',label:'استمرار الاتجاه',principle:'شمعتان داعمتان وزخم متوافق مع M5',family:'TREND'},
  {id:'SWEEP',label:'سحب السيولة',principle:'اختراق كاذب ثم استعادة المستوى بشمعة مغلقة',family:'REVERSAL'}
] as const;
export type StrategyReview={
  setup:StrategyId;label:string;family:string;
  state:'NO_TRIGGER'|'DATA_BLOCKED'|'WATCH'|'QUALIFIED'|'SELECTED';
  side:Direction;score:number|null;netRR:number|null;reason:string;
};
export type StrategyContext={
  last:StrategyBar;prev:StrategyBar;high:number;low:number;atr:number;body:number;
  trend1:Direction;trend5:Direction;f9:number;old9:number;mom:number;efficiency:number
};
export function detectScalpStrategies(x:StrategyContext):StrategyCandidate[]{
  const {last,prev,high,low,atr,body,trend1,trend5,f9,old9,mom,efficiency}=x;
  const candidates:StrategyCandidate[]=[];
  if(last.low<low-atr*.04&&last.close>low+atr*.08&&body>.12)
    candidates.push({side:'BUY',setup:'SWEEP',triggerScore:32,anchor:last.low});
  if(last.high>high+atr*.04&&last.close<high-atr*.08&&body<-.12)
    candidates.push({side:'SELL',setup:'SWEEP',triggerScore:32,anchor:last.high});
  if(last.close>high&&body>.45&&trend1==='BUY')
    candidates.push({side:'BUY',setup:'BREAKOUT',triggerScore:34,anchor:high});
  if(last.close<low&&body<-.45&&trend1==='SELL')
    candidates.push({side:'SELL',setup:'BREAKOUT',triggerScore:34,anchor:low});
  if(trend1==='BUY'&&f9>old9&&prev.low<=f9+atr*.15&&last.close>prev.high&&body>.3)
    candidates.push({side:'BUY',setup:'PULLBACK',triggerScore:30,anchor:Math.min(last.low,prev.low)});
  if(trend1==='SELL'&&f9<old9&&prev.high>=f9-atr*.15&&last.close<prev.low&&body<-.3)
    candidates.push({side:'SELL',setup:'PULLBACK',triggerScore:30,anchor:Math.max(last.high,prev.high)});
  if(trend1==='BUY'&&trend5==='BUY'&&f9>old9&&last.close>prev.high&&
      body>.32&&prev.close>prev.open&&mom>.35&&efficiency>.42&&
      last.close>f9&&last.close-f9<atr*.85)
    candidates.push({side:'BUY',setup:'CONTINUATION',triggerScore:30,anchor:Math.min(last.low,prev.low)});
  if(trend1==='SELL'&&trend5==='SELL'&&f9<old9&&last.close<prev.low&&
      body<-.32&&prev.close<prev.open&&mom<-.35&&efficiency>.42&&
      last.close<f9&&f9-last.close<atr*.85)
    candidates.push({side:'SELL',setup:'CONTINUATION',triggerScore:30,anchor:Math.max(last.high,prev.high)});
  return candidates;
}
export function rankScalpStrategies(
  candidates:readonly StrategyCandidate[],
  context:{horizon:1|5;trend1:Direction;trend5:Direction;mom:number;body:number;efficiency:number;volumeRatio:number|null}
):StrategyRank[]{
  const {horizon,trend1,trend5,mom,body,efficiency,volumeRatio}=context;
  return candidates.map(c=>{
    const dir=c.side==='BUY'?1:-1;
    const momentum=Math.min(22,Math.max(0,dir*mom)*13+Math.max(0,dir*body)*10);
    const trend=(trend1===c.side?10:0)+(trend5===c.side?(horizon===5?15:10):c.setup==='SWEEP'?5:0);
    const participation=volumeRatio==null?5:Math.min(15,Math.max(0,volumeRatio)*8);
    return {...c,score:Math.round(Math.min(95,c.triggerScore+momentum+trend+participation+efficiency*8))};
  }).sort((a,b)=>b.score-a.score);
}
export type ReviewedPlan={
  setup:StrategyId|'NONE';side:Direction;score:number;status:'ARMED'|'WATCH'|'BLOCKED';
  netRR:number|null;blockers:readonly string[];
  entry?:number|null;stop?:number|null;targets?:ReadonlyArray<{price:number}>;
  cost?:number;
};
export function describeScalpStrategies(
  evaluated:readonly ReviewedPlan[],selected?:ReviewedPlan|null,dataBlocked=false
):StrategyReview[]{
  return SCALP_STRATEGIES.map(spec=>{
    const candidates=evaluated.filter(p=>p.setup===spec.id).sort((a,b)=>
      (a.status==='ARMED'?1:0)===(b.status==='ARMED'?1:0)
        ?b.score-a.score:(a.status==='ARMED'?-1:1));
    const plan=candidates[0];
    if(!plan)return {setup:spec.id,label:spec.label,family:spec.family,
      state:dataBlocked?'DATA_BLOCKED':'NO_TRIGGER',side:'WAIT' as const,
      score:null,netRR:null,
      reason:dataBlocked?'البيانات أو الجلسة لا تسمح بحساب الاستراتيجية':'لم تظهر شمعة مغلقة تحقق شروط هذه الاستراتيجية'};
    const entry=plan.entry,stop=plan.stop,target=plan.targets?.[0]?.price,cost=plan.cost;
    const dir=plan.side==='BUY'?1:plan.side==='SELL'?-1:0;
    const geometry=entry!=null&&stop!=null&&target!=null&&cost!=null&&
      [entry,stop,target,cost].every(Number.isFinite)&&cost>=0&&dir!==0;
    const risk=geometry?dir*(entry!-stop!):0;
    const reward=geometry?dir*(target!-entry!):0;
    const accepted=plan.status==='ARMED'&&plan.blockers.length===0&&geometry&&
      risk>0&&reward>0&&plan.netRR!=null&&Number.isFinite(plan.netRR)&&
      plan.netRR>=1.25&&(reward-cost!)/(risk+cost!)>=1.25;
    const isSelected=accepted&&Boolean(selected&&selected.setup===plan.setup&&
      selected.side===plan.side&&selected.score===plan.score);
    return {setup:spec.id,label:spec.label,family:spec.family,
      state:isSelected?'SELECTED' as const:accepted?'QUALIFIED' as const:'WATCH' as const,
      side:plan.side,score:plan.score,netRR:plan.netRR,
      reason:isSelected?'أفضل إعداد مؤهل بعد اختبار الوقف والهدف والتكلفة':
        accepted?'اجتاز مخاطر الاستراتيجية؛ خيار ثانوي مؤهل':
        plan.blockers[0]||'الاستراتيجية لم تستكمل شروط تفعيل الدخول'};
  });
}
