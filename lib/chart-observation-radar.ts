/**
 * Read-only directional observation on TRUE closed M1 and M5 OHLC.
 * It is deliberately independent from the execution/ML decision engine:
 * no entry, trade alert, confidence percentage, artificial candle or target.
 * Most importantly, qualified scalp risk and OOS kill switches stay intact.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Side='BUY'|'SELL'|'WAIT';
export type ChartObservation={
  status:'UNAVAILABLE'|'RANGE'|'M1_ONLY'|'M5_ONLY'|'ALIGNED'|'CONFLICT';
  side:Side;m1Side:Side;m5Side:Side;
  title:string;reason:string;m1AgeMs:number|null;m5AgeMs:number|null;
  actionable:false;
};
const okay=(b:Bar)=>b!=null&&
  [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.time>0&&
  b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
const middle=(numbers:number[])=>{
  const a=numbers.filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
  if(!a.length)return 0;
  const n=a.length;return n%2?a[Math.floor(n/2)]:(a[n/2-1]+a[n/2])/2;
};
const signed=(v:number,threshold:number):Side=>
  v>threshold?'BUY':v<-threshold?'SELL':'WAIT';
const name=(s:Side)=>s==='BUY'?'صعود':s==='SELL'?'هبوط':'حياد';
function frame(rows:unknown,period:number,now:number,count:number,maxAge:number){
  if(!Array.isArray(rows))return {valid:false,age:null as number|null,bars:[] as Bar[]};
  const eligible=rows.filter((x):x is Bar=>okay(x)&&x.time%period===0&&
    x.time+period<=now&&now-x.time<=24*3600000)
    .sort((a,b)=>a.time-b.time);
  const latest=eligible.at(-1);
  const age=latest?now-(latest.time+period):null;
  const bars=eligible.slice(-count);
  const valid=bars.length===count&&age!=null&&age>=0&&age<=maxAge&&
    bars.every((b,i)=>i===0||b.time-bars[i-1].time===period);
  return {valid,age,bars};
}
export function assessChartObservation(input:{
  now:number;priceFresh:boolean;historyFresh:boolean;
  m1:unknown;m5:unknown;marketOpen?:boolean;
}):ChartObservation{
  const m1=frame(input.m1,60000,input.now,14,180000);
  const m5=frame(input.m5,300000,input.now,26,360000);
  const output=(status:ChartObservation['status'],side:Side,m1Side:Side,m5Side:Side,
    title:string,reason:string):ChartObservation=>({
    status,side,m1Side,m5Side,title,reason,
    m1AgeMs:m1.age,m5AgeMs:m5.age,actionable:false
  });
  if(input.marketOpen===false)return output('UNAVAILABLE','WAIT','WAIT','WAIT',
    'الجلسة مغلقة','لا توجد إشارة حية أثناء إغلاق السوق');
  if(!input.priceFresh)return output('UNAVAILABLE','WAIT','WAIT','WAIT',
    'السعر اللحظي غير موثوق','مراقبة آخر أسعار محفوظة فقط حتى عودة السعر الحي');
  if(!input.historyFresh||!m1.valid)return output('UNAVAILABLE','WAIT','WAIT','WAIT',
    'شموع M1 غير حديثة أو غير متصلة','الرسم التاريخي متاح، لكن رصد اتجاه M1 ينتظر 14 شمعة مغلقة متصلة');
  if(!m5.valid)return output('UNAVAILABLE','WAIT','WAIT','WAIT',
    'انتظار سياق M5','نحتاج 26 شمعة M5 مغلقة متصلة وحديثة قبل عرض اتجاه متوافق');
  const b1=m1.bars,b5=m5.bars;
  const atr1=middle(b1.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-b1[i].close),Math.abs(b.low-b1[i].close))));
  const atr5=middle(b5.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-b5[i].close),Math.abs(b.low-b5[i].close))));
  if(atr1<=0||atr5<=0)return output('UNAVAILABLE','WAIT','WAIT','WAIT',
    'التذبذب غير كافٍ','لا توجد حركة سعرية كافية لتحليل اتجاه واضح');
  const m1Side=signed(b1.at(-1)!.close-b1.at(-5)!.close,atr1*.38);
  // M5 direction uses ONLY completed bars and real price displacement.
  const short=b5.slice(-8).reduce((a,b)=>a+b.close,0)/8;
  const long=b5.slice(-21).reduce((a,b)=>a+b.close,0)/21;
  const m5Side=signed(short-long,atr5*.23);
  if(m5Side==='WAIT'&&m1Side==='WAIT')return output('RANGE','WAIT',m1Side,m5Side,
    'توازن M1/M5','لا توجد حركة مؤكدة الاتجاه من الإغلاقات الأخيرة');
  if(m5Side==='WAIT')return output('M1_ONLY',m1Side,m1Side,m5Side,
    'رصد '+name(m1Side)+' على M1','إشارة رصد سريعة فقط؛ سياق M5 لم يحدد اتجاهًا واضحًا');
  if(m1Side==='WAIT')return output('M5_ONLY',m5Side,m1Side,m5Side,
    'ميل '+name(m5Side)+' على M5','M1 لم يؤكد الاتجاه؛ ننتظر توافق شموع مغلقة');
  if(m1Side!==m5Side)return output('CONFLICT','WAIT',m1Side,m5Side,
    'تعارض M1 وM5','M1 يشير إلى '+name(m1Side)+' بينما M5 يشير إلى '+name(m5Side));
  return output('ALIGNED',m5Side,m1Side,m5Side,
    'رصد '+name(m5Side)+' متوافق M1/M5',
    'توافق اتجاهي مرصود فقط؛ لا يثبت فرصة دخول أو جدوى بعد التكاليف');
}

/** Structural target *watch*, not a qualified trade plan. Each objective must
 * equal a HIGH or LOW of a genuine closed M15/H1 candle that existed before
 * the current quote. Never synthesize TP2/TP3 or imply price will reach it.
 */
