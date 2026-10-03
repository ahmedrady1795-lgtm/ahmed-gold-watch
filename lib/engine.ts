export type Candle={time:number;open:number;high:number;low:number;close:number};
export type Event={id:string;time:number;name:string;importance:number;actual:string;forecast:string;previous:string;source:string;exactTime:boolean};
export type Rules={before:number;after:number;adx:number;spike:number;minScore:number};
export const defaults:Rules={before:15,after:15,adx:22,spike:2,minScore:76};

export type IndicatorSet={
  ema20:number;ema50:number;ema200:number;rsi:number;atr:number;adx:number;plusDI:number;minusDI:number;volatility:number;
  macd:number;macdSignal:number;macdHist:number;bbMid:number;bbUpper:number;bbLower:number;bbWidth:number;stochK:number;stochD:number;
};

const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN;
export function ema(a:number[],n:number){if(a.length<n)return NaN;let x=avg(a.slice(0,n));for(let i=n;i<a.length;i++)x+=2/(n+1)*(a[i]-x);return x;}
function emaAll(a:number[],n:number){const out=new Array(a.length).fill(NaN);if(a.length<n)return out;let x=avg(a.slice(0,n));out[n-1]=x;for(let i=n;i<a.length;i++){x+=2/(n+1)*(a[i]-x);out[i]=x;}return out;}
function rma(a:number[],n:number){if(a.length<n)return NaN;let x=avg(a.slice(0,n));for(let i=n;i<a.length;i++)x=(x*(n-1)+a[i])/n;return x;}
function std(a:number[]){const m=avg(a);return Math.sqrt(avg(a.map(v=>(v-m)**2)));}
function macd(closes:number[]){const a=emaAll(closes,12),b=emaAll(closes,26),line:number[]=[];for(let i=25;i<closes.length;i++)if(Number.isFinite(a[i])&&Number.isFinite(b[i]))line.push(a[i]-b[i]);const signal=ema(line,9),value=line.at(-1)??NaN;return {macd:value,signal,hist:value-signal};}
function stoch(c:Candle[],n=14){const ks:number[]=[];for(let j=Math.max(n-1,c.length-3);j<c.length;j++){const w=c.slice(j-n+1,j+1);if(w.length<n)continue;const hi=Math.max(...w.map(x=>x.high)),lo=Math.min(...w.map(x=>x.low));ks.push(hi===lo?50:100*(c[j].close-lo)/(hi-lo));}return {k:ks.at(-1)??NaN,d:avg(ks.slice(-3))};}
function directional(c:Candle[],n=14){const tr:number[]=[],plus:number[]=[],minus:number[]=[];for(let i=1;i<c.length;i++){const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);}if(tr.length<n*2)return {atr:NaN,adx:NaN,plusDI:NaN,minusDI:NaN};let atr=avg(tr.slice(0,n)),p=avg(plus.slice(0,n)),m=avg(minus.slice(0,n));const dx:number[]=[];for(let i=n;i<tr.length;i++){atr=(atr*(n-1)+tr[i])/n;p=(p*(n-1)+plus[i])/n;m=(m*(n-1)+minus[i])/n;const pdi=atr?100*p/atr:0,mdi=atr?100*m/atr:0;dx.push((pdi+mdi)?100*Math.abs(pdi-mdi)/(pdi+mdi):0);}const adx=rma(dx,n);return {atr,adx,plusDI:atr?100*p/atr:0,minusDI:atr?100*m/atr:0};}
export function indicators(c:Candle[]):IndicatorSet{
  const closes=c.map(x=>x.close),gains:number[]=[],losses:number[]=[];for(let i=1;i<c.length;i++){const d=c[i].close-c[i-1].close;gains.push(Math.max(d,0));losses.push(Math.max(-d,0));}
  const g=rma(gains,14),l=rma(losses,14),rsi=g===0&&l===0?50:l===0?100:100-100/(1+g/l),dir=directional(c,14),mc=macd(closes),bb=closes.slice(-20),mid=avg(bb),sd=std(bb),st=stoch(c),trs:number[]=[];
  for(let i=1;i<c.length;i++)trs.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));
  const recentAtr:number[]=[];for(let i=Math.max(14,trs.length-34);i<trs.length;i++)recentAtr.push(rma(trs.slice(0,i+1),14));const baseline=recentAtr.slice(0,-1).filter(Number.isFinite).sort((a,b)=>a-b),median=baseline.length?baseline[Math.floor(baseline.length/2)]:NaN;
  return {ema20:ema(closes,20),ema50:ema(closes,50),ema200:ema(closes,200),rsi,atr:dir.atr,adx:dir.adx,plusDI:dir.plusDI,minusDI:dir.minusDI,volatility:Number.isFinite(median)&&median>0?dir.atr/median:1,macd:mc.macd,macdSignal:mc.signal,macdHist:mc.hist,bbMid:mid,bbUpper:mid+2*sd,bbLower:mid-2*sd,bbWidth:mid?4*sd/mid:0,stochK:st.k,stochD:st.d};
}
function closed(c:Candle[],ms:number,now:number){return c.filter(x=>x.time+ms<=now);}
function trendLong(i:IndicatorSet,last:number){return i.ema20>i.ema50&&last>i.ema200;}
function trendShort(i:IndicatorSet,last:number){return i.ema20<i.ema50&&last<i.ema200;}
function add(ok:boolean,w:number){return ok?w:0;}
export function scoreFrames(side:'long'|'short',f:{m1:IndicatorSet;m5:IndicatorSet;m15:IndicatorSet;h1:IndicatorSet},last:{m1:number;m5:number;m15:number;h1:number},breakout:boolean){
  const long=side==='long';const t=(i:IndicatorSet,p:number)=>long?trendLong(i,p):trendShort(i,p);const mac=(i:IndicatorSet)=>long?i.macdHist>0:i.macdHist<0;const di=(i:IndicatorSet)=>long?i.plusDI>i.minusDI:i.minusDI>i.plusDI;const rsi=long?f.m5.rsi>=52&&f.m5.rsi<=70:f.m5.rsi<=48&&f.m5.rsi>=30;const sto=long?f.m1.stochK>=45&&f.m1.stochK<=92:f.m1.stochK<=55&&f.m1.stochK>=8;const bb=long?last.m5>f.m5.bbMid&&last.m5<=f.m5.bbUpper*1.002:last.m5<f.m5.bbMid&&last.m5>=f.m5.bbLower*.998;
  return Math.round(add(t(f.m5,last.m5),8)+add(t(f.m15,last.m15),8)+add(t(f.h1,last.h1),8)+add(long?f.m5.ema20>f.m5.ema50:f.m5.ema20<f.m5.ema50,5)+add(long?f.h1.ema20>f.h1.ema50:f.h1.ema20<f.h1.ema50,5)+add(mac(f.m5),9)+add(mac(f.m15),9)+add(rsi,6)+add(f.m5.adx>=20&&di(f.m5),12)+add(sto,5)+add(bb,5)+add(breakout,12)+add(t(f.m1,last.m1)&&mac(f.m1),8));
}

