/**
 * Causal professional move map: CLOSED exchange/broker candles only.
 * Scores quantify technical agreement, never calibrated success odds.
 * This module does not place or authorize orders by itself.
 */
export type MoveSide='BUY'|'SELL'|'WAIT';
type Ohlc={time:number;open:number;high:number;low:number;close:number};
type Frames={m1?:unknown;m5?:unknown;m15?:unknown;h1?:unknown};
export type ProfessionalMove={
  status:'WAIT'|'WATCH'|'CONFIRMED';side:MoveSide;score:number;
  dataReady:boolean;closedAt:number|null;lastBarAgeMs:number|null;
  timeframeAgreement:{m5:MoveSide;m15:MoveSide;h1:MoveSide};
  regime:'TREND'|'RANGE'|'VOLATILE'|'UNKNOWN';m5Atr:number|null;
  rsiM5:number|null;adxM5:number|null;
  trigger:number|null;invalidation:number|null;
  confirmedAt:number|null;range15m:{low:number;high:number}|null;
  reason:string;qualityLabel:string;notice:string;
};
const threshold={m1:{ms:60000,maxAge:150000},m5:{ms:300000,maxAge:480000},
  m15:{ms:900000,maxAge:1320000},h1:{ms:3600000,maxAge:5100000}};
