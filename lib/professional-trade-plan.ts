type Side='BUY'|'SELL'|'WAIT';

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const side=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):null;
const round=(v:number|null,d=2)=>v==null?null:Number(v.toFixed(d));

export type ProfessionalTradePlan={
  ok:boolean;
  asset:'GOLD'|'BTC';
  phase:'NO_TRADE'|'OBSERVE'|'PREPARE'|'ARMED'|'EXECUTE'|'MANAGE';
  bias:Side;
  readiness:number;
  confidence:number;
  marketStory:string;
  route:string[];
  primary:{
    side:Side;
    probability:number;
    entry:number|null;
    trigger:string;
    invalidation:number|null;
    target1:number|null;
    target2:number|null;
    target2Kind:'STRUCTURAL'|'PROJECTION'|'NONE';
    rr:number|null;
  };
  alternate:{
    side:Side;
    probability:number;
    destinationLow:number|null;
    destinationHigh:number|null;
    trigger:string;
  }|null;
  context:{
    h4:Side;m15:Side;m5:Side;m1:Side;
    structure:Side;liquidity:Side;intent:Side;lead:Side;
    higherTimeframeAgreement:number;
  };
  protection:{
    breakEvenTrigger:number|null;
    breakEvenStop:number|null;
    lockProfitTrigger:number|null;
    lockProfitStop:number|null;
    cancelOn:string[];
  };
  noTradeReasons:string[];
  earlySignals:string[];
  createdAt:number;
};