export type RegimeKey='trend_up'|'trend_down'|'range'|'high_vol'|'shock'|'unknown';
export type MarketRegime={key:RegimeKey;label:string;confidence:number;reason:string};
export function detectRegime(f:{m1:IndicatorSet;m5:IndicatorSet;m15:IndicatorSet;h1:IndicatorSet},last5:number,longBreak=false,shortBreak=false):MarketRegime{
  const vals=[f.m5.adx,f.m15.adx,f.h1.adx,f.m5.volatility,f.m5.bbWidth,last5];
  if(vals.some(v=>!Number.isFinite(v)))return {key:'unknown',label:'غير محسوم',confidence:0,reason:'المؤشرات غير مكتملة.'};
  const bull=f.m15.ema20>f.m15.ema50&&f.h1.ema20>f.h1.ema50&&f.m5.plusDI>f.m5.minusDI;
  const bear=f.m15.ema20<f.m15.ema50&&f.h1.ema20<f.h1.ema50&&f.m5.minusDI>f.m5.plusDI;
  const strength=(f.m5.adx+f.m15.adx+f.h1.adx)/3;
  if(f.m5.volatility>=2.2||f.m5.bbWidth>=0.04)return {key:'shock',label:'صدمة / تذبذب استثنائي',confidence:92,reason:'ATR أو اتساع Bollinger أعلى من النطاق الآمن.'};
  if(f.m5.volatility>=1.4||f.m5.bbWidth>=0.022)return {key:'high_vol',label:'تذبذب مرتفع',confidence:Math.min(90,Math.round(55+strength)),reason:'الحركة أسرع من المعتاد؛ يلزم توافق أعلى وتنفيذ أدق.'};
  if(bull&&strength>=21)return {key:'trend_up',label:'اتجاه صاعد',confidence:Math.min(95,Math.round(50+strength)),reason:'EMA واتجاه DI متوافقان صعوداً عبر M15/H1.'};
  if(bear&&strength>=21)return {key:'trend_down',label:'اتجاه هابط',confidence:Math.min(95,Math.round(50+strength)),reason:'EMA واتجاه DI متوافقان هبوطاً عبر M15/H1.'};
  if(strength<20&&!longBreak&&!shortBreak)return {key:'range',label:'سوق عرضي / Range',confidence:Math.min(90,Math.round(75-strength/2)),reason:'ADX ضعيف ولا يوجد كسر نطاق مؤكد.'};
  return {key:'range',label:'انتقال / Range',confidence:58,reason:'الأطر غير متوافقة بما يكفي لتصنيف اتجاه مستقر.'};
}

