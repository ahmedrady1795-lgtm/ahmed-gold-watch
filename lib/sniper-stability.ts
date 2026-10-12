import type {buildContinuousBias,FarLevel,Side} from './continuous-direction';

export type ObservedBias=ReturnType<typeof buildContinuousBias>;
export type StableBiasState={
  side:'BUY'|'SELL';since:number;lastProcessedM15:number;
  oppositeSide:Side;oppositeBars:number;invalidation:number|null;
  targets:FarLevel[];reachedPrices?:number[];
};
// Presentation cannot mutate the server's reversal counters. Live browser
// prices may consume a level or pause a breached path, but never flip it.
export function presentServerBias(server:ObservedBias,local:ObservedBias,price:number|null):ObservedBias{
  if(!server.active||!local.active||price==null||!Number.isFinite(price)||price<=0)
    return {...server,active:false,status:'PAUSED',targets:[],invalidation:null,
      reason:'ذاكرة الخادم محفوظة؛ البيانات الحالية لا تسمح بمسار حي'};
  const breached=server.invalidation!=null&&(server.side==='BUY'?price<=server.invalidation:
    server.side==='SELL'?price>=server.invalidation:false);
  if(breached)return {...server,side:'WAIT',targets:[],invalidation:null,
    label:'الإبطال اتكسر · تحديث ذاكرة الخادم',rangeBound:true};
  return {...server,targets:server.targets.filter(t=>ahead(server.side,price,t))};
}
type Outcome={bias:ObservedBias;state:StableBiasState|null;held:boolean;explanation:string};

const ahead=(side:Side,price:number,t:FarLevel)=>side==='BUY'?t.price>price:side==='SELL'?t.price<price:false;
function validLevels(side:Side,price:number,levels:FarLevel[]):FarLevel[]{
  return levels.filter(t=>Number.isFinite(t.price)&&ahead(side,price,t))
    .sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))
    .slice(0,3);
}
const named=(side:Side)=>side==='BUY'?'صعود':'هبوط';
const hold=(raw:ObservedBias,side:'BUY'|'SELL',targets:FarLevel[],invalidation:number|null,
  explanation:string,active:boolean):ObservedBias=>({...raw,side,
    status:active?'LIVE':'PAUSED',active,targets:active?targets:[],
    invalidation:active?invalidation:null,
    label:'ميل '+named(side)+' محفوظ · '+(active?'تثبيت الانحياز':'بيانات متأخرة'),
    reason:explanation,rangeBound:false});