export function buildProfessionalTradePlan(args:{
  asset:'GOLD'|'BTC';now?:number;price?:number|null;
  forward:any;hunt:any;h4:any;movement:any;structure:any;liquidity:any;intent:any;marketLead:any;news?:any;accumulation?:any;
}):ProfessionalTradePlan{
  const now=Number(args.now||Date.now()),f=args.forward||{},hunt=args.hunt||{},m=args.movement||{};
  const price=n(args.price),bias=side(f.side),trade=f.tradeSetup||null;
  const h4=side(args.h4?.side),m15=side(m?.horizons?.fifteenMinute?.side),m5=side(m?.horizons?.fiveMinute?.side),m1=side(m?.horizons?.oneMinute?.side);
  const structure=side(args.structure?.side),liquidity=side(args.liquidity?.side),intent=side(args.intent?.side),lead=side(args.marketLead?.side);
  const aligned=[h4,m15,m5].filter(x=>x!=='WAIT'&&x===bias).length;
  const opposed=[h4,m15,m5].filter(x=>x!=='WAIT'&&bias!=='WAIT'&&x!==bias).length;
  const forwardConfidence=cap(Number(f.confidence||0));
  const executionPass=Boolean(f?.adaptiveLearning?.execution?.validated);
  const zeroLossGuard=Boolean(f?.adaptiveLearning?.execution?.zeroLossGuardPass);
  const capitalEligible=Boolean(f?.capitalProtection?.eligible);
  const leadArmed=Boolean(args.marketLead?.armed&&lead===bias);
  const leadBuilding=Boolean(String(args.marketLead?.stage||'')==='BUILDING'&&lead===bias);
  const intentPre=Boolean(args.intent?.preMove&&intent===bias);
  const path=hunt?.zoneForecast?.pathForecast||{};
  const alt=path?.alternate||null;
  const alternateSide=side(alt?.side);
  const altLow=n(alt?.destination?.low),altHigh=n(alt?.destination?.high);
  const target1=n(trade?.takeProfit??f?.target);
  const entry=n(trade?.entry);
  const invalidation=n(trade?.stopLoss??path?.invalidation);
  const rr=n(trade?.rr);

  const risk=entry!=null&&invalidation!=null?Math.abs(entry-invalidation):null;
  const structuralT2Candidate=n(path?.destination?.mid??path?.priceDestination?.mid);
  let target2:number|null=null,target2Kind:'STRUCTURAL'|'PROJECTION'|'NONE'='NONE';
  if(bias!=='WAIT'&&target1!=null&&price!=null){
    const structuralAhead=structuralT2Candidate!=null&&(bias==='BUY'?structuralT2Candidate>target1:structuralT2Candidate<target1);
    if(structuralAhead){target2=structuralT2Candidate;target2Kind='STRUCTURAL';}
    else if(risk!=null&&risk>0){target2=bias==='BUY'?target1+risk*.65:target1-risk*.65;target2Kind='PROJECTION';}
  }

  const newsRisk=Number(args.news?.risk||0),newsPhase=String(args.news?.phase||'');
  const noTradeReasons:string[]=[];
  if(bias==='WAIT')noTradeReasons.push('لا يوجد اتجاه 15 دقيقة صالح للتنفيذ');
  if(opposed>0)noTradeReasons.push('يوجد تعارض في M5/M15/H4');
  if(structure!=='WAIT'&&bias!=='WAIT'&&structure!==bias)noTradeReasons.push('الهيكل يعاكس الاتجاه');
  if(liquidity!=='WAIT'&&bias!=='WAIT'&&liquidity!==bias&&Number(args.liquidity?.quality||args.liquidity?.strength||0)>=60)noTradeReasons.push('السيولة القوية تعاكس الاتجاه');
  if(!executionPass)noTradeReasons.push('الأداء الإحصائي لم يثبت التنفيذ بعد');
  if(!zeroLossGuard)noTradeReasons.push('بوابة تقليل الخسارة لم تمر');
  if(newsPhase==='PRE_EVENT'&&newsRisk>=70)noTradeReasons.push('خبر مرتفع المخاطر قريب');
  if(f?.status==='TARGET_CONSUMED'||(price!=null&&target1!=null&&(bias==='BUY'?target1<=price:target1>=price)))noTradeReasons.push('الهدف أصبح مستهلكًا أو خلف السعر');

  const earlySignals:string[]=[];
  if(leadArmed)earlySignals.push('Market Lead مسلح قبل الحركة');
  else if(leadBuilding)earlySignals.push('Market Lead يبني ضغطًا مبكرًا');
  if(intentPre)earlySignals.push('Market-maker intent يشير لمرحلة قبل التوسع');
  if(m1===bias&&bias!=='WAIT')earlySignals.push('M1 بدأ يتماشى مع السيناريو');
  if(m5===bias&&m15===bias&&bias!=='WAIT')earlySignals.push('M5 وM15 متفقان');
  if(structure===bias&&bias!=='WAIT')earlySignals.push('الهيكل يدعم الوجهة');
  if(liquidity===bias&&bias!=='WAIT')earlySignals.push('السيولة تدعم المسار');

  let readiness=forwardConfidence*.52+aligned*10+(structure===bias?8:0)+(liquidity===bias?6:0)+(leadArmed?8:leadBuilding?4:0)+(intentPre?6:0)-opposed*15;
  if(executionPass)readiness+=5;if(zeroLossGuard)readiness+=7;if(newsPhase==='PRE_EVENT'&&newsRisk>=70)readiness-=18;
  readiness=Math.round(cap(readiness));

  let phase:ProfessionalTradePlan['phase']='OBSERVE';
  if(noTradeReasons.length>=3||bias==='WAIT')phase='NO_TRADE';
  else if(trade&&capitalEligible)phase=leadArmed||String(f.status)==='PRE_MOVE'?'ARMED':'EXECUTE';
  else if(leadArmed||leadBuilding||intentPre)phase='PREPARE';
  else if(String(f.status)==='IN_PROGRESS')phase='MANAGE';

  const probability=Math.round(cap(50+(forwardConfidence-50)*.65+aligned*4-opposed*7,35,88));
  const route:string[]=[];
  const intentPhase=String(args.intent?.phase||'');
  if(intentPhase.includes('SWEEP'))route.push('سحب سيولة');
  else if(intentPre)route.push('تجميع/امتصاص');
  if(leadArmed||leadBuilding)route.push('ضغط مبكر');
  if(entry!=null)route.push(bias==='BUY'?'اختراق وثبات':'كسر وثبات');
  if(target1!=null)route.push('اندفاع للهدف 1');
  if(target2!=null)route.push('امتداد للهدف 2');
  if(!route.length)route.push('انتظار اكتمال البنية');

  const storyParts:string[]=[];
  storyParts.push(h4===bias&&bias!=='WAIT'?'H4 مع الاتجاه':h4==='WAIT'?'H4 محايد':'H4 غير متفق');
  storyParts.push(m15===bias&&m5===bias&&bias!=='WAIT'?'M15/M5 متفقان':'M15/M5 غير مكتملين');
  if(liquidity===bias)storyParts.push('السيولة تدعم الوجهة');
  if(structure===bias)storyParts.push('الهيكل مؤيد');
  if(leadArmed||leadBuilding)storyParts.push('ضغط مبكر ظاهر');
  if(intentPre)storyParts.push('مرحلة قبل التوسع محتملة');

  const protection=trade?.protection||{};
  const cancelOn:string[]=[];
  if(protection?.cancelOnM5Flip!==false)cancelOn.push('انعكاس M5');
  if(protection?.cancelOnM15Flip!==false)cancelOn.push('انعكاس M15');
  if(protection?.cancelOnLiquidityOpposition!==false)cancelOn.push('سيولة قوية عكسية');
  cancelOn.push('فشل الثبات بعد التفعيل');

  return {
    ok:true,asset:args.asset,phase,bias,readiness,confidence:forwardConfidence,
    marketStory:storyParts.join(' · '),route,
    primary:{
      side:bias,probability,entry:round(entry),trigger:trade?.trigger||'انتظار تفعيل واضح',
      invalidation:round(invalidation),target1:round(target1),target2:round(target2),target2Kind,rr:round(rr,2)
    },
    alternate:alternateSide!=='WAIT'?{
      side:alternateSide,probability:Math.round(cap(Number(alt?.probability||100-probability),10,65)),
      destinationLow:round(altLow),destinationHigh:round(altHigh),
      trigger:'يتفعل فقط إذا فشل السيناريو الرئيسي وظهر تأكيد عكسي'
    }:null,
    context:{h4,m15,m5,m1,structure,liquidity,intent,lead,higherTimeframeAgreement:aligned},
    protection:{
      breakEvenTrigger:round(n(protection?.breakEvenTrigger)),
      breakEvenStop:round(n(protection?.breakEvenStop)),
      lockProfitTrigger:round(n(protection?.lockProfitTrigger)),
      lockProfitStop:round(n(protection?.lockProfitStop)),
      cancelOn
    },
    noTradeReasons,earlySignals,createdAt:now
  };
}
