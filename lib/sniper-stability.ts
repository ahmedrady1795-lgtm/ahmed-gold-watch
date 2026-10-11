import type {buildContinuousBias,FarLevel,Side} from './continuous-direction';

export type ObservedBias=ReturnType<typeof buildContinuousBias>;
export type StableBiasState={
  side:'BUY'|'SELL';since:number;lastProcessedM15:number;
  oppositeSide:Side;oppositeBars:number;invalidation:number|null;
  targets:FarLevel[];
};
type Outcome={bias:ObservedBias;state:StableBiasState|null;held:boolean;explanation:string};

const ahead=(side:Side,price:number,t:FarLevel)=>side==='BUY'?t.price>price:side==='SELL'?t.price<price:false;
function validLevels(side:Side,price:number,levels:FarLevel[]):FarLevel[]{
  return levels.filter(t=>Number.isFinite(t.price)&&ahead(side,price,t))
    .sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))
    .slice(0,3).map((t,i)=>({...t,stage:(i+1) as 1|2|3}));
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
    const old=previous&&now-previous.since<8*3600000?previous:null;
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
      invalidation:raw.invalidation,targets:freshTargets};
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
  const preserved=validLevels(previous.side,currentPrice,previous.targets);
  if(raw.side===previous.side){
    const newState=previous.oppositeBars>0?{
      ...previous,oppositeBars:0,oppositeSide:'WAIT' as Side}:previous;
    // Keep the originally observed objectives while still ahead. A recalculated
    // snapshot must not replace them every few seconds.
    const levels=preserved.length?preserved:freshTargets;
    const updated=levels.length&&!preserved.length?{...newState,targets:levels}:newState;
    return {state:updated,bias:{...raw,targets:levels,
      invalidation:previous.invalidation},held:preserved.length>0,
      explanation:'نفس اتجاه الإطار الطويل · الأهداف مثبتة'};
  }
  const labelSide=previous.side;
  if(raw.side==='WAIT'){
    return {state:previous,bias:hold(raw,labelSide,preserved,previous.invalidation,
      'الزخم محايد مؤقتًا · الميل السابق مراقبة فقط لحين كسر المستوى أو تأكيد عكسي',true),
      held:true,explanation:'انخفاض الزخم لا يلغي اتجاه H1/H4 مباشرة'};
  }
  const highFrameAgrees=raw.votes.h1===raw.side||raw.votes.h4===raw.side;
  const midFrameAgrees=raw.votes.m15===raw.side;
  const strongOpposition=highFrameAgrees&&midFrameAgrees;
  const isNewBar=m15>0&&m15>previous.lastProcessedM15;
  if(!strongOpposition||!isNewBar){
    return {state:previous,bias:hold(raw,labelSide,preserved,previous.invalidation,
      strongOpposition?'عكس محتمل · ننتظر إغلاق M15 ثانٍ مستقل':
        'التغيّر القصير لا تؤيده فريمات M15/H1/H4 بعد',true),
      held:true,explanation:'رصد عكس الاتجاه دون قلبه مع كل نبضة'};
  }
  const oppositeBars=previous.oppositeSide===raw.side?previous.oppositeBars+1:1;
  if(oppositeBars<2){
    const state={...previous,lastProcessedM15:m15,oppositeSide:raw.side,oppositeBars};
    return {state,bias:hold(raw,labelSide,preserved,previous.invalidation,
      'عكس محتمل · أول إغلاق M15 مخالف؛ يلزم إغلاق مستقل ثانٍ',true),
      held:true,explanation:'تأكيد أول لتغير الاتجاه'};
  }
  return begin();
}
