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
