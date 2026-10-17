/**
 * Read-only chart annotations derived from CLOSED broker/exchange candles.
 * No invented liquidity orders, profit estimates or directional probabilities.
 */
export type ChartOverlayZone={low:number;high:number;center:number;label:string;side:'UPPER'|'LOWER'};
type Bar={time:number;open:number;high:number;low:number;close:number};
const number=(v:unknown)=>v!=null&&Number.isFinite(Number(v))?Number(v):null;
const round=(p:number)=>Number(p.toFixed(2));
const average=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
function closedM5(source:any,now:number):Bar[]{
  const seen=new Map<number,Bar>();
  for(const v of Array.isArray(source)?source:[]){
    const time=number(v?.time),open=number(v?.open),high=number(v?.high),low=number(v?.low),close=number(v?.close);
    if(time==null||open==null||high==null||low==null||close==null||
       time%300000!==0||time+300000>now||time<now-36000000||
       low<=0||high<Math.max(open,close)||low>Math.min(open,close))continue;
    seen.set(time,{time,open,high,low,close});
  }
  return [...seen.values()].sort((a,b)=>a.time-b.time).slice(-55);
}
function atr5(rows:Bar[]):number|null{
  if(rows.length<15)return null;
  const recent=rows.slice(-15);
  const tr=recent.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-recent[i].close),Math.abs(b.low-recent[i].close)));
  const atr=average(tr);
  return Number.isFinite(atr)&&atr>0?atr:null;
}
export function buildChartOverlay(input:{
  now:number;price:number|null;historyFresh:boolean;priceFresh:boolean;
  fourHour:any;m5:any;accumulation?:any;targets?:Array<{stage:number;price:number}>;
}){
  const {now,price,fourHour}=input;
  const m5=closedM5(input.m5,now),atr=atr5(m5);
  const last=m5.at(-1);
  const fresh=Boolean(input.historyFresh&&input.priceFresh&&fourHour?.ready&&
    price!=null&&price>0&&last&&now-last.time-300000<=15*60000);
  const phase=String(fourHour?.phase||'غير محسوم');
  const fourHourKind=phase.includes('تجميع')?'ACCUMULATION':phase.includes('تصريف')?'DISTRIBUTION':'BALANCED';
  const activity=String(input.accumulation?.phase||'');
  const accumulationScore=number(input.accumulation?.accumulationScore)||0;
  const distributionScore=number(input.accumulation?.distributionScore)||0;
  const behaviorKind=activity==='ACCUMULATING'||activity==='MARKUP_READY'?'ACCUMULATION':
    activity==='DISTRIBUTING'||activity==='MARKDOWN_READY'?'DISTRIBUTION':'BALANCED';
  const behaviorQualified=(behaviorKind==='ACCUMULATION'&&accumulationScore>=40&&accumulationScore>=distributionScore+8)||
    (behaviorKind==='DISTRIBUTION'&&distributionScore>=40&&distributionScore>=accumulationScore+8);
  const conflict=behaviorQualified&&fourHourKind!=='BALANCED'&&fourHourKind!==behaviorKind;
  const phaseKind=conflict?'BALANCED':fourHourKind!=='BALANCED'?fourHourKind:
    behaviorQualified?behaviorKind:'BALANCED';
  const phaseLabel=!fresh?'قراءة السيولة غير متاحة':phaseKind==='ACCUMULATION'?'تجميع محتمل':
    phaseKind==='DISTRIBUTION'?'تصريف محتمل':'توازن / غير محسوم';
  const sourceBasis=String(fourHour?.volumeBasis||'NONE');
  const evidence=!fresh?'البيانات المغلقة غير كافية أو غير حديثة':
    (fourHour.sweep==='SELL_SIDE'?'سحب سيولة من القاع · ':
     fourHour.sweep==='BUY_SIDE'?'سحب سيولة من القمة · ':'')+
    (sourceBasis==='REAL'?'حجم حقيقي':
     sourceBasis==='TICK'?'حجم نشاط Tick غير مباشر':'قراءة سعرية دون حجم موثوق')+
    (conflict?' · تعارض في قراءات التجميع والتصريف':
      fourHourKind==='BALANCED'&&behaviorQualified?' · إشارات السلوك M1/M5 مع توازن 4س':'');
  const high=number(fourHour?.rangeHigh),low=number(fourHour?.rangeLow);
  const width=fresh&&atr!=null&&high!=null&&low!=null&&high>low?
    Math.min((high-low)*.1,atr*1.2):null;
  const upper:ChartOverlayZone|null=width!=null&&high!=null?{
    low:round(high-width),high:round(high),center:round(high-width*.5),
    label:'سيولة فوق القمم · عروض محتملة',side:'UPPER'}:null;
  const lower:ChartOverlayZone|null=width!=null&&low!=null?{
    low:round(low),high:round(low+width),center:round(low+width*.5),
    label:'سيولة تحت القيعان · طلب محتمل',side:'LOWER'}:null;
  // Breakout levels use twelve already closed M5 bars, excluding the last two
  // confirmation candidates, and a modest ATR buffer.
  const reference=m5.slice(-14,-2),confirmation=m5.slice(-2);
  const breakoutUp=fresh&&atr!=null&&reference.length===12?
    round(Math.max(...reference.map(b=>b.high))+atr*.12):null;
  const breakoutDown=fresh&&atr!=null&&reference.length===12?
    round(Math.min(...reference.map(b=>b.low))-atr*.12):null;
  const confirmedUp=breakoutUp!=null&&confirmation.length===2&&
    confirmation.every(b=>b.close>breakoutUp);
  const confirmedDown=breakoutDown!=null&&confirmation.length===2&&
    confirmation.every(b=>b.close<breakoutDown);
  const trend=fresh?(fourHour.side==='BUY'?'BUY':fourHour.side==='SELL'?'SELL':'WAIT'):'WAIT';
  const preferred: 'BUY'|'SELL'|'WAIT'=conflict?'WAIT':confirmedUp?'BUY':confirmedDown?'SELL':
    phaseKind==='ACCUMULATION'?'BUY':phaseKind==='DISTRIBUTION'?'SELL':trend;
  const eta=(level:number)=>{
    if(!fresh||atr==null||price==null||!Number.isFinite(level)||level<=0)return null;
    const steps=Math.abs(level-price)/atr;
    if(steps>45)return null;
    // A volatility-based range, not a predicted first-passage distribution.
    const min=Math.max(5,Math.ceil(steps/.9)*5);
    const max=Math.min(480,Math.max(min+5,Math.ceil(steps/.32)*5));
    return {min,max};
  };
  return {ready:fresh,phaseKind,phaseLabel,evidence,sourceBasis,upper,lower,
    breakoutUp,breakoutDown,confirmedUp,confirmedDown,preferred,atr,
    timing:(input.targets||[]).slice(0,3).map(t=>({
      stage:t.stage,price:t.price,
      eta:preferred==='WAIT'||(preferred==='BUY'&&t.price<=price!)||
        (preferred==='SELL'&&t.price>=price!)?null:eta(t.price)
    }))
  };
}


