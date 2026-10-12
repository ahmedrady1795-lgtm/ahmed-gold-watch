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
  const maxDistance=Math.max(a15*8,scale*7);
  const candidates:Candidate[]=[];
  const add=(p:any,source:string,quality:number,frame:string)=>{
    const v=num(p);
    if(v!=null&&v>0&&ahead(side,price,v)){
      const dist=Math.abs(v-price);
      if(dist>=minDistance&&dist<=maxDistance)
        candidates.push({price:v,source,quality,frame});
    }
  };
  const frames=[{rows:h1,name:'H1',confidence:80,windows:[12,24,48,96]},
    {rows:m15,name:'M15',confidence:73,windows:[12,24,48,96]},
    {rows:m5,name:'M5',confidence:62,windows:[24,48,90]}];
  for(const frame of frames){
    const {rows,name,confidence,windows}=frame;
    for(const span of windows){
      if(rows.length<span)continue;
      const sample=rows.slice(-span);
      const level=side==='BUY'?Math.max(...sample.map(r=>r.high)):Math.min(...sample.map(r=>r.low));
      add(level,name+' · '+span+' شمعة',confidence, name);
    }
    // Confirmed fractal swings only; exclude the last 2 bars as unconfirmed.
    for(let i=2;i<rows.length-2;i++){
      const centre=rows[i];
      const neighbors=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]];
      const pivot=side==='BUY'?neighbors.every(b=>centre.high>b.high):
        neighbors.every(b=>centre.low<b.low);
      if(pivot)add(side==='BUY'?centre.high:centre.low,name+' · قمة/قاع هيكلي',
        confidence-(rows.length-i<15?0:6),name);
    }
  }
  const path=input.hunt?.zoneForecast?.pathForecast||{},zf=input.hunt?.zoneForecast||{};
  const addKnown=(raw:any,source:string,quality:number)=>{
    const x=num(raw?.mid??raw?.price??raw?.zone?.mid??raw?.zone?.price);
    if(x!=null)add(x,source,quality,'ZONE');
    else {
      const low=num(raw?.low??raw?.zone?.low),high=num(raw?.high??raw?.zone?.high);
      if(low!=null&&high!=null)add((low+high)/2,source,quality,'ZONE');
    }
  };
  addKnown(side==='BUY'?input.h4?.resistance:input.h4?.support,'H4 · منطقة هيكلية',72);
  addKnown(side==='BUY'?(path.upperLiquidity||zf.resistance):(path.lowerLiquidity||zf.support),
    'سيولة هيكلية',73);
  addKnown(path.destination,'مسار الهيكل',67);
  addKnown(zf.target,'منطقة استهداف',67);
  // Existing quick forecast objectives can corroborate an independently
  // distant level but must never create synthetic long-range destinations.
  const original=input.forecast?.targets;
  for(const key of ['t2','t3'] as const){
    const level=original?.[key];
    if(level?.kind!=='PROJECTION')addKnown(level,key.toUpperCase()+' · تأكيد',55);
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
    const quality=clamp(c.quality+Math.min(14,(c.frames.size-1)*7)+Math.min(8,(c.sources.size-1)*2),0,94);
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
  return {targets,atr15:a15,basis:'M15/H1 مع هيكل M5 وسيولة فعلية',
    reason:targets.length?'أهداف أبعد من التقلبات الصغيرة، مأخوذة من مستويات سعرية مرصودة':
      'لم تظهر سيولة أو قمم/قيعان هيكلية بعيدة وصالحة؛ لا نختلق مستويات مستقبلية',
    minDistance};
}
