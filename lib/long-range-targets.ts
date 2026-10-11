/** Structural, NON-scalp sniper targets. No fabricated ATR extensions. */
export type Side='BUY'|'SELL'|'WAIT';
export type LongTarget={stage:1|2|3;price:number;low:number;high:number;quality:number;kind:string;source:string;distanceAtr:number};
type Bar={time:number;open:number;high:number;low:number;close:number};
type Candidate={price:number;source:string;quality:number;frame:string};
const num=(x:any)=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
function validBars(rows:any,now:number,period:number):Bar[]{
  if(!Array.isArray(rows))return [];
  const unique=new Map<number,Bar>();
  for(const row of rows){
    const time=num(row?.time),o=num(row?.open),h=num(row?.high),l=num(row?.low),c=num(row?.close);
    if(time==null||o==null||h==null||l==null||c==null||l<=0||h<l||
      h<Math.max(o,c)||l>Math.min(o,c)||time+period>now||time<now-9*86400000)continue;
    unique.set(time,{time,open:o,high:h,low:l,close:c});
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
function atr(rows:Bar[],period=14):number|null{
  if(rows.length<period+1)return null;
  const tr=rows.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-rows[i].close),Math.abs(b.low-rows[i].close)));
  const last=tr.slice(-period);
  const value=last.reduce((s,x)=>s+x,0)/last.length;
  return value>0&&Number.isFinite(value)?value:null;
}
const ahead=(side:Side,price:number,p:number)=>side==='BUY'?p>price:side==='SELL'?p<price:false;
function addZone(candidates:Candidate[],raw:any,source:string,confidence:number){
  const value=num(raw?.mid??raw?.price??raw);
  const lo=num(raw?.low),hi=num(raw?.high);
  const mid=value??(lo!=null&&hi!=null?(lo+hi)/2:null);
  if(mid!=null&&mid>0)candidates.push({price:mid,source,quality:confidence,frame:'ZONE'});
}
export function buildLongRangeTargets(input:{
  asset:'GOLD'|'BTC';side:Side;price:number|null;now:number;
  frames:any;forecast?:any;hunt?:any;h4?:any;minAtr?:number
}):{targets:LongTarget[];atr15:number|null;basis:string;reason:string;minDistance:number|null}{
  const price=num(input.price),side=input.side;
  const empty=(reason:string)=>({targets:[] as LongTarget[],atr15:null,basis:'M15/H1',reason,minDistance:null});
  if(price==null||price<=0||side==='WAIT')return empty('لا يوجد اتجاه صالح');
  const m15=validBars(input.frames?.m15,input.now,900000),
    h1=validBars(input.frames?.h1,input.now,3600000),
    m5=validBars(input.frames?.m5,input.now,300000);
  if(m15.length<30||h1.length<20||m5.length<25)return empty('شموع M5/M15/H1 غير مكتملة');
  // More tolerant than M1 because these are only historical structural levels.
  if(input.now-(m15.at(-1)!.time+900000)>28*60000||
     input.now-(h1.at(-1)!.time+3600000)>120*60000||
     input.now-(m5.at(-1)!.time+300000)>13*60000)return empty('شموع هيكل السوق متأخرة');
  const a15=atr(m15),a5=atr(m5);
  if(a15==null||a5==null)return empty('لا يوجد متوسط مدى صالح');
  const scale=Math.max(a15*1.05,a5*1.35,price*(input.asset==='GOLD'?.0005:.0009));
  const minDistance=Math.max(scale,price*(input.asset==='GOLD'?.00045:.0008));
  const maxDistance=Math.max(a15*12,scale*10);
  const candidates:Candidate[]=[];
  const add=(p:any,source:string,quality:number,frame:string)=>{
    const v=num(p);
    if(v!=null&&v>0&&ahead(side,price,v)){
      const dist=Math.abs(v-price);
      if(dist>=minDistance&&dist<=maxDistance)
        candidates.push({price:v,source,quality,frame});
    }
  };
  // Only observed, completed H1/M15 highs/lows may CREATE a sniper
  // destination. M5 levels and forecasts can confirm an existing level,
  // never manufacture a distant structural target by themselves.
  const frames=[{rows:h1,name:'H1',confidence:80,windows:[12,24,48,96]},
    {rows:m15,name:'M15',confidence:73,windows:[12,24,48,96]}];
  const observedPivots=(rows:Bar[],name:string,confidence:number,windows:number[],emit:(p:number,source:string,quality:number)=>void)=>{
    for(const span of windows){
      if(rows.length<span)continue;
      const sample=rows.slice(-span);
      emit(side==='BUY'?Math.max(...sample.map(r=>r.high)):Math.min(...sample.map(r=>r.low)),
        name+' · '+span+' شمعة',confidence);
    }
    for(let i=2;i<rows.length-2;i++){
      const c=rows[i],around=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]];
      const pivot=side==='BUY'?around.every(b=>c.high>b.high):around.every(b=>c.low<b.low);
      if(pivot)emit(side==='BUY'?c.high:c.low,
        name+' · قمة/قاع هيكلي',confidence-(rows.length-i<15?0:6));
    }
  };
  for(const frame of frames){
    observedPivots(frame.rows,frame.name,frame.confidence,frame.windows,
      (p,source,quality)=>add(p,source,quality,frame.name));
  }

  // Corroboration only: projections, soft liquidity zones, and smaller
  // timeframe levels cannot become their own sniper targets.
  const corroborating:number[]=[];
  const corroborate=(v:any)=>{
    const p=num(v?.mid??v?.price??v?.zone?.mid??v?.zone?.price??v);
    const lo=num(v?.low??v?.zone?.low),hi=num(v?.high??v?.zone?.high);
    const level=p??(lo!=null&&hi!=null&&lo<=hi?(lo+hi)/2:null);
    if(level!=null&&level>0&&ahead(side,price,level))corroborating.push(level);
  };
  observedPivots(m5,'M5',62,[24,48,90],p=>corroborate(p));
  const path=input.hunt?.zoneForecast?.pathForecast||{},zf=input.hunt?.zoneForecast||{};
  corroborate(side==='BUY'?input.h4?.resistance:input.h4?.support);
  corroborate(side==='BUY'?(path.upperLiquidity||zf.resistance):(path.lowerLiquidity||zf.support));
  corroborate(path.destination);
  corroborate(zf.target);
  const original=input.forecast?.targets;
  for(const key of ['t2','t3'] as const){
    if(original?.[key]?.kind!=='PROJECTION')corroborate(original?.[key]);
  }
  candidates.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price));
  const tolerance=Math.max(a15*.22,price*(input.asset==='GOLD'?.00018:.0003));
  const clustered:{prices:number[];sources:Set<string>;frames:Set<string>;quality:number}[]=[];
  for(const c of candidates){
    const found=clustered.find(x=>Math.abs(x.prices.reduce((a,b)=>a+b,0)/x.prices.length-c.price)<=tolerance);
    if(found){
      found.prices.push(c.price);found.sources.add(c.source);found.frames.add(c.frame);
      found.quality=Math.max(found.quality,c.quality);
    }else clustered.push({prices:[c.price],sources:new Set([c.source]),frames:new Set([c.frame]),quality:c.quality});
  }
  const usable=clustered.map(c=>{
    const centre=c.prices.reduce((s,x)=>s+x,0)/c.prices.length;
    // Repeated lookback windows often contain the SAME wick; count
    // independent timeframe agreement, not duplicated window labels.
    const quality=clamp(c.quality+Math.min(12,(c.frames.size-1)*8)+
      (corroborating.some(p=>Math.abs(p-centre)<=tolerance)?3:0),0,94);
    return {price:centre,quality,source:[...c.sources].slice(0,2).join(' + '),distance:Math.abs(centre-price),
      low:Math.min(...c.prices),high:Math.max(...c.prices)};
  }).filter(c=>c.quality>=60&&c.distance>=minDistance)
    .sort((a,b)=>a.distance-b.distance);
  const targets:LongTarget[]=[];
  for(const c of usable){
    if(targets.length>=3)break;
    const last=targets.at(-1);
    if(last&&Math.abs(c.price-last.price)<Math.max(scale*.55,tolerance*1.4))continue;
    const step=(targets.length+1) as 1|2|3;
    const minStageDistance=step===1?minDistance:step===2?Math.max(minDistance*1.7,
      Math.abs(targets[0].price-price)+scale*.55):Math.max(minDistance*2.4,
      Math.abs(targets[1].price-price)+scale*.65);
    if(c.distance<minStageDistance)continue;
    const digits=2;
    targets.push({stage:step,price:Number(c.price.toFixed(digits)),
      low:Number(Math.min(c.low,c.price).toFixed(digits)),
      high:Number(Math.max(c.high,c.price).toFixed(digits)),
      quality:c.quality,kind:'STRUCTURAL',source:c.source,
      distanceAtr:Number((c.distance/a15).toFixed(2))});
  }
  return {targets,atr15:a15,basis:'M15/H1 تاريخي مؤكد؛ M5 والسيولة للتأييد فقط',
    reason:targets.length?'أهداف أبعد من التقلبات الصغيرة، مأخوذة من مستويات سعرية مرصودة':
      'لم تظهر سيولة أو قمم/قيعان هيكلية بعيدة وصالحة؛ لا نختلق مستويات مستقبلية',
    minDistance};
}