/**
 * Read-only breakout progression for the chart. This does NOT decide trade
 * eligibility, overwrite an audited plan or create a target. It deliberately
 * distinguishes intraminute price testing from two CLOSED M5 confirmations.
 * The levels are exactly those already displayed by buildChartOverlay.
 */
export function assessBreakoutWatch(input:{
 now:number;price:number|null;priceFresh:boolean;historyFresh:boolean;
 m1:any;m5:any;overlay:ReturnType<typeof buildChartOverlay>;
}){
 type Phase='UNAVAILABLE'|'RANGE'|'APPROACH'|'TESTING'|'M1_BREAK'|
   'M5_FIRST'|'M5_CONFIRMED'|'REJECTED';
 type Direction='BUY'|'SELL'|'WAIT';
 const result=(phase:Phase,side:Direction,headline:string,detail:string,
   closes:0|1|2=0,level:number|null=null)=>
   ({phase,side,headline,detail,closes,requiredCloses:2 as const,level});
 const {overlay:o,now,price}=input,upper=o.breakoutUp,lower=o.breakoutDown;
 if(!input.priceFresh||!input.historyFresh)
   return result('UNAVAILABLE','WAIT','انتظار بيانات حية','سعر M1 أو الشموع غير حديثة');
 if(!o.ready||upper==null||lower==null||o.atr==null)
   return result('UNAVAILABLE','WAIT','انتظار مستويات كسر موثوقة','بيانات M5/H4 لم تكتمل؛ لا تأكيد');
 const m5=closedM5(input.m5,now),last=m5.at(-1),prev=m5.at(-2);
 if(m5.length<14||!last||!prev||last.time-prev.time!==300000||
   now-last.time-300000>10*60000)
   return result('UNAVAILABLE','WAIT','انتظار إغلاقات M5','آخر إغلاق M5 أو التسلسل غير حديث');
 const recent=Array.isArray(input.m1)?input.m1.filter((b:any)=>
   Number.isFinite(Number(b?.time))&&b.time%60000===0&&
   b.time+60000<=now&&Number.isFinite(Number(b.close))&&
   b.close>0&&Number.isFinite(Number(b.high))&&Number.isFinite(Number(b.low))&&
   b.high>=b.close&&b.low<=b.close).sort((a:any,b:any)=>a.time-b.time).slice(-5):[];
 const m1Last=recent.at(-1),m1Prev=recent.at(-2);
 const m1Contiguous=Boolean(m1Last&&m1Prev&&
   m1Last.time-m1Prev.time===60000&&now-m1Last.time-60000<=180000);
 const m1Up=Boolean(m1Contiguous&&m1Last.close>upper&&m1Prev.close>upper);
 const m1Down=Boolean(m1Contiguous&&m1Last.close<lower&&m1Prev.close<lower);
 const up=last.close>upper,down=last.close<lower;
 const up2=up&&prev.close>upper,down2=down&&prev.close<lower;
 const fmt=(x:number)=>x.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
 if(up2)return result('M5_CONFIRMED','BUY','كسر صاعد بإغلاقين M5',
   '2/2 إغلاق · شروط الدخول تُفحص منفصلة',2,upper);
 if(down2)return result('M5_CONFIRMED','SELL','كسر هابط بإغلاقين M5',
   '2/2 إغلاق · شروط الدخول تُفحص منفصلة',2,lower);
 if(up)return result('M5_FIRST','BUY','إغلاق أول فوق مقاومة M5',
   '1/2 إغلاق · ننتظر إغلاق M5 ثانٍ',1,upper);
 if(down)return result('M5_FIRST','SELL','إغلاق أول تحت دعم M5',
   '1/2 إغلاق · ننتظر إغلاق M5 ثانٍ',1,lower);
 // The latest M5 has closed INSIDE the range. Never convert a former
 // breakout, a temporary wick or a live tick into a confirmed signal.
 if(prev.close>upper||prev.close<lower)
   return result('REJECTED',prev.close>upper?'BUY':'SELL',
     'كسر سابق لم يثبت','آخر إغلاق M5 عاد داخل النطاق',0,
     prev.close>upper?upper:lower);
 if(m1Up)return result('M1_BREAK','BUY','شمعتا M1 فوق المقاومة',
   'مراقبة أول إغلاق M5 · ليس دخولًا',0,upper);
 if(m1Down)return result('M1_BREAK','SELL','شمعتا M1 تحت الدعم',
   'مراقبة أول إغلاق M5 · ليس دخولًا',0,lower);
 const latestPrice=price!=null&&Number.isFinite(price)&&price>0?price:
   m1Last&&now-m1Last.time-60000<=180000?m1Last.close:null;
 if(latestPrice!=null&&latestPrice>upper)
   return result('TESTING','BUY','السعر يختبر كسرًا صاعدًا',
     'إغلاق M5 لم يؤكد الكسر بعد',0,upper);
 if(latestPrice!=null&&latestPrice<lower)
   return result('TESTING','SELL','السعر يختبر كسرًا هابطًا',
     'إغلاق M5 لم يؤكد الكسر بعد',0,lower);
 const recentUp=recent.some((b:any)=>b.high>upper);
 const recentDown=recent.some((b:any)=>b.low<lower);
 if(recentUp||recentDown){
   const side=recentUp&&!recentDown?'BUY':recentDown&&!recentUp?'SELL':'WAIT';
   return result('REJECTED',side,'اختبار كسر دون ثبات',
     'الذيول عبرت المستوى ثم عاد الإغلاق داخله',0,side==='BUY'?upper:side==='SELL'?lower:null);
 }
 if(latestPrice!=null&&o.atr>0){
   const distUp=(upper-latestPrice)/o.atr,distDown=(latestPrice-lower)/o.atr;
   if(distUp>=0&&distUp<=.45&&distUp<=distDown)
     return result('APPROACH','BUY','اقتراب من مقاومة الكسر',
       'فوق '+fmt(upper)+' · مطلوب إغلاقا M5',0,upper);
   if(distDown>=0&&distDown<=.45&&distDown<distUp)
     return result('APPROACH','SELL','اقتراب من دعم الكسر',
       'تحت '+fmt(lower)+' · مطلوب إغلاقا M5',0,lower);
 }
 return result('RANGE','WAIT','داخل النطاق · لا كسر مؤكد',
   'فوق '+fmt(upper)+' / تحت '+fmt(lower)+' · إغلاقان M5',0,null);
}