function bars(raw:unknown,ms:number,now:number){
  if(!Array.isArray(raw))return [] as Ohlc[];
  const seen=new Map<number,Ohlc>();
  for(const row of raw){
    const time=Number(row?.time),open=Number(row?.open),high=Number(row?.high),
      low=Number(row?.low),close=Number(row?.close);
    if(![time,open,high,low,close].every(Number.isFinite)||
      time<=0||time%ms!==0||time+ms>now||time<now-14*86400000||
      low<=0||high<Math.max(open,close)||low>Math.min(open,close))continue;
    seen.set(time,{time,open,high,low,close});
  }
  return [...seen.values()].sort((a,b)=>a.time-b.time).slice(-230);
}
function latestContinuous(list:Ohlc[],ms:number){
  let i=list.length-1;
  while(i>0&&list[i].time-list[i-1].time===ms)i--;
  return list.slice(i);
}
function ema(xs:number[],period:number){
  if(xs.length<period)return null;
  let e=xs.slice(0,period).reduce((s,n)=>s+n,0)/period;
  const alpha=2/(period+1);
  for(const x of xs.slice(period))e+=alpha*(x-e);
  return e;
}
function atr(cs:Ohlc[],period=14){
  if(cs.length<period+1)return null;
  const vals=cs.slice(-period).map((c,i)=>{
    const prev=cs[cs.length-period+i-1].close;
    return Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev));
  });
  return vals.reduce((s,v)=>s+v,0)/vals.length;
}
function rsi(cs:Ohlc[],period=14){
  if(cs.length<period+1)return null;
  let gain=0,loss=0;
  for(let i=cs.length-period;i<cs.length;i++){
    const d=cs[i].close-cs[i-1].close;
    if(d>0)gain+=d;else loss-=d;
  }
  if(gain===0&&loss===0)return 50;
  if(loss===0)return 100;
  return 100-100/(1+gain/loss);
}
function bias(cs:Ohlc[]):MoveSide{
  if(cs.length<62)return 'WAIT';
  const closes=cs.map(x=>x.close);
  const fast=ema(closes,21),slow=ema(closes,55),prior=ema(closes.slice(0,-3),21);
  const volatility=atr(cs);
  if(fast==null||slow==null||prior==null||!volatility)return 'WAIT';
  const spread=Math.abs(fast-slow);
  if(spread<.05*volatility||Math.abs(fast-prior)<.035*volatility)return 'WAIT';
  if(fast>slow&&fast>prior&&closes.at(-1)!>fast)return 'BUY';
  if(fast<slow&&fast<prior&&closes.at(-1)!<fast)return 'SELL';
  return 'WAIT';
}
const round=(v:number)=>Number(v.toFixed(v>=1000?2:v>=10?3:5));
const unknown=(reason:string,agreement:{m5:MoveSide;m15:MoveSide;h1:MoveSide}={m5:'WAIT',m15:'WAIT',h1:'WAIT'}):ProfessionalMove=>({
  status:'WAIT',side:'WAIT',score:0,dataReady:false,closedAt:null,lastBarAgeMs:null,
  timeframeAgreement:agreement,regime:'UNKNOWN',m5Atr:null,rsiM5:null,adxM5:null,
  trigger:null,invalidation:null,confirmedAt:null,range15m:null,
  reason,qualityLabel:'غير مؤهل',notice:'قوة التوافق ليست احتمال ربح. لا تنفيذ دون تحقق الوسيط والحدود.'
});
export function evaluateProfessionalMove(input:{now:number;frames:Frames;adxM5?:unknown}):ProfessionalMove{
  const now=input.now;
  if(!Number.isFinite(now)||now<=0)return unknown('الوقت غير صالح');
  const a=bars(input.frames.m1,threshold.m1.ms,now);
  const b=bars(input.frames.m5,threshold.m5.ms,now);
  const c=bars(input.frames.m15,threshold.m15.ms,now);
  const d=bars(input.frames.h1,threshold.h1.ms,now);
  const groups=[a,b,c,d];
  const configs=[threshold.m1,threshold.m5,threshold.m15,threshold.h1];
  if(groups.some((cs,i)=>cs.length<(i===0?3:68)||
      now-(cs.at(-1)!.time+configs[i].ms)>configs[i].maxAge||
      now<cs.at(-1)!.time+configs[i].ms))
    return unknown('شموع M1/M5/M15/H1 غير كافية أو متأخرة؛ التوقع متوقف');
  const [m5,m15,h1]=[latestContinuous(b,300000),latestContinuous(c,900000),latestContinuous(d,3600000)];
  // The last two M5 closes must be consecutive to qualify a breakout.
  if(m5.length<2)return unknown('فجوة في إغلاق M5؛ لا تأكيد كسر');
  const f5=bias(b),f15=bias(c),f1=bias(d),agreement={m5:f5,m15:f15,h1:f1};
  const vol=atr(b),indicatorRsi=rsi(b),adx=Number(input.adxM5);
  const safeAdx=Number.isFinite(adx)&&adx>0&&adx<=100?adx:null;
  if(!vol||vol<=0)return unknown('ATR غير صالح',agreement);
  const last=b.at(-1)!;
  const window=b.slice(-16,-2);
  if(window.length<14)return unknown('لا توجد مستويات هيكلية كافية',agreement);
  const upper=Math.max(...window.map(v=>v.high))+vol*.10;
  const lower=Math.min(...window.map(v=>v.low))-vol*.10;
  const recent=m5.slice(-2);
  const up=recent.every(v=>v.close>upper);
  const down=recent.every(v=>v.close<lower);
  const side:MoveSide=f5!== 'WAIT'&&f5===f15&&f15===f1?f5:'WAIT';
  const atrPct=vol/last.close*100;
  const regime=atrPct>1.4?'VOLATILE':side!=='WAIT'&&safeAdx!=null&&safeAdx>=18?'TREND':'RANGE';
  const rsiOk=indicatorRsi!=null&&
    (side==='BUY'?indicatorRsi>=48&&indicatorRsi<=78:
      side==='SELL'?indicatorRsi>=22&&indicatorRsi<=52:false);
  const adxOk=safeAdx==null||safeAdx>=18;
  const conflictingBreakout=side==='BUY'?down:side==='SELL'?up:false;
  const confirmed=side==='BUY'?up:side==='SELL'?down:false;
  const lastPrice=a.at(-1)!.close;
  // Very large dislocations and price far past the breakout are not "better" opportunities.
  const crossed=side==='BUY'?lastPrice>upper:side==='SELL'?lastPrice<lower:false;
  const extended=side==='BUY'?lastPrice>upper+1.6*vol:side==='SELL'?lastPrice<lower-1.6*vol:false;
  let score=side==='WAIT'?0:58+(rsiOk?9:0)+(adxOk?8:0)+
    (confirmed?10:0)+(atrPct<.6?5:0)+(crossed?5:0);
  if(side==='WAIT'||!rsiOk||!adxOk||extended||conflictingBreakout||atrPct>1.4)score=Math.min(score,62);
  const status=side==='WAIT'||score<68?'WAIT':confirmed?'CONFIRMED':'WATCH';
  const trigger=side==='BUY'?upper:side==='SELL'?lower:null;
  const recentLow=Math.min(...b.slice(-6).map(v=>v.low)),recentHigh=Math.max(...b.slice(-6).map(v=>v.high));
  const invalidation=side==='BUY'?Math.min(recentLow,lastPrice-vol*.8)-vol*.10:
    side==='SELL'?Math.max(recentHigh,lastPrice+vol*.8)+vol*.10:null;
  const reason=side==='WAIT'?'الفريمات M5/M15/H1 غير متفقة على اتجاه واضح':
    atrPct>1.4?'التذبذب أعلى من الحد المقبول لتأكيد مسار':'';
  const reasonText=reason||(!rsiOk?'RSI يعارض الاتجاه أو السوق ممتد':
    !adxOk?'قوة الاتجاه ADX ضعيفة':
    extended?'السعر ابتعد عن نقطة الكسر؛ ممنوع مطاردة الحركة':
    conflictingBreakout?'السعر اخترق عكس اتجاه الفريمات':
    status==='CONFIRMED'?'إغلاق شمعتَي M5 وراء مستوى الكسر مع توافق M15/H1؛ راجع الفارق السعري والوسيط قبل الدخول':
    status==='WATCH'?'الفريمات متفقة؛ نراقب إغلاق شمعتَي M5 وراء المستوى': 'لم تكتمل الأدلة بعد');
  const bounds=c.slice(-12);
  return {status,side:status==='WAIT'?'WAIT':side,score:Math.round(score),
    dataReady:true,closedAt:last.time+300000,lastBarAgeMs:now-(last.time+300000),
    timeframeAgreement:agreement,regime,m5Atr:round(vol),rsiM5:indicatorRsi==null?null:round(indicatorRsi),
    adxM5:safeAdx,trigger:trigger==null?null:round(trigger),
    invalidation:invalidation==null?null:round(invalidation),
    confirmedAt:status==='CONFIRMED'?last.time+300000:null,
    range15m:bounds.length?{low:round(Math.min(...bounds.map(v=>v.low))),
      high:round(Math.max(...bounds.map(v=>v.high)))}:null,
    score:Math.round(score),reason:reasonText,
    qualityLabel:status==='CONFIRMED'?'توافق فني مرتفع':status==='WATCH'?'ترقب كسر مشروط':'توافق غير كافٍ',
    notice:'مقياس القوة هنا توافق فني وليس احتمالية نجاح. تأكيد الكسر لا يكفي لتنفيذ صفقة حقيقية.'
  };
}
