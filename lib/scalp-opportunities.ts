import {ema,indicators,type Candle,type Event} from './engine';

export type ScalpSide='BUY'|'SELL'|'WAIT';
export type ScalpQuote={price:number|null;at:number|null;bid?:number|null;ask?:number|null;source:string};
export type ScalpInput={asset:'GOLD'|'BTC';c1:Candle[];c5:Candle[];quote:ScalpQuote;candleSource:string;now:number;events:Event[];newsReady:boolean;marketOpen:boolean;feeBps?:number|null;slippageBps?:number|null};
export type ScalpPlan={
  id:string;asset:'GOLD'|'BTC';horizon:1|5;at:number;expiresAt:number;side:ScalpSide;
  status:'BLOCKED'|'WATCH'|'ARMED';setup:'BREAKOUT'|'PULLBACK'|'SWEEP'|'CONTINUATION'|'NONE';
  score:number;scoreLabel:string;entry:number|null;stop:number|null;
  targets:{price:number;kind:'STRUCTURE'|'PROJECTION'}[];netRR:number|null;
  cost:number;costEstimated:boolean;trigger:string;reason:string;blockers:string[];
  evidence:{label:string;side:ScalpSide;value:string}[];
};
const n=(v:unknown)=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const round=(v:number)=>Number(v.toFixed(2));
const mean=(v:number[])=>v.reduce((s,x)=>s+x,0)/Math.max(1,v.length);
// Keep a qualified, time-limited setup alive across its first following M1
// close. Otherwise a required 60-second hold can never complete.
const pendingSetups=new Map<string,ScalpPlan>();
function stableCandidate(plan:ScalpPlan,now:number,quote:number,cost:number):ScalpPlan{
  const key=plan.asset+':'+plan.horizon,previous=pendingSetups.get(key);
  const validPrevious=Boolean(previous&&previous.status==='ARMED'&&now>previous.at&&now<previous.expiresAt&&
    previous.entry!=null&&previous.stop!=null&&previous.targets[0]?.price!=null&&
    (previous.side==='BUY'?quote>previous.stop&&quote<previous.targets[0].price:quote<previous.stop&&quote>previous.targets[0].price)&&
    cost<=Math.max(previous.cost*1.35,.01));
  // Freeze plan IDs, entry, risk and targets through the observation window;
  // do not recycle a dead plan or let old setups bypass hard feed blockers.
  if(validPrevious&&(!previous||plan.status!=='ARMED'||previous.id===plan.id))return {...previous!,reason:'الإعداد مستمر؛ متابعة ثبات M1 حتى انتهاء الصلاحية'};
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
  const costEstimated=spread==null||fee==null||slip==null;
  // Cost is round-trip: spread + fees + slippage. Unknown fees are explicit assumptions.
  const cost=p!=null?(spread??p*(asset==='GOLD'?2:2)/10000)+p*((fee??(asset==='BTC'?12:0))+(slip??(asset==='BTC'?2:1)))/10000:0;
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
    scoreLabel:'قوة الإعداد /100 · ليست احتمال ربح',entry:null,stop:null,targets:[],netRR:null,cost:round(cost),costEstimated,
    trigger:'انتظار إعداد سعري واضح',reason:blockers[0]||'لم يكتمل اختراق أو إعادة اختبار أو سحب سيولة',blockers:[...blockers],evidence:[]
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
  const candidates:{side:'BUY'|'SELL';setup:ScalpPlan['setup'];triggerScore:number;anchor:number}[]=[];
  // A sweep can trade against M5; a continuation must agree with short-term price structure.
  if(last.low<low-atr*.04&&last.close>low+atr*.08&&body>.12)candidates.push({side:'BUY',setup:'SWEEP',triggerScore:32,anchor:last.low});
  if(last.high>high+atr*.04&&last.close<high-atr*.08&&body<-.12)candidates.push({side:'SELL',setup:'SWEEP',triggerScore:32,anchor:last.high});
  if(last.close>high&&body>.45&&trend1==='BUY')candidates.push({side:'BUY',setup:'BREAKOUT',triggerScore:34,anchor:high});
  if(last.close<low&&body<-.45&&trend1==='SELL')candidates.push({side:'SELL',setup:'BREAKOUT',triggerScore:34,anchor:low});
  if(trend1==='BUY'&&f9>old9&&prev.low<=f9+atr*.15&&last.close>prev.high&&body>.3)candidates.push({side:'BUY',setup:'PULLBACK',triggerScore:30,anchor:Math.min(last.low,prev.low)});
  if(trend1==='SELL'&&f9<old9&&prev.high>=f9-atr*.15&&last.close<prev.low&&body<-.3)candidates.push({side:'SELL',setup:'PULLBACK',triggerScore:30,anchor:Math.max(last.high,prev.high)});
  // A two-candle continuation can be tradeable without clearing an entire
  // 8-candle range. Require EMA+M5 alignment, real candle close and efficiency.
  if(trend1==='BUY'&&trend5==='BUY'&&f9>old9&&last.close>prev.high&&
     body>.32&&prev.close>prev.open&&mom>.35&&efficiency>.42&&
     last.close>f9&&last.close-f9<atr*.85)
    candidates.push({side:'BUY',setup:'CONTINUATION',triggerScore:30,anchor:Math.min(last.low,prev.low)});
  if(trend1==='SELL'&&trend5==='SELL'&&f9<old9&&last.close<prev.low&&
     body<-.32&&prev.close<prev.open&&mom<-.35&&efficiency>.42&&
     last.close<f9&&f9-last.close<atr*.85)
    candidates.push({side:'SELL',setup:'CONTINUATION',triggerScore:30,anchor:Math.max(last.high,prev.high)});

  return ([1,5] as const).map(horizon=>{
    const plan=base(horizon);
    const ranked=candidates.map(c=>{
      const dir=c.side==='BUY'?1:-1;
      const momentum=Math.min(22,Math.max(0,dir*mom)*13+Math.max(0,dir*body)*10);
      const context=(trend1===c.side?10:0)+(trend5===c.side?(horizon===5?15:10):c.setup==='SWEEP'?5:0);
      const participation=volumeRatio==null?5:Math.min(15,Math.max(0,volumeRatio)*8);
      const score=Math.round(Math.min(95,c.triggerScore+momentum+context+participation+efficiency*8));
      return {...c,score};
    }).sort((x,y)=>y.score-x.score);
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
      const entry=round(dir===1?Math.max(edge+atr*.12,p!+atr*.08):Math.min(edge-atr*.12,p!-atr*.08));
      const risk=Math.max(atr*(horizon===1?.82:1.15),cost*1.85,Math.abs(entry-f21)*.50);
      const move=Math.max(risk*1.75+cost*2.2,atr*(horizon===1?1.6:2.8));
      // Do not invent a feasible scalp when costs dwarf realistic ATR.
      if(risk>atr*(horizon===1?1.8:3.2)||move>atr*(horizon===1?2.6:5))
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
        blockers:['ينتظر اختراق المستوى وإغلاق M1 ثم ثبات 60 ثانية؛ لا دخول الآن'],
        trigger:trigger+' '+entry.toFixed(2)+' مع استمرار الثبات دقيقة؛ التكاليف '+(costEstimated?'تقديرية':'من المصدر'),
        reason:'فرصة رصد مرتبطة بتوافق EMA على M1 وM5، وليست صفقة مفعلة'
      };
      return stableCandidate(watch,now,p!,cost);
    }
    const dir=chosen.side==='BUY'?1:-1,price=p!;
    const entry=round(price+dir*Math.max(atr*.07,cost*.15,.02));
    const rawStop=chosen.anchor-dir*atr*.12;
    const risk=Math.max(dir*(entry-rawStop),atr*(horizon===1?.48:.7),cost*2);
    const stop=round(entry-dir*risk);
    const maxMove=atr*(horizon===1?2:4);
    const minReward=Math.max(risk*1.45+cost*2.45,cost*3);
    const maxRisk=atr*(horizon===1?1.6:2.5);
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
    const reasons:string[]=[];
    if(chosen.score<(horizon===1?60:64))reasons.push('قوة الإعداد لم تصل لحد التفعيل');
    if(risk>maxRisk||reward>maxMove)reasons.push('الوقف أو الهدف أبعد من مدى الحركة المناسب للفريم');
    if(cost>atr*(horizon===1?.30:.48))reasons.push('التكلفة كبيرة بالنسبة للتذبذب القابل للتداول');
    // Paper-reference prices can use the disclosed conservative spread
    // assumption, but not when even the estimated transaction drag is large.
    if(spread==null&&cost>atr*(horizon===1?.24:.38))
      reasons.push('غياب سبريد حي وتكلفة تقديرية كبيرة؛ لا دخول');
    if(chosen.setup==='BREAKOUT'&&volumeRatio!=null&&volumeRatio<.8)reasons.push('اختراق دون مشاركة حجم كافية');
    if(chosen.setup!=='SWEEP'&&efficiency<.22)reasons.push('حركة متقطعة تضعف استمرار الاتجاه');
    if(targets[0]?.kind==='PROJECTION'&&chosen.score<76)reasons.push('الهدف الأول تقديري وقوة الإعداد لا تكفي للاعتماد عليه');
    if(last.high-last.low>atr*2.8||Math.abs(price-last.close)>atr*.85)reasons.push('الحركة ممتدة؛ انتظر إعادة اختبار بدل مطاردة السعر');
    if(rr==null||rr<1.25)reasons.push('العائد بعد التكلفة أقل من 1.25R');
    if(horizon===5&&trend5!==chosen.side&&chosen.setup!=='SWEEP')reasons.push('استمرار M5 لم يؤكد اتجاه الإعداد');
    if(horizon===5&&chosen.setup!=='SWEEP'&&dir*m5Body<-.20&&dir*m5Momentum<.10)reasons.push('آخر شمعة M5 مغلقة تعارض الاستمرار');
    if(horizon===5&&chosen.setup==='SWEEP'&&dir*m5Body<-.40)reasons.push('انعكاس الدقيقة عكس جسم M5 قوي؛ يلزم تأكيد إضافي');
    if(horizon===1&&chosen.setup==='BREAKOUT'&&volumeRatio!=null&&volumeRatio<1.05&&efficiency<.45)reasons.push('اختراق M1 ضعيف دون تأكيد كافٍ');
    // A missing optional news feed is not itself a scheduled major release.
    // Known high-impact release windows remain blocked at the base gate.
    if(!input.newsReady)plan.evidence.push({label:'تغطية الأخبار',side:'WAIT',value:'غير مكتملة؛ افحص التقويم'});
    return stableCandidate({...plan,id:asset+'-'+horizon+'-'+last.time+'-'+chosen.setup+'-'+chosen.side,
      side:chosen.side,setup:chosen.setup,score:chosen.score,entry,stop,targets,netRR:rr,
      status:reasons.length?'WATCH':'ARMED',blockers:reasons,
      trigger:chosen.side==='BUY'?'تجاوز سعر الدخول من أسفل قبل انتهاء الصلاحية':'كسر سعر الدخول من أعلى قبل انتهاء الصلاحية',
      reason:reasons[0]||(chosen.setup==='SWEEP'?'استعادة مستوى بعد سحب سيولة':chosen.setup==='PULLBACK'?'استمرار بعد إعادة اختبار':chosen.setup==='CONTINUATION'?'استمرار شمعتين مع توافق M5':'إغلاق خارج نطاق آخر 8 شموع')
    },now,p!,cost);
  });
}