export function stabilizeSniperBias(
  previous:StableBiasState|null,
  raw:ObservedBias,
  currentPrice:number|null,
  now:number
):Outcome{
  // A UI stabilizer is not a trade decision or a way around stale input.
  if(!raw.active||currentPrice==null||!Number.isFinite(currentPrice)||currentPrice<=0){
    const saved=previous&&now-previous.since<8*3600000?previous:null;
    // An interruption breaks the independent confirmation streak.
    const old=saved&&saved.oppositeBars>0?{...saved,oppositeBars:0,oppositeSide:'WAIT' as Side}:saved;
    return {state:old,bias:old?hold(raw,old.side,[],null,
      'آخر انحياز محفوظ تاريخيًا · لا توجد أسعار حية تسمح برسم أهداف نشطة',false):raw,
      held:Boolean(old),explanation:'بيانات غير مباشرة'};
  }
  const m15=raw.m15ClosedAt||0;
  const freshTargets=raw.side==='WAIT'?[]:validLevels(raw.side,currentPrice,raw.targets);
  const begin=():Outcome=>{
    if(raw.side==='WAIT')return {state:null,bias:raw,held:false,
      explanation:'توازن مؤكد نسبيًا · لا نفرض اتجاهًا'};
    const state:StableBiasState={side:raw.side,since:now,
      lastProcessedM15:m15,oppositeSide:'WAIT',oppositeBars:0,
      invalidation:raw.invalidation,targets:freshTargets,reachedPrices:[]};
    return {state,bias:{...raw,targets:freshTargets},held:false,
      explanation:'تحديد اتجاه من شموع مكتملة'};
  };
  if(!previous||now-previous.since>8*3600000)return begin();
  const breached=previous.invalidation!=null&&
    (previous.side==='BUY'?currentPrice<=previous.invalidation:
      currentPrice>=previous.invalidation);
  if(breached){
    return {state:null,bias:{...raw,side:'WAIT',targets:[],
      invalidation:null,label:'الاتجاه السابق اتبطل · إعادة تقييم',rangeBound:true},
      held:false,explanation:'السعر كسر حد إبطال الانحياز المحفوظ'};
  }
  // Crossing an observed target consumes it for this bias. It must not be
  // resurrected on a retrace or by the next snapshot's historical levels.
  const reachedPrices=[...new Set([...(previous.reachedPrices||[]),
    ...previous.targets.filter(t=>!ahead(previous.side,currentPrice,t)).map(t=>t.price)])];
  const preserved=validLevels(previous.side,currentPrice,previous.targets);
  const isNewBar=m15>0&&m15>previous.lastProcessedM15;
  const highFrameAgrees=raw.votes.h1===raw.side||raw.votes.h4===raw.side;
  const strongOpposition=raw.side!=='WAIT'&&raw.side!==previous.side&&
    highFrameAgrees&&raw.votes.m15===raw.side;
  // Only adjacent, independently observed M15 closes count. Neither an
  // intrabar score change nor a missing/neutral/unsupported close counts.
  const consecutive=isNewBar&&m15-previous.lastProcessedM15===900000;
  const oppositeBars=isNewBar?(strongOpposition?
    (consecutive&&previous.oppositeSide===raw.side?previous.oppositeBars+1:1):0):previous.oppositeBars;
  if(isNewBar&&strongOpposition&&oppositeBars>=2)return begin();
  // Exhausted levels are rearmed only on a NEW M15 close. Nearby repricing
  // of a consumed zone cannot masquerade as a fresh target after a retrace.
  const levels=raw.side===previous.side&&!preserved.length&&isNewBar?
    freshTargets.filter(t=>!reachedPrices.some(p=>Math.abs(p-t.price)<=currentPrice*.0002)):preserved;
  const candidate:StableBiasState={...previous,
    lastProcessedM15:isNewBar?m15:previous.lastProcessedM15,
    oppositeSide:isNewBar?(strongOpposition?raw.side:'WAIT'):previous.oppositeSide,
    oppositeBars,targets:levels,reachedPrices};
  // React commits this state in an effect; unchanged data must converge.
  const state=JSON.stringify(candidate)===JSON.stringify(previous)?previous:candidate;
  if(raw.side===previous.side){
    return {state,bias:{...raw,targets:levels,invalidation:previous.invalidation},
      held:preserved.length>0,explanation:'نفس اتجاه الإطار الطويل · الأهداف مثبتة'};
  }
  if(raw.side==='WAIT'){
    return {state,bias:hold(raw,previous.side,preserved,previous.invalidation,
      'الزخم محايد مؤقتًا · الميل السابق مراقبة فقط لحين كسر المستوى أو تأكيد عكسي',true),
      held:true,explanation:'انخفاض الزخم لا يلغي اتجاه H1/H4 مباشرة'};
  }
  const explanation=strongOpposition&&oppositeBars>0?
    'عكس محتمل · يلزم إغلاق M15 تالٍ مستقل مع توافق H1/H4':
    'التغيّر القصير لا تؤيده إغلاقات متتالية لفريمات M15/H1/H4 بعد';
  return {state,bias:hold(raw,previous.side,preserved,previous.invalidation,explanation,true),
    held:true,explanation:'رصد عكس الاتجاه دون قلبه مع كل نبضة'};
}
