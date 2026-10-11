/**
 * Read-only 4h liquidity/structure context. All market facts come from closed,
 * timestamped M1/M5 candles. No inferred institutional order book, fill or trade.
 */
export type Lean='BUY'|'SELL'|'WAIT';
export type ReboundZone={side:'BUY'|'SELL';low:number;high:number;source:string;touches:number;confirmedAt:number};
type Bar={time:number;open:number;high:number;low:number;close:number;volume:number;volumeBasis:'REAL'|'TICK'|'NONE'};
const num=(v:unknown)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const round=(v:number)=>Number(v.toFixed(2));
const avg=(a:number[])=>a.length?a.reduce((s,n)=>s+n,0)/a.length:0;
function parseBars(raw:any,now:number,ms:number):Bar[]{
  const map=new Map<number,Bar>();
  if(!Array.isArray(raw))return [];
  for(const row of raw){
    const t=num(row?.time),o=num(row?.open),h=num(row?.high),l=num(row?.low),c=num(row?.close);
    if(t==null||o==null||h==null||l==null||c==null||t<=0||t%ms!==0||
      t+ms>now||t>now||o<=0||l<=0||h<Math.max(o,c)||l>Math.min(o,c))continue;
    const b=row?.volumeBasis==='REAL'?'REAL':row?.volumeBasis==='TICK'?'TICK':'NONE';
    map.set(t,{time:t,open:o,high:h,low:l,close:c,volume:Math.max(0,num(row?.volume)??0),volumeBasis:b});
  }
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
function atr(rows:Bar[],span=14){
  if(rows.length<span+1)return 0;
  const tr=rows.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-rows[i].close),Math.abs(c.low-rows[i].close)));
  return avg(tr.slice(-span));
}
const empty=(reason:string)=>({
  ready:false,reason,side:'WAIT' as Lean,phase:'غير محسوم',rangeHigh:null as number|null,rangeLow:null as number|null,
  changePct:null as number|null,vwap:null as number|null,volumeBasis:'NONE' as 'REAL'|'TICK'|'NONE',
  volumeSource:'لا يوجد حجم موثوق',bars:0,coverage:0,sweep:'NONE' as 'SELL_SIDE'|'BUY_SIDE'|'NONE',
  structure:'NONE' as 'BOS_UP'|'BOS_DOWN'|'NONE',zones:[] as ReboundZone[],
  summary:'لا توجد شموع مغلقة متصلة كفاية لتحليل آخر 4 ساعات'});
