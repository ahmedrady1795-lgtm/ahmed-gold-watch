/**
 * M15 watch-only branches calculated from CLOSED, contiguous M15 OHLC.
 * Independent of strict, recorded trade scenarios / AI HTTP health.
 * Values are conditional volatility guides, not future OHLC or order prices.
 */
export type M15GuideBar={time:number;open:number;high:number;low:number;close:number};
export type M15WatchGuide={
 ready:boolean;reason:string;anchor:number|null;anchorTime:number|null;
 up:number[];down:number[];upperTrigger:number|null;lowerTrigger:number|null;
 atr:number|null;bias:'BUY'|'SELL'|'WAIT';referenceOnly:boolean;
};
const empty=(reason:string):M15WatchGuide=>({ready:false,reason,anchor:null,anchorTime:null,
 up:[],down:[],upperTrigger:null,lowerTrigger:null,atr:null,bias:'WAIT',referenceOnly:false});
const med=(a:number[])=>{const b=a.filter(v=>Number.isFinite(v)&&v>0).sort((x,y)=>x-y);return b.length?b[Math.floor((b.length-1)/2)]:0};
const avg=(rows:M15GuideBar[],n:number)=>rows.slice(-n).reduce((a,b)=>a+b.close,0)/n;
export function buildM15WatchGuide(history:readonly M15GuideBar[],now:number):M15WatchGuide{
 if(!Array.isArray(history)||!Number.isFinite(now))return empty('لا توجد شموع M15 موثوقة');
 const last16=history.slice(-16);
 if(last16.length<16)return empty('مطلوب 16 شمعة M15 مغلقة لرسم نطاق المراقبة');
 for(let i=0;i<last16.length;i++){
   const b=last16[i];
   if(!Number.isSafeInteger(b.time)||b.time%900000!==0||b.time+900000>now||
      [b.open,b.high,b.low,b.close].some(v=>!Number.isFinite(v)||v<=0)||
      b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
      (i>0&&b.time<=last16[i-1].time))
     return empty('سلسلة M15 بها شمعة غير صالحة أو توقيت غير مرتب');
 }
 // A provider can omit complete M15 slots. Do not invent OHLC to fill them.
 // Sparse real candles permit a TWO-WAY, reference-only chart watch, never a
 // directional signal, model proof, or broker entry.
 const spans=last16.slice(1).map((b,i)=>b.time-last16[i].time);
 if(spans.some(dt=>dt<900000||dt%900000!==0))
   return empty('سلسلة M15 بها توقيت غير صالح');
 const missing=spans.reduce((n,dt)=>n+dt/900000-1,0);
 if(missing>10)return empty('فجوات كثيرة في شموع M15؛ لا يمكن رسم نطاق موثوق');
 const sparse=missing>0;
 const last=last16[15],anchor=last.close;
 const age=now-(last.time+900000);
 if(age<0||age>3*3600000)return empty('آخر إغلاق M15 أقدم من نافذة المراقبة');
 const ranges=last16.slice(1).map((b,i)=>
   spans[i]===900000?Math.max(b.high-b.low,
     Math.abs(b.high-last16[i].close),Math.abs(b.low-last16[i].close)):
     b.high-b.low);
 const atr=med(ranges);
 if(!(atr>0&&atr<anchor*.06))return empty('تقلب M15 لا يسمح بتقدير نطاق واقعي');
 const ema=(n:number)=>{const k=2/(n+1);let e=last16[0].close;
   for(const b of last16.slice(1))e=e+k*(b.close-e);return e};
 const short=ema(5),long=ema(13);
 const slope=last.close-last16[11].close;
 const bias=sparse?'WAIT':short>long&&slope>atr*.2?'BUY':
   short<long&&slope< -atr*.2?'SELL':'WAIT';
 // The anchor and ATR come from closed M15; they stay unchanged while ticks arrive.
 // Lower/upper are symmetric, not a promised one-way prediction.
 const round=(v:number)=>Number(v.toFixed(6));
 return {ready:true,reason:sparse?
   'فجوات M15 ('+missing+') · مراقبة تاريخية ثنائية فقط، ليست إشارة دخول':
   bias==='WAIT'?'توازن؛ نراقب السيناريوهين':
   bias==='BUY'?'ميل صاعد من إغلاقات M15؛ الهبوط احتمال قائم':
     'ميل هابط من إغلاقات M15؛ الصعود احتمال قائم',
   anchor,anchorTime:last.time,atr:round(atr),bias,
   upperTrigger:round(last.high+atr*.08),lowerTrigger:round(last.low-atr*.08),
   up:[.52,1.03,1.55].map(k=>round(anchor+k*atr)),
   down:[.52,1.03,1.55].map(k=>round(anchor-k*atr)),
   referenceOnly:sparse||age>3600000};
}
