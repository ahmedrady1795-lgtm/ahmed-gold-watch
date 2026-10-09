import {ema,indicators,type Candle,type Event} from './engine';
import {selectGoldM5Breakout,observedForwardReach,frozenTrendIsValid,chooseEligibleScalpPlan} from './scalp-selection';
import {detectScalpStrategies,rankScalpStrategies,describeScalpStrategies,type StrategyReview} from './scalp-strategies';

export type ScalpSide='BUY'|'SELL'|'WAIT';
export type ScalpQuote={price:number|null;at:number|null;bid?:number|null;ask?:number|null;source:string};
export type ScalpInput={asset:'GOLD'|'BTC';c1:Candle[];c5:Candle[];quote:ScalpQuote;candleSource:string;now:number;events:Event[];newsReady:boolean;marketOpen:boolean;feeBps?:number|null;slippageBps?:number|null};
export type ScalpPlan={
  id:string;asset:'GOLD'|'BTC';horizon:1|5;at:number;expiresAt:number;side:ScalpSide;
  status:'BLOCKED'|'WATCH'|'ARMED';setup:'BREAKOUT'|'PULLBACK'|'SWEEP'|'CONTINUATION'|'NONE';
  score:number;scoreLabel:string;entry:number|null;stop:number|null;
  targets:{price:number;kind:'STRUCTURE'|'PROJECTION'}[];netRR:number|null;
  cost:number;costEstimated:boolean;
  costBreakdown:{spread:number;fees:number;slippage:number;allMeasured:boolean;quoteSource?:string;sources?:{spread:string;fees:string;slippage:string}};
  trigger:string;reason:string;blockers:string[];strategyReview:StrategyReview[];
  evidence:{label:string;side:ScalpSide;value:string}[];
};
const n=(v:unknown)=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const round=(v:number)=>Number(v.toFixed(2));
const mean=(v:number[])=>v.reduce((s,x)=>s+x,0)/Math.max(1,v.length);
// Empirical one-bar price reach is a ceiling on target feasibility, not a
// probability of profit. Never use future/partial candles for this estimate.
function quantile(values:number[],fraction:number){
  const sorted=values.filter(v=>Number.isFinite(v)&&v>=0).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const idx=(sorted.length-1)*fraction,lo=Math.floor(idx),hi=Math.ceil(idx);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}
// Keep a qualified, time-limited setup alive across its first following M1
// close. Otherwise a required 60-second hold can never complete.
const pendingSetups=new Map<string,ScalpPlan>();
function stableCandidate(plan:ScalpPlan,now:number,quote:number,cost:number):ScalpPlan{
  const key=plan.asset+':'+plan.horizon,previous=pendingSetups.get(key);
  const oldRisk=previous?.entry!=null&&previous.stop!=null?
    Math.abs(previous.entry-previous.stop):0;
  const oldReward=previous?.entry!=null&&previous.targets[0]?.price!=null?
    Math.abs(previous.targets[0].price-previous.entry):0;
  const liveNetRR=oldRisk>0?(oldReward-cost)/(oldRisk+cost):0;
  const currentM1Trend=plan.evidence.find(e=>e.label==='اتجاه M1')?.side;
  const currentM5Trend=plan.evidence.find(e=>e.label==='سياق M5')?.side;
  // When GOLD M5 had an armed setup, do not inherit its old grade after
  // either closed trend flips. A new plan must qualify from scratch.
  const currentTrendOK=previous?.horizon===5
    ?previous.side!=='WAIT'&&frozenTrendIsValid(previous.side,previous.setup,currentM1Trend,currentM5Trend)
    :previous?.setup==='SWEEP'||currentM1Trend==null||
      currentM1Trend==='WAIT'||currentM1Trend===previous?.side;
  const sideAligned=Boolean(previous&&
    (plan.side==='WAIT'||plan.side===previous.side)&&currentTrendOK);
  const explicitRiskVeto=plan.blockers.some(b=>
    b.includes('الهدف أبعد من الحركة المواتية')||
    b.includes('التكلفة كبيرة بالنسبة لتذبذب الفريم')||
    b.includes('جودة اختراق M5'));
  const validPrevious=Boolean(previous&&previous.status==='ARMED'&&sideAligned&&
    !explicitRiskVeto&&now>previous.at&&now<previous.expiresAt&&
    previous.entry!=null&&previous.stop!=null&&previous.targets[0]?.price!=null&&
    (previous.side==='BUY'?quote>previous.stop&&quote<previous.targets[0].price:
       quote<previous.stop&&quote>previous.targets[0].price)&&
    cost<=Math.max(previous.cost*1.35,.01)&&liveNetRR>=1.25);
  // Preserve the ID/entry/target through the observation window, but NEVER
  // preserve an outdated low fee, an opposing trend or an unreachable target.
  if(validPrevious&&(plan.status!=='ARMED'||plan.side===previous!.side))
    return {...previous!,cost:round(cost),costEstimated:plan.costEstimated,
      costBreakdown:plan.costBreakdown,netRR:round(liveNetRR),
      reason:'مستوى الدخول والوقف ثابتان، والتكلفة أعيد حسابها بالسعر الحالي'};
  if(plan.status==='ARMED')pendingSetups.set(key,plan);
  else if(!validPrevious)pendingSetups.delete(key);
  return plan;
}
const side=(v:number):ScalpSide=>v>0?'BUY':v<0?'SELL':'WAIT';

