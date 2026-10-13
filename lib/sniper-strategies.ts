import {indicators,type Candle,type IndicatorSet} from './engine';
import {assessLiquidityFoundation,type LiquidityContext} from './liquidity-foundation';
import {supertrend} from './trend-confirmation';

type Side='BUY'|'SELL'|'WAIT';
type Strategy={id:string;name:string;state:'CONFIRMED'|'BUILDING'|'WAIT';reason:string;level:number|null};
type FrameReading={side:Side;adx:number;rsi:number;atr:number;ema20:number;ema50:number;plusDI:number;minusDI:number;closedAt:number};
const number=(v:any):number|null=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const rounded=(v:number)=>Number(v.toFixed(2));

// Completed, deduplicated OHLC only. A live/incomplete wick cannot confirm a setup.
function bars(raw:any,now:number,period:number):Candle[]{
  const found=new Map<number,Candle>();
  for(const b of Array.isArray(raw)?raw:[]){
    const t=number(b?.time),o=number(b?.open),h=number(b?.high),l=number(b?.low),c=number(b?.close);
    if(t==null||o==null||h==null||l==null||c==null||t<=0||t%period!==0||
      t+period>now||t<now-14*86400000||l<=0||h<Math.max(o,c)||l>Math.min(o,c))continue;
    found.set(t,{time:t,open:o,high:h,low:l,close:c});
  }
  return [...found.values()].sort((a,b)=>a.time-b.time).slice(-220);
}
const direction=(i:IndicatorSet):Side=>i.ema20>i.ema50&&i.plusDI>i.minusDI?'BUY':
  i.ema20<i.ema50&&i.minusDI>i.plusDI?'SELL':'WAIT';
