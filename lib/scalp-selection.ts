// Pure, conservative selection for GOLD M5 BREAKOUT paper setups.
// A strong momentum score does not justify paying up at the candle extreme.
// We publish a near-boundary retest entry and invalidate BEYOND the real
// confirmed breakout candle, not merely below a synthetic volatility band.
export type BreakoutSide='BUY'|'SELL';
export type GoldM5BreakoutCheck={
  side:BreakoutSide;boundary:number;open:number;high:number;low:number;close:number;
  atr1:number;roundTripCost:number
};
export function selectGoldM5Breakout(x:GoldM5BreakoutCheck){
  const dir=x.side==='BUY'?1:-1;
  const range=x.high-x.low;
  const valid=[x.boundary,x.open,x.high,x.low,x.close,x.atr1,x.roundTripCost]
    .every(Number.isFinite)&&x.atr1>0&&range>0&&x.low>0&&
    x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)&&x.roundTripCost>=0;
  if(!valid)return {entry:null,stop:null,blockers:['بيانات شمعة الاختراق غير صالحة'],wickRatio:null,extensionAtr:null};
  const boundaryBuffer=Math.max(x.atr1*.08,x.roundTripCost*.12,.02);
  const stopBuffer=Math.max(x.atr1*.10,x.roundTripCost*.16,.02);
  const entry=x.boundary+dir*boundaryBuffer;
  const stop=dir===1?Math.min(x.low,x.boundary)-stopBuffer:Math.max(x.high,x.boundary)+stopBuffer;
  const wick=dir===1?x.high-x.close:x.close-x.low;
  const wickRatio=wick/range,extensionAtr=dir*(x.close-x.boundary)/x.atr1;
  const blockers:string[]=[];
  if(extensionAtr<.05)blockers.push('جودة اختراق M5: الإغلاق خارج النطاق غير حاسم');
  if(extensionAtr>1.05)blockers.push('جودة اختراق M5: شمعة ممتدة؛ الدخول فقط بعد إعداد جديد');
  if(wickRatio>.34)blockers.push('جودة اختراق M5: ذيل رفض كبير عند القمة أو القاع');
  if(dir*(entry-stop)<=0)blockers.push('جودة اختراق M5: الوقف لا يقع خلف بنية الشمعة');
  return {entry,stop,blockers,wickRatio,extensionAtr};
}

// Compare a proposed target against REAL subsequent movement over the
// intended holding window, not a same-candle open-to-high/low excursion.
// Rows MUST already be CLOSED M1 candles. Windows are non-overlapping and
// use only candles strictly AFTER a hypothetical entry at a previous close.
// Returns a descriptive sample, never a success probability or OOS proof.
export type ClosedMinute={time:number;open:number;high:number;low:number;close:number};
export function observedForwardReach(
  closed:ClosedMinute[],side:BreakoutSide,holdMinutes:1|5,lookback=240
){
  const dir=side==='BUY'?1:-1;
  const start=Math.max(0,closed.length-lookback);
  const favorable:number[]=[],adverse:number[]=[];
  for(let i=closed.length-holdMinutes-1;i>=start;i-=holdMinutes){
    const anchor=closed[i];
    if(!anchor||!Number.isFinite(anchor.close)||anchor.close<=0)continue;
    const path=closed.slice(i+1,i+holdMinutes+1);
    if(path.length!==holdMinutes)continue;
    let prevTime=anchor.time,valid=true;
    for(const c of path){
      if(![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||
         c.time!==prevTime+60000||c.low<=0||
         c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)){
        valid=false;break;
      }
      prevTime=c.time;
    }
    if(!valid)continue;
    const best=dir===1?Math.max(...path.map(c=>c.high)):Math.min(...path.map(c=>c.low));
    const worst=dir===1?Math.min(...path.map(c=>c.low)):Math.max(...path.map(c=>c.high));
    favorable.push(Math.max(0,dir*(best-anchor.close)));
    adverse.push(Math.max(0,-dir*(worst-anchor.close)));
  }
  const quantile=(input:number[],q:number)=>{
    if(!input.length)return null;
    const a=[...input].sort((x,y)=>x-y),j=(a.length-1)*q;
    const lo=Math.floor(j),hi=Math.ceil(j);
    return a[lo]+(a[hi]-a[lo])*(j-lo);
  };
  return {samples:favorable.length,
    favorableP75:quantile(favorable,.75),adverseP50:quantile(adverse,.50),
    holdMinutes,reference:'non-overlapping closed M1 forward windows, not broker fills'};
}

// A previous ARMED directional setup must lose its eligibility if either the
// CURRENT closed M1 or M5 trend now opposes it. Score history is not permission
// to ignore a fresh M5 reversal. Sweeps remain reversal-oriented and are
// handled separately by their own setup guards.
export function frozenTrendIsValid(
  side:BreakoutSide,setup:string,currentM1:string|undefined,currentM5:string|undefined
){
  if(setup==='SWEEP')return currentM1!=='WAIT'&&currentM1===side;
  return currentM1===side&&currentM5===side;
}

// Two genuine price-action setups can trigger in the same completed candle.
// A higher score cannot rescue an untradable reward, invalid stop or a fee
// veto. Only evaluate the plans whose *entire* independent gate set passed.
// The caller supplies candidates in descending technical-quality score order.
export function chooseEligibleScalpPlan<T extends {
  status:string;score:number;side:'BUY'|'SELL'|'WAIT';entry:number|null;
  stop:number|null;targets:ReadonlyArray<{price:number}>;
  cost:number;netRR:number|null;blockers:ReadonlyArray<string>;
}>(plans:readonly T[]):T|null {
  const valid=plans.filter(plan=>{
    if(plan.status!=='ARMED'||plan.blockers.length>0||plan.netRR==null||
       !Number.isFinite(plan.netRR)||plan.netRR<1.25||
       (plan.side!=='BUY'&&plan.side!=='SELL'))return false;
    const entry=plan.entry,stop=plan.stop,target=plan.targets[0]?.price;
    if(entry==null||stop==null||target==null||
       ![entry,stop,target,plan.cost].every(Number.isFinite)||plan.cost<0)return false;
    const dir=plan.side==='BUY'?1:-1,risk=dir*(entry-stop),reward=dir*(target-entry);
    return risk>0&&reward>0&&
      (reward-plan.cost)/(risk+plan.cost) >= 1.25;
  });
  // Existing ranked order remains authoritative *among fully qualified*
  // plans; a WATCH with any score can never displace an ARMED trade.
  return valid[0]??plans[0]??null;
}