function frame(rows:Candle[],ms:number,now:number){
  // Reject malformed/future data instead of silently repairing a trade input.
  const invalid=rows.some((c,i)=>![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||c.time>now||c.time%ms!==0||c.low<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||(i>0&&c.time<=rows[i-1].time));
  const closed=rows.filter(c=>c.time+ms<=now).slice(-240);
  const recent=closed.slice(-20);
  const gap=recent.some((c,i)=>i>0&&c.time-recent[i-1].time!==ms);
  return {closed,invalid,gap,age:closed.length?now-(closed.at(-1)!.time+ms):Infinity};
}

export function buildScalpPlans(input:ScalpInput):ScalpPlan[]{
  const {now,asset,quote}=input;
  const m1=frame(input.c1,60000,now),m5=frame(input.c5,300000,now);
  const p=n(quote.price),quoteAt=n(quote.at),bid=n(quote.bid),ask=n(quote.ask);
  const spread=bid!=null&&ask!=null&&bid>0&&ask>=bid?ask-bid:null;
  const fee=n(input.feeBps),slip=n(input.slippageBps);
  // Configured basis points remain estimates, not measured account fills.
  const costEstimated=true;
  // Show execution-cost decomposition. These are round-trip costs in USD per
  // unit of the underlying, NOT account P&L or verified Exness commissions.
  // Missing inputs remain explicit conservative assumptions; never zero them.
  const spreadCost=p==null?0:(spread??p*2/10000);
  const feeCost=p==null?0:p*(fee??(asset==='BTC'?12:0))/10000;
  const slippageCost=p==null?0:p*(slip??(asset==='BTC'?2:1))/10000;
  const cost=spreadCost+feeCost+slippageCost;
  const costBreakdown={spread:round(spreadCost),fees:round(feeCost),
    slippage:round(slippageCost),allMeasured:false,quoteSource:quote.source,
    sources:{spread:spread==null?'ASSUMED':'QUOTE',
      fees:fee==null?'ASSUMED':'CONFIGURED',slippage:slip==null?'ASSUMED':'CONFIGURED'}};
  const blockers:string[]=[];
  if(p==null||p<=0||quoteAt==null||now-quoteAt>15000||quoteAt>now+2000)blockers.push('السعر الحي متأخر أو توقيته غير موثوق');
  if(!input.marketOpen)blockers.push('جلسة التداول مغلقة');
  if(m1.invalid||m5.invalid)blockers.push('شموع غير صالحة أو بتوقيت مستقبلي');
  if(m1.gap||m5.gap)blockers.push('فجوات في آخر 20 شمعة');
  if(m1.closed.length<60||m5.closed.length<60)blockers.push('نحتاج 60 شمعة مغلقة لكل من M1 وM5');
  if(m1.age>90000||m5.age>330000)blockers.push('شموع السكالب متأخرة');
  if(/COMEX|GC=F|proxy|basis-aligned/i.test(input.candleSource))blockers.push('شموع عقود بديلة؛ لا تصلح لأهداف سكالب الذهب الفوري');
  const news=input.events.find(e=>e.importance===3&&e.exactTime&&Math.abs(now-e.time)<=120000);
  if(news)blockers.push('نافذة خبر قوي: '+news.name);

  const base=(horizon:1|5):ScalpPlan=>({
    id:asset+'-'+horizon+'-'+String(m1.closed.at(-1)?.time??now)+'-NONE',asset,horizon,at:now,
    expiresAt:now+(horizon===1?145000:210000),side:'WAIT',status:blockers.length?'BLOCKED':'WATCH',setup:'NONE',score:0,
    scoreLabel:'قوة الإعداد /100 · ليست احتمال ربح',entry:null,stop:null,targets:[],netRR:null,cost:round(cost),costEstimated,costBreakdown,
    trigger:'انتظار إعداد سعري واضح',reason:blockers[0]||'لم يكتمل اختراق أو إعادة اختبار أو سحب سيولة',blockers:[...blockers],strategyReview:describeScalpStrategies([],null,blockers.length>0),evidence:[]
  });
  if(blockers.length)return [base(1),base(5)];
  const a=m1.closed,b=m5.closed,last=a.at(-1)!,prev=a.at(-2)!;
  const i1=indicators(a),i5=indicators(b),atr=i1.atr;
  const last5=b.at(-1)!,prev5=b.at(-2)!;
  const atr5=Math.max(Number(i5.atr)||0,atr);
  const m5Body=(last5.close-last5.open)/Math.max(1e-9,last5.high-last5.low);
  const m5Momentum=(last5.close-b.at(-3)!.close)/atr5;
  if(!Number.isFinite(atr)||atr<=0)return [base(1),base(5)];
  const closes=a.map(c=>c.close),f9=ema(closes,9),f21=ema(closes,21),old9=ema(closes.slice(0,-3),9);
  const trend1=side(f9-f21),trend5=side(i5.ema20-i5.ema50);
  const prior=a.slice(-9,-1),high=Math.max(...prior.map(c=>c.high)),low=Math.min(...prior.map(c=>c.low));
  const body=(last.close-last.open)/Math.max(1e-9,last.high-last.low);
  const mom=(last.close-a.at(-4)!.close)/atr;
  const path=a.slice(-9).map(c=>c.close),travel=path.slice(1).reduce((s,v,j)=>s+Math.abs(v-path[j]),0);
  const efficiency=travel?Math.abs(path.at(-1)!-path[0])/travel:0;
  const volumes=a.slice(-21,-1).map(c=>Number(c.realVolume??c.tickVolume??0)).filter(v=>v>0);
  const volume=Number(last.realVolume??last.tickVolume??0),volumeRatio=volumes.length&&volume>0?volume/mean(volumes):null;
  // Keep each strategy's detector independent and testable. No rank or
  // scoring branch may skip a different strategy's risk checks.
  const candidates=detectScalpStrategies({
    last,prev,high,low,atr,body,trend1,trend5,f9,old9,mom,efficiency
  });

  return ([1,5] as const).map(horizon=>{
    const plan=base(horizon);
    // M5 must budget its stop, feasible targets and fees against genuine
    // CLOSED M5 candle volatility, not M1 ATR. Never expand M1 risk.
    const rangeAtr=horizon===5?atr5:atr;
    const ranked=rankScalpStrategies(candidates,{
      horizon,trend1,trend5,mom,body,efficiency,volumeRatio
    });
    const chosen=ranked[0];
    plan.evidence=[
      {label:'اتجاه M1',side:trend1,value:'EMA 9 / 21'},
      {label:'سياق M5',side:trend5,value:'EMA 20 / 50'},
      {label:'زخم 3 شموع',side:side(mom),value:round(mom)+' ATR'},
      {label:'حجم التداول',side:'WAIT',value:volumeRatio==null?'غير متاح':round(volumeRatio)+'× المتوسط'}
    ];
    if(!chosen){
      // No entry confirmation yet: prepare a concrete, CONDITIONAL breakout
      // watch only when M1 momentum and M5 trend agree. Never mark it ARMED.
      const trendAligned=trend1!=='WAIT'&&trend1===trend5&&
        (trend1==='BUY'?last.close>f21&&mom>.12:last.close<f21&&mom<-.12);
      if(!trendAligned)return stableCandidate(plan,now,p!,cost);
      const dir=trend1==='BUY'?1:-1;
      const sample=a.slice(-12);
      const edge=dir===1?Math.max(...sample.map(c=>c.high)):Math.min(...sample.map(c=>c.low));
      const entry=round(edge+dir*atr*.12);
      const risk=Math.max(rangeAtr*(horizon===1?.82:.75),cost*1.85,Math.abs(entry-f21)*.50);
      const move=Math.max(risk*1.75+cost*2.2,rangeAtr*(horizon===1?1.6:1.8));
      // Never fabricate breakout levels if even M5 volatility cannot cover
      // projected round-trip fees, stop and target at their expected horizon.
      if(risk>rangeAtr*(horizon===1?1.8:1.7)||
         move>rangeAtr*(horizon===1?2.6:2.7))
        return stableCandidate(plan,now,p!,cost);
      const stop=round(entry-dir*risk);
      const targets=[1,1.5,2].map(k=>({price:round(entry+dir*move*k),kind:'PROJECTION' as const}));
      const netRR=round((move-cost)/(risk+cost));
      const trigger=trend1==='BUY'?'إغلاق M1 فوق':'إغلاق M1 تحت';
      const watch:ScalpPlan={
        ...plan,id:asset+'-'+horizon+'-'+last.time+'-WATCH-'+trend1,
        status:'WATCH',side:trend1,setup:'BREAKOUT',score:Math.round(Math.min(67,
          46+Math.min(12,Math.abs(mom)*7)+(efficiency>.40?7:0))),
        entry,stop,targets,netRR,
        strategyReview:describeScalpStrategies([{
          setup:'BREAKOUT',side:trend1,score:Math.round(Math.min(67,
            46+Math.min(12,Math.abs(mom)*7)+(efficiency>.40?7:0))),
          status:'WATCH',netRR,
          blockers:['فرصة رصد مشروطة؛ لا تزال الشمعة والتأكيد غير مكتملين']
        }]),
        blockers:['ينتظر اختراق المستوى وإغلاق M1 ثم ثبات 60 ثانية؛ لا دخول الآن'],
        trigger:trigger+' '+entry.toFixed(2)+' مع استمرار الثبات دقيقة؛ التكاليف '+(costEstimated?'تقديرية':'من المصدر'),
        reason:'فرصة رصد مرتبطة بتوافق EMA على M1 وM5، وليست صفقة مفعلة'
      };
      return stableCandidate(watch,now,p!,cost);
    }
    // Different valid setups can coexist on the SAME completed M1 candle.
    // The highest raw score may have an unreachable T1 or invalid structural
    // stop. Score EVERY candidate with the same risk checks before selecting
    // the best truly eligible plan. This never relaxes an individual gate.
    const evaluated=ranked.map(chosen=>{
      const plan=base(horizon);
      plan.evidence=[
        {label:'اتجاه M1',side:trend1,value:'EMA 9 / 21'},
        {label:'سياق M5',side:trend5,value:'EMA 20 / 50'},
        {label:'زخم 3 شموع',side:side(mom),value:round(mom)+' ATR'},
        {label:'حجم التداول',side:'WAIT',value:volumeRatio==null?'غير متاح':round(volumeRatio)+'× المتوسط'}
      ];
    const dir=chosen.side==='BUY'?1:-1,price=p!;
    // Entry is anchored to the last CLOSED bar. Live ticks must never move
    // the published stop/target plan between confirmations.
    const goldM5Breakout=asset==='GOLD'&&horizon===5&&chosen.setup==='BREAKOUT'
      ?selectGoldM5Breakout({side:chosen.side,boundary:chosen.anchor,
          open:last.open,high:last.high,low:last.low,close:last.close,
          atr1:atr,roundTripCost:cost})
      :null;
    // Do not chase an M1 closing impulse. Watch the previously broken level
    // and demand a later confirmed M1 + retest before any PAPER entry.
    const entry=round(goldM5Breakout?.entry??(last.close+dir*Math.max(atr*.07,cost*.15,.02)));
    const rawStop=goldM5Breakout?.stop??(chosen.anchor-dir*atr*.12);
    const risk=Math.max(dir*(entry-rawStop),rangeAtr*(horizon===1?.48:.52),cost*2);
    const stop=round(entry-dir*risk);
    const maxMove=rangeAtr*(horizon===1?2:2.65);
    // ACTIVE PAPER mode selectively improves the M5 GOLD target feasibility.
    // All executions still require a positive >=1.25R NET reward at the
    // current quote; GOLD M1 and BTC retain the conservative baseline.
    const activeGoldM5=asset==='GOLD'&&horizon===5;
    const targetNetR=activeGoldM5?1.30:1.45;
    const minReward=Math.max(risk*targetNetR+cost*(targetNetR+1),cost*3);
    const maxRisk=rangeAtr*(horizon===1?1.6:1.65);
    const pivots=[...a.slice(-60),...(horizon===5?b.slice(-24):[])].map(c=>chosen.side==='BUY'?c.high:c.low)
      .filter(x=>dir*(x-entry)>=minReward&&dir*(x-entry)<=maxMove)
      .sort((x,y)=>dir*(x-y));
    const first=pivots[0];
    const reward=first==null?minReward:dir*(first-entry);
    const targets=[{price:round(entry+dir*reward),kind:first==null?'PROJECTION' as const:'STRUCTURE' as const}];
    for(let j=1;j<3;j++){
      const lastDistance=dir*(targets[j-1].price-entry);
      const structural=pivots.find(x=>dir*(x-entry)>lastDistance+atr*.3);
      const distance=structural==null?lastDistance+Math.max(atr*.45,risk*.5):dir*(structural-entry);
      targets.push({price:round(entry+dir*distance),kind:structural==null?'PROJECTION':'STRUCTURE'});
    }
    const actualRisk=dir*(entry-stop),actualReward=dir*(targets[0].price-entry);
    const rr=actualRisk>0?round((actualReward-cost)/(actualRisk+cost)):null;
    const reasons:string[]=[...(goldM5Breakout?.blockers||[])];
    if(goldM5Breakout&&goldM5Breakout.entry!=null&&goldM5Breakout.stop!=null){
      plan.evidence.push(
        {label:'مستوى إعادة اختبار الاختراق',side:chosen.side,value:round(goldM5Breakout.entry)+' $'},
        {label:'وقف خلف شمعة الاختراق',side:'WAIT',value:round(goldM5Breakout.stop)+' $'},
        {label:'نسبة ذيل رفض الاختراق',side:'WAIT',value:round(Number(goldM5Breakout.wickRatio)*100)+'%'}
      );
    }
    // Five of seven historical GOLD M1 outcomes exited on the clock, not T1.
    // A 1-minute plan needs a realistic one-minute destination. Measure
    // favorable open-to-extreme travel in the SAME horizon's closed candles.
    // This is an optimistic ceiling: true entry timing may have less room.
    const historical=(horizon===1?a.slice(-80):b.slice(-60));
    const favorable=historical.map(c=>Math.max(0,
      chosen.side==='BUY'?c.high-c.open:c.open-c.low));
    // GOLD M5 uses what price ACTUALLY traveled over the NEXT five
    // completed M1 bars after a hypothetical historical entry, not what
    // happened during the same completed M5 candle. Take non-overlapping
    // windows to reduce correlated observations. Fallback conservatively if
    // the broker-derived M1 history lacks 30 complete windows.
    const forwardReach=asset==='GOLD'&&horizon===5
      ?observedForwardReach(a,chosen.side,5):null;
    const empiricalReach=forwardReach&&forwardReach.samples>=30&&
      forwardReach.favorableP75!=null
      ?forwardReach.favorableP75:quantile(favorable,horizon===1?.55:.75);
    if(empiricalReach!=null&&historical.length>=40&&
       actualReward>empiricalReach*(horizon===1?1:1.15)){
      reasons.push('الهدف أبعد من الحركة المواتية المعتادة خلال '+(horizon===1?'دقيقة':'خمس دقائق')+
        '؛ احتمال الخروج بالوقت أو التكلفة مرتفع');
    }
    if(chosen.score<(horizon===1?60:64))reasons.push('قوة الإعداد لم تصل لحد التفعيل');
    if(risk>maxRisk||reward>maxMove)reasons.push('الوقف أو الهدف أبعد من مدى الحركة المناسب للفريم');
    if(cost>rangeAtr*(horizon===1?.30:.48))reasons.push('التكلفة كبيرة بالنسبة لتذبذب الفريم بعد الرسوم');
    // Paper-reference prices can use the disclosed conservative spread
    // assumption, but not when even the estimated transaction drag is large.
    if(spread==null&&cost>rangeAtr*(horizon===1?.24:.38))
      reasons.push('غياب سبريد حي وتكلفة تقديرية كبيرة؛ لا دخول');
    if(chosen.setup==='BREAKOUT'&&volumeRatio!=null&&volumeRatio<.8)reasons.push('اختراق دون مشاركة حجم كافية');
    if(chosen.setup!=='SWEEP'&&efficiency<.22)reasons.push('حركة متقطعة تضعف استمرار الاتجاه');
    // One conservative global projection-score gate hid otherwise confirmed
    // GOLD M5 trend/volume setups. Relax it only for an actual 5-minute trend
    // backed by fresh M1 momentum, strong participation, price efficiency AND
    // an already feasible empirical target. All fee, stop, return and news gates stay.
    const confirmedTrendProjection=asset==='GOLD'&&horizon===5&&
      trend5===chosen.side&&trend1===chosen.side&&
      chosen.score>=70&&dir*mom>=.55&&efficiency>=.47&&
      volumeRatio!=null&&volumeRatio>=1.1&&
      empiricalReach!=null&&actualReward<=empiricalReach;
    const projectionScoreGate=confirmedTrendProjection?70:76;
    if(targets[0]?.kind==='PROJECTION'&&chosen.score<projectionScoreGate)
      reasons.push('الهدف الأول تقديري ويلزمه اتجاه وحجم وإمكانية حركة مثبتة');
    if(last.high-last.low>atr*2.8||Math.abs(price-last.close)>atr*.85||
       dir*(price-entry)>atr*(goldM5Breakout?.entry!=null ? .75 : .3))
      reasons.push('السعر ابتعد عن دخول الشمعة المغلقة؛ انتظر إعادة اختبار بدل مطاردة السعر');
    if(rr==null||rr<1.25)reasons.push('العائد بعد التكلفة أقل من 1.25R');
    if(horizon===5&&trend5!==chosen.side&&chosen.setup!=='SWEEP')reasons.push('استمرار M5 لم يؤكد اتجاه الإعداد');
    if(horizon===5&&chosen.setup!=='SWEEP'&&dir*m5Body<-.20&&dir*m5Momentum<.10)reasons.push('آخر شمعة M5 مغلقة تعارض الاستمرار');
    if(horizon===5&&chosen.setup==='SWEEP'&&dir*m5Body<-.40)reasons.push('انعكاس الدقيقة عكس جسم M5 قوي؛ يلزم تأكيد إضافي');
    if(horizon===1&&chosen.setup==='BREAKOUT'&&volumeRatio!=null&&volumeRatio<1.05&&efficiency<.45)reasons.push('اختراق M1 ضعيف دون تأكيد كافٍ');
    if(activeGoldM5)plan.evidence.push({
      label:'وضع التنفيذ المرجعي',side:'WAIT',
      value:'نشط M5 · هدف واقعي · 1.30R صافي مستهدف'
    });
    plan.evidence.push({
      label:'حد الحركة المواتية للفريم',side:'WAIT',
      value:empiricalReach==null?'غير متاح':round(empiricalReach)+' $ / '+(horizon===1?'M1':'M5')
    });
    if(forwardReach){
      plan.evidence.push({
        label:'عينة الحركة بعد الدخول',side:'WAIT',
        value:forwardReach.samples>=30
          ?forwardReach.samples+' نوافذ تاريخية M5 غير متداخلة · P75'
          :'بيانات 5 دقائق مستقبلية غير كافية؛ قياس الشموع المحافظ'
      });
      plan.evidence.push({
        label:'ارتداد معاكس تاريخي بعد الدخول',side:'WAIT',
        value:forwardReach.adverseP50!=null?
          round(forwardReach.adverseP50)+' $ · وسيط 5 دقائق (معلومة لا ضمان)': 'غير متاح'
      });
    }
    // A missing optional news feed is not itself a scheduled major release.
    // Known high-impact release windows remain blocked at the base gate.
    if(!input.newsReady)plan.evidence.push({label:'تغطية الأخبار',side:'WAIT',value:'غير مكتملة؛ افحص التقويم'});
    return {...plan,id:asset+'-'+horizon+'-'+last.time+'-'+chosen.setup+'-'+chosen.side,
      side:chosen.side,setup:chosen.setup,score:chosen.score,entry,stop,targets,netRR:rr,
      status:reasons.length?'WATCH' as const:'ARMED' as const,blockers:reasons,
      trigger:goldM5Breakout?.entry!=null?'اختراق مغلق ثم تأكيد M1 وإعادة اختبار مستوى الدخول؛ بلا مطاردة':
        chosen.side==='BUY'?'تجاوز سعر الدخول من أسفل قبل انتهاء الصلاحية':'كسر سعر الدخول من أعلى قبل انتهاء الصلاحية',
      reason:reasons[0]||(chosen.setup==='SWEEP'?'استعادة مستوى بعد سحب سيولة':chosen.setup==='PULLBACK'?'استمرار بعد إعادة اختبار':chosen.setup==='CONTINUATION'?'استمرار شمعتين مع توافق M5':'إغلاق خارج نطاق آخر 8 شموع')
    };
    });
    const best=chooseEligibleScalpPlan(evaluated);
    const strategyReview=describeScalpStrategies(evaluated,best);
    if(!best)return stableCandidate({...plan,strategyReview},now,p!,cost);
    if(evaluated.length>1)best.evidence.push({
      label:'مقارنة الإعدادات',side:'WAIT',
      value:best!==evaluated[0]&&best.status==='ARMED'
        ?'تم فحص '+evaluated.length+' إعدادات؛ اعتماد بديل اجتاز المخاطر بعد رفض الأعلى درجة'
        :'تم فحص '+evaluated.length+' إعدادات؛ لم توجد أولوية زائفة لدرجة إعداد محجوب'
    });
    return stableCandidate({...best,strategyReview},now,p!,cost);
  });
}