function reading(i:IndicatorSet,b:Candle[],period:number):FrameReading{
  return {side:direction(i),adx:rounded(i.adx),rsi:rounded(i.rsi),atr:rounded(i.atr),
    ema20:rounded(i.ema20),ema50:rounded(i.ema50),plusDI:rounded(i.plusDI),minusDI:rounded(i.minusDI),
    closedAt:b.at(-1)!.time+period};
}
export function evaluateSniperStrategies(input:{frames:any;now:number;price:number|null;side:Side;
  sourceReady:boolean;targets?:Array<{price:number}>;stop?:number|null;
  liquidityContext?:LiquidityContext|null}){
  const liquidity=assessLiquidityFoundation({context:input.liquidityContext,now:input.now,side:input.side});
  const empty=(reason:string)=>({ready:false,eligible:false,side:input.side,regime:'UNKNOWN' as string,
    regimeLabel:'قراءة غير متاحة',reason,score:null as number|null,frames:null as
      {m5:FrameReading;m15:FrameReading;h1:FrameReading}|null,
    strategies:[] as Strategy[],blockers:[reason],technical:{supertrendM15:'WAIT' as Side,
      supertrendH1:'WAIT' as Side,supertrendM15Line:null as number|null,
      supertrendH1Line:null as number|null,keltnerSqueeze:false,keltnerRelease:false,
      adxSlopeM15:null as number|null},squeezePercentile:null as number|null,
    efficiency:null as number|null,choppiness:null as number|null,extensionAtr:null as number|null,rr:null as number|null,
    liquidity,checkedAt:input.now,confirmedAt:null as number|null});
  const m5=bars(input.frames?.m5,input.now,300000),m15=bars(input.frames?.m15,input.now,900000),
    h1=bars(input.frames?.h1,input.now,3600000);
  if([m5,m15,h1].some(b=>b.length<205))return empty('نحتاج 205 شموع مغلقة لكل إطار M5 / M15 / H1 حتى يعمل EMA200 بدقة');
  const groups=[{rows:m5,period:300000,age:13*60000},{rows:m15,period:900000,age:28*60000},
    {rows:h1,period:3600000,age:120*60000}];
  if(groups.some(g=>input.now-(g.rows.at(-1)!.time+g.period)>g.age))return empty('شموع المؤشرات متأخرة');
  // Check the recent session rather than treating historical market closures as missing bars.
  if(groups.some(g=>g.rows.slice(g.period===3600000?-3:-12).some((b,i,a)=>i>0&&b.time-a[i-1].time>g.period*2)))
    return empty('فجوات في جلسة المؤشرات الحالية');
  const i5=indicators(m5),i15=indicators(m15),i1=indicators(h1);
  if([i5,i15,i1].some(i=>![i.atr,i.adx,i.rsi,i.ema20,i.ema50,i.plusDI,i.minusDI].every(Number.isFinite)||i.atr<=0))
    return empty('مدى السعر أو حساب المؤشرات غير صالح');
  const frames={m5:reading(i5,m5,300000),m15:reading(i15,m15,900000),h1:reading(i1,h1,3600000)};
  // Trend filter is independent of EMA/DMI. It uses completed M15/H1 bars.
  const st15=supertrend(m15),st1=supertrend(h1);
  const previous15=indicators(m15.slice(0,-1));
  const keltner=(i:IndicatorSet)=>Number.isFinite(i.atr)&&i.atr>0&&
    i.bbUpper<i.ema20+1.5*i.atr&&i.bbLower>i.ema20-1.5*i.atr;
  const keltnerNow=keltner(i15),keltnerPrevious=keltner(previous15);
  const previousAdx=indicators(m15.slice(0,-4)).adx;
  const side=input.side,sign=side==='BUY'?1:side==='SELL'?-1:0;
  const price=number(input.price),last=m5.at(-1)!,prev=m5.at(-2)!;
  const widths:number[]=[];
  for(let end=Math.max(20,m15.length-60);end<m15.length;end++){
    const q=indicators(m15.slice(0,end));if(Number.isFinite(q.bbWidth))widths.push(q.bbWidth);
  }
  const percentile=widths.length?100*widths.filter(w=>w<=i15.bbWidth).length/widths.length:100;
  const recent=m15.slice(-21),travel=recent.slice(1).reduce((sum,b,i)=>sum+Math.abs(b.close-recent[i].close),0);
  const efficiency=travel>0?Math.abs(recent.at(-1)!.close-recent[0].close)/travel:0;
  const chopBars=m15.slice(-15),chopWindow=chopBars.slice(1);
  const sumTr=chopWindow.reduce((sum,b,i)=>sum+Math.max(b.high-b.low,
    Math.abs(b.high-chopBars[i].close),Math.abs(b.low-chopBars[i].close)),0);
  const chopRange=Math.max(...chopWindow.map(b=>b.high))-Math.min(...chopWindow.map(b=>b.low));
  const choppiness=chopRange>0&&sumTr>0?Math.max(0,Math.min(100,100*Math.log10(sumTr/chopRange)/Math.log10(14))):100;
  const extension=price!=null&&price>0?Math.abs(price-i5.ema20)/i5.atr:Infinity;
  const shock=last.high-last.low>3*i5.atr||i5.volatility>2.2;
  const trending=i15.adx>=23&&efficiency>=.3&&(choppiness<61.8||efficiency>=.65);
  const squeezed=percentile<=25&&keltnerNow&&i15.adx<26;
  const higherSupertrendOpposed=Boolean(sign&&st1.ready&&st1.side!==side&&i1.adx>=22);
  const trendConfirmed=Boolean(sign&&st15.ready&&st1.ready&&
    st15.side===side&&st1.side===side);
  const prior15=m15.slice(-13,-1),last15=m15.at(-1)!;
  const breakout15=Boolean(sign&&prior15.length===12&&(
    side==='BUY'?last15.close>Math.max(...prior15.map(b=>b.high))+i15.atr*.05:
    last15.close<Math.min(...prior15.map(b=>b.low))-i15.atr*.05));
  const keltnerRelease=Boolean(keltnerPrevious&&!keltnerNow&&breakout15&&
    frames.m15.side===side&&frames.h1.side===side&&!higherSupertrendOpposed&&i15.adx>=18);
  const technical={supertrendM15:st15.side,supertrendH1:st1.side,
    supertrendM15Line:st15.line==null?null:rounded(st15.line),
    supertrendH1Line:st1.line==null?null:rounded(st1.line),
    keltnerSqueeze:keltnerNow,keltnerRelease,adxSlopeM15:Number.isFinite(previousAdx)?
      rounded(i15.adx-previousAdx):null};
  const regime=shock?'SHOCK':trending?'TREND':squeezed?'COMPRESSION':'RANGE';
  const regimeLabel={SHOCK:'تذبذب حاد',TREND:'سوق اتجاهي',COMPRESSION:'انضغاط قبل حركة',RANGE:'تذبذب / توازن'}[regime];
  const aligned=side!=='WAIT'&&frames.m15.side===side&&frames.h1.side===side;
  const higherOpposed=side!=='WAIT'&&frames.h1.side!=='WAIT'&&frames.h1.side!==side;
  const strategies:Strategy[]=[];
  let breakLevel:number|null=null,retest=false;
  if(sign){
    // The breakout must precede the retest. Each reference excludes its own bar.
    for(let index=m5.length-6;index<m5.length-1;index++){
      const prior=m5.slice(index-24,index),b=m5[index];
      const level=side==='BUY'?Math.max(...prior.map(c=>c.high)):Math.min(...prior.map(c=>c.low));
      if(sign*(b.close-level)<=i5.atr*.08)continue;
      const after=m5.slice(index+1),intact=after.every(c=>sign*(c.close-level)>=-i5.atr*.15);
      const touch=after.some(c=>c.low<=level+i5.atr*.3&&c.high>=level-i5.atr*.3);
      if(intact){breakLevel=level;retest=touch&&sign*(last.close-level)>i5.atr*.08&&sign*(last.close-last.open)>0;}
      if(retest)break;
    }
  }
  strategies.push({id:'RETEST',name:'كسر وإعادة اختبار',state:retest&&aligned&&!shock&&!higherSupertrendOpposed?'CONFIRMED':
    breakLevel!=null?'BUILDING':'WAIT',level:breakLevel==null?null:rounded(breakLevel),
    reason:retest?(aligned?'كسر مغلق ثم لمس المستوى وثباته مع M15/H1':'إعادة الاختبار موجودة؛ ننتظر اتفاق M15/H1'):
      breakLevel!=null?'الكسر مرصود؛ ننتظر إعادة اختبار وإغلاق مؤيد':'لم يظهر كسر ثم إعادة اختبار مؤكدة'});
  const beforeSweep=m5.slice(-14,-2),sweepLevel=side==='BUY'?Math.min(...beforeSweep.map(c=>c.low)):
    side==='SELL'?Math.max(...beforeSweep.map(c=>c.high)):null;
  const swept=sign&&sweepLevel!=null&&(side==='BUY'?prev.low<sweepLevel-i5.atr*.08:prev.high>sweepLevel+i5.atr*.08);
  const reclaimed=Boolean(swept&&sign*(prev.close-sweepLevel!)>0&&sign*(last.close-sweepLevel!)>0&&
    sign*(last.close-prev.close)>0&&sign*(last.close-last.open)>0);
  strategies.push({id:'SWEEP',name:'سحب سيولة واسترداد',state:reclaimed&&!higherOpposed&&!higherSupertrendOpposed&&!shock?'CONFIRMED':swept?'BUILDING':'WAIT',
    level:sweepLevel==null?null:rounded(sweepLevel),reason:reclaimed?(higherOpposed?'الاسترداد موجود لكن H1 يعارضه':'سحب طرف النطاق ثم إغلاقان مؤيدان؛ دون معارضة H1'):
      swept?'السحب مرصود؛ نحتاج استردادًا بإغلاقين':'لا سحب مؤكد في آخر شمعتين'});
  const touched=m5.slice(-3).some(b=>b.low<=i5.ema20+i5.atr*.25&&b.high>=i5.ema20-i5.atr*.25);
  const pullback=Boolean(sign&&aligned&&trending&&!higherSupertrendOpposed&&st15.side===side&&touched&&sign*(last.close-i5.ema20)>0&&
    sign*(last.close-prev.close)>0&&sign*(last.close-last.open)>0&&extension<=1.8&&!shock);
  strategies.push({id:'PULLBACK',name:'ارتداد مع الاتجاه',state:pullback?'CONFIRMED':aligned&&trending?'BUILDING':'WAIT',
    level:rounded(i5.ema20),reason:pullback?'عودة إلى EMA20 ثم إغلاق مع اتجاه M15/H1':
      aligned&&trending?'الاتجاه متفق؛ ننتظر رجوعًا وإغلاقًا مؤيدًا':'الاتجاه المتوسط والكبير غير متفق بما يكفي'});
  strategies.push({id:'SQUEEZE',name:'انضغاط وتحرر',state:keltnerRelease?'CONFIRMED':squeezed?'BUILDING':'WAIT',level:null,
    reason:keltnerRelease?'خرج Bollinger من Keltner بعد انضغاط؛ كسر M15 مغلق مع توافق الأطر':
      squeezed?'Bollinger داخل Keltner وعرضه ضمن أدنى 25%؛ ننتظر كسر M15 مغلق':
      'لا تحرر مثبت من انضغاط BB/KC؛ لا دخول بناءً على الضغط وحده'});
  const stop=number(input.stop),target=number(input.targets?.[0]?.price);
  const risk=price!=null&&stop!=null?sign*(price-stop):0;
  const reward=price!=null&&target!=null?sign*(target-price):0;
  const rr=risk>0&&reward>0?reward/risk:null;
  const blockers:string[]=[];
  if(!input.sourceReady)blockers.push('السعر أو لقطة التحليل غير حديثة');
  if(price==null||price<=0||Math.abs(price-last.close)/i5.atr>1.5)blockers.push('سعر اللحظة بعيد عن آخر إغلاق M5');
  if(!sign)blockers.push('لا اتجاه مرشح');
  if(shock)blockers.push('تذبذب حاد؛ انتظار استقرار المدى');
  if(extension>2.5)blockers.push('السعر ممتد عن EMA20؛ تجنب مطاردة الحركة');
  if(higherOpposed)blockers.push('H1 يعارض الاتجاه المرشح');
  if(higherSupertrendOpposed)blockers.push('Supertrend H1 يعارض الاتجاه مع ADX قوي؛ لا دخول جديد');
  if(liquidity.opposing)blockers.push('تعارض مؤكد: سحب سيولة وكسر هيكل ضد الاتجاه؛ لا دخول جديد');
  if(choppiness>=61.8&&efficiency<.3&&strategies.find(s=>s.id==='SWEEP')?.state!=='CONFIRMED')
    blockers.push('تذبذب متداخل؛ نحتاج خروجًا أو استرداد سيولة مؤكدًا');
  if(!strategies.some(s=>s.state==='CONFIRMED'))blockers.push('ننتظر تأكيدًا سعريًا للاستراتيجية');
  if(rr==null||rr<1.35)blockers.push('هدف وإبطال صالحان بعائد/مخاطرة 1.35 على الأقل مطلوبان');
  // Evidence score is not a probability and never increases model confidence.
  const score=Math.min(100,(aligned?30:0)+(trending?15:0)+
    (strategies.some(s=>s.state==='CONFIRMED')?30:0)+(rr!=null&&rr>=1.35?10:0)+
    (!shock&&extension<=2.5?10:0)+(trendConfirmed?5:0));
  return {ready:true,eligible:blockers.length===0,side,regime,regimeLabel,reason:blockers[0]||'تأكيد سعري مع هدف هيكلي؛ يخضع لبقية فلاتر القناص',
    score,frames,strategies,blockers,squeezePercentile:rounded(percentile),efficiency:rounded(efficiency),choppiness:rounded(choppiness),
    extensionAtr:Number.isFinite(extension)?rounded(extension):null,rr:rr==null?null:rounded(rr),
    technical,liquidity,checkedAt:input.now,confirmedAt:last.time+300000};
}
