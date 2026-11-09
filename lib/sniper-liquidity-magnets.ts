import type {M15GuideBar} from './sniper-m15-watch-guide';

/**
 * Repeated completed M15 swing tests are a PROXY for liquidity interest.
 * They do not reveal institutional stops, live order book, or a future sweep.
 * New evidence can only be formed after 2 candles close to the right
 * of a pivot. Source gaps, incomplete OHLC and stale data fail closed.
 */
export type LiquidityMagnet={
  side:'ABOVE'|'BELOW';price:number;touches:number;
  firstConfirmedAt:number;lastConfirmedAt:number;distanceAtr:number;
  source:'REPEATED_M15_SWINGS';notOrderBook:true;
};
export type LiquidityMagnetView={
  ready:boolean;reason:string;sourceAt:number|null;atr:number|null;
  above:LiquidityMagnet|null;below:LiquidityMagnet|null;
  sweep:'HIGH_RECLAIMED_DOWN'|'LOW_RECLAIMED_UP'|'NONE';
  imbalance:'ABOVE'|'BELOW'|'BALANCED'|'UNAVAILABLE';
  notTradeSignal:true;
};
const empty=(reason:string):LiquidityMagnetView=>({
  ready:false,reason,sourceAt:null,atr:null,above:null,below:null,
  sweep:'NONE',imbalance:'UNAVAILABLE',notTradeSignal:true
});
const rounded=(v:number)=>Number(v.toFixed(6));
export function detectLiquidityMagnets(
  input:readonly M15GuideBar[],now:number,window=64
):LiquidityMagnetView{
  if(!Number.isFinite(now))return empty('وقت المصدر غير صالح');
  // Use the newest contiguous CLOSED run only. A weekend/session gap
  // outside that run must not disable 32+ valid recent M15 candles.
  // Never stitch disjoint runs or silently bypass a gap in the recent 32.
  const candidate=input.slice(-Math.max(32,Math.min(96,Math.floor(window)||64)));
  if(candidate.length<32)return empty('نحتاج 32 شمعة M15 مغلقة');
  const valid=(b:M15GuideBar)=>
    Number.isSafeInteger(b.time)&&b.time%900000===0&&
    b.time+900000<=now&&[b.open,b.high,b.low,b.close].every(v=>
      Number.isFinite(v)&&v>0)&&b.high>=Math.max(b.open,b.close)&&
    b.low<=Math.min(b.open,b.close)&&b.low<=b.high;
  let start=candidate.length;
  for(let i=candidate.length-1;i>=0;i--){
    const b=candidate[i];
    if(!valid(b)||(i<candidate.length-1&&
        candidate[i+1].time-b.time!==900000))break;
    start=i;
  }
  const rows=candidate.slice(start);
  if(rows.length<32)return empty('نحتاج 32 شمعة M15 مغلقة ومتجاورة بعد آخر فجوة');
  const end=rows.at(-1)!;
  const age=now-(end.time+900000);
  if(age<0||age>3600000)return empty('قمم وقيعان M15 قديمة للمراقبة الحالية');
  const tr=rows.slice(-20).slice(1).map((b,i,a)=>{
    const prev=rows[rows.length-20+i];
    return Math.max(b.high-b.low,Math.abs(b.high-prev.close),
      Math.abs(b.low-prev.close));
  });
  const atr=tr.reduce((sum,v)=>sum+v,0)/tr.length;
  if(!Number.isFinite(atr)||atr<=0||atr>=end.close*.06)
    return empty('تذبذب M15 غير صالح');
  type Pivot={side:'ABOVE'|'BELOW';level:number;confirmedAt:number;index:number};
  const pivots:Pivot[]=[];
  for(let i=2;i<rows.length-2;i++){
    const c=rows[i],prev=rows.slice(i-2,i),later=rows.slice(i+1,i+3);
    if(prev.every(b=>c.high>b.high)&&later.every(b=>c.high>=b.high))
      pivots.push({side:'ABOVE',level:c.high,
        confirmedAt:rows[i+2].time+900000,index:i});
    if(prev.every(b=>c.low<b.low)&&later.every(b=>c.low<=b.low))
      pivots.push({side:'BELOW',level:c.low,
        confirmedAt:rows[i+2].time+900000,index:i});
  }
  const tolerance=Math.max(atr*.18,end.close*.000006);
  const magnet=(side:'ABOVE'|'BELOW'):LiquidityMagnet|null=>{
    const available=pivots.filter(p=>p.side===side&&
      (side==='ABOVE'?p.level>end.close+atr*.035:
        p.level<end.close-atr*.035));
    type Cluster={xs:Pivot[];center:number};
    const clusters:Cluster[]=[];
    for(const p of available){
      const c=clusters.find(c=>Math.abs(c.center-p.level)<=tolerance&&
        Math.abs(c.xs.at(-1)!.index-p.index)>=3);
      if(c){c.xs.push(p);c.center=c.xs.reduce((a,v)=>a+v.level,0)/c.xs.length;}
      else clusters.push({xs:[p],center:p.level});
    }
    const selected=clusters.filter(c=>c.xs.length>=2)
      .sort((a,b)=>Math.abs(a.center-end.close)-Math.abs(b.center-end.close)||
        b.xs.length-a.xs.length)[0];
    if(!selected)return null;
    return {side,price:rounded(selected.center),touches:selected.xs.length,
      firstConfirmedAt:selected.xs[0].confirmedAt,
      lastConfirmedAt:selected.xs.at(-1)!.confirmedAt,
      distanceAtr:rounded(Math.abs(selected.center-end.close)/atr),
      source:'REPEATED_M15_SWINGS',notOrderBook:true};
  };
  const above=magnet('ABOVE'),below=magnet('BELOW');
  const highs=rows.slice(-15,-1),h=Math.max(...highs.map(b=>b.high));
  const lo=Math.min(...highs.map(b=>b.low));
  const highRejected=end.high>h+atr*.025&&end.close<h&&
    end.close<end.open;
  const lowReclaimed=end.low<lo-atr*.025&&end.close>lo&&
    end.close>end.open;
  const sweep=highRejected&&!lowReclaimed?'HIGH_RECLAIMED_DOWN':
    lowReclaimed&&!highRejected?'LOW_RECLAIMED_UP':'NONE';
  // Which *observed* repeated-level cluster is nearer to current price?
  // This is NOT a vote that the market must move toward that cluster.
  const imbalance=above&&below?
    above.distanceAtr<below.distanceAtr*.7?'ABOVE':
      below.distanceAtr<above.distanceAtr*.7?'BELOW':'BALANCED':
    above?'ABOVE':below?'BELOW':'UNAVAILABLE';
  return {ready:true,reason:above||below?
      'قمم وقيعان أُعيد اختبارها تاريخيًا':'لا تتوفر تجمعات قمم أو قيعان متكررة',
    sourceAt:end.time+900000,atr:rounded(atr),
    above,below,sweep,imbalance,notTradeSignal:true};
}
