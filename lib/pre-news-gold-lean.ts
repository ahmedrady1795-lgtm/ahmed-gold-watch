// Pre-release XAUUSD price-action lean. This is NOT a prediction of the
// undisclosed economic Actual, a probability or an automatic trade signal.
// All evidence must come from CLOSED, recent, consecutive M1 price candles.
export type PreNewsCandle={
  time:number;open:number;high:number;low:number;close:number;
  tickVolume?:number;realVolume?:number;
};
export type PreNewsLean={
  visible:boolean;minutesLeft:number;phase:'BEFORE_15'|'BEFORE_10'|'BEFORE_5'|'RELEASED';
  side:'UP'|'DOWN'|'WAIT';quality:'MEDIUM'|'STRONG'|'NONE';
  reason:string; evidence:string;
};
const noLean=(mins:number,phase:PreNewsLean['phase'],reason:string):PreNewsLean=>({
  visible:phase!=='RELEASED'&&mins<=15&&mins>0,minutesLeft:mins,phase,side:'WAIT',
  quality:'NONE',reason,evidence:'لا تتوفر قراءة حركة موثوقة'
});
const valid=(c:PreNewsCandle)=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&
  c.time>0&&c.time%60000===0&&c.low>0&&c.high>=Math.max(c.open,c.close)&&
  c.low<=Math.min(c.open,c.close);

export function buildPreNewsGoldLean(input:{
  eventTime:number;now:number;candles:PreNewsCandle[]|unknown;
  source?:string;providerTransition?:boolean;
}):PreNewsLean{
  const {eventTime,now,source='',providerTransition=false}=input;
  const delta=eventTime-now;
  if(!Number.isFinite(delta)||delta<=0)
    return {...noLean(0,'RELEASED','صدر الخبر؛ يلزم الاعتماد على النتيجة ورد الفعل الآن'),visible:false};
  const minutesLeft=Math.max(1,Math.ceil(delta/60000));
  const phase:PreNewsLean['phase']=minutesLeft<=5?'BEFORE_5':minutesLeft<=10?'BEFORE_10':'BEFORE_15';
  if(minutesLeft>15)return {...noLean(minutesLeft,phase,'يبدأ الترجيح قبل الخبر بـ15 دقيقة'),visible:false};
  if(providerTransition||/proxy|GC=F|COMEX/i.test(source))
    return noLean(minutesLeft,phase,'مصدر الذهب غير مستقر أو مؤشر بديل عن XAUUSD');
  if(!Array.isArray(input.candles))
    return noLean(minutesLeft,phase,'شموع الذهب M1 غير متاحة');
  const bars=input.candles.filter((x):x is PreNewsCandle=>
    x!==null&&typeof x==='object'&&valid(x as PreNewsCandle)&&
    x.time+60000<=now&&x.time+60000<=eventTime).slice(-22);
  if(bars.length<17)return noLean(minutesLeft,phase,'لا توجد 17 شمعة M1 مقفولة وصالحة');
  const last=bars[bars.length-1],first=bars[bars.length-17],past5=bars[bars.length-6];
  if(now-(last.time+60000)>90000||last.time+60000>now)
    return noLean(minutesLeft,phase,'آخر شمعة مقفولة للذهب متأخرة');
  if(bars.slice(-17).some((b,i,a)=>i>0&&b.time-a[i-1].time!==60000))
    return noLean(minutesLeft,phase,'فجوة زمنية في شموع الذهب');
  const recent=bars.slice(-16);
  const tr=recent.map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-(i?recent[i-1].close:first.close)),
    Math.abs(b.low-(i?recent[i-1].close:first.close))));
  const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
  if(!Number.isFinite(atr)||atr<=0)
    return noLean(minutesLeft,phase,'التذبذب غير كافٍ لقياس الاتجاه');
  const fast=(last.close-past5.close)/atr;
  const broad=(last.close-first.close)/atr;
  const fastSign=Math.sign(fast),broadSign=Math.sign(broad);
  if(fastSign!==broadSign||Math.abs(fast)<0.65||Math.abs(broad)<1.1){
    return {...noLean(minutesLeft,phase,'اتجاه آخر 5 دقائق غير متوافق مع آخر 16 دقيقة'),evidence:
      'لا يوجد توافق كافٍ بين الزخم القصير وحركة الذهب الأوسع'};
  }
  const side:PreNewsLean['side']=fastSign>0?'UP':'DOWN';
  const strong=Math.abs(fast)>=1.5&&Math.abs(broad)>=2.2;
  return {
    visible:true,minutesLeft,phase,side,quality:strong?'STRONG':'MEDIUM',
    reason:side==='UP'?'حركة الذهب تميل للصعود قبل الإعلان':'حركة الذهب تميل للهبوط قبل الإعلان',
    evidence:strong?'زخم M1 و16 دقيقة متفقان بقوة قياسًا بتذبذب الذهب':
      'زخم M1 و16 دقيقة متفقان؛ الانعكاس بعد الخبر وارد'
  };
}