export function analyzeFourHours(input:{asset:'GOLD'|'BTC';candles:any;frames?:any;now:number;source?:string;referencePrice?:number|null}){
  const {now}=input;
  const rows=parseBars(input.candles,now,60000).filter(c=>c.time+60000>now-240*60000);
  const fresh=rows.length>0&&now-(rows.at(-1)!.time+60000)<=180000;
  const maxGap=rows.slice(1).reduce((worst,c,i)=>Math.max(worst,c.time-rows[i].time),60000);
  const coverage=rows.length/240;
  if(!fresh||rows.length<216||coverage<.9||maxGap>2*60000)
    return {...empty(!fresh?'آخر إغلاق M1 متأخر':'آخر 4 ساعات فيها نقص أو فجوات شموع'),bars:rows.length,coverage:round(coverage*100)};
  const high=Math.max(...rows.map(c=>c.high)),low=Math.min(...rows.map(c=>c.low));
  const price=rows.at(-1)!.close;
  if(input.referencePrice!=null&&input.referencePrice>0&&Math.abs(price-input.referencePrice)/input.referencePrice>.015)
    return {...empty('اختلاف كبير بين سعر اللحظة وسعر الشموع'),bars:rows.length,coverage:round(coverage*100)};
  const range=Math.max(high-low,1e-10),changePct=100*(price-rows[0].open)/rows[0].open;
  const totalReal=rows.filter(c=>c.volumeBasis==='REAL'&&c.volume>0).length;
  const totalTick=rows.filter(c=>c.volumeBasis==='TICK'&&c.volume>0).length;
  const volumeBasis:'REAL'|'TICK'|'NONE'=totalReal/rows.length>=.9?'REAL':totalTick/rows.length>=.9?'TICK':'NONE';
  const weights=volumeBasis==='NONE'?[]:rows.map(c=>c.volumeBasis===volumeBasis?c.volume:0);
  const amount=weights.reduce((s,v)=>s+v,0);
  const vwap=amount>0?round(rows.reduce((s,c,i)=>s+((c.high+c.low+c.close)/3)*weights[i],0)/amount):null;
  const latest=rows.slice(-55);
  const older=rows.slice(-180,-55),olderHigh=Math.max(...older.map(c=>c.high));
  const olderLow=Math.min(...older.map(c=>c.low));
  const sweptLow=latest.some(c=>c.low<olderLow&&c.close>olderLow);
  const sweptHigh=latest.some(c=>c.high>olderHigh&&c.close<olderHigh);
  const sweep:'SELL_SIDE'|'BUY_SIDE'|'NONE'=sweptLow&&!sweptHigh?'SELL_SIDE':sweptHigh&&!sweptLow?'BUY_SIDE':'NONE';
  const m5=parseBars(input.frames?.m5,now,300000).filter(c=>c.time+300000>now-270*60000);
  // Use only completed swing pivots (two newer candles confirm each pivot).
  const pivots:ReboundZone[]=[];
  const vol5=Math.max(atr(m5),range/38,price*.00005);
  for(let i=2;i<m5.length-2;i++){
    const c=m5[i],neighbors=[m5[i-2],m5[i-1],m5[i+1],m5[i+2]];
    const demand=neighbors.every(n=>c.low<n.low);
    const supply=neighbors.every(n=>c.high>n.high);
    if(!demand&&!supply)continue;
    const side:'BUY'|'SELL'=demand?'BUY':'SELL';
    const lo=side==='BUY'?c.low:Math.min(c.open,c.close);
    const hi=side==='BUY'?Math.max(c.open,c.close):c.high;
    const minLo=Math.min(lo,hi),maxHi=Math.max(lo,hi);
    if(maxHi-minLo>vol5*2.5||minLo<=0)continue;
    // A pivot stops being a support/resistance after a confirmed close through it.
    const after=m5.slice(i+3),broken=after.some(b=>side==='BUY'?b.close<minLo:b.close>maxHi);
    if(broken)continue;
    const touches=after.filter(b=>b.low<=maxHi&&b.high>=minLo).length;
    const dist=Math.max(0,price>maxHi?price-maxHi:price<minLo?minLo-price:0);
    if(dist>Math.max(range*.75,vol5*6))continue;
    pivots.push({side,low:round(minLo),high:round(maxHi),source:'قمة/قاع M5 مؤكد · رصد سعري',touches,confirmedAt:m5[i+2].time+300000});
  }
  const nearest=(side:'BUY'|'SELL')=>pivots.filter(z=>z.side===side&&
    (side==='BUY'?z.low<=price:z.high>=price))
    .sort((a,b)=>Math.abs((a.low+a.high)/2-price)-Math.abs((b.low+b.high)/2-price)||
      b.confirmedAt-a.confirmedAt).slice(0,2);
  const zones=[...nearest('BUY'),...nearest('SELL')];
  const last5=m5.at(-1),prev=m5.slice(-15,-1);
  const bosUp=Boolean(last5&&prev.length>=10&&last5.close>Math.max(...prev.map(c=>c.high)));
  const bosDown=Boolean(last5&&prev.length>=10&&last5.close<Math.min(...prev.map(c=>c.low)));
  const structure:'BOS_UP'|'BOS_DOWN'|'NONE'=bosUp?'BOS_UP':bosDown?'BOS_DOWN':'NONE';
  const first=rows.slice(0,120),second=rows.slice(-120);
  const firstRange=Math.max(...first.map(c=>c.high))-Math.min(...first.map(c=>c.low));
  const secondRange=Math.max(...second.map(c=>c.high))-Math.min(...second.map(c=>c.low));
  const compressed=secondRange<firstRange*.73&&secondRange<range*.67;
  const position=(price-low)/range;
  const trendVotes=(changePct>.12?1:changePct<-.12?-1:0)+
    (position>.66?1:position<.34?-1:0)+(structure==='BOS_UP'?1:structure==='BOS_DOWN'?-1:0)+
    (sweep==='SELL_SIDE'?1:sweep==='BUY_SIDE'?-1:0);
  const side:Lean=trendVotes>=2?'BUY':trendVotes<=-2?'SELL':'WAIT';
  const firstVol=volumeBasis!=='NONE'?avg(first.map(c=>c.volume)):0;
  const secondVol=volumeBasis!=='NONE'?avg(second.map(c=>c.volume)):0;
  const activity=volumeBasis==='NONE'?false:secondVol>=firstVol*.9;
  // These are descriptive price/volume heuristics, NOT observed institutional positions.
  const phase=compressed&&position<.53&&(sweep==='SELL_SIDE'||changePct>0)&&activity?'تجميع محتمل':
    compressed&&position>.47&&(sweep==='BUY_SIDE'||changePct<0)&&activity?'تصريف محتمل':
    compressed?'انضغاط / توازن':side==='BUY'?'ميل صعود هيكلي':side==='SELL'?'ميل هبوط هيكلي':'تذبذب / توازن';
  const sweepLabel=sweep==='SELL_SIDE'?'سحب سيولة أسفل قاع سابق':sweep==='BUY_SIDE'?'سحب سيولة أعلى قمة سابقة':'لا يوجد سحب مؤكد';
  return {ready:true,reason:'قراءة سعرية من شموع M1/M5 المغلقة خلال آخر 4 ساعات',
    side,phase,rangeHigh:round(high),rangeLow:round(low),changePct:round(changePct),vwap,
    volumeBasis,volumeSource:volumeBasis==='REAL'?'حجم حقيقي من مصدر الشموع':
      volumeBasis==='TICK'?'Tick volume · مؤشر نشاط غير مباشر':'لا يوجد حجم صالح · قراءة سعر فقط',
    bars:rows.length,coverage:round(coverage*100),sweep,structure,zones,
    summary:sweepLabel+' · '+(structure==='BOS_UP'?'كسر هيكل صاعد':structure==='BOS_DOWN'?'كسر هيكل هابط':'بدون كسر هيكل مؤكد')+
      ' · '+(volumeBasis==='NONE'?'بدون تأكيد حجم':'VWAP مرجعي')+
      ' · التوصيف احتمالي وليس دليلًا على أوامر مؤسسات'};
}