export function analyze(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[],events:Event[],newsReady:boolean,now:number,r:Rules=defaults){
  const a1=closed(c1,60000,now),a5=closed(c5,300000,now),a15=closed(c15,900000,now),a60=closed(c60,3600000,now);
  const baseStop=(reason:string)=>({state:'stop' as const,title:'توقف عن فتح صفقات',reason,metrics:null,frames:null,levels:null,score:null,regime:null,news:null,signal:null});
  if(a1.length<80||a5.length<220||a15.length<220||a60.length<220)return baseStop('بيانات M1/M5/M15/H1 غير كافية أو غير متصلة.');
  if(now-(a1.at(-1)!.time+60000)>180000||now-(a5.at(-1)!.time+300000)>420000||now-(a15.at(-1)!.time+900000)>1020000||now-(a60.at(-1)!.time+3600000)>4200000)return baseStop('الأسعار متأخرة أو السوق مغلق. لا توجد إشارة صالحة الآن.');
  const i1=indicators(a1),i5=indicators(a5),i15=indicators(a15),i60=indicators(a60),last1=a1.at(-1)!,last5=a5.at(-1)!,last15=a15.at(-1)!,last60=a60.at(-1)!;
  const past=a5.slice(-21,-1),high=Math.max(...past.map(c=>c.high)),low=Math.min(...past.map(c=>c.low)),recent1=a1.slice(-11,-1),high1=Math.max(...recent1.map(c=>c.high)),low1=Math.min(...recent1.map(c=>c.low));
  const levels={high,low,high1,low1,sweep:last5.high>high&&last5.close<high?'اختراق القمة والعودة أسفلها':last5.low<low&&last5.close>low?'كسر القاع والعودة أعلاه':'لا يوجد سحب ظاهر في آخر شمعة M5'};
  const frames={m1:i1,m5:i5,m15:i15,h1:i60},last={m1:last1.close,m5:last5.close,m15:last15.close,h1:last60.close};
  const longBreak=last5.close>high||last1.close>high1,shortBreak=last5.close<low||last1.close<low1,longScore=scoreFrames('long',frames,last,longBreak),shortScore=scoreFrames('short',frames,last,shortBreak),score={long:longScore,short:shortScore,threshold:r.minScore};
  const regime=detectRegime(frames,last5.close,longBreak,shortBreak);
  const base={metrics:i5,frames,levels,score,regime,news:null as any,signal:null as any};
  const newsEvent=newsReady?events.find(e=>e.importance===3&&e.exactTime&&now>=e.time-r.before*60000&&now<=e.time+r.after*60000):undefined;
  if(newsEvent){
    const mins=(now-newsEvent.time)/60000,news={active:true,event:newsEvent,phase:mins<0?'armed':'released',minutesFromRelease:mins};
    const newsBase={...base,news};
    if(mins<0)return {...newsBase,state:'wait' as const,title:'وضع الأخبار متأهب',reason:`${newsEvent.name} خلال ${Math.max(0,Math.ceil(-mins))} دقيقة. لا دخول قبل النتيجة؛ ينتظر المحرك Actual ثم تأكيد M1.`,signal:null};
    if(!newsEvent.actual.trim())return {...newsBase,state:'wait' as const,title:'الخبر صدر · انتظار النتيجة',reason:`${newsEvent.name}: المصدر لم يرسل Actual بعد. لا يتم تخمين النتيجة أو الاتجاه.`,signal:null};
    const pre=a1.filter(c=>c.time+60000<=newsEvent.time).slice(-6),post=a1.filter(c=>c.time>=newsEvent.time&&c.time+60000<=now).slice(-3);
    if(pre.length<4||post.length<1)return {...newsBase,state:'wait' as const,title:'النتيجة وصلت · انتظار أول تأكيد M1',reason:`Actual ${newsEvent.actual} مقابل Forecast ${newsEvent.forecast||'—'}. ننتظر شمعة M1 مغلقة بعد الإصدار قبل أي دخول.`,signal:null};
    const preHigh=Math.max(...pre.map(c=>c.high)),preLow=Math.min(...pre.map(c=>c.low)),reaction=post.at(-1)!,range=reaction.high-reaction.low,body=Math.abs(reaction.close-reaction.open),bodyRatio=range>0?body/range:0,momentum=i1.atr>0?range/i1.atr:0;
    const whipsaw=post.some(c=>c.high>preHigh&&c.low<preLow),newsSide=reaction.close>preHigh?'buy':reaction.close<preLow?'sell':null,best=newsSide==='buy'?longScore:newsSide==='sell'?shortScore:Math.max(longScore,shortScore),opposite=newsSide==='buy'?shortScore:longScore,techGap=Math.abs(best-opposite),newsThreshold=Math.max(68,r.minScore-6);
    if(whipsaw||momentum>4.5)return {...newsBase,state:'wait' as const,title:'خبر قوي · Whipsaw/اندفاع مبالغ',reason:`${newsEvent.name}: الحركة عبرت جانبي نطاق ما قبل الخبر أو تجاوزت حد الاندفاع الآمن (${momentum.toFixed(1)}× ATR M1). لا مطاردة للسعر.`,signal:null};
    if(!newsSide||bodyRatio<.55||momentum<1.1)return {...newsBase,state:'wait' as const,title:'خبر قوي · انتظار كسر مؤكد',reason:`${newsEvent.name}: Actual ${newsEvent.actual} مقابل Forecast ${newsEvent.forecast||'—'}. رد الفعل الحالي لم يغلق خارج نطاق ما قبل الخبر بجسم قوي كفاية.`,signal:null};
    if(best<newsThreshold||techGap<8)return {...newsBase,state:'wait' as const,title:'كسر الخبر موجود · التوافق غير كافٍ',reason:`اتجاه السعر ${newsSide==='buy'?'صاعد':'هابط'} بعد ${newsEvent.name}، لكن التوافق الفني ${best}/100 والفارق ${techGap}؛ يلزم ${newsThreshold}/100 وفارق ≥ 8.`,signal:null};
    const buy=newsSide==='buy',entry=last1.close,postLow=Math.min(...post.map(c=>c.low)),postHigh=Math.max(...post.map(c=>c.high)),rawSl=buy?postLow-.15*i1.atr:postHigh+.15*i1.atr,maxRisk=1.8*i5.atr,minRisk=.45*i5.atr;
    let sl=buy?Math.max(rawSl,entry-maxRisk):Math.min(rawSl,entry+maxRisk),risk=Math.abs(entry-sl);
    if(risk<minRisk){sl=buy?entry-minRisk:entry+minRisk;risk=minRisk;}
    if(risk>0&&risk<=maxRisk*1.000001){const dir=buy?1:-1,newsScore=Math.min(100,Math.round(best+Math.min(8,Math.max(0,(bodyRatio-.55)*20))+Math.min(6,Math.max(0,(momentum-1.1)*3))));return {...newsBase,state:'setup' as const,title:buy?'NEWS MODE · مراقبة شراء':'NEWS MODE · مراقبة بيع',reason:`${newsEvent.name}: Actual ${newsEvent.actual} مقابل Forecast ${newsEvent.forecast||'—'}. السعر أكد ${buy?'صعوداً':'هبوطاً'} بإغلاق M1 خارج نطاق ما قبل الخبر؛ حركة ${momentum.toFixed(1)}× ATR وجسم ${Math.round(bodyRatio*100)}%. التنفيذ يظل مشروطاً بسبريد وTick الوسيط.`,signal:{id:`news:${newsEvent.id}:${last1.time}:${buy?'buy':'sell'}`,mode:'news',eventId:newsEvent.id,eventName:newsEvent.name,actual:newsEvent.actual,forecast:newsEvent.forecast,side:buy?'شراء':'بيع',sideCode:buy?'buy':'sell',entry,sl,tp:entry+dir*1.8*risk,time:last1.time+60000,score:newsScore,technicalScore:best,rr:1.8}};}
    return {...newsBase,state:'wait' as const,title:'NEWS MODE · مخاطرة غير صالحة',reason:'رد الفعل موجود لكن مسافة الوقف الناتجة غير مناسبة بالنسبة إلى ATR الحالي.',signal:null};
  }

  if(i5.atr<=0||i5.volatility>r.spike||last5.high-last5.low>3*i5.atr||regime.key==='shock')return {...baseStop('تذبذب غير طبيعي أو صدمة سوقية خارج نافذة خبر مؤكدة؛ انتظر عودة المدى لطبيعته.'),...base};
  if(i5.adx<r.adx)return {...baseStop('قوة الاتجاه أقل من الحد المحدد حسب ADX؛ لا دخول.'),...base};
  const side=longScore>=shortScore?'buy':'sell',best=Math.max(longScore,shortScore),gap=Math.abs(longScore-shortScore),buySide=side==='buy',regimeThreshold=r.minScore+(regime.key==='range'?6:regime.key==='high_vol'?4:0),regimeSideOk=buySide?regime.key!=='trend_down':regime.key!=='trend_up',rangeBreakOk=regime.key!=='range'||(buySide?longBreak:shortBreak),qualified=best>=regimeThreshold&&gap>=12&&regimeSideOk&&rangeBreakOk;
  if(qualified){const buy=side==='buy',entry=last1.close,recent=a5.slice(-12),swing=buy?Math.min(...recent.map(x=>x.low)):Math.max(...recent.map(x=>x.high)),raw=buy?Math.min(swing,entry-1.2*i5.atr):Math.max(swing,entry+1.2*i5.atr),cap=buy?entry-2.2*i5.atr:entry+2.2*i5.atr,sl=buy?Math.max(raw,cap):Math.min(raw,cap),risk=Math.abs(entry-sl);if(risk>0&&risk<=2.25*i5.atr){const dir=buy?1:-1;return {...base,state:'setup' as const,title:buy?'توافق قوي لمراقبة شراء':'توافق قوي لمراقبة بيع',reason:`درجة التوافق ${best}/100 مع فارق ${gap} نقطة. حالة السوق: ${regime.label}. يلزم بقاء البيانات حديثة والسبريد ضمن الحد.`,signal:{id:String(last1.time)+(buy?'buy':'sell'),mode:'standard',side:buy?'شراء':'بيع',sideCode:buy?'buy':'sell',entry,sl,tp:entry+dir*1.8*risk,time:last1.time+60000,score:best,rr:1.8}};}}
  return {...base,state:'wait' as const,title:'انتظار اكتمال التوافق',reason:`أقوى قراءة الآن ${best}/100 (${longScore} شراء مقابل ${shortScore} بيع). حالة السوق: ${regime.label}. الحد الفعلي الآن ${regimeThreshold}/100 مع فارق اتجاه واضح.`,signal:null};
}
export function surprise(e:Event){if(!e.actual||!e.forecast)return 'لم تصدر نتيجة قابلة للمقارنة بعد.';const rx=/^\s*(-?[\d,.]+)\s*([%KMB]?)\s*$/i,a=e.actual.match(rx),f=e.forecast.match(rx);if(!a||!f||a[2].toUpperCase()!==f[2].toUpperCase())return 'نتيجة تحتاج قراءة تفصيلية؛ لا اتجاه تلقائي.';const delta=Number(a[1].replaceAll(',',''))-Number(f[1].replaceAll(',',''));return delta===0?'النتيجة توافق التوقعات؛ راقب رد فعل السعر.':`النتيجة ${delta>0?'أعلى':'أقل'} من التوقعات. أثرها على الذهب غير محسوم دون العوائد والدولار ورد فعل السعر.`;}
