/**
 * Read-only, longer-horizon movement outlook for the sniper chart.
 * Price objectives are literal HIGH/LOW levels from CLOSED M15/H1/H4 bars,
 * not ATR projections, guaranteed fills or a relaxation of entry gates.
 */
export type MovementSide='BUY'|'SELL'|'WAIT';
type Bar={time:number;open:number;high:number;low:number;close:number};
type Frame='M15'|'H1'|'H4';
type Evidence='NONE'|'PARTIAL'|'ALIGNED'|'CONFIRMED'|'QUALIFIED';
export type MovementGoal={
  stage:1|2|3;price:number;source:Frame;distancePct:number;distanceAtr:number
};
export type DistantMovementOutlook={
  side:MovementSide;title:string;strength:string;reason:string;
  targets:MovementGoal[];invalidation:number|null;trigger:number|null;
  atr15:number|null;actionable:false;horizon:'STRUCTURAL';
};
const valid=(b:Bar)=>b!=null&&
  [b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
  b.time>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
  b.low<=Math.min(b.open,b.close);
function closedRows(raw:unknown,period:number,now:number,min:number,age:number){
  if(!Array.isArray(raw))return [] as Bar[];
  const map=new Map<number,Bar>();
  for(const b of raw){
    if(valid(b)&&b.time%period===0&&b.time+period<=now&&
      b.time>=now-20*86400000)map.set(b.time,b);
  }
  const bars=[...map.values()].sort((a,b)=>a.time-b.time);
  const last=bars.at(-1);
  if(bars.length<min||!last||now-(last.time+period)>age)return [] as Bar[];
  const tail=bars.slice(-Math.min(6,bars.length));
  if(tail.some((b,i)=>i>0&&b.time-tail[i-1].time!==period))return [] as Bar[];
  return bars;
}
function averageRange(bars:Bar[],count=14){
  if(bars.length<count+1)return null;
  const changes=bars.slice(1).map((b,i)=>Math.max(
    b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
  const range=changes.slice(-count).reduce((s,x)=>s+x,0)/count;
  return range>0&&Number.isFinite(range)?range:null;
}
const round=(n:number)=>Number(n.toFixed(2));
export function buildDistantMovementOutlook(input:{
  asset:'GOLD'|'BTC';side:MovementSide;price:number|null;now:number;
  priceFresh:boolean;historyFresh:boolean;marketOpen:boolean;providerTransition?:boolean;
  frames:any;evidenceStrength?:Evidence;invalidation?:number|null;trigger?:number|null
}):DistantMovementOutlook{
  const none=(reason:string):DistantMovementOutlook=>({
    side:'WAIT',title:'بانتظار حركة مؤكدة',strength:'لا ترجيح',
    reason,targets:[],invalidation:null,trigger:null,atr15:null,
    actionable:false,horizon:'STRUCTURAL'
  });
  const {price,side,now}=input;
  if(!input.marketOpen||!input.priceFresh||!input.historyFresh||
    input.providerTransition||price==null||!Number.isFinite(price)||price<=0)
    return none('سعر أو شموع غير حديثة، أو مصدر قيد التغيير؛ لا نعرض أهدافًا قديمة');
  if(side==='WAIT')return none('لا يوجد ترجيح اتجاهي كافٍ؛ لا نخترع اتجاهًا أو أهدافًا');
  const frames:Array<{name:Frame;bars:Bar[]}>= [
    {name:'M15',bars:closedRows(input.frames?.m15,900000,now,18,36*60000)},
    {name:'H1',bars:closedRows(input.frames?.h1,3600000,now,12,135*60000)},
    {name:'H4',bars:closedRows(input.frames?.h4,14400000,now,8,9*3600000)}
  ];
  const m15=frames[0].bars,h1=frames[1].bars;
  const atr=averageRange(m15)??(averageRange(h1)!=null?averageRange(h1)!*.45:null);
  if(atr==null||atr<=0)return none('لا توجد بيانات M15/H1 مكتملة لحساب حركة سعرية واقعية');
  const span=Math.max(atr,price*(input.asset==='GOLD'?.00016:.00026));
  // Farther stages require farther REAL pivot levels, not multiplied prices.
  const distanceFloor=Math.max(span*1.45,price*(input.asset==='GOLD'?.00065:.00135));
  const maxDistance=Math.min(span*28,price*(input.asset==='GOLD'?.045:.065));
  const candidates:Array<{price:number;source:Frame;distance:number}>=[];
  const add=(v:number,source:Frame)=>{
    if(!Number.isFinite(v)||v<=0)return;
    const d=side==='BUY'?v-price:price-v;
    if(d>=distanceFloor&&d<=maxDistance)candidates.push({price:v,source,distance:d});
  };
  for(const frame of frames){
    const bars=frame.bars;
    if(!bars.length)continue;
    // Historical swing highs/lows require two CLOSED bars after the pivot.
    for(let i=2;i<bars.length-2;i++){
      const b=bars[i],around=[bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
      if(side==='BUY'&&around.every(x=>b.high>x.high))add(b.high,frame.name);
      if(side==='SELL'&&around.every(x=>b.low<x.low))add(b.low,frame.name);
    }
    for(const window of [12,24,48,96]){
      if(bars.length<window)continue;
      const sample=bars.slice(-window);
      add(side==='BUY'?Math.max(...sample.map(b=>b.high)):
        Math.min(...sample.map(b=>b.low)),frame.name);
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance||
    ({H4:0,H1:1,M15:2}[a.source]-{H4:0,H1:1,M15:2}[b.source]));
  const targets:MovementGoal[]=[];
  const separation=Math.max(span*.66,price*.00024);
  for(const c of candidates){
    if(targets.length===3)break;
    const stage=(targets.length+1) as 1|2|3;
    const last=targets.at(-1);
    const minimum=stage===1?distanceFloor:
      stage===2?Math.max(distanceFloor*1.75,span*2.8,
        Math.abs(last!.price-price)+separation):
        Math.max(distanceFloor*2.5,span*4.4,
        Math.abs(last!.price-price)+separation);
    if(c.distance<minimum||last&&Math.abs(c.price-last.price)<separation)continue;
    targets.push({stage,price:round(c.price),source:c.source,
      distancePct:Number((c.distance/price*100).toFixed(2)),
      distanceAtr:Number((c.distance/span).toFixed(1))});
  }
  const provided=input.invalidation;
  const anchor=side==='BUY'?Math.min(...m15.slice(-10).map(b=>b.low)):
    Math.max(...m15.slice(-10).map(b=>b.high));
  const opposite=(v:number|null|undefined)=>v!=null&&Number.isFinite(v)&&v>0&&
    (side==='BUY'?v<price:v>price)&&Math.abs(v-price)<price*.065;
  const invalidation=opposite(provided)?round(provided!):
    m15.length>=10&&opposite(anchor)?round(anchor):null;
  const trigger=opposite(input.trigger)?null:
    input.trigger!=null&&Number.isFinite(input.trigger)&&input.trigger>0&&
    Math.abs(input.trigger-price)<price*.035?round(input.trigger):null;
  const evidence=input.evidenceStrength??'NONE';
  const strength=evidence==='QUALIFIED'?'شروط السيناريو مكتملة':
    evidence==='CONFIRMED'?'ترجيح فني قوي':evidence==='ALIGNED'?'ترجيح فني متوافق':
    'ميل فني أولي';
  const direction=side==='BUY'?'صعود':'هبوط';
  return {side,title:'توقع الحركة القادمة · '+direction,strength,
    reason:targets.length?
      'أهداف بعيدة من قمم/قيعان M15 وH1 وH4 المغلقة؛ توقيت الوصول غير محدد ولا تعني إشارة تنفيذ':
      'الاتجاه الفني مرصود، لكن لا توجد قمم/قيعان بعيدة كافية؛ لم نختلق أهدافًا',
    targets,invalidation,trigger,atr15:round(atr),
    actionable:false,horizon:'STRUCTURAL'};
}
