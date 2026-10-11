/**
 * Always-on MARKET OBSERVATION only. The market bias is independent of
 * qualification for an audited trading scenario. Every distant level comes
 * from completed H1/H4 candle highs/lows; never an ATR price projection.
 */
export type Side='BUY'|'SELL'|'WAIT';
export type FarLevel={stage:1|2|3;price:number;low:number;high:number;quality:number;kind:'STRUCTURAL';source:string;distanceAtr:number};
type Bar={time:number;open:number;high:number;low:number;close:number};
const value=(v:unknown)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const avg=(xs:number[])=>xs.reduce((s,x)=>s+x,0)/Math.max(1,xs.length);
const round=(x:number)=>Number(x.toFixed(2));
function history(raw:any,now:number,period:number):Bar[]{
  const rows=new Map<number,Bar>();
  if(!Array.isArray(raw))return [];
  for(const b of raw){
    const time=value(b?.time),open=value(b?.open),high=value(b?.high),low=value(b?.low),close=value(b?.close);
    if(time==null||open==null||high==null||low==null||close==null||time<=0||
      time+period>now||time<now-9*86400000||low<=0||
      high<Math.max(open,close)||low>Math.min(open,close))continue;
    rows.set(time,{time,open,high,low,close});
  }
  return [...rows.values()].sort((a,b)=>a.time-b.time);
}
function rangeVol(bars:Bar[],length=14){
  if(bars.length<length+1)return null;
  const changes=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
  const a=avg(changes.slice(-length));
  return a>0&&Number.isFinite(a)?a:null;
}
function momentum(rows:Bar[]):number|null{
  if(rows.length<24)return null;
  const b=rows.slice(-24),a=rangeVol(b,14);
  if(a==null)return null;
  const fast=avg(b.slice(-7).map(x=>x.close));
  const slow=avg(b.slice(-21).map(x=>x.close));
  const trend=(fast-slow)/a;
  const position=(b.at(-1)!.close-slow)/a;
  const move=(b.at(-1)!.close-b.at(-10)!.close)/Math.max(a*2,1e-8);
  const score=trend*.45+position*.35+move*.2;
  return Math.max(-1,Math.min(1,score));
}
function aggregateH4(h1:Bar[]){
  const groups=new Map<number,Bar[]>();
  for(const b of h1){
    // UTC 4h candle boundaries. Only FOUR contiguous CLOSED H1 bars qualify.
    const t=Math.floor(b.time/14400000)*14400000;
    const found=groups.get(t)||[];
    found.push(b);groups.set(t,found);
  }
  const output:Bar[]=[];
  for(const [t,items] of groups){
    const s=items.sort((a,b)=>a.time-b.time);
    if(s.length!==4||s[0].time!==t||s.some((b,i)=>b.time!==t+i*3600000))continue;
    output.push({time:t,open:s[0].open,high:Math.max(...s.map(x=>x.high)),
      low:Math.min(...s.map(x=>x.low)),close:s[3].close});
  }
  return output.sort((a,b)=>a.time-b.time);
}
export function buildContinuousBias(input:{
  asset:'GOLD'|'BTC';frames:any;now:number;price:number|null;
  sourceReady:boolean;fourHour?:{ready:boolean;side:Side}|null
}){
  const empty=(reason:string)=>({side:'WAIT' as Side,status:'NO_DATA' as 'LIVE'|'PAUSED'|'NO_DATA',
    label:'البيانات غير كافية',reason,agreement:0,opposition:false,
    votes:{m5:'WAIT' as Side,m15:'WAIT' as Side,h1:'WAIT' as Side,h4:'WAIT' as Side},
    targets:[] as FarLevel[],invalidation:null as number|null,
    lastClosedAt:null as number|null,rangeBound:true,active:false});
  const {now}=input,frames=input.frames||{};
  const m5=history(frames.m5,now,300000),m15=history(frames.m15,now,900000),
    h1=history(frames.h1,now,3600000);
  const h4=aggregateH4(h1);
  const lastClosedAt=m5.length?m5.at(-1)!.time+300000:null;
  if(m5.length<24||m15.length<24||h1.length<24)
    return {...empty('لا توجد شموع كافية للفريمات M5/M15/H1'),lastClosedAt};
  const s5=momentum(m5),s15=momentum(m15),s1=momentum(h1),s4=momentum(h4);
  if(s5==null||s15==null||s1==null)
    return {...empty('شموع اتجاه غير كافية أو متوسط المدى غير صالح'),lastClosedAt};
  const observed=[
    {key:'m5' as const,score:s5,weight:1},
    {key:'m15' as const,score:s15,weight:2},
    {key:'h1' as const,score:s1,weight:3},
    ...(s4!=null?[{key:'h4' as const,score:s4,weight:3}]:[])
  ];
  const vote=(v:number|null):Side=>v==null||Math.abs(v)<.12?'WAIT':v>0?'BUY':'SELL';
  const votes={m5:vote(s5),m15:vote(s15),h1:vote(s1),h4:vote(s4)};
  const fourHour=input.fourHour?.ready&&input.fourHour.side!=='WAIT'?input.fourHour.side:null;
  const weighted=observed.reduce((s,v)=>s+v.score*v.weight,0)+
    (fourHour==null?0:fourHour==='BUY'?.8:-.8);
  const denominator=observed.reduce((s,v)=>s+v.weight,0)+(fourHour==null?0:1);
  const normalized=weighted/denominator;
  const side:Side=normalized>.055?'BUY':normalized<-.055?'SELL':'WAIT';
  const agreement=side==='WAIT'?0:observed.filter(v=>vote(v.score)===side).length+
    (fourHour===side?1:0);
  const opposition=side!=='WAIT'&&
    (observed.some(v=>vote(v.score)!=='WAIT'&&vote(v.score)!==side)||
    (fourHour!=null&&fourHour!==side));
  const fresh=Boolean(lastClosedAt&&now-lastClosedAt<=13*60000&&
    now-(m15.at(-1)!.time+900000)<=28*60000&&
    now-(h1.at(-1)!.time+3600000)<=120*60000);
  const current=input.price!=null&&Number.isFinite(input.price)&&input.price>0?input.price:null;
  const aligned=Boolean(current!=null&&Math.abs(current-m5.at(-1)!.close)/current<.015);
  const active=Boolean(input.sourceReady&&fresh&&aligned);
  const status:'LIVE'|'PAUSED'=active?'LIVE':'PAUSED';
  const reason=!input.sourceReady?'سعر لحظي أو لقطة التحليل غير محدثة':
    !fresh?'شموع الهيكل متأخرة أو السوق مغلق':
    !aligned?'مصدر السعر لا يتفق مع الشموع':opposition?'انحياز مراقبة مع اختلاف بعض الفريمات':
    'انحياز مبني على شموع مكتملة؛ ليس إشارة دخول';
  const label=side==='BUY'?'ميل صعود هيكلي':side==='SELL'?'ميل هبوط هيكلي':'سوق عرضي · لا اتجاه راجح';
  // An old structural bias may be displayed with PAUSED labeling, but never
  // treated as a live watch or used to draw an active forward path.
  if(!active||side==='WAIT'||current==null)
    return {side,status,label,reason,agreement,opposition,votes,
      targets:[] as FarLevel[],invalidation:null,lastClosedAt,rangeBound:side==='WAIT',active};
  const a1=rangeVol(h1)||0,a15=rangeVol(m15)||0;
  if(a1<=0||a15<=0)return {side,status,label,reason,agreement,opposition,votes,
    targets:[] as FarLevel[],invalidation:null,lastClosedAt,rangeBound:false,active};
  const minDistance=Math.max(a1*.72,a15*1.65,current*(input.asset==='BTC'?.0012:.0008));
  const maxDistance=Math.max(a1*16,a15*22,current*(input.asset==='BTC'?.035:.025));
  type Candidate={price:number;source:string;quality:number};
  const candidates:Candidate[]=[];
  const add=(p:number,source:string,quality:number)=>{
    if(!Number.isFinite(p)||p<=0)return;
    const dist=Math.abs(p-current);
    if((side==='BUY'?p>current:p<current)&&dist>=minDistance&&dist<=maxDistance)
      candidates.push({price:p,source,quality});
  };
  const levels=[{bars:h1,label:'H1',quality:72,windows:[12,24,48,96,120]},
    {bars:h4,label:'H4',quality:86,windows:[4,8,12,20,30]}];
  for(const level of levels){
    for(const length of level.windows){
      if(level.bars.length<length)continue;
      const window=level.bars.slice(-length);
      add(side==='BUY'?Math.max(...window.map(b=>b.high)):Math.min(...window.map(b=>b.low)),
        level.label+' · '+length+' شمعة مغلقة',level.quality);
    }
    for(let i=2;i<level.bars.length-2;i++){
      const c=level.bars[i],neighbor=[level.bars[i-2],level.bars[i-1],
        level.bars[i+1],level.bars[i+2]];
      const isPivot=side==='BUY'?neighbor.every(b=>c.high>b.high):
        neighbor.every(b=>c.low<b.low);
      if(isPivot)add(side==='BUY'?c.high:c.low,
        level.label+' · قمة/قاع مؤكد',level.quality-3);
    }
  }
  const tolerance=Math.max(a1*.23,current*.0002);
  // Choose distinct FAR observed structures. Skip levels too close to
  // current price; no fabricated TP2/TP3 when history has none.
  const ordered=candidates.sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current));
  const targets:FarLevel[]=[];
  for(const c of ordered){
    if(targets.length===3)break;
    if(targets.some(t=>Math.abs(t.price-c.price)<Math.max(tolerance,minDistance*.65)))continue;
    const previous=targets.at(-1);
    const dist=Math.abs(c.price-current);
    if(previous&&dist<Math.abs(previous.price-current)+Math.max(a1*.38,minDistance*.52))continue;
    targets.push({stage:(targets.length+1) as 1|2|3,price:round(c.price),
      low:round(c.price),high:round(c.price),kind:'STRUCTURAL',
      quality:c.quality,source:c.source,distanceAtr:round(dist/a15)});
  }
  // Historical H1 swing violation is NOT an exchange order stop.
  const support=h1.slice(-14);
  const threshold=side==='BUY'?Math.min(...support.map(c=>c.low)):Math.max(...support.map(c=>c.high));
  const invalidation=(side==='BUY'?threshold<current:threshold>current)?round(threshold):null;
  return {side,status,label,reason,agreement,opposition,votes,
    targets,invalidation,lastClosedAt,rangeBound:false,active};
}