export function observedStructuralTargets(input:{
  now:number;price:number|null;side:Side;priceFresh:boolean;historyFresh:boolean;
  m15:unknown;h1:unknown;
}):Array<{stage:1|2|3;price:number;source:'M15'|'H1';kind:'OBSERVED'}>{
  const {price,side,now}=input;
  if(!input.priceFresh||!input.historyFresh||side==='WAIT'||price==null||
    !Number.isFinite(price)||price<=0)return [];
  const frames=[
    {name:'M15' as const,period:900000,ageLimit:35*60000,rows:input.m15},
    {name:'H1' as const,period:3600000,ageLimit:135*60000,rows:input.h1}
  ];
  const choices:Array<{price:number;source:'M15'|'H1'}>=[];
  for(const frameDef of frames){
    const raw=frameDef.rows;
    if(!Array.isArray(raw))continue;
    const bars=raw.filter((b):b is Bar=>okay(b)&&b.time%frameDef.period===0&&
      b.time+frameDef.period<=now&&b.time>=now-12*86400000)
      .sort((a,b)=>a.time-b.time);
    const recent=bars.slice(-Math.min(26,bars.length));
    if(recent.length<14||now-(recent.at(-1)!.time+frameDef.period)>frameDef.ageLimit||
      recent.some((b,i)=>i>0&&b.time-recent[i-1].time!==frameDef.period))continue;
    const minDistance=price*.00016;
    for(const b of bars.slice(-120)){
      const level=side==='BUY'?b.high:b.low;
      const distance=(side==='BUY'?level-price:price-level);
      if(distance>minDistance&&distance<price*.032)
        choices.push({price:level,source:frameDef.name});
    }
  }
  choices.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price)||
    (a.source==='H1'?-1:1));
  const selected:typeof choices=[];
  const separation=price*.00024;
  for(const candidate of choices){
    if(selected.some(s=>Math.abs(candidate.price-s.price)<separation))continue;
    selected.push(candidate);
    if(selected.length>=3)break;
  }
  return selected.map((c,i)=>({
    stage:(i+1) as 1|2|3,price:Number(c.price.toFixed(2)),
    source:c.source,kind:'OBSERVED' as const
  }));
}
